package tv.own.owntv.features.sports

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import kotlinx.coroutines.delay
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.tv.material3.Text
import tv.own.owntv.R
import tv.own.owntv.core.epg.displayLogoUrl
import tv.own.owntv.core.sports.BoardSort
import tv.own.owntv.core.sports.GuideSport
import tv.own.owntv.core.sports.GuideSportItem
import tv.own.owntv.core.sports.SportsBoardFilter
import tv.own.owntv.features.epg.GuideMenuHost
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.format.localizedInteger
import tv.own.owntv.ui.components.ChannelLogoTile
import tv.own.owntv.ui.stage.StageProgress
import tv.own.owntv.ui.stage.StageRow
import tv.own.owntv.ui.stage.StageMenuHeader
import tv.own.owntv.ui.stage.StageMenuItem
import tv.own.owntv.ui.stage.StageSearchField
import tv.own.owntv.ui.stage.StageTab
import tv.own.owntv.ui.stage.StageTool
import tv.own.owntv.ui.theme.MotionPrefs
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.mpxSp
import tv.own.owntv.ui.theme.stageAccent
import tv.own.owntv.ui.stage.stageStillBack
import tv.own.owntv.ui.theme.stageText

/**
 * Sport on the user's channels, as a board: the title with a counter and a search field in the middle,
 * the sports and countries present as filters, and every programme in two columns. Nothing is cut to
 * the first few: a long list scrolls.
 */
@Composable
internal fun SportsBoard(
    items: List<GuideSportItem>,
    loading: Boolean,
    now: Long,
    searchFocus: FocusRequester,
    /** False while a stream plays over the board; coming back, focus returns to the card that was opened. */
    active: Boolean,
    onPlay: (GuideSportItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var sports by remember { mutableStateOf(emptySet<GuideSport>()) }
    var countries by remember { mutableStateOf(emptySet<String>()) }
    var sort by rememberSaveable { mutableStateOf(BoardSort.RELEVANCE) }
    var menu by remember { mutableStateOf<BoardMenu?>(null) }
    val requesters = remember { HashMap<String, FocusRequester>() }
    var lastKey by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(active) {
        val key = lastKey ?: return@LaunchedEffect
        if (!active) return@LaunchedEffect
        repeat(15) {
            withFrameNanos { }
            if (runCatching { requesters[key]?.requestFocus() }.getOrNull() == true) return@LaunchedEffect
            delay(60)
        }
    }
    val locale = LocalConfiguration.current.locales[0]
    val preferred = remember(locale) { SportsBoardFilter.preferredCountries(locale.language, locale.country.ifBlank { null }) }
    val shown = remember(items, query, sports, countries, sort, preferred) { SportsBoardFilter.apply(items, query, sports, countries, sort, preferred) }
    // Sports by how many programmes they have, so the long tail goes into the "More" menu, not the row.
    val sportList = remember(items) { SportsBoardFilter.sports(items).sortedByDescending { s -> items.count { it.sport == s } } }
    val rowSports = if (sportList.size > ROW_SPORTS) sportList.take(ROW_SPORTS - 1) else sportList
    val moreSports = sportList - rowSports.toSet()
    val countryList = remember(items, locale) { SportsBoardFilter.countries(items).sortedBy { countryName(it, locale).lowercase(locale) } }

    BoxWithConstraints(modifier.fillMaxSize()) {
        val gridWidth = maxWidth * (1560f / 1920f)
        val side = (maxWidth - gridWidth) / 2
        Column(Modifier.fillMaxSize()) {
            // The title, the search and the sport filters stay put; only the list below them scrolls.
            Column(Modifier.padding(start = side, end = side, top = 36.mpx).focusGroup()) {
                BoardTitle(shown.size)
            run {
                // The field at the left edge, longer; the two dropdowns at the right end of the same line.
                Row(Modifier.fillMaxWidth().padding(top = 10.mpx), horizontalArrangement = Arrangement.spacedBy(12.mpx), verticalAlignment = Alignment.CenterVertically) {
                    StageSearchField(
                        query = query,
                        onQueryChange = { query = it },
                        placeholder = stringResource(R.string.sports_board_search),
                        modifier = Modifier.weight(1f).focusRequester(searchFocus),
                    )
                    if (countryList.size > 1) {
                        StageTool(
                            text = null, icon = OwnTVIcon.LANGUAGE,
                            value = if (countries.isEmpty()) stringResource(R.string.sports_board_all_countries) else countries.sortedBy { countryName(it, locale) }.joinToString(", ") { countryName(it, locale) },
                            trailingIcon = OwnTVIcon.CHEVRON_DOWN, onClick = { menu = BoardMenu.COUNTRIES }, boxed = true,
                            modifier = Modifier.widthIn(max = 360.mpx),
                        )
                    }
                    StageTool(
                        text = null, icon = OwnTVIcon.SORT, value = stringResource(sortLabel(sort)),
                        trailingIcon = OwnTVIcon.CHEVRON_DOWN, onClick = { menu = BoardMenu.SORT }, boxed = true,
                    )
                }
            }
            if (sportList.size > 1) run {
                // One even line: every button the same width, the whole width of the board.
                Row(Modifier.fillMaxWidth().padding(top = 14.mpx).focusGroup(), horizontalArrangement = Arrangement.spacedBy(8.mpx)) {
                    StageTab(stringResource(R.string.content_epg_all), localizedInteger(items.size), sports.isEmpty(), { sports = emptySet() }, Modifier.weight(1f), centered = true)
                    rowSports.forEach { s ->
                        StageTab(
                            guideSportLabel(s), localizedInteger(items.count { it.sport == s }), s in sports,
                            { sports = if (s in sports) sports - s else sports + s },
                            Modifier.weight(1f), centered = true,
                        )
                    }
                    if (moreSports.isNotEmpty()) {
                        StageTab(
                            stringResource(R.string.sports_board_more), localizedInteger(moreSports.sumOf { m -> items.count { it.sport == m } }),
                            moreSports.any { it in sports }, { menu = BoardMenu.MORE_SPORTS }, Modifier.weight(1f), centered = true,
                        )
                    }
                }
            }
            }
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.weight(1f).fillMaxWidth().focusGroup(),
                contentPadding = PaddingValues(start = side, end = side, top = 14.mpx, bottom = 110.mpx),
                horizontalArrangement = Arrangement.spacedBy(20.mpx),
                verticalArrangement = Arrangement.spacedBy(10.mpx),
            ) {
            if (shown.isEmpty()) {
                item(key = "empty", span = { GridItemSpan(maxLineSpan) }) {
                    BoardEmpty(loading, query.isNotBlank() || sports.isNotEmpty() || countries.isNotEmpty())
                }
            }
            gridItems(shown, key = { cardKey(it) }) { item ->
                val key = cardKey(item)
                val requester = remember(key) { requesters.getOrPut(key) { FocusRequester() } }
                BoardCard(item, now, Modifier.focusRequester(requester)) {
                    lastKey = key
                    onPlay(item)
                }
            }
            }
        }
    }

    when (menu) {
        BoardMenu.COUNTRIES -> GuideMenuHost(x = 0f, top = 0.mpx, width = 640.mpx, onDismiss = { menu = null }) {
            StageMenuHeader(title = stringResource(R.string.sports_board_country_title), subtitle = null)
            StageMenuItem(stringResource(R.string.sports_board_all_countries), { countries = emptySet() }, checked = countries.isEmpty())
            countryList.forEach { code ->
                StageMenuItem(
                    countryName(code, locale), { countries = if (code in countries) countries - code else countries + code },
                    checked = code in countries, value = localizedInteger(items.count { SportsBoardFilter.countryOf(it) == code }),
                )
            }
        }
        BoardMenu.SORT -> GuideMenuHost(x = 0f, top = 0.mpx, width = 560.mpx, onDismiss = { menu = null }) {
            StageMenuHeader(title = stringResource(R.string.sports_board_sort_title_menu), subtitle = null)
            BoardSort.entries.forEach { mode ->
                StageMenuItem(stringResource(sortLabel(mode)), { sort = mode; menu = null }, icon = OwnTVIcon.SORT, checked = mode == sort)
            }
        }
        BoardMenu.MORE_SPORTS -> GuideMenuHost(x = 0f, top = 0.mpx, width = 560.mpx, onDismiss = { menu = null }) {
            StageMenuHeader(title = stringResource(R.string.sports_board_more), subtitle = null)
            moreSports.forEach { sp ->
                StageMenuItem(
                    guideSportLabel(sp), { sports = if (sp in sports) sports - sp else sports + sp },
                    checked = sp in sports, value = localizedInteger(items.count { it.sport == sp }),
                )
            }
        }
        null -> Unit
    }
}

private fun cardKey(item: GuideSportItem) = "${item.sport.name}|${item.title}|${item.startMs}"

private enum class BoardMenu { COUNTRIES, SORT, MORE_SPORTS }

/** Sports shown as buttons in the line, the "More" menu holding the rest. */
private const val ROW_SPORTS = 7

private fun sortLabel(sort: BoardSort): Int = when (sort) {
    BoardSort.RELEVANCE -> R.string.sports_board_sort_relevance
    BoardSort.TIME -> R.string.sports_board_sort_time
    BoardSort.TITLE -> R.string.sports_board_sort_title
    BoardSort.CHANNEL -> R.string.sports_board_sort_channel
}

private fun countryName(code: String, locale: java.util.Locale): String =
    java.util.Locale.Builder().setRegion(code).build().getDisplayCountry(locale).ifBlank { code }

/** "Sport 37": the title and, at the same size on the same line, how many programmes are listed. */
@Composable
private fun BoardTitle(count: Int) {
    val shown by animateIntAsState(count, tween(MotionPrefs.dur(500), easing = FastOutSlowInEasing), label = "boardCount")
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start, verticalAlignment = Alignment.Bottom) {
        Text48(stringResource(R.string.sports_title), StageColors.Text)
        Text48(" " + localizedInteger(shown), stageAccent.accent)
    }
}

@Composable
private fun Text48(text: String, color: Color) {
    Text(text, style = stageText(46, 800, (-1).mpxSp), color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

@Composable
private fun FilterRow(modifier: Modifier = Modifier, content: LazyListScope.() -> Unit) {
    LazyRow(modifier.fillMaxWidth().focusGroup(), horizontalArrangement = Arrangement.spacedBy(8.mpx), content = content)
}

/** Nothing listed: still looking, nothing on, or the filters leave nothing. */
@Composable
private fun BoardEmpty(loading: Boolean, filtered: Boolean) {
    val text = when {
        loading -> R.string.sports_board_looking
        filtered -> R.string.sports_board_nothing_filtered
        else -> R.string.sports_empty_nothing
    }
    Text(
        stringResource(text), style = stageText(22, 600), color = StageColors.Muted, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(top = 90.mpx),
    )
}

/** One programme: the first channel's logo, "Handball · THW Kiel – SC Magdeburg", the channel and times, and how far it is. */
@Composable
private fun BoardCard(item: GuideSportItem, now: Long, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val ch = item.channels.first()
    StageRow(onClick = onClick, height = 96.mpx, modifier = modifier.fillMaxWidth(), horizontalPadding = 18.mpx) { _ ->
        ChannelLogoTile(
            logoUrl = ch.displayLogoUrl,
            modifier = Modifier.size(78.mpx, 48.mpx).background(stageStillBack, RoundedCornerShape(10.mpx)),
            fill = Color.Transparent,
        ) {
            androidx.compose.foundation.layout.Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                OwnTVIcon(OwnTVIcon.LIVE_TV, StageColors.Muted, Modifier.size(26.mpx))
            }
        }
        Column(Modifier.weight(1f)) {
            val sep = stringResource(R.string.content_epg_bits_separator)
            Text(
                guideSportLabel(item.sport) + sep + item.title, style = stageText(20, 700), color = StageColors.Text,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            val more = if (item.channels.size > 1) " +" + localizedInteger(item.channels.size - 1) else ""
            Text(
                ch.name + more + sep + stringResource(R.string.content_epg_time_range, timeText(item.startMs), timeText(item.stopMs)),
                style = stageText(18, 400), color = StageColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            val span = (item.stopMs - item.startMs).coerceAtLeast(1)
            StageProgress(((now - item.startMs).toFloat() / span).coerceIn(0f, 1f), Modifier.padding(top = 7.mpx).fillMaxWidth(), flat = true)
        }
    }
}
