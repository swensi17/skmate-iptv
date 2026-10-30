package tv.own.owntv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.delay
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.tv.material3.Text
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/** The look of every notice in the top-right corner: the side menu's surface, its softly squared corners. */
@Composable
fun Modifier.tvNoticeCard(): Modifier {
    val light = tv.own.owntv.ui.theme.LocalStagePalette.current.isLight
    return this
        .widthIn(min = 420.mpx, max = 600.mpx)
        .clip(tv.own.owntv.ui.stage.FocusBarShape)
        .background(if (light) tv.own.owntv.features.shell.components.TvBoxPanelLight else tv.own.owntv.features.shell.components.TvBoxMenuFill)
        .border(1.mpx, tv.own.owntv.ui.theme.StageColors.Muted.copy(alpha = 0.22f), tv.own.owntv.ui.stage.FocusBarShape)
        .padding(horizontal = 22.mpx, vertical = 16.mpx)
}

/** Short notices stacked in the top-right corner, newest on top; each leaves by itself. */
object TvNotices {
    data class Notice(val id: Long, val title: String, val text: String?, val millis: Long)

    val items = mutableStateListOf<Notice>()
    private var next = 0L

    fun show(title: String, text: String? = null, millis: Long = 5_000L) {
        // The same message twice in a row is one message: it stays and restarts its time, it does not stack.
        items.removeAll { it.title == title && it.text == text }
        items.add(0, Notice(next++, title, text, millis))
        while (items.size > MAX) items.removeAt(items.lastIndex)
    }

    private const val MAX = 3
}

/** The stack itself; put it in the column that also holds the update card. */
@Composable
fun TvNoticeStack() {
    Column(verticalArrangement = Arrangement.spacedBy(12.mpx)) {
        TvNotices.items.forEach { n -> key(n.id) { TvNoticeItem(n) } }
    }
}

private const val ENTER_MS = 320
private const val EXIT_MS = 260
private const val EXIT_SLACK_MS = 30L
private const val HIDE_GAP = 48

/** One notice: drops in from the top edge like a blind, waits, and rolls back up before it is removed. */
@Composable
@Suppress("FunctionNaming")
private fun TvNoticeItem(n: TvNotices.Notice) {
    var shown by remember { mutableStateOf(false) }
    val enterMs = tv.own.owntv.ui.theme.MotionPrefs.dur(ENTER_MS)
    val exitMs = tv.own.owntv.ui.theme.MotionPrefs.dur(EXIT_MS)
    val p by animateFloatAsState(
        targetValue = if (shown) 1f else 0f,
        animationSpec = tween(
            durationMillis = if (shown) enterMs else exitMs,
            easing = if (shown) FastOutSlowInEasing else FastOutLinearInEasing,
        ),
    )
    LaunchedEffect(n.id) {
        shown = true
        delay(n.millis)
        shown = false
        delay(exitMs.toLong() + EXIT_SLACK_MS)
        TvNotices.items.removeAll { it.id == n.id }
    }
    Row(
        Modifier
            .graphicsLayer {
                translationY = -(1f - p) * (size.height + HIDE_GAP.mpx.toPx())
                alpha = p
            }
            .tvNoticeCard()
            .height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(16.mpx),
    ) {
        Box(Modifier.width(4.mpx).fillMaxHeight().clip(RoundedCornerShape(2.mpx)).background(tv.own.owntv.ui.theme.stageAccent.accent))
        Column(verticalArrangement = Arrangement.spacedBy(4.mpx)) {
            Text(n.title, style = stageText(21, 600), color = tv.own.owntv.ui.theme.StageColors.Text, maxLines = 3, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            n.text?.let { Text(it, style = stageText(18, 500), color = tv.own.owntv.ui.theme.StageColors.Muted, maxLines = 3, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) }
        }
    }
}
