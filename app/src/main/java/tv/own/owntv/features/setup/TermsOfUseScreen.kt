package tv.own.owntv.features.setup

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import kotlinx.coroutines.launch
import tv.own.owntv.R
import tv.own.owntv.ui.stage.StageButton
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/** Bumped when the terms change materially: everyone is asked again, once. */
const val TERMS_VERSION = 1

/** The terms, section by section: a heading (none for the opening) and its text. */
private val TermsSections = listOf(
    null to R.string.terms_intro,
    R.string.terms_h_player to R.string.terms_player,
    R.string.terms_h_content to R.string.terms_content,
    R.string.terms_h_data to R.string.terms_data,
    R.string.terms_h_warranty to R.string.terms_warranty,
    R.string.terms_h_liability to R.string.terms_liability,
    R.string.terms_h_license to R.string.terms_license,
    R.string.terms_h_changes to R.string.terms_changes,
    R.string.terms_h_contact to R.string.terms_contact,
)

/**
 * The terms of use, before anything else, once: on a new install and for those who already had the app.
 * Accepting is kept by [TERMS_VERSION] and survives updates; declining closes the app. ▲ ▼ read the text
 * while focus stays on the buttons, so there is nothing to scroll to before Accept.
 */
@Composable
fun termsOfUseScreen(onAccept: () -> Unit, onDecline: () -> Unit) {
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    val accept = remember { FocusRequester() }
    // The terms are the very first screen now: they open in the TV's language (or Russian), as the wizard does.
    val language: tv.own.owntv.features.settings.LanguageSettingsViewModel = org.koin.androidx.compose.koinViewModel()
    val tag by language.currentTag.collectAsStateWithLifecycle()
    LaunchedEffect(tag) {
        if (tag == tv.own.owntv.core.i18n.SupportedLocales.SYSTEM_DEFAULT_TAG) {
            language.setLocale(tv.own.owntv.features.settings.firstRunLanguage())
        }
    }
    // Focus once the buttons are placed: asked in the first frame it was lost and landed on Decline.
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(FOCUS_DELAY_MS)
        runCatching { accept.requestFocus() }
    }
    val stepPx = with(androidx.compose.ui.platform.LocalDensity.current) { SCROLL_STEP.mpx.toPx() }
    Box(
        Modifier.fillMaxSize().background(ScreenFill).onPreviewKeyEvent { e ->
            if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
            val dir = when (e.key) {
                Key.DirectionDown -> 1
                Key.DirectionUp -> -1
                else -> 0
            }
            if (dir != 0) scope.launch { scroll.animateScrollBy(dir * stepPx) }
            dir != 0
        },
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            Modifier.widthIn(max = TEXT_WIDTH.mpx).fillMaxSize().padding(top = 56.mpx, bottom = 40.mpx),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(stringResource(R.string.terms_title), style = stageText(TITLE_TEXT, BOLD), color = StageColors.Text)
            Column(Modifier.weight(1f).fillMaxWidth().padding(top = 28.mpx).verticalScroll(scroll)) {
                TermsSections.forEach { (heading, body) ->
                    if (heading != null) {
                        Text(
                            stringResource(heading), style = stageText(HEADING_TEXT, BOLD), color = StageColors.Text,
                            modifier = Modifier.padding(top = 26.mpx, bottom = 10.mpx),
                        )
                    }
                    Text(stringResource(body), style = stageText(BODY_TEXT, REGULAR), color = StageColors.Muted)
                }
                Text(
                    stringResource(R.string.terms_confirm),
                    style = stageText(BODY_TEXT, REGULAR),
                    color = StageColors.Muted,
                    modifier = Modifier.padding(top = 26.mpx, bottom = 8.mpx),
                )
            }
            termsButtons(onAccept, onDecline, accept)
        }
    }
}

/** Decline and exit, then Accept (tinted, where focus starts). */
@Composable
private fun termsButtons(onAccept: () -> Unit, onDecline: () -> Unit, accept: FocusRequester) {
    Row(Modifier.padding(top = 24.mpx), horizontalArrangement = Arrangement.spacedBy(16.mpx)) {
        StageButton(
            stringResource(R.string.terms_decline), onClick = onDecline, height = 56.mpx, textSize = BUTTON_TEXT,
        )
        StageButton(
            stringResource(R.string.terms_accept), onClick = onAccept, height = 56.mpx, textSize = BUTTON_TEXT,
            tinted = true, modifier = Modifier.focusRequester(accept),
        )
    }
}

/** The wizard's dark grey, so the terms open as part of it. */
private val ScreenFill = androidx.compose.ui.graphics.Color(SCREEN_FILL_ARGB)
private const val SCREEN_FILL_ARGB = 0xFF232629

private const val FOCUS_DELAY_MS = 150L
private const val TEXT_WIDTH = 1100
private const val SCROLL_STEP = 160
private const val TITLE_TEXT = 40
private const val HEADING_TEXT = 26
private const val BODY_TEXT = 24
private const val BUTTON_TEXT = 19
private const val BOLD = 800
private const val REGULAR = 500
