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
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.format.localizedInteger
import tv.own.owntv.ui.components.ChannelLogoTile
import tv.own.owntv.ui.stage.StageProgress
import tv.own.owntv.ui.stage.StageRow
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
    onPlay: (GuideSportItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var sports by remember { mutableStateOf(emptySet<GuideSport>()) }
    var countries by remember { mutableStateOf(emptySet<String>()) }
    var sort by rememberSaveable { mutableStateOf(BoardSort.TIME) }
    val shown = remember(items, query, sports, countries, sort) { SportsBoardFilter.apply(items, query, sports, countries, sort) }
    val sportList = remember(items) { SportsBoardFilter.sports(items) }
    val countryList = remember(items) { SportsBoardFilter.countries(items) }
    val locale = LocalConfiguration.current.locales[0]

    BoxWithConstraints(modifier.fillMaxSize()) {
        val gridWidth = maxWidth * (1560f / 1920f)
        val side = (maxWidth - gridWidth) / 2
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxSize().focusGroup(),
            contentPadding = PaddingValues(start = side, end = side, top = 36.mpx, bottom = 110.mpx),
            horizontalArrangement = Arrangement.spacedBy(20.mpx),
            verticalArrangement = Arrangement.spacedBy(10.mpx),
        ) {
            item(key = "title", span = { GridItemSpan(maxLineSpan) }) { BoardTitle(shown.size) }
            item(key = "search", span = { GridItemSpan(maxLineSpan) }) {
                // The field in the middle; the sort button at the right end of the same line.
                androidx.compose.foundation.layout.Box(Modifier.fillMaxWidth().padding(top = 10.mpx)) {
                    StageSearchField(
                        query = query,
                        onQueryChange = { query = it },
                        placeholder = stringResource(R.string.sports_board_search),
                        modifier = Modifier.align(Alignment.Center).widthIn(max = 860.mpx).fillMaxWidth(0.55f).focusRequester(searchFocus),
                    )
                    StageTool(
                        text = null, icon = OwnTVIcon.SORT, value = stringResource(sortLabel(sort)),
                        onClick = { sort = BoardSort.entries[(sort.ordinal + 1) % BoardSort.entries.size] },
                        boxed = true,
                        modifier = Modifier.align(Alignment.CenterEnd),
                    )
                }
            }
            if (sportList.size > 1) item(key = "sports", span = { GridItemSpan(maxLineSpan) }) {
                FilterRow(Modifier.padding(top = 14.mpx)) {
                    item(key = "all") {
                        StageTab(stringResource(R.string.content_epg_all), localizedInteger(items.size), sports.isEmpty(), { sports = emptySet() }, centered = true)
                    }
                    items(sportList, key = { it.name }) { s ->
                        StageTab(
                            guideSportLabel(s), localizedInteger(items.count { it.sport == s }), s in sports,
                            { sports = if (s in sports) sports - s else sports + s },
                            centered = true,
                        )
                    }
                }
            }
            if (countryList.size > 1) item(key = "countries", span = { GridItemSpan(maxLineSpan) }) {
                FilterRow(Modifier.padding(top = 8.mpx)) {
                    item(key = "all") {
                        StageTab(stringResource(R.string.sports_board_all_countries), localizedInteger(items.size), countries.isEmpty(), { countries = emptySet() }, centered = true)
                    }
                    items(countryList, key = { it }) { code ->
                        StageTab(
                            countryName(code, locale), localizedInteger(items.count { SportsBoardFilter.countryOf(it) == code }), code in countries,
                            { countries = if (code in countries) countries - code else countries + code },
                            centered = true,
                        )
                    }
                }
            }
            if (shown.isEmpty()) {
                item(key = "empty", span = { GridItemSpan(maxLineSpan) }) {
                    BoardEmpty(loading, query.isNotBlank() || sports.isNotEmpty() || countries.isNotEmpty())
                }
            }
            gridItems(shown, key = { "${it.sport.name}|${it.title}|${it.startMs}" }) { item ->
                BoardCard(item, now) { onPlay(item) }
            }
        }
    }
}

private fun sortLabel(sort: BoardSort): Int = when (sort) {
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
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.Bottom) {
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
private fun BoardCard(item: GuideSportItem, now: Long, onClick: () -> Unit) {
    val ch = item.channels.first()
    StageRow(onClick = onClick, height = 96.mpx, modifier = Modifier.fillMaxWidth(), horizontalPadding = 18.mpx) { _ ->
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
