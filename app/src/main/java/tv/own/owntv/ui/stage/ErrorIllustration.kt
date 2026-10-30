package tv.own.owntv.ui.stage

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.foundation.text.BasicText
import tv.own.owntv.ui.theme.stageText
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Which picture an error screen shows: what went wrong, in one glance and no words. */
enum class ErrorArt {
    /** The channel does not answer or the stream broke: a television with a dead signal. */
    SIGNAL,

    /** No network at all: a cloud struck through. */
    NO_INTERNET,

    /** The device cannot show this video (decoder busy, format, file): a chip with a warning. */
    DEVICE,
}

private val Ink = Color(0xFFE8EDF3)
private val Soft = Color(0xFF2A3341)
private val Accent = Color(0xFF4FC3F7)
private val Warn = Color(0xFFFFB454)

/** Drawn by code (no image files to ship or to scale), light lines on the dark player. */
@Composable
fun ErrorIllustration(kind: ErrorArt, modifier: Modifier = Modifier, size: Dp = 200.dp) {
    Canvas(modifier.size(size)) {
        when (kind) {
            ErrorArt.SIGNAL -> drawSignal()
            ErrorArt.NO_INTERNET -> drawNoInternet()
            ErrorArt.DEVICE -> drawDevice()
        }
    }
}

private fun DrawScope.line(w: Float) = Stroke(width = w, cap = StrokeCap.Round)

private fun DrawScope.drawSignal() {
    val u = size.minDimension / 100f
    val stroke = line(4f * u)
    // Antenna.
    drawLine(Ink, Offset(50 * u, 22 * u), Offset(34 * u, 6 * u), 4f * u, StrokeCap.Round)
    drawLine(Ink, Offset(50 * u, 22 * u), Offset(66 * u, 6 * u), 4f * u, StrokeCap.Round)
    // Body and screen.
    drawRoundRect(Soft, Offset(8 * u, 22 * u), Size(84 * u, 62 * u), CornerRadius(12 * u))
    drawRoundRect(Ink, Offset(8 * u, 22 * u), Size(84 * u, 62 * u), CornerRadius(12 * u), stroke)
    // Signal waves fading out, a dot as their source.
    val cx = 50 * u
    val cy = 66 * u
    drawCircle(Accent, 3.5f * u, Offset(cx, cy))
    listOf(12f to 0.95f, 21f to 0.6f, 30f to 0.3f).forEach { (r, a) ->
        drawArc(
            Accent.copy(alpha = a), startAngle = 225f, sweepAngle = 90f, useCenter = false,
            topLeft = Offset(cx - r * u, cy - r * u), size = Size(2 * r * u, 2 * r * u), style = line(3.4f * u),
        )
    }
    // The strike: this signal is not coming.
    drawLine(Warn, Offset(26 * u, 36 * u), Offset(74 * u, 76 * u), 5f * u, StrokeCap.Round)
    // Stand.
    drawLine(Ink, Offset(36 * u, 92 * u), Offset(64 * u, 92 * u), 4f * u, StrokeCap.Round)
}

private fun DrawScope.drawNoInternet() {
    val u = size.minDimension / 100f
    val stroke = line(4f * u)
    // A cloud: three circles on a flat base.
    drawCircle(Soft, 17 * u, Offset(36 * u, 56 * u))
    drawCircle(Soft, 22 * u, Offset(56 * u, 46 * u))
    drawCircle(Soft, 16 * u, Offset(74 * u, 58 * u))
    drawRoundRect(Soft, Offset(22 * u, 56 * u), Size(66 * u, 20 * u), CornerRadius(10 * u))
    drawArc(Ink, 140f, 130f, false, Offset(19 * u, 39 * u), Size(34 * u, 34 * u), style = stroke)
    drawArc(Ink, 205f, 150f, false, Offset(34 * u, 24 * u), Size(44 * u, 44 * u), style = stroke)
    drawArc(Ink, 290f, 120f, false, Offset(58 * u, 42 * u), Size(32 * u, 32 * u), style = stroke)
    drawLine(Ink, Offset(30 * u, 76 * u), Offset(80 * u, 76 * u), 4f * u, StrokeCap.Round)
    drawLine(Warn, Offset(22 * u, 18 * u), Offset(82 * u, 86 * u), 5f * u, StrokeCap.Round)
}

private fun DrawScope.drawDevice() {
    val u = size.minDimension / 100f
    val stroke = line(4f * u)
    // Pins on every side of a chip.
    for (i in 0..3) {
        val p = (30 + i * 13) * u
        drawLine(Ink, Offset(p, 12 * u), Offset(p, 22 * u), 3.4f * u, StrokeCap.Round)
        drawLine(Ink, Offset(p, 78 * u), Offset(p, 88 * u), 3.4f * u, StrokeCap.Round)
        drawLine(Ink, Offset(12 * u, p), Offset(22 * u, p), 3.4f * u, StrokeCap.Round)
        drawLine(Ink, Offset(78 * u, p), Offset(88 * u, p), 3.4f * u, StrokeCap.Round)
    }
    drawRoundRect(Soft, Offset(22 * u, 22 * u), Size(56 * u, 56 * u), CornerRadius(10 * u))
    drawRoundRect(Ink, Offset(22 * u, 22 * u), Size(56 * u, 56 * u), CornerRadius(10 * u), stroke)
    // A warning mark on it.
    drawLine(Warn, Offset(50 * u, 36 * u), Offset(50 * u, 55 * u), 5.5f * u, StrokeCap.Round)
    drawCircle(Warn, 3.4f * u, Offset(50 * u, 66 * u))
}

/**
 * The button of an error screen, which is always dark: white pill with dark text while it has focus, a soft
 * white outline-less pill otherwise. (The stage buttons follow the app theme and vanish on this background.)
 */
@Composable
fun ErrorButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    var focused by remember { mutableStateOf(false) }
    Row(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(if (focused) Color.White else Color.White.copy(alpha = 0.14f))
            .onFocusChanged { focused = it.isFocused }
            .clickable(onClick = onClick)
            .padding(horizontal = 30.dp, vertical = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(text, style = stageText(23, 700).copy(color = if (focused) Color(0xFF0B0F14) else Color.White))
    }
}
