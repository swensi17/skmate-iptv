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

/** What the stream is, for the TV-box info's line of what follows: set by the player around the info. */
val LocalTvBoxStreamFacts = androidx.compose.runtime.compositionLocalOf<StreamFacts?> { null }

/** The top right of the TV-box info: the clock and the date. */
@Composable
internal fun tvBoxStreamCorner(modifier: Modifier = Modifier) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            // Waits for the next minute rather than ticking every second: the clock shows minutes only.
            kotlinx.coroutines.delay(MINUTE_MS - System.currentTimeMillis() % MINUTE_MS)
            now = System.currentTimeMillis()
        }
    }
    val locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
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
    }
}

/**
 * "1080p · 50 fps · H.264 · Stereo · 4.7 Mbps" on the right of the info's last line, refreshed every two seconds.
 * Figures of even width, so the line keeps its place as the bitrate moves.
 */
@Composable
fun tvBoxStreamFacts(facts: StreamFacts) {
    val locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
    Row(horizontalArrangement = Arrangement.spacedBy(10.mpx), verticalAlignment = Alignment.CenterVertically) {
        facts.height?.let { h ->
            Text(
                "${h}p", style = stageText(FACT_TEXT, BOLD), color = Color.White,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.background(Badge, tv.own.owntv.ui.stage.FocusBarShape)
                    .padding(horizontal = 9.mpx, vertical = 3.mpx),
            )
        }
        // Figures of even width change in place: the line does not shift or blink as the bitrate moves.
        Text(
            factsLine(facts, locale), style = stageText(FACT_TEXT, MEDIUM).copy(fontFeatureSettings = TABULAR),
            color = Color.White.copy(alpha = FACTS_ALPHA), maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
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
        facts.fps?.let(::standardFps)?.let { stringResource(R.string.player_stream_fps_whole, it) },
        facts.codec,
        sound,
        facts.kbps?.takeIf { it > 0 }?.let {
            stringResource(R.string.player_stream_mbps, String.format(locale, "%.1f", it / KBPS_PER_MBPS))
        },
    )
    return parts.joinToString(stringResource(R.string.content_epg_bits_separator))
}

/**
 * A measured rate as TVs name it (49.6 is 50, 29.9 is 30), or null when it is near none of them: some decoders count
 * more pictures than are shown, and a wrong "113 fps" is worse than none.
 */
internal fun standardFps(fps: Float): Int? =
    STANDARD_FPS.firstOrNull { kotlin.math.abs(fps - it) / it < FPS_SNAP }

/** The frame rates television uses (film, PAL, NTSC and their doubles). */
@Suppress("MagicNumber")
private val STANDARD_FPS = listOf(24, 25, 30, 50, 60)
private const val FPS_SNAP = 0.06f
private const val FACTS_ALPHA = 0.62f
private const val TABULAR = "tnum"
private val Soft = Color.White.copy(alpha = 0.8f)
private val Badge = Color(BADGE_ARGB)
private const val BADGE_ARGB = 0xFF1E6FD9
private const val MINUTE_MS = 60_000L
private const val DATE_PATTERN = "EEE, d MMM"
private const val SHADOW_ALPHA = 0.6f
private const val SHADOW_BLUR = 8f
private const val CLOCK_TEXT = 44
private const val DATE_TEXT = 18
private const val FACT_TEXT = 20
private const val BOLD = 700
private const val MEDIUM = 500
private const val KBPS_PER_MBPS = 1000f
