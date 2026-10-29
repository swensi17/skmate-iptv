package tv.own.owntv.features.shell.components

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import tv.own.owntv.R
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.epg.displayLogoUrl
import tv.own.owntv.core.live.EpgNowNext
import tv.own.owntv.core.parser.XtEpgEntry
import tv.own.owntv.ui.brand.SkMateBlue
import tv.own.owntv.ui.components.ChannelLogoTile
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.format.rememberSystemTimeFormatter
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/**
 * Where the picture sits while the player's channel panel is open: top right, beside the two columns.
 * In design pixels (1920 wide); the shell lays the video out here and the panel puts its card under it.
 */
object TvBoxDock {
    val Left: Dp = 680.mpx
    val Top: Dp = 36.mpx
    val Radius: Dp = 14.mpx

    /** The picture's width on a screen [screenWidth] wide: all the room right of the list (and of the
     *  categories, [inset], when they are open beside it). */
    fun width(screenWidth: Dp, inset: Dp = 0.mpx): Dp = screenWidth - Left - inset - 36.mpx
    fun height(screenWidth: Dp, inset: Dp = 0.mpx): Dp = width(screenWidth, inset) * 9f / 16f
}

/**
 * The TV-box player's channel panel (◀ for the category, ▶ for history): dark glass columns over the
 * picture, which shrinks into [TvBoxDock]. Left, the channels with what is on; in the middle, the guide
 * of the focused channel; right, under the picture, what the playing channel is showing. OK watches.
 */
@Composable
fun TvBoxChannelPanel(
    channels: List<ChannelEntity>,
    currentId: Long?,
    title: String,
    nowProgrammes: Map<Long, XtEpgEntry>,
    scheduleFor: suspend (ChannelEntity) -> EpgNowNext?,
    playingGuide: EpgNowNext?,
    onSelect: (ChannelEntity) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    watchedAt: Map<Long, Long>? = null,
    onOpenCategories: (() -> Unit)? = null,
    /** Focus resting on a channel: show it in the picture above the guide (the channel list, not history). */
    onPreview: ((ChannelEntity) -> Unit)? = null,
    /** Room on the left for the categories column; the panel moves right by it. */
    inset: Dp = 0.mpx,
    /** False while the categories beside it have focus: the panel shows, but takes no keys or focus. */
    active: Boolean = true,
    /** The picture is opening a channel: a spinner in the middle of the picture's window. */
    loading: Boolean = false,
    /** How far the picture has moved into its corner (0 = full screen, 1 = docked): the window follows it. */
    dockProgress: () -> Float = { 1f },
) {
    val formatTime = rememberSystemTimeFormatter()
    val c = tvBoxPanelColors()
    val Soft = c.soft
    val Faint = c.faint
    val playingIndex = remember(channels, currentId) { channels.indexOfFirst { it.id == currentId } }
    // Focus is kept by channel, not by row: previewing a channel can rebuild the list around it, and a
    // row number would then point at another channel.
    var focusedId by remember { mutableStateOf(currentId) }
    val focusedIndex = remember(channels, focusedId) { channels.indexOfFirst { it.id == focusedId }.coerceAtLeast(0) }
    val listState = rememberLazyListState()
    val firstFocus = remember { FocusRequester() }
    // Back from the categories: the channel being watched again, not wherever the list was left.
    LaunchedEffect(active) { if (active && currentId != null) focusedId = currentId }
    LaunchedEffect(channels, active) {
        // Only scroll when the focused row is off screen: the list re-emits as programmes load.
        val visible = listState.layoutInfo.visibleItemsInfo.any { it.index == focusedIndex }
        if (!visible) runCatching { listState.scrollToItem((focusedIndex - 3).coerceAtLeast(0)) }
        if (!active) return@LaunchedEffect
        delay(16)
        runCatching { firstFocus.requestFocus() }
    }
    BackHandler(enabled = active) { onDismiss() }
    val focused = channels.getOrNull(focusedIndex)
    // The middle column follows focus once it rests, so holding ▼ does not read the guide for every row.
    val schedule by produceState<EpgNowNext?>(null, focused?.id) {
        val ch = focused ?: return@produceState
        delay(ScheduleSettleMs)
        value = scheduleFor(ch)
    }
    // Focus resting on another channel counts down 3, 2, 1 beside it, then shows it in the picture: the same rule
    // as the categories (see rememberDwellCountdown), only a shorter quiet moment.
    val countdown = tv.own.owntv.ui.components.rememberDwellCountdown(
        focusKey = focused?.id,
        armed = active && focused != null && focused.id != currentId && onPreview != null,
        paused = false,
        quietMs = tv.own.owntv.ui.components.DwellTiming.ChannelQuietMs,
        stepMs = tv.own.owntv.ui.components.DwellTiming.StepMs,
        onFire = { focused?.let { onPreview?.invoke(it) } },
    )
    val now = System.currentTimeMillis()
    androidx.compose.foundation.layout.BoxWithConstraints(modifier.fillMaxSize()) {
        val screenW = maxWidth
        // Dark over everything but the picture's corner, which stays a clear window onto the video.
        val dockW = TvBoxDock.width(screenW, inset)
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer { compositingStrategy = androidx.compose.ui.graphics.CompositingStrategy.Offscreen }
                .drawBehind {
                    // The clear window travels with the picture, from the whole screen into the corner,
                    // so the picture is seen shrinking, not jumping inside a fixed frame.
                    val t = dockProgress()
                    fun lerp(a: Float, b: Float) = a + (b - a) * t
                    drawRect(c.fill.copy(alpha = c.fill.alpha * t))
                    val left = lerp(0f, (TvBoxDock.Left + inset).toPx())
                    val top = lerp(0f, TvBoxDock.Top.toPx())
                    drawRoundRect(
                        Color.Transparent,
                        topLeft = Offset(left, top),
                        size = Size(lerp(size.width, dockW.toPx()), lerp(size.height, (dockW * 9f / 16f).toPx())),
                        // Softly rounded: the panel covers the picture's square corners.
                        cornerRadius = CornerRadius(TvBoxDock.Radius.toPx() * t),
                        blendMode = androidx.compose.ui.graphics.BlendMode.Clear,
                    )
                },
        )
        if (loading) {
            Box(
                Modifier.padding(start = TvBoxDock.Left + inset, top = TvBoxDock.Top).size(dockW, dockW * 9f / 16f),
                contentAlignment = Alignment.Center,
            ) { tv.own.owntv.ui.components.OwnTVSpinner(sizeDp = 44, color = Color.White.copy(alpha = 0.9f)) }
        }
        Row(Modifier.fillMaxHeight().padding(start = inset)) {
            // Channels.
            Column(
                Modifier.width(ListWidth).fillMaxHeight()
                    .onPreviewKeyEvent { e ->
                        if (!active) false
                        else if (e.type == KeyEventType.KeyDown && e.key == Key.DirectionLeft) {
                            if (onOpenCategories != null) onOpenCategories() else onDismiss()
                            true
                        } else if (e.type == KeyEventType.KeyDown && e.key == Key.DirectionRight) true else false
                    }
                    .padding(top = 36.mpx),
            ) {
                Text(title, style = stageText(24, 700), color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 28.mpx))
                @OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
                androidx.compose.runtime.CompositionLocalProvider(androidx.compose.foundation.gestures.LocalBringIntoViewSpec provides tv.own.owntv.features.live.edgeScrollSpec) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxWidth().weight(1f).padding(top = 14.mpx),
                    contentPadding = PaddingValues(start = 12.mpx, end = 12.mpx, bottom = 24.mpx),
                    verticalArrangement = Arrangement.spacedBy(4.mpx),
                ) {
                    itemsIndexed(channels, key = { _, ch -> ch.id }) { index, ch ->
                        ChannelLine(
                            channel = ch,
                            now = nowProgrammes[ch.id]?.takeIf { now in it.startMs until it.stopMs },
                            playing = index == playingIndex,
                            trailing = watchedAt?.get(ch.id)?.let { if (index == playingIndex) null else formatTime(it) },
                            nowMs = now,
                            countdown = if (ch.id == focusedId) countdown else 0,
                            onFocus = { focusedId = ch.id },
                            onClick = { onSelect(ch) },
                            modifier = if (index == focusedIndex) Modifier.focusRequester(firstFocus) else Modifier,
                        )
                    }
                }
                }
            }
        }
        // Under the picture: the focused channel and its guide, the width of the picture.
        Column(
            Modifier.padding(start = TvBoxDock.Left + inset, top = TvBoxDock.Top + TvBoxDock.height(screenW, inset) + 24.mpx)
                .width(dockW).fillMaxHeight(),
        ) {
            if (focused != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.mpx), verticalAlignment = Alignment.CenterVertically) {
                    Logo(focused, 68.mpx, 48.mpx)
                    focused.number?.let { Text(it.toString(), style = stageText(24, 700), color = Soft, maxLines = 1) }
                    Text(focused.name, style = stageText(24, 700), color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                val entries = schedule?.let { g -> listOfNotNull(g.previous, g.now) + listOfNotNull(g.next) + g.upcoming }
                    ?.distinctBy { it.startMs }?.sortedBy { it.startMs }.orEmpty()
                if (entries.isEmpty()) {
                    Text(stringResource(R.string.content_no_guide_short), style = stageText(21, 500), color = Faint, modifier = Modifier.padding(top = 22.mpx))
                } else {
                    Column(Modifier.padding(top = 14.mpx)) {
                        entries.take(MaxScheduleRows).forEach { p ->
                            val onAir = now in p.startMs until p.stopMs
                            val past = p.stopMs <= now
                            val tint = if (onAir) SkMateBlue else if (past) Faint else c.text
                            Row(Modifier.fillMaxWidth().height(50.mpx), horizontalArrangement = Arrangement.spacedBy(20.mpx), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    stringResource(R.string.content_live_time_range_plain, formatTime(p.startMs), formatTime(p.stopMs)),
                                    style = stageText(21, 600), color = if (onAir) SkMateBlue else if (past) Faint else Soft, maxLines = 1,
                                )
                                Text(p.title, style = stageText(21, if (onAir) 700 else 500), color = tint, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                if (onAir) {
                                    // What is on: a long bar level with the line, and how much of it is left.
                                    Bar(((now - p.startMs).toFloat() / (p.stopMs - p.startMs).coerceAtLeast(1)).coerceIn(0f, 1f), 240.mpx, thick = true, base = c.text)
                                    Text(
                                        stringResource(R.string.home_time_left, durationLeft(p.stopMs - now)),
                                        style = stageText(19, 600), color = Soft, maxLines = 1,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** One channel: logo, number and name, what is on with a short bar; white when focused, a blue mark when playing. */
@Composable
private fun ChannelLine(
    channel: ChannelEntity,
    now: XtEpgEntry?,
    playing: Boolean,
    trailing: String?,
    nowMs: Long,
    countdown: Int,
    onFocus: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused = interaction.collectIsFocusedAsState().value
    val c = tvBoxPanelColors()
    val ink = if (focused) c.focusInk else c.text
    val soft = if (focused) c.focusInk.copy(alpha = 0.62f) else c.faint
    Row(
        modifier
            .fillMaxWidth()
            .height(92.mpx)
            .background(if (focused) c.focus else Color.Transparent, tv.own.owntv.ui.stage.FocusBarShape)
            .onFocusChanged { if (it.isFocused) onFocus() }
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 16.mpx),
        horizontalArrangement = Arrangement.spacedBy(16.mpx),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Logo(channel, 72.mpx, 52.mpx)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.mpx)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.mpx)) {
                channel.number?.let { Text(it.toString(), style = stageText(20, 700), color = soft, maxLines = 1) }
                // The channel being watched: its name in brand blue, nothing else.
                Text(channel.name, style = stageText(20, 700), color = if (playing) SkMateBlue else ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (now != null) {
                Text(now.title, style = stageText(16, 500), color = soft, maxLines = 1, overflow = TextOverflow.Ellipsis)
                // The same thin line as the channels list: blue, the whole width, running out as the programme does.
                tv.own.owntv.ui.stage.StageProgress(((nowMs - now.startMs).toFloat() / (now.stopMs - now.startMs).coerceAtLeast(1)).coerceIn(0f, 1f), Modifier.fillMaxWidth(), flat = true)
            } else {
                Text(stringResource(R.string.content_no_guide_short), style = stageText(16, 500), color = soft, maxLines = 1)
            }
        }
        if (countdown > 0) tv.own.owntv.ui.components.CountdownRing(countdown, tv.own.owntv.ui.components.DwellTiming.CategoryTotalMs, diameter = 32.mpx)
        else if (playing) tv.own.owntv.ui.components.PlayingMark()
        else if (trailing != null) Text(trailing, style = stageText(15, 500), color = soft, maxLines = 1)
    }
}

/** Minutes left, as the rest of the app says it. */
@Composable
private fun durationLeft(ms: Long): String =
    stringResource(R.string.player_duration_minutes, (ms / 60_000L).toInt().coerceAtLeast(0))

@Composable
private fun Logo(channel: ChannelEntity, w: Dp, h: Dp) {
    ChannelLogoTile(
        logoUrl = channel.displayLogoUrl,
        modifier = Modifier.size(w, h),
        fill = Color.Transparent,
    ) { OwnTVIcon(OwnTVIcon.LIVE_TV, tvBoxPanelColors().faint, Modifier.size(24.mpx)) }
}

@Composable
private fun Bar(progress: Float, width: Dp, base: Color, thick: Boolean = false) {
    Box(
        Modifier.width(width).height(if (thick) 6.mpx else 4.mpx).drawBehind {
            val r = CornerRadius(size.height / 2)
            drawRoundRect(base.copy(alpha = 0.22f), cornerRadius = r)
            drawRoundRect(base, size = Size(size.width * progress, size.height), cornerRadius = r)
        },
    )
}

private val ListWidth = 640.mpx
/** The player panels' colours: dark glass in the dark theme, light glass in the light one. */
internal data class TvBoxPanelColors(val fill: Color, val text: Color, val soft: Color, val faint: Color, val focus: Color, val focusInk: Color, val line: Color)

@Composable
internal fun tvBoxPanelColors(): TvBoxPanelColors =
    if (tv.own.owntv.ui.theme.LocalStagePalette.current.isLight) {
        TvBoxPanelColors(Color(0xF2EEF1F4), Color(0xFF16181D), Color(0xCC16181D), Color(0x8C16181D), Color(0xFFDDE0E4), Color(0xFF16181D), Color(0x1A000000))
    } else {
        TvBoxPanelColors(Color(0xEB0E1013), Color.White, Color.White.copy(alpha = 0.8f), Color.White.copy(alpha = 0.55f), Color(0xFF353A40), Color.White, Color(0x1FFFFFFF))
    }
private const val ScheduleSettleMs = 250L
private const val MaxScheduleRows = 14
