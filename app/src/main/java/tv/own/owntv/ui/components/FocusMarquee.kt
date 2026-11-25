package tv.own.owntv.ui.components

import androidx.compose.foundation.basicMarquee
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow

/**
 * A line cut short scrolls to its end while its row has focus, so a long name is read on the TV
 * without opening anything. Idle rows keep their "…"; a line that fits does not move.
 */
fun Modifier.focusMarquee(focused: Boolean): Modifier =
    if (focused) {
        basicMarquee(
            iterations = Int.MAX_VALUE,
            initialDelayMillis = MARQUEE_DELAY_MS,
            repeatDelayMillis = MARQUEE_DELAY_MS,
        )
    } else {
        this
    }

/** The overflow that goes with [focusMarquee]: a scrolling line is clipped, not ended with "…". */
fun marqueeOverflow(focused: Boolean): TextOverflow = if (focused) TextOverflow.Clip else TextOverflow.Ellipsis

private const val MARQUEE_DELAY_MS = 900
