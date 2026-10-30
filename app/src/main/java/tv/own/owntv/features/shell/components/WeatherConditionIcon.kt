package tv.own.owntv.features.shell.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import tv.own.owntv.core.weather.WeatherInfo
import tv.own.owntv.ui.theme.LocalStagePalette

/** The weather symbol beside the temperature in the top-right cluster. */
@Composable
internal fun WeatherConditionIcon(info: WeatherInfo, modifier: Modifier = Modifier) {
    val key = info.symbolKey()
    val light = LocalStagePalette.current.isLight
    // The hour of the day, to the minute: the sky changes slowly and smoothly with it, so no animation is needed.
    val hour by androidx.compose.runtime.produceState(currentHour(), info.isDay) {
        while (true) { value = currentHour(); kotlinx.coroutines.delay(60_000L) }
    }
    // A forecast that says "day" at an hour the clock calls night (or the reverse) wins: the sky follows the data.
    val shown = when {
        info.isDay && (hour < 6f || hour >= 20f) -> 12f
        !info.isDay && hour in 7f..19f -> 22f
        else -> hour
    }
    val sky = SkyPhase.at(shown)
    val sunC = sky.sunColor; val moonC = if (light) Color(0xFF8A9BC4) else Color(0xFFDDF8FF)
    val cloudC = Color(0xFFDDEFE9); val rainC = Color(0xFF76A7FF)
    val snowC = Color(0xFFF0FCFF); val fogC = Color(0xFFDDF8FF)
    val thunderC = Color(0xFFFFD166)

    Canvas(modifier) {
        val s = size.minDimension / 100f
        val fill = androidx.compose.ui.graphics.drawscope.Fill
        val stk = Stroke(width = 4f * s, cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun o(x: Float, y: Float) = Offset(x * s, y * s)

        // The sun and the moon fill the same footprint (a 46 radius), so swapping them never changes the icon's size.
        fun sun(cx: Float, cy: Float, r: Float) {
            val k = sky.sun
            if (k <= 0.01f) return
            val rr = r * (0.8f + 0.2f * k)
            val inner = rr + 8f; val outer = rr + 8f + 12f * sky.rays
            for (i in 0 until 10) {
                val a = i * kotlin.math.PI.toFloat() / 5f
                drawLine(sunC.copy(alpha = k), o(cx + kotlin.math.cos(a) * inner, cy + kotlin.math.sin(a) * inner), o(cx + kotlin.math.cos(a) * outer, cy + kotlin.math.sin(a) * outer), strokeWidth = 4f * s, cap = StrokeCap.Round)
            }
            drawCircle(sunC.copy(alpha = k), rr * s, o(cx, cy))
            if (sky.horizon > 0.02f) drawLine(sunC.copy(alpha = 0.8f * sky.horizon), o(cx - 40f, cy + rr + 14f), o(cx + 40f, cy + rr + 14f), strokeWidth = 4f * s, cap = StrokeCap.Round)
        }
        fun moon(cx: Float, cy: Float, r: Float) {
            val k = sky.moon
            if (k <= 0.01f) return
            val rr = r * (0.8f + 0.2f * k) * 1.25f
            val c = moonC.copy(alpha = k)
            val crescent = Path().apply {
                addOval(androidx.compose.ui.geometry.Rect(o(cx - rr, cy - rr), o(cx + rr, cy + rr)))
            }
            val bite = Path().apply {
                val br = rr * 0.86f; val bx = cx + rr * 0.5f; val by = cy - rr * 0.2f
                addOval(androidx.compose.ui.geometry.Rect(o(bx - br, by - br), o(bx + br, by + br)))
            }
            drawPath(Path.combine(androidx.compose.ui.graphics.PathOperation.Difference, crescent, bite), c)
            listOf(0.62f to -0.55f, 0.30f to -0.72f, 0.74f to 0.12f).forEach { (dx, dy) -> drawCircle(c.copy(alpha = 0.7f * k), 1.8f * s, o(cx + dx * rr * 0.9f, cy + dy * rr * 0.9f)) }
        }
        fun cloud(cx: Float, cy: Float, k: Float) {
            drawCircle(cloudC, 16f * k * s, o(cx - 19f * k, cy + 5f * k))
            drawCircle(cloudC, 23f * k * s, o(cx, cy - 9f * k))
            drawCircle(cloudC, 18f * k * s, o(cx + 24f * k, cy + 2f * k))
            drawCircle(cloudC, 13f * k * s, o(cx + 39f * k, cy + 10f * k))
        }
        fun drops(cx: Float, cy: Float, n: Int, c: Color) {
            for (i in 0 until n) drawLine(c, o(cx + i * 18f, cy), o(cx - 5f + i * 18f, cy + 18f), strokeWidth = 4f * s, cap = StrokeCap.Round)
        }
        fun snow(cx: Float, cy: Float) {
            for (i in 0 until 3) { val x = cx + i * 20f; val y = cy + (i % 2) * 4f; val w = 3f * s; val c = StrokeCap.Round; drawLine(snowC, o(x - 7f, y), o(x + 7f, y), w, c); drawLine(snowC, o(x, y - 7f), o(x, y + 7f), w, c); drawLine(snowC, o(x - 5f, y - 5f), o(x + 5f, y + 5f), w, c); drawLine(snowC, o(x + 5f, y - 5f), o(x - 5f, y + 5f), w, c) }
        }
        fun fog(cx: Float, cy: Float) {
            for (i in 0 until 4) drawLine(fogC.copy(alpha = 0.74f), o(cx - 38f, cy + i * 12f), o(cx + 38f, cy + i * 12f), strokeWidth = 5f * s, cap = StrokeCap.Round)
        }
        fun bolt(cx: Float, cy: Float) { val p = Path().apply { moveTo(cx * s, cy * s); lineTo((cx - 12f) * s, (cy + 26f) * s); lineTo((cx + 1f) * s, (cy + 23f) * s); lineTo((cx - 8f) * s, (cy + 48f) * s); lineTo((cx + 18f) * s, (cy + 15f) * s); lineTo((cx + 4f) * s, (cy + 18f) * s); close() }; drawPath(p, thunderC, style = fill) }

        when (key) {
            "sunny", "clearNight" -> { sun(50f, 50f, 23f); moon(50f, 50f, 23f) }
            "partlyDay", "partlyNight" -> { sun(36f, 36f, 17f); moon(36f, 36f, 17f); cloud(56f, 60f, 1f) }
            "cloudy" -> { cloud(46f, 48f, 1.15f); cloud(60f, 62f, 0.82f) }
            "fog" -> { cloud(50f, 36f, 0.9f); fog(50f, 58f) }
            "drizzle" -> { cloud(50f, 38f, 1f); drops(35f, 62f, 3, rainC.copy(alpha = 0.72f)) }
            "rain" -> { cloud(50f, 36f, 1.05f); drops(30f, 60f, 4, rainC) }
            "snow" -> { cloud(50f, 36f, 1.05f); snow(32f, 65f) }
            "thunder" -> { cloud(50f, 35f, 1.05f); bolt(52f, 48f); drops(28f, 66f, 2, rainC) }
            else -> cloud(46f, 48f, 1.15f)
        }
    }
}

private fun currentHour(): Float {
    val c = java.util.Calendar.getInstance()
    return c.get(java.util.Calendar.HOUR_OF_DAY) + c.get(java.util.Calendar.MINUTE) / 60f
}
