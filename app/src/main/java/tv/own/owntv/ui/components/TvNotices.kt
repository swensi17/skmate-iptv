package tv.own.owntv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.tv.material3.Text
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/** A notice: one dark, quiet plate with rounded corners. No border, no colour bar, nothing that blinks. */
@Composable
fun Modifier.tvNoticeCard(): Modifier = this
    .widthIn(min = NOTICE_MIN_WIDTH.mpx, max = NOTICE_MAX_WIDTH.mpx)
    .clip(RoundedCornerShape(NOTICE_RADIUS.mpx))
    .background(NoticeFill)
    .padding(horizontal = NOTICE_PAD_H.mpx, vertical = NOTICE_PAD_V.mpx)

private val NoticeFill = androidx.compose.ui.graphics.Color(NOTICE_FILL_ARGB)
private const val NOTICE_FILL_ARGB = 0xF53A3E44
private const val NOTICE_MIN_WIDTH = 360
private const val NOTICE_MAX_WIDTH = 760
private const val NOTICE_RADIUS = 14
private const val NOTICE_PAD_H = 28
private const val NOTICE_PAD_V = 14

/** Short notices at the top centre of the screen, newest on top; each leaves by itself. */
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
    Column(
        verticalArrangement = Arrangement.spacedBy(STACK_GAP.mpx),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        TvNotices.items.forEach { n -> key(n.id) { TvNoticeItem(n) } }
    }
}

private const val ENTER_MS = 320
private const val EXIT_MS = 260
private const val EXIT_SLACK_MS = 30L
private const val HIDE_GAP = 60
private const val STACK_GAP = 10
private const val TITLE_SIZE = 20
private const val TITLE_WEIGHT = 600
private const val TEXT_SIZE = 17
private const val TEXT_WEIGHT = 400
private val NoticeTitle = androidx.compose.ui.graphics.Color.White
private val NoticeText = androidx.compose.ui.graphics.Color(NOTICE_TEXT_ARGB)
private const val NOTICE_TEXT_ARGB = 0xFFB5BAC1

/** One notice: drops in from the top edge like a blind, waits, and rolls back up before it is removed. */
@Composable
@Suppress("FunctionNaming")
private fun TvNoticeItem(n: TvNotices.Notice) {
    var shown by remember { mutableStateOf(false) }
    // A blind: only a layer moves, so it slides on weak boxes too; Animations Off makes it appear in place.
    val enterMs = tv.own.owntv.ui.theme.MotionPrefs.slideMs(ENTER_MS)
    val exitMs = tv.own.owntv.ui.theme.MotionPrefs.slideMs(EXIT_MS)
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
    // Drops down from behind the top edge like a blind and rolls back up; the whole text is shown, never cut.
    Column(
        Modifier
            .graphicsLayer {
                translationY = -(1f - p) * (size.height + HIDE_GAP.mpx.toPx())
            }
            .tvNoticeCard(),
        verticalArrangement = Arrangement.spacedBy(2.mpx),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(n.title, style = stageText(TITLE_SIZE, TITLE_WEIGHT), color = NoticeTitle, textAlign = TextAlign.Center)
        n.text?.let {
            Text(it, style = stageText(TEXT_SIZE, TEXT_WEIGHT), color = NoticeText, textAlign = TextAlign.Center)
        }
    }
}
