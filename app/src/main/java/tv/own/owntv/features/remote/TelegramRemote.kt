package tv.own.owntv.features.remote

import android.content.Context
import android.util.Log
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * The TV's side of the Telegram remote: pairs with the author's service by a six-digit code and then
 * holds a request open to it, so a button pressed in the bot arrives here in a moment as a [Command].
 *
 * Only runs while linked, or while the pairing screen shows a code. Nothing is sent but the device's
 * own id, its model name and the answers to the commands its owner sends.
 */
class TelegramRemote(context: Context, baseClient: OkHttpClient) {

    sealed interface State {
        data object Off : State
        data object Connecting : State
        data class Code(val code: String, val until: Long) : State
        data class Linked(val owner: String) : State
        data object Failed : State
    }

    data class Command(val id: String, val type: String, val args: JSONObject)

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val client = baseClient.newBuilder()
        .readTimeout(POLL_READ_S, TimeUnit.SECONDS)
        .callTimeout(POLL_READ_S + 5, TimeUnit.SECONDS)
        .build()
    private val scope = CoroutineScope(Dispatchers.IO)
    private var loop: Job? = null

    private val _state = MutableStateFlow<State>(if (linked) State.Linked(prefs.getString(KEY_OWNER, "").orEmpty()) else State.Off)
    val state: StateFlow<State> = _state.asStateFlow()

    private val _commands = MutableSharedFlow<Command>(extraBufferCapacity = 32)
    val commands = _commands.asSharedFlow()

    private val device: String
        get() = prefs.getString(KEY_DEVICE, null) ?: UUID.randomUUID().toString().also { prefs.edit().putString(KEY_DEVICE, it).apply() }
    private val secret: String get() = prefs.getString(KEY_SECRET, "").orEmpty()
    private val linked: Boolean get() = prefs.getBoolean(KEY_LINKED, false)

    /** At app start: listens again when this TV was linked before. */
    fun start() {
        if (linked) ensureLoop()
    }

    /** The pairing screen opened: a fresh code (and the loop that learns when it is used). */
    fun requestCode() {
        scope.launch {
            _state.value = State.Connecting
            val body = JSONObject().put("device", device).put("name", deviceName()).put("secret", secret)
            val r = post("register", body)
            if (r == null) {
                _state.value = State.Failed
                return@launch
            }
            prefs.edit().putString(KEY_SECRET, r.optString("secret")).apply()
            if (r.optBoolean("linked")) {
                setLinked(true, prefs.getString(KEY_OWNER, "").orEmpty())
            } else {
                _state.value = State.Code(r.optString("code"), (r.optDouble("until") * 1000).toLong())
            }
            ensureLoop()
        }
    }

    /** The pairing screen closed without a link: stop listening. */
    fun closePairing() {
        if (!linked && _state.value !is State.Linked) {
            loop?.cancel()
            loop = null
            _state.value = State.Off
        }
    }

    fun unlink() {
        scope.launch {
            post("unlink", JSONObject().put("device", device).put("secret", secret))
            setLinked(false, "")
            loop?.cancel()
            loop = null
            _state.value = State.Off
        }
    }

    /** The answer to a command, shown in the bot. */
    fun reply(cmd: Command, result: JSONObject) {
        scope.launch {
            post("reply", JSONObject().put("device", device).put("secret", secret).put("id", cmd.id).put("result", result))
        }
    }

    private fun setLinked(on: Boolean, owner: String) {
        prefs.edit().putBoolean(KEY_LINKED, on).putString(KEY_OWNER, owner).apply()
        _state.value = if (on) State.Linked(owner) else State.Off
    }

    private fun ensureLoop() {
        if (loop?.isActive == true) return
        loop = scope.launch {
            var backoff = 1_000L
            while (isActive) {
                val r = runCatching { poll() }.getOrNull()
                if (r == null) {
                    delay(backoff)
                    backoff = (backoff * 2).coerceAtMost(30_000L)
                    continue
                }
                backoff = 1_000L
                val nowLinked = r.optBoolean("linked")
                val who = r.optString("owner")
                val ownerChanged = nowLinked && who.isNotBlank() && who != prefs.getString(KEY_OWNER, "")
                if (nowLinked != linked || (nowLinked && _state.value !is State.Linked) || ownerChanged) {
                    setLinked(nowLinked, r.optString("owner"))
                    if (!nowLinked) {
                        // Unlinked from the bot: stop until the pairing screen asks again.
                        break
                    }
                }
                val cmds = r.optJSONArray("cmds") ?: continue
                for (i in 0 until cmds.length()) {
                    val c = cmds.optJSONObject(i) ?: continue
                    _commands.tryEmit(Command(c.optString("id"), c.optString("type"), c.optJSONObject("args") ?: JSONObject()))
                }
            }
        }
    }

    /** null: no answer (network); throws nothing. A 403 means this TV is not known any more. */
    private suspend fun poll(): JSONObject? = withContext(Dispatchers.IO) {
        // The secret goes in a header: an address ends up in server logs.
        val req = Request.Builder().url("$BASE/poll").header(HEADER_DEVICE, device).header(HEADER_SECRET, secret).build()
        client.newCall(req).execute().use { resp ->
            if (resp.code == 403) {
                setLinked(false, "")
                return@withContext JSONObject().put("linked", false)
            }
            if (!resp.isSuccessful) return@withContext null
            JSONObject(resp.body?.string().orEmpty())
        }
    }

    private suspend fun post(path: String, body: JSONObject): JSONObject? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url("$BASE/$path").post(body.toString().toRequestBody(JSON)).build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) null else JSONObject(resp.body?.string().orEmpty())
            }
        }.onFailure { Log.w(TAG, "remote $path failed: ${it.message}") }.getOrNull()
    }

    private fun deviceName(): String =
        listOf(android.os.Build.MANUFACTURER, android.os.Build.MODEL).filter { it.isNotBlank() }.distinct().joinToString(" ")

    companion object {
        private const val TAG = "TelegramRemote"
        private const val BASE = "https://nutrokstore.xyz/skmate/tv"
        const val BOT = "skmate_playlist_bot"
        private const val PREFS = "telegram_remote"
        private const val KEY_DEVICE = "device"
        private const val KEY_SECRET = "secret"
        private const val KEY_LINKED = "linked"
        private const val KEY_OWNER = "owner"
        private const val POLL_READ_S = 40L
        private const val HEADER_DEVICE = "X-Device"
        private const val HEADER_SECRET = "X-Secret"
        private val JSON = "application/json; charset=utf-8".toMediaType()

        /** The link that opens the bot with the code already in it. */
        fun botLink(code: String) = "https://t.me/$BOT?start=tv$code"
    }
}
