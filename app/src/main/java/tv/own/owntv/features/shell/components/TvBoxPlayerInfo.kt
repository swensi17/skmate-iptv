package tv.own.owntv.features.shell.components

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.getValue
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.focusable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.tv.material3.Text
import tv.own.owntv.R
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.epg.displayLogoUrl
import tv.own.owntv.core.live.EpgNowNext
import tv.own.owntv.core.parser.XtEpgEntry
import tv.own.owntv.ui.components.ChannelLogoTile
import tv.own.owntv.ui.components.GuideStatusText
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.format.rememberSystemTimeFormatter
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/**
 * The TV-box player's channel info, at the bottom of the picture: the logo, what is on, its times with
 * a short bar and the minutes left, the channel, what is on next with the stream's tags, and under it all
 * the timeline — the programme's span with the moment being watched ([offsetSec] behind live) marked.
 * With no guide it still says the channel and that there is no programme, so the bar never looks empty.
 */
@Composable
fun TvBoxPlayerInfo(channel: ChannelEntity?, nowNext: EpgNowNext?, offsetSec: Int?, now: Long) {
    val formatTime = rememberSystemTimeFormatter()
    // The moment on screen: the clock, less how far behind live the archive is.
    val watching = now - (offsetSec ?: 0) * 1000L
    // Between two refreshes the programme on air may have ended: the one after it is then what is on.
    val upNext = nowNext?.next
    val promoted = upNext?.takeIf { it.startMs <= watching && watching < it.stopMs }
    val current = nowNext?.now?.takeIf { watching < it.stopMs } ?: promoted
    val next = upNext.takeIf { promoted == null }
    // A film or a series on air: its poster in the logo's place and what it is about under the times (TMDB).
    val art = tv.own.owntv.ui.components.rememberProgrammeArt(current?.title)
    val about = tv.own.owntv.player.TvBoxAbout.open
    // The info goes away: the next time it opens short again.
    androidx.compose.runtime.DisposableEffect(Unit) { onDispose { tv.own.owntv.player.TvBoxAbout.open = false } }
    Column(verticalArrangement = Arrangement.spacedBy(18.mpx)) {
        // A poster starts level with the title beside it; the smaller logo stays centred on the lines.
        Row(
            horizontalArrangement = Arrangement.spacedBy(24.mpx),
            verticalAlignment = if (art != null) Alignment.Top else Alignment.CenterVertically,
        ) {
            infoArt(art, channel)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.mpx)) {
                if (current != null) {
                    Text(
                        current.title, style = stageText(34, 700), color = Color.White,
                        maxLines = if (about) 2 else 1, overflow = TextOverflow.Ellipsis,
                    )
                } else {
                    GuideStatusText(stringResource(R.string.content_no_guide), stageText(34, 700), Color.White)
                }
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.mpx),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (current != null) {
                        Text(range(formatTime, current), style = stageText(20, 500), color = Soft, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        MiniBar(((watching - current.startMs).toFloat() / (current.stopMs - current.startMs).coerceAtLeast(1)).coerceIn(0f, 1f))
                        val left = ((current.stopMs - watching) / 60_000L).toInt().coerceAtLeast(0)
                        Text(stringResource(R.string.player_duration_minutes, left), style = stageText(20, 500), color = Soft, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    }
                    if (channel != null) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.mpx)) {
                            channel.number?.let { Text(it.toString(), style = stageText(20, 700), color = Color.White, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) }
                            Text(channel.name, style = stageText(20, 700), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    // What the stream is shows once, in the tags at the bottom right: no chips beside the channel.
                    val factsShown = tv.own.owntv.player.LocalTvBoxStreamFacts.current != null
                    // With nothing to follow there is no next line: the stream's tags sit level with the channel.
                    if (next == null && factsShown) {
                        androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                        tv.own.owntv.player.LocalTvBoxStreamFacts.current?.let { tv.own.owntv.player.tvBoxStreamFacts(it) }
                    }
                }
                if (about) fullAbout(current?.description, art) else art?.let { programmeAbout(it) }
                nextLine(next, formatTime)
            }
        }
        val progress = current?.let {
            ((watching - it.startMs).toFloat() / (it.stopMs - it.startMs).coerceAtLeast(1)).coerceIn(0f, 1f)
        } ?: 1f
        Box(Modifier.fillMaxWidth()) {
            Timeline(
                progress = progress,
                behind = (offsetSec ?: 0) > 0,
                seeking = tv.own.owntv.player.LocalTvBoxSeeking.current,
            )
            tv.own.owntv.player.LocalTvBoxSeekRun.current?.let { moved -> seekCounter(progress, moved, watching) }
        }
        // On the timeline: how far into the programme, and back, pause and forward as the keys there use them.
        if (tv.own.owntv.player.LocalTvBoxSeeking.current) {
            transportRow(
                elapsedMs = current?.let { (watching - it.startMs).coerceAtLeast(0) },
                totalMs = current?.let { it.stopMs - it.startMs },
                paused = tv.own.owntv.player.LocalTvBoxPaused.current,
                moved = tv.own.owntv.player.LocalTvBoxSeekRun.current,
            )
        }
    }
}

/** What follows on the left; on its right, level with it, what the stream is (50 fps · H.264 · 4.7 Mbps). */
@Composable
private fun nextLine(next: XtEpgEntry?, formatTime: (Long) -> String) {
    val facts = tv.own.owntv.player.LocalTvBoxStreamFacts.current
    if (next == null) return
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.mpx),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (next != null) {
            Text(
                range(formatTime, next), style = stageText(NEXT_TEXT, NEXT_WEIGHT), color = Faint,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            next?.title.orEmpty(), style = stageText(NEXT_TEXT, NEXT_WEIGHT), color = Faint,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        facts?.let { tv.own.owntv.player.tvBoxStreamFacts(it) }
    }
}

@Composable
private fun range(formatTime: (Long) -> String, p: XtEpgEntry): String =
    stringResource(R.string.content_live_time_range_plain, formatTime(p.startMs), formatTime(p.stopMs))

/** The short bar after the times: how far the programme has got. */
@Composable
private fun MiniBar(progress: Float) {
    Box(
        Modifier.width(64.mpx).height(4.mpx).drawBehind {
            val r = CornerRadius(size.height / 2)
            drawRoundRect(Color.White.copy(alpha = 0.3f), cornerRadius = r)
            drawRoundRect(Color.White, size = Size(size.width * progress, size.height), cornerRadius = r)
        },
    )
}

/**
 * Under the timeline: "49:55 / 1:00:00" on the left; in the middle |◀ ◀◀ ⏸ ▶▶ ▶|, on the right live and record, as
 * keys focus walks with ◀ ▶ and OK presses (◀◀ ▶▶ held go on moving). The key in focus shows its name under it; the
 * one a run of presses is moving lights up.
 */
@Composable
private fun transportRow(elapsedMs: Long?, totalMs: Long?, paused: Boolean, moved: Int?) {
    val t = tv.own.owntv.player.LocalTvBoxTransport.current
    Box(Modifier.fillMaxWidth().height(TRANSPORT_H.mpx)) {
        if (elapsedMs != null && totalMs != null) {
            Text(
                clockOf(elapsedMs) + " / " + clockOf(totalMs),
                style = stageText(TRANSPORT_TIME, 600).copy(fontFeatureSettings = "tnum"), color = Color.White,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.align(Alignment.CenterStart),
            )
        }
        Row(
            Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(TRANSPORT_GAP.mpx),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            transportKey(tv.own.owntv.ui.components.OwnTVIcon.SKIP_PREVIOUS, null, first = true, onPress = t?.let { { _: Int -> it.onPrevious() } }, onKey = t?.onKey)
            transportKey(tv.own.owntv.ui.components.OwnTVIcon.REWIND, null, lit = moved != null && moved < 0, repeats = true, onPress = t?.onBack, onKey = t?.onKey)
            transportKey(
                if (paused) tv.own.owntv.ui.components.OwnTVIcon.PLAY else tv.own.owntv.ui.components.OwnTVIcon.PAUSE, null,
                big = true, focus = t?.pauseFocus, onPress = t?.let { { _: Int -> it.onPause() } }, onKey = t?.onKey,
            )
            transportKey(tv.own.owntv.ui.components.OwnTVIcon.FORWARD, null, lit = moved != null && moved > 0, repeats = true, onPress = t?.onForward, onKey = t?.onKey)
            transportKey(
                tv.own.owntv.ui.components.OwnTVIcon.SKIP_PREVIOUS, null, mirrored = true,
                last = t?.onLive == null && t?.onRecord == null, onPress = t?.let { { _: Int -> it.onNext() } }, onKey = t?.onKey,
            )
        }
        Row(
            Modifier.align(Alignment.CenterEnd),
            horizontalArrangement = Arrangement.spacedBy(TRANSPORT_GAP.mpx),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            t?.onLive?.let { live ->
                transportKey(
                    tv.own.owntv.ui.components.OwnTVIcon.LIVE_DOT, null, badge = stringResource(R.string.player_live),
                    last = t.onRecord == null, onPress = { _ -> live() }, onKey = t.onKey,
                )
            }
            t?.onRecord?.let { rec ->
                transportKey(
                    tv.own.owntv.ui.components.OwnTVIcon.REC,
                    stringResource(if (t.recording) R.string.recording_stop else R.string.recording_record),
                    lit = t.recording, last = true, onPress = { _ -> rec() }, onKey = t.onKey,
                )
            }
        }
    }
}

/**
 * One transport key: the glyph on a white disc while it has focus (or is [lit]), alone otherwise; [label] shows under
 * it in focus. The row's ends are walls, so ◀ on the first and ▶ on the last stay put.
 */
@Composable
private fun transportKey(
    icon: tv.own.owntv.ui.components.OwnTVIcon,
    label: String?,
    lit: Boolean = false,
    big: Boolean = false,
    first: Boolean = false,
    last: Boolean = false,
    repeats: Boolean = false,
    mirrored: Boolean = false,
    /** A word in a frame in place of the glyph (LIVE). */
    badge: String? = null,
    focus: androidx.compose.ui.focus.FocusRequester? = null,
    onPress: ((Int) -> Unit)?,
    onKey: (() -> Unit)?,
) {
    val size = if (big) TRANSPORT_BIG else TRANSPORT_KEY
    val interaction = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val on = focused || lit
    val ink = if (on) Color(0xFF16181D) else Color.White
    // Every key on one line: the same slot height whatever its size, the name hung under it without moving it.
    Box(Modifier.height(TRANSPORT_BIG.mpx), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .then(if (badge != null) Modifier.height(TRANSPORT_KEY.mpx) else Modifier.size(size.mpx))
                .then(if (focus != null) Modifier.focusRequester(focus) else Modifier)
                .onPreviewKeyEvent { e ->
                    if (e.type != androidx.compose.ui.input.key.KeyEventType.KeyDown) return@onPreviewKeyEvent false
                    onKey?.invoke()
                    val ok = e.key == androidx.compose.ui.input.key.Key.DirectionCenter ||
                        e.key == androidx.compose.ui.input.key.Key.Enter || e.key == androidx.compose.ui.input.key.Key.NumPadEnter
                    when {
                        ok -> {
                            val r = e.nativeKeyEvent.repeatCount
                            if (r == 0 || repeats) onPress?.invoke(r)
                            true
                        }
                        e.key == androidx.compose.ui.input.key.Key.DirectionLeft -> first
                        e.key == androidx.compose.ui.input.key.Key.DirectionRight -> last
                        else -> false
                    }
                }
                .focusable(interactionSource = interaction)
                .background(
                    if (on) Color.White else Color.Transparent,
                    if (badge != null) RoundedCornerShape(TRANSPORT_KEY.mpx / 2) else androidx.compose.foundation.shape.CircleShape,
                )
                .then(if (badge != null) Modifier.padding(horizontal = 18.mpx) else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            if (badge != null) {
                Text(
                    badge, style = stageText(TRANSPORT_BADGE, 800), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.border(2.mpx, ink, RoundedCornerShape(6.mpx)).padding(horizontal = 8.mpx, vertical = 1.mpx),
                )
            } else {
                tv.own.owntv.ui.components.OwnTVIcon(
                    icon, ink,
                    Modifier.size((size * TRANSPORT_GLYPH).mpx).then(if (mirrored) Modifier.graphicsLayer { scaleX = -1f } else Modifier),
                )
            }
        }
        if (label != null && focused) {
            Text(
                label, style = stageText(TRANSPORT_LABEL, 600), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.BottomCenter).offset(y = (TRANSPORT_LABEL + 10).mpx),
            )
        }
    }
}

/** "49:55" or "1:00:00". */
private fun clockOf(ms: Long): String {
    val s = ms / 1000
    val h = s / 3600; val m = s % 3600 / 60; val sec = s % 60
    return if (h > 0) "%d:%02d:%02d".format(java.util.Locale.ROOT, h, m, sec) else "%d:%02d".format(java.util.Locale.ROOT, m, sec)
}

private const val TRANSPORT_H = 96
private const val TRANSPORT_TIME = 22
private const val TRANSPORT_GAP = 34
private const val TRANSPORT_KEY = 60
private const val TRANSPORT_BIG = 76
private const val TRANSPORT_GLYPH = 0.46f
private const val TRANSPORT_BADGE = 16
private const val TRANSPORT_LABEL = 15

/**
 * The full-width line under the info: the programme's span and the watched moment as a dot. Raised
 * (thicker, a larger ringed dot) while ▼ has put the viewer on it, which is where ◀ ▶ rewind.
 */
@Composable
private fun Timeline(progress: Float, behind: Boolean, seeking: Boolean) {
    val liveC = tv.own.owntv.ui.theme.liveAccent
    Box(
        Modifier.fillMaxWidth().height(24.mpx).drawBehind {
            val h = (if (seeking) 8.mpx else 4.mpx).toPx()
            val y = (size.height - h) / 2
            val r = CornerRadius(h / 2)
            val track = Color.White.copy(alpha = if (seeking) 0.35f else 0.25f)
            drawRoundRect(track, topLeft = Offset(0f, y), size = Size(size.width, h), cornerRadius = r)
            val x = size.width * progress
            drawRoundRect(liveC, topLeft = Offset(0f, y), size = Size(x, h), cornerRadius = r)
            val dot = (if (seeking) 12.mpx else 7.mpx).toPx()
            val center = Offset(x.coerceIn(dot, size.width - dot), size.height / 2)
            if (seeking) drawCircle(liveC.copy(alpha = 0.45f), radius = dot + 5.mpx.toPx(), center = center)
            drawCircle(if (behind && !seeking) liveC else Color.White, radius = dot, center = center)
        },
    )
}

/**
 * Over the dot while ◀ ▶ move through the archive: how far the presses have gone ("−1:20", "+0:30") and the
 * moment they land on, to the second. It sits above the line and takes no room, so nothing moves under it.
 */
@Composable
private fun seekCounter(progress: Float, movedSec: Int, atMs: Long) {
    val clock = remember { java.time.format.DateTimeFormatter.ofLocalizedTime(java.time.format.FormatStyle.MEDIUM) }
    val at = remember(atMs / MS_PER_SEC) {
        java.time.Instant.ofEpochMilli(atMs).atZone(java.time.ZoneId.systemDefault()).format(clock)
    }
    val label = stringResource(R.string.player_seek_counter, signedDuration(movedSec), at)
    androidx.compose.ui.layout.Layout(
        content = {
            Text(
                label, style = stageText(COUNTER_TEXT, COUNTER_WEIGHT), color = Color.Black, maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.background(Color.White, RoundedCornerShape(10.mpx))
                    .padding(horizontal = 14.mpx, vertical = 6.mpx),
            )
        },
        modifier = Modifier.fillMaxWidth(),
    ) { measurables, constraints ->
        val pill = measurables.first().measure(constraints.copy(minWidth = 0, minHeight = 0))
        val room = (constraints.maxWidth - pill.width).coerceAtLeast(0)
        val x = (constraints.maxWidth * progress - pill.width / 2f).toInt().coerceIn(0, room)
        layout(constraints.maxWidth, 0) { pill.place(x, -pill.height - COUNTER_GAP.mpx.roundToPx()) }
    }
}

/** "−1:20", "+0:30", "−1:02:05": minus is back in time. */
private fun signedDuration(sec: Int): String {
    val a = kotlin.math.abs(sec)
    val sign = if (sec < 0) "\u2212" else "+"
    val h = a / SEC_PER_HOUR
    val m = a % SEC_PER_HOUR / SEC_PER_MIN
    val s = a % SEC_PER_MIN
    return if (h > 0) String.format(java.util.Locale.ROOT, "%s%d:%02d:%02d", sign, h, m, s)
    else String.format(java.util.Locale.ROOT, "%s%d:%02d", sign, m, s)
}

/** The poster of a film or series on air, or else the channel's logo on its own over the picture. */
@Composable
private fun infoArt(art: tv.own.owntv.core.metadata.ProgrammeArt?, channel: ChannelEntity?) {
    // The logo gives way to the poster in a short cross-fade, the space growing with it, never in one frame.
    androidx.compose.animation.Crossfade(
        targetState = art?.posterUrl,
        animationSpec = androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.dur(ART_FADE_MS)),
        modifier = Modifier.animateContentSize(
            androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.dur(ART_FADE_MS)),
        ),
        label = "info-art",
    ) { poster ->
        if (poster != null) {
            tv.own.owntv.ui.components.programmePoster(poster, POSTER_WIDTH.mpx)
        } else {
            ChannelLogoTile(
                logoUrl = channel?.displayLogoUrl,
                modifier = Modifier.size(132.mpx).padding(6.mpx),
                fill = Color.Transparent,
            ) { tv.own.owntv.ui.components.OwnTVIcon(OwnTVIcon.LIVE_TV, Color.White.copy(alpha = 0.6f), Modifier.size(56.mpx)) }
        }
    }
}

/** The year and what a film or series is about, two lines at most, under the programme's times. */
@Composable
private fun programmeAbout(art: tv.own.owntv.core.metadata.ProgrammeArt) {
    val separator = stringResource(R.string.content_epg_bits_separator)
    val text = listOfNotNull(art.year?.toString(), art.overview).joinToString(separator)
    if (text.isBlank()) return
    Text(
        text, style = stageText(ABOUT_TEXT, 500), color = Soft, maxLines = 2, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.widthIn(max = ABOUT_WIDTH.mpx),
    )
}

/** The "Description" key: the guide's text, else the film's overview, as long as it is. */
@Composable
private fun fullAbout(guide: String?, art: tv.own.owntv.core.metadata.ProgrammeArt?) {
    val separator = stringResource(R.string.content_epg_bits_separator)
    val text = guide?.takeIf { it.isNotBlank() }
        ?: listOfNotNull(art?.year?.toString(), art?.overview).joinToString(separator)
    if (text.isBlank()) return
    Text(
        text,
        style = stageText(ABOUT_TEXT, 500), color = Soft, maxLines = FULL_ABOUT_LINES, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.widthIn(max = ABOUT_WIDTH.mpx),
    )
}

private const val FULL_ABOUT_LINES = 9
private const val POSTER_WIDTH = 120
private const val ART_FADE_MS = 260
private const val NEXT_TEXT = 20
private const val NEXT_WEIGHT = 500
private const val ABOUT_TEXT = 19
private const val ABOUT_WIDTH = 1300

private const val COUNTER_GAP = 10
private const val COUNTER_TEXT = 22
private const val COUNTER_WEIGHT = 700
private const val MS_PER_SEC = 1000L
private const val SEC_PER_MIN = 60
private const val SEC_PER_HOUR = 3600

private val Soft = Color.White.copy(alpha = 0.8f)
private val Faint = Color.White.copy(alpha = 0.62f)
