package tv.own.owntv.features.shell

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.tv.material3.Text
import tv.own.owntv.R
import tv.own.owntv.features.more.CHAT_HANDLE
import tv.own.owntv.ui.stage.StageButton
import tv.own.owntv.ui.stage.StagePopup
import tv.own.owntv.ui.theme.StageColors
import androidx.compose.foundation.layout.widthIn
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageAccent
import tv.own.owntv.ui.theme.stageText

/** Remembers on this television that the Telegram note has been shown, so it comes once, on the first entry. */
internal object TelegramWelcomePrefs {
    private const val FILE = "welcome"
    private const val KEY = "telegram_shown"

    fun shown(context: Context): Boolean = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean(KEY, false)

    fun markShown(context: Context) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean(KEY, true).apply()
    }
}

/**
 * The first-entry note about our Telegram chat: the Telegram mark in the middle, what the chat is for, the
 * chat's name to type into Telegram and its link. One button closes it, and it never comes back on its own;
 * the same address stays in More › About.
 */
@Composable
internal fun TelegramWelcome(onDismiss: () -> Unit) {
    val ok = remember { androidx.compose.ui.focus.FocusRequester() }
    androidx.compose.runtime.LaunchedEffect(Unit) { kotlinx.coroutines.delay(80); runCatching { ok.requestFocus() } }
    StagePopup(onDismiss = onDismiss, title = null, width = 760.mpx, scroll = false) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Image(painter = painterResource(R.drawable.social_telegram), contentDescription = null, modifier = Modifier.size(96.mpx))
            Spacer(Modifier.height(22.mpx))
            Text(stringResource(R.string.welcome_telegram_title), style = stageText(32, 800), color = StageColors.Text, textAlign = TextAlign.Center)
            Spacer(Modifier.height(14.mpx))
            Text(stringResource(R.string.welcome_telegram_body), style = stageText(20, 500), color = StageColors.Muted, textAlign = TextAlign.Center)
            Spacer(Modifier.height(22.mpx))
            Text("@$CHAT_HANDLE", style = stageText(30, 800), color = stageAccent.accent, textAlign = TextAlign.Center)
            Spacer(Modifier.height(4.mpx))
            Text("t.me/$CHAT_HANDLE", style = stageText(24, 600), color = StageColors.Text, textAlign = TextAlign.Center)
            Spacer(Modifier.height(26.mpx))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(0.mpx)) {
                StageButton(stringResource(R.string.welcome_telegram_ok), onClick = onDismiss, modifier = Modifier.widthIn(min = 320.mpx).focusRequester(ok))
            }
        }
    }
}
