package tv.own.owntv.player

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/** Current time in the top-right corner of the full-screen player; ticks on the minute. */
@Suppress("FunctionNaming")
@Composable
fun PlayerCornerClock(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(CORNER_CLOCK_MINUTE_MS - now % CORNER_CLOCK_MINUTE_MS)
        }
    }
    val text = DateFormat.getTimeFormat(context).format(now)
    Box(modifier, contentAlignment = Alignment.TopEnd) {
        Text(
            text,
            style = stageText(CORNER_CLOCK_TEXT, CORNER_CLOCK_WEIGHT),
            color = Color.White,
            modifier = Modifier
                .padding(top = CORNER_CLOCK_TOP.mpx, end = CORNER_CLOCK_END.mpx)
                .background(Color.Black.copy(alpha = CORNER_CLOCK_SHADE), RoundedCornerShape(CORNER_CLOCK_RADIUS.mpx))
                .padding(horizontal = CORNER_CLOCK_PAD_H.mpx, vertical = CORNER_CLOCK_PAD_V.mpx),
        )
    }
}

private const val CORNER_CLOCK_MINUTE_MS = 60_000L
private const val CORNER_CLOCK_SHADE = 0.45f
private const val CORNER_CLOCK_RADIUS = 12
private const val CORNER_CLOCK_TOP = 28
private const val CORNER_CLOCK_END = 40
private const val CORNER_CLOCK_PAD_H = 16
private const val CORNER_CLOCK_PAD_V = 6
private const val CORNER_CLOCK_TEXT = 26
private const val CORNER_CLOCK_WEIGHT = 700
