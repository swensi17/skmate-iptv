package tv.own.owntv.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * Lightweight indeterminate spinner drawn with Canvas (no Material dependency).
 *
 * Drawn as the iOS activity indicator: [SPINNER_SPOKES] spokes, stepping rather than turning every frame. On a TV each frame redraws the whole
 * window — about 32 ms of render work on a TCL G10 — so a spinner animated per frame kept the GPU
 * busy for as long as it showed: a quarter of the app's CPU during a catalogue import, which is
 * also when the sync pill's spinner runs. Only the draw phase reads the step, so a step costs one
 * redraw and no recomposition.
 */
@Composable
fun OwnTVSpinner(
    modifier: Modifier = Modifier,
    sizeDp: Int = 44,
    color: Color = tv.own.owntv.ui.theme.stageAccent.accent,
) {
    // iOS-style activity indicator: twelve rounded spokes, the lit one stepping round and the ones
    // behind it fading out. Stepping is how the iOS one moves too, and it costs 12 redraws a second.
    val step = remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(SPINNER_TURN_MS / SPINNER_SPOKES)
            step.intValue = (step.intValue + 1) % SPINNER_SPOKES
        }
    }
    Canvas(modifier = modifier.size(sizeDp.dp)) {
        val d = size.minDimension
        val c = Offset(d / 2f, d / 2f)
        val w = d * 0.09f
        val inner = d * 0.22f
        val outer = d * 0.46f
        for (i in 0 until SPINNER_SPOKES) {
            // How far behind the lit spoke this one is: 0 = lit, fading to a floor.
            val behind = (step.intValue - i + SPINNER_SPOKES) % SPINNER_SPOKES
            val alpha = (1f - behind / SPINNER_SPOKES.toFloat()).coerceAtLeast(0.18f)
            val a = Math.toRadians(i * 360.0 / SPINNER_SPOKES - 90.0)
            val dx = kotlin.math.cos(a).toFloat()
            val dy = kotlin.math.sin(a).toFloat()
            drawLine(
                color = color.copy(alpha = color.alpha * alpha),
                start = Offset(c.x + dx * inner, c.y + dy * inner),
                end = Offset(c.x + dx * outer, c.y + dy * outer),
                strokeWidth = w,
                cap = StrokeCap.Round,
            )
        }
    }
}

/** One full turn of [OwnTVSpinner], about the iOS indicator's pace. */
private const val SPINNER_TURN_MS = 1_000L

/** Spokes, as on iOS: also the number of steps per turn. */
private const val SPINNER_SPOKES = 12
