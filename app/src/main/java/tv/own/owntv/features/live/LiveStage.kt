package tv.own.owntv.features.live

import tv.own.owntv.ui.theme.stageTone
import tv.own.owntv.ui.theme.stageShadow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import tv.own.owntv.ui.components.reportOkHeld
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.foundation.verticalScroll
import androidx.compose.animation.core.animateFloat
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import androidx.compose.foundation.layout.offset
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import kotlinx.coroutines.launch
import tv.own.owntv.R
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.epg.displayLogoUrl
import tv.own.owntv.core.live.EpgNowNext
import tv.own.owntv.core.live.ProviderName
import tv.own.owntv.core.live.ProviderTags
import tv.own.owntv.core.parser.EpgDetails
import tv.own.owntv.core.parser.XtEpgEntry
import tv.own.owntv.features.home.timeLeftText
import tv.own.owntv.ui.components.ChannelLogoTile
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.components.OwnTVSpinner
import tv.own.owntv.ui.components.trapVerticalFocusExit
import tv.own.owntv.ui.format.rememberSystemTimeFormatter
import tv.own.owntv.ui.stage.shownColor
import tv.own.owntv.ui.stage.PlaylistMark
import tv.own.owntv.ui.stage.StageGroupLabel
import tv.own.owntv.ui.stage.StageLiveBadge
import tv.own.owntv.ui.stage.StagePlaylistMark
import tv.own.owntv.ui.stage.StageProgress
import tv.own.owntv.ui.stage.StageRow
import tv.own.owntv.ui.stage.StageSearchField
import tv.own.owntv.ui.stage.StageSheetItem
import tv.own.owntv.ui.stage.StageSpecChip
import tv.own.owntv.ui.stage.StageSurface
import tv.own.owntv.ui.stage.StageTag
import tv.own.owntv.ui.stage.drawBoxShadow
import tv.own.owntv.ui.stage.drawInnerRing
import tv.own.owntv.ui.stage.stageGlass
import tv.own.owntv.ui.stage.stageSelectedBar
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.StageRadii
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.mpxSp
import tv.own.owntv.ui.theme.stageAccent
import tv.own.owntv.ui.theme.stageText

/*
 * Live TV in the Stage design: the header, the channel rows, the stage on the right,
 * and the category list as a sheet (Stage layout) or a column (Separate panels). LiveScreen owns the
 * state and the focus plumbing; these only draw.
 */

private val Tabular = "tnum"

/** "Live TV" 46/800, then the crumb: "‹ **Sky Cinema** · 9 channels" (no ‹ when the column is on screen). */
@Composable
internal fun LiveHeader(category: String, count: Int, showChevron: Boolean, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(22.mpx), verticalAlignment = Alignment.Bottom) {
        Text(stringResource(R.string.live_screen_title), style = stageText(46, 800, (-1).mpxSp), color = StageColors.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
        // TV-box look: just the title; the group shows in the categories, no ‹ group · count line.
        if (!tv.own.owntv.features.shell.TvBoxNav) Row(
            Modifier.padding(bottom = 3.mpx),
            horizontalArrangement = Arrangement.spacedBy(12.mpx),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (showChevron) OwnTVIcon(OwnTVIcon.CHEVRON_LEFT, StageColors.Muted, Modifier.size(20.mpx))
            Text(
                category, style = stageText(20, 700), color = stageAccent.accent,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
            )
            Text(
                "· " + pluralStringResource(R.plurals.content_live_channel_count, count, count),
                style = stageText(20, 500), color = StageColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * `.chrow`: 84 high, 20 padding, 18 gap — number (50, right-aligned, 20/600 dim), white logo plate
 * 76×54, name 22/700, "programme · time left" 17 muted (the time part at 60%), a 300×4 progress line;
 * then the provider tags, ↺ for catch-up, ♥ when a favourite, and the playlist mark. Focused = FX.
 * [trailing] replaces that end group (the player's History sheet shows when each was watched).
 */
@Composable
internal fun LiveStageRow(
    channel: ChannelEntity,
    name: ProviderName,
    now: XtEpgEntry?,
    nowTitle: String?,
    isFavorite: Boolean,
    showNumber: Boolean,
    mark: PlaylistMark?,
    onFocus: () -> Unit,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
    /** This channel is the one in the preview: a small blue "playing" mark at the row's end (TV-box look). */
    playing: Boolean = false,
) {
    val tvBox = tv.own.owntv.features.shell.TvBoxNav
    StageRow(
        onClick = onClick,
        onLongClick = onLongClick,
        height = if (tvBox) 92.mpx else 84.mpx,
        modifier = modifier.fillMaxWidth().onFocusChanged { if (it.hasFocus) onFocus() }
            // TV-box look: a hairline under each channel.
            .then(if (tv.own.owntv.features.shell.TvBoxNav) Modifier.drawBehind {
                val h = 1.mpx.toPx()
                drawRect(RowLine, topLeft = androidx.compose.ui.geometry.Offset(20.mpx.toPx(), drawContext.size.height - h), size = androidx.compose.ui.geometry.Size(drawContext.size.width - 40.mpx.toPx(), h))
            } else Modifier),
    ) { focused ->
        if (showNumber) {
            Text(
                channel.number?.toString().orEmpty(),
                // TV-box look: from the left, so the numbers start on the search field's line.
                style = stageText(20, 600).copy(textAlign = if (tv.own.owntv.features.shell.TvBoxNav) TextAlign.Start else TextAlign.End, fontFeatureSettings = Tabular),
                color = if (focused) stageTone(Color(0xFFE6F2EE), StageColors.FxLine) else StageColors.Dim,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.width(50.mpx),
            )
        }
        LivePlate(channel.displayLogoUrl, 76.mpx, 54.mpx)
        Column(Modifier.weight(1f)) {
            Text(name.name, style = stageText(if (tvBox) 23 else 22, 700), color = if (focused) StageColors.FxText else StageColors.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val title = now?.title ?: nowTitle
            if (title != null) {
                val left = now?.let { timeLeftText(minutesLeft(it)) }
                Spacer(Modifier.height(2.mpx))
                Text(
                    buildAnnotatedString {
                        append(title)
                        if (left != null) withStyle(SpanStyle(color = (if (focused) StageColors.FxLine else StageColors.Muted).copy(alpha = 0.6f))) { append(" · $left") }
                    },
                    style = stageText(if (tvBox) 18 else 17, 400), color = if (focused) StageColors.FxLine else StageColors.Muted,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            if (now != null) {
                Spacer(Modifier.height(8.mpx))
                // TV-box look: the bar runs the whole width of the row's text, to the row's end.
                StageProgress(progressOf(now), if (tvBox) Modifier.fillMaxWidth() else Modifier.width(300.mpx), flat = true)
            }
        }
        if (trailing != null) trailing()
        else Row(horizontalArrangement = Arrangement.spacedBy(8.mpx), verticalAlignment = Alignment.CenterVertically) {
            if (playing && tvBox) tv.own.owntv.ui.components.PlayingMark(Modifier.padding(start = 6.mpx))
            name.tags.forEach { StageTag(it) }
            if (channel.catchup) OwnTVIcon(OwnTVIcon.REWIND, StageColors.Dim, Modifier.size(22.mpx))
            if (isFavorite) OwnTVIcon(OwnTVIcon.FAVORITE, stageAccent.accent, Modifier.size(22.mpx), filled = true)
            mark?.let { StagePlaylistMark(it) }
        }
    }
}

/**
 * `.plate`: the logo, radius 12 (the guide's 10). Transparent logos keep their transparency; only one
 * that would be unreadable on the dark UI gets a plate ([ChannelLogoTile]). A white plate under every
 * logo made white-ink logos (Sky) vanish.
 */
@Composable
internal fun LivePlate(
    logoUrl: String?,
    width: androidx.compose.ui.unit.Dp,
    height: androidx.compose.ui.unit.Dp,
    radius: androidx.compose.ui.unit.Dp = StageRadii.Plate,
) {
    Box(Modifier.size(width, height).clip(RoundedCornerShape(radius))) {
        ChannelLogoTile(logoUrl = logoUrl, modifier = Modifier.fillMaxSize(), fill = StageColors.ControlFill) {
            OwnTVIcon(OwnTVIcon.LIVE_TV, tint = StageColors.Dim, modifier = Modifier.align(Alignment.Center).size(height * 0.5f))
        }
    }
}

internal fun minutesLeft(p: XtEpgEntry): Long = ((p.stopMs - System.currentTimeMillis()).coerceAtLeast(0) + 59_999) / 60_000

internal fun progressOf(p: XtEpgEntry): Float {
    val span = (p.stopMs - p.startMs).coerceAtLeast(1)
    return ((System.currentTimeMillis() - p.startMs).toFloat() / span).coerceIn(0f, 1f)
}

/** "18:45 – 20:30 · Horror · 2026 · FSK 16": the time range, then only the details the feed carries. */
@Composable
private fun detailsLine(now: XtEpgEntry, details: EpgDetails?): String {
    val formatTime = rememberSystemTimeFormatter()
    val length = details?.lengthMin?.let { stringResource(R.string.player_duration_minutes, it) }
    return (
        listOf(stringResource(R.string.content_live_time_range_plain, formatTime(now.startMs), formatTime(now.stopMs))) +
            details?.categoryList.orEmpty() +
            listOfNotNull(details?.year?.toString(), details?.rating, length)
        ).joinToString(" · ")
}

/**
 * The stage (`cLiveStage`): the preview video (16:9, radius 28) with the LIVE badge, the stream facts
 * and the channel in the lower corner; below it the programme title 42/800, the details line, the
 * progress and time left, the synopsis, and what is on next (accent time) and later. ▶ from the list
 * enters next / later ([scheduleFocus]); OK on one opens it through [onOpenProgramme].
 */
@Composable
internal fun LiveStagePane(
    channel: ChannelEntity?,
    channelName: String?,
    nowNext: EpgNowNext?,
    previewEngine: tv.own.owntv.player.LivePreviewEngine,
    /** Non-null: the pane's channel plays on this mpv player (ExoPlayer could not open it). */
    mpvPlayer: tv.own.owntv.player.OwnTVPlayer? = null,
    showVideo: Boolean,
    singleSessionBlocked: Boolean,
    scheduleFocus: FocusRequester,
    onOpenProgramme: (XtEpgEntry) -> Unit,
    onBackToList: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val previewState by previewEngine.state.collectAsStateWithLifecycle()
    val streamChips by previewEngine.streamChips.collectAsStateWithLifecycle()
    val playing = showVideo && previewState != tv.own.owntv.player.LivePreviewEngine.State.ERROR &&
        previewState != tv.own.owntv.player.LivePreviewEngine.State.IDLE
    val loading = showVideo && previewState == tv.own.owntv.player.LivePreviewEngine.State.LOADING
    // Skeleton until the focused channel has really started: a new channel hides the surface (so the old
    // channel's last frame never mixes with the new one) and shows a soft shimmer, which fades once this
    // channel has loaded and played for a moment.
    var sawLoadingFor by remember { mutableStateOf<Long?>(null) }
    var readyFor by remember { mutableStateOf<Long?>(null) }
    LaunchedEffect(previewState, channel?.id) {
        val id = channel?.id ?: return@LaunchedEffect
        when (previewState) {
            tv.own.owntv.player.LivePreviewEngine.State.LOADING -> { sawLoadingFor = id; readyFor = null }
            tv.own.owntv.player.LivePreviewEngine.State.PLAYING -> {
                // Long enough for the stream to settle into its real picture size: a fast zap otherwise
                // showed the first frames small in a corner before they filled the pane.
                // A new channel's load starts within a moment of the switch and cancels this wait (the
                // effect restarts on LOADING), so only a stream that really goes on playing gets here.
                kotlinx.coroutines.delay(if (sawLoadingFor == id) PictureSettleMs else NoLoadWaitMs)
                // Already playing with no load seen here (back from full screen, where the same stream
                // went on playing): the picture is ready now — waiting for a LOADING that never comes
                // left the skeleton spinning over a channel that could already be heard.
                readyFor = id
            }
            else -> Unit
        }
    }
    val skeleton = showVideo && channel != null && readyFor != channel.id && mpvPlayer == null &&
        previewState != tv.own.owntv.player.LivePreviewEngine.State.ERROR
    val surfaceAlpha by androidx.compose.animation.core.animateFloatAsState(if (skeleton) 0f else 1f, androidx.compose.animation.core.tween(if (skeleton) 0 else tv.own.owntv.ui.theme.MotionPrefs.dur(260)), label = "previewSurface")
    val videoR = 28.mpx
    val videoShadow = tv.own.owntv.ui.theme.stageShadow(0.55f)
    // The last place the preview was is kept when this screen goes: full screen shrinks back into it.
    Column(modifier) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .then(
                    if (tv.own.owntv.features.shell.TvBoxNav) {
                        Modifier.onGloballyPositioned { tv.own.owntv.features.shell.components.TvBoxPanels.previewRect = it.boundsInRoot() }
                    } else Modifier,
                )
                .drawBehind {
                    drawBoxShadow(videoShadow, 80.mpx.toPx(), videoR.toPx(), dy = 30.mpx.toPx())
                }
                .clip(RoundedCornerShape(videoR))
                .background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            // No channel to show (an empty profile): a quiet note instead of a black box.
            if (channel == null && tv.own.owntv.features.shell.TvBoxNav) {
                Box(Modifier.fillMaxSize().background(if (tv.own.owntv.ui.theme.LocalStagePalette.current.isLight) Color(0xFFEDEEF0) else Color(0xFF1E2125)), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.mpx)) {
                        tv.own.owntv.ui.components.OwnTVIcon(tv.own.owntv.ui.components.OwnTVIcon.PLAY_CIRCLE, StageColors.Dim, Modifier.size(44.mpx))
                        Text(stringResource(R.string.content_preview_pick_channel), style = stageText(19, 600), color = StageColors.Muted)
                    }
                }
            }
            if (channel != null) {
                ChannelLogoTile(
                    logoUrl = channel.displayLogoUrl,
                    modifier = Modifier.size(288.mpx),
                    fill = Color.Transparent,
                ) { OwnTVIcon(OwnTVIcon.LIVE_TV, tint = StageColors.Dim, modifier = Modifier.size(56.mpx)) }
            }
            if (mpvPlayer != null && showVideo) tv.own.owntv.player.MpvVideoSurface(player = mpvPlayer, modifier = Modifier.fillMaxSize(), autoFrameRate = false)
            else if (playing) tv.own.owntv.player.ExoPreviewSurface(engine = previewEngine, modifier = Modifier.fillMaxSize().graphicsLayer { alpha = surfaceAlpha })
            if (skeleton) {
                PreviewSkeleton(Modifier.fillMaxSize())
                // TV-box look: the same spinner as the player while the channel opens.
                if (tv.own.owntv.features.shell.TvBoxNav && channel != null) OwnTVSpinner(sizeDp = 36, color = Color.White.copy(alpha = 0.85f))
            }
            else if (loading) OwnTVSpinner(sizeDp = 28)
            // `.shade`: black 72% at the bottom, clear by 42% up — a video-sized gradient, one pass.
            // The shade is for the channel line over a picture; the empty "pick a channel" box has neither.
            if (channel != null) Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.58f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.72f))))
            Box(Modifier.fillMaxSize().drawBehind { drawInnerRing(Color.White.copy(alpha = 0.08f), 1.mpx.toPx(), videoR.toPx()) })
            if (channel != null) {
                if (tv.own.owntv.features.shell.TvBoxNav) {
                    // As Apple TV writes it: one quiet line of grey text on a soft glass capsule —
                    // "Live · 480p · 25 fps · Stereo" — instead of a red badge and boxed chips.
                    val facts = listOf(stringResource(R.string.player_live)) +
                        (if (playing) streamChips.filterNot { it.contains(':') || it.endsWith("Mbps") } else emptyList())
                    // As the player writes them: each fact in a thin white outline, no capsule behind.
                    Row(
                        Modifier.align(Alignment.TopStart).padding(start = 20.mpx, top = 18.mpx),
                        horizontalArrangement = Arrangement.spacedBy(8.mpx),
                    ) {
                        facts.take(4).forEach { fact ->
                            Text(
                                fact.uppercase(), style = stageText(14, 700), color = Color.White.copy(alpha = 0.92f), maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                                modifier = Modifier
                                    .background(Color.Black.copy(alpha = 0.18f), RoundedCornerShape(5.mpx))
                                    .border(1.mpx, Color.White.copy(alpha = 0.7f), RoundedCornerShape(5.mpx))
                                    .padding(horizontal = 8.mpx, vertical = 3.mpx),
                            )
                        }
                    }
                } else Box(Modifier.align(Alignment.TopStart).padding(start = 24.mpx, top = 22.mpx)) { StageLiveBadge(stringResource(R.string.player_live)) }
                if (!tv.own.owntv.features.shell.TvBoxNav && playing && streamChips.isNotEmpty()) {
                    Row(Modifier.align(Alignment.TopEnd).padding(end = 22.mpx, top = 22.mpx), horizontalArrangement = Arrangement.spacedBy(6.mpx)) {
                        // Three facts — quality, frame rate, sound: the
                        // engine's aspect ratio ("16:9") and declared bitrate ("4.2 Mbps") are left out.
                        streamChips.filterNot { it.contains(':') || it.endsWith("Mbps") }.forEach { StageSpecChip(it) }
                    }
                }
                Row(
                    Modifier.align(Alignment.BottomStart).padding(start = 26.mpx, bottom = 22.mpx),
                    horizontalArrangement = Arrangement.spacedBy(14.mpx),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    LivePlate(channel.displayLogoUrl, 64.mpx, 46.mpx)
                    Column {
                        channel.number?.let { Text(it.toString(), style = stageText(15, 600), color = Color(0xFFCFD8D4), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        Text(channelName.orEmpty(), style = stageText(22, 700), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            if (singleSessionBlocked && !playing) {
                Text(
                    stringResource(R.string.content_preview_single_stream),
                    style = stageText(15, 700), color = Color.White,
                    modifier = Modifier.align(Alignment.Center).background(Color.Black.copy(alpha = 0.7f), RoundedCornerShape(8.mpx)).padding(horizontal = 12.mpx, vertical = 6.mpx),
                )
            }
        }
        val now = nowNext?.now
        // Text skeleton while a new channel's programme is being looked up (a second at most).
        var textWait by remember { mutableStateOf(true) }
        LaunchedEffect(channel?.id) { textWait = true; kotlinx.coroutines.delay(1500); textWait = false }
        Column(Modifier.fillMaxWidth().padding(start = 4.mpx, end = 4.mpx, top = 34.mpx)) {
            if (now == null && channel != null && tv.own.owntv.features.shell.TvBoxNav) {
                if (textWait) TextSkeleton()
                else NoGuideCard()
            }
            if (now != null) {
                Text(now.title, style = stageText(42, 800, (-0.5).mpxSp), color = StageColors.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    detailsLine(now, nowNext.nowDetails),
                    style = stageText(19, 400), color = StageColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.mpx, bottom = 16.mpx),
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.mpx)) {
                    StageProgress(progressOf(now), Modifier.weight(1f))
                    Text(timeLeftText(minutesLeft(now)), style = stageText(17, 400).copy(fontFeatureSettings = Tabular), color = StageColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                now.description?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it, style = stageText(19, 400).copy(lineHeight = (19 * 1.55f).mpxSp), color = stageTone(Color(0xFFCCD6D2), StageColors.Body),
                        maxLines = 4, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 18.mpx),
                    )
                }
            }
            val next = nowNext?.next
            val later = nowNext?.upcoming?.firstOrNull()
            // TV-box look: the rest of the evening too, one under the other, scrolling when long.
            val more = if (tv.own.owntv.features.shell.TvBoxNav) nowNext?.upcoming.orEmpty().drop(1).take(6) else emptyList()
            if (next != null) {
                // Next and later one under the other, as a schedule reads.
                Column(
                    Modifier
                        .padding(top = 18.mpx)
                        .offset(x = (-12).mpx)
                        .fillMaxWidth()
                        .heightIn(max = 240.mpx)
                        .verticalScroll(androidx.compose.foundation.rememberScrollState())
                        .focusGroup(),
                    verticalArrangement = Arrangement.spacedBy(2.mpx),
                ) {
                    // ◀ from next goes back to the channel it belongs to, not to whatever lies to the left.
                    LiveScheduleItem(
                        next, accentTime = true, onClick = { onOpenProgramme(next) },
                        modifier = Modifier.focusRequester(scheduleFocus).onPreviewKeyEvent { e ->
                            if (e.type == KeyEventType.KeyDown && e.key == Key.DirectionLeft) { onBackToList(); true } else false
                        },
                    )
                    if (later != null) LiveScheduleItem(later, accentTime = false, onClick = { onOpenProgramme(later) })
                    more.forEach { p -> LiveScheduleItem(p, accentTime = false, onClick = { onOpenProgramme(p) }) }
                }
            }
        }
    }
}

/**
 * One "20:30  Kingdom of the Planet of the Apes" entry under the stage, 18 px. Next has the accent
 * time and full-colour title, later is muted. Focused = FILLED.
 */
@Composable
private fun LiveScheduleItem(p: XtEpgEntry, accentTime: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val formatTime = rememberSystemTimeFormatter()
    val a = stageAccent
    // TV-box look: the whole line is the row, so its focus runs the full width of the pane.
    StageSurface(onClick = onClick, radius = 12.mpx, modifier = if (tv.own.owntv.features.shell.TvBoxNav) modifier.fillMaxWidth() else modifier) { focused ->
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, fontFeatureSettings = Tabular, color = if (focused) tv.own.owntv.ui.theme.stageAccent.onAccent else if (accentTime) a.accent else StageColors.Muted)) {
                    append(formatTime(p.startMs))
                }
                append("  ")
                append(p.title)
            },
            style = stageText(if (tv.own.owntv.features.shell.TvBoxNav) 20 else 18, 400), color = if (focused) tv.own.owntv.ui.theme.stageAccent.onAccent else if (accentTime) StageColors.Text else StageColors.Muted,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 12.mpx, vertical = 6.mpx),
        )
    }
}

/** Scroll only as far as the focused item, plus one row of room, needs (the TV default pins it a third down). */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
internal val edgeScrollSpec = object : androidx.compose.foundation.gestures.BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
        // One row of room kept ahead of the highlight, so the next row is already laid out: a held
        // ▲/▼ otherwise outran the list at the edge and stopped.
        val room = size.coerceAtMost((containerSize - size).coerceAtLeast(0f) / 2f)
        val lead = offset - room
        val trailing = offset + size + room - containerSize
        return when {
            lead >= 0f && trailing <= 0f -> 0f
            lead < 0f || size > containerSize -> lead
            else -> trailing
        }
    }
}

/** A category as the Stage sheet / column shows it: the rail item, its parsed name and its count. */
internal data class LiveCategoryEntry(
    val item: LiveRailItem,
    val label: String,
    val name: ProviderName?,
    val icon: OwnTVIcon?,
    val count: Int?,
    val mark: PlaylistMark?,
)

/**
 * Live TV's category list as the sheet and column draw it — the fixed entries with their icons, the
 * provider groups parsed into name and tags — and the "GROUPS · DE" heading above the groups. The TV
 * Guide's category sheet is this same list.
 */
@Composable
internal fun liveCategoryEntries(railItems: List<LiveRailItem>, railCounts: Map<tv.own.owntv.core.live.LiveKey, Int>): Pair<List<LiveCategoryEntry>, String> {
    val recentLabel = stringResource(R.string.content_category_recently_watched)
    val entries = railItems.map { item ->
        val label = if (item.key == tv.own.owntv.core.live.LiveKey.History) recentLabel else item.displayLabel()
        val parsed = if (item.key is tv.own.owntv.core.live.LiveKey.Folder || item.key is tv.own.owntv.core.live.LiveKey.Custom) ProviderTags.parse(label) else null
        LiveCategoryEntry(
            item = item,
            label = parsed?.name ?: label,
            name = parsed,
            icon = when (item.key) {
                tv.own.owntv.core.live.LiveKey.Favorites -> OwnTVIcon.FAVORITE
                tv.own.owntv.core.live.LiveKey.History -> OwnTVIcon.HISTORY
                tv.own.owntv.core.live.LiveKey.Catchup -> OwnTVIcon.REWIND
                tv.own.owntv.core.live.LiveKey.All -> OwnTVIcon.LIVE_TV
                else -> null
            },
            count = railCounts[item.key],
            mark = null,
        )
    }
    val groupCountry = ProviderTags.sharedCountry(entries.mapNotNull { it.name })
    // A group keeps its "UK|" unless the heading below says it for every group.
    val labelled = entries.map { e -> e.name?.let { e.copy(label = ProviderTags.groupLabel(it, groupCountry)) } ?: e }
    val heading = (if (groupCountry != null) stringResource(R.string.content_live_groups_country, groupCountry) else stringResource(R.string.content_live_groups))
        .uppercase(androidx.compose.ui.text.intl.Locale.current.platformLocale)
    return labelled to heading
}

/**
 * The categories: the glass sheet (450 wide, radius 32, "Categories · Live TV") or the flat
 * column (the Movies column). Search, the fixed entries with icons and counts, then
 * "GROUPS · DE" and the provider groups with their tags, counts and playlist marks. The selected
 * category is accent text plus the dot (sheet) or the 4 px bar (column).
 *
 * Focus rules: entering lands on the open category, never a row only browsed;
 * vertical exits are trapped; Right hands focus to the channel list ([onNavigateRight]).
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
internal fun LiveCategories(
    entries: List<LiveCategoryEntry>,
    selectedIndex: Int,
    groupsHeading: String,
    sheet: Boolean,
    listState: LazyListState,
    onSelect: (Int) -> Unit,
    onLongSelect: (Int) -> Unit,
    onNavigateRight: () -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
    focusRowIndex: Int? = null,
    onRowFocused: () -> Unit = {},
    /** Which row has focus as the user moves (Movies / Series: CH± steps from it without selecting). */
    onRowFocus: (Int) -> Unit = {},
    /** The sheet's heading and the line beside it; the TV Guide says "Guide category · Same list as Live TV". */
    sheetTitle: String = stringResource(R.string.content_category_browser_title),
    sheetHint: String = stringResource(R.string.common_nav_live_tv),
    /** The category search, held by the screen's view model so it survives the player (issue: a
     *  search for one of 100 categories was gone on return). Null = kept here, for this composition. */
    searchQuery: String? = null,
    onSearchQueryChange: ((String) -> Unit)? = null,
    /** The category search is being typed in (the player's sheet then leaves ◀ to the text cursor). */
    onSearchEditingChange: (Boolean) -> Unit = {},
    /** A menu of a group is open: nothing may open by itself meanwhile. */
    paused: Boolean = false,
) {
    var localQuery by remember { mutableStateOf("") }
    val query = searchQuery ?: localQuery
    val setQuery: (String) -> Unit = onSearchQueryChange ?: { localQuery = it }
    val visible = remember(entries, query) {
        val q = query.trim()
        if (q.isEmpty()) entries.indices.toList() else entries.indices.filter { entries[it].label.contains(q, ignoreCase = true) }
    }
    val rowFocusers = remember(visible.size) { List(visible.size) { FocusRequester() } }
    val searchFocus = remember { FocusRequester() }
    val scope = rememberCoroutineScope()
    // CH+/− in the categories changes the selection; the highlight follows it there.
    var hasFocus by remember { mutableStateOf(false) }
    LaunchedEffect(selectedIndex) {
        val pos = visible.indexOf(selectedIndex)
        if (!hasFocus || pos < 0) return@LaunchedEffect
        runCatching { listState.scrollToItem(pos + 1) } // +1: the search field is item 0
        withFrameNanos { }
        runCatching { rowFocusers[pos].requestFocus() }
    }
    LaunchedEffect(focusRowIndex, visible) {
        val target = focusRowIndex ?: return@LaunchedEffect
        visible.indexOf(target).takeIf { it >= 0 }?.let { pos ->
            // A row further than the screen (a CH± jump) is not composed yet: scroll to it first.
            if (!runCatching { rowFocusers[pos].requestFocus() }.getOrDefault(false)) {
                runCatching { listState.scrollToItem(pos + 1) } // +1: the search field is item 0
                withFrameNanos { }
                runCatching { rowFocusers[pos].requestFocus() }
            }
        }
        onRowFocused()
    }
    // The search stays until it is cleared: Back inside the list clears it and returns to the field,
    // so a long filtered list is one press from the top. With no search, Back does what it always did.
    androidx.activity.compose.BackHandler(enabled = hasFocus && query.isNotEmpty()) {
        setQuery("")
        scope.launch {
            runCatching { listState.scrollToItem(0) }
            withFrameNanos { }
            runCatching { searchFocus.requestFocus() }
        }
    }
    // Where the fixed entries end and the provider groups begin (the "GROUPS · DE" heading).
    val firstGroup = entries.indexOfFirst { it.item.key is tv.own.owntv.core.live.LiveKey.Folder || it.item.key is tv.own.owntv.core.live.LiveKey.Custom }
    val rightKey = Modifier.onPreviewKeyEvent { e ->
        if (e.type == KeyEventType.KeyDown && e.key == Key.DirectionRight) { onNavigateRight(); true } else false
    }
    val a = stageAccent
    // TV-box look: focus resting on a group counts down 3, 2, 1 beside it and then opens it, no OK needed.
    var dwellIndex by remember { mutableStateOf<Int?>(null) }
    var okHeld by remember { mutableStateOf(false) }
    val countdown = tv.own.owntv.ui.components.rememberDwellCountdown(
        focusKey = dwellIndex,
        armed = sheet && tv.own.owntv.features.shell.TvBoxNav && dwellIndex != null && dwellIndex != selectedIndex,
        paused = paused || okHeld,
        quietMs = tv.own.owntv.ui.components.DwellTiming.CategoryQuietMs,
        stepMs = tv.own.owntv.ui.components.DwellTiming.StepMs,
        onFire = { dwellIndex?.let(onSelect) },
    )
    androidx.compose.runtime.CompositionLocalProvider(tv.own.owntv.ui.stage.LocalWhiteFocus provides (sheet && tv.own.owntv.features.shell.TvBoxNav)) {
    Column(
        modifier
            .then(
                when {
                    // TV-box style: a full-height strip of the screen's own grey, not a floating card.
                    sheet && tv.own.owntv.features.shell.TvBoxNav -> Modifier.background(if (tv.own.owntv.ui.theme.LocalStagePalette.current.isLight) tv.own.owntv.features.shell.components.TvBoxPanelLight else androidx.compose.ui.graphics.Color(0xFF232629), tv.own.owntv.features.shell.components.TvBoxEdgeShape)
                        // The page's own colour, set off from the screen by a hairline on its open side.
                        .drawBehind { drawRect(androidx.compose.ui.graphics.Color(0x14000000), topLeft = androidx.compose.ui.geometry.Offset(drawContext.size.width - 1.mpx.toPx(), 0f), size = androidx.compose.ui.geometry.Size(1.mpx.toPx(), drawContext.size.height)) }.padding(horizontal = 16.mpx, vertical = 30.mpx)
                    sheet -> Modifier.stageGlass(StageRadii.Sheet, overContent = true).padding(horizontal = 16.mpx, vertical = 26.mpx)
                    else -> Modifier
                },
            ),
    ) {
        if (sheet) {
            Row(
                Modifier.fillMaxWidth().padding(start = 14.mpx, end = 14.mpx, bottom = 16.mpx),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(sheetTitle, style = stageText(26, 800), color = StageColors.Text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (!tv.own.owntv.features.shell.TvBoxNav) Text(sheetHint, style = stageText(17, 400), color = StageColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 16.mpx))
            }
        }
        // Edge-only scrolling, as the channel list (no double step on ▼).
        androidx.compose.runtime.CompositionLocalProvider(androidx.compose.foundation.gestures.LocalBringIntoViewSpec provides edgeScrollSpec) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
                .onFocusChanged { hasFocus = it.hasFocus }
                .focusProperties {
                    onEnter = {
                        val pos = visible.indexOf(selectedIndex)
                        val target = if (pos in rowFocusers.indices) rowFocusers[pos] else searchFocus
                        if (!runCatching { target.requestFocus() }.getOrDefault(false)) {
                            scope.launch {
                                runCatching { listState.scrollToItem(if (pos >= 0) pos + 1 else 0) }
                                withFrameNanos { }
                                runCatching { target.requestFocus() }
                            }
                        }
                    }
                }
                .trapVerticalFocusExit()
                .focusGroup(),
            // Room for the 2 px outer focus ring, which the list would otherwise clip.
            contentPadding = PaddingValues(start = 4.mpx, end = 4.mpx, top = 4.mpx, bottom = 8.mpx),
        ) {
            // TV-box look: a search field only where there are enough groups to need one.
            if (!tv.own.owntv.features.shell.TvBoxNav || entries.size > CategorySearchMin || query.isNotEmpty()) item(key = "__search__") {
                StageSearchField(
                    query = query,
                    onQueryChange = setQuery,
                    placeholder = stringResource(R.string.content_search_categories).trimEnd('…'),
                    onEditingChange = onSearchEditingChange,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = if (sheet) 8.mpx else 0.mpx, end = if (sheet) 8.mpx else 0.mpx, bottom = if (sheet) 14.mpx else 16.mpx)
                        .focusRequester(searchFocus)
                        .then(if (query.isEmpty()) rightKey else Modifier),
                    height = if (sheet) 54.mpx else 48.mpx,
                    radius = if (sheet) 16.mpx else 15.mpx,
                    horizontalPadding = if (sheet) 16.mpx else 18.mpx,
                )
            }
            visible.forEachIndexed { pos, index ->
                val entry = entries[index]
                if (index == firstGroup && query.isBlank()) {
                    item(key = "__groups__") {
                        if (sheet) StageGroupLabel(groupsHeading, sheet = true)
                        else Text(
                            groupsHeading, style = stageText(12.5f, 800, 0.13.em), color = StageColors.Dim, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = 14.mpx, top = 8.mpx, bottom = 8.mpx),
                        )
                    }
                }
                item(key = entry.item.key.toString()) {
                    val rowModifier = Modifier.focusRequester(rowFocusers[pos]).then(rightKey).then(Modifier.reportOkHeld { okHeld = it })
                        .onFocusChanged {
                            if (it.hasFocus) { onRowFocus(index); dwellIndex = index } else if (dwellIndex == index) dwellIndex = null
                        }
                    val selected = index == selectedIndex
                    val counting = countdown > 0 && dwellIndex == index
                    if (sheet) {
                        StageSheetItem(
                            text = entry.label,
                            onClick = { onSelect(index) },
                            // TV-box look: every group carries the TV mark, so the list reads as channel groups.
                            icon = entry.icon ?: if (tv.own.owntv.features.shell.TvBoxNav) tv.own.owntv.ui.components.OwnTVIcon.LIVE_TV else null,
                            count = if (counting) null else entry.count?.let { tv.own.owntv.ui.components.formatCount(it) },
                            selected = selected,
                            maxLines = 2,
                            tags = if (entry.name?.tags.isNullOrEmpty()) null else { focused ->
                                entry.name.tags.forEach { StageTag(it, onAccent = if (focused) tv.own.owntv.ui.theme.stageAccent.onAccent else null) }
                            },
                            trailing = if (counting) { _ -> tv.own.owntv.ui.components.CountdownRing(countdown, tv.own.owntv.ui.components.DwellTiming.CategoryTotalMs) } else entry.mark?.let { m -> { _ -> StagePlaylistMark(m) } },
                            onLongClick = { onLongSelect(index) },
                            modifier = rowModifier,
                        )
                    } else {
                        LiveColumnItem(entry, selected, onClick = { onSelect(index) }, onLongClick = { onLongSelect(index) }, modifier = rowModifier)
                    }
                }
            }
        }
        }
    }
    }
}

/**
 * `.fcat` (the Separate column): 52 high, radius 15, 18.5/600, gap 12, 2 px between rows; the
 * selected one is accent text with the 4 px glowing bar at its left edge; one tag, the count 15/700
 * dim, and the playlist's 7 px dot. Focused = FILLED.
 */
@Composable
private fun LiveColumnItem(
    entry: LiveCategoryEntry,
    selected: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val a = stageAccent
    StageSurface(
        onClick = onClick,
        onLongClick = onLongClick,
        radius = 15.mpx,
        modifier = modifier.fillMaxWidth().padding(bottom = 2.mpx).heightIn(min = 52.mpx)
            .then(if (selected) Modifier.stageSelectedBar(a.accent, 14.mpx) else Modifier),
    ) { focused ->
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.mpx, vertical = 7.mpx),
            horizontalArrangement = Arrangement.spacedBy(12.mpx),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val on = if (focused) tv.own.owntv.ui.theme.stageAccent.onAccent else null
            entry.icon?.let { OwnTVIcon(it, on ?: StageColors.Muted, Modifier.size(20.mpx)) }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.mpx)) {
                Text(
                    entry.label, style = stageText(18.5f, 600),
                    color = on ?: if (selected) a.accent else stageTone(Color(0xFFCDD7D3), StageColors.ItemText),
                    maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                // Tags on their own line, so a long name is never cut for them.
                val tags = entry.name?.tags.orEmpty()
                if (tags.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.mpx)) { tags.forEach { StageTag(it, onAccent = on) } }
            }
            entry.count?.let { Text(tv.own.owntv.ui.components.formatCount(it), style = stageText(15, 700), color = on ?: StageColors.Dim, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            entry.mark?.let { m -> Box(Modifier.size(7.mpx).background(m.shownColor, RoundedCornerShape(50))) }
        }
    }
}

/** The preview's placeholder while a channel starts: a dark card with a slow, soft light sweep. Cheap: one brush. */
@Composable
private fun PreviewSkeleton(modifier: Modifier) {
    // On a weak TV the placeholder stands still: a sweeping light redraws the picture's area every frame.
    val sweep = if (tv.own.owntv.ui.theme.DevicePerf.lite) 2f else androidx.compose.animation.core.rememberInfiniteTransition(label = "skeleton").animateFloat(
        initialValue = -1f, targetValue = 2f,
        animationSpec = androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween<Float>(1300, easing = androidx.compose.animation.core.LinearEasing)),
        label = "skeletonSweep",
    ).value
    Box(
        modifier
            .background(SkeletonBase)
            .drawBehind {
                val w = size.width
                val x = sweep * w
                drawRect(
                    Brush.linearGradient(
                        0f to Color.Transparent, 0.5f to Color.White.copy(alpha = 0.07f), 1f to Color.Transparent,
                        start = androidx.compose.ui.geometry.Offset(x - w * 0.4f, 0f),
                        end = androidx.compose.ui.geometry.Offset(x + w * 0.4f, size.height),
                    ),
                )
            },
    )
}

private val SkeletonBase = Color(0xFF1A1C1F)

/** Bars standing in for the programme's title, time and synopsis while they load. */
@Composable
private fun TextSkeleton() {
    val pulse by androidx.compose.animation.core.rememberInfiniteTransition(label = "textSkeleton").animateFloat(
        initialValue = 0.05f, targetValue = 0.11f,
        animationSpec = androidx.compose.animation.core.infiniteRepeatable(
            androidx.compose.animation.core.tween<Float>(900), androidx.compose.animation.core.RepeatMode.Reverse,
        ),
        label = "textSkeletonPulse",
    )
    val bar = StageColors.Text.copy(alpha = pulse)
    Column(verticalArrangement = Arrangement.spacedBy(14.mpx)) {
        Box(Modifier.fillMaxWidth(0.7f).height(40.mpx).background(bar, RoundedCornerShape(10.mpx)))
        Box(Modifier.fillMaxWidth(0.25f).height(16.mpx).background(bar, RoundedCornerShape(8.mpx)))
        Box(Modifier.fillMaxWidth().height(6.mpx).background(bar, RoundedCornerShape(3.mpx)))
        Box(Modifier.fillMaxWidth(0.95f).height(14.mpx).background(bar, RoundedCornerShape(7.mpx)))
        Box(Modifier.fillMaxWidth(0.8f).height(14.mpx).background(bar, RoundedCornerShape(7.mpx)))
    }
}

/** A channel with no programme guide: a short note at the top, then three quiet bars where the
 *  programme, time and synopsis would be — the layout keeps its shape instead of going blank. */
@Composable
private fun NoGuideCard() {
    val bar = StageColors.Text.copy(alpha = 0.06f)
    Column(verticalArrangement = Arrangement.spacedBy(14.mpx)) {
        Text(stringResource(R.string.content_no_guide), style = stageText(22, 700), color = StageColors.Muted, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        Box(Modifier.fillMaxWidth(0.45f).height(16.mpx).background(bar, RoundedCornerShape(8.mpx)))
        Box(Modifier.fillMaxWidth().height(14.mpx).background(bar, RoundedCornerShape(7.mpx)))
        Box(Modifier.fillMaxWidth(0.75f).height(14.mpx).background(bar, RoundedCornerShape(7.mpx)))
    }
}

/** The hairline between channel rows. */
private val RowLine = Color(0x14000000)

/** Channel rows standing in while the list loads. */
@Composable
internal fun ChannelListSkeleton(modifier: Modifier = Modifier) {
    val pulse by androidx.compose.animation.core.rememberInfiniteTransition(label = "listSkeleton").animateFloat(
        initialValue = 0.05f, targetValue = 0.10f,
        animationSpec = androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween<Float>(900), androidx.compose.animation.core.RepeatMode.Reverse),
        label = "listSkeletonPulse",
    )
    val bar = StageColors.Text.copy(alpha = pulse)
    Column(modifier) {
        repeat(8) {
            Row(Modifier.fillMaxWidth().height(84.mpx).padding(horizontal = 20.mpx), horizontalArrangement = Arrangement.spacedBy(18.mpx), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(40.mpx).height(16.mpx).background(bar, RoundedCornerShape(8.mpx)))
                Box(Modifier.size(76.mpx, 54.mpx).background(bar, RoundedCornerShape(12.mpx)))
                Column(verticalArrangement = Arrangement.spacedBy(8.mpx)) {
                    Box(Modifier.width(220.mpx).height(18.mpx).background(bar, RoundedCornerShape(9.mpx)))
                    Box(Modifier.width(300.mpx).height(12.mpx).background(bar, RoundedCornerShape(6.mpx)))
                }
            }
        }
    }
}

/** A profile with no channels: a calm message in the middle of the list. */
@Composable
internal fun NoChannelsNote(text: String, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.mpx)) {
        tv.own.owntv.ui.components.OwnTVIcon(tv.own.owntv.ui.components.OwnTVIcon.LIVE_TV, StageColors.Dim, Modifier.size(48.mpx))
        Text(text, style = stageText(22, 600), color = StageColors.Muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/** Below this many entries the categories need no search field. */
private const val CategorySearchMin = 20

/** After the first picture: long enough for the stream to settle into its real size, short enough not to feel slow. */
private const val PictureSettleMs = 250L

/** Playing with no load seen: how long to wait for one before taking the stream as this channel's. */
private const val NoLoadWaitMs = 700L
