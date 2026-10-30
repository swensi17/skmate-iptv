package tv.own.owntv.features.live

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import tv.own.owntv.R
import tv.own.owntv.core.content.SmartPick
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.live.LiveSortModes
import tv.own.owntv.core.settings.SettingsRepository.SortMode
import tv.own.owntv.features.epg.GuideMenuHost
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.stage.StageMenuHeader
import tv.own.owntv.ui.stage.StageMenuItem
import tv.own.owntv.ui.stage.StageTool
import tv.own.owntv.ui.theme.mpx

private fun liveSortName(mode: SortMode): Int = when (mode) {
    SortMode.ALPHA -> R.string.settings_sort_alpha
    SortMode.ALPHA_DESC -> R.string.live_sort_alpha_desc
    SortMode.NUMBER -> R.string.live_sort_number
    SortMode.RECENT -> R.string.live_sort_recent
    else -> R.string.content_sort_provider_order
}

private fun liveSortHint(mode: SortMode): Int = when (mode) {
    SortMode.ALPHA -> R.string.live_sort_alpha_hint
    SortMode.ALPHA_DESC -> R.string.live_sort_alpha_desc_hint
    SortMode.NUMBER -> R.string.live_sort_number_hint
    SortMode.RECENT -> R.string.live_sort_recent_hint
    else -> R.string.content_sort_provider_order_hint
}

/** The button is only the icon and the chosen order ("A–Z"), so it never squeezes the search field. */
@Composable
internal fun LiveSortTool(mode: SortMode, boxed: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val label = stringResource(if (mode == SortMode.PLAYLIST) R.string.content_epg_sort_provider else liveSortName(mode))
    StageTool(text = null, icon = OwnTVIcon.SORT, value = label, onClick = onClick, boxed = boxed, modifier = modifier)
}

/** Sort channels: every order with a one-line explanation, a tick on the current one. */
@Composable
internal fun LiveSortMenu(current: SortMode, x: Float, top: Dp, onPick: (SortMode) -> Unit, onDismiss: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    GuideMenuHost(x = x, top = top, width = 560.mpx, onDismiss = onDismiss) {
        StageMenuHeader(title = stringResource(R.string.live_sort_title), subtitle = stringResource(R.string.content_sort_applies_hint))
        LiveSortModes.forEach { mode ->
            val on = mode == current
            StageMenuItem(
                text = stringResource(liveSortName(mode)), icon = OwnTVIcon.SORT,
                value = if (on) null else stringResource(liveSortHint(mode)), checked = on,
                onClick = { onPick(mode); onDismiss() },
                modifier = if (on) Modifier.focusRequester(focus) else Modifier,
            )
        }
    }
}

/** "More" tool: icon only, so it costs the search field almost nothing. */
@Composable
internal fun LiveMoreTool(boxed: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    StageTool(text = null, icon = OwnTVIcon.MORE, onClick = onClick, boxed = boxed, modifier = modifier)
}

/** The list's extra actions: today only "Fix the guide", each with a line saying what it does. */
@Composable
internal fun LiveMoreMenu(x: Float, top: Dp, fixing: Boolean, onFixGuide: () -> Unit, onPick: (SmartPick) -> Unit, onDismiss: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    GuideMenuHost(x = x, top = top, width = 760.mpx, onDismiss = onDismiss) {
        StageMenuHeader(title = stringResource(R.string.live_more_title), subtitle = null)
        StageMenuItem(
            text = stringResource(R.string.live_fix_guide),
            icon = OwnTVIcon.SPARKLE,
            value = stringResource(if (fixing) R.string.live_fix_guide_running else R.string.live_fix_guide_hint),
            onClick = { if (!fixing) onFixGuide(); onDismiss() },
            modifier = Modifier.focusRequester(focus),
        )
        SmartPick.entries.forEach { pick ->
            StageMenuItem(
                text = stringResource(R.string.live_pick_now, stringResource(pickName(pick))),
                icon = OwnTVIcon.LIVE_DOT,
                onClick = { onPick(pick); onDismiss() },
            )
        }
    }
}

private fun pickName(pick: SmartPick): Int = when (pick) {
    SmartPick.SPORT -> R.string.live_pick_sport
    SmartPick.MOVIES -> R.string.live_pick_movies
    SmartPick.NEWS -> R.string.live_pick_news
    SmartPick.KIDS -> R.string.live_pick_kids
}

/** "On now: Sport": the channels airing a match of it this minute, each with its programme; OK tunes it. */
@Composable
internal fun LivePickMenu(state: LiveViewModel.PickState, x: Float, top: Dp, onWatch: (ChannelEntity) -> Unit, onDismiss: () -> Unit) {
    val focus = remember { FocusRequester() }
    val items = state.items
    LaunchedEffect(items == null) { runCatching { focus.requestFocus() } }
    GuideMenuHost(x = x, top = top, width = 760.mpx, onDismiss = onDismiss) {
        StageMenuHeader(
            title = stringResource(R.string.live_pick_now, stringResource(pickName(state.pick))),
            subtitle = stringResource(R.string.live_pick_hint),
        )
        when {
            items == null -> StageMenuItem(text = stringResource(R.string.live_pick_loading), icon = OwnTVIcon.CLOCK, onClick = {}, modifier = Modifier.focusRequester(focus))
            items.isEmpty() -> StageMenuItem(text = stringResource(R.string.live_pick_empty), icon = OwnTVIcon.INFO, onClick = onDismiss, modifier = Modifier.focusRequester(focus))
            else -> items.forEachIndexed { i, hit ->
                StageMenuItem(
                    text = hit.channel.name, icon = OwnTVIcon.LIVE_DOT, value = hit.programme.title,
                    onClick = { onWatch(hit.channel); onDismiss() },
                    modifier = if (i == 0) Modifier.focusRequester(focus) else Modifier,
                )
            }
        }
    }
}
