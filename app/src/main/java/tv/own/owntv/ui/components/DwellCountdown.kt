package tv.own.owntv.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import kotlinx.coroutines.delay

/**
 * The one rule for "rest on a row and it opens by itself": focus rests for [quietMs], then 3, 2, 1 a [stepMs]
 * apart, then [onFire]. Every list that does this (the categories on the channels screen, in the player, the
 * channels of the player's panel) goes through here, so they behave, and are tuned, in one place.
 *
 * Returns the number to show (3, 2, 1) or 0 while nothing counts. [armed] false — nothing is waited for;
 * a new [focusKey] starts over. [paused] (a menu is open, OK is held) stops the count and starts it over
 * from the quiet moment when it ends.
 */
@Composable
fun rememberDwellCountdown(
    focusKey: Any?,
    armed: Boolean,
    paused: Boolean,
    quietMs: Long,
    stepMs: Long,
    onFire: () -> Unit,
): Int {
    var count by remember { mutableIntStateOf(0) }
    val fire by rememberUpdatedState(onFire)
    LaunchedEffect(focusKey, armed, paused) {
        count = 0
        if (!armed || paused) return@LaunchedEffect
        try {
            delay(quietMs)
            for (n in DwellSteps downTo 1) { count = n; delay(stepMs) }
            count = 0
            fire()
        } finally { count = 0 }
    }
    return count
}

/** 3, 2, 1. */
const val DwellSteps = 3

/** How long focus rests on a category before 3-2-1 starts, and the length of each number. */
object DwellTiming {
    const val CategoryQuietMs = 7_000L
    const val ChannelQuietMs = 1_500L
    const val StepMs = 1_000L
    const val CategoryTotalMs = DwellSteps * StepMs
}

/** Tells [onHeld] while OK is down, so a long press (a row's menu) is not overtaken by the count. */
fun Modifier.reportOkHeld(onHeld: (Boolean) -> Unit): Modifier = onPreviewKeyEvent { e ->
    if (e.key == Key.DirectionCenter || e.key == Key.Enter || e.key == Key.NumPadEnter) onHeld(e.type == KeyEventType.KeyDown)
    false
}
