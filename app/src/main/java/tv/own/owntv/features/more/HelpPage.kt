package tv.own.owntv.features.more

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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
import tv.own.owntv.R
import tv.own.owntv.features.settings.SettingValue
import tv.own.owntv.features.settings.StageSettingRow
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.stage.solidCard
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/** One question of the guide: its mark in the list, the question and the answer. */
private class HelpItem(val icon: OwnTVIcon, val question: Int, val answer: Int)

/** A topic: its label over its questions, in the order they come up in the chat. */
private class HelpTopic(val label: Int, val items: List<HelpItem>)

private val HelpTopics = listOf(
    HelpTopic(
        R.string.help_section_start,
        listOf(
            HelpItem(OwnTVIcon.PLAYLIST, R.string.help_q1, R.string.help_a1),
            HelpItem(OwnTVIcon.REFRESH, R.string.help_q10, R.string.help_a10),
            HelpItem(OwnTVIcon.SEND, R.string.help_q11, R.string.help_a11),
            HelpItem(OwnTVIcon.POWER, R.string.help_q12, R.string.help_a12),
            HelpItem(OwnTVIcon.PHONE, R.string.help_q37, R.string.help_a37),
        ),
    ),
    HelpTopic(
        R.string.help_section_watch,
        listOf(
            HelpItem(OwnTVIcon.LIVE_TV, R.string.help_q2, R.string.help_a2),
            HelpItem(OwnTVIcon.FAVORITE, R.string.help_q3, R.string.help_a3),
            HelpItem(OwnTVIcon.IMAGE, R.string.help_q13, R.string.help_a13),
            HelpItem(OwnTVIcon.INFO, R.string.help_q16, R.string.help_a16),
            HelpItem(OwnTVIcon.MOTION, R.string.help_q15, R.string.help_a15),
            HelpItem(OwnTVIcon.PERSON, R.string.help_q17, R.string.help_a17),
            HelpItem(OwnTVIcon.LIST_GRID, R.string.help_q18, R.string.help_a18),
            HelpItem(OwnTVIcon.HISTORY, R.string.help_q19, R.string.help_a19),
            HelpItem(OwnTVIcon.AUDIO, R.string.help_q20, R.string.help_a20),
            HelpItem(OwnTVIcon.ASPECT, R.string.help_q21, R.string.help_a21),
            HelpItem(OwnTVIcon.PIP, R.string.help_q22, R.string.help_a22),
            HelpItem(OwnTVIcon.SEARCH, R.string.help_q23, R.string.help_a23),
            HelpItem(OwnTVIcon.STAR, R.string.help_q25, R.string.help_a25),
        ),
    ),
    HelpTopic(
        R.string.help_section_channels,
        listOf(
            HelpItem(OwnTVIcon.TEXT_SIZE, R.string.help_q26, R.string.help_a26),
            HelpItem(OwnTVIcon.SORT, R.string.help_q27, R.string.help_a27),
            HelpItem(OwnTVIcon.CLOSE, R.string.help_q28, R.string.help_a28),
            HelpItem(OwnTVIcon.MENU, R.string.help_q29, R.string.help_a29),
            HelpItem(OwnTVIcon.SHARE, R.string.help_q30, R.string.help_a30),
        ),
    ),
    HelpTopic(
        R.string.help_section_archive,
        listOf(
            HelpItem(OwnTVIcon.REWIND, R.string.help_q4, R.string.help_a4),
            HelpItem(OwnTVIcon.VIDEO, R.string.help_q5, R.string.help_a5),
            HelpItem(OwnTVIcon.PAUSE, R.string.help_q24, R.string.help_a24),
        ),
    ),
    HelpTopic(R.string.help_section_guide, listOf(HelpItem(OwnTVIcon.EPG, R.string.help_q6, R.string.help_a6))),
    HelpTopic(
        R.string.help_section_settings,
        listOf(
            HelpItem(OwnTVIcon.LANGUAGE, R.string.help_q31, R.string.help_a31),
            HelpItem(OwnTVIcon.PALETTE, R.string.help_q32, R.string.help_a32),
            HelpItem(OwnTVIcon.PERSON, R.string.help_q33, R.string.help_a33),
            HelpItem(OwnTVIcon.HOME, R.string.help_q34, R.string.help_a34),
            HelpItem(OwnTVIcon.SPARKLE, R.string.help_q35, R.string.help_a35),
            HelpItem(OwnTVIcon.SEND, R.string.help_q36, R.string.help_a36),
        ),
    ),
    HelpTopic(
        R.string.help_section_trouble,
        listOf(
            HelpItem(OwnTVIcon.DOWNLOADS, R.string.help_q7, R.string.help_a7),
            HelpItem(OwnTVIcon.PLAY, R.string.help_q8, R.string.help_a8),
            HelpItem(OwnTVIcon.WARNING, R.string.help_q9, R.string.help_a9),
            HelpItem(OwnTVIcon.BACKUP, R.string.help_q14, R.string.help_a14),
        ),
    ),
)

/**
 * "How to use": the questions as settings rows under their topics. OK opens a small window over the page with the
 * answer laid out: a sketch of where to go (the path through the screens with the item to press lit, or the remote
 * with its keys lit) beside the steps, numbered, with keys and menu items picked out. Back or OK closes it and focus
 * returns to the question.
 */
@Composable
internal fun helpPage(entry: FocusRequester) {
    var open by remember { mutableStateOf<Pair<HelpTopic, HelpItem>?>(null) }
    val requesters = remember { HelpTopics.flatMap { it.items }.associateWith { FocusRequester() } }
    Column(Modifier.fillMaxSize().focusGroup().verticalScroll(rememberScrollState()).padding(bottom = BOTTOM.mpx)) {
        val collator = remember { java.text.Collator.getInstance() }
        HelpTopics.forEachIndexed { t, topic ->
            tv.own.owntv.ui.stage.StageGroupLabel(stringResource(topic.label), sheet = true)
            // In each topic the questions run in the alphabet of the app's language.
            val titles = topic.items.associateWith { stringResource(it.question) }
            topic.items.sortedWith(compareBy(collator) { titles.getValue(it) }).forEachIndexed { i, item ->
                val answer = stringResource(item.answer)
                StageSettingRow(
                    icon = item.icon,
                    title = titles.getValue(item),
                    // The answer's first line as the hint, without its step number or point mark.
                    desc = HelpAnswer.plainFirstLine(answer),
                    value = SettingValue.Opens(null),
                    onClick = { open = topic to item },
                    modifier = Modifier.focusRequester(requesters.getValue(item))
                        .then(if (t == 0 && i == 0) Modifier.focusRequester(entry) else Modifier),
                )
            }
        }
    }
    open?.let { (topic, item) ->
        helpCard(item.icon, stringResource(topic.label), stringResource(item.question), stringResource(item.answer)) {
            open = null
            runCatching { requesters.getValue(item).requestFocus() }
        }
    }
}

/** The answer in a window of its own, fading and growing in; OK, Back or a click beside it close it. */
@Composable
private fun helpCard(icon: OwnTVIcon, topic: String, question: String, answer: String, onClose: () -> Unit) {
    val shown = remember { Animatable(0f) }
    val ok = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        runCatching { ok.requestFocus() }
        shown.animateTo(1f, tween(tv.own.owntv.ui.theme.MotionPrefs.dur(OPEN_MS)))
    }
    // Where every path starts, in the app's language ("Settings", "Channels"), so the sketch is drawn in all of them.
    val roots = setOf(stringResource(R.string.settings_title), stringResource(R.string.content_key_channels))
    val answerParts = remember(answer, roots) { HelpAnswer.parse(answer, roots) }
    tv.own.owntv.ui.components.OwnTVPopup(onDismissRequest = onClose, stageLayout = true) {
        BoxWithConstraints(
            Modifier.fillMaxSize().graphicsLayer { alpha = shown.value }.background(StageColors.Scrim)
                .pointerInput(onClose) { detectTapGestures { onClose() } }
                .focusGroup(),
            contentAlignment = Alignment.Center,
        ) {
            val wide = maxWidth >= WIDE_SCREEN.mpx
            Column(
                Modifier.width(CARD_WIDTH.mpx).heightIn(max = maxHeight - EDGE.mpx * 2)
                    .graphicsLayer {
                        val s = START_SCALE + (1f - START_SCALE) * shown.value
                        scaleX = s
                        scaleY = s
                    }
                    .solidCard(CARD_RADIUS.mpx)
                    .pointerInput(Unit) { detectTapGestures { } }
                    .padding(CARD_PADDING.mpx),
            ) {
                Text(
                    topic.uppercase(), style = stageText(EYEBROW_TEXT, BOLD),
                    color = tv.own.owntv.ui.theme.stageAccent.accent,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Text(
                    question, style = stageText(TITLE_TEXT, BOLD), color = StageColors.Text,
                    modifier = Modifier.padding(top = 6.mpx, bottom = 24.mpx),
                )
                // Every window keeps one layout: the sketch column on the left (only where it says something:
                // the path to press, or the remote's keys), the text in an even column on the right, from the
                // same top line. On a small screen the text takes the whole width.
                val sketch = answerParts.path.size >= 2 || answerParts.keys.isNotEmpty() || icon == OwnTVIcon.INFO
                Row(
                    Modifier.weight(1f, fill = false).heightIn(min = BODY_MIN.mpx),
                    horizontalArrangement = Arrangement.spacedBy(36.mpx),
                ) {
                    if (sketch && wide) helpSketch(answerParts)
                    Column(
                        Modifier.weight(1f).verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.mpx),
                    ) {
                        answerParts.lines.forEach { answerLine(it) }
                    }
                }
                gotIt(ok, onClose)
            }
        }
    }
}

/** "Got it" at the bottom right, where focus waits. */
@Composable
private fun gotIt(focus: FocusRequester, onClose: () -> Unit) {
    Box(Modifier.fillMaxWidth().padding(top = 26.mpx), contentAlignment = Alignment.CenterEnd) {
        tv.own.owntv.ui.stage.StageButton(
            stringResource(R.string.help_got_it), onClick = onClose, height = 56.mpx, textSize = 19,
            tinted = true, modifier = Modifier.focusRequester(focus),
        )
    }
}

/**
 * The sketch on the left, straight on the window with no box of its own: the path through the screens with the item to
 * press lit, the remote with the keys the answer uses, or the stream line for the stream's figures.
 */
@Composable
private fun helpSketch(answer: HelpAnswer) {
    Box(Modifier.width(SKETCH_WIDTH.mpx), contentAlignment = Alignment.TopCenter) {
        when {
            answer.path.size >= 2 -> pathSketch(answer.path)
            answer.keys.isNotEmpty() -> remoteSketch(answer.keys)
            else -> streamSketch()
        }
    }
}

/** A small settings sheet: the first screen's name, then each step down to the item to press, lit as focus is. */
@Composable
private fun pathSketch(path: List<String>) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.mpx)) {
        Text(
            path.first(), style = stageText(SKETCH_TITLE, BOLD), color = StageColors.Text,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(bottom = 8.mpx),
        )
        path.drop(1).forEachIndexed { i, step ->
            val last = i == path.size - 2
            Row(
                Modifier.fillMaxWidth().padding(start = (i * STEP_INDENT).mpx)
                    .background(
                        if (last) Color.White else StageColors.Text.copy(alpha = ROW_FILL),
                        tv.own.owntv.ui.stage.FocusBarShape,
                    )
                    .padding(horizontal = 12.mpx, vertical = 10.mpx),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.mpx),
            ) {
                Text(
                    step, style = stageText(SKETCH_ROW, if (last) BOLD else SEMI),
                    color = if (last) Color(INK_ON_WHITE) else StageColors.Text,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                )
                if (last) {
                    keyChip("OK", lit = true)
                } else {
                    Text("›", style = stageText(SKETCH_ROW, BOLD), color = StageColors.Dim)
                }
            }
        }
    }
}

/** A sample of the info's stream line, as it reads under the picture. */
@Composable
private fun streamSketch() {
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.End,
        verticalArrangement = Arrangement.spacedBy(14.mpx),
    ) {
        Text(
            stringResource(R.string.help_sample_next), style = stageText(SKETCH_ROW, SEMI), color = StageColors.Dim,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.fillMaxWidth(),
        )
        tv.own.owntv.player.tvBoxStreamFacts(
            tv.own.owntv.player.StreamFacts(
                height = SAMPLE_HEIGHT, fps = SAMPLE_FPS, codec = SAMPLE_CODEC, channels = 2, kbps = SAMPLE_KBPS,
            ),
        )
    }
}

/** The remote's arrows and OK, the ones the answer uses lit. */
@Composable
private fun remoteSketch(keys: Set<String>) {
    val ring = StageColors.Text.copy(alpha = RING_FILL)
    Box(Modifier.size(PAD.mpx).background(ring, CircleShape), contentAlignment = Alignment.Center) {
        Box(Modifier.align(Alignment.TopCenter).padding(top = 10.mpx)) { keyChip("▲", "▲" in keys) }
        Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 10.mpx)) { keyChip("▼", "▼" in keys) }
        Box(Modifier.align(Alignment.CenterStart).padding(start = 10.mpx)) { keyChip("◀", "◀" in keys) }
        Box(Modifier.align(Alignment.CenterEnd).padding(end = 10.mpx)) { keyChip("▶", "▶" in keys) }
        keyChip("OK", "OK" in keys, big = true)
    }
}

/** A key of the remote: lit in the accent when the answer uses it. */
@Composable
private fun keyChip(label: String, lit: Boolean, big: Boolean = false) {
    val accent = tv.own.owntv.ui.theme.stageAccent.accent
    Box(
        Modifier.size(if (big) KEY_BIG.mpx else KEY.mpx)
            .background(if (lit) accent else StageColors.Text.copy(alpha = KEY_IDLE), CircleShape)
            .then(if (lit) Modifier else Modifier.border(1.mpx, StageColors.Text.copy(alpha = KEY_LINE), CircleShape)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label, style = stageText(if (big) KEY_TEXT_BIG else KEY_TEXT, BOLD),
            color = if (lit) Color.White else StageColors.Muted, maxLines = 1, textAlign = TextAlign.Center,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** One line of the answer: a numbered step, a point, or plain text; keys and menu items picked out. */
@Composable
private fun answerLine(line: HelpAnswer.Line) {
    val accent = tv.own.owntv.ui.theme.stageAccent.accent
    val text = highlighted(line.text, accent)
    when (line.kind) {
        HelpAnswer.Kind.STEP -> Row(horizontalArrangement = Arrangement.spacedBy(12.mpx)) {
            Box(Modifier.size(STEP_DOT.mpx).background(accent, CircleShape), contentAlignment = Alignment.Center) {
                Text(
                    line.mark, style = stageText(STEP_NUMBER, BOLD), color = Color.White,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text, style = stageText(ANSWER_TEXT, REGULAR), color = StageColors.Text, modifier = Modifier.weight(1f),
            )
        }
        HelpAnswer.Kind.POINT -> Row(horizontalArrangement = Arrangement.spacedBy(12.mpx)) {
            Box(Modifier.padding(top = 10.mpx).size(POINT_DOT.mpx).background(accent, CircleShape))
            Text(
                text, style = stageText(ANSWER_TEXT, REGULAR), color = StageColors.Text, modifier = Modifier.weight(1f),
            )
        }
        HelpAnswer.Kind.TEXT -> Text(text, style = stageText(ANSWER_TEXT, REGULAR), color = StageColors.Muted)
    }
}

/** The remote's keys in the accent, and «menu items» in full white and bold, so the eye finds what to press. */
private fun highlighted(text: String, accent: Color): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        val key = HelpAnswer.KEYS.firstOrNull { text.startsWith(it, i) && HelpAnswer.isWholeKey(text, i, it) }
        val quote = HelpAnswer.OPEN_QUOTES.indexOf(text[i])
        when {
            key != null -> {
                withStyle(SpanStyle(color = accent, fontWeight = FontWeight.Bold)) { append(key) }
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
    enum class Kind { STEP, POINT, TEXT }

    class Line(val kind: Kind, val mark: String, val text: String)

    companion object {
        val KEYS = listOf("◀", "▶", "▲", "▼", "OK")
        const val OPEN_QUOTES = "«“„「『"
        const val CLOSE_QUOTES = "»”“」』"
        private val STEP = Regex("""^(\d+)\.\s+(.*)$""")
        private const val POINT = "• "
        private const val PATH_SEPARATOR = " › "

        private val LEAD_MARK = Regex("""^(?:\d+\.\s+|•\s+)""")

        fun plainFirstLine(answer: String): String = answer.lineSequence().first().replace(LEAD_MARK, "")

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
            // A line that is nothing but the path is drawn as the sketch and not written out again.
            val lines = raw.filterNot { path.isNotEmpty() && unquoted(it).trimEnd('.') == bare }
                .map { line ->
                    val step = STEP.find(line)
                    when {
                        step != null -> Line(Kind.STEP, step.groupValues[1], step.groupValues[2])
                        line.startsWith(POINT) -> Line(Kind.POINT, "", line.removePrefix(POINT))
                        else -> Line(Kind.TEXT, "", line)
                    }
                }
            val keys = KEYS.filter { k ->
                raw.any { line -> line.indices.any { line.startsWith(k, it) && isWholeKey(line, it, k) } }
            }
            return HelpAnswer(lines, path, keys.toSet())
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
private const val WIDE_SCREEN = 1100
private const val BODY_MIN = 260
private const val OPEN_MS = 220
private const val START_SCALE = 0.94f
private const val EDGE = 40
private const val CARD_WIDTH = 1240
private const val CARD_RADIUS = 30
private const val CARD_PADDING = 40
private const val EYEBROW_TEXT = 14
private const val TITLE_TEXT = 32
private const val SKETCH_WIDTH = 400
private const val SKETCH_TITLE = 20
private const val SKETCH_ROW = 17
private const val STEP_INDENT = 10
private const val ROW_FILL = 0.07f
private const val INK_ON_WHITE = 0xFF16181D
private const val RING_FILL = 0.06f
private const val PAD = 240
private const val KEY = 52
private const val SAMPLE_HEIGHT = 1080
private const val SAMPLE_FPS = 50f
private const val SAMPLE_CODEC = "H.264"
private const val SAMPLE_KBPS = 4700
private const val KEY_BIG = 76
private const val KEY_TEXT = 20
private const val KEY_TEXT_BIG = 22
private const val KEY_IDLE = 0.06f
private const val KEY_LINE = 0.18f
private const val STEP_DOT = 30
private const val STEP_NUMBER = 15
private const val POINT_DOT = 8
private const val ANSWER_TEXT = 19
private const val BOLD = 800
private const val SEMI = 600
private const val REGULAR = 500
