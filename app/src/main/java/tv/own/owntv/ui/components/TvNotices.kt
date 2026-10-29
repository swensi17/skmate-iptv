package tv.own.owntv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
        .widthIn(min = 460.mpx, max = 640.mpx)
        .clip(RoundedCornerShape(16.mpx))
        .background(if (light) tv.own.owntv.features.shell.components.TvBoxPanelLight else tv.own.owntv.features.shell.components.TvBoxMenuFill)
        .padding(horizontal = 26.mpx, vertical = 20.mpx)
}

/** Short notices stacked in the top-right corner, newest on top; each leaves by itself. */
object TvNotices {
    data class Notice(val id: Long, val title: String, val text: String?, val millis: Long)

    val items = mutableStateListOf<Notice>()
    private var next = 0L

    fun show(title: String, text: String? = null, millis: Long = 5_000L) {
        items.add(0, Notice(next++, title, text, millis))
        while (items.size > MAX) items.removeAt(items.lastIndex)
    }

    private const val MAX = 4
}

/** The stack itself; put it in the column that also holds the update card. */
@Composable
fun TvNoticeStack() {
    Column(verticalArrangement = Arrangement.spacedBy(12.mpx)) {
        TvNotices.items.forEach { n ->
            LaunchedEffect(n.id) { kotlinx.coroutines.delay(n.millis); TvNotices.items.removeAll { it.id == n.id } }
            Column(Modifier.tvNoticeCard(), verticalArrangement = Arrangement.spacedBy(6.mpx)) {
                Text(n.title, style = stageText(22, 700), color = tv.own.owntv.ui.theme.StageColors.Text, maxLines = 2)
                n.text?.let { Text(it, style = stageText(18, 500), color = tv.own.owntv.ui.theme.StageColors.Muted, maxLines = 3) }
            }
        }
    }
}
