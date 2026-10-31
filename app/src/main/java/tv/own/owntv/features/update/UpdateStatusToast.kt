package tv.own.owntv.features.update

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import tv.own.owntv.ui.components.tvNoticeCard
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import org.koin.compose.koinInject
import androidx.tv.material3.Text
import tv.own.owntv.R
import tv.own.owntv.ui.stage.stageGlass
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.stageText
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.core.update.UpdateManager
import tv.own.owntv.ui.components.OwnTVSpinner

/**
 * The update card in the top-right corner. At start (and every few hours) it looks for a new version:
 * "Checking…" → "You're up to date" (hides itself) — or, when there is one, a small window: Update, What's new,
 * Later. Update downloads in the background while the viewer goes on watching (the card can be put away with
 * Later; it comes back by itself when the file is in), then Install hands the file to the system installer.
 * With automatic updates on, it downloads and installs by itself when the install window allows.
 * Only the Available and Ready states take D-pad focus; the transient states never interrupt browsing.
 */
@Composable
fun UpdateStatusToast(onDone: () -> Unit, onViewChangelog: () -> Unit, modifier: Modifier = Modifier) {
    val manager: UpdateManager = koinInject()
    val state by manager.state.collectAsStateWithLifecycle()
    val focus = remember { FocusRequester() }
    val auto = tv.own.owntv.ui.theme.UpdatePrefs.auto

    // Transient outcomes hide themselves; an available or downloaded update keeps the card up.
    LaunchedEffect(state) {
        when (state) {
            UpdateManager.State.UpToDate -> { delay(2_000); manager.reset(); onDone() }
            is UpdateManager.State.Failed -> { delay(6_000); manager.reset(); onDone() }
            is UpdateManager.State.Available -> if (auto) manager.download() else { delay(120); runCatching { focus.requestFocus() } }
            is UpdateManager.State.Ready ->
                if (auto && tv.own.owntv.ui.theme.UpdatePrefs.mayInstallNow()) manager.installReady()
                else { delay(120); runCatching { focus.requestFocus() } }
            UpdateManager.State.Idle -> onDone()
            else -> Unit
        }
    }

    Column(
        modifier = modifier
            // The same card as every notice in this corner (see TvNoticeStack).
            .tvNoticeCard()
            .widthIn(max = 560.mpx)
            .focusGroup(),
    ) {
        val buttons: @Composable (@Composable () -> Unit) -> Unit = { content ->
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { content() }
        }
        when (val s = state) {
            UpdateManager.State.Idle, UpdateManager.State.Checking -> Row(verticalAlignment = Alignment.CenterVertically) {
                OwnTVSpinner(sizeDp = 18)
                Spacer(Modifier.width(14.mpx))
                Text(stringResource(R.string.update_checking), style = stageText(17, 500), color = StageColors.Muted)
            }
            UpdateManager.State.UpToDate -> Text(
                stringResource(R.string.update_latest, manager.currentVersion),
                style = stageText(17, 500), color = StageColors.Muted,
            )
            is UpdateManager.State.Failed -> Text(
                updateFailureText(s.failure),
                style = stageText(17, 500), color = StageColors.Muted,
            )
            is UpdateManager.State.Available -> {
                BackHandler { onDone() } // Back = Later
                Text(stringResource(R.string.update_available), style = stageText(21, 800), color = StageColors.Text)
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(R.string.update_available_version, s.info.version, manager.currentVersion),
                    style = stageText(17, 500), color = StageColors.Muted,
                )
                buttons {
                    tv.own.owntv.ui.stage.StageButton(stringResource(R.string.update_now), onClick = { manager.download() }, height = 52.mpx, textSize = 18, tinted = true, modifier = Modifier.focusRequester(focus))
                    // "What's New" opens the full changelog dialog (the same view the manual check uses).
                    tv.own.owntv.ui.stage.StageButton(stringResource(R.string.update_whats_new), onClick = onViewChangelog, height = 52.mpx, textSize = 18)
                    tv.own.owntv.ui.stage.StageButton(stringResource(R.string.update_later), onClick = onDone, height = 52.mpx, textSize = 18)
                }
            }
            is UpdateManager.State.Downloading -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OwnTVSpinner(sizeDp = 18)
                    Spacer(Modifier.width(14.mpx))
                    Text(stringResource(R.string.update_downloading, s.percent), style = stageText(17, 600), color = StageColors.Text)
                }
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.update_background), style = stageText(16, 500), color = StageColors.Muted)
                // Later puts the card away; the download goes on and the card returns when the file is in.
                if (!auto) buttons { tv.own.owntv.ui.stage.StageButton(stringResource(R.string.update_later), onClick = onDone, height = 52.mpx, textSize = 18) }
            }
            is UpdateManager.State.Ready -> {
                BackHandler { onDone() }
                Text(stringResource(R.string.update_downloaded), style = stageText(21, 800), color = StageColors.Text)
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.update_ready, s.info.version, manager.currentVersion), style = stageText(17, 500), color = StageColors.Muted)
                buttons {
                    tv.own.owntv.ui.stage.StageButton(stringResource(R.string.update_install), onClick = { manager.installReady() }, height = 52.mpx, textSize = 18, tinted = true, modifier = Modifier.focusRequester(focus))
                    tv.own.owntv.ui.stage.StageButton(stringResource(R.string.update_later), onClick = onDone, height = 52.mpx, textSize = 18)
                }
            }
        }
    }
}
