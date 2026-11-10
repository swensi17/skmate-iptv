package tv.own.owntv.features.update

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import org.koin.compose.koinInject
import tv.own.owntv.R
import tv.own.owntv.core.update.UpdateManager
import tv.own.owntv.ui.stage.StageButton
import tv.own.owntv.ui.stage.StagePopup
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.UpdatePrefs
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageAccent

/**
 * The update prompt: a small window in the middle of the screen. The check at start is silent — nothing
 * is shown while it runs or when the app is up to date — and the window only appears when there is
 * something to answer: an update to take or put off, a download in progress, a file ready to install,
 * or a download that failed. Update downloads in the background and carries on from the bytes already
 * on disk after a lost connection or a restart; Later puts the window away and it returns when the
 * file is in. With automatic updates on, it downloads and installs by itself when the install window allows.
 */
@Composable
fun UpdateStatusToast(onDone: () -> Unit, onViewChangelog: () -> Unit, modifier: Modifier = Modifier) {
    val manager: UpdateManager = koinInject()
    val state by manager.state.collectAsStateWithLifecycle()
    val focus = remember { FocusRequester() }
    val auto = UpdatePrefs.auto

    LaunchedEffect(state) {
        when (val s = state) {
            UpdateManager.State.UpToDate -> { manager.reset(); onDone() }
            // A failed look for an update stays quiet; only a failed download is worth a window.
            is UpdateManager.State.Failed ->
                if (s.retryInfo == null) { manager.reset(); onDone() } else { delay(120); runCatching { focus.requestFocus() } }
            is UpdateManager.State.Available -> if (auto) manager.download() else { delay(120); runCatching { focus.requestFocus() } }
            is UpdateManager.State.Ready ->
                if (auto && UpdatePrefs.mayInstallNow()) manager.installReady()
                else { delay(120); runCatching { focus.requestFocus() } }
            UpdateManager.State.Idle -> onDone()
            else -> Unit
        }
    }

    val primary = Modifier.focusRequester(focus)
    when (val s = state) {
        UpdateManager.State.Idle, UpdateManager.State.Checking, UpdateManager.State.UpToDate -> Unit
        is UpdateManager.State.Failed -> if (s.retryInfo != null) {
            UpdateWindow(
                title = stringResource(R.string.update_title),
                body = updateFailureText(s.failure),
                onDismiss = { manager.reset(); onDone() },
            ) {
                StageButton(stringResource(R.string.settings_close), onClick = { manager.reset(); onDone() }, height = 52.mpx, textSize = 18)
                StageButton(stringResource(R.string.update_try_again), onClick = { manager.retry() }, height = 52.mpx, textSize = 18, tinted = true, modifier = primary)
            }
        }
        is UpdateManager.State.Available -> UpdateWindow(
            title = stringResource(R.string.update_available),
            body = stringResource(R.string.update_available_version, s.info.version, manager.currentVersion),
            onDismiss = onDone, // Back = Later
        ) {
            StageButton(stringResource(R.string.update_whats_new), onClick = onViewChangelog, height = 52.mpx, textSize = 18)
            StageButton(stringResource(R.string.update_later), onClick = onDone, height = 52.mpx, textSize = 18)
            StageButton(stringResource(R.string.update_now), onClick = { manager.download() }, height = 52.mpx, textSize = 18, tinted = true, modifier = primary)
        }
        is UpdateManager.State.Downloading -> UpdateWindow(
            title = stringResource(R.string.update_title),
            body = stringResource(R.string.update_background),
            progress = s.percent,
            onDismiss = onDone,
            buttons = if (auto) null else ({
                StageButton(stringResource(R.string.update_later), onClick = onDone, height = 52.mpx, textSize = 18, tinted = true)
            }),
        )
        is UpdateManager.State.Ready -> UpdateWindow(
            title = stringResource(R.string.update_downloaded),
            body = stringResource(R.string.update_ready, s.info.version, manager.currentVersion),
            onDismiss = onDone,
        ) {
            StageButton(stringResource(R.string.update_later), onClick = onDone, height = 52.mpx, textSize = 18)
            StageButton(stringResource(R.string.update_install), onClick = { manager.installReady() }, height = 52.mpx, textSize = 18, tinted = true, modifier = primary)
        }
    }
}

/** One compact window for every state of the prompt: a title, a line of text, an optional progress bar, the buttons. */
@Composable
private fun UpdateWindow(
    title: String,
    body: String,
    onDismiss: () -> Unit,
    progress: Int? = null,
    buttons: (@Composable RowScope.() -> Unit)? = null,
) {
    StagePopup(
        onDismiss = onDismiss,
        title = title,
        body = body,
        width = 760.mpx,
        scroll = false,
        buttons = buttons,
    ) {
        if (progress != null) UpdateProgressBar(progress)
    }
}

/** A thin bar in the accent colour; the percentage is in the text of the window above it. */
@Composable
private fun UpdateProgressBar(percent: Int) {
    val fraction = (percent / 100f).coerceIn(0.02f, 1f)
    Box(
        Modifier
            .fillMaxWidth()
            .height(8.mpx)
            .clip(RoundedCornerShape(4.mpx))
            .background(StageColors.Text.copy(alpha = 0.12f)),
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction)
                .fillMaxHeight()
                .clip(RoundedCornerShape(4.mpx))
                .background(stageAccent.accent),
        )
    }
}
