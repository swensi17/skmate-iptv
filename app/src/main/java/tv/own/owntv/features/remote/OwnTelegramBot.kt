package tv.own.owntv.features.remote

import android.content.Context
import android.text.Html
import android.util.Log
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import tv.own.owntv.R

/**
 * The viewer's own Telegram bot, run by this TV alone: the token from @BotFather goes in Settings, the TV
 * asks Telegram for the bot's messages itself and answers them, and nothing passes through SkMate's
 * service. The first account that sends the code shown on the TV owns the bot; nobody else gets an answer.
 *
 * The screens are the same remote as the author's bot (keys, playlists, guides, channels), carried out by
 * [RemoteCommands], so every limit of the TV's own settings holds.
 */
class OwnTelegramBot(
    private val context: Context,
    baseClient: OkHttpClient,
    private val commands: RemoteCommands,
) {
    sealed interface State {
        data object Off : State
        data object Checking : State

        /** Running, waiting for its owner to send [code]. */
        data class Waiting(val botName: String, val code: String) : State
        data class Running(val botName: String, val owner: String) : State

        /** Telegram refused the token. */
        data object BadToken : State
        data object NoNetwork : State
    }

    private val prefs = SecretPrefs(context, PREFS)
    private val client = baseClient.newBuilder().readTimeout((POLL_S + 15).toLong(), TimeUnit.SECONDS).build()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loop: Job? = null

    private val _state = MutableStateFlow<State>(State.Off)
    val state: StateFlow<State> = _state.asStateFlow()

    // The owner's chat: the one message the bot keeps, what it waits for, the last lists it showed.
    private var messageId = 0L
    private var wait = ""
    private var items: List<JSONObject> = emptyList()
    private val wrongTries = HashMap<Long, Int>()

    private val token get() = prefs.get(KEY_TOKEN)
    private val owner get() = prefs.get(KEY_OWNER)?.toLongOrNull()

    fun start() {
        if (token != null) ensureLoop()
    }

    /** A token typed in Settings: checked with Telegram, then the bot runs and waits for its owner. */
    fun setToken(raw: String) {
        val t = raw.trim()
        if (!TOKEN_SHAPE.matches(t)) {
            _state.value = State.BadToken
            return
        }
        loop?.cancel()
        prefs.put(KEY_TOKEN, t)
        prefs.remove(KEY_OWNER)
        prefs.remove(KEY_OWNER_NAME)
        startPairing()
        ensureLoop()
    }

    /** A fresh code with its clock and a clean count of wrong tries. */
    private fun startPairing() {
        prefs.put(KEY_CODE, newCode())
        prefs.put(KEY_CODE_AT, System.currentTimeMillis().toString())
        wrongTries.clear()
    }

    fun newPairingCode() {
        prefs.remove(KEY_OWNER)
        prefs.remove(KEY_OWNER_NAME)
        startPairing()
        loop?.cancel()
        ensureLoop()
    }

    fun remove() {
        loop?.cancel()
        loop = null
        prefs.clear()
        _state.value = State.Off
    }

    private fun ensureLoop() {
        if (loop?.isActive == true) return
        loop = scope.launch {
            _state.value = State.Checking
            val me = call("getMe", JSONObject())
            if (me == null) {
                _state.value = State.NoNetwork
            } else if (!me.optBoolean("ok")) {
                _state.value = State.BadToken
                return@launch
            }
            val botName = me?.optJSONObject("result")?.optString("username").orEmpty()
            call("setMyCommands", JSONObject().put("commands", JSONArray().put(JSONObject().put("command", "start").put("description", s(R.string.tg_bot_menu)))))
            publishState(botName)
            var offset = 0L
            var backoff = 1_000L
            while (isActive) {
                val r = call("getUpdates", JSONObject().put("offset", offset).put("timeout", POLL_S).put("allowed_updates", JSONArray().put("message").put("callback_query")))
                if (r == null || !r.optBoolean("ok")) {
                    if (r?.optInt("error_code") == 401) { _state.value = State.BadToken; return@launch }
                    _state.value = State.NoNetwork
                    delay(backoff)
                    backoff = (backoff * 2).coerceAtMost(30_000L)
                    continue
                }
                backoff = 1_000L
                publishState(botName)
                val updates = r.optJSONArray("result") ?: continue
                for (i in 0 until updates.length()) {
                    val u = updates.optJSONObject(i) ?: continue
                    offset = u.optLong("update_id") + 1
                    runCatching { handle(u) }.onFailure { Log.w(TAG, "update failed: ${it.message}") }
                }
            }
        }
    }

    private fun publishState(botName: String) {
        val code = prefs.get(KEY_CODE).orEmpty()
        _state.value = if (owner != null) State.Running(botName, prefs.get(KEY_OWNER_NAME).orEmpty()) else State.Waiting(botName, code)
    }

    private suspend fun handle(u: JSONObject) {
        u.optJSONObject("message")?.let { m ->
            val chat = m.optJSONObject("chat") ?: return
            if (chat.optString("type") != "private") return
            val chatId = chat.optLong("id")
            val text = m.optString("text").trim()
            val name = m.optJSONObject("from")?.optString("first_name").orEmpty()
            if (owner == null) {
                // Not owned yet: only the code from the TV's screen makes this account the owner.
                val code = prefs.get(KEY_CODE)
                val age = System.currentTimeMillis() - (prefs.get(KEY_CODE_AT)?.toLongOrNull() ?: 0L)
                // Wrong codes are counted per account: a stranger's guesses never lock the real owner out.
                val tries = wrongTries[chatId] ?: 0
                if (code == null || age > CODE_TTL_MS || tries >= MAX_TRIES) {
                    // Pairing is closed until the TV shows a new code (Settings → Telegram → Your own bot).
                    send(chatId, s(R.string.tg_bot_code_expired))
                    return
                }
                if (text.filter { it.isDigit() } == code) {
                    prefs.put(KEY_OWNER, chatId.toString())
                    prefs.put(KEY_OWNER_NAME, name)
                    prefs.remove(KEY_CODE)
                    _state.value = State.Running((_state.value as? State.Waiting)?.botName.orEmpty(), name)
                    show(chatId, remoteScreen(), keypad(), note = s(R.string.tg_bot_linked), fresh = true)
                } else {
                    wrongTries[chatId] = tries + 1
                    send(chatId, s(R.string.tg_bot_send_code))
                }
                return
            }
            if (chatId != owner) return // strangers get no answer at all
            call("deleteMessage", JSONObject().put("chat_id", chatId).put("message_id", m.optLong("message_id")))
            onText(chatId, text)
        }
        u.optJSONObject("callback_query")?.let { cb ->
            val chatId = cb.optJSONObject("message")?.optJSONObject("chat")?.optLong("id") ?: return
            val data = cb.optString("data")
            if (chatId != owner) {
                call("answerCallbackQuery", JSONObject().put("callback_query_id", cb.optString("id")))
                return
            }
            messageId = cb.optJSONObject("message")?.optLong("message_id") ?: messageId
            onButton(chatId, cb.optString("id"), data)
        }
    }

    private suspend fun onText(chat: Long, text: String) {
        when {
            text.startsWith("/") -> { wait = ""; show(chat, remoteScreen(), keypad(), fresh = true) }
            wait == WAIT_PLAYLIST || wait == WAIT_GUIDE || wait.startsWith(WAIT_REPLACE) -> {
                val url = URL_RE.find(text)?.value ?: return show(chat, s(R.string.tg_bot_need_link), back(SCR_MAIN))
                val (type, args, after) = when {
                    wait == WAIT_PLAYLIST -> Triple(CMD_SOURCES_ADD, JSONObject().put("url", url), SCR_PLAYLISTS)
                    wait == WAIT_GUIDE -> Triple(CMD_EPG_ADD, JSONObject().put("url", url), SCR_GUIDES)
                    else -> Triple(CMD_EPG_REPLACE, JSONObject().put("id", wait.removePrefix(WAIT_REPLACE).toLongOrNull() ?: 0L).put("url", url), SCR_GUIDES)
                }
                wait = ""
                val r = commands.execute(type, args)
                openList(chat, after, resultNote(r, R.string.tg_bot_done))
            }
            text.filter { !it.isWhitespace() }.let { it.isNotEmpty() && it.length <= 5 && it.all(Char::isDigit) } -> {
                commands.execute(CMD_PLAY, JSONObject().put("number", text.filter { it.isDigit() }.toInt()))
                show(chat, remoteScreen(), keypad(), note = s(R.string.tg_bot_playing, text.trim()))
            }
            else -> {
                val r = commands.execute(CMD_SEARCH, JSONObject().put("q", text.take(60)))
                items = r?.optJSONArray("items").toList()
                show(chat, s(R.string.tg_bot_found, esc(text.take(40)), items.size), channelButtons())
            }
        }
    }

    private suspend fun onButton(chat: Long, cbId: String, data: String) {
        val answer = JSONObject().put("callback_query_id", cbId)
        if (data.startsWith("k:")) {
            commands.execute(CMD_KEY, JSONObject().put("key", data.removePrefix("k:")))
            call("answerCallbackQuery", answer)
            return
        }
        call("answerCallbackQuery", answer)
        val parts = data.split(":")
        val i = parts.getOrNull(1)?.toIntOrNull() ?: -1
        val item = items.getOrNull(i)
        when (parts[0]) {
            SCR_MAIN -> { wait = ""; show(chat, remoteScreen(), keypad()) }
            SCR_PLAYLISTS, SCR_GUIDES -> openList(chat, parts[0])
            "pa" -> { wait = WAIT_PLAYLIST; show(chat, s(R.string.tg_bot_send_playlist), back(SCR_PLAYLISTS)) }
            "ga" -> { wait = WAIT_GUIDE; show(chat, s(R.string.tg_bot_send_guide), back(SCR_GUIDES)) }
            "px" -> item?.let { openList(chat, SCR_PLAYLISTS, resultNote(commands.execute(CMD_SOURCES_DELETE, JSONObject().put("id", it.optLong("id"))), R.string.tg_bot_deleted)) }
            "pu" -> item?.let { openList(chat, SCR_PLAYLISTS, resultNote(commands.execute(CMD_SOURCES_REFRESH, JSONObject().put("id", it.optLong("id"))), R.string.tg_bot_refreshing)) }
            "gx" -> item?.let { openList(chat, SCR_GUIDES, resultNote(commands.execute(CMD_EPG_DELETE, JSONObject().put("id", it.optLong("id"))), R.string.tg_bot_deleted)) }
            "gr" -> item?.let { wait = WAIT_REPLACE + it.optLong("id"); show(chat, s(R.string.tg_bot_send_guide), back(SCR_GUIDES)) }
            "pi", "gi" -> item?.let { itemScreen(chat, parts[0][0], i, it) }
            "cp" -> item?.let {
                commands.execute(CMD_PLAY, JSONObject().put("id", it.optLong("id")))
                show(chat, remoteScreen(), keypad(), note = s(R.string.tg_bot_playing, esc(it.optString("name"))))
            }
            "cx" -> item?.let {
                val note = resultNote(commands.execute(CMD_HIDE, JSONObject().put("id", it.optLong("id"))), R.string.tg_bot_hidden)
                show(chat, remoteScreen(), keypad(), note = note)
            }
            "ci" -> item?.let {
                show(
                    chat, "<b>${esc(it.optString("name"))}</b>",
                    rows(
                    listOf(button(s(R.string.tg_bot_play), "cp:$i")),
                    listOf(button(s(R.string.tg_bot_hide), "cx:$i")),
                    listOf(button(s(R.string.tg_bot_back), SCR_MAIN)),
                )
                )
            }
        }
    }

    // --- screens -------------------------------------------------------------------------------

    private fun remoteScreen() = s(R.string.tg_bot_remote_title) + "\n\n" + s(R.string.tg_bot_remote_hint)

    private fun keypad() = rows(
        listOf(button("⏮", "k:ch_down"), button("▲", "k:up"), button("⏭", "k:ch_up")),
        listOf(button("◀", "k:left"), button("OK", "k:ok"), button("▶", "k:right")),
        listOf(button("⏪", "k:rewind"), button("▼", "k:down"), button("⏩", "k:forward")),
        listOf(button("🔉", "k:vol_down"), button("🔇", "k:mute"), button("🔊", "k:vol_up")),
        listOf(button("↩", "k:back"), button("⏯", "k:play_pause"), button("☰", "k:menu"), button("⌂", "k:home")),
        listOf(button(s(R.string.tg_bot_playlists), SCR_PLAYLISTS), button(s(R.string.tg_bot_guides), SCR_GUIDES)),
    )

    private suspend fun openList(chat: Long, screen: String, note: String = "") {
        wait = ""
        val r = commands.execute(if (screen == SCR_PLAYLISTS) CMD_SOURCES_LIST else CMD_EPG_LIST, JSONObject())
        items = r?.optJSONArray("items").toList().take(MAX_ITEMS)
        val kind = if (screen == SCR_PLAYLISTS) "p" else "g"
        val title = s(if (screen == SCR_PLAYLISTS) R.string.tg_bot_playlists else R.string.tg_bot_guides)
        val list = items.mapIndexed { i, it -> listOf(button(it.optString("name").ifBlank { it.optString("url") }.take(40), "${kind}i:$i")) }
        show(
            chat, "<b>${esc(title)}</b>" + if (items.isEmpty()) "\n\n" + s(R.string.tg_bot_empty) else "",
            rows(
            *list.toTypedArray(),
            listOf(button(s(R.string.tg_bot_add), "${kind}a")),
            listOf(button(s(R.string.tg_bot_back), SCR_MAIN)),
        ),
            note
        )
    }

    private suspend fun itemScreen(chat: Long, kind: Char, i: Int, it: JSONObject) {
        val actions = if (kind == 'p') {
            listOf(listOf(button(s(R.string.tg_bot_refresh), "pu:$i")), listOf(button(s(R.string.tg_bot_delete), "px:$i")))
        } else {
            listOf(listOf(button(s(R.string.tg_bot_replace), "gr:$i")), listOf(button(s(R.string.tg_bot_delete), "gx:$i")))
        }
        show(
            chat, "<b>${esc(it.optString("name"))}</b>\n\n<code>${esc(it.optString("url").take(300))}</code>",
            rows(
            *actions.toTypedArray(),
            listOf(button(s(R.string.tg_bot_back), if (kind == 'p') SCR_PLAYLISTS else SCR_GUIDES)),
        )
        )
    }

    private fun channelButtons() = rows(
        *items.take(MAX_ITEMS).mapIndexed { i, it ->
            listOf(button(listOf(it.opt("number")?.takeIf { n -> n != JSONObject.NULL }?.toString(), it.optString("name")).filterNotNull().joinToString(" ").take(40), "ci:$i"))
        }.toTypedArray(),
        listOf(button(s(R.string.tg_bot_back), SCR_MAIN)),
    )

    private fun resultNote(r: JSONObject?, okRes: Int): String =
        if (r != null && r.has("error")) s(R.string.tg_bot_failed) else s(okRes)

    // --- Telegram ------------------------------------------------------------------------------

    /** The bot's one message: edited in place, or sent anew (and the old one removed) when it cannot be. */
    private suspend fun show(chat: Long, text: String, markup: JSONObject, note: String = "", fresh: Boolean = false) {
        val body = (if (note.isNotEmpty()) "$text\n\n<i>$note</i>" else text)
        val rich = JSONObject().put("html", html(body) + "<footer>" + esc(s(R.string.tg_bot_footer)) + "</footer>")
        if (messageId != 0L && !fresh) {
            val r = call("editMessageText", JSONObject().put("chat_id", chat).put("message_id", messageId).put("rich_message", rich).put("reply_markup", markup))
            if (r?.optBoolean("ok") == true || r?.optString("description").orEmpty().contains("not modified")) return
        }
        val r = call("sendRichMessage", JSONObject().put("chat_id", chat).put("rich_message", rich).put("reply_markup", markup))
        val id = r?.optJSONObject("result")?.optLong("message_id") ?: return
        if (messageId != 0L) call("deleteMessage", JSONObject().put("chat_id", chat).put("message_id", messageId))
        messageId = id
    }

    private suspend fun send(chat: Long, text: String) {
        call("sendMessage", JSONObject().put("chat_id", chat).put("text", text))
    }

    private fun call(method: String, body: JSONObject): JSONObject? {
        val t = token ?: return null
        return runCatching {
            val req = Request.Builder().url("$API$t/$method").post(body.toString().toRequestBody(JSON)).build()
            client.newCall(req).execute().use { JSONObject(it.body?.string().orEmpty()) }
        }.onFailure { Log.w(TAG, "$method failed: ${it.javaClass.simpleName}") }.getOrNull()
    }

    private fun s(res: Int, vararg args: Any) = context.getString(res, *args)

    private fun newCode() = (SecureRandom().nextInt(900_000) + 100_000).toString()

    private companion object {
        const val TAG = "OwnTelegramBot"
        const val API = "https://api.telegram.org/bot"
        const val PREFS = "own_telegram_bot"
        const val KEY_TOKEN = "token"
        const val KEY_OWNER = "owner"
        const val KEY_OWNER_NAME = "owner_name"
        const val KEY_CODE = "code"
        const val KEY_CODE_AT = "code_at"
        const val CODE_TTL_MS = 10 * 60 * 1000L
        const val MAX_TRIES = 5
        const val POLL_S = 50
        const val MAX_ITEMS = 16
        const val SCR_MAIN = "m"
        const val SCR_PLAYLISTS = "pl"
        const val SCR_GUIDES = "gl"
        const val WAIT_PLAYLIST = "playlist"
        const val WAIT_GUIDE = "guide"
        const val WAIT_REPLACE = "replace:"
        const val CMD_KEY = "key"
        const val CMD_PLAY = "play"
        const val CMD_SEARCH = "channels.search"
        const val CMD_HIDE = "channels.hide"
        const val CMD_SOURCES_LIST = "sources.list"
        const val CMD_SOURCES_ADD = "sources.add"
        const val CMD_SOURCES_DELETE = "sources.delete"
        const val CMD_SOURCES_REFRESH = "sources.refresh"
        const val CMD_EPG_LIST = "epg.list"
        const val CMD_EPG_ADD = "epg.add"
        const val CMD_EPG_DELETE = "epg.delete"
        const val CMD_EPG_REPLACE = "epg.replace"
        val JSON = "application/json; charset=utf-8".toMediaType()
        val TOKEN_SHAPE = Regex("""\d{5,12}:[A-Za-z0-9_-]{30,50}""")
        val URL_RE = Regex("""https?://\S+""")

        fun button(text: String, data: String) = JSONObject().put("text", text).put("callback_data", data)
        fun rows(vararg r: List<JSONObject>) = JSONObject().put("inline_keyboard", JSONArray().apply { r.forEach { put(JSONArray(it)) } })
        fun back(to: String) = rows(listOf(button("←", to)))
        fun esc(t: String): String = Html.escapeHtml(t)

        /** Blank lines split paragraphs, a newline is a line break: rich-message HTML. */
        fun html(text: String) = text.split("\n\n").filter { it.isNotBlank() }.joinToString("") { "<p>" + it.replace("\n", "<br/>") + "</p>" }

        fun JSONArray?.toList(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
    }
}

/** A few strings kept encrypted on the TV (Android keystore): the bot's token never sits in plain text. */
private class SecretPrefs(context: Context, name: String) {
    private val prefs = context.applicationContext.getSharedPreferences(name, Context.MODE_PRIVATE)

    fun get(key: String): String? = prefs.getString(key, null)?.let { runCatching { decrypt(it) }.getOrNull() }
    fun put(key: String, value: String) = prefs.edit().putString(key, encrypt(value)).apply()
    fun remove(key: String) = prefs.edit().remove(key).apply()
    fun clear() = prefs.edit().clear().apply()

    private fun key(): javax.crypto.SecretKey {
        val ks = java.security.KeyStore.getInstance(STORE).apply { load(null) }
        (ks.getEntry(ALIAS, null) as? java.security.KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = javax.crypto.KeyGenerator.getInstance(android.security.keystore.KeyProperties.KEY_ALGORITHM_AES, STORE)
        gen.init(
            android.security.keystore.KeyGenParameterSpec.Builder(ALIAS, android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(v: String): String {
        val c = javax.crypto.Cipher.getInstance(CIPHER).apply { init(javax.crypto.Cipher.ENCRYPT_MODE, key()) }
        val out = c.iv + c.doFinal(v.toByteArray())
        return android.util.Base64.encodeToString(out, android.util.Base64.NO_WRAP)
    }

    private fun decrypt(v: String): String {
        val raw = android.util.Base64.decode(v, android.util.Base64.NO_WRAP)
        val c = javax.crypto.Cipher.getInstance(CIPHER)
        c.init(javax.crypto.Cipher.DECRYPT_MODE, key(), javax.crypto.spec.GCMParameterSpec(128, raw, 0, IV))
        return String(c.doFinal(raw, IV, raw.size - IV))
    }

    private companion object {
        const val STORE = "AndroidKeyStore"
        const val ALIAS = "skmate_own_bot"
        const val CIPHER = "AES/GCM/NoPadding"
        const val IV = 12
    }
}
