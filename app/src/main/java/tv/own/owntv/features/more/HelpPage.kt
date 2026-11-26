package tv.own.owntv.features.more

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.tv.material3.Text
import kotlinx.coroutines.launch
import tv.own.owntv.R
import tv.own.owntv.features.settings.SettingValue
import tv.own.owntv.features.settings.StageSettingRow
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.stage.solidCard
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.mpxSp
import tv.own.owntv.ui.theme.stageText

/** One question of the guide: its mark in the list, the question, what the thing is, and the answer. */
private class HelpItem(val icon: OwnTVIcon, val question: Int, val about: Int, val answer: Int)

/** A topic: its label over its questions, in the order they come up in the chat. */
private class HelpTopic(val label: Int, val items: List<HelpItem>)

private val HelpTopics = listOf(
    HelpTopic(
        R.string.help_section_start,
        listOf(
            HelpItem(OwnTVIcon.PLAYLIST, R.string.help_q1, R.string.help_d1, R.string.help_a1),
            HelpItem(OwnTVIcon.REFRESH, R.string.help_q10, R.string.help_d10, R.string.help_a10),
            HelpItem(OwnTVIcon.SEND, R.string.help_q11, R.string.help_d11, R.string.help_a11),
            HelpItem(OwnTVIcon.POWER, R.string.help_q12, R.string.help_d12, R.string.help_a12),
            HelpItem(OwnTVIcon.PHONE, R.string.help_q37, R.string.help_d37, R.string.help_a37),
        ),
    ),
    HelpTopic(
        R.string.help_section_watch,
        listOf(
            HelpItem(OwnTVIcon.LIVE_TV, R.string.help_q2, R.string.help_d2, R.string.help_a2),
            HelpItem(OwnTVIcon.FAVORITE, R.string.help_q3, R.string.help_d3, R.string.help_a3),
            HelpItem(OwnTVIcon.IMAGE, R.string.help_q13, R.string.help_d13, R.string.help_a13),
            HelpItem(OwnTVIcon.VIDEO, R.string.help_q16, R.string.help_d16, R.string.help_a16),
            HelpItem(OwnTVIcon.MOTION, R.string.help_q15, R.string.help_d15, R.string.help_a15),
            HelpItem(OwnTVIcon.PERSON, R.string.help_q17, R.string.help_d17, R.string.help_a17),
            HelpItem(OwnTVIcon.LIST_GRID, R.string.help_q18, R.string.help_d18, R.string.help_a18),
            HelpItem(OwnTVIcon.HISTORY, R.string.help_q19, R.string.help_d19, R.string.help_a19),
            HelpItem(OwnTVIcon.AUDIO, R.string.help_q20, R.string.help_d20, R.string.help_a20),
            HelpItem(OwnTVIcon.ASPECT, R.string.help_q21, R.string.help_d21, R.string.help_a21),
            HelpItem(OwnTVIcon.PIP, R.string.help_q22, R.string.help_d22, R.string.help_a22),
            HelpItem(OwnTVIcon.SEARCH, R.string.help_q23, R.string.help_d23, R.string.help_a23),
            HelpItem(OwnTVIcon.STAR, R.string.help_q25, R.string.help_d25, R.string.help_a25),
        ),
    ),
    HelpTopic(
        R.string.help_section_channels,
        listOf(
            HelpItem(OwnTVIcon.TEXT_SIZE, R.string.help_q26, R.string.help_d26, R.string.help_a26),
            HelpItem(OwnTVIcon.SORT, R.string.help_q27, R.string.help_d27, R.string.help_a27),
            HelpItem(OwnTVIcon.CLOSE, R.string.help_q28, R.string.help_d28, R.string.help_a28),
            HelpItem(OwnTVIcon.MENU, R.string.help_q29, R.string.help_d29, R.string.help_a29),
            HelpItem(OwnTVIcon.SHARE, R.string.help_q30, R.string.help_d30, R.string.help_a30),
        ),
    ),
    HelpTopic(
        R.string.help_section_archive,
        listOf(
            HelpItem(OwnTVIcon.REWIND, R.string.help_q4, R.string.help_d4, R.string.help_a4),
            HelpItem(OwnTVIcon.REC, R.string.help_q5, R.string.help_d5, R.string.help_a5),
            HelpItem(OwnTVIcon.PAUSE, R.string.help_q24, R.string.help_d24, R.string.help_a24),
        ),
    ),
    HelpTopic(
        R.string.help_section_guide,
        listOf(HelpItem(OwnTVIcon.EPG, R.string.help_q6, R.string.help_d6, R.string.help_a6)),
    ),
    HelpTopic(
        R.string.help_section_settings,
        listOf(
            HelpItem(OwnTVIcon.LANGUAGE, R.string.help_q31, R.string.help_d31, R.string.help_a31),
            HelpItem(OwnTVIcon.PALETTE, R.string.help_q32, R.string.help_d32, R.string.help_a32),
            HelpItem(OwnTVIcon.PERSON, R.string.help_q33, R.string.help_d33, R.string.help_a33),
            HelpItem(OwnTVIcon.HOME, R.string.help_q34, R.string.help_d34, R.string.help_a34),
            HelpItem(OwnTVIcon.SPARKLE, R.string.help_q35, R.string.help_d35, R.string.help_a35),
            HelpItem(OwnTVIcon.SEND, R.string.help_q36, R.string.help_d36, R.string.help_a36),
        ),
    ),
    HelpTopic(
        R.string.help_section_trouble,
        listOf(
            HelpItem(OwnTVIcon.DOWNLOADS, R.string.help_q7, R.string.help_d7, R.string.help_a7),
            HelpItem(OwnTVIcon.PLAY, R.string.help_q8, R.string.help_d8, R.string.help_a8),
            HelpItem(OwnTVIcon.WARNING, R.string.help_q9, R.string.help_d9, R.string.help_a9),
            HelpItem(OwnTVIcon.BACKUP, R.string.help_q14, R.string.help_d14, R.string.help_a14),
        ),
    ),
)

/**
 * "How to use": the questions as settings rows under their topics, in the alphabet of the app's language. OK opens the
 * answer in a window in the middle of the screen: where to go, the steps, the points under their headings and the
 * conclusion. Back or OK closes it and focus returns to the question.
 */
@Composable
internal fun helpPage(entry: FocusRequester) {
    var open by remember { mutableStateOf<HelpItem?>(null) }
    val requesters = remember { HelpTopics.flatMap { it.items }.associateWith { FocusRequester() } }
    Column(Modifier.fillMaxSize().focusGroup().verticalScroll(rememberScrollState()).padding(bottom = BOTTOM.mpx)) {
        // What this page is, in one paragraph, before the questions.
        Text(
            stringResource(R.string.help_intro),
            style = stageText(INTRO_TEXT, REGULAR).copy(lineHeight = (INTRO_TEXT * ANSWER_LINE).mpxSp),
            color = StageColors.Muted, modifier = Modifier.padding(start = 30.mpx, end = 30.mpx, top = 4.mpx, bottom = 6.mpx),
        )
        val collator = remember { java.text.Collator.getInstance() }
        HelpTopics.forEachIndexed { t, topic ->
            topicTitle(stringResource(topic.label), first = t == 0)
            // In each topic the questions run in the alphabet of the app's language.
            val titles = topic.items.associateWith { stringResource(it.question) }
            topic.items.sortedWith(compareBy(collator) { titles.getValue(it) }).forEachIndexed { i, item ->
                StageSettingRow(
                    icon = item.icon,
                    title = titles.getValue(item),
                    // What it is, under the question: the list reads as a short guide on its own.
                    desc = stringResource(item.about),
                    value = SettingValue.Opens(null),
                    onClick = { open = item },
                    modifier = Modifier.focusRequester(requesters.getValue(item))
                        .then(if (t == 0 && i == 0) Modifier.focusRequester(entry) else Modifier),
                )
            }
        }
    }
    open?.let { item ->
        helpCard(stringResource(item.question), stringResource(item.about), stringResource(item.answer)) {
            open = null
            runCatching { requesters.getValue(item).requestFocus() }
        }
    }
}

/** A topic's name over its questions: white and large, as a heading the eye stops on. */
@Composable
private fun topicTitle(text: String, first: Boolean) {
    Text(
        text, style = stageText(TOPIC_TEXT, BOLD), color = StageColors.Text,
        maxLines = 1, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(start = 30.mpx, end = 16.mpx, top = if (first) 8.mpx else 26.mpx, bottom = 8.mpx),
    )
}

/**
 * The answer in a window of its own in the middle of the screen, fading and growing in: the steps, the points under
 * their headings and the conclusion. A long answer scrolls with ▲ ▼ while focus stays on the close mark; OK, Back or a
 * click beside the window close it.
 */
@Composable
private fun helpCard(question: String, about: String, answer: String, onClose: () -> Unit) {
    val shown = remember { Animatable(0f) }
    val close = remember { FocusRequester() }
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    val stepPx = with(androidx.compose.ui.platform.LocalDensity.current) { SCROLL_STEP.mpx.toPx() }
    LaunchedEffect(Unit) {
        runCatching { close.requestFocus() }
        shown.animateTo(1f, tween(tv.own.owntv.ui.theme.MotionPrefs.dur(OPEN_MS)))
    }
    // Where a path starts in the app's language ("Settings", "Channels"), so its line is picked out.
    val roots = setOf(stringResource(R.string.settings_title), stringResource(R.string.content_key_channels))
    val parts = remember(answer, roots) { HelpAnswer.parse(answer, roots) }
    tv.own.owntv.ui.components.OwnTVPopup(onDismissRequest = onClose, stageLayout = true) {
        BoxWithConstraints(
            Modifier.fillMaxSize().graphicsLayer { alpha = shown.value }.background(StageColors.Scrim)
                .pointerInput(onClose) { detectTapGestures { onClose() } }
                .onPreviewKeyEvent { e ->
                    val dir = when (e.key) {
                        Key.DirectionDown -> 1
                        Key.DirectionUp -> -1
                        else -> 0
                    }
                    if (dir != 0 && e.type == KeyEventType.KeyDown) {
                        scope.launch { scroll.animateScrollBy(dir * stepPx) }
                    }
                    dir != 0
                }
                .focusGroup(),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                Modifier.width(CARD_WIDTH.mpx.coerceAtMost(maxWidth - EDGE.mpx * 2))
                    .heightIn(max = maxHeight - EDGE.mpx * 2)
                    .graphicsLayer {
                        val s = START_SCALE + (1f - START_SCALE) * shown.value
                        scaleX = s
                        scaleY = s
                    }
                    .solidCard(CARD_RADIUS.mpx)
                    .pointerInput(Unit) { detectTapGestures { } }
                    .padding(CARD_PADDING.mpx),
            ) {
                cardHeader(question, close, onClose)
                Column(
                    Modifier.weight(1f, fill = false).verticalScroll(scroll),
                    verticalArrangement = Arrangement.spacedBy(LINE_GAP.mpx),
                ) {
                    // What it is first, in one paragraph; then where to go, the steps and points, and the conclusion.
                    Text(about, style = answerStyle(ANSWER_TEXT), color = StageColors.Text)
                    parts.lines.forEach { answerLine(it) }
                }
            }
        }
    }
}

/** The question, with the close mark in the top right corner where focus waits. */
@Composable
private fun cardHeader(question: String, focus: FocusRequester, onClose: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(bottom = 24.mpx), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f).padding(end = 24.mpx)) {
            Text(question, style = stageText(TITLE_TEXT, BOLD), color = StageColors.Text)
        }
        tv.own.owntv.ui.stage.StageButton(
            text = null, onClick = onClose, icon = OwnTVIcon.CLOSE, height = CLOSE_SIZE.mpx,
            modifier = Modifier.focusRequester(focus),
        )
    }
}

@Composable
private fun answerStyle(size: Int) = stageText(size, REGULAR).copy(lineHeight = (size * ANSWER_LINE).mpxSp)

/**
 * One line of the answer: a step with its number in an accent circle, a point with an accent dot, a heading in the
 * accent, the path where to go in white, plain text, and the conclusion as a white paragraph under a hairline.
 */
@Composable
private fun answerLine(line: HelpAnswer.Line) {
    val size = ANSWER_TEXT
    val accent = tv.own.owntv.ui.theme.stageAccent.accent
    val text = highlighted(line.text)
    when (line.kind) {
        HelpAnswer.Kind.STEP -> Row(horizontalArrangement = Arrangement.spacedBy(14.mpx)) {
            Box(Modifier.size(STEP_DOT.mpx).background(accent, CircleShape), contentAlignment = Alignment.Center) {
                Text(
                    line.mark, style = stageText(STEP_NUMBER, BOLD), color = Color.White,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Text(text, style = answerStyle(size), color = StageColors.Text, modifier = Modifier.weight(1f))
        }
        HelpAnswer.Kind.POINT -> Row(horizontalArrangement = Arrangement.spacedBy(14.mpx)) {
            val dotTop = (size * ANSWER_LINE / 2 - POINT_DOT / 2).toInt()
            Box(
                Modifier.padding(top = dotTop.mpx, start = POINT_INSET.mpx).size(POINT_DOT.mpx)
                    .background(accent, CircleShape),
            )
            Text(text, style = answerStyle(size), color = StageColors.Text, modifier = Modifier.weight(1f))
        }
        HelpAnswer.Kind.TEXT -> Text(text, style = answerStyle(size), color = StageColors.Text)
        // Where to go, first: the path through the settings, bold and white, as a line of its own.
        HelpAnswer.Kind.PATH -> Text(
            line.text, style = stageText(size, BOLD).copy(lineHeight = (size * ANSWER_LINE).mpxSp),
            color = StageColors.Text,
        )
        // A heading over its steps or points: bold, in the accent, a little larger, with room above it.
        HelpAnswer.Kind.HEADING -> Text(
            text, style = stageText(size + HEADING_STEP, BOLD), color = accent,
            modifier = Modifier.padding(top = HEADING_TOP.mpx),
        )
        // The conclusion: one plain paragraph after the steps.
        HelpAnswer.Kind.DONE -> Text(
            text, style = answerStyle(size), color = StageColors.Text,
            modifier = Modifier.padding(top = DONE_TOP.mpx),
        )
    }
}

/** The remote's keys and «menu items» in bold, so the eye finds what to press. */
private fun highlighted(text: String): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        val key = HelpAnswer.KEYS.firstOrNull { text.startsWith(it, i) && HelpAnswer.isWholeKey(text, i, it) }
        val quote = HelpAnswer.OPEN_QUOTES.indexOf(text[i])
        when {
            key != null -> {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(key) }
                i += key.length
            }
            quote >= 0 -> {
                val end = text.indexOf(HelpAnswer.CLOSE_QUOTES[quote], i + 1)
                if (end < 0) { append(text[i]); i++ } else {
                    withStyle(SpanStyle(color = Color.Unspecified, fontWeight = FontWeight.Bold)) {
                        append(text.substring(i, end + 1))
                    }
                    i = end + 1
                }
            }
            else -> { append(text[i]); i++ }
        }
    }
}

/** An answer read for the window: its lines, the path through the screens it names, and the keys it uses. */
private class HelpAnswer(val lines: List<Line>, val path: List<String>, val keys: Set<String>) {
    enum class Kind { PATH, HEADING, STEP, POINT, TEXT, DONE }

    class Line(val kind: Kind, val mark: String, val text: String)

    companion object {
        val KEYS = listOf("◀", "▶", "▲", "▼", "OK")
        const val OPEN_QUOTES = "«“„「『"
        const val CLOSE_QUOTES = "»”“」』"
        private val STEP = Regex("""^(\d+)\.\s+(.*)$""")
        private const val POINT = "• "
        private const val DONE = "✓ "
        private const val HEADING_MAX = 48
        private const val COLONS = ":："

        /** "Good to know:" — a short line that ends in a colon and says nothing after it heads what follows. */
        private fun isHeading(line: String): Boolean =
            line.length <= HEADING_MAX && line.last() in COLONS && line.dropLast(1).none { it in COLONS }
        private const val PATH_SEPARATOR = " › "

        /**
         * Every answer is laid out the same way: where to go, the steps numbered one after another (also across what
         * were separate blocks), and one closing paragraph that gathers the points and the conclusion. Headings are
         * left out: the steps and the paragraph say it plainly.
         */
        private fun plain(lines: List<Line>): List<Line> {
            val out = mutableListOf<Line>()
            val closing = mutableListOf<String>()
            var step = 0
            lines.forEach { line ->
                when (line.kind) {
                    Kind.STEP -> { step++; out += Line(Kind.STEP, step.toString(), line.text) }
                    Kind.POINT, Kind.DONE -> closing += line.text
                    Kind.HEADING -> Unit
                    else -> out += line
                }
            }
            if (closing.isNotEmpty()) out += Line(Kind.DONE, "", closing.joinToString(" "))
            return out
        }

        /** "OK" only as a word of its own, not inside "OKKO". */
        fun isWholeKey(text: String, at: Int, key: String): Boolean {
            if (key != "OK") return true
            val before = text.getOrNull(at - 1)
            val after = text.getOrNull(at + key.length)
            return (before == null || !before.isLetterOrDigit()) && (after == null || !after.isLetterOrDigit())
        }

        fun parse(answer: String, roots: Set<String>): HelpAnswer {
            val raw = answer.split('\n').map { it.trim() }.filter { it.isNotEmpty() }
            // The path is drawn when the answer starts with it; when it only comes up at the end, the keys matter more.
            val path = raw.take(PATH_LINES).firstNotNullOfOrNull { pathIn(it, roots) }.orEmpty()
            val bare = path.joinToString(PATH_SEPARATOR)
            val lines = raw
                .map { line ->
                    val step = STEP.find(line)
                    when {
                        // A line that is nothing but the path is where to go: picked out on its own.
                        path.isNotEmpty() && unquoted(line).trimEnd('.') == bare -> Line(Kind.PATH, "", line)
                        step != null -> Line(Kind.STEP, step.groupValues[1], step.groupValues[2])
                        line.startsWith(POINT) -> Line(Kind.POINT, "", line.removePrefix(POINT))
                        line.startsWith(DONE) -> Line(Kind.DONE, "", line.removePrefix(DONE))
                        isHeading(line) -> Line(Kind.HEADING, "", line)
                        else -> Line(Kind.TEXT, "", line)
                    }
                }
            val keys = KEYS.filter { k ->
                raw.any { line -> line.indices.any { line.startsWith(k, it) && isWholeKey(line, it, k) } }
            }
            return HelpAnswer(plain(lines), path, keys.toSet())
        }

        private fun unquoted(text: String) = text.filterNot { it in OPEN_QUOTES || it in CLOSE_QUOTES }

        /**
         * "Settings › Channel sources › «Add source»" in [line], step by step without the quotes: from the word just
         * before the first ›, which has to be where every path starts (Settings, Channels), to the end of the
         * sentence. A comma inside «quotes» belongs to the item ("«Turn off, keep it»").
         */
        private fun pathIn(line: String, roots: Set<String>): List<String>? {
            val at = line.indexOf(PATH_SEPARATOR)
            // The word right before the first ›, after a space or a colon (Chinese and Japanese write no spaces).
            val root = if (at < 0) "" else line.substring(0, at).trim()
                .substringAfterLast(' ').substringAfterLast('：').substringAfterLast(':')
            if (root !in roots) return null
            var end = line.length
            var close: Char? = null // the quote that ends the item being read, while inside one
            var i = at
            while (i < line.length) {
                val c = line[i]
                val open = OPEN_QUOTES.indexOf(c)
                when {
                    close != null && c == close -> close = null
                    close == null && open >= 0 -> close = CLOSE_QUOTES[open]
                }
                val quoted = close != null
                val stop = c in SENTENCE_STOPS || (c == ',' && line.getOrNull(i + 1) == ' ')
                if (!quoted && stop) { end = i; break }
                i++
            }
            val rest = unquoted(line.substring(at + PATH_SEPARATOR.length, end))
            return (listOf(root) + rest.split(PATH_SEPARATOR).map { it.trim() }).filter { it.isNotEmpty() }
        }

        private const val PATH_LINES = 2
        private const val SENTENCE_STOPS = ".:;。：；"
    }
}

private const val BOTTOM = 40
private const val INTRO_TEXT = 18
private const val SEMI = 600
private const val POINT_INSET = 6
private const val ANSWER_TEXT = 26
private const val SCROLL_STEP = 160
private const val CLOSE_SIZE = 52
private const val OPEN_MS = 220
private const val START_SCALE = 0.94f
private const val EDGE = 40
private const val CARD_WIDTH = 1180
private const val CARD_RADIUS = 30
private const val CARD_PADDING = 40
private const val TITLE_TEXT = 34
private const val STEP_DOT = 32
private const val STEP_NUMBER = 16
private const val POINT_DOT = 8
private const val HEADING_STEP = 2
private const val HEADING_TOP = 6
private const val DONE_TOP = 8
private const val LINE_GAP = 16
private const val TOPIC_TEXT = 22
private const val ANSWER_LINE = 1.5f
private const val BOLD = 800
private const val REGULAR = 500
