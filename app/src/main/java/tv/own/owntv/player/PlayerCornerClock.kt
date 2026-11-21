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
fun PlayerCornerClock(
    modifier: Modifier = Modifier,
    style: tv.own.owntv.core.settings.ClockStyle = tv.own.owntv.core.settings.ClockStyle.DEFAULT,
) {
    val context = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(CORNER_CLOCK_MINUTE_MS - now % CORNER_CLOCK_MINUTE_MS)
        }
    }
    val text = DateFormat.getTimeFormat(context).format(now)
    val size = CLOCK_TEXT_SIZES.getOrElse(style.size) { CORNER_CLOCK_TEXT }
    val weight = if (style.weight == 0) CLOCK_REGULAR else CORNER_CLOCK_WEIGHT
    val light = style.background == tv.own.owntv.core.settings.ClockStyle.BG_LIGHT
    val opaque = 1f - tv.own.owntv.core.settings.ClockStyle.TRANSPARENCY_PCT
        .getOrElse(style.transparency) { 0 } / PERCENT
    val fill = when (style.background) {
        0 -> Color.Transparent
        tv.own.owntv.core.settings.ClockStyle.BG_LIGHT -> Color.White
        CLOCK_BG_BLUE -> tv.own.owntv.ui.brand.SkMateBlue
        else -> Color.Black
    }.let { if (style.background == 0) it else it.copy(alpha = opaque) }
    // With a background the plate hangs from the top edge, only its bottom corners rounded.
    val plate = style.background != 0
    val ink = if (light) Color(CLOCK_DARK_INK) else CLOCK_INKS.getOrElse(style.color) { Color.White }
    // Without a background the digits get a soft shadow, so they read on a bright picture.
    val shadow = if (style.background == 0) {
        androidx.compose.ui.graphics.Shadow(
            Color.Black.copy(alpha = CORNER_CLOCK_SHADE),
            blurRadius = CLOCK_SHADOW_BLUR,
        )
    } else {
        null
    }
    Box(modifier, contentAlignment = Alignment.TopEnd) {
        Text(
            text,
            style = stageText(size, weight).copy(shadow = shadow),
            color = ink,
            modifier = Modifier
                .padding(top = if (plate) 0.mpx else CORNER_CLOCK_TOP.mpx, end = CORNER_CLOCK_END.mpx)
                .background(
                    fill,
                    RoundedCornerShape(bottomStart = CORNER_CLOCK_RADIUS.mpx, bottomEnd = CORNER_CLOCK_RADIUS.mpx),
                )
                .padding(horizontal = CORNER_CLOCK_PAD_H.mpx, vertical = CORNER_CLOCK_PAD_V.mpx),
        )
    }
}

private const val CLOCK_TEXT_S = 20
private const val CLOCK_TEXT_L = 36
private const val CLOCK_YELLOW = 0xFFFFD54F
private const val CLOCK_LIGHT_BLUE = 0xFF8CC8FF
private val CLOCK_TEXT_SIZES = listOf(CLOCK_TEXT_S, CORNER_CLOCK_TEXT, CLOCK_TEXT_L)
private val CLOCK_INKS = listOf(Color.White, Color(CLOCK_YELLOW), Color(CLOCK_LIGHT_BLUE))
private const val CLOCK_DARK_INK = 0xFF15181C
private const val PERCENT = 100f
private const val CLOCK_BG_BLUE = 3
private const val CLOCK_REGULAR = 500
private const val CLOCK_SHADOW_BLUR = 8f

private const val CORNER_CLOCK_MINUTE_MS = 60_000L
private const val CORNER_CLOCK_SHADE = 0.45f
private const val CORNER_CLOCK_RADIUS = 8
private const val CORNER_CLOCK_TOP = 28
private const val CORNER_CLOCK_END = 40
private const val CORNER_CLOCK_PAD_H = 16
private const val CORNER_CLOCK_PAD_V = 6
private const val CORNER_CLOCK_TEXT = 26
private const val CORNER_CLOCK_WEIGHT = 700
