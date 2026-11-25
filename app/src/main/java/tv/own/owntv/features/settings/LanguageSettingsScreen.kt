package tv.own.owntv.features.settings

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import org.koin.androidx.compose.koinViewModel
import tv.own.owntv.R
import tv.own.owntv.core.i18n.SupportedLocale
import tv.own.owntv.core.i18n.SupportedLocales
import tv.own.owntv.ui.components.OwnTVIcon
import tv.own.owntv.ui.theme.StageColors
import tv.own.owntv.ui.theme.mpx
import tv.own.owntv.ui.theme.stageText
import androidx.compose.ui.text.style.TextOverflow
import tv.own.owntv.ui.stage.StageTag
import androidx.compose.ui.res.pluralStringResource

/**
 * Setup's Language row: the current language with ▾, OK opens the list in a Stage popup (there
 * is no settings panel in the wizard).
 */
@Composable
fun FirstRunLanguageSelector(modifier: Modifier = Modifier) {
    val viewModel: LanguageSettingsViewModel = koinViewModel()
    val currentTag by viewModel.currentTag.collectAsStateWithLifecycle()
    val selectedLocale = remember(currentTag, viewModel.pickerRows) {
        viewModel.pickerRows.firstOrNull { it.languageTag == currentTag }
    }
    var showPicker by remember { mutableStateOf(false) }
    var wasOpen by remember { mutableStateOf(false) }
    val rowFocus = remember { FocusRequester() }
    // Back on the row when the list closes, not wherever the window's focus search lands.
    LaunchedEffect(showPicker) {
        if (showPicker) wasOpen = true
        else if (wasOpen) { wasOpen = false; kotlinx.coroutines.delay(80); runCatching { rowFocus.requestFocus() } }
    }
    val rows = viewModel.pickerRows.size
    StageSettingRow(
        icon = OwnTVIcon.LANGUAGE,
        title = stringResource(R.string.settings_language),
        desc = pluralStringResource(R.plurals.more_about_languages, rows, rows),
        value = SettingValue.Choice(selectedLocale?.endonym ?: stringResource(R.string.settings_language_system_default)),
        onClick = { showPicker = true },
        modifier = modifier.focusRequester(rowFocus),
    )
    if (showPicker) {
        FirstRunLanguagePopup(
            viewModel = viewModel,
            currentTag = currentTag,
            onDismiss = { showPicker = false },
        )
    }
}

/**
 * The welcome screen's language control: a round globe button beside Get started that opens the
 * language list. A first run starts in the TV's own language when the app has it (a Turkish TV in Turkish,
 * issue #9), and in Russian on an English or unsupported one — boxes are sold set to English.
 */
@Composable
fun FirstRunLanguageGlobe(modifier: Modifier = Modifier) {
    val viewModel: LanguageSettingsViewModel = koinViewModel()
    val currentTag by viewModel.currentTag.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) {
        if (currentTag == SupportedLocales.SYSTEM_DEFAULT_TAG) viewModel.setLocale(firstRunLanguage())
    }
    var showPicker by remember { mutableStateOf(false) }
    tv.own.owntv.ui.stage.StageSurface(
        onClick = { showPicker = true },
        radius = 16.mpx,
        // Focus: the same grey bar as every button on the TV.
        focusStyle = tv.own.owntv.ui.stage.StageFocus.FX,
        idle = Modifier.border(2.mpx, StageColors.Text.copy(alpha = 0.14f), RoundedCornerShape(16.mpx)),
        contentAlignment = Alignment.Center,
        modifier = modifier.size(76.mpx),
    ) { focused ->
        OwnTVIcon(OwnTVIcon.LANGUAGE, StageColors.Text, Modifier.size(38.mpx))
    }
    if (showPicker) {
        FirstRunLanguagePopup(viewModel = viewModel, currentTag = currentTag, onDismiss = { showPicker = false })
    }
}

@Composable
private fun FirstRunLanguagePopup(
    viewModel: LanguageSettingsViewModel,
    currentTag: String,
    onDismiss: () -> Unit,
) {
    val selectedIndex = remember(currentTag, viewModel.pickerRows) {
        if (currentTag.isEmpty()) 0
        else (viewModel.pickerRows.indexOfFirst { it.languageTag == currentTag } + 1).coerceAtLeast(0)
    }
    val selectedFocus = remember { FocusRequester() }
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(80)
        runCatching { selectedFocus.requestFocus() }
    }
    tv.own.owntv.ui.stage.StageSidePanel(onDismiss = onDismiss, title = stringResource(R.string.settings_language)) { close ->
        fun choose(tag: String) {
            viewModel.setLocale(tag)
            close()
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxWidth().weight(1f, fill = false),
        ) {
            item(key = SupportedLocales.SYSTEM_DEFAULT_TAG) {
                SidePanelLanguageRow(
                    endonym = stringResource(R.string.settings_language_system_default),
                    englishName = stringResource(R.string.settings_language_system_default_description),
                    selected = currentTag.isEmpty(),
                    onClick = { choose(SupportedLocales.SYSTEM_DEFAULT_TAG) },
                    modifier = if (currentTag.isEmpty()) Modifier.focusRequester(selectedFocus) else Modifier,
                )
            }
            items(viewModel.pickerRows, key = { it.languageTag }) { locale ->
                val selected = locale.languageTag == currentTag
                SidePanelLanguageRow(
                    endonym = locale.endonym,
                    englishName = locale.englishName,
                    selected = selected,
                    onClick = { choose(locale.languageTag) },
                    modifier = if (selected) Modifier.focusRequester(selectedFocus) else Modifier,
                )
            }
        }
    }
}

/**
 * Settings › App › Language: System default, then every language A–Z by English name, each
 * with a radio; OK uses it. Same-script switches recompose instantly via
 * [tv.own.owntv.core.i18n.LocalizedContent]; cross-script switches trigger one
 * [android.app.Activity.recreate]. The panel explains the focused choice and carries the translation
 * project's QR code, link and language-request note.
 */
@Composable
fun LanguageSettingsScreen(onBack: () -> Unit, modifier: Modifier = Modifier) {
    val viewModel: LanguageSettingsViewModel = koinViewModel()
    val currentTag by viewModel.currentTag.collectAsStateWithLifecycle()
    val rows = viewModel.pickerRows

    val selectedFocus = remember { FocusRequester() }
    val rowsFocus = remember { FocusRequester() }
    // Changing locale replaces the localized Compose subtree, and a cross-script change also recreates
    // the Activity. Wait for the newly selected row to own selectedFocus, then restore focus there
    // instead of letting Compose's fallback search land on the rail.
    LaunchedEffect(currentTag) {
        kotlinx.coroutines.delay(80)
        if (!selectedFocus.requestFocus()) rowsFocus.requestFocus()
    }

    val systemName = remember {
        val system = android.content.res.Resources.getSystem().configuration.locales[0]
        system.getDisplayName(system).replaceFirstChar { it.titlecase(system) }
    }
    val hints = listOf(
        stringResource(R.string.common_ok) to stringResource(R.string.settings_key_use),
        stringResource(R.string.common_back) to stringResource(R.string.settings_group_app),
    )
    StageFullPage(
        parents = listOf(stringResource(R.string.settings_group_app)),
        title = stringResource(R.string.settings_language),
        count = pluralStringResource(R.plurals.more_about_languages, rows.size, rows.size),
        onBack = onBack,
        modifier = modifier,
        rowsFocus = rowsFocus,
    ) {
        val systemLabel = stringResource(R.string.settings_language_system_default)
        LanguageStageRow(
            icon = OwnTVIcon.CHECK,
            title = systemLabel,
            line = stringResource(R.string.settings_language_system_default_description),
            coverage = null,
            selected = currentTag.isEmpty(),
            help = SettingHelp(systemLabel, stringResource(R.string.settings_language_system_help, systemName), hints = hints),
            onClick = { viewModel.setLocale(SupportedLocales.SYSTEM_DEFAULT_TAG) },
            modifier = if (currentTag.isEmpty()) Modifier.focusRequester(selectedFocus) else Modifier,
        )
        rows.forEach { locale ->
            val selected = locale.languageTag == currentTag
            LanguageStageRow(
                icon = OwnTVIcon.LANGUAGE,
                title = locale.endonym,
                line = locale.englishName,
                coverage = coverageBadgePercent(locale),
                selected = selected,
                help = SettingHelp(locale.endonym, stringResource(R.string.settings_language_pick_help, locale.endonym), hints = hints),
                onClick = { viewModel.setLocale(locale.languageTag) },
                modifier = if (selected) Modifier.focusRequester(selectedFocus) else Modifier,
            )
        }
    }
}

internal fun coverageBadgePercent(locale: SupportedLocale): Int? =
    SupportedLocales.coverageBadgePercent(locale)

/** A language as a settings row: SansSerif so CJK / Arabic / Hebrew endonyms get the platform fallbacks. */
@Composable
private fun LanguageStageRow(
    icon: OwnTVIcon,
    title: String,
    line: String,
    coverage: Int?,
    selected: Boolean,
    help: SettingHelp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    StageSettingRow(
        icon = icon,
        title = title,
        desc = line,
        value = SettingValue.Custom {
            Row(horizontalArrangement = Arrangement.spacedBy(12.mpx), verticalAlignment = Alignment.CenterVertically) {
                if (coverage != null) StageTag(stringResource(R.string.settings_language_coverage, coverage))
                tv.own.owntv.ui.stage.StagePopupRadio(on = selected, focused = false)
            }
        },
        onClick = onClick,
        modifier = modifier,
        help = help,
    )
}

/**
 * A row of the side panel's language list, as a settings list row: edge to edge, no gaps, the focus bar
 * across the line, and a check on the right of the language in use.
 */
@Composable
private fun SidePanelLanguageRow(
    endonym: String,
    englishName: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    tv.own.owntv.ui.stage.StageSurface(
        onClick = onClick,
        radius = 0.mpx,
        focusStyle = tv.own.owntv.ui.stage.StageFocus.FX,
        modifier = modifier.fillMaxWidth(),
    ) { focused ->
        Row(
            Modifier.fillMaxWidth().padding(horizontal = tv.own.owntv.ui.stage.SIDE_PANEL_INSET.mpx, vertical = 12.mpx),
            horizontalArrangement = Arrangement.spacedBy(12.mpx),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    endonym, style = stageText(22, 700), color = StageColors.Text,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Text(
                    englishName, style = stageText(15, 500), color = StageColors.Muted,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            tv.own.owntv.ui.stage.StagePopupRadio(on = selected, focused = focused)
        }
    }
}

/** The language a first run starts in while it still follows the device. */
@Suppress("ktlint:standard:property-naming")
private const val FirstRunLanguage = "ru"
private const val ENGLISH = "en"

/** The device's first language when the app has it (region first, then the language alone); else Russian. */
internal fun firstRunLanguage(): String {
    val device = android.content.res.Resources.getSystem().configuration.locales[0]?.takeIf { it.language != ENGLISH }
    return device?.let { d ->
        SupportedLocales.canonicalTag(d.toLanguageTag())?.takeIf { it.isNotEmpty() }
            ?: SupportedLocales.canonicalTag(d.language)?.takeIf { it.isNotEmpty() }
    } ?: FirstRunLanguage
}
