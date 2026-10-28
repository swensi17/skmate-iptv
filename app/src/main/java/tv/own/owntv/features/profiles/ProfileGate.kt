package tv.own.owntv.features.profiles

import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.koin.androidx.compose.koinViewModel
import androidx.tv.material3.Text
import tv.own.owntv.R
import tv.own.owntv.core.database.entity.ProfileEntity
import tv.own.owntv.ui.components.OwnTVAvatar
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.components.OwnTVIcon

/**
 * The "Who's watching?" launch gate. Shown when more than one profile exists. Picking a
 * profile makes it active (and prompts for a PIN if it's locked); [onEnter] records the selected
 * profile id and proceeds into the shell.
 */
@Composable
fun ProfileGate(onEnter: (Long) -> Unit, onAddProfile: () -> Unit, modifier: Modifier = Modifier) {
    val vm: ProfilesViewModel = koinViewModel()
    val profiles by vm.profiles.collectAsStateWithLifecycle()

    var pinFor by remember { mutableStateOf<ProfileEntity?>(null) }
    var pinError by remember { mutableStateOf(false) }
    val firstFocus = remember { FocusRequester() }

    // The row is lazy and the window may not have focus yet on the first frames: keep asking until the
    // row really holds focus (a second at most), so OK works at once without a first arrow press.
    var rowHasFocus by remember { mutableStateOf(false) }
    LaunchedEffect(profiles.isNotEmpty()) {
        if (profiles.isNotEmpty()) repeat(20) {
            if (rowHasFocus) return@LaunchedEffect
            runCatching { firstFocus.requestFocus() }
            kotlinx.coroutines.delay(60)
        }
    }

    fun choose(p: ProfileEntity) {
        if (p.pinHash != null) {
            pinError = false
            pinFor = p
        } else {
            vm.switchTo(p) { onEnter(p.id) }
        }
    }

    Box(
        modifier = modifier.fillMaxSize().background(tv.own.owntv.ui.theme.LocalStagePalette.current.page),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(stringResource(R.string.profiles_gate_title), style = tv.own.owntv.ui.theme.stageText(54, 700), color = tv.own.owntv.ui.theme.StageColors.Text)
            Spacer(Modifier.height(48.mpx))
            // Centred while the profiles fit; a longer row scrolls, never running off the screen.
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(40.mpx, Alignment.CenterHorizontally),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 96.mpx, vertical = 16.mpx),
                modifier = Modifier.fillMaxWidth().onFocusChanged { rowHasFocus = it.hasFocus }.focusGroup(),
            ) {
                items(profiles, key = { it.id }) { p ->
                    ProfileTile(
                        profile = p,
                        modifier = if (p.id == profiles.first().id) Modifier.focusRequester(firstFocus) else Modifier,
                        onClick = { choose(p) },
                    )
                }
                item { AddTile(onClick = onAddProfile) }
            }
        }
    }

    pinFor?.let { p ->
        PinDialog(
            title = if (pinError) stringResource(R.string.profiles_wrong_pin) else stringResource(R.string.profiles_enter_pin, p.name),
            onSubmit = { pin ->
                if (vm.verifyPin(p, pin)) {
                    vm.switchTo(p) { onEnter(p.id) }
                } else pinError = true
            },
            onDismiss = { pinFor = null },
        )
    }
}

@Composable
private fun ProfileTile(profile: ProfileEntity, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        // Round, like the avatar in it: focus is a blue ring around the person.
        tv.own.owntv.ui.stage.StageSurface(
            onClick = onClick,
            radius = TileSize / 2,
            modifier = modifier.size(TileSize),
            focusStyle = tv.own.owntv.ui.stage.StageFocus.FX,
            contentAlignment = Alignment.Center,
        ) { _ ->
            Box(contentAlignment = Alignment.TopEnd) {
                OwnTVAvatar(avatarId = profile.avatarId, imagePath = profile.avatarPath.orEmpty(), modifier = Modifier.size(AvatarSize))
                if (profile.pinHash != null) {
                    Box(Modifier.size(26.dp).clip(CircleShape).background(tv.own.owntv.ui.theme.StageColors.Ink.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                        OwnTVIcon(OwnTVIcon.SETTINGS, tint = tv.own.owntv.ui.theme.StageColors.Text, modifier = Modifier.size(14.dp))
                    }
                }
            }
        }
        Spacer(Modifier.height(16.mpx))
        Text(profile.name, style = tv.own.owntv.ui.theme.stageText(24, 700), color = tv.own.owntv.ui.theme.StageColors.Text, textAlign = TextAlign.Center, maxLines = 1)
        if (profile.isKids) {
            Text(stringResource(R.string.profiles_kids_badge), style = tv.own.owntv.ui.theme.stageText(20, 500), color = tv.own.owntv.ui.theme.stageAccent.accent)
        }
    }
}

@Composable
private fun AddTile(onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        tv.own.owntv.ui.stage.StageSurface(
            onClick = onClick,
            radius = TileSize / 2,
            modifier = Modifier.size(TileSize),
            focusStyle = tv.own.owntv.ui.stage.StageFocus.FX,
            contentAlignment = Alignment.Center,
        ) { _ ->
            Box(
                modifier = Modifier.size(AvatarSize).clip(CircleShape).background(tv.own.owntv.ui.theme.StageColors.Ink.copy(alpha = 0.08f)),
                contentAlignment = Alignment.Center,
            ) {
                OwnTVIcon(OwnTVIcon.ADD, tint = tv.own.owntv.ui.theme.StageColors.Muted, modifier = Modifier.size(48.mpx))
            }
        }
        Spacer(Modifier.height(16.mpx))
        Text(stringResource(R.string.profiles_add), style = tv.own.owntv.ui.theme.stageText(24, 700), color = tv.own.owntv.ui.theme.StageColors.Muted, maxLines = 1)
    }
}

/** A profile's round tile, and the avatar inside it (the ring of focus sits in the gap). */
private val TileSize = 176.mpx
private val AvatarSize = 156.mpx
