package tv.own.owntv.features.profiles

import androidx.compose.runtime.Composable
import androidx.compose.ui.focus.focusRequester
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import tv.own.owntv.R
import tv.own.owntv.features.settings.SettingsViewModel
import tv.own.owntv.ui.components.BrowseMode
import tv.own.owntv.ui.components.RemoteBackgroundDialog
import tv.own.owntv.ui.components.StorageBrowser
import java.io.File

/**
 * A picture for a profile, taken the same two ways the background image is: a file on this
 * television, or a photo a phone sends over the local network. Both hand [onPicked] a File, which
 * core copies and scales — nothing here knows or cares which one it was. The host closes this on
 * [onPicked] and [onClear]; Back from the phone page returns to the choice, Back elsewhere closes.
 *
 * One flow for every place a picture is chosen — the rail's avatar, the profile editor and the
 * setup wizard — so a new profile gets its picture exactly the way an existing one does.
 */
@Composable
internal fun ProfilePictureChooser(
    hasImage: Boolean,
    onPicked: (File) -> Unit,
    onClear: () -> Unit,
    onDismiss: () -> Unit,
) {
    var source by remember { mutableStateOf(Source.CHOOSE) }
    when (source) {
        Source.CHOOSE -> tv.own.owntv.ui.stage.StageSidePanel(
            onDismiss = onDismiss,
            title = stringResource(R.string.profiles_avatar_own_picture),
            subtitle = stringResource(R.string.profiles_avatar_own_picture_sub),
        ) { close ->
            val first = remember { androidx.compose.ui.focus.FocusRequester() }
            androidx.compose.runtime.LaunchedEffect(Unit) {
                kotlinx.coroutines.delay(80)
                runCatching { first.requestFocus() }
            }
            tv.own.owntv.ui.stage.StageSidePanelOption(
                tv.own.owntv.ui.components.OwnTVIcon.FOLDER,
                stringResource(R.string.setup_from_device),
                onClick = { source = Source.LOCAL },
                subtitle = stringResource(R.string.setup_from_device_line),
                modifier = androidx.compose.ui.Modifier.focusRequester(first),
            )
            tv.own.owntv.ui.stage.StageSidePanelOption(
                tv.own.owntv.ui.components.OwnTVIcon.PHONE,
                stringResource(R.string.setup_from_phone),
                onClick = { source = Source.REMOTE },
                subtitle = stringResource(R.string.setup_from_phone_line),
            )
            if (hasImage) {
                tv.own.owntv.ui.stage.StageSidePanelOption(
                    tv.own.owntv.ui.components.OwnTVIcon.TRASH,
                    stringResource(R.string.common_clear),
                    onClick = { close(); onClear() },
                    danger = true,
                )
            }
        }
        Source.LOCAL -> StorageBrowser(
            title = stringResource(R.string.profiles_avatar_own_picture),
            mode = BrowseMode.FILE,
            fileExtensions = setOf("png", "jpg", "jpeg", "webp", "bmp"),
            onPick = onPicked,
            onDismiss = onDismiss,
        )
        Source.REMOTE -> {
            // The same companion listener the background image uses — one PIN-protected upload page,
            // so a phone sends a profile picture exactly the way it already sends a wallpaper.
            val remoteVm = org.koin.androidx.compose.koinViewModel<SettingsViewModel>()
            val remoteState by remoteVm.remoteState.collectAsStateWithLifecycle()
            RemoteBackgroundDialog(
                state = remoteState,
                images = remoteVm.remoteImages,
                onStart = remoteVm::startRemoteImageListener,
                onStop = remoteVm::stopRemoteListener,
                onImageReceived = onPicked,
                onDismiss = { source = Source.CHOOSE },
            )
        }
    }
}

private enum class Source { CHOOSE, LOCAL, REMOTE }
