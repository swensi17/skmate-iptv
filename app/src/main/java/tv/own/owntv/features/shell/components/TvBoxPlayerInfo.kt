package tv.own.owntv.features.shell.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.tv.material3.Text
import tv.own.owntv.R
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.epg.displayLogoUrl
import tv.own.owntv.core.live.EpgNowNext
import tv.own.owntv.core.parser.XtEpgEntry
import tv.own.owntv.ui.brand.SkMateBlue
import tv.own.owntv.ui.components.ChannelLogoTile
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.format.rememberSystemTimeFormatter
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/**
 * The TV-box player's channel info, at the bottom of the picture: the logo, what is on, its times with
 * a short bar and the minutes left, the channel, the stream's chips, what is on next, and under it all
 * the timeline — the programme's span with the moment being watched ([offsetSec] behind live) marked.
 * With no guide it still says the channel and that there is no programme, so the bar never looks empty.
 */
@Composable
fun TvBoxPlayerInfo(channel: ChannelEntity?, nowNext: EpgNowNext?, chips: List<String>, offsetSec: Int?, now: Long) {
    val formatTime = rememberSystemTimeFormatter()
    val current = nowNext?.now?.takeIf { now < it.stopMs }
    val next = nowNext?.next
    val watching = now - (offsetSec ?: 0) * 1000L
    Column(verticalArrangement = Arrangement.spacedBy(18.mpx)) {
        Row(horizontalArrangement = Arrangement.spacedBy(24.mpx), verticalAlignment = Alignment.CenterVertically) {
            ChannelLogoTile(
                logoUrl = channel?.displayLogoUrl,
                // The logo on its own over the picture, no plate behind it.
                modifier = Modifier.size(132.mpx).padding(6.mpx),
                fill = Color.Transparent,
            ) { tv.own.owntv.ui.components.OwnTVIcon(OwnTVIcon.LIVE_TV, Color.White.copy(alpha = 0.6f), Modifier.size(56.mpx)) }
            Column(verticalArrangement = Arrangement.spacedBy(8.mpx)) {
                Text(
                    current?.title ?: stringResource(R.string.content_no_guide),
                    style = stageText(34, 700), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(16.mpx), verticalAlignment = Alignment.CenterVertically) {
                    if (current != null) {
                        Text(range(formatTime, current), style = stageText(20, 500), color = Soft, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        MiniBar(((watching - current.startMs).toFloat() / (current.stopMs - current.startMs).coerceAtLeast(1)).coerceIn(0f, 1f))
                        val left = ((current.stopMs - now) / 60_000L).toInt().coerceAtLeast(0)
                        Text(stringResource(R.string.player_duration_minutes, left), style = stageText(20, 500), color = Soft, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    }
                    if (channel != null) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.mpx)) {
                            channel.number?.let { Text(it.toString(), style = stageText(20, 700), color = Color.White, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) }
                            Text(channel.name, style = stageText(20, 700), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    chips.take(MaxChips).forEach { Chip(it) }
                }
                if (next != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(16.mpx)) {
                        Text(range(formatTime, next), style = stageText(20, 500), color = Faint, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        Text(next.title, style = stageText(20, 500), color = Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        Timeline(
            progress = current?.let { ((watching - it.startMs).toFloat() / (it.stopMs - it.startMs).coerceAtLeast(1)).coerceIn(0f, 1f) } ?: 1f,
            behind = (offsetSec ?: 0) > 0,
        )
    }
}

@Composable
private fun range(formatTime: (Long) -> String, p: XtEpgEntry): String =
    stringResource(R.string.content_live_time_range_plain, formatTime(p.startMs), formatTime(p.stopMs))

/** The short bar after the times: how far the programme has got. */
@Composable
private fun MiniBar(progress: Float) {
    Box(
        Modifier.width(64.mpx).height(4.mpx).drawBehind {
            val r = CornerRadius(size.height / 2)
            drawRoundRect(Color.White.copy(alpha = 0.3f), cornerRadius = r)
            drawRoundRect(Color.White, size = Size(size.width * progress, size.height), cornerRadius = r)
        },
    )
}

/** A stream fact ("FHD", "25 FPS", "STEREO") in a thin outlined box. */
@Composable
private fun Chip(text: String) {
    Text(
        text.uppercase(), style = stageText(14, 700), color = Color.White.copy(alpha = 0.85f), maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        modifier = Modifier.border(1.mpx, Color.White.copy(alpha = 0.45f), RoundedCornerShape(5.mpx)).padding(horizontal = 7.mpx, vertical = 2.mpx),
    )
}

/** The full-width line under the info: the programme's span, the watched moment as a dot (◀ ▶ move it back). */
@Composable
private fun Timeline(progress: Float, behind: Boolean) {
    Box(
        Modifier.fillMaxWidth().height(14.mpx).drawBehind {
            val h = 4.mpx.toPx()
            val y = (size.height - h) / 2
            val r = CornerRadius(h / 2)
            drawRoundRect(Color.White.copy(alpha = 0.25f), topLeft = Offset(0f, y), size = Size(size.width, h), cornerRadius = r)
            val x = size.width * progress
            drawRoundRect(SkMateBlue, topLeft = Offset(0f, y), size = Size(x, h), cornerRadius = r)
            drawCircle(if (behind) SkMateBlue else Color.White, radius = 7.mpx.toPx(), center = Offset(x.coerceIn(7.mpx.toPx(), size.width - 7.mpx.toPx()), size.height / 2))
        },
    )
}

private val Soft = Color.White.copy(alpha = 0.8f)
private val Faint = Color.White.copy(alpha = 0.62f)
private const val MaxChips = 4
