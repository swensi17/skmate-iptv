package tv.own.owntv.features.remote

import android.os.SystemClock
import android.view.KeyEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.koin.core.context.GlobalContext
import tv.own.owntv.MainActivity
import tv.own.owntv.core.customize.CustomizationStore
import tv.own.owntv.core.customize.CustomizeKeys
import tv.own.owntv.core.database.dao.ChannelDao
import tv.own.owntv.core.database.dao.ProfileDao
import tv.own.owntv.core.database.dao.SourceDao
import tv.own.owntv.core.database.dao.resolveExistingProfileId
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.epg.EpgSourceStore
import tv.own.owntv.core.model.MediaType
import tv.own.owntv.core.settings.RemoteShortcutAction
import tv.own.owntv.core.settings.SettingsRepository
import tv.own.owntv.features.settings.EpgSourcesViewModel
import tv.own.owntv.features.settings.SettingsViewModel

/** What the shell does for the remote: open a channel full screen, or a section. Read by OwnTVShell. */
object RemoteShellRequests {
    private val _play = MutableSharedFlow<ChannelEntity>(extraBufferCapacity = 1)
    val play = _play.asSharedFlow()
    private val _shortcut = MutableSharedFlow<RemoteShortcutAction>(extraBufferCapacity = 1)
    val shortcut = _shortcut.asSharedFlow()

    fun play(channel: ChannelEntity) = _play.tryEmit(channel)
    fun shortcut(action: RemoteShortcutAction) = _shortcut.tryEmit(action)
}

/**
 * Runs what the Telegram remote sends. Keys go to the open window as if pressed on the TV's own remote;
 * playlists, guides and channels are changed through the same view models the settings screens use, so
 * every rule and limit there holds here too.
 */
class RemoteCommands(
    private val remote: TelegramRemote,
    private val settings: SettingsRepository,
    private val profileDao: ProfileDao,
    private val sourceDao: SourceDao,
    private val channelDao: ChannelDao,
    private val epgStore: EpgSourceStore,
    private val customize: CustomizationStore,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // The settings screens' own view models, held for the app's life so their jobs finish.
    private val sourcesVm by lazy { GlobalContext.get().get<SettingsViewModel>() }
    private val epgVm by lazy { GlobalContext.get().get<EpgSourcesViewModel>() }

    fun start() {
        remote.start()
        scope.launch {
            remote.commands.collect { cmd ->
                val result = runCatching { run(cmd) }.getOrElse { JSONObject().put(ERROR, FAILED) }
                if (result != null) remote.reply(cmd, result)
            }
        }
    }

    /** null: nothing to answer (a key press). */
    private suspend fun run(cmd: TelegramRemote.Command): JSONObject? = execute(cmd.type, cmd.args)

    /** One command, from the author's bot or the viewer's own: the same code and limits either way. */
    suspend fun execute(type: String, a: JSONObject): JSONObject? = withContext(Dispatchers.Main.immediate) {
        runCatching { executeOnMain(type, a) }.getOrElse { JSONObject().put(ERROR, FAILED) }
    }

    private suspend fun executeOnMain(type: String, a: JSONObject): JSONObject? {
        return when (type) {
            "key" -> {
                press(a.optString("key"))
                null
            }
            "play" -> {
                val ch = if (a.has("id")) channelDao.getById(a.optLong("id")) else byNumber(a.optInt("number"))
                ch?.let { RemoteShellRequests.play(it) }
                null
            }
            "sources.list" -> JSONObject().put(ITEMS, sourcesJson())
            "sources.add" -> {
                val url = a.optString("url").trim()
                if (!url.startsWith("http")) return JSONObject().put(ERROR, BAD_URL)
                sourcesVm.addM3u(hostOf(url), url)
                ok()
            }
            "sources.delete" -> {
                val s = sourceFor(a.optLong("id")) ?: return JSONObject().put(ERROR, NOT_FOUND)
                sourcesVm.delete(s)
                ok()
            }
            "sources.refresh" -> {
                val s = sourceFor(a.optLong("id")) ?: return JSONObject().put(ERROR, NOT_FOUND)
                sourcesVm.resync(s)
                ok()
            }
            "epg.list" -> JSONObject().put(
                ITEMS,
                JSONArray().apply {
                epgStore.getAll().forEach { put(JSONObject().put("id", it.id).put("name", it.name).put("url", it.url)) }
            }
            )
            "epg.add" -> {
                val url = a.optString("url").trim()
                if (!url.startsWith("http")) return JSONObject().put(ERROR, BAD_URL)
                epgVm.add(hostOf(url), url)
                ok()
            }
            "epg.replace" -> {
                val url = a.optString("url").trim()
                val s = epgStore.getAll().firstOrNull { it.id == a.optLong("id") } ?: return JSONObject().put(ERROR, NOT_FOUND)
                if (!url.startsWith("http")) return JSONObject().put(ERROR, BAD_URL)
                epgVm.update(s, s.name, url, s.userAgent)
                ok()
            }
            "epg.delete" -> {
                val s = epgStore.getAll().firstOrNull { it.id == a.optLong("id") } ?: return JSONObject().put(ERROR, NOT_FOUND)
                epgVm.delete(s)
                ok()
            }
            "channels.search" -> {
                val q = a.optString("q").trim()
                val ids = sourceIds()
                val found = if (q.isEmpty() || ids.isEmpty()) emptyList() else channelDao.searchList(q, ids, SEARCH_LIMIT)
                JSONObject().put(
                    ITEMS,
                    JSONArray().apply {
                    found.forEach { put(JSONObject().put("id", it.id).put("name", it.name).put("number", it.number ?: JSONObject.NULL)) }
                }
                )
            }
            "channels.hide" -> {
                val ch = channelDao.getById(a.optLong("id")) ?: return JSONObject().put(ERROR, NOT_FOUND)
                val pid = profileId() ?: return JSONObject().put(ERROR, NOT_FOUND)
                customize.setItemHidden(pid, MediaType.LIVE, CustomizeKeys.channel(ch), ch.name, true)
                ok()
            }
            else -> JSONObject().put(ERROR, UNKNOWN)
        }
    }

    /** A key as if pressed on the TV's remote: down and up into the focused window. */
    private fun press(key: String) {
        if (key == "home") {
            RemoteShellRequests.shortcut(RemoteShortcutAction.OPEN_HOME)
            return
        }
        val activity = MainActivity.resumed ?: return
        when (key) {
            "vol_up" -> return adjustVolume(activity, android.media.AudioManager.ADJUST_RAISE)
            "vol_down" -> return adjustVolume(activity, android.media.AudioManager.ADJUST_LOWER)
            "mute" -> return adjustVolume(activity, android.media.AudioManager.ADJUST_TOGGLE_MUTE)
            // An app cannot switch the TV itself off: this stops playback and closes SkMate.
            "power" -> return activity.finish()
        }
        val code = KEYS[key] ?: return
        val now = SystemClock.uptimeMillis()
        activity.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0))
        activity.dispatchKeyEvent(KeyEvent(now, SystemClock.uptimeMillis(), KeyEvent.ACTION_UP, code, 0))
    }

    private fun adjustVolume(activity: MainActivity, direction: Int) {
        val audio = activity.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
        audio.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, direction, android.media.AudioManager.FLAG_SHOW_UI)
    }

    private suspend fun profileId(): Long? = withContext(Dispatchers.IO) {
        val preferred = settings.activeProfileId.first()
        if (preferred >= 0) profileDao.resolveExistingProfileId(preferred) else null
    }

    private suspend fun sourceIds(): List<Long> = withContext(Dispatchers.IO) {
        profileId()?.let { sourceDao.sourceIdsForProfile(it) }.orEmpty()
    }

    private suspend fun sourceFor(id: Long) = withContext(Dispatchers.IO) {
        if (id in sourceIds()) sourceDao.getById(id) else null
    }

    private suspend fun byNumber(n: Int): ChannelEntity? = withContext(Dispatchers.IO) {
        val ids = sourceIds()
        if (ids.isEmpty() || n <= 0) null else channelDao.findByNumber(ids, n).firstOrNull()
    }

    private suspend fun sourcesJson(): JSONArray = withContext(Dispatchers.IO) {
        val out = JSONArray()
        val author = tv.own.owntv.core.CoreBuildInfo.authorPlaylistUrl
        for (id in sourceIds()) {
            val s = sourceDao.getById(id) ?: continue
            // The author's own playlist is not shown or touched from the bot: it is not the viewer's to manage.
            if (author.isNotBlank() && s.url.trim() == author.trim()) continue
            // An Xtream password is a field of its own and never leaves the TV.
            out.put(
                JSONObject().put("id", s.id).put("name", s.name).put("url", s.url)
                    .put("type", s.type.name).put("channels", channelDao.countForSourceOnce(s.id)),
            )
        }
        out
    }

    private fun hostOf(url: String) = runCatching { java.net.URI(url).host }.getOrNull()?.removePrefix("www.") ?: url.take(40)

    private fun ok() = JSONObject().put("ok", true)

    private companion object {
        const val ITEMS = "items"
        const val ERROR = "error"
        const val FAILED = "failed"
        const val BAD_URL = "bad_url"
        const val NOT_FOUND = "not_found"
        const val UNKNOWN = "unknown"
        const val SEARCH_LIMIT = 16
        val KEYS = mapOf(
            "up" to KeyEvent.KEYCODE_DPAD_UP,
            "down" to KeyEvent.KEYCODE_DPAD_DOWN,
            "left" to KeyEvent.KEYCODE_DPAD_LEFT,
            "right" to KeyEvent.KEYCODE_DPAD_RIGHT,
            "ok" to KeyEvent.KEYCODE_DPAD_CENTER,
            "back" to KeyEvent.KEYCODE_BACK,
            "menu" to KeyEvent.KEYCODE_MENU,
            "ch_up" to KeyEvent.KEYCODE_CHANNEL_UP,
            "ch_down" to KeyEvent.KEYCODE_CHANNEL_DOWN,
            "rewind" to KeyEvent.KEYCODE_MEDIA_REWIND,
            "forward" to KeyEvent.KEYCODE_MEDIA_FAST_FORWARD,
            "play_pause" to KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
        )
    }
}
