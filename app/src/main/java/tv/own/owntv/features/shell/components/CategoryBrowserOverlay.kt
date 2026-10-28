package tv.own.owntv.features.shell.components

import androidx.activity.compose.BackHandler
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.koin.androidx.compose.koinViewModel
import tv.own.owntv.core.i18n.HorizontalDirection
import tv.own.owntv.core.i18n.horizontalDirection
import tv.own.owntv.core.live.LiveKey
import tv.own.owntv.features.live.LiveCategories
import tv.own.owntv.features.live.LiveRailItem
import tv.own.owntv.features.live.liveCategoryEntries
import tv.own.owntv.features.settings.SettingsViewModel
import tv.own.owntv.ui.components.chNavPaging
import tv.own.owntv.ui.theme.gradientWash
import tv.own.owntv.ui.theme.mpx

/**
 * Category sheet that slides in over the playing video when the user presses Left a second time
 * inside the in-player channel list: Live TV's own category sheet ([LiveCategories]), 20 from the
 * screen edge — search, Favorites / Recently watched / Catch-up / All channels with their counts, then
 * the provider groups with their tags (customizations applied: hidden categories excluded, renames
 * shown, manual order respected). OK loads that category's channels into the channel-list overlay;
 * Back or Left returns to the channel list without changing anything. The playing list's category is
 * the selected one and is focused first. The remote's paging keys page through it, as in the channel list.
 */
@Composable
fun CategoryBrowserOverlay(
    railItems: List<LiveRailItem>,
    railCounts: Map<LiveKey, Int>,
    currentKey: LiveKey?,
    onSelect: (LiveKey) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val layoutDirection = LocalLayoutDirection.current
    val (entries, groupsHeading) = liveCategoryEntries(railItems, railCounts)
    val selectedIndex = remember(entries, currentKey) { entries.indexOfFirst { it.item.key == currentKey }.coerceAtLeast(0) }
    val listState = rememberLazyListState()
    val listFocus = remember { FocusRequester() }
    // Paging moves focus by setting the row to land on; the sheet scrolls to it and reports back.
    var focusRow by remember { mutableStateOf<Int?>(null) }
    var focusedIndex by remember(selectedIndex) { mutableIntStateOf(selectedIndex) }
    var hasFocus by remember { mutableStateOf(false) }
    // While the search is being typed in, ◀/▶ move the text cursor; OK or Back ends typing first.
    var typing by remember { mutableStateOf(false) }
    val settingsVm: SettingsViewModel = koinViewModel()
    val chNavEnabled by settingsVm.chNavEnabled.collectAsStateWithLifecycle()
    val chNavUpSkip by settingsVm.chNavUpSkip.collectAsStateWithLifecycle()
    val chNavDownSkip by settingsVm.chNavDownSkip.collectAsStateWithLifecycle()

    // Entering the sheet's list lands on the selected category (its focusProperties.onEnter). Focusing
    // it scrolls it to the top edge, hiding the search and the fixed entries above it; when the
    // selected row fits on the first screen, keep the list at its top as the Live TV sheet shows it.
    LaunchedEffect(Unit) {
        runCatching { listFocus.requestFocus() }
        withFrameNanos { }
        if (selectedIndex < FIRST_SCREEN_ROWS) runCatching { listState.scrollToItem(0) }
    }

    BackHandler { onDismiss() }

    val shade = tv.own.owntv.ui.theme.stageTone(Color(2, 5, 6), Color(244, 247, 245))
    Box(
        modifier = modifier
            .fillMaxSize()
            .then(if (tv.own.owntv.features.shell.TvBoxNav) Modifier else Modifier.gradientWash(false, 0f to shade.copy(alpha = 0.72f), 0.38f to shade.copy(alpha = 0.45f), 0.62f to Color.Transparent)),
    ) {
        LiveCategories(
            entries = entries,
            selectedIndex = selectedIndex,
            groupsHeading = groupsHeading,
            sheet = true,
            listState = listState,
            onSelect = { onSelect(entries[it].item.key) },
            onLongSelect = {},
            // TV-box look: ▶ goes back to the channel list beside it.
            onNavigateRight = { if (tv.own.owntv.features.shell.TvBoxNav) onDismiss() },
            focusRequester = listFocus,
            focusRowIndex = focusRow,
            onRowFocused = { focusRow = null },
            onRowFocus = { focusedIndex = it },
            onSearchEditingChange = { typing = it },
            modifier = Modifier
                .align(Alignment.CenterStart)
                // TV-box look: flush with the left edge, the full height.
                .then(if (tv.own.owntv.features.shell.TvBoxNav) Modifier else Modifier.padding(horizontal = 20.mpx, vertical = 22.mpx))
                .width(440.mpx)
                .fillMaxHeight()
                .onFocusChanged { hasFocus = it.hasFocus }
                .onPreviewKeyEvent { e ->
                    // Pushing outward from logical Start returns to the channel list.
                    if (!typing && e.type == KeyEventType.KeyDown && e.key.horizontalDirection(layoutDirection) == HorizontalDirection.START) {
                        onDismiss(); true
                    } else false
                }
                .chNavPaging(
                    enabled = chNavEnabled,
                    upSkip = chNavUpSkip,
                    downSkip = chNavDownSkip,
                    isFocused = { hasFocus },
                    lastIndex = { entries.lastIndex },
                    currentTargetIndex = { focusedIndex },
                    onJumpToIndex = { focusRow = it },
                ),
        )
    }
}

/** Rows that fit on the sheet's first screen below the search field, the fixed entries included. */
private const val FIRST_SCREEN_ROWS = 10

/**
 * The TV-box player's categories: a column at the left edge beside the channel panel, a hairline between
 * them, one large row per category (icon, name, count) in the theme's glass — the focused one a white card,
 * the playing list's category in brand blue. Focus resting on another counts down 3, 2, 1 and opens it;
 * OK opens it at once, holding OK offers its options, ▶ or Back returns to the channels, ◀ the app menu.
 */
@Composable
fun TvBoxCategoryColumn(
    railItems: List<LiveRailItem>,
    railCounts: Map<LiveKey, Int>,
    currentKey: LiveKey?,
    onSelect: (LiveKey) -> Unit,
    onDismiss: () -> Unit,
    width: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier,
    onLongSelect: (LiveRailItem) -> Unit = {},
    onOpenMenu: (() -> Unit)? = null,
) {
    val c = tvBoxPanelColors()
    val (entries, _) = liveCategoryEntries(railItems, railCounts)
    val selectedIndex = remember(entries, currentKey) { entries.indexOfFirst { it.item.key == currentKey }.coerceAtLeast(0) }
    val listState = rememberLazyListState()
    val focus = remember { FocusRequester() }
    var focusedIndex by remember { mutableIntStateOf(selectedIndex) }
    var countdown by remember { mutableIntStateOf(0) }
    val select by androidx.compose.runtime.rememberUpdatedState(onSelect)
    LaunchedEffect(Unit) {
        runCatching { listState.scrollToItem((selectedIndex - 3).coerceAtLeast(0)) }
        withFrameNanos { }
        runCatching { focus.requestFocus() }
    }
    LaunchedEffect(focusedIndex, selectedIndex) {
        countdown = 0
        if (focusedIndex == selectedIndex) return@LaunchedEffect
        val key = entries.getOrNull(focusedIndex)?.item?.key ?: return@LaunchedEffect
        try {
            kotlinx.coroutines.delay(CategoryQuietMs)
            for (n in 3 downTo 1) { countdown = n; kotlinx.coroutines.delay(CategoryStepMs) }
            countdown = 0
            select(key)
        } finally { countdown = 0 }
    }
    BackHandler { onDismiss() }
    androidx.compose.foundation.layout.Column(
        modifier.width(width).fillMaxHeight()
            .drawBehind { drawRect(c.line, topLeft = androidx.compose.ui.geometry.Offset(size.width - 1.mpx.toPx(), 0f), size = androidx.compose.ui.geometry.Size(1.mpx.toPx(), size.height)) }
            .onPreviewKeyEvent { e ->
                if (e.type == KeyEventType.KeyDown && e.key == Key.DirectionRight) { onDismiss(); true }
                else if (e.type == KeyEventType.KeyDown && e.key == Key.DirectionLeft) { onOpenMenu?.invoke(); true }
                else false
            }
            .padding(top = 36.mpx),
    ) {
        androidx.tv.material3.Text(
            androidx.compose.ui.res.stringResource(tv.own.owntv.R.string.content_category_browser_title),
            style = tv.own.owntv.ui.theme.stageText(24, 700), color = c.text, maxLines = 1,
            modifier = Modifier.padding(horizontal = 28.mpx),
        )
        androidx.compose.foundation.lazy.LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxWidth().weight(1f).padding(top = 14.mpx),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 12.mpx, end = 12.mpx, bottom = 24.mpx),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(4.mpx),
        ) {
            itemsIndexed(entries, key = { _, e -> e.item.key.toString() }) { index, entry ->
                val interaction = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
                val focused = interaction.collectIsFocusedAsState().value
                val ink = if (focused) c.focusInk else c.text
                val chosen = index == selectedIndex
                val shape = androidx.compose.foundation.shape.RoundedCornerShape(12.mpx)
                androidx.compose.foundation.layout.Row(
                    Modifier.fillMaxWidth().height(68.mpx)
                        .then(if (index == selectedIndex) Modifier.focusRequester(focus) else Modifier)
                        .then(if (focused) Modifier.shadow(3.mpx, shape, clip = false, ambientColor = Color(0x33000000), spotColor = Color(0x33000000)) else Modifier)
                        .background(if (focused) c.focus else Color.Transparent, shape)
                        .onFocusChanged { if (it.isFocused) focusedIndex = index }
                        .combinedClickable(interactionSource = interaction, indication = null, onLongClick = { onLongSelect(entry.item) }) { select(entry.item.key) }
                        .padding(horizontal = 18.mpx),
                    horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.mpx),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val tint = if (chosen && !focused) tv.own.owntv.ui.brand.SkMateBlue else ink
                    tv.own.owntv.ui.components.OwnTVIcon(entry.icon ?: tv.own.owntv.ui.components.OwnTVIcon.LIVE_TV, tint.copy(alpha = if (focused || chosen) 1f else 0.7f), Modifier.size(24.mpx))
                    androidx.tv.material3.Text(
                        entry.label, style = tv.own.owntv.ui.theme.stageText(21, if (chosen) 700 else 600), color = tint,
                        maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                    )
                    if (countdown > 0 && index == focusedIndex) CategoryCountdownRing(countdown)
                    else entry.count?.let {
                        androidx.tv.material3.Text(tv.own.owntv.ui.components.formatCount(it), style = tv.own.owntv.ui.theme.stageText(17, 600), color = ink.copy(alpha = 0.55f), maxLines = 1)
                    }
                }
            }
        }
    }
}

/** "3", "2", "1" in a brand-blue ring that fills until the category opens. */
@Composable
private fun CategoryCountdownRing(n: Int) {
    val blue = tv.own.owntv.ui.brand.SkMateBlue
    val progress = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(Unit) {
        progress.animateTo(1f, androidx.compose.animation.core.tween((3 * CategoryStepMs).toInt(), easing = androidx.compose.animation.core.LinearEasing))
    }
    Box(
        Modifier.size(30.mpx).drawBehind {
            val w = 2.5f * 1.mpx.toPx()
            val arc = androidx.compose.ui.geometry.Size(size.width - w, size.height - w)
            val tl = androidx.compose.ui.geometry.Offset(w / 2, w / 2)
            drawArc(blue.copy(alpha = 0.2f), 0f, 360f, false, topLeft = tl, size = arc, style = androidx.compose.ui.graphics.drawscope.Stroke(w))
            drawArc(blue, -90f, 360f * progress.value, false, topLeft = tl, size = arc, style = androidx.compose.ui.graphics.drawscope.Stroke(w, cap = androidx.compose.ui.graphics.StrokeCap.Round))
        },
        contentAlignment = Alignment.Center,
    ) { androidx.tv.material3.Text(n.toString(), style = tv.own.owntv.ui.theme.stageText(15, 800), color = blue, maxLines = 1) }
}

private const val CategoryQuietMs = 400L
private const val CategoryStepMs = 700L
