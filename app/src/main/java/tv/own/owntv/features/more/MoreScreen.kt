package tv.own.owntv.features.more

import androidx.compose.foundation.layout.size
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.em
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.koin.androidx.compose.koinViewModel
import tv.own.owntv.BuildConfig
import tv.own.owntv.R
import tv.own.owntv.features.settings.BackupScreen
import tv.own.owntv.features.settings.DeveloperScreen
import tv.own.owntv.features.settings.LocalSyncScreen
import tv.own.owntv.features.settings.SettingsViewModel
import tv.own.owntv.features.shell.components.RailAvatar
import tv.own.owntv.player.PlaybackErrorLog
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.stage.StageGroupItem
import tv.own.owntv.ui.stage.StageKeyHints
import tv.own.owntv.ui.stage.StageSurface
import tv.own.owntv.ui.stage.stageGlass
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageAccent
import tv.own.owntv.ui.theme.stageText

/** The sheet's items, top to bottom. [DEVELOPER] exists only in local builds (BuildConfig.DEV_TOOLS). */
private enum class MoreItem { SETTINGS, FAVORITES, HISTORY, BACKUP, LOCAL_SYNC, ABOUT, DEVELOPER }

/**
 * More: the glass section sheet, topped by the profile, and one page on the right
 * for the item chosen with OK. Two layers, never three: ▲ ▼ move focus, OK selects the item (focus stays), ▶ enters the page, Back returns to
 * the sheet, Back again leaves More. Nothing opens full screen any more — Settings is the one door out,
 * through its group cards.
 */
@Composable
fun MoreScreen(
    profileName: String,
    playlistLabel: String,
    avatarId: Int,
    avatarPath: String,
    onSwitchProfile: () -> Unit,
    /** OK on the avatar: the avatar picker, with "Your own picture". */
    onPickAvatar: () -> Unit,
    onOpenSettings: (group: Int?, search: Boolean) -> Unit,
    onPlayChannel: (Long) -> Unit,
    onPlayMovie: (Long, Long) -> Unit,
    onPlayEpisode: (seriesId: Long, episodeId: Long, positionMs: Long) -> Unit,
    onOpenSeries: (Long) -> Unit,
    onChildFocused: () -> Unit,
    onEntryHook: (((() -> Boolean)?) -> Unit)? = null,
    /** Back from Settings: land on the Settings page's first card instead of the rail. */
    restoreFocus: Boolean = false,
    /** TV-box style: Back from the settings sheet leaves More altogether (to Home). */
    onLeave: () -> Unit = {},
    onRestored: () -> Unit = {},
    modifier: Modifier = Modifier,
    vm: MoreCountsViewModel = koinViewModel(),
    settingsVm: SettingsViewModel = koinViewModel(),
) {
    var selected by rememberSaveable { mutableStateOf(MoreItem.SETTINGS) }
    val sheetOnly = tv.own.owntv.features.settings.SettingsAsSidePanel
    val itemFocus = remember { MoreItem.entries.associateWith { FocusRequester() } }
    // What OK / ▶ focuses on the page: a fixed target, or the page's own choice (its first row).
    val pageTarget = remember { FocusRequester() }
    var pageEntry by remember { mutableStateOf<(() -> Boolean)?>(null) }
    var pageFocused by remember { mutableStateOf(false) }
    val enterPage: () -> Boolean = { pageEntry?.invoke() ?: runCatching { pageTarget.requestFocus() }.getOrDefault(false) }
    val backToSheet: () -> Unit = { runCatching { itemFocus.getValue(selected).requestFocus() } }
    // Like the rail: ▲ ▼ move focus, OK selects the item (its page shows, focus stays on the item),
    // ▶ goes into the page that is shown.
    val choose: (MoreItem) -> Unit = { item -> if (item != selected) { selected = item; pageEntry = null } }
    // A page picked in the settings sheet takes focus once it is on screen.
    LaunchedEffect(selected) {
        if (!sheetOnly || selected == MoreItem.SETTINGS) return@LaunchedEffect
        repeat(10) { withFrameNanos { }; if (enterPage()) return@LaunchedEffect; kotlinx.coroutines.delay(50) }
    }

    // The rail's ▶ lands on the item the sheet was last on.
    // TV-box style there is no More list on screen: More is the settings sheet on the right, its other
    // pages opened from that sheet, and Back from the sheet leaves for Home.
    DisposableEffect(onEntryHook) {
        onEntryHook?.invoke { if (sheetOnly) enterPage() else runCatching { itemFocus.getValue(selected).requestFocus() }.getOrDefault(false) }
        onDispose { onEntryHook?.invoke(null) }
    }
    LaunchedEffect(restoreFocus) {
        if (!restoreFocus) return@LaunchedEffect
        withFrameNanos { }
        withFrameNanos { }
        if (!enterPage()) runCatching { itemFocus.getValue(selected).requestFocus() }
        onRestored()
    }
    // Opening More puts focus straight into the sheet.
    LaunchedEffect(sheetOnly) {
        if (!sheetOnly) return@LaunchedEffect
        repeat(10) { if (pageFocused) return@LaunchedEffect; enterPage(); kotlinx.coroutines.delay(60) }
    }
    // Composed before the page, so a page's own Back (a step popup, a dialog) still wins over it.
    BackHandler(enabled = pageFocused) {
        when {
            !sheetOnly -> backToSheet()
            selected != MoreItem.SETTINGS -> { selected = MoreItem.SETTINGS; pageEntry = null }
            else -> onLeave()
        }
    }

    val favorites by vm.favorites.collectAsStateWithLifecycle()
    val history by vm.history.collectAsStateWithLifecycle()
    val sync by vm.sync.collectAsStateWithLifecycle()
    val lastBackup by vm.lastBackup.collectAsStateWithLifecycle()
    val playlists by vm.playlistCount.collectAsStateWithLifecycle()
    val pinned by settingsVm.quickPinnedKeys.collectAsStateWithLifecycle()
    val context = LocalContext.current

    // Inside Settings only its sheet on the right shows, as on a TV box: the More list slides away
    // while focus is in the settings, and comes back with ◀ or Back.
    val settingsOnly = tv.own.owntv.features.settings.SettingsAsSidePanel
    val sheetAway by androidx.compose.animation.core.animateFloatAsState(if (settingsOnly) 1f else 0f, androidx.compose.animation.core.tween(260), label = "moreSheetAway")
    Box(modifier.fillMaxSize().onFocusChanged { if (it.hasFocus) onChildFocused() }) {
        // --- The sheet (`.gsheet`, 440 wide at 24 / 24 / 24): the full height.
        Column(
            Modifier
                .graphicsLayer { translationX = -sheetAway * size.width * 1.1f; alpha = 1f - sheetAway }
                .focusProperties { if (settingsOnly) canFocus = false }
                .padding(start = 24.mpx, top = 24.mpx, bottom = 24.mpx)
                .width(440.mpx)
                .fillMaxHeight()
                .stageGlass(32.mpx, overContent = true)
                .padding(horizontal = 16.mpx, vertical = 26.mpx)
                // ◀ back from the page lands on the item that page belongs to.
                .focusProperties { onEnter = { runCatching { itemFocus.getValue(selected).requestFocus() } } }
                .onPreviewKeyEvent { e ->
                    e.type == KeyEventType.KeyDown && e.key == Key.DirectionRight && enterPage()
                }
                .focusGroup(),
        ) {
            ProfileRow(profileName, playlistLabel, playlists, avatarId, avatarPath, onSwitchProfile, onPickAvatar)
            val item = @Composable { it: MoreItem, icon: OwnTVIcon, label: String, value: String?, warn: Boolean ->
                StageGroupItem(
                    text = label, icon = icon, value = value, warn = warn,
                    selected = selected == it,
                    onClick = { choose(it) },
                    modifier = Modifier.focusRequester(itemFocus.getValue(it)),
                )
            }
            item(MoreItem.SETTINGS, OwnTVIcon.SETTINGS, stringResource(R.string.common_nav_settings), null, false)
            GroupLabel(stringResource(R.string.more_group_your_things))
            item(MoreItem.FAVORITES, OwnTVIcon.FAVORITE, stringResource(R.string.content_category_favorites), favorites.total.toString(), false)
            item(MoreItem.HISTORY, OwnTVIcon.HISTORY, stringResource(R.string.content_category_history), history.total.toString(), false)
            GroupLabel(stringResource(R.string.more_group_keep_safe))
            item(
                MoreItem.BACKUP, OwnTVIcon.DOWNLOADS, stringResource(R.string.settings_backup_restore),
                lastBackup?.let { relativeShort(it.at) } ?: stringResource(R.string.common_never), lastBackup == null,
            )
            item(MoreItem.LOCAL_SYNC, OwnTVIcon.PHONE, stringResource(R.string.local_sync_title), stringResource(if (sync.listening) R.string.common_on else R.string.common_off), false)
            GroupLabel(stringResource(R.string.settings_app_group))
            item(MoreItem.ABOUT, OwnTVIcon.INFO, stringResource(R.string.settings_about), BuildConfig.VERSION_NAME, false)
            // Maintainer-only; DEV_TOOLS is a compile-time constant, so R8 removes it from published APKs.
            if (BuildConfig.DEV_TOOLS) item(MoreItem.DEVELOPER, OwnTVIcon.GEAR, "Developer", "DEV", false)
            Spacer(Modifier.weight(1f))
            StageKeyHints(
                listOf(
                    stringResource(R.string.common_ok) to stringResource(R.string.content_key_select),
                    "▶" to stringResource(R.string.content_key_enter),
                    stringResource(R.string.common_back) to stringResource(R.string.content_key_menu),
                ),
                Modifier.padding(start = 14.mpx),
                textSize = 15,
            )
        }

        // --- The page: everything right of the sheet, below the top-right cluster.
        Box(
            Modifier
                // Settings is the sheet on the right edge of the screen, as TV boxes show it.
                .then(
                    when {
                        selected == MoreItem.SETTINGS && sheetOnly -> Modifier
                        sheetOnly && selected in SheetPages -> Modifier
                        sheetOnly -> Modifier.padding(start = 96.mpx, top = 128.mpx, end = 64.mpx)
                        else -> Modifier.padding(start = 520.mpx, top = 128.mpx, end = 64.mpx)
                    },
                )
                .fillMaxSize()
                .onFocusChanged { pageFocused = it.hasFocus },
        ) {
            val setEntry: (() -> Boolean) -> Unit = { pageEntry = it }
            when (selected) {
                MoreItem.SETTINGS -> SettingsPage(
                    entry = pageTarget, pinned = pinned.size,
                    extras = if (!sheetOnly) emptyList() else listOfNotNull(
                        SettingsExtra(OwnTVIcon.DOWNLOADS, stringResource(R.string.settings_short_backup)) { choose(MoreItem.BACKUP) },
                        SettingsExtra(OwnTVIcon.PHONE, stringResource(R.string.settings_short_sync)) { choose(MoreItem.LOCAL_SYNC) },
                        SettingsExtra(OwnTVIcon.INFO, stringResource(R.string.settings_short_about)) { choose(MoreItem.ABOUT) },
                        SettingsExtra(OwnTVIcon.PERSON, stringResource(R.string.more_profile_switch), onClick = onSwitchProfile),
                    ),
                    onOpenGroup = { onOpenSettings(it, false) },
                    onSearch = { onOpenSettings(null, true) },
                )
                MoreItem.FAVORITES -> FavouritesPage(
                    vm = vm, setEntry = setEntry,
                    onPlayChannel = onPlayChannel, onPlayMovie = { onPlayMovie(it, 0L) }, onOpenSeries = onOpenSeries,
                )
                MoreItem.HISTORY -> HistoryPage(
                    vm = vm, setEntry = setEntry,
                    onClearHistory = { settingsVm.clearWatchHistory(it) },
                    onPlayChannel = onPlayChannel, onPlayMovie = onPlayMovie, onPlayEpisode = onPlayEpisode, onOpenSeries = onOpenSeries,
                )
                MoreItem.BACKUP -> InSheet(sheetOnly, stringResource(R.string.settings_backup_restore)) { BackupScreen(entry = pageTarget, modifier = Modifier.fillMaxSize()) }
                MoreItem.LOCAL_SYNC -> InSheet(sheetOnly, stringResource(R.string.local_sync_title)) { LocalSyncScreen(entry = pageTarget, modifier = Modifier.fillMaxSize()) }
                MoreItem.ABOUT -> InSheet(sheetOnly, stringResource(R.string.settings_about)) { AboutPage(vm = vm, entry = pageTarget) }
                MoreItem.DEVELOPER -> Box(Modifier.focusRequester(pageTarget).focusGroup()) { DeveloperScreen(onBack = backToSheet) }
            }
        }
    }
}

/** The sheet's head: avatar 58 (OK changes it), name 24/800, "All playlists · 3 playlists", and **Switch**. */
@Composable
private fun ProfileRow(name: String, playlistLabel: String, playlists: Int, avatarId: Int, avatarPath: String, onSwitch: () -> Unit, onPickAvatar: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 14.mpx, end = 14.mpx, top = 4.mpx, bottom = 18.mpx),
        horizontalArrangement = Arrangement.spacedBy(16.mpx),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StageSurface(onClick = onPickAvatar, radius = 29.mpx, modifier = Modifier.size(58.mpx), focusStyle = tv.own.owntv.ui.stage.StageFocus.POSTER, contentAlignment = Alignment.Center) {
            RailAvatar(name.take(1).uppercase(), size = 58, textSize = 24, avatarId = avatarId, imagePath = avatarPath)
        }
        Column(Modifier.weight(1f)) {
            Text(name, style = stageText(24, 800), color = StageColors.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                playlistLabel + stringResource(R.string.content_epg_bits_separator) + pluralStringResource(R.plurals.more_playlist_count, playlists, playlists),
                style = stageText(15.5f, 500), color = StageColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        StageSurface(
            onClick = onSwitch, radius = 15.mpx, modifier = Modifier.height(40.mpx),
            idle = Modifier.background(StageColors.ControlFill, RoundedCornerShape(15.mpx)),
            contentAlignment = Alignment.Center,
        ) { focused ->
            Text(
                stringResource(R.string.more_profile_switch), style = stageText(15, 700),
                color = if (focused) stageAccent.onAccent else StageColors.Text, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 16.mpx),
            )
        }
    }
}

/** `.gsheet .gl`: 12.5/800 +0.13em in dim, upper-cased in the user's own locale. */
@Composable
private fun GroupLabel(text: String) {
    Text(
        text.uppercase(androidx.compose.ui.platform.LocalConfiguration.current.locales[0]),
        style = stageText(12.5f, 800, 0.13.em), color = StageColors.Dim, maxLines = 1, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(start = 16.mpx, end = 16.mpx, top = 16.mpx, bottom = 6.mpx),
    )
}

/** "2 days ago" — Android's own relative time, so it is localised without a string of ours. */
private fun relativeShort(at: Long): String =
    android.text.format.DateUtils.getRelativeTimeSpanString(
        at, System.currentTimeMillis(), android.text.format.DateUtils.MINUTE_IN_MILLIS,
    ).toString()

/** The pages that open in the settings sheet like a settings group does, not as a screen of their own. */
private val SheetPages = setOf(MoreItem.BACKUP, MoreItem.LOCAL_SYNC, MoreItem.ABOUT)

@Composable
private fun InSheet(sheet: Boolean, title: String, content: @Composable () -> Unit) {
    if (!sheet) { content(); return }
    tv.own.owntv.features.settings.SettingsSheet(title = title, wide = true) {
        Box(Modifier.fillMaxWidth().weight(1f).padding(start = 18.mpx, end = 18.mpx, top = 8.mpx, bottom = 24.mpx)) { content() }
    }
}
