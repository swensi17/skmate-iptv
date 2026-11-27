package tv.own.owntv.player

import tv.own.owntv.ui.theme.hudShade
import tv.own.owntv.ui.theme.hudInk
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import tv.own.owntv.R
import tv.own.owntv.core.i18n.HorizontalDirection
import tv.own.owntv.core.i18n.horizontalDirection
import tv.own.owntv.core.settings.LiveKey
import tv.own.owntv.core.settings.LiveKeyAction
import tv.own.owntv.core.settings.RemoteShortcutAction
import tv.own.owntv.core.settings.RemoteShortcutPress
import tv.own.owntv.ui.components.LocalRemoteShortcuts
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.components.OwnTVSpinner
import tv.own.owntv.ui.components.displayText // PlayerFailureReason.displayText, for the error overlay
import tv.own.owntv.ui.theme.gradientWash

/**
 * The full-screen player HUD. This file owns the HUD's STATE — visibility, direct tune, the dialog the
 * user has open, the zap/engine flashes — and composes the pieces that draw it. Those pieces live in
 * sibling files: [PlayerHudChrome] (top bar, OSD cards, transport, bottom bar), [PlayerHudControls]
 * (buttons, seek bars, shared formatters) and [PlayerHudDialogs] (every dialog the HUD opens).
 */

@Composable
internal fun MediaSpec.displayText(): String {
    val decoderText = decoder?.let {
        when (it) {
            is DecoderSpec.Hardware -> buildList {
                add(stringResource(R.string.player_decoder_hardware))
                if (it.direct) add(stringResource(R.string.player_decoder_direct))
            }.joinToString(stringResource(R.string.player_metadata_separator))
            is DecoderSpec.Software -> buildList {
                add(stringResource(R.string.player_decoder_software))
                if (it.gpu) add(stringResource(R.string.player_decoder_gpu))
            }.joinToString(stringResource(R.string.player_metadata_separator))
            is DecoderSpec.Named -> buildList {
                add(
                    when (it.value.lowercase()) {
                        "exoplayer" -> stringResource(R.string.settings_player_exoplayer)
                        "mpv" -> stringResource(R.string.settings_player_mpv)
                        else -> it.value
                    },
                )
                if (it.hardware) add(stringResource(R.string.player_decoder_hardware))
                if (it.direct) add(stringResource(R.string.player_decoder_direct))
            }.joinToString(stringResource(R.string.player_metadata_separator))
        }
    }
    return listOfNotNull(codec, resolution, decoderText)
        .joinToString(stringResource(R.string.player_metadata_separator))
}

@Composable
private fun PlaybackFailure.displayText(): String {
    // Resolved through the same [describe] mapping the toast renderer uses. LocalConfiguration is read
    // so a language change still recomposes this, exactly as stringResource would.
    androidx.compose.ui.platform.LocalConfiguration.current
    val resources = androidx.compose.ui.platform.LocalContext.current.resources
    return describe { id, args -> resources.getString(id, *args.toTypedArray()) }
}

internal const val DIRECT_TUNE_TIMEOUT_MS = 2_000L
private const val DIRECT_TUNE_FEEDBACK_MS = 1_500L
private const val DIRECT_TUNE_PLAYBACK_WAIT_MS = 8_000L
private const val MAX_DIRECT_TUNE_DIGITS = 5
private const val PLAYER_SHORTCUT_LONG_PRESS_MS = 600L

/** Re-poll for late-arriving audio/subtitle tracks while the track menu is open and still empty.
 *  20 × 300 ms = 6 s, comfortably past the slowest observed HDR/DTS track report, then it stops. */
private const val TRACK_POLL_MS = 300L
private const val TRACK_POLL_TRIES = 20

/** A stall shorter than this is an ordinary re-buffer and gets the plain spinner. Past it, a line under the
 *  spinner says the stream is reconnecting by itself, so a long outage doesn't look like a hung app.
 *  Counted from the stall, which itself only starts once the buffer (~10s) has run dry. */
private const val RECONNECT_NOTICE_AFTER_MS = 10_000L

internal enum class HudDialog { NONE, AUDIO, SUBS, SPEED, ZOOM, QUALITY, VOLUME, JUMP_BACK, SLEEP_TIMER }

/** What the top-left channel OSD shows for direct tune: the digits being typed, the channel a number
 *  resolved to, or a failure message. All three render as the same card as the channel OSD. */
private sealed interface TuneOsd {
    data class Entry(val digits: String) : TuneOsd
    data class Tuned(val info: DirectTuneChannelInfo) : TuneOsd
    data class Message(val digits: String, val text: String) : TuneOsd
}

@Composable
fun PlayerHud(
    player: PlaybackEngine,
    onBack: () -> Unit,
    onPip: (() -> Unit)? = null,
    // Switch to audio-only mode (stops video decode, surfaces the top-bar now-playing bar). Null hides it.
    onAudioMode: (() -> Unit)? = null,
    // Live only, and only when Multiview is switched on in Settings: turn this channel into tile 1 of
    // the grid. Null hides the button entirely — the feature is opt-in, like the record button.
    onMultiview: (() -> Unit)? = null,
    // Live only, and only once "Record what I'm watching" is switched on in Settings: record the
    // channel already playing, over the connection already open. Null hides the button entirely —
    // the feature does not exist until the user has accepted the one-connection trade-off.
    onRecordThis: (() -> Unit)? = null,
    /** True while that recording is running, so the button can say Stop instead of Record. */
    recordingThis: Boolean = false,
    // True while the shell draws an overlay ABOVE the HUD (e.g. the channel-list overlay). The HUD goes
    // inert: its auto-hide timer pauses and — crucially — it makes no focus requests, so it can't yank
    // D-pad focus off the overlay. The existing dialog guard below covers only the HUD's OWN dialogs;
    // shell-level overlays need this flag. Default false = no behavior change for other callers.
    inert: Boolean = false,
    onChannelUp: (() -> Unit)? = null,
    onChannelDown: (() -> Unit)? = null,
    // Live: open the channel-list overlay (Left while the controls are hidden). Null = not a live channel.
    onOpenChannelList: (() -> Unit)? = null,
    // Live: open the watch-history list (Right while the controls are hidden) — jump straight back to a
    // recent channel without leaving full-screen. Null = not a live channel.
    onOpenHistoryList: (() -> Unit)? = null,
    // Live rewind / timeshift (catch-up channels). onRewindLive non-null = this live channel can rewind;
    // timeshiftOffsetSec non-null = currently watching that many seconds behind the live edge.
    onRewindLive: (() -> Unit)? = null,
    onForwardLive: (() -> Unit)? = null,
    onGoToLive: (() -> Unit)? = null,
    onScrubLive: ((Int) -> Unit)? = null, // timeline scrub: +sec = back, −sec = toward live
    // The playing channel's guide, for the timeline's programme ticks and the scrub bubble's name.
    liveProgrammes: List<LiveProgramme> = emptyList(),
    /** The saved copy's holes, for the rewind bar. */
    liveGaps: () -> List<LongRange> = { emptyList() },
    // "Go back to…": aim at a point in the archive instead of nudging toward it with rewind. Null =
    // not a catch-up channel. [jumpBackOptions] is read when the list opens so its clock times are
    // computed against the moment the user asked, not the moment the HUD was composed.
    jumpBackOptions: (() -> List<Int>)? = null,
    onJumpBack: ((Int) -> Unit)? = null,
    // Back to the channel watched before this one. Null hides the button (no previous channel yet).
    onPreviousChannel: (() -> Unit)? = null,
    // Archive depth of the current channel, for the exact-time picker's day/HH:MM bounds.
    jumpBackWindowSec: (() -> Int)? = null,
    // Read as a lambda, not a value: the offset ticks once a second, and taking it as a plain Int?
    // made the shell (the caller) recompose on every tick just to hand it over. Invoked below, so the
    // per-second read lands in the HUD's own scope, which already recomposes with the position clock.
    timeshiftOffsetSec: (() -> Int?)? = null,
    // Direct tune: enter a provider channel number to switch channels. Null = disabled (not live / no channel).
    onTuneToNumber: (suspend (Int) -> DirectTuneResult)? = null,
    // Channel identity key for direct tune: changing this cancels any in-flight submission.
    directTuneContextKey: Long = 0L,
    // Live "compatibility mode": pin this channel to the mpv engine (fixes UHD artifacts / undecodable
    // streams ExoPlayer can't handle). null = not a live channel; true = currently pinned to mpv.
    compatMode: Boolean? = null,
    onToggleCompatMode: (() -> Unit)? = null,
    // VOD engine toggle: switch THIS movie/episode between mpv and ExoPlayer (e.g. to reach tracks only
    // one engine exposes, or to try the other engine on a problem file). null = not a VOD;
    // true = currently playing on ExoPlayer.
    vodOnExo: Boolean? = null,
    onToggleVodEngine: (() -> Unit)? = null,
    // Movie/episode only: open the OpenSubtitles search from the Subtitles dialog.
    // Null for Live TV and when there's no current-item context, which hides the ADD SUBTITLES row.
    onSearchSubtitles: (() -> Unit)? = null,
    // Movie/episode only: pick a local subtitle file — no account needed, same gating.
    onSelectLocalSubtitle: (() -> Unit)? = null,
    // Favorite toggle for the CURRENT item (live channel / movie / series). Null hides the button
    // (no item context). [favorite] = current state — fills the star teal when true.
    favorite: Boolean = false,
    onToggleFavorite: (() -> Unit)? = null,
    // Live guide card (Before / Now playing / Next for the playing channel) — supplied by the shell
    // (the EPG data lives in LiveViewModel, not the player). Rendered on the right edge whenever the
    // controls are visible, like the top-bar channel card; informational only, never focusable.
    liveEpgCard: (@Composable () -> Unit)? = null,
    // Now/next lines for the channel-change banner (the playing channel's guide). Null = name only.
    zapGuide: (@Composable () -> Unit)? = null,
    // The archive's own wall-clock instant while catch-up/rewind is playing; null means the picture is
    // the present, and only the real clock shows. Drives the second, framed clock at top centre.
    // Lambda for the same reason as [timeshiftOffsetSec]: this instant advances every second too.
    watchingWallMs: (() -> Long?)? = null,
    // When the programme on air ends, read as the sleep timer opens. Null = no "End of programme".
    sleepProgrammeEndMs: (() -> Long?)? = null,
    // Settings → "Left and right rewind live TV": with the controls hidden, Left/Right on a
    // catch-up channel scrub instead of opening the lists. Films always seek.
    liveLeftRightRewinds: Boolean = false,
    // Remote buttons settings: what OK and the arrows do on a channel with the controls hidden.
    liveKeys: tv.own.owntv.core.settings.LiveKeyMap = tv.own.owntv.core.settings.LiveKeyMap.DEFAULT,
    // Sports Hub — only for a channel started from a match; all null means the plain Live player.
    // The match's score line under the channel name, drawn only while the controls are up.
    matchLine: (@Composable () -> Unit)? = null,
    // The other channels showing the match, and their count for the tool's label.
    onOtherChannels: (() -> Unit)? = null,
    otherChannelsCount: Int = 0,
    // The match page.
    // A goal toast for another followed match is up: OK switches to it instead of showing the controls.
    onToastOk: (() -> Unit)? = null,
    // TV-box look, live only: the channel info drawn at the bottom when ▼ or OK is pressed (programme,
    // times, channel, the stream's chips handed in, how far behind live). Non-null switches the live
    // player to the TV-box steps: info, then ▼ again for [onOpenGuide] and the other tiles.
    tvBoxInfo: (@Composable (chips: List<String>, offsetSec: Int?) -> Unit)? = null,
    onOpenGuide: (() -> Unit)? = null,
    /** A Live TV channel (not a catch-up programme). The engine's own isLiveContent is a plain field that
     *  Compose cannot watch: on mpv, the fallback engine, it was still "film" when this HUD was first drawn,
     *  so a live channel got the old seek bar and speed controls. The shell knows better; trust it. */
    liveChannel: Boolean = false,
    modifier: Modifier = Modifier,
) {
    // Nothing that ticks is read in this root scope: with the controls hidden it used to recompose
    // the whole HUD once a second for a position nobody could see. The offset, the archive clock and the
    // position are handed down as lambdas and read by the piece that draws them.
    val timeshiftOffset: () -> Int? = { timeshiftOffsetSec?.invoke() }
    val layoutDirection = LocalLayoutDirection.current
    val isPlaying by player.isPlaying.collectAsStateWithLifecycle()
    val position = player.position.collectAsStateWithLifecycle()
    val duration by player.duration.collectAsStateWithLifecycle()
    val buffering by player.buffering.collectAsStateWithLifecycle()
    // "Paused" only for a stream that has started: a channel still connecting is not paused, and showing
    // the pause mark there flashed it before the loading spinner on every channel opened.
    val tunedTitle by player.currentMeta.collectAsStateWithLifecycle()
    var startedPlaying by remember(tunedTitle.title) { mutableStateOf(isPlaying) }
    LaunchedEffect(isPlaying) { if (isPlaying) startedPlaying = true }
    val error by player.error.collectAsStateWithLifecycle()
    val errorInfo by player.errorInfo.collectAsStateWithLifecycle()
    val providerBackOff by player.providerBackOff.collectAsStateWithLifecycle()
    val stalledSinceMs by player.stalledSinceMs.collectAsStateWithLifecycle()
    val nav by player.nav.collectAsStateWithLifecycle()
    val volume by player.volume.collectAsStateWithLifecycle()
    val videoRes by player.videoRes.collectAsStateWithLifecycle()
    val streamChips by player.streamChips.collectAsStateWithLifecycle()
    val streamFacts by player.streamFacts.collectAsStateWithLifecycle()
    val engineChip by player.engineChip.collectAsStateWithLifecycle()
    val audioCount by player.audioCount.collectAsStateWithLifecycle()
    val audioDelayMs by player.audioDelayMs.collectAsStateWithLifecycle()
    val audioDelayRemembered by player.audioDelayRemembered.collectAsStateWithLifecycle()
    val subCount by player.subCount.collectAsStateWithLifecycle()
    val zoomMode by player.zoomMode.collectAsStateWithLifecycle()
    val speed by player.speed.collectAsStateWithLifecycle()
    val isLive = player.isLiveContent || liveChannel
    val switchedToExo = stringResource(R.string.player_switch_exo)
    val switchedToMpv = stringResource(R.string.player_switch_mpv)
    val tuneNotFound = stringResource(R.string.player_channel_not_found)
    val multipleChannels = stringResource(R.string.player_multiple_channels)
    val tuneFailed = stringResource(R.string.player_tune_failed)

    val nextUpTitle by player.nextUpTitle.collectAsStateWithLifecycle()
    // The sleep timer's "End of episode" stops there, so there is no next to count down to.
    val stopsAtItemEnd by player.stopsAtItemEnd.collectAsStateWithLifecycle()

    var dialog by remember { mutableStateOf(HudDialog.NONE) }
    val playFocus = remember { FocusRequester() }
    val retryFocus = remember { FocusRequester() }
    val catchFocus = remember { FocusRequester() }
    val nextFocus = remember { FocusRequester() }
    // The timeline, and whether the next reveal of the controls lands on it rather than Play.
    val seekFocus = remember { FocusRequester() }
    var focusSeekOnShow by remember { mutableStateOf(false) }

    // Next-episode countdown card (VOD queues only): appears in the last ~30s before the automatic
    // advance (which fires at duration − 8s), counts down to it, and offers Play now / Cancel.
    var autoNextDismissed by remember { mutableStateOf(false) }
    // Re-arm when the queued next episode changes (i.e. after an advance to a new item).
    LaunchedEffect(nextUpTitle, nav.hasNext) { autoNextDismissed = false }
    // Derived, so the root recomposes when the card appears or goes, not on every position tick.
    val msToAdvance: () -> Long = { if (!isLive && duration > 0L) (duration - 8_000L) - position.value else Long.MAX_VALUE }
    val nextCardDue by remember(isLive, duration) { derivedStateOf { msToAdvance() in 0L..30_000L } }
    val showNextCard = !isLive && error == null && nav.hasNext && nextUpTitle != null && !stopsAtItemEnd &&
        nextCardDue && !autoNextDismissed

    // Opened under a panel (a channel switched from the channel list): nothing of the player's own shows yet.
    var controlsVisible by remember { mutableStateOf(!inert) }
    // TV-box live steps: the info (controls visible), then ▼ again for the tile row.
    val tvLive = tv.own.owntv.features.shell.TvBoxNav && isLive && tvBoxInfo != null
    var tvActions by remember { mutableStateOf(false) }
    // Focus on the recently watched channels under the tiles: ▲ there goes back to the tiles, not out of them.
    var recentFocused by remember { mutableStateOf(false) }
    // The tiles' step opens on the recently watched channels; ▼ there brings the tools in under them.
    var toolsOpen by remember { mutableStateOf(false) }
    // The info a channel shows by itself (opened, switched to) is only to read: the keys still do what they do with
    // nothing on screen. OK is what opens the controls, as a TV's own player does.
    var passiveInfo by remember { mutableStateOf(true) }
    LaunchedEffect(controlsVisible) { if (!controlsVisible) passiveInfo = true }
    val recentsNow = LocalTvBoxRecent.current
    val recentFocus = remember { FocusRequester() }
    // Between the info and the tiles: the timeline itself, where ◀ ▶ rewind. Only ▼ goes there, so ◀ ▶ on
    // a channel just opened never move the picture back by surprise.
    var tvSeek by remember { mutableStateOf(false) }
    // A run of ◀ ▶ presses in the archive: the seconds its presses moved (+ toward live), and when the last one
    // came. The timeline shows that total over the dot ("−1:20 · 13:42:10") until the run has rested a moment.
    // Counted from the presses, not from the offset: the archive opening mid-run corrects the offset by the
    // seconds it really starts at, and that showed as presses never made.
    var seekRunMoved by remember { mutableStateOf<Int?>(null) }
    var seekRunAt by remember { mutableLongStateOf(0L) }
    LaunchedEffect(seekRunAt) {
        if (seekRunMoved != null) {
            kotlinx.coroutines.delay(SEEK_RUN_SHOW_MS)
            seekRunMoved = null
        }
    }
    // One step back (or toward live) in the archive: 10 s a press, growing while the key is held.
    val scrubArchive: (Boolean, Int) -> Unit = { back, repeat ->
        val at = android.os.SystemClock.uptimeMillis()
        val moved = seekRunMoved?.takeIf { at - seekRunAt <= SEEK_RUN_SHOW_MS } ?: 0
        seekRunAt = at
        val step = archiveSeekStepSec(repeat)
        // From the live edge the archive is never asked for less than its minimum (see LiveTimeshift.archiveFloor).
        val fromLive = back && timeshiftOffset() == null
        val applied = if (fromLive) maxOf(step, tv.own.owntv.core.live.CatchupJumps.MIN_OFFSET_SEC) else step
        seekRunMoved = moved + if (back) -applied else applied
        onScrubLive?.invoke(if (back) step else -step)
    }
    val tvActionFocus = remember { FocusRequester() }
    LaunchedEffect(controlsVisible) { if (!controlsVisible) { tvActions = false; tvSeek = false } }
    var showInfo by remember { mutableStateOf(false) } // stream technical-info overlay
    // Used only by "Report this stream", which writes the current readout into the playback log.
    val reportContext = androidx.compose.ui.platform.LocalContext.current
    var wakeTick by remember { mutableIntStateOf(0) }
    val forceShow = error != null || dialog != HudDialog.NONE
    // First Back hides the controls (instead of leaving the channel); with the controls already hidden
    // this handler is disabled, so Back falls through to the shell, which exits the player. Also disabled
    // while an error/dialog is up (a dialog handles its own Back; an error should exit).
    BackHandler(enabled = controlsVisible && !forceShow) { controlsVisible = false }
    // Back from the tiles steps back to the info, the way ▲ does.
    // Back from the row under the info puts everything away at once, not one step at a time.
    BackHandler(enabled = tvActions && !forceShow) { tvActions = false; controlsVisible = false }
    // Back from the timeline steps back to the info.
    BackHandler(enabled = tvSeek && !tvActions && !forceShow) { tvSeek = false }
    LaunchedEffect(tvActions) { if (!tvActions) toolsOpen = false }
    val transportPause = remember { FocusRequester() }
    // A panel or the menu over the picture owns focus: the player asks for none while it is there, even mid-step.
    LaunchedEffect(tvActions, controlsVisible, toolsOpen, tvSeek, inert, recentsNow.isEmpty()) {
        if (!tvLive || !controlsVisible || dialog != HudDialog.NONE || inert) return@LaunchedEffect
        delay(16)
        if (inert || !controlsVisible) return@LaunchedEffect
        runCatching {
            when {
                !tvActions && tvSeek -> transportPause.requestFocus()
                !tvActions -> playFocus.requestFocus()
                toolsOpen || recentsNow.isEmpty() -> tvActionFocus.requestFocus()
                else -> recentFocus.requestFocus()
            }
        }
    }
    // Channel zap (live only): a brief "now watching" card on up/down without revealing the full HUD.
    val canZap = onChannelUp != null && onChannelDown != null
    var channelFlash by remember { mutableIntStateOf(0) }
    var showFlash by remember { mutableStateOf(false) }
    LaunchedEffect(channelFlash) { if (channelFlash > 0) { showFlash = true; delay(3000); showFlash = false } }

    // Engine-switch confirmation toast: a brief "Switched to MPV/ExoPlayer" at the bottom-center when the
    // user flips the engine via the HUD toggle. Mirrors the channel-flash pattern above.
    var engineMsg by remember { mutableStateOf<String?>(null) }
    var engineFlash by remember { mutableIntStateOf(0) }
    LaunchedEffect(engineFlash) { if (engineFlash > 0) { delay(1800); engineMsg = null } }
    // A channel juddering on ExoPlayer: say once that the other engine may play it smoothly. Longer than
    // the switch confirmation — this one has to be read.
    val smoothnessHint by player.smoothnessHint.collectAsStateWithLifecycle()
    val smoothnessHintText = stringResource(R.string.player_smoothness_hint)
    LaunchedEffect(smoothnessHint) {
        if (smoothnessHint) {
            engineMsg = smoothnessHintText
            delay(6_000)
            if (engineMsg == smoothnessHintText) engineMsg = null
        }
    }
    // Wrap the engine toggles so a click also surfaces the toast naming the engine we're switching TO.
    val toggleCompat: (() -> Unit)? = onToggleCompatMode?.let { cb -> {
        engineMsg = if (compatMode == true) switchedToExo else switchedToMpv; engineFlash++; cb()
    } }
    val toggleVod: (() -> Unit)? = onToggleVodEngine?.let { cb -> {
        engineMsg = if (vodOnExo == true) switchedToMpv else switchedToExo; engineFlash++; cb()
    } }

    // ---- Direct tune (channel-number entry) ----
    var digitBuffer by remember { mutableStateOf("") }
    var submissionRequest by remember { mutableStateOf<Int?>(null) }
    var submissionTick by remember { mutableIntStateOf(0) }

    var lookupInFlight by remember { mutableStateOf(false) }

    var tuneOsd by remember { mutableStateOf<TuneOsd?>(null) }
    var tuneOsdTick by remember { mutableIntStateOf(0) }

    val digitsActive = digitBuffer.isNotEmpty()
    val heldDigitKeys = remember { mutableSetOf<Key>() }

    val cancelDirectTune: () -> Unit = {
        digitBuffer = ""
        submissionRequest = null
        tuneOsd = null
        heldDigitKeys.clear()
        submissionTick++
        tuneOsdTick++
    }

    val zap: (Int) -> Unit = { d ->
        cancelDirectTune()
        (if (d < 0) onChannelUp else onChannelDown)?.invoke()
        // TV-box look: the new channel's info at the bottom, not a card at the top.
        if (tvLive) {
            tvActions = false
            tvSeek = false
            passiveInfo = true
            controlsVisible = !inert
            wakeTick++
        } else {
            channelFlash++
        }
    }

    // Restartable timeout: each new digit restarts the ~2 s window. On expiry, submit.
    LaunchedEffect(digitBuffer) {
        if (digitBuffer.isEmpty()) return@LaunchedEffect
        delay(DIRECT_TUNE_TIMEOUT_MS)
        val num = digitBuffer.toIntOrNull()
        digitBuffer = ""
        if (num != null) { submissionRequest = num; submissionTick++ }
        else tuneOsd = null
    }
    // Submission: keyed on the immutable tick so setting submissionRequest=null doesn't cancel us.
    // lookupInFlight covers only the suspend callback, not the result-display period.
    LaunchedEffect(submissionTick) {
        val num = submissionRequest ?: return@LaunchedEffect
        submissionRequest = null
        lookupInFlight = true
        val result = try {
            onTuneToNumber?.invoke(num)
        } finally {
            lookupInFlight = false
            // A KeyUp can be lost when focus or the window changes mid-entry (dialog, PiP, app switch),
            // which would strand that digit in the held set and make the key dead until the next KeyUp.
            // A completed submission ends the entry, so no held state can legitimately survive it.
            heldDigitKeys.clear()
        }
        tuneOsd = when (result) {
            is DirectTuneResult.Found -> TuneOsd.Tuned(result.channel)
            is DirectTuneResult.NotFound -> TuneOsd.Message(num.toString(), tuneNotFound)
            is DirectTuneResult.Ambiguous -> TuneOsd.Message(num.toString(), multipleChannels)
            is DirectTuneResult.Failed -> TuneOsd.Message(num.toString(), tuneFailed)
            is DirectTuneResult.Cancelled -> null
            null -> null
        }
        if (tuneOsd != null) tuneOsdTick++
    }
    // Result-feedback expiry, keyed on tuneOsdTick so a new entry invalidates the old timer. A tuned
    // channel holds the OSD until the new stream is actually on screen (the lookup returns the moment
    // playback is KICKED OFF, not when it starts) and then DIRECT_TUNE_FEEDBACK_MS longer.
    LaunchedEffect(tuneOsdTick) {
        when (val osd = tuneOsd) {
            is TuneOsd.Tuned -> {
                if (osd.info.restarted) {
                    withTimeoutOrNull(DIRECT_TUNE_PLAYBACK_WAIT_MS) {
                        // Two phases: the outgoing stream can still report playing for a beat (Stalker/mpv
                        // resolve their URL asynchronously), so wait for the teardown before the start.
                        snapshotFlow { isPlaying && !buffering && error == null }.first { !it }
                        snapshotFlow { (isPlaying && !buffering) || error != null }.first { it }
                    }
                }
                delay(DIRECT_TUNE_FEEDBACK_MS)
                tuneOsd = null
            }
            is TuneOsd.Message -> { delay(DIRECT_TUNE_FEEDBACK_MS); tuneOsd = null }
            is TuneOsd.Entry, null -> Unit
        }
    }
    // Cancellation triggers (CH+/-, D-pad, overlay open, HUD dialog open).
    LaunchedEffect(inert) { if (inert) cancelDirectTune() }
    LaunchedEffect(dialog) { if (dialog != HudDialog.NONE) cancelDirectTune() }
    // Channel-key cleanup: narrow to pending entry state only. Do not clear timed result feedback
    // from a successful tune that changed the playing channel.
    LaunchedEffect(directTuneContextKey) {
        if (digitBuffer.isNotEmpty() || submissionRequest != null) {
            digitBuffer = ""
            submissionRequest = null
            heldDigitKeys.clear()
            submissionTick++
            // Abandoned digits have no timer of their own — drop the card with the entry it belonged to.
            if (tuneOsd is TuneOsd.Entry) tuneOsd = null
        }
    }
    // Back cancels digit entry before it hides/exits controls.
    BackHandler(enabled = digitsActive) { digitBuffer = ""; tuneOsd = null }

    // Only for the "report this stream" button, whose readout is now gathered off the main thread.
    val hudScope = androidx.compose.runtime.rememberCoroutineScope()

    LaunchedEffect(forceShow) { if (forceShow) controlsVisible = true }
    // A panel or the menu over the picture owns the keys: the info under it stays down, or it showed through the
    // picture's window beside the channel list.
    LaunchedEffect(inert) { if (inert && !forceShow) { controlsVisible = false; tvActions = false; tvSeek = false } }
    LaunchedEffect(controlsVisible, player) { if (controlsVisible) player.refreshStreamChips() }
    DisposableEffect(showInfo, player) {
        if (showInfo) player.refreshStreamChips()
        player.setBitrateTrackingEnabled(showInfo)
        onDispose { player.setBitrateTrackingEnabled(false) }
    }
    // How long the info stays up by itself, as the viewer set it under Live and buffer.
    val hudSettings: tv.own.owntv.core.settings.SettingsRepository = org.koin.compose.koinInject()
    val infoHideSecs by remember(hudSettings) { hudSettings.infoHideSecs }
        .collectAsState(tv.own.owntv.core.settings.InfoHide.DEFAULT_SECS)
    LaunchedEffect(controlsVisible, wakeTick, forceShow, inert, tvSeek, tvActions, infoHideSecs) {
        // Don't auto-hide under an overlay — hiding is what triggers the catch-all focus grab below.
        if (controlsVisible && !forceShow && !inert) {
            // On the timeline or the tiles the viewer is in the middle of something: more time to look.
            val shownMs = infoHideSecs * MS_PER_SECOND
            delay(if (tvSeek || tvActions) maxOf(TV_BOX_BUSY_HIDE_MS, shownMs) else shownMs)
            // Paused, the info stays up with its pause mark until playing again.
            snapshotFlow { !tvLive || player.isPlaying.value || player.buffering.value }.first { it }
            controlsVisible = false
        }
    }
    LaunchedEffect(controlsVisible, error, dialog, inert, showNextCard) {
        // Never steal focus while a dialog is open (its rows own it) or while a shell overlay is up
        // (inert — the overlay owns the D-pad); when either closes this re-runs and hands focus back.
        if (dialog != HudDialog.NONE || inert) return@LaunchedEffect
        // The next-episode countdown card owns focus while it's up so Play now / Cancel are reachable.
        if (showNextCard) { runCatching { nextFocus.requestFocus() }; return@LaunchedEffect }
        if (controlsVisible) {
            val toSeek = focusSeekOnShow
            focusSeekOnShow = false
            when {
                error != null -> runCatching { retryFocus.requestFocus() }
                // Falls back to Play when no timeline is drawn after all (no duration yet, say).
                toSeek -> runCatching { seekFocus.requestFocus() }.onFailure { runCatching { playFocus.requestFocus() } }
                else -> runCatching { playFocus.requestFocus() }
            }
        } else runCatching { catchFocus.requestFocus() }
    }

    // The player sits over opaque video (never a glass surface — see Glass.kt), so its HUD buttons
    // stay flat regardless of glass mode: opt out of the DIALOGS default explicitly.
    val remoteShortcuts = LocalRemoteShortcuts.current
    var shortcutKeyCode by remember { mutableIntStateOf(android.view.KeyEvent.KEYCODE_UNKNOWN) }
    // OK with a chosen action runs on release: run on press, a list it opens would take the release
    // as its own OK and start whatever channel sits under the focus.
    var liveOkHeld by remember { mutableStateOf(false) }
    var shortcutPressedAt by remember { mutableStateOf(0L) }
    val dispatchPlayerShortcut: (RemoteShortcutAction) -> Unit = { action ->
        when (action) {
            RemoteShortcutAction.OPEN_SUBTITLE_CONTROLS -> { controlsVisible = true; dialog = HudDialog.SUBS }
            RemoteShortcutAction.OPEN_AUDIO_CONTROLS -> { controlsVisible = true; dialog = HudDialog.AUDIO }
            RemoteShortcutAction.OPEN_ASPECT_CONTROLS -> { controlsVisible = true; dialog = HudDialog.ZOOM }
            RemoteShortcutAction.TOGGLE_PLAYBACK_INFO -> showInfo = !showInfo
            else -> remoteShortcuts.dispatch(action)
        }
    }
    Box(
        modifier = modifier.fillMaxSize()
            // A mouse or an air remote's pointer (arrows off): a click on the left edge opens the channel list as ◀
            // does, on the right edge the recently watched as ▶, anywhere else shows or hides the info. Controls on
            // screen take their own clicks first.
            .pointerInput(inert, error == null) {
                if (inert) return@pointerInput
                detectTapGestures { at ->
                    val edge = size.width * POINTER_EDGE
                    when {
                        tvLive && error == null && at.x < edge && onOpenChannelList != null -> {
                            controlsVisible = false; onOpenChannelList()
                        }
                        tvLive && error == null && at.x > size.width - edge && onOpenHistoryList != null -> {
                            controlsVisible = false; onOpenHistoryList()
                        }
                        else -> { controlsVisible = !controlsVisible; wakeTick++ }
                    }
                }
            }
            .onPreviewKeyEvent { e ->
            // ---- Direct-tune digit capture (before the existing KeyDown guard) ----
            // Number keys are consumed globally here, HUD visible or not: on a TV remote a digit press
            // during live playback can only mean "tune to this channel", and swallowing both KeyDown and
            // KeyUp keeps a half-typed number from leaking into whatever else is focused underneath.
            // onTuneToNumber is null outside fullscreen live (see OwnTVShell), so nothing else is affected.
            if (onTuneToNumber != null && !inert && dialog == HudDialog.NONE) {
                val digit = keyToDigit(e.key)
                if (digit != null) {
                    if (e.type == KeyEventType.KeyUp) {
                        heldDigitKeys.remove(e.key)
                        return@onPreviewKeyEvent true
                    }
                    if (e.type == KeyEventType.KeyDown) {
                        if (lookupInFlight || !heldDigitKeys.add(e.key)) {
                            return@onPreviewKeyEvent true
                        }
                        val enteredDigits = digitBuffer + digit
                        tuneOsd = TuneOsd.Entry(enteredDigits)
                        tuneOsdTick++
                        if (enteredDigits.length == MAX_DIRECT_TUNE_DIGITS) {
                            digitBuffer = ""
                            submissionRequest = enteredDigits.toIntOrNull()
                            submissionTick++
                        } else {
                            digitBuffer = enteredDigits
                        }
                        return@onPreviewKeyEvent true
                    }
                }
                // Enter/Center/NumpadEnter: submit immediately while digits are pending.
                if (e.type == KeyEventType.KeyDown && !lookupInFlight && digitsActive &&
                    (e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter)
                ) {
                    val num = digitBuffer.toIntOrNull()
                    digitBuffer = ""
                    if (num != null) { submissionRequest = num; submissionTick++ }
                    return@onPreviewKeyEvent true
                }
            }
            // A dedicated TV channel key belongs to the channel player for the whole session. Handle it
            // before configurable browse shortcuts so an OSD button, an engine handoff, or a paging binding
            // cannot temporarily claim it. KeyUp is swallowed too, keeping the complete press inside the HUD.
            if (canZap && (e.key == Key.ChannelUp || e.key == Key.ChannelDown)) {
                if (e.type == KeyEventType.KeyDown) {
                    zap(if (e.key == Key.ChannelUp) 1 else -1)
                }
                return@onPreviewKeyEvent true
            }
            // Configured player shortcuts run inside this original, stable preview handler. Direct
            // tune above has first priority, so number keys keep changing live channels fullscreen.
            if (remoteShortcuts.enabled && !inert && dialog == HudDialog.NONE && !digitsActive) {
                val keyCode = e.nativeKeyEvent.keyCode
                val keyBindings = remoteShortcuts.bindings.filter {
                    it.keyCode == keyCode &&
                        it.action != RemoteShortcutAction.PAGE_TOWARD_FIRST &&
                        it.action != RemoteShortcutAction.PAGE_TOWARD_LAST &&
                        it.action != RemoteShortcutAction.JUMP_TO_FIRST &&
                        it.action != RemoteShortcutAction.JUMP_TO_LAST
                }
                if (keyBindings.isNotEmpty()) {
                    when (e.type) {
                        KeyEventType.KeyDown -> {
                            if (shortcutKeyCode != keyCode) {
                                shortcutKeyCode = keyCode
                                shortcutPressedAt = e.nativeKeyEvent.eventTime
                            }
                            return@onPreviewKeyEvent true
                        }
                        KeyEventType.KeyUp -> if (shortcutKeyCode == keyCode) {
                            val heldLong = e.nativeKeyEvent.eventTime - shortcutPressedAt >= PLAYER_SHORTCUT_LONG_PRESS_MS
                            val binding = if (heldLong) {
                                keyBindings.firstOrNull { it.press == RemoteShortcutPress.LONG }
                                    ?: keyBindings.firstOrNull { it.press == RemoteShortcutPress.SHORT }
                            } else {
                                keyBindings.firstOrNull { it.press == RemoteShortcutPress.SHORT }
                            }
                            shortcutKeyCode = android.view.KeyEvent.KEYCODE_UNKNOWN
                            binding?.let { dispatchPlayerShortcut(it.action) }
                            return@onPreviewKeyEvent true
                        }
                    }
                }
            }
            // OK and the arrows the viewer gave another job on a channel. A key left alone falls through
            // to the handling below, so the usual behaviour stays exactly as it was.
            // The info that came up by itself: OK opens the controls on the row under it, any arrow does what it does
            // with nothing on screen (▲ ▼ switch channel, ◀ ▶ the lists), so a channel just opened never holds keys.
            if (tvLive && controlsVisible && passiveInfo && error == null && !inert && dialog == HudDialog.NONE &&
                !digitsActive && e.type == KeyEventType.KeyDown
            ) {
                val ok = e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter
                val arrow = e.key == Key.DirectionUp || e.key == Key.DirectionDown ||
                    e.key == Key.DirectionLeft || e.key == Key.DirectionRight
                // A job the viewer gave OK keeps it, here as everywhere.
                if (ok && e.nativeKeyEvent.repeatCount == 0 && !liveKeys.isCustom(LiveKey.OK)) {
                    passiveInfo = false
                    tvSeek = false
                    tvActions = true
                    wakeTick++
                    return@onPreviewKeyEvent true
                }
                if (arrow) { controlsVisible = false; tvActions = false; tvSeek = false }
            }
            val liveKeysApply = isLive && error == null && !inert && dialog == HudDialog.NONE && !digitsActive
            if (liveKeysApply) {
                val liveKey = when (e.key) {
                    Key.DirectionCenter, Key.Enter, Key.NumPadEnter -> LiveKey.OK
                    Key.DirectionUp -> LiveKey.UP
                    Key.DirectionDown -> LiveKey.DOWN
                    Key.DirectionLeft -> LiveKey.LEFT
                    Key.DirectionRight -> LiveKey.RIGHT
                    else -> null
                }
                // With the controls up the arrows move through them; OK alone keeps the viewer's job on the
                // TV-box info line, which every new channel shows for a moment (its tiles still pause).
                // On the info line OK and ◀ ▶ keep the viewer's jobs as well: rewinding is on the timeline, a ▼ away.
                val onInfo = tvLive && controlsVisible && !tvActions && !tvSeek
                val free = !controlsVisible || (onInfo && liveKey != LiveKey.UP && liveKey != LiveKey.DOWN) ||
                    (tvLive && !tvActions && !tvSeek && liveKey == LiveKey.OK)
                if (liveKey != null && free && liveKeys.isCustom(liveKey)) {
                    val ok = liveKey == LiveKey.OK
                    val run = if (ok) {
                        if (e.type == KeyEventType.KeyDown) liveOkHeld = true
                        e.type == KeyEventType.KeyUp && liveOkHeld.also { liveOkHeld = false }
                    } else {
                        e.type == KeyEventType.KeyDown
                    }
                    val jobs = buildMap<LiveKeyAction, () -> Unit> {
                        put(LiveKeyAction.INFO) { controlsVisible = true; passiveInfo = false; tvSeek = false; tvActions = true }
                        onOpenChannelList?.let { open ->
                            put(LiveKeyAction.CHANNEL_LIST) { controlsVisible = false; open() }
                        }
                        onOpenHistoryList?.let { open ->
                            put(LiveKeyAction.HISTORY) { controlsVisible = false; open() }
                        }
                        if (canZap) {
                            put(LiveKeyAction.NEXT_CHANNEL) { zap(1) }
                            put(LiveKeyAction.PREVIOUS_CHANNEL) { zap(-1) }
                        }
                        put(LiveKeyAction.LAST_CHANNEL) {
                            dispatchPlayerShortcut(RemoteShortcutAction.PREVIOUS_CHANNEL)
                        }
                        onScrubLive?.let { scrubBy ->
                            val scrub = { sec: Int ->
                                scrubBy(sec)
                                focusSeekOnShow = true
                                controlsVisible = true
                                if (tvLive) { tvActions = false; tvSeek = true }
                            }
                            put(LiveKeyAction.REWIND) { scrub(LIVE_SCRUB_STEP_SEC) }
                            put(LiveKeyAction.FORWARD) { scrub(-LIVE_SCRUB_STEP_SEC) }
                        }
                        put(LiveKeyAction.PLAY_PAUSE) { player.togglePlayPause() }
                        put(LiveKeyAction.NOTHING) {}
                    }
                    val handled = !run || runLiveKey(liveKeys[liveKey], e.nativeKeyEvent.repeatCount == 0, jobs)
                    if (handled) return@onPreviewKeyEvent true
                }
            }
            // ---- Existing key handling (unchanged, but skip for digit KeyUp already consumed above) ----
            if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
            when {
                // Channel surfing: media prev/next always zap alongside the dedicated CH keys handled
                // above. D-pad Up/Down zap ONLY on live streams while the HUD is hidden (when it's visible,
                // Up/Down navigate the controls) —
                // this is the only way to change channels on remotes without CH keys (e.g. Fire TV).
                //
                // Direction is channel-number order, not list-position order: "up" (CH+, D-pad Up) is
                // always the NEXT channel — further down an ascending list, delta +1 — matching the
                // de facto TV convention (Live Channels, YouTube TV, Pluto TV). All of these keys move
                // the same way; there is deliberately no split between CH+ and D-pad Up. Wrapping is
                // intended: CH-/Down from the first channel lands on the last, and vice versa.
                // TV-box live, like a TV's own player: OK shows the channel info; ▼ goes to the timeline
                // (where the channel can be rewound) and ▼ again to the tiles; ▲ and Back step back up.
                // ◀ ▶ rewind on the timeline only; on the info they do what they do with it hidden.
                // With it hidden, ▲ ▼ change channel (below) and OK shows the info.
                // OK with nothing on screen opens the controls: the info, and focus on the row under it.
                tvLive && error == null && !controlsVisible && !inert &&
                    (e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter) -> {
                    controlsVisible = true
                    passiveInfo = false
                    tvSeek = false
                    tvActions = true
                    true
                }
                tvLive && error == null && controlsVisible && !tvActions && !tvSeek && onScrubLive != null && liveProgrammes.isNotEmpty() &&
                    e.key == Key.DirectionDown -> { tvSeek = true; wakeTick++; true }
                tvLive && error == null && controlsVisible && !tvActions && e.key == Key.DirectionDown -> {
                    tvSeek = false
                    tvActions = true
                    wakeTick++
                    true
                }
                tvLive && error == null && controlsVisible && !tvActions && tvSeek && e.key == Key.DirectionUp -> {
                    tvSeek = false
                    wakeTick++
                    true
                }
                tvLive && error == null && controlsVisible && !tvActions && e.key == Key.DirectionUp -> { controlsVisible = false; true }
                // ▼ on the recently watched channels brings the tools in under them; ▲ on the tools takes them away.
                tvLive && error == null && controlsVisible && tvActions && recentFocused && e.key == Key.DirectionDown -> {
                    if (toolsOpen) runCatching { tvActionFocus.requestFocus() } else toolsOpen = true
                    wakeTick++
                    true
                }
                tvLive && error == null && controlsVisible && tvActions && toolsOpen && !recentFocused &&
                    recentsNow.isNotEmpty() && e.key == Key.DirectionUp -> {
                    toolsOpen = false
                    wakeTick++
                    true
                }
                tvLive && error == null && controlsVisible && tvActions && e.key == Key.DirectionUp -> {
                    tvActions = false
                    tvSeek = onScrubLive != null && liveProgrammes.isNotEmpty()
                    wakeTick++
                    true
                }
                // OK on the info hides it again, as on a TV's own player; paused, OK carries on from the same moment.
                // Pausing stays on the play key and the tiles a ▼ away: a second OK that froze the picture was the
                // complaint.
                tvLive && error == null && controlsVisible && !tvActions && !tvSeek &&
                    (e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter) -> {
                    if (e.nativeKeyEvent.repeatCount == 0) {
                        // On the timeline OK still pauses and carries on, as a film's seek bar does.
                        if (tvSeek || (!player.isPlaying.value && !player.buffering.value)) {
                            player.togglePlayPause()
                            wakeTick++
                        } else {
                            controlsVisible = false
                        }
                    }
                    true
                }
                // In the archive ◀ ▶ always move through it, shown or hidden: they opened the channel lists there, and
                // "seeking does not work in the archive" was the complaint.
                tvLive && error == null && !tvActions && !tvSeek && onScrubLive != null && timeshiftOffset() != null &&
                    (e.key == Key.DirectionLeft || e.key == Key.DirectionRight) -> {
                    scrubArchive(e.key == Key.DirectionLeft, e.nativeKeyEvent.repeatCount)
                    controlsVisible = true
                    tvSeek = true
                    wakeTick++
                    true
                }
                // A channel with no programme data has nothing to scrub: ◀ ▶ then fall through to the lists below,
                // instead of rewinding into nothing and looking dead.
                // On the timeline ◀ ▶ walk the transport's keys (they take focus there); OK presses the one in focus.
                tvLive && error == null && controlsVisible && !tvActions && tvSeek &&
                    (e.key == Key.DirectionLeft || e.key == Key.DirectionRight) -> { wakeTick++; false }
                // On the info line: ◀ ▶ open the channel list and history, as with it hidden.
                tvLive && error == null && controlsVisible && !tvActions && onOpenChannelList != null &&
                    e.key.horizontalDirection(layoutDirection) == HorizontalDirection.START -> { controlsVisible = false; onOpenChannelList(); true }
                tvLive && error == null && controlsVisible && !tvActions && onOpenHistoryList != null &&
                    e.key.horizontalDirection(layoutDirection) == HorizontalDirection.END -> { controlsVisible = false; onOpenHistoryList(); true }
                canZap && e.key == Key.MediaNext -> { zap(1); true }
                canZap && e.key == Key.MediaPrevious -> { zap(-1); true }
                canZap && isLive && !controlsVisible && e.key == Key.DirectionUp -> { zap(1); true }
                canZap && isLive && !controlsVisible && e.key == Key.DirectionDown -> { zap(-1); true }
                // Left/Right with the controls hidden: reveal them on the timeline and take the first
                // step, so the jump is seen and holding the key goes on scrubbing the bar itself. Physical
                // keys, like the bars: left is back in time in every locale. A film always does this; a
                // live channel only with its archive and the setting on — otherwise the lists below.
                // Decided in the bottom bar's own order: a channel with an archive draws the live timeline
                // even while rewound (when the engine is playing a file and calls it not live), so that
                // is what the keys scrub; only without one does a film's seek bar apply.
                // Without programme data there is no timeline to rewind on: ◀ ▶ then open the lists, so the key
                // never looks dead on a channel that has no guide.
                !controlsVisible && error == null && (e.key == Key.DirectionLeft || e.key == Key.DirectionRight) &&
                    (if (onScrubLive != null && liveProgrammes.isNotEmpty()) liveLeftRightRewinds else !isLive && duration > 0L) -> {
                    val back = e.key == Key.DirectionLeft
                    if (onScrubLive != null && liveProgrammes.isNotEmpty()) {
                        scrubArchive(back, e.nativeKeyEvent.repeatCount)
                    } else {
                        val step = player.seekStepMs.value
                        player.seekBy(if (back) -step else step)
                    }
                    focusSeekOnShow = true
                    controlsVisible = true
                    if (tvLive) tvSeek = true
                    true
                }
                // The category list lives at logical Start; history lives at logical End.
                onOpenChannelList != null && !controlsVisible &&
                    e.key.horizontalDirection(layoutDirection) == HorizontalDirection.START -> { onOpenChannelList(); true }
                onOpenHistoryList != null && !controlsVisible &&
                    e.key.horizontalDirection(layoutDirection) == HorizontalDirection.END -> { onOpenHistoryList(); true }
                onToastOk != null && !controlsVisible &&
                    (e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter) -> { onToastOk(); true }
                controlsVisible -> { wakeTick++; false }
                else -> false
            }
        },
    ) {
        if (!controlsVisible && !showNextCard) {
            Box(
                Modifier.fillMaxSize().focusRequester(catchFocus).focusable()
                    .onKeyEvent { e -> if (e.type == KeyEventType.KeyDown && e.key != Key.Back && !inert) { controlsVisible = true; true } else false },
            )
        }

        // Stream technical info — drawn over everything (and kept up even when the controls auto-hide), so
        // you can read live bitrate/buffer while watching. Toggled from the bottom bar's info button.
        if (showInfo) {
            // Sits clear of the taller unified top strip (logo + guide) rather than under a title row.
            StreamInfoOverlay(player, modifier = Modifier.align(Alignment.TopEnd).padding(top = 112.dp, end = 20.dp))
        }

        // Top-left OSD stack: the channel card (briefly on a zap, or the freshly tuned channel) plus the
        // direct-tune card, which pushes down under it. Drawn outside the controls-visible block so both
        // zapping and digit entry stay visible with the HUD hidden. With the controls up the unified top
        // strip already names the channel, so only a direct tune — whose card names the channel the stream
        // is still switching to — draws here.
        val tuned = (tuneOsd as? TuneOsd.Tuned)?.info
        Column(
            modifier = Modifier.align(Alignment.TopStart)
                .padding(start = 28.dp, top = if (controlsVisible) 92.dp else 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (isLive && (tuned != null || (showFlash && !controlsVisible))) {
                // A fresh tune drives the card from the lookup result, not player metadata: the Stalker and
                // mpv paths publish their metadata after an async resolve, which would show the old channel.
                if (tuned != null) {
                    ChannelOsdCard(title = tuned.name, subtitle = tuned.number?.let { stringResource(R.string.player_channel_number, it) }, logoUrl = tuned.logoUrl, guide = zapGuide)
                } else {
                    ChannelCard(player, guide = zapGuide)
                }
            }
            when (val osd = tuneOsd) {
                is TuneOsd.Entry -> ChannelNumberCard(osd.digits)
                is TuneOsd.Message -> ChannelNumberCard(osd.digits, error = osd.text)
                is TuneOsd.Tuned, null -> Unit
            }
        }

        // The REC badge, and it is deliberately OUTSIDE `if (controlsVisible)`.
        //
        // The shell hides the status pill during fullscreen playback, so without this a recording
        // running behind the picture would be completely invisible — which is the one thing that
        // must not happen. It is drawn whenever anything is recording, HUD up or down, and it is not
        // focusable and not interactive: stopping a recording is the Recordings screen's job, and a
        // stop button one stray D-pad press from the middle of a programme is not a kindness.
        RecordingBadge(modifier = Modifier.align(Alignment.TopEnd))

        // Paused: one calm mark in the middle.
        val pausedByUser = startedPlaying && !isPlaying && !buffering
        val showPauseMark = pausedByUser && error == null && !inert
        if (tvLive && showPauseMark) {
            Box(Modifier.align(Alignment.Center).size(96.dp).background(Color(0x66000000), androidx.compose.foundation.shape.CircleShape), contentAlignment = Alignment.Center) {
                tv.own.owntv.ui.components.OwnTVIcon(OwnTVIcon.PAUSE, Color.White, Modifier.size(44.dp))
            }
        }
        androidx.compose.animation.AnimatedVisibility(
            visible = controlsVisible && tvLive && error == null,
            enter = androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.dur(TvHudFadeMs))) +
                androidx.compose.animation.slideInVertically(androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.dur(TvHudFadeMs))) { it / 6 },
            exit = androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.dur(TvHudFadeMs))) +
                androidx.compose.animation.slideOutVertically(androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.dur(TvHudFadeMs))) { it / 6 },
            modifier = Modifier.fillMaxSize(),
        ) {
          Box(Modifier.fillMaxSize()) {
            // TV-box look: no transport, no top bar — the channel info at the bottom over a soft shade,
            // and under it, after ▼, the tiles.
            // A soft see-through fall-off, never a dark band: the picture stays visible behind the text.
            Box(
                Modifier.align(Alignment.BottomStart).fillMaxWidth().height(if (tvActions) 760.dp else 420.dp)
                    .gradientWash(vertical = true, 0.0f to Color.Transparent, 0.5f to TvBoxShade.copy(alpha = 0.35f), 1.0f to TvBoxShade),
            )
            // Top right, as on other TV players: the clock, the date and what the stream is (1080p · 25 fps · H.265).
            tvBoxStreamCorner(Modifier.align(Alignment.TopEnd).padding(top = 32.dp, end = 44.dp))
            Column(
                Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(start = 44.dp, end = 44.dp, bottom = 36.dp),
                verticalArrangement = Arrangement.spacedBy(22.dp),
            ) {
                androidx.compose.runtime.CompositionLocalProvider(
                    LocalTvBoxSeeking provides tvSeek,
                    LocalTvBoxPaused provides (!player.isPlaying.collectAsState().value && !player.buffering.collectAsState().value),
                    LocalTvBoxTransport provides if (tvSeek && onScrubLive != null) {
                        val watching = System.currentTimeMillis() - (timeshiftOffset() ?: 0) * MS_PER_SECOND
                        val on = liveProgrammes.firstOrNull { watching in it.startMs until it.stopMs }
                        TvBoxTransport(
                            pauseFocus = transportPause,
                            onPrevious = {
                                // A few seconds in: back to this programme's start; at its start, the one before.
                                val into = on?.let { ((watching - it.startMs) / MS_PER_SECOND).toInt() }
                                val before = liveProgrammes.lastOrNull { it.stopMs <= (on?.startMs ?: watching) }
                                val back = when {
                                    into != null && into > PROGRAMME_START_GRACE_SEC -> into
                                    before != null -> ((watching - before.startMs) / MS_PER_SECOND).toInt()
                                    else -> null
                                }
                                back?.let { onScrubLive(it) }
                                wakeTick++
                            },
                            onBack = { r -> scrubArchive(true, r); wakeTick++ },
                            onPause = { player.togglePlayPause(); wakeTick++ },
                            onForward = { r -> scrubArchive(false, r); wakeTick++ },
                            onNext = {
                                val next = liveProgrammes.firstOrNull { it.startMs > watching }
                                if (next != null && next.startMs < System.currentTimeMillis()) {
                                    onScrubLive(-((next.startMs - watching) / MS_PER_SECOND).toInt())
                                } else {
                                    onGoToLive?.invoke()
                                }
                                wakeTick++
                            },
                            // Back to live the LIVE key goes away: focus moves to pause first, or it went with it.
                            onLive = onGoToLive?.takeIf { timeshiftOffset() != null }?.let { live ->
                                { runCatching { transportPause.requestFocus() }; live(); wakeTick++ }
                            },
                            onRecord = onRecordThis?.let { rec -> { rec(); wakeTick++ } },
                            recording = recordingThis,
                            onKey = { wakeTick++ },
                        )
                    } else {
                        null
                    },
                    // Seconds the run has moved, + toward live: the counter over the dot.
                    LocalTvBoxSeekRun provides seekRunMoved,
                    LocalTvBoxStreamFacts provides streamFacts,
                ) {
                    tvBoxInfo!!(streamChips.ifEmpty { listOfNotNull(videoRes) }, timeshiftOffset())
                }
                if (tvActions) {
                    if (recentsNow.isNotEmpty()) {
                        TvBoxRecentRow(
                            recentsNow, recentFocus,
                            lead = listOfNotNull(
                                onOpenGuide?.let { TvBoxAction(stringResource(R.string.settings_seg_guide), OwnTVIcon.EPG, { controlsVisible = false; it() }) },
                                onOpenHistoryList?.let { TvBoxAction(stringResource(R.string.content_category_history), OwnTVIcon.HISTORY, { controlsVisible = false; it() }) },
                            ),
                            onFocusIn = { recentFocused = it; wakeTick++ },
                        ) { r ->
                            controlsVisible = false
                            r.onClick()
                        }
                    }
                    val qualityCount = player.videoQualities.collectAsState().value.size
                    if (toolsOpen || recentsNow.isEmpty()) {
                    TvBoxActionRow(
                        listOfNotNull(
                            onOpenGuide?.let { TvBoxAction(stringResource(R.string.settings_seg_guide), OwnTVIcon.EPG, { controlsVisible = false; it() }) },
                            onOpenChannelList?.let { TvBoxAction(stringResource(R.string.content_channel_overlay_title), OwnTVIcon.LIST, { controlsVisible = false; it() }) },
                            onOpenHistoryList?.let { TvBoxAction(stringResource(R.string.content_category_history), OwnTVIcon.HISTORY, { controlsVisible = false; it() }) },
                            onPreviousChannel?.let { TvBoxAction(stringResource(R.string.player_previous_channel), OwnTVIcon.SKIP_PREVIOUS, { controlsVisible = false; it() }) },
                            onToggleFavorite?.let {
                                TvBoxAction(
                                    stringResource(if (favorite) R.string.content_favorited else R.string.player_tool_favorite),
                                    if (favorite) OwnTVIcon.FAVORITE else OwnTVIcon.STAR, it, active = favorite,
                                )
                            },
                            onRecordThis?.let {
                                TvBoxAction(
                                    stringResource(
                                        if (recordingThis) R.string.recording_stop else R.string.recording_record,
                                    ),
                                    OwnTVIcon.REC, it, active = recordingThis,
                                )
                            },
                            // The sound's track and its delay live in one sheet: shown whenever either can be changed.
                            TvBoxAction(stringResource(R.string.player_tool_audio), OwnTVIcon.AUDIO, { dialog = HudDialog.AUDIO })
                                .takeIf { audioCount > 1 || player.audioDelayAvailable() },
                            TvBoxAction(stringResource(R.string.player_tool_quality), OwnTVIcon.VIDEO, { dialog = HudDialog.QUALITY })
                                .takeIf { qualityCount > 1 },
                            TvBoxAction(stringResource(R.string.player_tool_subtitles), OwnTVIcon.SUBTITLE, { dialog = HudDialog.SUBS }).takeIf { subCount > 0 },
                            TvBoxAction(stringResource(R.string.player_tool_aspect), OwnTVIcon.ASPECT, { dialog = HudDialog.ZOOM }),
                            onPip?.let { TvBoxAction(stringResource(R.string.player_tool_mini), OwnTVIcon.PIP, { controlsVisible = false; it() }) },
                            onMultiview?.let { TvBoxAction(stringResource(R.string.multiview_button), OwnTVIcon.LIST_GRID, { controlsVisible = false; it() }) },
                            onAudioMode?.let { TvBoxAction(stringResource(R.string.player_tool_audio_only), OwnTVIcon.HEADPHONES, { controlsVisible = false; it() }) },
                            TvBoxAction(stringResource(R.string.player_sleep_timer), OwnTVIcon.BEDTIME, { dialog = HudDialog.SLEEP_TIMER }),
                        ),
                        firstFocus = tvActionFocus,
                    )
                    }
                } else {
                    TvBoxInfoFocus(playFocus)
                }
            }
          }
        }
        if (controlsVisible && !(tvLive && error == null)) {
            // Scrims: a FLAT semi-transparent panel behind the controls, feathered to transparent only at
            // the inner edge. A pure gradient faded out exactly where the chips and the Now/Next text sit,
            // so those washed out on bright scenes; a hard-edged band would instead draw a visible seam
            // across the picture. The colour stops give the panel first, then the feather.
            Box(Modifier.align(Alignment.TopStart).fillMaxWidth().height(210.dp)
                .gradientWash(
                    vertical = true,
                    0.0f to hudShade(0.72f),
                    0.5f to hudShade(0.68f),
                    1.0f to Color.Transparent,
                ))
            Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(260.dp)
                .gradientWash(
                    vertical = true,
                    0.0f to Color.Transparent,
                    0.45f to hudShade(0.68f),
                    1.0f to hudShade(0.78f),
                ))

            // The active engine (MPV/EXO) leads the mini chips so users can always tell which player is on.
            // One unified strip: back · logo · chips-over-channel-name · Now/Next guide. The channel name
            // used to be drawn twice (here and in a floating card below), with the guide stranded on the
            // right edge — that space belongs to the history list now.
            TopBar(
                player, isLive, streamChips.ifEmpty { listOfNotNull(videoRes) }, duration, onBack,
                modifier = Modifier.align(Alignment.TopStart),
                below = matchLine,
                trailing = if (error == null) liveEpgCard else null,
                // Hidden behind an error overlay along with the rest of the chrome: a clock ticking
                // over a failure message just draws the eye to the wrong thing.
                centre = if (error == null) {
                    { PlayerClock(watchingMs = watchingWallMs?.invoke()) }
                } else null,
            )

            // Hide the transport (play/seek/prev/next) and bottom bar while an error is up — the error
            // overlay owns the screen with its own Retry, so the play/rewind/forward must not show behind it.
            if (error == null) {
                CenterControls(player, nav, isPlaying, isLive, onRewindLive, onForwardLive, timeshiftOffset, playFocus, modifier = Modifier.align(Alignment.Center))

                val reportDuration = duration.takeIf { it > 0 }?.let { formatTime(it) }
                val reportSavedMessage = stringResource(R.string.player_report_saved)

                BottomBar(
                    seekFocus = seekFocus,
                    player = player, isLive = isLive, position = { position.value }, duration = duration,
                    volume = volume, audioCount = audioCount, subCount = subCount, zoomMode = zoomMode,
                    speedLabel = formatSpeed(speed),
                    onScrubLive = onScrubLive, timeshiftOffset = timeshiftOffset, onGoToLive = onGoToLive,
                    liveProgrammes = liveProgrammes,
                    liveGaps = liveGaps,
                    onOpenJumpBack = if (onJumpBack != null) { { dialog = HudDialog.JUMP_BACK } } else null,
                    onPreviousChannel = onPreviousChannel,
                    onOtherChannels = onOtherChannels, otherChannelsCount = otherChannelsCount,
                    compatMode = compatMode, onToggleCompatMode = toggleCompat,
                    vodOnExo = vodOnExo, onToggleVodEngine = toggleVod,
                    onInfo = { showInfo = !showInfo }, infoOn = showInfo,
                    onReport = {
                        val meta = player.currentMeta.value
                        // The readout is gathered on the player's own thread now, so the report is
                        // written from a coroutine. The confirmation still flashes immediately — the user
                        // pressed a button and must see it acknowledged.
                        // Read at the press, not per tick.
                        val reportPosition = tv.own.owntv.ui.components.formatTimestamp(reportContext.resources, position.value)
                        hudScope.launch {
                            val snapshot = buildString {
                                appendLine(player.streamInfo().joinToString("\n") { (k, v) -> "  $k: $v" })
                                appendLine("  position: $reportPosition${reportDuration?.let { " / $it" }.orEmpty()}")
                            }
                            PlaybackErrorLog.report(
                                context = reportContext,
                                engine = engineChip ?: "?",
                                live = isLive,
                                title = meta.title,
                                snapshot = snapshot,
                            )
                        }
                        engineMsg = reportSavedMessage
                        engineFlash++
                    },
                    favorite = favorite, onToggleFavorite = onToggleFavorite,
                    onOpenDialog = { dialog = it }, onPip = onPip, onAudioMode = onAudioMode,
                    onMultiview = onMultiview, onRecordThis = onRecordThis, recordingThis = recordingThis, onBack = onBack,
                    modifier = Modifier.align(Alignment.BottomStart),
                )
            }
        }

        // Next-episode countdown card (VOD queue only) — surfaces the automatic advance with Play now /
        // Cancel. Shown independently of the main controls so it appears even after they auto-hide.
        if (showNextCard) {
            NextEpisodeCard(
                seconds = { ((msToAdvance() + 999L) / 1000L).toInt().coerceIn(0, 30) },
                title = nextUpTitle ?: "",
                playFocus = nextFocus,
                onPlayNow = { autoNextDismissed = true; player.next() },
                onCancel = { autoNextDismissed = true; player.cancelAutoNext() },
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 28.dp, bottom = 120.dp),
            )
        }

        // Engine-switch confirmation toast (bottom-center, semi-transparent) — shown briefly after the
        // user flips the engine via the HUD's MPV/EXO toggle.
        engineMsg?.let { msg ->
            Box(
                Modifier.align(Alignment.BottomCenter).padding(bottom = 104.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    msg,
                    style = tv.own.owntv.ui.theme.stageText(25, 600),
                    color = hudInk,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(hudShade(0.55f))
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }

        // Status overlay (always shown).
        when {
            // A clean screen of its own: a picture of what went wrong, a plain headline, one line of why.
            // The engine's raw wording stays out of sight in release builds (a debug build still shows it).
            // Behind the channel panels the failure is only a quiet mark: the panels are what the viewer is
            // using, and the headline, reason and Retry showed through them as clutter.
            // In the panel's window it stands in the middle of that window, the picture and its headline only.
            error != null && inert -> Box(Modifier.fillMaxSize().background(Color(0xFF0B0F14))) {
                val art = error?.let { errorArtOf(it) } ?: tv.own.owntv.ui.stage.ErrorArt.SIGNAL
                Box(LocalHudErrorFrame.current ?: Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        tv.own.owntv.ui.stage.ErrorIllustration(art, size = QUIET_ERROR_SIZE.dp)
                        Spacer(Modifier.height(QUIET_ERROR_GAP.dp))
                        Text(
                            stringResource(errorTitleOf(art)),
                            style = tv.own.owntv.ui.theme.stageText(QUIET_ERROR_TEXT, 700), color = Color.White,
                            textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            error != null -> Box(Modifier.fillMaxSize().background(Color(0xFF0B0F14))) {
              // The button is composed in the same frame as this screen: ask for focus once it exists.
              LaunchedEffect(Unit) { delay(150); runCatching { retryFocus.requestFocus() } }
              Column(Modifier.align(Alignment.Center).fillMaxWidth(0.7f), horizontalAlignment = Alignment.CenterHorizontally) {
                val failure = error
                val art = failure?.let { errorArtOf(it) } ?: tv.own.owntv.ui.stage.ErrorArt.SIGNAL
                tv.own.owntv.ui.stage.ErrorIllustration(art, size = 190.dp)
                Spacer(Modifier.height(26.dp))
                Text(
                    stringResource(errorTitleOf(art)),
                    style = tv.own.owntv.ui.theme.stageText(40, 700), color = Color.White, textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(10.dp))
                // "Connection lost" is the engine's guess; once the reason is known (a 404) it says that instead.
                failure?.takeUnless { it == PlaybackFailure.LostConnection && errorInfo?.reason != null }?.let {
                    Text(it.displayText(), style = tv.own.owntv.ui.theme.stageText(25, 400), color = Color.White.copy(alpha = 0.7f), textAlign = TextAlign.Center)
                }
                errorInfo?.let { info ->
                    info.reason?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it.displayText(), style = tv.own.owntv.ui.theme.stageText(25, 400), color = Color.White.copy(alpha = 0.92f), textAlign = TextAlign.Center)
                    }
                    if (tv.own.owntv.BuildConfig.DEBUG) {
                        info.spec?.let {
                            Spacer(Modifier.height(4.dp))
                            Text(it.displayText(), style = tv.own.owntv.ui.theme.stageText(22, 700), color = Color.White.copy(alpha = 0.55f), textAlign = TextAlign.Center)
                        }
                        info.raw?.takeIf { it.isNotBlank() }?.let {
                            Spacer(Modifier.height(4.dp))
                            Text(stringResource(R.string.player_raw_error, it), style = tv.own.owntv.ui.theme.stageText(22, 400), color = Color.White.copy(alpha = 0.6f), textAlign = TextAlign.Center)
                        }
                    }
                }
                // While a recording is what took the picture away, this screen has TWO buttons
                // instead of a lone Retry, because Retry alone cannot work: the provider's only
                // stream is busy and trying again just fails again.
                //
                // The default protects the recording — a live programme is gone forever, a rewatch
                // is not — and the user can overrule it in one press. The parenthetical on the first
                // button is the whole point: nobody should stop a recording without being told.
                val recordingConflict = rememberRecordingConflict(error)
                Spacer(Modifier.height(18.dp))
                if (recordingConflict != null) {
                    Text(
                        stringResource(R.string.player_recording_conflict),
                        style = tv.own.owntv.ui.theme.stageText(25, 400),
                        color = Color.White.copy(alpha = 0.92f),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(0.8f),
                    )
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        tv.own.owntv.ui.stage.ErrorButton(
                            stringResource(R.string.player_keep_watching_stop_recording),
                            onClick = { recordingConflict.stopAndRetry() },
                            modifier = Modifier.focusRequester(retryFocus),
                        )
                        tv.own.owntv.ui.stage.ErrorButton(stringResource(R.string.settings_close), onClick = onBack)
                    }
                } else {
                    tv.own.owntv.ui.stage.ErrorButton(stringResource(R.string.common_retry), onClick = { player.retry() }, modifier = Modifier.focusRequester(retryFocus))
                }
              }
            }
            // A provider wait looks like loading, because that is what it is: the channel is queued behind
            // the panel's own countdown and the engine re-asks by itself. The line under the spinner says
            // why nothing is happening yet, so nobody reaches for Retry (or thinks the channel is dead).
            // TV-box look: under the channel panel the picture is in a window and the panel draws its own spinner.
            buffering && !(tvLive && inert) -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                // TV-box look: a quiet white spinner, nothing else over the picture while it opens.
                if (tvLive) OwnTVSpinner(sizeDp = 48, color = Color.White.copy(alpha = 0.9f)) else OwnTVSpinner(sizeDp = 56)
                val stalledSince = stalledSinceMs
                if (providerBackOff == null && stalledSince != null) {
                    val showNotice by produceState(false, stalledSince) {
                        delay(RECONNECT_NOTICE_AFTER_MS - (android.os.SystemClock.elapsedRealtime() - stalledSince))
                        value = true
                    }
                    if (showNotice) {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            stringResource(R.string.player_reconnecting),
                            style = tv.own.owntv.ui.theme.stageText(25, 400),
                            color = Color.White.copy(alpha = 0.85f),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(0.7f),
                        )
                    }
                }
                providerBackOff?.let { wait ->
                    Spacer(Modifier.height(14.dp))
                    Text(
                        stringResource(
                            R.string.player_provider_retry_after,
                            wait.httpCode,
                            wait.message ?: stringResource(R.string.player_provider_busy),
                            wait.secondsLeft,
                        ),
                        style = tv.own.owntv.ui.theme.stageText(25, 400),
                        color = Color.White.copy(alpha = 0.85f),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(0.7f),
                    )
                }
            }
        }
    }

    when (dialog) {
        // Track lists are SNAPSHOT once when the dialog opens (re-polled only while still empty —
        // heavy HDR/DTS streams report their tracks late). Reading player.xxxTracks() directly in
        // composition handed the dialog a fresh list on every HUD recomposition, endlessly rebuilding
        // the rows and losing/yanking D-pad focus.
        //
        // The re-poll is BOUNDED: a stream that genuinely has no such track (most radio channels have
        // no subtitles) would otherwise wake the CPU every 300 ms for as long as the menu stays open.
        // Tracks that arrive later than TRACK_POLL_TRIES × 300 ms have never been observed.
        HudDialog.AUDIO -> {
            var audioTracks by remember { mutableStateOf(player.audioTracks()) }
            LaunchedEffect(Unit) {
                repeat(TRACK_POLL_TRIES) {
                    if (audioTracks.isNotEmpty()) return@LaunchedEffect
                    delay(TRACK_POLL_MS)
                    audioTracks = player.audioTracks()
                }
            }
            TrackDialog(
                stringResource(R.string.player_audio_track), audioTracks,
                onSelect = { player.selectAudio(it.mpvId); dialog = HudDialog.NONE }, onOff = null,
                onDismiss = { dialog = HudDialog.NONE },
                // A/V-sync nudge wherever the engine can actually shift audio: mpv, VOD *and* live (a live
                // stream can arrive with the provider's own drift baked in), on mpv and ExoPlayer alike.
                audioDelayMs = if (player.audioDelayAvailable()) audioDelayMs else null,
                onAdjustAudioDelay = if (player.audioDelayAvailable()) ({ d -> player.adjustAudioDelay(d) }) else null,
                audioDelayRemembered = audioDelayRemembered,
                onToggleRememberAudioDelay = if (player.audioDelayAvailable()) ({ player.toggleRememberAudioDelay() }) else null,
            )
        }
        HudDialog.SUBS -> {
            var subTracks by remember { mutableStateOf(player.textTracks()) }
            LaunchedEffect(Unit) {
                repeat(TRACK_POLL_TRIES) {
                    if (subTracks.isNotEmpty()) return@LaunchedEffect
                    delay(TRACK_POLL_MS)
                    subTracks = player.textTracks()
                }
            }
            val subDelay by player.subDelayMs.collectAsStateWithLifecycle()
            TrackDialog(
                stringResource(R.string.player_subtitles), subTracks,
                onSelect = { player.selectSubtitle(it.mpvId); dialog = HudDialog.NONE },
                onOff = { player.disableSubtitles(); dialog = HudDialog.NONE },
                onDismiss = { dialog = HudDialog.NONE },
                onSearchSubtitles = onSearchSubtitles?.let { open -> { dialog = HudDialog.NONE; open() } },
                onSelectLocalSubtitle = onSelectLocalSubtitle?.let { open -> { dialog = HudDialog.NONE; open() } },
                // Subtitle timing: only when adjustment applies to the ACTIVE subtitle on the
                // current engine (any mpv text sub; external side-loads on ExoPlayer).
                subDelayMs = subDelay,
                onAdjustSubDelay = if (player.subtitleTimingAvailable()) player::adjustSubtitleDelay else null,
                onResetSubDelay = player::resetSubtitleDelay,
            )
        }
        HudDialog.SPEED -> SpeedDialog(current = speed, onSelect = { player.setSpeed(it); dialog = HudDialog.NONE }, onDismiss = { dialog = HudDialog.NONE })
        HudDialog.ZOOM -> ZoomDialog(current = zoomMode, onSelect = { player.setZoomModeByUser(it); dialog = HudDialog.NONE }, onDismiss = { dialog = HudDialog.NONE })
        HudDialog.QUALITY -> {
            // Snapshot as it opens, like the track lists above: a live list would rebuild the rows.
            val heights = remember { player.videoQualities.value }
            val pick by player.videoQualityPick.collectAsStateWithLifecycle()
            QualityDialog(heights, pick, onSelect = { player.selectVideoQuality(it); dialog = HudDialog.NONE }, onDismiss = { dialog = HudDialog.NONE })
        }
        HudDialog.VOLUME -> VolumeDialog(player, onDismiss = { dialog = HudDialog.NONE })
        HudDialog.SLEEP_TIMER -> SleepTimerDialog(
            timer = org.koin.compose.koinInject(),
            programmeEndMs = remember { sleepProgrammeEndMs?.invoke() },
            onDismiss = { dialog = HudDialog.NONE },
        )
        // "Go back to…". The options are read here, as the list opens, so the clock times shown are
        // relative to the moment the user asked rather than to when the HUD was first composed.
        HudDialog.JUMP_BACK -> {
            val options = remember { jumpBackOptions?.invoke().orEmpty() }
            val windowSec = remember { jumpBackWindowSec?.invoke() ?: 0 }
            if (options.isEmpty()) {
                dialog = HudDialog.NONE
            } else {
                tv.own.owntv.features.live.CatchupJumpDialog(
                    title = stringResource(R.string.content_catchup_jump),
                    offsetsSec = options,
                    windowSec = windowSec,
                    onPick = { dialog = HudDialog.NONE; onJumpBack?.invoke(it) },
                    onDismiss = { dialog = HudDialog.NONE },
                )
            }
        }
        HudDialog.NONE -> Unit
    }
}

/** The TV-box info and tiles fading and sliding in and out. */
private const val TvHudFadeMs = 220

/** Which picture suits a failure: a dead signal, no network, or a device that cannot show the video. */
internal fun errorArtOf(failure: PlaybackFailure): tv.own.owntv.ui.stage.ErrorArt = when (failure) {
    PlaybackFailure.NoInternet -> tv.own.owntv.ui.stage.ErrorArt.NO_INTERNET
    PlaybackFailure.DecoderBusy, PlaybackFailure.DecoderExhausted, PlaybackFailure.FileCorrupt, PlaybackFailure.Surround,
    PlaybackFailure.ImageSubtitleAudio, PlaybackFailure.ImageFormat, PlaybackFailure.ImageShow,
    PlaybackFailure.BothEnginesExoFirst, is PlaybackFailure.BothEnginesMpvFirst, is PlaybackFailure.ExoDecode,
    -> tv.own.owntv.ui.stage.ErrorArt.DEVICE
    else -> tv.own.owntv.ui.stage.ErrorArt.SIGNAL
}

/** The failure mark behind open panels: small and faded, so it reads as a state, not a message. */
private const val QUIET_ERROR_SIZE = 96

/**
 * Where the picture is while the HUD is inert (the channel panel's window), so a failed channel's error sits in it.
 * A local, not a parameter: one more parameter on [PlayerHud] made R8 emit code the device refused to load.
 */
val LocalHudErrorFrame = androidx.compose.runtime.compositionLocalOf<Modifier?> { null }

private const val QUIET_ERROR_GAP = 14
private const val QUIET_ERROR_TEXT = 26

/** The headline under an error's picture. */
private fun errorTitleOf(art: tv.own.owntv.ui.stage.ErrorArt): Int = when (art) {
    tv.own.owntv.ui.stage.ErrorArt.SIGNAL -> R.string.player_error_title_signal
    tv.own.owntv.ui.stage.ErrorArt.NO_INTERNET -> R.string.player_error_title_internet
    tv.own.owntv.ui.stage.ErrorArt.DEVICE -> R.string.player_error_title_device
}

/**
 * Runs the job a viewer gave one of the remote's keys on a channel, from [jobs]: what the player can
 * do here. Returns false when the job is not among them (no archive to rewind, no list to open), so
 * the key keeps its usual job. Held keys repeat: zapping and rewinding go on, the rest happens once.
 */
private fun runLiveKey(action: LiveKeyAction, firstPress: Boolean, jobs: Map<LiveKeyAction, () -> Unit>): Boolean {
    val job = jobs[action] ?: return false
    if (firstPress || action in LIVE_KEY_REPEATS) job()
    return true
}

/** TV-box live: whether ▼ has put the viewer on the timeline, where ◀ ▶ rewind; the info draws it raised. */
val LocalTvBoxSeeking = androidx.compose.runtime.compositionLocalOf { false }

/**
 * The keys of the transport under the timeline: back to the programme's start (or the one before), back, pause,
 * forward, on to the next programme (or live), live and record. [pauseFocus] is where focus lands on the timeline.
 */
class TvBoxTransport(
    val pauseFocus: FocusRequester,
    val onPrevious: () -> Unit,
    val onBack: (repeat: Int) -> Unit,
    val onPause: () -> Unit,
    val onForward: (repeat: Int) -> Unit,
    val onNext: () -> Unit,
    val onLive: (() -> Unit)?,
    val onRecord: (() -> Unit)?,
    val recording: Boolean,
    val onKey: () -> Unit,
)

/** The transport's keys while the timeline step is up; null elsewhere. */
val LocalTvBoxTransport = androidx.compose.runtime.compositionLocalOf<TvBoxTransport?> { null }

/** The channel is paused: the transport under the timeline shows play instead of pause. */
val LocalTvBoxPaused = androidx.compose.runtime.compositionLocalOf { false }

/** The archive seek run in progress: seconds moved so far (+ toward live), or null when none is. */
val LocalTvBoxSeekRun = androidx.compose.runtime.compositionLocalOf<Int?> { null }

/**
 * One ◀ ▶ step in the archive: 10 s a press, so a scene can be found to the second; held, the steps grow
 * (30 s, a minute, five) so an hour is still a few seconds away. [repeat] is the key's auto-repeat count.
 */
internal fun archiveSeekStepSec(repeat: Int): Int = when {
    repeat < SEEK_HOLD_30S -> SEEK_STEP_TAP
    repeat < SEEK_HOLD_1M -> SEEK_STEP_30S
    repeat < SEEK_HOLD_5M -> SEEK_STEP_1M
    else -> SEEK_STEP_5M
}

private const val SEEK_STEP_TAP = 10
private const val SEEK_STEP_30S = 30
private const val SEEK_STEP_1M = 60
private const val SEEK_STEP_5M = 300

/** The share of the screen's width at each side where a pointer click opens the channel lists. */
private const val POINTER_EDGE = 0.22f

/** How long the run's counter stays after the last press; a press later than that starts a new run. */
private const val SEEK_RUN_SHOW_MS = 1_500L
private const val SEEK_HOLD_30S = 8
private const val SEEK_HOLD_1M = 20
private const val SEEK_HOLD_5M = 40

/** TV-box live: how long the timeline or the tiles stay up after the last key. */
private const val TV_BOX_BUSY_HIDE_MS = 8_000L
private const val MS_PER_SECOND = 1_000L

/** Into a programme by more than this, |◀ goes back to its start; within it, to the programme before. */
private const val PROGRAMME_START_GRACE_SEC = 10

private val LIVE_KEY_REPEATS = setOf(
    LiveKeyAction.NEXT_CHANNEL,
    LiveKeyAction.PREVIOUS_CHANNEL,
    LiveKeyAction.REWIND,
    LiveKeyAction.FORWARD,
)
