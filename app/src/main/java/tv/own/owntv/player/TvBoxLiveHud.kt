package tv.own.owntv.player

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.tv.material3.Text
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/** One button of the TV-box player's action row: what it says, its icon and what it does. */
internal data class TvBoxAction(val label: String, val icon: OwnTVIcon, val onClick: () -> Unit, val active: Boolean = false)

/**
 * The TV-box player's second step (▼ again under the channel info): a row of square tiles — the guide,
 * the channel list, history, the previous channel, favourites, sound, subtitles, picture format. Dark
 * glass over the picture; the focused tile turns white with dark text, as the side panels do.
 */
@Composable
internal fun TvBoxActionRow(actions: List<TvBoxAction>, firstFocus: FocusRequester, modifier: Modifier = Modifier, onLeftEdge: (() -> Unit)? = null) {
    // The tiles share the whole width, as many as there are.
    androidx.compose.foundation.layout.Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.mpx),
    ) {
        actions.forEachIndexed { i, action ->
            val interaction = remember { MutableInteractionSource() }
            val focused = interaction.collectIsFocusedAsState().value
            val ink = if (focused) Color(0xFF16181D) else Color.White
            Box(
                Modifier
                    .weight(1f)
                    .then(if (i == 0) Modifier.focusRequester(firstFocus) else Modifier)
                    .height(132.mpx)
                    .background(if (focused) Color.White else TvBoxTileFill, RoundedCornerShape(TvBoxTileRadius))
                    .onKeyEvent { e ->
                        if (e.type == KeyEventType.KeyUp && (e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter)) {
                            action.onClick(); true
                        } else if (i == 0 && onLeftEdge != null && e.type == KeyEventType.KeyDown && e.key == Key.DirectionLeft) {
                            onLeftEdge(); true
                        } else false
                    }
                    .focusable(interactionSource = interaction),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.mpx)) {
                    tv.own.owntv.ui.components.OwnTVIcon(action.icon, if (action.active && !focused) tv.own.owntv.ui.brand.SkMateBlue else ink, Modifier.size(38.mpx), filled = action.active)
                    Text(
                        action.label, style = stageText(19, 600), color = ink, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 10.mpx),
                    )
                }
            }
        }
    }
}

/** The TV-box player's bottom shade: clear above, dark under the info and the tiles. */
internal val TvBoxShade = Color(0xB3000000)

private val TvBoxTileFill = Color(0x2EFFFFFF)
private val TvBoxTileRadius = 14.mpx

/** A focus holder for the info step: nothing to press, but the keys have to land somewhere. */
@Composable
internal fun TvBoxInfoFocus(focus: FocusRequester, modifier: Modifier = Modifier) {
    Box(modifier.size(1.mpx).focusRequester(focus).focusable())
}
