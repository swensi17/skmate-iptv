package tv.own.owntv.ui.stage

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.window.DialogWindowProvider
import androidx.tv.material3.Text
import kotlinx.coroutines.flow.first
import tv.own.owntv.ui.components.OwnTVPopup
import tv.own.owntv.ui.components.trapAllFocusExit
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/**
 * Android TV's system-style side panel: full height on the right, sliding in from the edge over a
 * dimmed screen and back out to it. Back or a tap beside it closes it. For short single-choice lists
 * (language); [content] is the list and gets `close`, which slides the panel out and then calls
 * [onDismiss] (call it instead of [onDismiss] after a choice, so every way out looks the same).
 */
@Composable
fun StageSidePanel(
    onDismiss: () -> Unit,
    title: String,
    subtitle: String? = null,
    width: Dp = 620.mpx,
    content: @Composable ColumnScope.(close: () -> Unit) -> Unit,
) {
    val shown = remember { MutableTransitionState(false).apply { targetState = true } }
    var closing by remember { mutableStateOf(false) }
    val dismiss by rememberUpdatedState(onDismiss)
    val close: () -> Unit = { if (!closing) { closing = true; shown.targetState = false } }
    LaunchedEffect(closing) {
        if (closing) {
            snapshotFlow { shown.isIdle && !shown.currentState }.first { it }
            dismiss()
        }
    }
    OwnTVPopup(onDismissRequest = close, dismissOnBackPress = true, stageLayout = true) {
        // The panel animates itself; the dialog window's own animation (a rise and fade) would fight it.
        val view = LocalView.current
        SideEffect {
            var parent = view.parent
            while (parent != null && parent !is DialogWindowProvider) parent = parent.parent
            (parent as? DialogWindowProvider)?.window?.setWindowAnimations(0)
        }
        val scrim by animateFloatAsState(if (shown.targetState) 1f else 0f, tween(PanelMs), label = "panelScrim")
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = scrim }
                .background(PanelScrim),
        )
        Box(
            Modifier
                .fillMaxSize()
                .pointerInput(Unit) { detectTapGestures { close() } }
                .trapAllFocusExit()
                .focusGroup(),
            contentAlignment = Alignment.CenterEnd,
        ) {
            AnimatedVisibility(
                visibleState = shown,
                enter = slideInHorizontally(tween(PanelMs)) { it } + fadeIn(tween(PanelMs)),
                exit = slideOutHorizontally(tween(PanelMs)) { it } + fadeOut(tween(PanelMs)),
            ) {
                Column(
                    Modifier
                        .width(width)
                        .fillMaxHeight()
                        .background(if (tv.own.owntv.ui.theme.LocalStagePalette.current.isLight) Color.White else PanelFill)
                        .pointerInput(Unit) { detectTapGestures { } }
                        .padding(horizontal = 28.mpx, vertical = 48.mpx),
                ) {
                    Text(title, style = stageText(34, 800), color = StageColors.Text, modifier = Modifier.padding(start = 22.mpx, bottom = if (subtitle == null) 24.mpx else 8.mpx))
                    if (subtitle != null) {
                        Text(subtitle, style = stageText(17, 500), color = StageColors.Muted, modifier = Modifier.padding(start = 22.mpx, end = 22.mpx, bottom = 28.mpx))
                    }
                    content(close)
                }
            }
        }
    }
}

private const val PanelMs = 240
private val PanelFill = Color(0xFF1E2228)
private val PanelScrim = Color(0x8C000000)

/**
 * One choice in a [StageSidePanel]: icon, title and a line under it, a round light highlight while
 * focused; [danger] colours the title and icon red (Remove).
 */
@Composable
fun StageSidePanelOption(
    icon: tv.own.owntv.ui.components.OwnTVIcon,
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    danger: Boolean = false,
) {
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(16.mpx)
    StageSurface(
        onClick = onClick,
        radius = 16.mpx,
        focusStyle = StageFocus.NONE,
        modifier = modifier.fillMaxWidth().heightIn(min = 76.mpx),
    ) { focused ->
        if (focused) Box(Modifier.matchParentSize().background(StageColors.Text.copy(alpha = 0.07f), shape))
        val tint = if (danger) StageColors.Danger else StageColors.Text
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 26.mpx, vertical = 12.mpx),
            horizontalArrangement = Arrangement.spacedBy(18.mpx),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tv.own.owntv.ui.components.OwnTVIcon(icon, tint, Modifier.size(30.mpx))
            Column(Modifier.weight(1f)) {
                Text(title, style = stageText(22, 700), color = tint, maxLines = 1)
                if (subtitle != null) Text(subtitle, style = stageText(15, 500), color = StageColors.Muted, maxLines = 2)
            }
        }
    }
}
