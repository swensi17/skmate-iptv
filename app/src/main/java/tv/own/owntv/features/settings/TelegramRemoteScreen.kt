package tv.own.owntv.features.settings

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import org.koin.compose.koinInject
import tv.own.owntv.R
import tv.own.owntv.features.remote.TelegramRemote
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText

/** This screen's rows as Settings search finds them. */
internal val TELEGRAM_REMOTE_SEARCH_ROWS: List<Int> = listOf(
    R.string.settings_tg_remote,
    R.string.settings_tg_remote_unlink_title,
    R.string.settings_tg_own,
    R.string.settings_tg_own_token,
    R.string.settings_tg_own_remove,
)

/**
 * Pair this TV with the Telegram bot: a code (and a QR code that opens the bot with it) until the viewer
 * sends it, then who it is linked to and a way to unlink.
 */
@Composable
fun TelegramRemoteScreen(onBack: () -> Unit, modifier: Modifier = Modifier) {
    val remote: TelegramRemote = koinInject()
    val state by remote.state.collectAsStateWithLifecycle()
    // Opening the page asks for a code unless the TV is linked; leaving it unlinked stops listening.
    DisposableEffect(Unit) {
        if (remote.state.value !is TelegramRemote.State.Linked) remote.requestCode()
        onDispose { remote.closePairing() }
    }
    var confirmUnlink by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    val rowsFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { rowsFocus.requestFocus() } }

    val explanation = stringResource(R.string.settings_tg_remote_explanation, TelegramRemote.BOT)
    StageFullPage(
        parents = listOf(stringResource(R.string.settings_group_app)),
        title = stringResource(R.string.settings_tg_remote),
        count = pluralStringResource(R.plurals.settings_setting_count, 1, 1),
        onBack = onBack,
        modifier = modifier,
        rowsFocus = rowsFocus,
    ) {
        val s = state
        if (confirmUnlink) {
            tv.own.owntv.ui.stage.StageConfirm(
                title = stringResource(R.string.settings_tg_remote_unlink_title),
                body = stringResource(R.string.settings_tg_remote_unlink_body),
                confirm = stringResource(R.string.settings_tg_remote_unlink),
                onConfirm = { confirmUnlink = false; remote.unlink() },
                onCancel = { confirmUnlink = false },
                focusCancel = true,
            )
        }
        // The middle of the page: the QR code with the code under it while waiting, a tick once linked.
        PairingCard(s)
        val (title, icon, action) = when (s) {
            is TelegramRemote.State.Linked -> Triple(stringResource(R.string.settings_tg_remote_unlink), OwnTVIcon.CLOSE, { confirmUnlink = true })
            else -> Triple(stringResource(R.string.settings_tg_remote_new_code), OwnTVIcon.REFRESH, { remote.requestCode() })
        }
        StageSettingRow(
            icon = icon,
            title = title,
            desc = null,
            value = null,
            onClick = action,
            help = SettingHelp(title, explanation, hints = settingHints(null, pinnable = false)),
        )
        OwnBotRows()
    }
}

/** A bot of the viewer: its token goes in a window in the middle of the screen, and the TV runs the bot on its own. */
@Composable
private fun OwnBotRows() {
    val bot: tv.own.owntv.features.remote.OwnTelegramBot = koinInject()
    val state by bot.state.collectAsStateWithLifecycle()
    val help = stringResource(R.string.settings_tg_own_explanation)
    var editing by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    var removing by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    if (editing) TokenPopup(onSave = { bot.setToken(it); editing = false }, onDismiss = { editing = false })
    if (removing) {
        tv.own.owntv.ui.stage.StageConfirm(
            title = stringResource(R.string.settings_tg_own_remove),
            body = stringResource(R.string.settings_tg_own_remove_body),
            confirm = stringResource(R.string.settings_tg_own_remove),
            onConfirm = { removing = false; bot.remove() },
            onCancel = { removing = false },
            focusCancel = true,
        )
    }
    val title = stringResource(R.string.settings_tg_own)
    val status = when (val s = state) {
        is tv.own.owntv.features.remote.OwnTelegramBot.State.Waiting -> stringResource(R.string.settings_tg_own_waiting, s.botName, s.code.chunked(3).joinToString(" "))
        is tv.own.owntv.features.remote.OwnTelegramBot.State.Running -> stringResource(R.string.settings_tg_own_running, s.botName, s.owner.ifBlank { s.botName })
        tv.own.owntv.features.remote.OwnTelegramBot.State.BadToken -> stringResource(R.string.settings_tg_own_bad)
        tv.own.owntv.features.remote.OwnTelegramBot.State.NoNetwork -> stringResource(R.string.settings_tg_own_offline)
        tv.own.owntv.features.remote.OwnTelegramBot.State.Checking -> stringResource(R.string.settings_tg_own_checking)
        tv.own.owntv.features.remote.OwnTelegramBot.State.Off -> stringResource(R.string.settings_tg_own_token_hint)
    }
    StageSettingRow(
        icon = OwnTVIcon.SEND,
        title = title,
        desc = status,
        value = null,
        onClick = { editing = true },
        help = SettingHelp(title, help, hints = settingHints(null, pinnable = false)),
    )
    if (state != tv.own.owntv.features.remote.OwnTelegramBot.State.Off) {
        val remove = stringResource(R.string.settings_tg_own_remove)
        StageSettingRow(
            icon = OwnTVIcon.CLOSE,
            title = remove,
            desc = null,
            value = null,
            onClick = { removing = true },
            help = SettingHelp(remove, help, hints = settingHints(null, pinnable = false)),
        )
    }
}

@Composable
private fun TokenPopup(onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var token by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf("") }
    val fieldFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { kotlinx.coroutines.delay(FOCUS_DELAY_MS); runCatching { fieldFocus.requestFocus() } }
    // A Stage popup: it sits in the middle and rises above the keyboard, so the page behind does not move.
    tv.own.owntv.ui.stage.StagePopup(
        onDismiss = onDismiss,
        title = stringResource(R.string.settings_tg_own_token),
        body = stringResource(R.string.settings_tg_own_token_hint),
        buttons = {
            tv.own.owntv.ui.stage.StageButton(stringResource(R.string.common_cancel), onClick = onDismiss, height = BUTTON_H.mpx, textSize = BUTTON_TEXT)
            tv.own.owntv.ui.stage.StageButton(stringResource(R.string.common_save), onClick = { if (token.isNotBlank()) onSave(token) }, height = BUTTON_H.mpx, textSize = BUTTON_TEXT, tinted = true)
        },
    ) {
        StageFieldRow(
            OwnTVIcon.PENCIL, stringResource(R.string.settings_tg_own_token), token, { token = it },
            placeholder = stringResource(R.string.settings_tg_own_token_hint),
            password = true,
            onDone = { if (token.isNotBlank()) onSave(token) },
            modifier = Modifier.focusRequester(fieldFocus),
        )
    }
}

private const val FOCUS_DELAY_MS = 60L
private const val BUTTON_H = 56
private const val BUTTON_TEXT = 19

@Composable
private fun PairingCard(state: TelegramRemote.State) {
    Column(
        Modifier.fillMaxWidth().padding(top = 8.mpx, bottom = 12.mpx),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val linked = state is TelegramRemote.State.Linked
        Box(Modifier.size(if (linked) 200.mpx else 300.mpx), contentAlignment = Alignment.Center) {
            val code = (state as? TelegramRemote.State.Code)?.code
            // The QR code fades out and the tick draws itself in when the bot takes the code.
            val qrAlpha by animateFloatAsState(if (linked || code == null) 0f else 1f, tween(QR_FADE_MS), label = "qr")
            if (code != null || qrAlpha > 0f) {
                val qr = remember(code) { code?.let { tv.own.owntv.core.companion.CompanionLink.renderQr(TelegramRemote.botLink(it)) } }
                if (qr != null) {
                    Box(Modifier.fillMaxSize().graphicsLayer { alpha = qrAlpha }.clip(RoundedCornerShape(20.mpx)).background(Color.White).padding(16.mpx)) {
                        androidx.compose.foundation.Image(qr.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxSize())
                    }
                }
            }
            if (state is TelegramRemote.State.Connecting) {
                tv.own.owntv.ui.components.OwnTVSpinner(sizeDp = SPINNER_DP, color = StageColors.Text)
            }
            LinkedTick(visible = linked)
        }
        val line = when (state) {
            is TelegramRemote.State.Code -> state.code.chunked(CODE_GROUP).joinToString(" ")
            is TelegramRemote.State.Linked -> stringResource(R.string.settings_tg_remote_linked, state.owner.ifBlank { TelegramRemote.BOT })
            is TelegramRemote.State.Failed -> stringResource(R.string.settings_tg_remote_failed)
            else -> stringResource(R.string.settings_tg_remote_connecting)
        }
        Text(
            line,
            style = stageText(if (state is TelegramRemote.State.Code) CODE_SIZE else LINE_SIZE, 800),
            color = StageColors.Text,
            modifier = Modifier.padding(top = if (linked) 2.mpx else 14.mpx),
        )
        if (state is TelegramRemote.State.Code) {
            Text(
                stringResource(R.string.settings_tg_remote_code_hint, TelegramRemote.BOT),
                style = stageText(HINT_SIZE, 500),
                color = StageColors.Muted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.mpx, start = 24.mpx, end = 24.mpx),
            )
        }
    }
}

/** A green disc with a tick that draws itself, once, when the TV is linked. */
@Composable
private fun LinkedTick(visible: Boolean) {
    val disc by animateFloatAsState(if (visible) 1f else 0f, spring(dampingRatio = 0.6f, stiffness = 300f), label = "disc")
    val stroke by animateFloatAsState(if (visible) 1f else 0f, tween(TICK_MS, delayMillis = if (visible) TICK_DELAY_MS else 0), label = "tick")
    if (disc <= 0.01f) return
    Canvas(Modifier.size(150.mpx).graphicsLayer { scaleX = disc; scaleY = disc; alpha = disc.coerceIn(0f, 1f) }) {
        drawCircle(TickGreen)
        val path = Path().apply {
            moveTo(size.width * 0.28f, size.height * 0.52f)
            lineTo(size.width * 0.44f, size.height * 0.67f)
            lineTo(size.width * 0.73f, size.height * 0.36f)
        }
        val part = Path()
        PathMeasure().apply { setPath(path, false); getSegment(0f, length * stroke, part, true) }
        drawPath(part, Color.White, style = Stroke(width = size.width * 0.08f, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

private val TickGreen = Color(0xFF2EB872)
private const val QR_FADE_MS = 400
private const val TICK_MS = 450
private const val TICK_DELAY_MS = 200
private const val SPINNER_DP = 48
private const val CODE_GROUP = 3
private const val CODE_SIZE = 44
private const val LINE_SIZE = 24
private const val HINT_SIZE = 18
