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
 * The TV-box player's second step (▼ again under the channel info): one even row of tools, each a glyph over
 * its caption, standing straight on the shade with no box around it. Focus is a white disc under the glyph
 * and a bolder caption, the way a TV's own menus show it.
 */
@Composable
internal fun TvBoxActionRow(actions: List<TvBoxAction>, firstFocus: FocusRequester, modifier: Modifier = Modifier, onLeftEdge: (() -> Unit)? = null) {
    androidx.compose.foundation.layout.Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        actions.forEachIndexed { i, action ->
            val interaction = remember { MutableInteractionSource() }
            val focused = interaction.collectIsFocusedAsState().value
            val tint = when {
                focused -> Color(0xFF16181D)
                action.active -> tv.own.owntv.ui.brand.SkMateBlue
                else -> Color.White.copy(alpha = 0.86f)
            }
            Column(
                Modifier
                    .weight(1f)
                    .then(if (i == 0) Modifier.focusRequester(firstFocus) else Modifier)
                    .onKeyEvent { e ->
                        if (e.type == KeyEventType.KeyUp && (e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter)) {
                            action.onClick(); true
                        } else if (i == 0 && onLeftEdge != null && e.type == KeyEventType.KeyDown && e.key == Key.DirectionLeft) {
                            onLeftEdge(); true
                        } else false
                    }
                    .focusable(interactionSource = interaction),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.mpx),
            ) {
                Box(
                    Modifier.size(64.mpx).background(if (focused) Color.White else Color.Transparent, androidx.compose.foundation.shape.CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    tv.own.owntv.ui.components.OwnTVIcon(action.icon, tint, Modifier.size(32.mpx), filled = action.active)
                }
                Text(
                    action.label,
                    style = stageText(18, if (focused) 700 else 500),
                    color = if (focused) Color.White else Color.White.copy(alpha = 0.78f),
                    maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 4.mpx),
                )
            }
        }
    }
}

/** The TV-box player's bottom shade: clear above, dark under the info and the tiles. */
internal val TvBoxShade = Color(0xB3000000)


/** A focus holder for the info step: nothing to press, but the keys have to land somewhere. */
@Composable
internal fun TvBoxInfoFocus(focus: FocusRequester, modifier: Modifier = Modifier) {
    Box(modifier.size(1.mpx).focusRequester(focus).focusable())
}
