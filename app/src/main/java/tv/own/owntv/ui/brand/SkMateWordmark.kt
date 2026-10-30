package tv.own.owntv.ui.brand

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import androidx.tv.material3.Text
import tv.own.owntv.R
import tv.own.owntv.ui.theme.stageText

/** SkMate's brand blue (Family "link blue"): the "SK" of the wordmark, step markers, check marks. */
val SkMateBlue = Color(0xFF0086FC)

/**
 * The wordmark alone, no icon: "SK" in [SkMateBlue], "MATE" in the text colour (ink on cream), capitals (core's
 * `brand_wordmark_first` / `brand_wordmark_second`, generated from tools/brand/brand.json).
 */
@Composable
fun SkMateWordmark(modifier: Modifier = Modifier, size: Int = 30) {
    val first = stringResource(R.string.brand_wordmark_first)
    val second = stringResource(R.string.brand_wordmark_second)
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(color = SkMateBlue)) { append(first) }
            withStyle(SpanStyle(color = tv.own.owntv.ui.theme.StageColors.Text)) { append(second) }
        },
        style = stageText(size, 900).copy(letterSpacing = 0.06.em),
        maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        modifier = modifier,
    )
}
