package tv.own.owntv.player

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.tv.material3.Text
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import tv.own.owntv.R
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/**
 * The top right of the TV-box info: the clock, the date and what the stream is — a resolution badge, then
 * "25 fps · H.265 · Stereo · 2.6 Mbps". Read from [facts], which the engine keeps from what it already
 * measures; this only draws it, once a second at most.
 */
@Composable
internal fun tvBoxStreamCorner(facts: StreamFacts?, modifier: Modifier = Modifier) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            // Waits for the next minute rather than ticking every second: the clock shows minutes only.
            kotlinx.coroutines.delay(MINUTE_MS - System.currentTimeMillis() % MINUTE_MS)
            now = System.currentTimeMillis()
        }
    }
    val locale = Locale.getDefault()
    val time = remember(locale) { DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale) }
    val date = remember(locale) { DateTimeFormatter.ofPattern(DATE_PATTERN, locale) }
    val at = Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault())
    val shade = Shadow(Color.Black.copy(alpha = SHADOW_ALPHA), blurRadius = SHADOW_BLUR)
    Column(modifier, horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.mpx)) {
        Text(
            at.format(time), style = stageText(CLOCK_TEXT, BOLD).copy(shadow = shade),
            color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Text(
            at.format(date).replaceFirstChar { it.titlecase(locale) },
            style = stageText(DATE_TEXT, MEDIUM).copy(shadow = shade), color = Soft,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        if (facts != null) {
            Row(
                Modifier.padding(top = 8.mpx),
                horizontalArrangement = Arrangement.spacedBy(10.mpx),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                facts.height?.let { h ->
                    Text(
                        "${h}p", style = stageText(FACT_TEXT, BOLD), color = Color.White,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.background(Badge, tv.own.owntv.ui.stage.FocusBarShape)
                            .padding(horizontal = 8.mpx, vertical = 2.mpx),
                    )
                }
                Text(
                    factsLine(facts, locale), style = stageText(FACT_TEXT, MEDIUM).copy(shadow = shade),
                    color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** "25 fps · H.265 · Stereo · 2.6 Mbps", leaving out what is not known yet. */
@Composable
private fun factsLine(facts: StreamFacts, locale: Locale): String {
    val sound = when (val ch = facts.channels) {
        null -> null
        1 -> stringResource(R.string.player_audio_mono)
        2 -> stringResource(R.string.player_audio_stereo)
        else -> "$ch.0"
    }?.replaceFirstChar { it.titlecase(locale) }
    val parts = listOfNotNull(
        facts.fps?.let { stringResource(R.string.player_stream_fps_whole, standardFps(it)) },
        facts.codec,
        sound,
        facts.kbps?.takeIf { it > 0 }?.let {
            stringResource(R.string.player_stream_mbps, String.format(locale, "%.1f", it / KBPS_PER_MBPS))
        },
    )
    return parts.joinToString(stringResource(R.string.content_epg_bits_separator))
}

/** A measured rate as TVs name it: 49.6 is 50, 29.9 is 30; anything else rounded. */
internal fun standardFps(fps: Float): Int =
    STANDARD_FPS.firstOrNull { kotlin.math.abs(fps - it) / it < FPS_SNAP } ?: Math.round(fps)

/** The frame rates television uses (film, PAL, NTSC and their doubles). */
@Suppress("MagicNumber")
private val STANDARD_FPS = listOf(24, 25, 30, 50, 60)
private const val FPS_SNAP = 0.06f
private val Soft = Color.White.copy(alpha = 0.8f)
private val Badge = Color(BADGE_ARGB)
private const val BADGE_ARGB = 0xFF1E6FD9
private const val MINUTE_MS = 60_000L
private const val DATE_PATTERN = "EEE, d MMM"
private const val SHADOW_ALPHA = 0.6f
private const val SHADOW_BLUR = 8f
private const val CLOCK_TEXT = 44
private const val DATE_TEXT = 18
private const val FACT_TEXT = 16
private const val BOLD = 700
private const val MEDIUM = 500
private const val KBPS_PER_MBPS = 1000f
