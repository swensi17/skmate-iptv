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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
import tv.own.owntv.ui.components.GuideStatusText
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
    // The moment on screen: the clock, less how far behind live the archive is.
    val watching = now - (offsetSec ?: 0) * 1000L
    val current = nowNext?.now?.takeIf { watching < it.stopMs }
    val next = nowNext?.next
    // A film or a series on air: its poster in the logo's place and what it is about under the times (TMDB).
    val art = tv.own.owntv.ui.components.rememberProgrammeArt(current?.title)
    Column(verticalArrangement = Arrangement.spacedBy(18.mpx)) {
        // A poster starts level with the title beside it; the smaller logo stays centred on the lines.
        Row(
            horizontalArrangement = Arrangement.spacedBy(24.mpx),
            verticalAlignment = if (art != null) Alignment.Top else Alignment.CenterVertically,
        ) {
            infoArt(art, channel)
            Column(verticalArrangement = Arrangement.spacedBy(8.mpx)) {
                if (current != null) {
                    Text(
                        current.title, style = stageText(34, 700), color = Color.White,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                } else {
                    GuideStatusText(stringResource(R.string.content_no_guide), stageText(34, 700), Color.White)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(16.mpx), verticalAlignment = Alignment.CenterVertically) {
                    if (current != null) {
                        Text(range(formatTime, current), style = stageText(20, 500), color = Soft, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        MiniBar(((watching - current.startMs).toFloat() / (current.stopMs - current.startMs).coerceAtLeast(1)).coerceIn(0f, 1f))
                        val left = ((current.stopMs - watching) / 60_000L).toInt().coerceAtLeast(0)
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
                art?.let { programmeAbout(it) }
                if (next != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(16.mpx)) {
                        Text(range(formatTime, next), style = stageText(20, 500), color = Faint, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        Text(next.title, style = stageText(20, 500), color = Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        val progress = current?.let {
            ((watching - it.startMs).toFloat() / (it.stopMs - it.startMs).coerceAtLeast(1)).coerceIn(0f, 1f)
        } ?: 1f
        Box(Modifier.fillMaxWidth()) {
            Timeline(
                progress = progress,
                behind = (offsetSec ?: 0) > 0,
                seeking = tv.own.owntv.player.LocalTvBoxSeeking.current,
            )
            tv.own.owntv.player.LocalTvBoxSeekRun.current?.let { moved -> seekCounter(progress, moved, watching) }
        }
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

/**
 * The full-width line under the info: the programme's span and the watched moment as a dot. Raised
 * (thicker, a larger ringed dot) while ▼ has put the viewer on it, which is where ◀ ▶ rewind.
 */
@Composable
private fun Timeline(progress: Float, behind: Boolean, seeking: Boolean) {
    Box(
        Modifier.fillMaxWidth().height(24.mpx).drawBehind {
            val h = (if (seeking) 8.mpx else 4.mpx).toPx()
            val y = (size.height - h) / 2
            val r = CornerRadius(h / 2)
            val track = Color.White.copy(alpha = if (seeking) 0.35f else 0.25f)
            drawRoundRect(track, topLeft = Offset(0f, y), size = Size(size.width, h), cornerRadius = r)
            val x = size.width * progress
            drawRoundRect(SkMateBlue, topLeft = Offset(0f, y), size = Size(x, h), cornerRadius = r)
            val dot = (if (seeking) 12.mpx else 7.mpx).toPx()
            val center = Offset(x.coerceIn(dot, size.width - dot), size.height / 2)
            if (seeking) drawCircle(SkMateBlue.copy(alpha = 0.45f), radius = dot + 5.mpx.toPx(), center = center)
            drawCircle(if (behind && !seeking) SkMateBlue else Color.White, radius = dot, center = center)
        },
    )
}

/**
 * Over the dot while ◀ ▶ move through the archive: how far the presses have gone ("−1:20", "+0:30") and the
 * moment they land on, to the second. It sits above the line and takes no room, so nothing moves under it.
 */
@Composable
private fun seekCounter(progress: Float, movedSec: Int, atMs: Long) {
    val clock = remember { java.time.format.DateTimeFormatter.ofLocalizedTime(java.time.format.FormatStyle.MEDIUM) }
    val at = remember(atMs / MS_PER_SEC) {
        java.time.Instant.ofEpochMilli(atMs).atZone(java.time.ZoneId.systemDefault()).format(clock)
    }
    val label = stringResource(R.string.player_seek_counter, signedDuration(movedSec), at)
    androidx.compose.ui.layout.Layout(
        content = {
            Text(
                label, style = stageText(COUNTER_TEXT, COUNTER_WEIGHT), color = Color.Black, maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.background(Color.White, RoundedCornerShape(10.mpx))
                    .padding(horizontal = 14.mpx, vertical = 6.mpx),
            )
        },
        modifier = Modifier.fillMaxWidth(),
    ) { measurables, constraints ->
        val pill = measurables.first().measure(constraints.copy(minWidth = 0, minHeight = 0))
        val room = (constraints.maxWidth - pill.width).coerceAtLeast(0)
        val x = (constraints.maxWidth * progress - pill.width / 2f).toInt().coerceIn(0, room)
        layout(constraints.maxWidth, 0) { pill.place(x, -pill.height - COUNTER_GAP.mpx.roundToPx()) }
    }
}

/** "−1:20", "+0:30", "−1:02:05": minus is back in time. */
private fun signedDuration(sec: Int): String {
    val a = kotlin.math.abs(sec)
    val sign = if (sec < 0) "\u2212" else "+"
    val h = a / SEC_PER_HOUR
    val m = a % SEC_PER_HOUR / SEC_PER_MIN
    val s = a % SEC_PER_MIN
    return if (h > 0) String.format(java.util.Locale.ROOT, "%s%d:%02d:%02d", sign, h, m, s)
    else String.format(java.util.Locale.ROOT, "%s%d:%02d", sign, m, s)
}

/** The poster of a film or series on air, or else the channel's logo on its own over the picture. */
@Composable
private fun infoArt(art: tv.own.owntv.core.metadata.ProgrammeArt?, channel: ChannelEntity?) {
    if (art != null) {
        tv.own.owntv.ui.components.programmePoster(art.posterUrl, POSTER_WIDTH.mpx)
    } else {
        ChannelLogoTile(
            logoUrl = channel?.displayLogoUrl,
            modifier = Modifier.size(132.mpx).padding(6.mpx),
            fill = Color.Transparent,
        ) { tv.own.owntv.ui.components.OwnTVIcon(OwnTVIcon.LIVE_TV, Color.White.copy(alpha = 0.6f), Modifier.size(56.mpx)) }
    }
}

/** The year and what a film or series is about, two lines at most, under the programme's times. */
@Composable
private fun programmeAbout(art: tv.own.owntv.core.metadata.ProgrammeArt) {
    val separator = stringResource(R.string.content_epg_bits_separator)
    val text = listOfNotNull(art.year?.toString(), art.overview).joinToString(separator)
    if (text.isBlank()) return
    Text(
        text, style = stageText(ABOUT_TEXT, 500), color = Soft, maxLines = 2, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.widthIn(max = ABOUT_WIDTH.mpx),
    )
}

private const val POSTER_WIDTH = 120
private const val ABOUT_TEXT = 19
private const val ABOUT_WIDTH = 1300

private const val COUNTER_GAP = 10
private const val COUNTER_TEXT = 22
private const val COUNTER_WEIGHT = 700
private const val MS_PER_SEC = 1000L
private const val SEC_PER_MIN = 60
private const val SEC_PER_HOUR = 3600

private val Soft = Color.White.copy(alpha = 0.8f)
private val Faint = Color.White.copy(alpha = 0.62f)
private const val MaxChips = 4
