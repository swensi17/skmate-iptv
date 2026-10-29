package tv.own.owntv.features.setup

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.foundation.layout.offset
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import tv.own.owntv.ui.theme.stageAccent
import androidx.compose.runtime.getValue
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.fadeOut
import androidx.compose.animation.fadeIn
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.AnimatedVisibility
import tv.own.owntv.ui.brand.SkMateBlue
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.border
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.graphics.Brush
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.layout.Spacer
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.em
import androidx.tv.material3.Text
import tv.own.owntv.R
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.stage.StageFocus
import tv.own.owntv.ui.stage.StageKeyHints
import tv.own.owntv.ui.stage.StageSurface
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/** One footer button of a wizard step: its label and what OK on it does. */
internal class WizardAction(val label: String, val onClick: () -> Unit, val focus: FocusRequester? = null, val enabled: Boolean = true)

/** The five steps the dots show: which one a page belongs to. */
internal enum class WizardStep { LANGUAGE, DISPLAY, PROFILE, PLAYLIST, READY }

/**
 * Every setup step's frame: a dark-grey backdrop, the SKMATE wordmark top left, the numbered steps top
 * right, and the step itself in the middle of the screen with nothing behind it: a large centred title,
 * an optional line under it, the step's rows or cards, then [back] and [next] side by side, and the
 * key hints at the bottom. Back on the remote calls [back] (or [onBack] where the step has no Back button).
 */
@Composable
internal fun WizardFrame(
    step: WizardStep,
    title: String,
    sub: String?,
    back: WizardAction?,
    next: WizardAction?,
    onBack: (() -> Unit)? = back?.onClick,
    width: Dp = 1040.mpx,
    /** More buttons beside Back (the display step's Reset). */
    extraLeft: List<WizardAction> = emptyList(),
    /** Drawn right after the title on the same line (the welcome step's waving hand). */
    titleTrailing: (@Composable () -> Unit)? = null,
    /** Drawn centred above the title (the welcome step's TV). */
    titleAbove: (@Composable () -> Unit)? = null,
    titleSize: Int = 60,
    /** Space above [body]; a step with no body (welcome) passes 0 so the buttons sit under the title. */
    bodyTop: Dp = 36.mpx,
    /** The width of a button that is alone in its row. */
    singleWidth: Dp = 520.mpx,
    /**
     * The buttons row spans exactly the title's width (button from its left edge, [buttonsTrailing]
     * ending at its right), so the welcome step lines up on any screen.
     */
    matchTitleWidth: Boolean = false,
    /** Drawn right of the buttons, in their row (the welcome step's language globe). */
    buttonsTrailing: (@Composable () -> Unit)? = null,
    body: @Composable ColumnScope.() -> Unit = {},
) {
    if (onBack != null) BackHandler { onBack() }
    // Inside the onboarding the wordmark and the steps sit still above the sliding pages (the host
    // draws them, told the step here); a frame used on its own draws them itself.
    val header = LocalWizardHeader.current
    if (header != null) SideEffect { header(step) }
    BoxWithConstraints(Modifier.fillMaxSize().then(if (header == null) Modifier.background(SetupBackdrop) else Modifier)) {
        if (header == null) WizardHeader(step)

        Column(
            Modifier
                .align(Alignment.Center)
                .width(width.coerceAtMost(maxWidth - 128.mpx))
                .heightIn(max = maxHeight - 210.mpx)
                .focusGroup()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            titleAbove?.invoke()
            var titleWidth by remember { mutableStateOf(0.mpx) }
            val titleDensity = LocalDensity.current
            Row(
                Modifier.onSizeChanged { titleWidth = with(titleDensity) { it.width.toDp() } },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(0.mpx),
            ) {
                Text(title, style = stageText(titleSize, 600, (-0.03f).em), color = StageColors.Text, textAlign = TextAlign.Center)
                titleTrailing?.invoke()
            }
            if (!sub.isNullOrBlank()) {
                Text(
                    sub,
                    style = stageText(20, 500).copy(lineHeight = 30f.mpxLine()),
                    color = StageColors.Muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 14.mpx),
                )
            }
            Column(Modifier.fillMaxWidth().padding(top = bodyTop), verticalArrangement = Arrangement.spacedBy(6.mpx), content = body)
            if (back != null || next != null || extraLeft.isNotEmpty()) {
                val buttons = (listOfNotNull(back) + extraLeft).map { it to false } + listOfNotNull(next).map { it to true }
                val backButton = back
                // One size and one line for every button; alone it is singleWidth wide.
                val baseEach = if (buttons.size == 1) singleWidth else 260.mpx
                val gap = 14.mpx
                var focusedIndex by remember { mutableStateOf(0) }
                var rowFocused by remember { mutableStateOf(false) }
                // A trailing extra (the globe) is balanced by an empty slot of its width on the left, so
                // the buttons themselves stay centred — or, with matchTitleWidth, the button fills the
                // title's width less the extra.
                val density = LocalDensity.current
                var trailingWidth by remember { mutableStateOf(0.mpx) }
                val each = if (matchTitleWidth && buttons.size == 1 && titleWidth > 0.mpx) {
                    (titleWidth - if (buttonsTrailing != null) trailingWidth + gap else 0.mpx).coerceAtLeast(260.mpx)
                } else baseEach
                // One blue highlight behind the row slides from button to button as ◀ ▶ move the focus.
                // Entering the row puts it straight under the focused button; it only slides between buttons.
                val highlight = remember { androidx.compose.animation.core.Animatable(0f) }
                var wasInRow by remember { mutableStateOf(false) }
                LaunchedEffect(focusedIndex, rowFocused) {
                    val target = focusedIndex.toFloat()
                    if (rowFocused && wasInRow) highlight.animateTo(target, tween(HighlightMs, easing = FastOutSlowInEasing))
                    else highlight.snapTo(target)
                    wasInRow = rowFocused
                }
                val highlightX = (each + gap) * highlight.value
                val highlightAlpha by animateFloatAsState(if (rowFocused) 1f else 0f, tween(HighlightMs), label = "wizardHighlightAlpha")
                Row(Modifier.padding(top = 28.mpx), horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.CenterVertically) {
                if (buttonsTrailing != null && !matchTitleWidth) Spacer(Modifier.width(trailingWidth))
                Box(Modifier.onFocusChanged { rowFocused = it.hasFocus }) {
                    Box(
                        Modifier
                            .offset(x = highlightX)
                            .size(width = each, height = 76.mpx)
                            .graphicsLayer { alpha = highlightAlpha }
                            .background(SkMateBlue, RoundedCornerShape(16.mpx)),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.CenterVertically) {
                        buttons.forEachIndexed { i, (action, primary) ->
                            WizardButton(action, each, primary, Modifier.onFocusChanged { if (it.isFocused) focusedIndex = i }, isBack = action === backButton)
                        }
                    }
                }
                if (buttonsTrailing != null) {
                    Box(Modifier.onSizeChanged { trailingWidth = with(density) { it.width.toDp() } }) { buttonsTrailing() }
                }
                }
            }
        }
        StageKeyHints(
            listOf(
                stringResource(R.string.common_ok) to stringResource(R.string.content_key_select),
                stringResource(R.string.common_back) to stringResource(R.string.setup_key_previous_step),
            ),
            Modifier.align(Alignment.BottomCenter).padding(bottom = 44.mpx),
            textSize = 15,
        )
    }
}

/**
 * A step button: every one the same height and, in a row, the same width. The main one ([primary],
 * Continue) is filled with the accent and has a chevron; the others (Back, Reset) are grey.
 */
@Composable
private fun WizardButton(action: WizardAction, width: Dp, primary: Boolean, modifier: Modifier = Modifier, isBack: Boolean = false) {
    val a = stageAccent
    // Family pills: the main one ink (the accent), the others sand.
    val fill = if (primary) a.accent.copy(alpha = if (action.enabled) 1f else 0.3f) else StageColors.Ink.copy(alpha = 0.06f)
    StageSurface(
        onClick = action.onClick,
        radius = 16.mpx,
        // Focus = the blue highlight behind the row slides under this button; no decor of its own.
        focusStyle = StageFocus.NONE,
        enabled = action.enabled,
        idle = Modifier.background(fill, RoundedCornerShape(16.mpx)),
        contentAlignment = Alignment.Center,
        modifier = modifier.width(width).height(76.mpx).then(action.focus?.let { Modifier.focusRequester(it) } ?: Modifier),
    ) { focused ->
        // Focused: transparent, so the row's sliding white highlight shows through behind the text.
        val color = when {
            focused -> Color.White
            primary -> a.onAccent
            else -> StageColors.Text
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.mpx), verticalAlignment = Alignment.CenterVertically) {
            // Back says where it goes: an arrow pointing left before the word.
            if (isBack) OwnTVIcon(OwnTVIcon.BACK, color, Modifier.size(26.mpx))
            Text(action.label, style = stageText(24, 800), color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (primary) OwnTVIcon(OwnTVIcon.CHEVRON, color, Modifier.size(20.mpx))
        }
    }
}

/** Set by the onboarding host: the frames report their step to it instead of drawing the header. */
internal val LocalWizardHeader = staticCompositionLocalOf<((WizardStep) -> Unit)?> { null }

/** The SKMATE wordmark top left and the numbered steps top right. */
@Composable
internal fun BoxScope.WizardHeader(step: WizardStep) {
    // The logo itself, as on the launcher tile.
    androidx.compose.foundation.Image(
        painter = androidx.compose.ui.res.painterResource(R.drawable.skmate_logo),
        contentDescription = stringResource(R.string.app_name),
        modifier = Modifier.padding(start = 64.mpx, top = 48.mpx).height(40.mpx),
    )
    StepNumbers(step, Modifier.align(Alignment.TopEnd).padding(end = 64.mpx, top = 52.mpx))
}

/**
 * The steps as numbered circles, 1 to 5, joined by short lines: done ones filled blue, the current one
 * filled blue with its name beside it, later ones a grey ring.
 */
@Composable
private fun StepNumbers(current: WizardStep, modifier: Modifier) {
    // Every change animates: the blue runs along the line into the next circle and the step's name
    // slides open beside it while the previous one folds away, so the bar moves right step by step.
    Row(
        modifier.animateContentSize(tween(StepAnimMs)),
        horizontalArrangement = Arrangement.spacedBy(10.mpx),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WizardStep.entries.forEachIndexed { i, s ->
            val reached = s.ordinal <= current.ordinal
            val fill by animateColorAsState(if (reached) SkMateBlue else Color.Transparent, tween(StepAnimMs), label = "stepFill")
            val ring by animateColorAsState(if (reached) SkMateBlue else StepIdle, tween(StepAnimMs), label = "stepRing")
            val digit by animateColorAsState(if (reached) Color.White else StageColors.Muted, tween(StepAnimMs), label = "stepDigit")
            if (i > 0) Box(Modifier.size(width = 22.mpx, height = 2.mpx).background(ring))
            Box(
                Modifier.size(34.mpx).background(fill, CircleShape).border(2.mpx, ring, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text((i + 1).toString(), style = stageText(16, 800), color = digit)
            }
            AnimatedVisibility(
                visible = s == current,
                enter = fadeIn(tween(StepAnimMs)) + expandHorizontally(tween(StepAnimMs)),
                exit = fadeOut(tween(StepAnimMs)) + shrinkHorizontally(tween(StepAnimMs)),
            ) {
                Text(stringResource(s.labelRes), style = stageText(16, 700), color = StageColors.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

private const val StepAnimMs = 320


private const val HighlightMs = 200

/** The setup backdrop: the theme's flat page colour (cream paper in the Family light theme). */
internal val SetupBackdrop: Color @Composable get() = tv.own.owntv.ui.theme.LocalStagePalette.current.page
private val StepIdle: Color @Composable get() =
    if (tv.own.owntv.ui.theme.LocalStagePalette.current.isLight) Color(0xFFD9D3CB) else Color(0xFF4A5059)

private val WizardStep.labelRes: Int get() = when (this) {
    WizardStep.LANGUAGE -> R.string.settings_language
    WizardStep.DISPLAY -> R.string.setup_step_display
    WizardStep.PROFILE -> R.string.settings_group_profile
    WizardStep.PLAYLIST -> R.string.setup_step_playlist
    WizardStep.READY -> R.string.setup_step_ready
}

/** One choice card of a step (`.tile2`): icon, 23 px title, 16 px line; focused = FX. */
internal class WizardCard(val icon: OwnTVIcon, val title: String, val line: String, val onClick: () -> Unit)

/**
 * The cards side by side, equal widths and heights, 16 apart; the first takes [firstFocus]. Each card is
 * as tall as the tallest and starts its icon at the top, so a one-line card lines up with a two-line one.
 */
@Composable
internal fun WizardCards(cards: List<WizardCard>, firstFocus: FocusRequester? = null) {
    Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(16.mpx)) {
        cards.forEachIndexed { i, card ->
            StageSurface(
                onClick = card.onClick,
                radius = 16.mpx,
                focusStyle = StageFocus.FX,
                idle = Modifier.background(StageColors.Ink.copy(alpha = 0.05f), RoundedCornerShape(16.mpx)),
                contentAlignment = Alignment.TopStart,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .heightIn(min = 170.mpx)
                    .then(if (i == 0 && firstFocus != null) Modifier.focusRequester(firstFocus) else Modifier),
            ) { focused ->
                // Every card the same: icon, title, two lines at most, so the titles sit on one line across.
                Column(Modifier.fillMaxWidth().padding(24.mpx)) {
                    OwnTVIcon(card.icon, if (focused) StageColors.Text else StageColors.Muted, Modifier.size(38.mpx))
                    Text(card.title, style = stageText(23, 800), color = StageColors.Text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 18.mpx))
                    Text(card.line, style = stageText(16, 500).copy(lineHeight = 23.mpxLine()), color = StageColors.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.mpx))
                }
            }
        }
    }
}


@Composable
private fun Float.mpxLine() = with(androidx.compose.ui.platform.LocalDensity.current) { this@mpxLine.mpx.toSp() }

@Composable
private fun Int.mpxLine() = toFloat().mpxLine()
