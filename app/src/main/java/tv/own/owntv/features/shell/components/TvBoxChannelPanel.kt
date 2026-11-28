@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package tv.own.owntv.features.shell.components

import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import kotlinx.coroutines.launch
import tv.own.owntv.R
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.epg.displayLogoUrl
import tv.own.owntv.core.live.EpgNowNext
import tv.own.owntv.core.parser.XtEpgEntry
import tv.own.owntv.features.live.LogoCell
import tv.own.owntv.features.live.tableRule
import tv.own.owntv.ui.components.ChannelLogoTile
import tv.own.owntv.ui.components.GuideStatusText
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.components.focusMarquee
import tv.own.owntv.ui.components.marqueeOverflow
import tv.own.owntv.ui.format.rememberSystemTimeFormatter
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/**
 * Where the picture sits while the player's channel panel is open: top right, beside the two columns.
 * In design pixels (1920 wide); the shell lays the video out here and the panel puts its card under it.
 */
object TvBoxDock {
    val Left: Dp = 540.mpx
    val Top: Dp = 36.mpx
    val Radius: Dp = 14.mpx

    /** The picture's width on a screen [screenWidth] wide: all the room right of the list (and of the
     *  categories, [inset], when they are open beside it). */
    // Never below zero: laid out for a frame at almost no width (a panel opening over the player), the
    // padding built from it went negative and Compose threw.
    fun width(screenWidth: Dp, inset: Dp = 0.mpx): Dp = (screenWidth - Left - inset - 36.mpx).coerceAtLeast(0.mpx)
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
    /** The side menu's push: the panel is moved by it from outside; the picture's window narrows by it to stay
     *  on screen, as the picture does. */
    menuShift: Dp = 0.mpx,
    /** False while the categories beside it have focus: the panel shows, but takes no keys or focus. */
    active: Boolean = true,
    /** The picture is opening a channel: a spinner in the middle of the picture's window. */
    loading: Boolean = false,
    /** How far the picture has moved into its corner (0 = full screen, 1 = docked): the window follows it. */
    dockProgress: () -> Float = { 1f },
    /** A channel's aired programmes still in its archive, newest first; null where the panel offers none. */
    archiveFor: (suspend (ChannelEntity) -> List<tv.own.owntv.core.database.entity.EpgProgrammeEntity>)? = null,
    /** OK on an aired programme under the picture: play it from the archive. */
    onPlayArchive: ((ChannelEntity, tv.own.owntv.core.database.entity.EpgProgrammeEntity) -> Unit)? = null,
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
    // The clock the rows' progress bars read. A minute is the finest step they show; reading the time on
    // every recomposition instead handed each visible row a new value on every ▲/▼, and all of them
    // recomposed for a highlight that moved one row (a held key on a slow box stuttered on that).
    val now by produceState(System.currentTimeMillis()) {
        while (true) {
            delay(NOW_TICK_MS - System.currentTimeMillis() % NOW_TICK_MS)
            value = System.currentTimeMillis()
        }
    }
    // The focused channel's guide, and the poster and description of a film or series on it (TMDB).
    val entries = remember(schedule) {
        schedule?.let { g -> listOfNotNull(g.previous, g.now) + listOfNotNull(g.next) + g.upcoming }
            ?.distinctBy { it.startMs }?.sortedBy { it.startMs }.orEmpty()
    }
    val onAir = entries.firstOrNull { now in it.startMs until it.stopMs }
    val art = tv.own.owntv.ui.components.rememberProgrammeArt(onAir?.title)
    // ▶ from the list steps onto the poster: OK shows it over the whole screen, ▲ ▼ move through the guide under it.
    val posterFocus = remember { FocusRequester() }
    // The archive of a channel that keeps one: its aired programmes above what is on, each one OK to watch.
    val archive by produceState(emptyList<tv.own.owntv.core.database.entity.EpgProgrammeEntity>(), focused?.id) {
        value = emptyList()
        val ch = focused?.takeIf { it.catchup } ?: return@produceState
        val read = archiveFor ?: return@produceState
        delay(ScheduleSettleMs)
        value = runCatching { read(ch) }.getOrDefault(emptyList())
    }
    val lines = remember(entries, archive) { scheduleLines(entries, archive, System.currentTimeMillis()) }
    // ▶ on a channel: its guide where the list is, the same panel as on the channels screen; ◀ brings the list back.
    var sideFor by remember { mutableStateOf<ChannelEntity?>(null) }
    // The remote is in the programme column (after ▶ or a held OK); otherwise the column only follows the list.
    var inSide by remember { mutableStateOf(false) }
    // The programme the remote rests on in the guide: the card under the picture shows it.
    var picked by remember { mutableStateOf<XtEpgEntry?>(null) }
    // Settings › Player: the three columns, or the panel as it was (the guide only on ▶).
    val threeColumns by org.koin.compose.koinInject<tv.own.owntv.core.settings.SettingsRepository>()
        .playerPanelColumns.collectAsStateWithLifecycle(true)
    // Back from the categories beside the guide: focus into the guide again, after the list has taken it.
    var sideRefocus by remember { mutableIntStateOf(0) }
    LaunchedEffect(active) {
        if (active && sideFor != null) {
            delay(SIDE_REFOCUS_MS)
            sideRefocus++
        }
    }
    // The picture beside steps right and narrows while the guide is open (the shell moves the video the same way).
    // Three columns keep the picture's size whatever the guide does: a resize blanked the video for a moment.
    LaunchedEffect(sideFor != null, threeColumns, inset > 1.mpx) { TvBoxPanels.guideOpen = inset <= 1.mpx && (threeColumns || sideFor != null) }
    androidx.compose.runtime.DisposableEffect(Unit) { onDispose { TvBoxPanels.guideOpen = false } }
    val guideShift by androidx.compose.animation.core.animateDpAsState(
        if (inset <= 1.mpx && (threeColumns || sideFor != null)) TvBoxGuideDockShift else 0.mpx,
        androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.slideMs(tv.own.owntv.features.live.GUIDE_SLIDE_MS)),
        label = "panelGuideShift",
    )
    // As on the channels screen: with the remote in the programme the list steps back to its logos.
    val squeeze by androidx.compose.animation.core.animateDpAsState(
        if (threeColumns && inSide) (ListWidth - PANEL_LOGOS.mpx).coerceAtLeast(0.mpx) else 0.mpx,
        androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.slideMs(tv.own.owntv.features.live.GUIDE_SLIDE_MS)),
        label = "panelListSqueeze",
    )
    val onAirFocus = remember { FocusRequester() }
    var bigPoster by remember { mutableStateOf<tv.own.owntv.core.metadata.ProgrammeArt?>(null) }
    // The block under the picture follows focus once it rests, like the guide: a held ▼ would otherwise
    // load a logo and lay out a name for every row it passes.
    var shown by remember { mutableStateOf(focused) }
    LaunchedEffect(focused?.id) {
        if (shown != null) delay(HEADER_SETTLE_MS)
        shown = focused
    }
    // Three columns, as the viewers asked: the programme of the channel under the cursor stands beside the list.
    // Categories open beside the list take the room: the programme column steps aside, the picture keeps its size.
    val besideCategories = inset > 1.mpx
    LaunchedEffect(shown?.id, threeColumns, besideCategories) {
        when {
            threeColumns && besideCategories -> { sideFor = null; inSide = false }
            threeColumns && !inSide -> shown?.let { sideFor = it }
        }
    }
    androidx.compose.foundation.layout.BoxWithConstraints(modifier.fillMaxSize()) {
        val screenW = maxWidth
        // Dark over everything but the picture's corner, which stays a clear window onto the video.
        val dockW = TvBoxDock.width(screenW, inset + menuShift + guideShift)
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer { compositingStrategy = androidx.compose.ui.graphics.CompositingStrategy.Offscreen }
                .drawBehind {
                    // The clear window travels with the picture, from the whole screen into the corner,
                    // so the picture is seen shrinking, not jumping inside a fixed frame.
                    val t = dockProgress()
                    fun lerp(a: Float, b: Float) = a + (b - a) * t
                    drawRect(c.fill.copy(alpha = c.fill.alpha * t))
                    val left = lerp(0f, (TvBoxDock.Left + inset + guideShift).toPx())
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
                Modifier
                    .padding(start = (TvBoxDock.Left + inset + guideShift).coerceAtLeast(0.mpx), top = TvBoxDock.Top)
                    .size(dockW, dockW * 9f / 16f),
                contentAlignment = Alignment.Center,
            ) { tv.own.owntv.ui.components.OwnTVSpinner(sizeDp = 44, color = Color.White.copy(alpha = 0.9f)) }
        }
        Row(Modifier.fillMaxHeight().padding(start = inset.coerceAtLeast(0.mpx))) {
            // Channels.
            Column(
                Modifier.width(ListWidth - squeeze).fillMaxHeight()
                    .onPreviewKeyEvent { e ->
                        if (!active) false
                        else if (e.type == KeyEventType.KeyDown && e.key == Key.DirectionLeft) {
                            if (onOpenCategories != null) onOpenCategories() else onDismiss()
                            true
                        } else if (e.type == KeyEventType.KeyDown && (
                                (e.key == Key.DirectionDown && focusedIndex >= channels.lastIndex) ||
                                    (e.key == Key.DirectionUp && focusedIndex <= 0)
                                )
                        ) {
                            // The list's ends are walls: never out of it into the programme or the picture.
                            true
                        } else if (e.type == KeyEventType.KeyDown && e.key == Key.DirectionRight) {
                            // A list still loading has no channel to show the guide of: the key waits.
                            focused?.let { sideFor = it; inSide = true; sideRefocus++ }
                            true
                        } else false
                    }
                    .padding(top = 36.mpx),
            ) {
                Text(title, style = stageText(24, 700), color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 28.mpx))
                @OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
                androidx.compose.runtime.CompositionLocalProvider(androidx.compose.foundation.gestures.LocalBringIntoViewSpec provides tv.own.owntv.features.live.edgeScrollSpec) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxWidth().weight(1f).padding(top = 14.mpx),
                    // The rows span the column from edge to edge, as every list does; their content keeps its place.
                    contentPadding = PaddingValues(bottom = 24.mpx),
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
                            // Held OK: the channel's programme and archive beside the list, as ▶ opens it.
                            onLongClick = { sideFor = ch; inSide = true; sideRefocus++ },
                            logosOnly = threeColumns && inSide,
                            lit = ch.id == sideFor?.id,
                            modifier = (if (index == focusedIndex) Modifier.focusRequester(firstFocus) else Modifier)
                                .tableRule(index < channels.lastIndex),
                        )
                    }
                }
                }
            }
        }
        // Under the picture: the focused channel, the poster and the guide in one list, so going down the guide
        // carries the channel's name and the poster up out of the way and the programmes get the room.
        Box(
            Modifier.padding(
                start = (TvBoxDock.Left + inset + guideShift).coerceAtLeast(0.mpx),
                top = TvBoxDock.Top + TvBoxDock.height(screenW, inset + menuShift + guideShift) + 24.mpx,
            )
                .width(dockW).fillMaxHeight(),
        ) {
            val head = shown
            // The guide is open on the left: no second schedule here, only the channel, a larger poster with what it
            // is about, and what is on now.
            if (head != null && sideFor != null) {
                if (threeColumns) programmeCard(picked ?: onAir, now, formatTime) else guideCompanion(head, art, onAir, now, formatTime)
            } else if (head != null) {
                val scheduleState = rememberLazyListState()
                val onAirIndex = lines.indexOfFirst { now < it.stopMs }.coerceAtLeast(0)
                // The guide starts at the programme before what is on; ▲ at its top brings earlier ones
                // from the archive.
                var firstShown by remember(head.id, lines.size) {
                    androidx.compose.runtime.mutableIntStateOf((onAirIndex - 1).coerceAtLeast(0))
                }
                val topRowFocus = remember { FocusRequester() }
                var focusTopRow by remember { mutableStateOf(false) }
                val scope = androidx.compose.runtime.rememberCoroutineScope()
                // Rows come after the name, the poster (when there is one) and a gap.
                val rowsFrom = if (art != null) ROWS_AFTER_ART else ROWS_AFTER_HEAD
                // The line just brought in above is laid out first, then focused: asked while it was still above the
                // list's edge, the request found nothing to focus.
                LaunchedEffect(firstShown) {
                    if (!focusTopRow) return@LaunchedEffect
                    runCatching { scheduleState.scrollToItem((rowsFrom - 1).coerceAtLeast(0)) }
                    androidx.compose.runtime.withFrameNanos { }
                    runCatching { topRowFocus.requestFocus() }
                    focusTopRow = false
                }
                val smooth = tv.own.owntv.ui.theme.MotionPrefs.smooth
                // A focused line goes to the top with one line above it, the name and poster sliding away; back on the
                // poster, the list returns to the top.
                val showFrom: (Int) -> Unit = { item ->
                    scope.launch {
                        runCatching {
                            if (smooth) scheduleState.animateScrollToItem(item.coerceAtLeast(0))
                            else scheduleState.scrollToItem(item.coerceAtLeast(0))
                        }
                    }
                }
                val pick: (ScheduleLine) -> Unit = { line ->
                    val aired = line.archive
                    if (aired != null) onPlayArchive?.invoke(head, aired)
                    else if (now in line.startMs until line.stopMs) onSelect(head)
                }
                LazyColumn(Modifier.fillMaxSize(), state = scheduleState) {
                    item(key = "head") { panelHeader(head, c.text, Soft) }
                    art?.let { a ->
                        item(key = "art") {
                            // Fades in and moves the guide down smoothly when the poster arrives, instead of a jump.
                            Box(Modifier.animateItem()) {
                                panelProgrammeArt(a, c.text, Soft, posterFocus, onFocused = { showFrom(0) }) { key ->
                                    when (key) {
                                        Key.DirectionLeft -> { runCatching { firstFocus.requestFocus() }; true }
                                        // ▼ goes to the line right under the poster: what is on, or, once earlier
                                        // programmes were brought in above it, the first of them. The on-air line is
                                        // then far below and not laid out, and asking for it did nothing at all.
                                        Key.DirectionDown -> {
                                            val atStart = firstShown == (onAirIndex - 1).coerceAtLeast(0)
                                            runCatching { (if (atStart) onAirFocus else topRowFocus).requestFocus() }
                                            true
                                        }
                                        Key.DirectionCenter, Key.Enter, Key.NumPadEnter -> { bigPoster = a; true }
                                        Key.DirectionRight, Key.DirectionUp -> true
                                        else -> false
                                    }
                                }
                            }
                        }
                    }
                    if (lines.isEmpty()) {
                        item(key = "empty") {
                            GuideStatusText(
                                stringResource(R.string.content_no_guide_short), stageText(21, 500), Faint,
                                Modifier.padding(top = 22.mpx),
                            )
                        }
                    } else {
                        item(key = "gap") { androidx.compose.foundation.layout.Spacer(Modifier.height(12.mpx)) }
                        itemsIndexed(lines.drop(firstShown), key = { _, l -> l.startMs }) { i, line ->
                            val index = i + firstShown
                            scheduleLine(
                                line, now, formatTime, pick,
                                toList = { runCatching { firstFocus.requestFocus() } },
                                onUpAtTop = if (i == 0 && firstShown > 0) {
                                    { firstShown -= 1; focusTopRow = true }
                                } else {
                                    null
                                },
                                onFocused = { showFrom(rowsFrom + i - 1) },
                                modifier = Modifier.animateItem()
                                    .then(if (index == onAirIndex) Modifier.focusRequester(onAirFocus) else Modifier)
                                    .then(if (i == 0) Modifier.focusRequester(topRowFocus) else Modifier),
                            )
                        }
                    }
                }
                // A soft edge where the list slides under the picture, instead of a hard cut.
                if (scheduleState.canScrollBackward) {
                    Box(
                        Modifier.fillMaxWidth().height(SCROLL_FADE.mpx)
                            .background(
                                androidx.compose.ui.graphics.Brush.verticalGradient(listOf(c.fill, Color.Transparent)),
                            ),
                    )
                }
            }
        }
        // The focused channel's guide over the list, as on the channels screen; the picture stays in its window.
        tv.own.owntv.features.live.LiveGuideSideHost(
            channel = sideFor,
            scheduleFor = scheduleFor,
            archiveFor = { ch -> archiveFor?.invoke(ch).orEmpty() },
            onWatch = { ch -> sideFor = null; onSelect(ch) },
            onPlayArchive = { ch, p -> sideFor = null; onPlayArchive?.invoke(ch, p) },
            onClose = {
                inSide = false
                if (!threeColumns) sideFor = null
                runCatching { firstFocus.requestFocus() }
            },
            onLeft = if (threeColumns) {
                { inSide = false; runCatching { firstFocus.requestFocus() } }
            } else {
                null
            },
            takeFocus = inSide || !threeColumns,
            onFocusInside = { inside -> if (threeColumns) { if (inside) inSide = true else if (inSide) inSide = false } },
            stay = threeColumns,
            onLine = { picked = it },
            refocus = sideRefocus,
            onShowPoster = { bigPoster = it },
            // Between the list and the picture, never over the list.
            modifier = Modifier.padding(start = (inset + TvBoxDock.Left - SIDE_GAP.mpx - squeeze).coerceAtLeast(0.mpx)).fillMaxHeight()
                .width((guideShift - SIDE_GAP.mpx + squeeze).coerceAtLeast(0.mpx)),
        )
        // The poster over the whole screen, from OK on it; focus goes back to it when it closes.
        bigPoster?.let { a ->
            tv.own.owntv.ui.components.programmePosterViewer(a) {
                bigPoster = null
                // From the guide: back into it; from the poster under the picture: back onto that poster.
                if (sideFor != null) sideRefocus++ else runCatching { posterFocus.requestFocus() }
            }
        }
    }
}

/**
 * The poster, title, year and what it is about of the film or series on air, beside one another; the text runs
 * down to the poster's foot. The poster takes focus (▶ from the list) with a white ring, and [onKey] decides
 * what each key does there.
 */
@Composable
private fun panelProgrammeArt(
    art: tv.own.owntv.core.metadata.ProgrammeArt,
    ink: Color,
    soft: Color,
    posterFocus: FocusRequester,
    onFocused: () -> Unit,
    onKey: (Key) -> Boolean,
) {
    var focused by remember { mutableStateOf(false) }
    val ring = RoundedCornerShape(ART_RING_RADIUS.mpx)
    Row(Modifier.padding(top = 18.mpx), horizontalArrangement = Arrangement.spacedBy(16.mpx)) {
        Box(
            Modifier
                .focusRequester(posterFocus)
                .onFocusChanged { focused = it.isFocused; if (it.isFocused) onFocused() }
                .onPreviewKeyEvent { e -> e.type == KeyEventType.KeyDown && onKey(e.key) }
                .focusable()
                .then(if (focused) Modifier.border(ART_RING.mpx, Color.White, ring) else Modifier)
                .padding(ART_RING.mpx),
        ) { tv.own.owntv.ui.components.programmePoster(art.posterUrl, ART_POSTER_WIDTH.mpx) }
        Column(
            Modifier.height((ART_POSTER_WIDTH * ART_POSTER_RATIO + ART_RING * 2).mpx),
            verticalArrangement = Arrangement.spacedBy(6.mpx),
        ) {
            Text(
                art.title, style = stageText(ART_TITLE_TEXT, BOLD), color = ink,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            val separator = stringResource(R.string.content_epg_bits_separator)
            val about = listOfNotNull(art.year?.toString(), art.overview).joinToString(separator)
            if (about.isNotBlank()) fittedAbout(about, soft, Modifier.weight(1f))
        }
    }
}

/**
 * What a programme is about, as large as fills the room beside the poster: a short text grows (up to
 * [ART_TEXT_MAX]) so it reaches the poster's foot, a long one stays at [ART_TEXT] and ends in an ellipsis. A very
 * short one is left at the usual size, where growing it would only look odd.
 */
@Composable
private fun fittedAbout(text: String, color: Color, modifier: Modifier) {
    val measurer = androidx.compose.ui.text.rememberTextMeasurer()
    val styles = (ART_TEXT..ART_TEXT_MAX).associateWith { stageText(it, MEDIUM) }
    androidx.compose.foundation.layout.BoxWithConstraints(modifier.fillMaxWidth()) {
        val width = constraints.maxWidth
        val height = constraints.maxHeight
        val size = remember(text, width, height) {
            if (text.length < SHORT_ABOUT) return@remember ART_TEXT
            (ART_TEXT_MAX downTo ART_TEXT).firstOrNull { sp ->
                val laid = measurer.measure(
                    text, styles.getValue(sp),
                    constraints = androidx.compose.ui.unit.Constraints(maxWidth = width),
                )
                laid.size.height <= height
            } ?: ART_TEXT
        }
        Text(text, style = styles.getValue(size), color = color, overflow = TextOverflow.Ellipsis)
    }
}

private const val ART_TEXT_MAX = 24
private const val SHORT_ABOUT = 60

private const val ART_POSTER_WIDTH = 96
private const val ART_POSTER_RATIO = 1.5f
private const val ART_RING = 3
private const val ART_RING_RADIUS = 13
private const val ART_TITLE_TEXT = 22
private const val ART_TEXT = 18
private const val BOLD = 700
private const val MEDIUM = 500

/** One line of the guide under the picture; [archive] is set on an aired programme that can be watched again. */
private data class ScheduleLine(
    val startMs: Long,
    val stopMs: Long,
    val title: String,
    val archive: tv.own.owntv.core.database.entity.EpgProgrammeEntity?,
    /** What the programme is about, from the guide; shown under the line while it has focus. */
    val description: String? = null,
)

/** The archive's last aired programmes, then what is on and what comes, in time order. */
private fun scheduleLines(
    entries: List<XtEpgEntry>,
    archive: List<tv.own.owntv.core.database.entity.EpgProgrammeEntity>,
    now: Long,
): List<ScheduleLine> {
    val aired = archive.filter { it.stopMs <= now }.sortedBy { it.startMs }.takeLast(AIRED_LINES)
        .map { ScheduleLine(it.startMs, it.stopMs, it.title, it, it.description) }
    val rest = entries.filter { aired.isEmpty() || it.stopMs > now }
        .map { ScheduleLine(it.startMs, it.stopMs, it.title, null, it.description) }
    return (aired + rest).distinctBy { it.startMs }.sortedBy { it.startMs }
}

/** Under the picture while the guide is open: the channel, its programme's poster and story, and what is on now. */
@Composable
private fun guideCompanion(
    head: ChannelEntity,
    art: tv.own.owntv.core.metadata.ProgrammeArt?,
    onAir: XtEpgEntry?,
    now: Long,
    formatTime: (Long) -> String,
) {
    val c = tvBoxPanelColors()
    Column(verticalArrangement = Arrangement.spacedBy(18.mpx)) {
        panelHeader(head, c.text, c.soft)
        if (onAir != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.mpx), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.content_live_time_range_plain, formatTime(onAir.startMs), formatTime(onAir.stopMs)),
                    style = stageText(SCHEDULE_TEXT, SEMI), color = tv.own.owntv.ui.theme.liveAccent, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Text(
                    onAir.title, style = stageText(SCHEDULE_TEXT, BOLD), color = c.text,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                )
                val done = ((now - onAir.startMs).toFloat() / (onAir.stopMs - onAir.startMs).coerceAtLeast(1)).coerceIn(0f, 1f)
                Bar(done, COMPANION_BAR.mpx, base = c.text)
                Text(durationLeft(onAir.stopMs - now), style = stageText(LEFT_TEXT, SEMI), color = c.soft, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        val about = listOfNotNull(art?.year?.toString(), art?.overview ?: onAir?.description)
            .joinToString(stringResource(R.string.content_epg_bits_separator))
        Row(horizontalArrangement = Arrangement.spacedBy(20.mpx)) {
            art?.let { tv.own.owntv.ui.components.programmePoster(it.posterUrl, COMPANION_POSTER.mpx) }
            // Beside a poster the story runs down to its foot: a short one set larger, a long one cut off there.
            Column(
                if (art != null) Modifier.height((COMPANION_POSTER * ART_POSTER_RATIO).mpx) else Modifier,
                verticalArrangement = Arrangement.spacedBy(8.mpx),
            ) {
                art?.let { Text(it.title, style = stageText(ART_TITLE_TEXT, BOLD), color = c.text, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                if (about.isNotBlank()) {
                    if (art != null) {
                        fittedAbout(about, c.soft, Modifier.weight(1f))
                    } else {
                        Text(about, style = stageText(COMPANION_TEXT, MEDIUM), color = c.soft, maxLines = COMPANION_LINES, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

/**
 * Under the picture in the three-column panel: the programme the remote rests on in the guide (what is on otherwise),
 * on a card — its title, its time with how much is left, and what it is about.
 */
@Composable
private fun programmeCard(p: XtEpgEntry?, now: Long, formatTime: (Long) -> String) {
    val c = tvBoxPanelColors()
    // No guide for the channel: the card says so, as the channels screen does, rather than standing empty.
    if (p == null) {
        // The same quiet note and skeleton lines as the channels screen, never a block in a block.
        androidx.compose.foundation.layout.Box(Modifier.fillMaxWidth().padding(horizontal = 6.mpx, vertical = 8.mpx)) { tv.own.owntv.features.live.NoGuideCard() }
        return
    }
    val art = tv.own.owntv.ui.components.rememberProgrammeArt(p.title)
    val about = p.description?.takeIf { it.isNotBlank() } ?: art?.overview
    Column(
        Modifier.fillMaxWidth()
            .background(Color.White.copy(alpha = CARD_TINT), RoundedCornerShape(CARD_RADIUS.mpx))
            .padding(horizontal = 26.mpx, vertical = 22.mpx),
        verticalArrangement = Arrangement.spacedBy(12.mpx),
    ) {
        Text(p.title, style = stageText(CARD_TITLE, BOLD), color = c.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Row(horizontalArrangement = Arrangement.spacedBy(16.mpx), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.content_live_time_range_plain, formatTime(p.startMs), formatTime(p.stopMs)),
                style = stageText(SCHEDULE_TEXT, SEMI), color = c.soft, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            if (now in p.startMs until p.stopMs) {
                val done = ((now - p.startMs).toFloat() / (p.stopMs - p.startMs).coerceAtLeast(1)).coerceIn(0f, 1f)
                Bar(done, COMPANION_BAR.mpx, base = c.text)
                Text(durationLeft(p.stopMs - now), style = stageText(LEFT_TEXT, SEMI), color = c.soft, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(20.mpx)) {
            art?.let { tv.own.owntv.ui.components.programmePoster(it.posterUrl, CARD_POSTER.mpx) }
            about?.let {
                // The whole text, to its end: the card grows rather than cutting it with "…".
                Text(
                    it, style = stageText(COMPANION_TEXT, MEDIUM), color = c.soft,
                    maxLines = Int.MAX_VALUE, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private const val CARD_TINT = 0.06f
private const val CARD_RADIUS = 18
private const val CARD_TITLE = 26
private const val CARD_POSTER = 130
private const val COMPANION_POSTER = 170
private const val COMPANION_TEXT = 19
private const val COMPANION_LINES = 9
private const val COMPANION_BAR = 140

/** The focused channel's logo, number and name, over its poster and guide. */
@Composable
private fun panelHeader(head: ChannelEntity, ink: Color, soft: Color) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.mpx), verticalAlignment = Alignment.CenterVertically) {
        Logo(head, 68.mpx, 48.mpx)
        head.number?.let {
            Text(
                it.toString(), style = stageText(HEADER_TEXT, BOLD), color = soft,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            head.name, style = stageText(HEADER_TEXT, BOLD), color = ink,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

/** One guide line: times, title, the archive mark on an aired one; on air, the bar and the time left. */
@Composable
private fun scheduleLine(
    line: ScheduleLine,
    now: Long,
    formatTime: (Long) -> String,
    onPick: (ScheduleLine) -> Unit,
    toList: () -> Unit,
    /** ▲ on the top line while earlier programmes wait in the archive: show the one before. */
    onUpAtTop: (() -> Unit)?,
    onFocused: () -> Unit,
    modifier: Modifier,
) {
    val c = tvBoxPanelColors()
    val interaction = remember { MutableInteractionSource() }
    val focused = interaction.collectIsFocusedAsState().value
    val onAir = now in line.startMs until line.stopMs
    val past = line.stopMs <= now
    val ink = when {
        focused -> c.focusInk
        onAir -> tv.own.owntv.ui.theme.liveAccent
        past -> c.faint
        else -> c.text
    }
    val about = line.description?.trim()?.takeIf { focused && it.isNotEmpty() }
    Column(
        modifier.fillMaxWidth()
            .background(if (focused) c.focus else Color.Transparent, tv.own.owntv.ui.stage.FocusBarShape)
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onPreviewKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (e.key) {
                    Key.DirectionLeft -> { toList(); true }
                    Key.DirectionRight -> true
                    Key.DirectionUp -> onUpAtTop?.let { it(); true } ?: false
                    else -> false
                }
            }
            .clickable(interactionSource = interaction, indication = null) { onPick(line) }
            .padding(horizontal = SCHEDULE_INSET.mpx)
            .animateContentSize(),
    ) {
    Row(
        Modifier.fillMaxWidth().height(SCHEDULE_LINE.mpx),
        horizontalArrangement = Arrangement.spacedBy(20.mpx),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.content_live_time_range_plain, formatTime(line.startMs), formatTime(line.stopMs)),
            style = stageText(SCHEDULE_TEXT, SEMI), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        if (line.archive != null) OwnTVIcon(OwnTVIcon.REWIND, ink, Modifier.size(ARCHIVE_MARK.mpx))
        Text(
            line.title, style = stageText(SCHEDULE_TEXT, if (onAir) BOLD else MEDIUM), color = ink,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        if (onAir) {
            val done = ((now - line.startMs).toFloat() / (line.stopMs - line.startMs).coerceAtLeast(1)).coerceIn(0f, 1f)
            Bar(done, ON_AIR_BAR.mpx, thick = true, base = ink)
            Text(
                stringResource(R.string.home_time_left, durationLeft(line.stopMs - now)),
                style = stageText(LEFT_TEXT, SEMI), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
    // The focused programme tells what it is about, as a guide does: a few lines, the rest cut off.
    if (about != null) {
        Text(
            about, style = stageText(ABOUT_TEXT, MEDIUM), color = c.focusInk.copy(alpha = ABOUT_ALPHA),
            maxLines = ABOUT_LINES, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(bottom = ABOUT_BOTTOM.mpx),
        )
    }
    }
}

private const val ABOUT_TEXT = 18
private const val ABOUT_ALPHA = 0.78f
private const val ABOUT_LINES = 4
private const val ABOUT_BOTTOM = 14

private const val AIRED_LINES = 3000
private const val SCROLL_FADE = 28

/** Where the guide's rows start in the list under the picture: after the name and gap, and the poster when shown. */
private const val ROWS_AFTER_HEAD = 2
private const val ROWS_AFTER_ART = 3
private const val HEADER_TEXT = 24
private const val SCHEDULE_LINE = 50
private const val SCHEDULE_INSET = 12
private const val SCHEDULE_TEXT = 21
private const val LEFT_TEXT = 19
private const val SEMI = 600
private const val ARCHIVE_MARK = 18
private const val ON_AIR_BAR = 200

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
    onLongClick: (() -> Unit)? = null,
    logosOnly: Boolean = false,
    lit: Boolean = false,
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
            .combinedClickable(interactionSource = interaction, indication = null, onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = CHANNEL_LINE_INSET.mpx),
        horizontalArrangement = Arrangement.spacedBy(16.mpx),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (logosOnly) {
            val mark = lit && !focused
            androidx.compose.foundation.layout.Box(
                Modifier.weight(1f).fillMaxHeight()
                    .background(if (mark) tv.own.owntv.features.live.litFill() else Color.Transparent, androidx.compose.foundation.shape.RoundedCornerShape(10.mpx))
                    .then(if (mark) Modifier.border(2.mpx, tv.own.owntv.ui.theme.liveAccent, androidx.compose.foundation.shape.RoundedCornerShape(10.mpx)) else Modifier),
                contentAlignment = Alignment.Center,
            ) {
                LogoCell(channel.number, now?.let { ((nowMs - it.startMs).toFloat() / (it.stopMs - it.startMs).coerceAtLeast(1)).coerceIn(0f, 1f) }) { Logo(channel, 96.mpx, 46.mpx) }
            }
            return@Row
        }
        Logo(channel, 72.mpx, 52.mpx)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.mpx)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.mpx)) {
                channel.number?.let { Text(it.toString(), style = stageText(20, 700), color = soft, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) }
                // The channel being watched: its name in brand blue, nothing else.
                Text(
                    channel.name, style = stageText(20, 700), color = if (playing) tv.own.owntv.ui.theme.liveAccent else ink,
                    maxLines = 1, overflow = marqueeOverflow(focused),
                    modifier = Modifier.weight(1f, fill = false).focusMarquee(focused),
                )
                // A channel with an archive says so beside its name.
                if (channel.catchup) {
                    OwnTVIcon(OwnTVIcon.REWIND, soft, Modifier.size(ARCHIVE_MARK.mpx).align(Alignment.CenterVertically))
                }
            }
            if (now != null) {
                Text(
                    now.title, style = stageText(16, 500), color = soft,
                    maxLines = 1, overflow = marqueeOverflow(focused), modifier = Modifier.focusMarquee(focused),
                )
                // The same thin line as the channels list: blue, the whole width, running out as the programme does.
                tv.own.owntv.ui.stage.StageProgress(((nowMs - now.startMs).toFloat() / (now.stopMs - now.startMs).coerceAtLeast(1)).coerceIn(0f, 1f), Modifier.fillMaxWidth(), flat = true)
            } else {
                GuideStatusText(stringResource(R.string.content_no_guide_short), stageText(16, 500), soft)
            }
        }
        if (countdown > 0) tv.own.owntv.ui.components.CountdownRing(countdown, tv.own.owntv.ui.components.DwellTiming.CategoryTotalMs, diameter = 32.mpx)
        else if (playing) tv.own.owntv.ui.components.PlayingMark()
        else if (trailing != null) Text(trailing, style = stageText(15, 500), color = soft, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
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
    ) { OwnTVIcon(OwnTVIcon.LIVE_TV, tvBoxPanelColors().faint, Modifier.size(minOf(w, h) * PLACEHOLDER_ICON_SHARE)) }
}

/** How much of the tile the TV mark fills when a channel has no logo: big enough to read as a channel. */
private const val PLACEHOLDER_ICON_SHARE = 0.8f

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

private val ListWidth = 500.mpx
/** The player panels' colours: dark glass in the dark theme, light glass in the light one. */
internal data class TvBoxPanelColors(val fill: Color, val text: Color, val soft: Color, val faint: Color, val focus: Color, val focusInk: Color, val line: Color)

@Composable
internal fun tvBoxPanelColors(): TvBoxPanelColors =
    if (tv.own.owntv.ui.theme.LocalStagePalette.current.isLight) {
        TvBoxPanelColors(Color(0xF2EEF1F4), Color(0xFF16181D), Color(0xCC16181D), Color(0x8C16181D), Color(0xFFDDE0E4), Color(0xFF16181D), Color(0x1A000000))
    } else {
        // Dark: the side menu's grey (TvBoxMenuFill), the focus bar a step lighter on it.
        TvBoxPanelColors(Color(0xF2232629), Color.White, Color.White.copy(alpha = 0.8f), Color.White.copy(alpha = 0.55f), Color(0xFF3A3F45), Color.White, Color(0x1FFFFFFF))
    }
private const val ScheduleSettleMs = 250L
private const val SIDE_GAP = 24
private const val SIDE_REFOCUS_MS = 40L
private const val HEADER_SETTLE_MS = 120L
private const val NOW_TICK_MS = 30_000L

/** Where a channel row's content starts: on the panel title's line, the row itself reaching the edges. */
private const val PANEL_LOGOS = 170
private const val CHANNEL_LINE_INSET = 28

