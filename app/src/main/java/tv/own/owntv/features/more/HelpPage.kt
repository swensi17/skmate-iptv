package tv.own.owntv.features.more

import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import tv.own.owntv.R
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx

/** The questions newcomers ask in the chat, each with where to go in the app — in the order they come up. */
private val HelpItems = listOf(
    R.string.help_q1 to R.string.help_a1,
    R.string.help_q2 to R.string.help_a2,
    R.string.help_q3 to R.string.help_a3,
    R.string.help_q4 to R.string.help_a4,
    R.string.help_q5 to R.string.help_a5,
    R.string.help_q6 to R.string.help_a6,
    R.string.help_q7 to R.string.help_a7,
    R.string.help_q8 to R.string.help_a8,
    R.string.help_q9 to R.string.help_a9,
    R.string.help_q10 to R.string.help_a10,
    R.string.help_q11 to R.string.help_a11,
    R.string.help_q12 to R.string.help_a12,
)

/**
 * "How to use": a short guide on the TV itself. Each answer is a focusable line, so ▲ ▼ read it like any
 * list; nothing opens, there is nothing to press.
 */
@Composable
internal fun helpPage(entry: FocusRequester) {
    Column(Modifier.fillMaxSize().focusGroup().verticalScroll(rememberScrollState()).padding(bottom = 40.mpx)) {
        HelpItems.forEachIndexed { i, (q, a) ->
            if (i > 0) {
                Box(
                    Modifier.fillMaxWidth().padding(horizontal = 30.mpx).height(1.mpx)
                        .background(StageColors.Text.copy(alpha = LINE_ALPHA)),
                )
            }
            helpItem(stringResource(q), stringResource(a), if (i == 0) Modifier.focusRequester(entry) else Modifier)
        }
    }
}

/** One question and its whole answer, a focusable line so ▲ ▼ scroll through them. */
@Composable
private fun helpItem(question: String, answer: String, modifier: Modifier) {
    tv.own.owntv.ui.stage.StageSurface(
        onClick = {}, radius = tv.own.owntv.ui.theme.StageRadii.Row, focusStyle = tv.own.owntv.ui.stage.StageFocus.FX,
        modifier = modifier.fillMaxWidth(),
    ) { _ ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.mpx, vertical = 20.mpx)) {
            androidx.tv.material3.Text(
                question, style = tv.own.owntv.ui.theme.stageText(QUESTION_TEXT, BOLD), color = StageColors.Text,
            )
            androidx.tv.material3.Text(
                answer, style = tv.own.owntv.ui.theme.stageText(ANSWER_TEXT, REGULAR), color = StageColors.Muted,
                modifier = Modifier.padding(top = 4.mpx),
            )
        }
    }
}

private const val LINE_ALPHA = 0.12f
private const val QUESTION_TEXT = 26
private const val ANSWER_TEXT = 20
private const val BOLD = 800
private const val REGULAR = 500
