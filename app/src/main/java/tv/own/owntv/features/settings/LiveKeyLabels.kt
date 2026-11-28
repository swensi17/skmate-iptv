package tv.own.owntv.features.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import tv.own.owntv.R
import tv.own.owntv.core.settings.LiveKey
import tv.own.owntv.core.settings.LiveKeyAction
import tv.own.owntv.core.settings.LiveKeyMap
import tv.own.owntv.ui.components.OwnTVIcon

// Names and icons for "Buttons on a channel" in the remote buttons settings.

/** The key's usual job first, then the rest; rewinding is offered on the side keys only. */
internal fun liveKeyChoices(key: LiveKey): List<LiveKeyAction> {
    val usual = LiveKeyMap.defaultFor(key)
    val all = LiveKeyAction.entries.filter {
        key == LiveKey.LEFT || key == LiveKey.RIGHT || (it != LiveKeyAction.REWIND && it != LiveKeyAction.FORWARD)
    }
    return listOf(usual) + (all - usual)
}

@Composable
internal fun liveKeyLabel(key: LiveKey): String = stringResource(
    when (key) {
        LiveKey.OK -> R.string.settings_live_key_ok
        LiveKey.UP -> R.string.settings_live_key_up
        LiveKey.DOWN -> R.string.settings_live_key_down
        LiveKey.LEFT -> R.string.settings_live_key_left
        LiveKey.RIGHT -> R.string.settings_live_key_right
    },
)

internal fun liveKeyIcon(key: LiveKey): OwnTVIcon = when (key) {
    LiveKey.OK -> OwnTVIcon.CHECK
    LiveKey.UP -> OwnTVIcon.CHEVRON_UP
    LiveKey.DOWN -> OwnTVIcon.CHEVRON_DOWN
    LiveKey.LEFT -> OwnTVIcon.CHEVRON_LEFT
    LiveKey.RIGHT -> OwnTVIcon.CHEVRON
}

@Composable
internal fun liveKeyActionLabel(action: LiveKeyAction): String = stringResource(
    when (action) {
        LiveKeyAction.INFO -> R.string.settings_live_key_action_info
        LiveKeyAction.CHANNEL_LIST -> R.string.settings_live_key_action_list
        LiveKeyAction.HISTORY -> R.string.settings_live_key_action_history
        LiveKeyAction.NEXT_CHANNEL -> R.string.settings_live_key_action_next
        LiveKeyAction.PREVIOUS_CHANNEL -> R.string.settings_live_key_action_previous
        LiveKeyAction.LAST_CHANNEL -> R.string.settings_live_key_action_last
        LiveKeyAction.REWIND -> R.string.settings_live_key_action_rewind
        LiveKeyAction.FORWARD -> R.string.settings_live_key_action_forward
        LiveKeyAction.PLAY_PAUSE -> R.string.settings_live_key_action_pause
        LiveKeyAction.DESCRIPTION -> R.string.settings_live_key_action_description
        LiveKeyAction.NOTHING -> R.string.settings_live_key_action_nothing
    },
)

internal fun liveKeyActionIcon(action: LiveKeyAction): OwnTVIcon = when (action) {
    LiveKeyAction.INFO -> OwnTVIcon.INFO
    LiveKeyAction.CHANNEL_LIST -> OwnTVIcon.LIST
    LiveKeyAction.HISTORY -> OwnTVIcon.HISTORY
    LiveKeyAction.NEXT_CHANNEL -> OwnTVIcon.REMOTE_CHANNEL_UP
    LiveKeyAction.PREVIOUS_CHANNEL -> OwnTVIcon.REMOTE_CHANNEL_DOWN
    LiveKeyAction.LAST_CHANNEL -> OwnTVIcon.SWAP
    LiveKeyAction.REWIND -> OwnTVIcon.SEEK_BACK
    LiveKeyAction.FORWARD -> OwnTVIcon.SEEK_FORWARD
    LiveKeyAction.PLAY_PAUSE -> OwnTVIcon.PAUSE
    LiveKeyAction.DESCRIPTION -> OwnTVIcon.INFO
    LiveKeyAction.NOTHING -> OwnTVIcon.CLOSE
}
