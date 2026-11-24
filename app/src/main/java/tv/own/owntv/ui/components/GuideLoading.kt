package tv.own.owntv.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.tv.material3.Text
import org.koin.compose.koinInject
import tv.own.owntv.R
import tv.own.owntv.core.sync.EpgActivityTracker
import tv.own.owntv.ui.theme.DevicePerf

/** True while any programme guide is being downloaded or linked to the channels. */
@Composable
fun rememberGuideLoading(): Boolean {
    val tracker = koinInject<EpgActivityTracker>()
    val active by tracker.active.collectAsState()
    return active.isNotEmpty()
}

/**
 * The line a channel shows when it has no programme yet. While a guide is still coming in it says so,
 * softly pulsing, instead of "no guide": a fresh playlist fills in a minute later, and "no guide"
 * read as broken. The pulse is one alpha on one line, so it costs nothing; a weak TV shows it still.
 */
@Composable
fun GuideStatusText(
    noGuide: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    loading: Boolean = rememberGuideLoading(),
) {
    if (!loading) {
        Text(noGuide, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)
        return
    }
    // Read inside graphicsLayer, so each frame of the pulse redraws the line without recomposing it.
    val pulse = if (DevicePerf.lite) {
        null
    } else {
        rememberInfiniteTransition(label = "guide-loading").animateFloat(
            initialValue = 1f,
            targetValue = 0.45f,
            animationSpec = infiniteRepeatable(tween(PULSE_MS, easing = FastOutSlowInEasing), RepeatMode.Reverse),
            label = "guide-loading-alpha",
        )
    }
    Text(
        stringResource(R.string.content_guide_loading),
        style = style,
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier.graphicsLayer { alpha = pulse?.value ?: 1f },
    )
}

private const val PULSE_MS = 900
