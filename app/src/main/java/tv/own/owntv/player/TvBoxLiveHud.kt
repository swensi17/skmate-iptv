package tv.own.owntv.player

import androidx.compose.foundation.background
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
internal fun TvBoxActionRow(actions: List<TvBoxAction>, firstFocus: FocusRequester, modifier: Modifier = Modifier) {
    androidx.compose.foundation.layout.Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        actions.forEachIndexed { i, action ->
            val interaction = remember { MutableInteractionSource() }
            val focused = interaction.collectIsFocusedAsState().value
            // OK acts on release, and only for a press that also went down here: the release of the OK
            // that opened the controls, or of one held on the row above, must not toggle a tile.
            var okDown by remember { mutableStateOf(false) }
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
                        val ok = e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter
                        if (ok && e.type == KeyEventType.KeyDown) {
                            if (e.nativeKeyEvent.repeatCount == 0) okDown = true
                            true
                        } else if (ok && e.type == KeyEventType.KeyUp) {
                            if (okDown) { okDown = false; action.onClick() }
                            true
                        } else {
                            // The row's ends are walls: ◀ on the first tile and ▶ on the last stay put
                            // instead of escaping to the channel list or history behind the player.
                            val first = i == 0 && e.key == Key.DirectionLeft
                            val last = i == actions.lastIndex && e.key == Key.DirectionRight
                            e.type == KeyEventType.KeyDown && (first || last)
                        }
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

/**
 * A recently watched channel for the row under the tiles: its name, logo, what is on it ([nowTitle] from
 * [startMs] to [stopMs], when the guide knows) and what OK on it does.
 */
class TvBoxRecent(
    val id: Long,
    val name: String,
    val logoUrl: String?,
    val nowTitle: String?,
    val startMs: Long,
    val stopMs: Long,
    val onClick: () -> Unit,
)

/** Up to [TV_BOX_RECENT_MAX] channels watched before this one, newest first; empty where there is no history. */
val LocalTvBoxRecent = androidx.compose.runtime.compositionLocalOf<List<TvBoxRecent>> { emptyList() }

/** How many recently watched channels the row under the tiles shows. */
const val TV_BOX_RECENT_MAX = 10

/**
 * The channels watched before this one, under the tiles: a logo card each with its name under it, the focused one
 * in a white frame. ▲ goes back to the tiles, OK switches to the channel. [onFocusIn] says whether focus is here.
 */
@Composable
internal fun TvBoxRecentRow(
    recents: List<TvBoxRecent>,
    firstFocus: FocusRequester,
    /** Cards before the channels (the guide, the history), drawn the same way with their mark and name. */
    lead: List<TvBoxAction> = emptyList(),
    onFocusIn: (Boolean) -> Unit,
    onPick: (TvBoxRecent) -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().onFocusChanged { onFocusIn(it.hasFocus) },
        verticalArrangement = Arrangement.spacedBy(12.mpx),
    ) {
        Text(
            androidx.compose.ui.res.stringResource(tv.own.owntv.R.string.content_category_recently_watched),
            style = stageText(RECENT_TITLE, 700), color = Color.White.copy(alpha = 0.86f),
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        // One clock for every card's bar: half a minute is the finest step a bar this short shows.
        val now by androidx.compose.runtime.produceState(System.currentTimeMillis()) {
            while (true) {
                kotlinx.coroutines.delay(RECENT_TICK_MS - System.currentTimeMillis() % RECENT_TICK_MS)
                value = System.currentTimeMillis()
            }
        }
        androidx.compose.foundation.lazy.LazyRow(
            horizontalArrangement = Arrangement.spacedBy(RECENT_GAP.mpx),
            // Room for the focused card to grow without being cut at the row's edges.
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = RECENT_EDGE.mpx, vertical = RECENT_EDGE.mpx),
        ) {
            items(lead.size, key = { "lead$it" }) { i ->
                recentLeadCard(lead[i], first = i == 0, firstFocus = firstFocus)
            }
            items(recents.size, key = { recents[it].id }) { i ->
                val r = recents[i]
                val interaction = remember { MutableInteractionSource() }
                val focused = interaction.collectIsFocusedAsState().value
                var okDown by remember { mutableStateOf(false) }
                // A square card: the logo on its own darker tile, what is on under it, and how far it has got along
                // the card's foot. The focused one grows a little and lightens.
                val grow by androidx.compose.animation.core.animateFloatAsState(if (focused) RECENT_GROW else 1f, label = "recentGrow")
                val shape = RoundedCornerShape(RECENT_RADIUS.mpx)
                val onAir = r.nowTitle != null && now in r.startMs until r.stopMs
                // The card takes the logo's own colour; the frame alone while it is not known yet.
                val tint = tv.own.owntv.ui.components.rememberLogoTint(r.logoUrl)
                Box(
                    Modifier.size(RECENT_CARD_W.mpx, RECENT_CARD_H.mpx)
                        .graphicsLayer { scaleX = grow; scaleY = grow }
                        .then(if (i == 0 && lead.isEmpty()) Modifier.focusRequester(firstFocus) else Modifier)
                        .clip(shape)
                        .background((tint ?: RecentMatte).let { if (focused) androidx.compose.ui.graphics.lerp(it, Color.White, RECENT_FOCUS_FILL) else it })
                        .then(if (focused) Modifier.border(RECENT_RING.mpx, Color.White, shape) else Modifier)
                        .onKeyEvent { e ->
                            val ok = e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter
                            when {
                                ok && e.type == KeyEventType.KeyDown -> { if (e.nativeKeyEvent.repeatCount == 0) okDown = true; true }
                                ok && e.type == KeyEventType.KeyUp -> { if (okDown) { okDown = false; onPick(r) }; true }
                                else -> {
                                    val wallLeft = i == 0 && lead.isEmpty() && e.key == Key.DirectionLeft
                                    val wallRight = i == recents.lastIndex && e.key == Key.DirectionRight
                                    e.type == KeyEventType.KeyDown && (wallLeft || wallRight)
                                }
                            }
                        }
                        .focusable(interactionSource = interaction),
                ) {
                    Column(
                        Modifier.fillMaxSize().padding(horizontal = RECENT_PAD.mpx, vertical = RECENT_PAD_TOP.mpx),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.mpx),
                    ) {
                        Box(
                            Modifier.size(RECENT_LOGO.mpx).padding(RECENT_LOGO_PAD.mpx),
                            contentAlignment = Alignment.Center,
                        ) {
                            tv.own.owntv.ui.components.ChannelLogoTile(
                                logoUrl = r.logoUrl, modifier = Modifier.fillMaxSize(), fill = Color.Transparent,
                            ) { tv.own.owntv.ui.components.OwnTVIcon(OwnTVIcon.LIVE_TV, Color.White.copy(alpha = 0.6f), Modifier.size(34.mpx)) }
                        }
                        Text(
                            if (onAir) r.nowTitle.orEmpty() else r.name,
                            style = stageText(RECENT_NAME, if (focused) 600 else 500),
                            color = if (focused) Color.White else Color.White.copy(alpha = RECENT_TEXT_ALPHA),
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    if (onAir) {
                        val done = ((now - r.startMs).toFloat() / (r.stopMs - r.startMs).coerceAtLeast(1)).coerceIn(0f, 1f)
                        Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(RECENT_BAR_H.mpx).background(Color.White.copy(alpha = 0.14f)))
                        Box(
                            Modifier.align(Alignment.BottomStart).fillMaxWidth(done).height(RECENT_BAR_H.mpx)
                                .background(Color.White.copy(alpha = 0.7f)),
                        )
                    }
                }
            }
        }
    }
}

/** One of the cards before the channels: its mark over its name on the matte grey, in the channels' size. */
@Composable
private fun recentLeadCard(action: TvBoxAction, first: Boolean, firstFocus: FocusRequester) {
    val interaction = remember { MutableInteractionSource() }
    val focused = interaction.collectIsFocusedAsState().value
    var okDown by remember { mutableStateOf(false) }
    val grow by androidx.compose.animation.core.animateFloatAsState(if (focused) RECENT_GROW else 1f, label = "leadGrow")
    val shape = RoundedCornerShape(RECENT_RADIUS.mpx)
    Column(
        Modifier.size(RECENT_CARD_W.mpx, RECENT_CARD_H.mpx)
            .graphicsLayer { scaleX = grow; scaleY = grow }
            .then(if (first) Modifier.focusRequester(firstFocus) else Modifier)
            .clip(shape)
            .background(if (focused) androidx.compose.ui.graphics.lerp(RecentMatte, Color.White, RECENT_FOCUS_FILL) else RecentMatte)
            .then(if (focused) Modifier.border(RECENT_RING.mpx, Color.White, shape) else Modifier)
            .onKeyEvent { e ->
                val ok = e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter
                when {
                    ok && e.type == KeyEventType.KeyDown -> { if (e.nativeKeyEvent.repeatCount == 0) okDown = true; true }
                    ok && e.type == KeyEventType.KeyUp -> { if (okDown) { okDown = false; action.onClick() }; true }
                    else -> e.type == KeyEventType.KeyDown && first && e.key == Key.DirectionLeft
                }
            }
            .focusable(interactionSource = interaction)
            .padding(RECENT_PAD.mpx),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.mpx, Alignment.CenterVertically),
    ) {
        tv.own.owntv.ui.components.OwnTVIcon(action.icon, Color.White, Modifier.size(RECENT_LEAD_ICON.mpx))
        Text(
            action.label, style = stageText(RECENT_NAME, if (focused) 600 else 500), color = Color.White,
            maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
        )
    }
}

private const val RECENT_LEAD_ICON = 40

/** A matte card in the logo's colour (a dark grey for a white or black logo); focus lightens it and adds a white ring. */
private val RecentMatte = Color(0xFF30343A)
private const val RECENT_RING = 2
private const val RECENT_FOCUS_FILL = 0.12f
private const val RECENT_TEXT_ALPHA = 0.8f

private const val RECENT_TITLE = 20
private const val RECENT_GAP = 14
private const val RECENT_CARD_W = 184
private const val RECENT_CARD_H = 122
private const val RECENT_RADIUS = 12
private const val RECENT_PAD = 12
private const val RECENT_PAD_TOP = 10
private const val RECENT_LOGO = 70
private const val RECENT_LOGO_PAD = 4
private const val RECENT_GROW = 1.06f
private const val RECENT_NAME = 16
private const val RECENT_BAR_H = 4
private const val RECENT_EDGE = 10
private const val RECENT_TICK_MS = 30_000L

/** The TV-box player's bottom shade: clear above, dark under the info and the tiles. */
internal val TvBoxShade = Color(0xB3000000)

/** A focus holder for the info step: nothing to press, but the keys have to land somewhere. */
@Composable
internal fun TvBoxInfoFocus(focus: FocusRequester, modifier: Modifier = Modifier) {
    Box(modifier.size(1.mpx).focusRequester(focus).focusable())
}
