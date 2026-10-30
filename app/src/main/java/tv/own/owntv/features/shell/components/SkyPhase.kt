package tv.own.owntv.features.shell.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp

/**
 * The sky for a time of day, as numbers: how much of the sun and how much of the moon shows, the sun's colour
 * and how long its rays are, and whether the horizon line (dawn, dusk) is drawn. Everything moves smoothly with
 * the hour, so four looks (morning, noon, evening, night) melt into each other and nothing jumps. Pure
 * arithmetic, tested.
 */
internal data class SkyPhase(
    /** 0..1: how much the sun is shown (size and opacity). */
    val sun: Float,
    /** 0..1: how much the moon is shown. */
    val moon: Float,
    val sunColor: Color,
    /** 0..1: ray length, shortest at the horizon. */
    val rays: Float,
    /** 0..1: the horizon line under a low sun. */
    val horizon: Float,
) {
    companion object {
        private val Dawn = Color(0xFFFF9F43)
        private val Noon = Color(0xFFFFD166)
        private val Dusk = Color(0xFFFF6B4A)

        /** [hour] on a 24-hour clock with minutes as a fraction (13.5 = 13:30). */
        fun at(hour: Float): SkyPhase {
            val h = ((hour % 24f) + 24f) % 24f
            // The sun is up from 5 to 21 in the long days of Central Asia, strongest 10..16; the moon fills the rest.
            val sun = smooth(h, 4.5f, 6.5f) * (1f - smooth(h, 19.5f, 21.5f))
            val moon = 1f - sun
            val color = when {
                h < 12f -> lerp(Dawn, Noon, smooth(h, 6f, 11f))
                else -> lerp(Noon, Dusk, smooth(h, 14f, 19f))
            }
            val height = smooth(h, 5f, 10f) * (1f - smooth(h, 16f, 20.5f))
            return SkyPhase(sun = sun, moon = moon, sunColor = color, rays = 0.45f + 0.55f * height, horizon = (1f - height) * sun)
        }

        /** 0 before [from], 1 after [to], eased in between. */
        private fun smooth(x: Float, from: Float, to: Float): Float {
            val t = ((x - from) / (to - from)).coerceIn(0f, 1f)
            return t * t * (3f - 2f * t)
        }
    }
}
