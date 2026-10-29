package tv.own.owntv.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser

/** The three social marks of the About page. */
enum class SocialIcon { GITHUB, TELEGRAM, TWITTER }

/*
 * GitHub and Telegram: Phosphor Icons (regular, 256 grid, 2021 pack on IconScout); Twitter: Unicons (24 grid).
 * Downloaded from IconScout as SVG — see docs/third-party/ui-icons.md; kept in tools/icons/.
 */
private const val GithubPath =
    "M84 232a24 24 0 0 0 24-24V160M172 232a24 24 0 0 1-24-24V160M152 160h16a24 24 0 0 1 24 24v8a24 24 0 0 0 24 24M104 160H88a24 24 0 0 0-24 24v8a24 24 0 0 1-24 24M64.51166 76.70377A51.90056 51.90056 0 0 1 68 32a51.9599 51.9599 0 0 1 43.82469 23.9988V56h32.35061V55.9988A51.9599 51.9599 0 0 1 188 32a51.90056 51.90056 0 0 1 3.48834 44.70377l0 0A47.77872 47.77872 0 0 1 200 104v8a48 48 0 0 1-48 48H104a48 48 0 0 1-48-48v-8a47.77872 47.77872 0 0 1 8.51163-27.29627z"
private const val TelegramBody =
    "M88,134.87236l89.91726,79.12718a8,8,0,0,0,13.08288-4.21869L228.61385,45.64829a8,8,0,0,0-10.72308-9.233L33.33393,108.91975a8,8,0,0,0,1.35629,15.29065Z"
private const val TelegramTail = "M132.90708,174.39059l-31.25023,31.25023A8,8,0,0,1,88,199.984v-65.1116"
private const val TwitterPath =
    "M22,5.8a8.49,8.49,0,0,1-2.36.64,4.13,4.13,0,0,0,1.81-2.27,8.21,8.21,0,0,1-2.61,1,4.1,4.1,0,0,0-7,3.74A11.64,11.64,0,0,1,3.39,4.62a4.16,4.16,0,0,0-.55,2.07A4.09,4.09,0,0,0,4.66,10.1,4.05,4.05,0,0,1,2.8,9.59v.05a4.1,4.1,0,0,0,3.3,4A3.93,3.93,0,0,1,5,13.81a4.9,4.9,0,0,1-.77-.07,4.11,4.11,0,0,0,3.83,2.84A8.22,8.22,0,0,1,3,18.34a7.93,7.93,0,0,1-1-.06,11.57,11.57,0,0,0,6.29,1.85A11.59,11.59,0,0,0,20,8.45c0-.17,0-.35,0-.53A8.43,8.43,0,0,0,22,5.8Z"

@Composable
fun SocialIcon(icon: SocialIcon, tint: Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val grid = if (icon == SocialIcon.TWITTER) 24f else 256f
        val s = size.minDimension / grid
        scale(s, s, pivot = Offset.Zero) {
            when (icon) {
                SocialIcon.GITHUB -> drawPath(
                    PathParser().parsePathString(GithubPath).toPath(), tint,
                    style = Stroke(width = 12f, cap = StrokeCap.Round, join = StrokeJoin.Round),
                )
                SocialIcon.TELEGRAM -> {
                    val line = Stroke(width = 16f, cap = StrokeCap.Round, join = StrokeJoin.Round)
                    drawPath(PathParser().parsePathString(TelegramBody).toPath(), tint, style = line)
                    drawLine(tint, Offset(88f, 134.872f), Offset(224.112f, 36.569f), strokeWidth = 16f, cap = StrokeCap.Round)
                    drawPath(PathParser().parsePathString(TelegramTail).toPath(), tint, style = line)
                }
                SocialIcon.TWITTER -> drawPath(PathParser().parsePathString(TwitterPath).toPath(), tint, style = Fill)
            }
        }
    }
}
