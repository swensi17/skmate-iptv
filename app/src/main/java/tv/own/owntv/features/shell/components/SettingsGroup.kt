package tv.own.owntv.features.shell.components

import tv.own.owntv.R
import tv.own.owntv.features.settings.VideoGroup

/**
 * The twelve Settings groups, in the order of More › Settings' cards — a card's index is the
 * group it opens. [video] marks the five groups whose rows are the Video player's.
 */
internal enum class SettingsGroup(val titleRes: Int, val video: VideoGroup? = null, val shortRes: Int = titleRes) {
    QUICK(R.string.settings_group_quick, shortRes = R.string.settings_short_quick),
    PROFILE(R.string.settings_group_profile, shortRes = R.string.settings_short_profile),
    SOURCES(R.string.settings_group_sources, shortRes = R.string.settings_short_sources),
    APPEARANCE(R.string.settings_group_appearance, shortRes = R.string.settings_short_appearance),
    LAYOUT(R.string.settings_group_layout, shortRes = R.string.settings_short_layout),
    CONTENT(R.string.settings_group_content_metadata, shortRes = R.string.settings_short_content),
    PLAYER(R.string.settings_vp_cat_player, VideoGroup.PLAYER, R.string.settings_short_player),
    PICTURE(R.string.settings_vp_cat_picture, VideoGroup.PICTURE, R.string.settings_short_picture),
    SOUND(R.string.settings_group_sound_subtitles, VideoGroup.SOUND, R.string.settings_short_sound),
    LIVE(R.string.settings_live_tv, VideoGroup.LIVE, R.string.settings_short_live),
    WATCHING(R.string.settings_group_watching_recording, VideoGroup.WATCHING, R.string.settings_short_watching),
    APP(R.string.settings_group_app, shortRes = R.string.settings_short_app),
    ;

    companion object {
        /** The group a Video player row lives in; Diagnostics sits at the end of App. */
        fun of(group: VideoGroup): SettingsGroup = entries.firstOrNull { it.video == group } ?: APP
    }
}
