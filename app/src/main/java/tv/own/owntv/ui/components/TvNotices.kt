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
import androidx.compose.runtime.mutableStateListOf
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
        .clip(RoundedCornerShape(10.mpx))
        .background(if (light) tv.own.owntv.features.shell.components.TvBoxPanelLight else tv.own.owntv.features.shell.components.TvBoxMenuFill)
        .border(1.mpx, tv.own.owntv.ui.theme.StageColors.Muted.copy(alpha = 0.22f), RoundedCornerShape(10.mpx))
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
        TvNotices.items.forEach { n ->
            LaunchedEffect(n.id) { kotlinx.coroutines.delay(n.millis); TvNotices.items.removeAll { it.id == n.id } }
            Row(Modifier.tvNoticeCard().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(16.mpx)) {
                Box(Modifier.width(4.mpx).fillMaxHeight().clip(RoundedCornerShape(2.mpx)).background(tv.own.owntv.ui.theme.stageAccent.accent))
                Column(verticalArrangement = Arrangement.spacedBy(4.mpx)) {
                    Text(n.title, style = stageText(21, 600), color = tv.own.owntv.ui.theme.StageColors.Text, maxLines = 3, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    n.text?.let { Text(it, style = stageText(18, 500), color = tv.own.owntv.ui.theme.StageColors.Muted, maxLines = 3, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) }
                }
            }
        }
    }
}
