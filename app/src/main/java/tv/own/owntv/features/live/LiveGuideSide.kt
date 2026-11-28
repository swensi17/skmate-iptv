package tv.own.owntv.features.live

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import kotlinx.coroutines.launch
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.runtime.setValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.tv.material3.Text
import tv.own.owntv.R
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.database.entity.EpgProgrammeEntity
import tv.own.owntv.core.epg.displayLogoUrl
import tv.own.owntv.core.live.EpgNowNext
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.components.focusMarquee
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/** One programme of the side guide; [archive] is set on an aired one that can be watched again. */
private data class SideLine(
    val startMs: Long,
    val stopMs: Long,
    val title: String,
    val description: String?,
    val archive: EpgProgrammeEntity?,
)

/** A day's heading or a programme, in time order. */
private sealed interface SideItem {
    data class Day(val startMs: Long) : SideItem
    data class Line(val line: SideLine) : SideItem
}

/**
 * The focused channel's guide in the list's place (▶ on a channel): its programmes by day on the panel's grey, aired
 * ones with the archive mark and what is on marked live; the preview stays on the right. A focused programme tells
 * what it is about. OK on an aired one plays it from the archive, on what is on watches the channel; ◀ or Back go
 * back to the list.
 */
@Composable
internal fun LiveGuideSide(
    channel: ChannelEntity,
    scheduleFor: suspend (ChannelEntity) -> EpgNowNext?,
    archiveFor: suspend (ChannelEntity) -> List<EpgProgrammeEntity>,
    onWatch: () -> Unit,
    onPlayArchive: (EpgProgrammeEntity) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    /** ◀: the categories beside it, the guide staying; null closes the guide as Back does. */
    onLeft: (() -> Unit)? = null,
    /** Bumped when focus should come back into the guide (the categories closed beside it). */
    refocus: Int = 0,
    /** Hold OK (or Menu) on a programme with a poster: show the poster over the whole screen. */
    onShowPoster: (tv.own.owntv.core.metadata.ProgrammeArt) -> Unit = {},
    /** False while the guide slides away: Back then belongs to what is under it again. */
    shown: Boolean = true,
    /** False while the channel list beside it holds the focus and the guide only follows along. */
    takeFocus: Boolean = true,
    /** Tells the screen whether the remote is inside the column, so the list beside it can squeeze or widen. */
    onFocusInside: (Boolean) -> Unit = {},
    stay: Boolean = false,
    /** The programme the remote rests on, for a card beside the guide; null when the remote leaves it. */
    onLine: (tv.own.owntv.core.parser.XtEpgEntry?) -> Unit = {},
) {
    val formatTime = tv.own.owntv.ui.format.rememberSystemTimeFormatter()
    val formatDay = tv.own.owntv.ui.format.rememberBestDateFormatter("EEEEdMMMM")
    val now = remember(channel.id) { System.currentTimeMillis() }
    val items by produceState<List<SideItem>?>(null, channel.id) {
        val guide = runCatching { scheduleFor(channel) }.getOrNull()
        val aired = if (channel.catchup) runCatching { archiveFor(channel) }.getOrDefault(emptyList()) else emptyList()
        value = sideItems(guide, aired, now)
    }
    val c = tv.own.owntv.features.shell.components.tvBoxPanelColors()
    val list = rememberLazyListState()
    val lineFocus = remember { FocusRequester() }
    val dayFocus = remember { FocusRequester() }
    val loaded = items
    // What is on, or — a channel with only its archive — the last aired line; never a day's heading.
    val onAirIndex = loaded?.let { items ->
        items.indexOfFirst { it is SideItem.Line && now < it.line.stopMs }
            .takeIf { it >= 0 } ?: items.indexOfLast { it is SideItem.Line }
    }?.coerceAtLeast(0) ?: 0
    // The line that takes focus when the guide or a day asks for it: what is on at first, a day's first line after.
    var wantLine by remember(channel.id) { mutableIntStateOf(-1) }
    val target = if (wantLine >= 0) wantLine else onAirIndex
    var focusLineAsk by remember { mutableIntStateOf(0) }
    var wantDay by remember(channel.id) { mutableStateOf<Long?>(null) }
    var focusDayAsk by remember { mutableIntStateOf(0) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val smooth = tv.own.owntv.ui.theme.MotionPrefs.smooth
    var hasFocus by remember { mutableStateOf(false) }
    BackHandler(enabled = shown && (!stay || hasFocus)) { onClose() }
    val headFocus = remember { FocusRequester() }
    // The line in focus: its day is lit in the days column, and its poster is looked up once focus rests on it.
    var focusedLine by remember(channel.id) { mutableStateOf<SideLine?>(null) }
    LaunchedEffect(focusedLine, hasFocus) {
        val l = focusedLine?.takeIf { hasFocus }
        onLine(l?.let { tv.own.owntv.core.parser.XtEpgEntry(it.title, it.description, it.startMs, it.stopMs) })
    }
    val restingTitle by produceState<String?>(null, focusedLine) {
        value = null
        val l = focusedLine ?: return@produceState
        kotlinx.coroutines.delay(POSTER_SETTLE_MS)
        value = l.title
    }
    val art = tv.own.owntv.ui.components.rememberProgrammeArt(restingTitle)
    val days = remember(loaded) { loaded.orEmpty().filterIsInstance<SideItem.Day>().map { it.startMs } }
    // Focus comes over from the list: asked again for a moment, since the list can still hold it while the panel
    // slides in. With no guide it rests on the channel's name, so ◀ and Back still answer.
    LaunchedEffect(loaded, takeFocus) {
        if (loaded == null) return@LaunchedEffect
        if (loaded.isNotEmpty() && !hasFocus) runCatching { list.scrollToItem((onAirIndex - LINES_ABOVE).coerceAtLeast(0)) }
        if (!takeFocus) return@LaunchedEffect
        repeat(FOCUS_TRIES) {
            if (hasFocus) return@LaunchedEffect
            androidx.compose.runtime.withFrameNanos { }
            runCatching { (if (loaded.isEmpty()) headFocus else lineFocus).requestFocus() }
            kotlinx.coroutines.delay(FOCUS_RETRY_MS)
        }
    }
    // A line far off is not laid out: the list is brought to it first, the focus asked on the next frame.
    LaunchedEffect(focusLineAsk) {
        if (focusLineAsk == 0) return@LaunchedEffect
        val visible = list.layoutInfo.visibleItemsInfo.any { it.index == target }
        if (!visible) runCatching { list.scrollToItem((target - 1).coerceAtLeast(0)) }
        androidx.compose.runtime.withFrameNanos { }
        runCatching { lineFocus.requestFocus() }
    }
    // Back from the categories: focus into the guide again, on the line it was left on.
    LaunchedEffect(refocus) {
        if (refocus == 0 || loaded == null) return@LaunchedEffect
        androidx.compose.runtime.withFrameNanos { }
        runCatching { (if (loaded.isEmpty()) headFocus else lineFocus).requestFocus() }
    }
    LaunchedEffect(focusDayAsk) {
        if (focusDayAsk == 0) return@LaunchedEffect
        androidx.compose.runtime.withFrameNanos { }
        runCatching { dayFocus.requestFocus() }
    }
    Row(
        modifier.background(c.fill.copy(alpha = 1f))
            .onFocusChanged { if (hasFocus != it.hasFocus) onFocusInside(it.hasFocus); hasFocus = it.hasFocus },
    ) {
    Column(
        Modifier.weight(1f).fillMaxHeight()
            .onPreviewKeyEvent { e ->
                if (e.type == KeyEventType.KeyDown && e.key == Key.DirectionLeft) { (onLeft ?: onClose)(); true } else false
            }
            .padding(top = 36.mpx),
    ) {
        Row(
            Modifier.padding(horizontal = SIDE_INSET.mpx).focusRequester(headFocus).focusable(),
            horizontalArrangement = Arrangement.spacedBy(16.mpx),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LivePlate(channel.displayLogoUrl, 76.mpx, 54.mpx)
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(10.mpx)) {
                    channel.number?.let { Text(it.toString(), style = stageText(24, 700), color = c.faint, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    Text(channel.name, style = stageText(24, 700), color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        when {
            loaded == null -> androidx.compose.foundation.layout.Spacer(Modifier.height(1.mpx))
            // No guide: a picture and one line in the middle of the panel, not a line lost at its top.
            loaded.isEmpty() -> androidx.compose.foundation.layout.Box(
                Modifier.fillMaxWidth().weight(1f).padding(bottom = EMPTY_LIFT.mpx),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.mpx)) {
                    OwnTVIcon(OwnTVIcon.EPG, c.faint, Modifier.size(EMPTY_ICON.mpx))
                    Text(
                        stringResource(R.string.content_no_guide_short), style = stageText(22, 600), color = c.soft,
                        maxLines = 2, overflow = TextOverflow.Ellipsis,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
            else -> LazyColumn(
                Modifier.fillMaxWidth().weight(1f).padding(top = 18.mpx),
                state = list,
                contentPadding = PaddingValues(start = 12.mpx, end = 12.mpx, bottom = 40.mpx),
            ) {
                itemsIndexed(loaded, key = { _, it -> if (it is SideItem.Day) "d${it.startMs}" else "l${(it as SideItem.Line).line.startMs}" }) { i, item ->
                    when (item) {
                        is SideItem.Day -> Text(
                            dayName(item.startMs, now, formatDay), style = stageText(DAY_TEXT, 700), color = tv.own.owntv.ui.theme.liveAccent,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = 16.mpx, top = 18.mpx, bottom = 6.mpx),
                        )
                        is SideItem.Line -> sideLine(
                            firstLine = i == loaded.indexOfFirst { it is SideItem.Line },
                            lastLine = i == loaded.lastIndex,
                            item.line, now, formatTime,
                            poster = art?.takeIf { !stay && focusedLine == item.line && restingTitle == item.line.title },
                            expand = !stay,
                            onShowPoster = onShowPoster,
                            onFocused = { focusedLine = item.line; wantLine = i },
                            onRight = if (days.size > 1) {
                                { wantDay = dayOf(item.line.startMs); focusDayAsk++ }
                            } else null,
                            onPick = { l ->
                                val aired = l.archive
                                when {
                                    aired != null -> onPlayArchive(aired)
                                    now in l.startMs until l.stopMs -> onWatch()
                                }
                            },
                            modifier = if (i == target) Modifier.focusRequester(lineFocus) else Modifier,
                        )
                    }
                }
            }
        }
    }
    // The days the guide covers: focus on one brings the guide to it; OK or ◀ go into that day.
    if (days.size > 1 && (!stay || hasFocus)) {
        // The day under the cursor is the chosen one: focus and the lit day never part.
        var dayUnderCursor by remember { mutableStateOf<Long?>(null) }
        val lit = dayUnderCursor ?: focusedLine?.let { dayOf(it.startMs) }
        val goInto: (Long) -> Unit = { day ->
            val at = loaded.orEmpty().indexOfFirst { it is SideItem.Line && dayOf(it.line.startMs) == day }
            if (at >= 0) { wantLine = at; focusLineAsk++ }
        }
        val daysList = rememberLazyListState()
        Column(
            Modifier.width(DAYS_W.mpx).fillMaxHeight().padding(top = DAYS_TOP.mpx, end = 12.mpx)
                .onFocusChanged { if (!it.hasFocus) dayUnderCursor = null },
        ) {
        // What the column is: a heading over it, and a soft shade where the days slide under it.
        Text(
            stringResource(R.string.content_guide_days), style = stageText(DAY_TEXT, 700), color = c.faint,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth().padding(bottom = 10.mpx),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        androidx.compose.foundation.layout.Box(Modifier.weight(1f)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = daysList,
            verticalArrangement = Arrangement.spacedBy(6.mpx),
        ) {
            itemsIndexed(days, key = { _, d -> d }) { di, day ->
                dayCell(
                    day, now, lit = day == lit,
                    first = di == 0, last = di == days.lastIndex,
                    onFocused = {
                        dayUnderCursor = day
                        val at = loaded.orEmpty().indexOfFirst { it is SideItem.Day && it.startMs == day }
                        if (at >= 0) scope.launch {
                            runCatching { if (smooth) list.animateScrollToItem(at) else list.scrollToItem(at) }
                        }
                    },
                    onEnter = { goInto(day) },
                    modifier = if (day == (wantDay ?: lit)) Modifier.focusRequester(dayFocus) else Modifier,
                )
            }
        }
        if (daysList.canScrollBackward) {
            androidx.compose.foundation.layout.Box(
                Modifier.fillMaxWidth().height(DAYS_FADE.mpx)
                    .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(c.fill.copy(alpha = 1f), Color.Transparent))),
            )
        }
        }
        }
    }
    }
}

/**
 * The one way the side guide comes and goes, on the channels screen and in the player's channel panel alike: it slides
 * in from the right where the list was (at once with animations off) and back out. [channel] null hides it.
 */
@Composable
internal fun LiveGuideSideHost(
    channel: ChannelEntity?,
    scheduleFor: suspend (ChannelEntity) -> EpgNowNext?,
    archiveFor: suspend (ChannelEntity) -> List<EpgProgrammeEntity>,
    onWatch: (ChannelEntity) -> Unit,
    onPlayArchive: (ChannelEntity, EpgProgrammeEntity) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    onLeft: (() -> Unit)? = null,
    refocus: Int = 0,
    onShowPoster: (tv.own.owntv.core.metadata.ProgrammeArt) -> Unit = {},
    takeFocus: Boolean = true,
    /** Tells the screen whether the remote is inside the column, so the list beside it can squeeze or widen. */
    onFocusInside: (Boolean) -> Unit = {},
    /** A column that stands beside the list: Back belongs to it only while it has the focus. */
    stay: Boolean = false,
    onLine: (tv.own.owntv.core.parser.XtEpgEntry?) -> Unit = {},
) {
    val slide = tv.own.owntv.ui.theme.MotionPrefs.slideMs(GUIDE_SLIDE_MS)
    val fade = tv.own.owntv.ui.theme.MotionPrefs.dur(GUIDE_SLIDE_MS)
    // The channel stays drawn while the panel slides out, after the caller has let it go.
    var shown by remember { mutableStateOf(channel) }
    if (channel != null) shown = channel
    androidx.compose.animation.AnimatedVisibility(
        visible = channel != null,
        enter = androidx.compose.animation.slideInHorizontally(androidx.compose.animation.core.tween(slide)) { it / GUIDE_SLIDE_PART } +
            androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(fade)),
        exit = androidx.compose.animation.slideOutHorizontally(androidx.compose.animation.core.tween(slide)) { it / GUIDE_SLIDE_PART } +
            androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(fade)),
        modifier = modifier,
    ) {
        val ch = shown ?: return@AnimatedVisibility
        LiveGuideSide(
            channel = ch,
            scheduleFor = scheduleFor,
            archiveFor = archiveFor,
            takeFocus = takeFocus,
            onFocusInside = onFocusInside,
            stay = stay,
            onLine = onLine,
            onWatch = { onWatch(ch) },
            onPlayArchive = { onPlayArchive(ch, it) },
            onClose = onClose,
            modifier = Modifier.fillMaxSize(),
            onLeft = onLeft,
            refocus = refocus,
            onShowPoster = onShowPoster,
            shown = channel != null,
        )
    }
}

/** How long the side guide takes to slide in and out, and the share of its width it travels. */
internal const val GUIDE_SLIDE_MS = 220
private const val GUIDE_SLIDE_PART = 4

/** One day: weekday over date; the day being read is marked, today in brand blue. */
@Composable
private fun dayCell(
    day: Long,
    now: Long,
    lit: Boolean,
    first: Boolean,
    last: Boolean,
    onFocused: () -> Unit,
    onEnter: () -> Unit,
    modifier: Modifier,
) {
    val c = tv.own.owntv.features.shell.components.tvBoxPanelColors()
    val weekday = tv.own.owntv.ui.format.rememberBestDateFormatter("EEEE")
    val today = dayOf(now)
    val named = when (day) {
        today -> androidx.compose.ui.res.stringResource(R.string.content_epg_today)
        dayOf(today - HALF_DAY_MS) -> androidx.compose.ui.res.stringResource(R.string.content_epg_yesterday)
        dayOf(today + DAY_MS + HALF_DAY_MS) -> androidx.compose.ui.res.stringResource(R.string.content_epg_tomorrow)
        else -> null
    }
    val date = tv.own.owntv.ui.format.rememberBestDateFormatter("dMMM")
    val interaction = remember { MutableInteractionSource() }
    val focused = interaction.collectIsFocusedAsState().value
    val ink = when {
        focused -> c.focusInk
        day == dayOf(now) -> tv.own.owntv.ui.theme.liveAccent
        lit -> c.text
        else -> c.soft
    }
    Column(
        modifier.fillMaxWidth().height(DAY_CELL_H.mpx)
            .background(
                when {
                    focused -> c.focus
                    lit -> c.line
                    else -> Color.Transparent
                },
                tv.own.owntv.ui.stage.FocusBarShape,
            )
            .onFocusChanged { if (it.isFocused) onFocused() }
            .onPreviewKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (e.key) {
                    Key.DirectionLeft -> { onEnter(); true }
                    Key.DirectionRight -> true
                    // The column's ends are walls: ▲ on the first day, ▼ on the last, never leave it for the picture.
                    Key.DirectionUp -> first
                    Key.DirectionDown -> last
                    else -> false
                }
            }
            .clickable(interactionSource = interaction, indication = null) { onEnter() },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(named ?: shortDay(weekday(day)), style = stageText(DAY_NAME_TEXT, 600), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(date(day), style = stageText(DAY_DATE_TEXT, 700), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** One programme: start time, title, the archive mark or LIVE; focused, it also tells what it is about. */
@Composable
private fun sideLine(
    firstLine: Boolean,
    lastLine: Boolean,
    line: SideLine,
    now: Long,
    formatTime: (Long) -> String,
    poster: tv.own.owntv.core.metadata.ProgrammeArt?,
    onShowPoster: (tv.own.owntv.core.metadata.ProgrammeArt) -> Unit,
    onFocused: () -> Unit,
    onRight: (() -> Unit)?,
    onPick: (SideLine) -> Unit,
    modifier: Modifier,
    /** A card beside the guide shows the focused programme: the line itself stays one row. */
    expand: Boolean = true,
) {
    val c = tv.own.owntv.features.shell.components.tvBoxPanelColors()
    val interaction = remember { MutableInteractionSource() }
    val focused = interaction.collectIsFocusedAsState().value
    val onAir = now in line.startMs until line.stopMs
    val ink = when {
        focused -> c.focusInk
        onAir -> tv.own.owntv.ui.theme.liveAccent
        // Aired with no archive: there is nothing to watch, so it stands back further.
        line.stopMs <= now && line.archive == null -> c.faint
        line.stopMs <= now -> c.soft
        else -> c.text
    }
    val about = line.description?.trim()?.takeIf { expand && focused && it.isNotEmpty() }
    val posterUrl = poster?.posterUrl
    // Held OK opened the poster: its release must not also play the programme.
    var heldOk by remember { mutableStateOf(false) }
    Column(
        modifier.fillMaxWidth()
            // A hairline under each programme, as between the channels: the guide reads as a table.
            .tableRule(!lastLine)
            .background(if (focused) c.focus else Color.Transparent, tv.own.owntv.ui.stage.FocusBarShape)
            .onFocusChanged { if (it.isFocused) onFocused() else heldOk = false }
            .onPreviewKeyEvent { e ->
                val ok = e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter
                when {
                    e.type == KeyEventType.KeyDown && e.key == Key.DirectionRight -> onRight?.let { it(); true } ?: true
                    // The guide's ends are walls: focus never leaves it upward or downward for the picture beside.
                    e.type == KeyEventType.KeyDown && e.key == Key.DirectionUp && firstLine -> true
                    e.type == KeyEventType.KeyDown && e.key == Key.DirectionDown && lastLine -> true
                    // Hold OK, or the remote's Menu key: the poster over the whole screen.
                    e.type == KeyEventType.KeyDown && ok && e.nativeKeyEvent.repeatCount > 0 -> {
                        // A held OK never plays the line on release, poster or not.
                        heldOk = true
                        if (e.nativeKeyEvent.repeatCount == 1 && poster != null) onShowPoster(poster)
                        true
                    }
                    e.type == KeyEventType.KeyUp && ok && heldOk -> { heldOk = false; true }
                    e.type == KeyEventType.KeyDown && e.key == Key.Menu && poster != null -> { onShowPoster(poster); true }
                    else -> false
                }
            }
            .clickable(interactionSource = interaction, indication = null) { onPick(line) }
            .padding(horizontal = 16.mpx)
            .animateContentSize(),
    ) {
        Row(
            Modifier.fillMaxWidth().height(LINE_H.mpx),
            horizontalArrangement = Arrangement.spacedBy(18.mpx),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                formatTime(line.startMs), style = stageText(LINE_TEXT, 600).copy(fontFeatureSettings = "tnum"), color = ink,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(TIME_W.mpx),
            )
            Text(
                line.title, style = stageText(LINE_TEXT, if (onAir) 700 else 500), color = ink,
                maxLines = 1, overflow = tv.own.owntv.ui.components.marqueeOverflow(focused),
                modifier = Modifier.weight(1f).focusMarquee(focused),
            )
            if (line.archive != null) OwnTVIcon(OwnTVIcon.REWIND, ink, Modifier.size(20.mpx))
            if (onAir) {
                Text(
                    stringResource(R.string.player_live), style = stageText(LIVE_TEXT, 700), color = ink,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.border(2.mpx, ink, RoundedCornerShape(6.mpx)).padding(horizontal = 8.mpx, vertical = 1.mpx),
                )
            }
        }
        if (about != null || (focused && posterUrl != null)) {
            Row(Modifier.padding(bottom = 14.mpx), horizontalArrangement = Arrangement.spacedBy(16.mpx)) {
                posterUrl?.let { tv.own.owntv.ui.components.programmePoster(it, POSTER_W.mpx) }
                if (about != null) {
                    Text(
                        about, style = stageText(ABOUT_TEXT, 500), color = c.focusInk.copy(alpha = 0.78f),
                        maxLines = if (posterUrl != null) ABOUT_LINES_POSTER else ABOUT_LINES, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** The archive's aired programmes and the guide's coming ones, in time order, a heading at each new day. */
private fun sideItems(guide: EpgNowNext?, aired: List<EpgProgrammeEntity>, now: Long): List<SideItem> {
    val past = aired.filter { it.stopMs <= now }.sortedBy { it.startMs }.takeLast(AIRED_MAX)
        .map { SideLine(it.startMs, it.stopMs, it.title, it.description, it) }
    val coming = guide?.let { g -> listOfNotNull(g.previous, g.now, g.next) + g.upcoming }.orEmpty()
        .filter { past.isEmpty() || it.stopMs > now }
        .map { SideLine(it.startMs, it.stopMs, it.title, it.description, null) }
    val lines = (past + coming).distinctBy { it.startMs }.sortedBy { it.startMs }
    val out = mutableListOf<SideItem>()
    var day = Long.MIN_VALUE
    lines.forEach { l ->
        val d = dayOf(l.startMs)
        if (d != day) { out += SideItem.Day(d); day = d }
        out += SideItem.Line(l)
    }
    return out
}

/** Local midnight of the day [ms] falls in. */
private fun dayOf(ms: Long): Long = java.util.Calendar.getInstance().run {
    timeInMillis = ms
    set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0)
    set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
    timeInMillis
}

/** "Today", "Yesterday", "Tomorrow", or the day itself. */
@Composable
private fun dayName(day: Long, now: Long, formatDay: (Long) -> String): String {
    val today = dayOf(now)
    return when (day) {
        today -> stringResource(R.string.content_epg_today)
        dayOf(today - HALF_DAY_MS) -> stringResource(R.string.content_epg_yesterday)
        dayOf(today + DAY_MS + HALF_DAY_MS) -> stringResource(R.string.content_epg_tomorrow)
        else -> formatDay(day)
    }
}

private const val DAY_MS = 86_400_000L
private const val HALF_DAY_MS = DAY_MS / 2
private const val AIRED_MAX = 3000
private const val LINES_ABOVE = 3
private const val SIDE_INSET = 28
private const val DAY_TEXT = 20
private const val LINE_H = 56
private const val LINE_TEXT = 22
private const val TIME_W = 96
private const val LIVE_TEXT = 14
private const val ABOUT_TEXT = 18
private const val ABOUT_LINES = 4
private const val ABOUT_LINES_POSTER = 5
private const val POSTER_W = 84
private const val POSTER_SETTLE_MS = 400L
private const val DAYS_W = 150
private const val DAYS_TOP = 130
private const val DAY_CELL_H = 70
private const val DAYS_FADE = 36
private const val EMPTY_ICON = 84
private const val EMPTY_LIFT = 80
private const val FOCUS_TRIES = 12
private const val FOCUS_RETRY_MS = 50L

/** A weekday that would not fit the column: its first letters and a dot ("Понед."). Capitalised. */
private fun shortDay(name: String): String {
    val n = name.replaceFirstChar { it.titlecase() }
    return if (n.length > DAY_NAME_MAX) n.take(DAY_NAME_CUT) + "." else n
}

private const val DAY_NAME_MAX = 8
private const val DAY_NAME_CUT = 5
private const val DAY_NAME_TEXT = 19
private const val DAY_DATE_TEXT = 15
