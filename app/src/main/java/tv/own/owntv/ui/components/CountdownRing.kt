package tv.own.owntv.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.tv.material3.Text
import tv.own.owntv.ui.brand.SkMateBlue
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/**
 * "3", "2", "1" in a brand-blue ring that fills in [totalMs] and stays in step with the number beside it.
 * The ring follows the wall clock, not an animation: Compose's animations obey the system's animation-scale
 * setting (some TVs ship it at half), which made the ring run ahead of the numbers, whose delays do not.
 */
@Composable
fun CountdownRing(n: Int, totalMs: Long, modifier: Modifier = Modifier, diameter: androidx.compose.ui.unit.Dp = 30.mpx) {
    var fraction by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val start = android.os.SystemClock.uptimeMillis()
        while (fraction < 1f) {
            androidx.compose.runtime.withFrameNanos { }
            fraction = ((android.os.SystemClock.uptimeMillis() - start).toFloat() / totalMs).coerceIn(0f, 1f)
        }
    }
    Box(modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(diameter)) {
            val w = 2.5f * 1.mpx.toPx()
            val arc = Size(size.width - w, size.height - w)
            val topLeft = Offset(w / 2, w / 2)
            drawArc(SkMateBlue.copy(alpha = 0.2f), 0f, 360f, false, topLeft = topLeft, size = arc, style = Stroke(w))
            drawArc(SkMateBlue, -90f, 360f * fraction, false, topLeft = topLeft, size = arc, style = Stroke(w, cap = StrokeCap.Round))
        }
        Text(n.toString(), style = stageText(15, 800), color = SkMateBlue, maxLines = 1)
    }
}
