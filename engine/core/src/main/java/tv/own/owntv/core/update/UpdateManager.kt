package tv.own.owntv.core.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import tv.own.owntv.core.CoreBuildInfo
import java.io.File
import java.io.IOException

/**
 * In-app updates straight from GitHub Releases: checks the repo's latest release, compares its tag
 * with the installed version, downloads the release APK, and hands it to the system installer.
 * No server of our own — each app's releases CI already publishes one APK per ABI flavour per tag
 * (`OwnTV-vX.Y.Z.apk` / `OwnTV-x86_64-vX.Y.Z.apk` on the television, `OwnTV-Mobile-…` on the phone),
 * and the asset matching this device's ABI is chosen, so updates also work on an x86_64 emulator.
 * **Which repository is asked is the host app's to say** — see [CoreBuildInfo.releaseRepo].
 */
class UpdateManager(
    private val context: Context,
    private val client: OkHttpClient,
    private val settings: tv.own.owntv.core.settings.SettingsRepository,
) {
    data class UpdateInfo(val version: String, val notes: String, val apkUrl: String)

    sealed interface Failure {
        data class CheckHttp(val code: Int) : Failure
        data object NoCompatibleApk : Failure
        data object InvalidReleaseResponse : Failure
        data object CheckNetwork : Failure
        data class DownloadHttp(val code: Int) : Failure
        data object EmptyDownload : Failure
        data object DownloadNetwork : Failure
        data object Install : Failure

        /** Internal storage cannot hold the APK twice (download + install session). */
        data class NotEnoughSpace(val requiredBytes: Long) : Failure

        /** The file that arrived is truncated or not a readable OwnTV package — never install it. */
        data object DamagedDownload : Failure

        /** The system installer refused the package; [message] is its own wording when it gave one. */
        data class InstallRejected(val message: String?) : Failure

        /**
         * The downloaded package is signed with another key than the installed app, or is not newer. The
         * system would refuse it as a conflict; this says so before the installer is ever opened.
         */
        data object Conflict : Failure
    }

    sealed interface State {
        data object Idle : State
        data object Checking : State
        data object UpToDate : State
        data class Available(val info: UpdateInfo) : State
        /** Downloading in the background: the app keeps working, and the card may be put away meanwhile. */
        data class Downloading(val percent: Int, val info: UpdateInfo? = null) : State

        /** Downloaded and checked; the system installer opens when the viewer presses Install. */
        data class Ready(val info: UpdateInfo) : State
        data class Failed(val failure: Failure, val retryInfo: UpdateInfo? = null) : State
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    private class CheckHttpException(val code: Int) : IOException()
    private class DownloadHttpException(val code: Int) : IOException()
    private class NoCompatibleApkException : IOException()
    private class InvalidReleaseResponseException : IOException()
    private class EmptyDownloadException : IOException()
    private class NotEnoughSpaceException(val requiredBytes: Long) : IOException()
    private class DamagedDownloadException(reason: String) : IOException(reason)
    private class ConflictException(reason: String) : IOException(reason)

    private fun failureFor(error: Throwable, checking: Boolean): Failure = when (error) {
        is CheckHttpException -> Failure.CheckHttp(error.code)
        is DownloadHttpException -> Failure.DownloadHttp(error.code)
        is NoCompatibleApkException -> Failure.NoCompatibleApk
        is InvalidReleaseResponseException -> Failure.InvalidReleaseResponse
        is EmptyDownloadException -> Failure.EmptyDownload
        is NotEnoughSpaceException -> Failure.NotEnoughSpace(error.requiredBytes)
        is DamagedDownloadException -> Failure.DamagedDownload
        is ConflictException -> Failure.Conflict
        else -> if (checking) Failure.CheckNetwork else Failure.DownloadNetwork
    }

    val currentVersion: String = CoreBuildInfo.versionName

    /** Queries GitHub's latest release; moves to Available / UpToDate / a semantic failure. */
    fun check() {
        // A download in progress or one waiting to be installed is not thrown away by a new look.
        if (_state.value is State.Checking || _state.value is State.Downloading || _state.value is State.Ready) return
        _state.value = State.Checking
        scope.launch {
            runCatching {
                val request = Request.Builder()
                    .url("https://api.github.com/repos/${CoreBuildInfo.releaseRepo}/releases/latest")
                    .header("Accept", "application/vnd.github+json")
                    .header("User-Agent", tv.own.owntv.core.brand.BrandName.SHORT)
                    .build()
                client.newCall(request).execute().use { resp ->
                    // 404 on /releases/latest: nothing has been published yet, so there is nothing newer.
                    if (resp.code == 404) {
                        settings.recordUpdateCheck(System.currentTimeMillis())
                        _state.value = State.UpToDate
                        return@use
                    }
                    if (!resp.isSuccessful) throw CheckHttpException(resp.code)
                    val body = resp.body.string()
                    if (body.isBlank()) throw InvalidReleaseResponseException()
                    val o = runCatching { JSONObject(body) }.getOrElse { throw InvalidReleaseResponseException() }
                    val version = o.optString("tag_name").removePrefix("v").takeIf { it.isNotBlank() }
                        ?: throw InvalidReleaseResponseException()
                    val notes = o.optString("body").take(16_000)
                    val assets = o.optJSONArray("assets") ?: throw InvalidReleaseResponseException()
                    // Releases carry one APK per ABI flavor (arm = generic, x86_64 suffixed). Never
                    // silently install an APK for the wrong ABI.
                    val wantX86 = android.os.Build.SUPPORTED_ABIS.firstOrNull() == "x86_64"
                    val apkUrl = (0 until assets.length())
                        .asSequence()
                        .mapNotNull { assets.optJSONObject(it) }
                        .mapNotNull { asset ->
                            val name = asset.optString("name")
                            val url = asset.optString("browser_download_url")
                            if (!name.endsWith(".apk") || url.isBlank()) return@mapNotNull null
                            val isX86 = name.contains("x86_64", ignoreCase = true)
                            if (isX86 == wantX86) url else null
                        }
                        .firstOrNull()
                        ?: throw NoCompatibleApkException()
                    val info = UpdateInfo(version, notes, apkUrl)
                    settings.recordUpdateCheck(System.currentTimeMillis())
                    if (isNewer(version, currentVersion)) {
                        // Already downloaded on an earlier run (the viewer pressed Later): no second download.
                        val kept = apkFor(version)
                        _state.value = if (kept.isFile && runCatching { verifyApk(kept) }.isSuccess) State.Ready(info) else State.Available(info)
                        dropOtherDownloads(keepStem = stemFor(version))
                        // The viewer pressed Update before the TV was switched off or the app was closed: carry on
                        // from the bytes already on disk instead of asking again.
                        if (_state.value is State.Available && acceptedFor(version).isFile && partFor(version).isFile) download()
                    } else {
                        dropOtherDownloads(keepStem = null) // the update went in: its file is not needed any more
                        _state.value = State.UpToDate
                    }
                }
            }.onFailure { error ->
                Log.w(TAG, "update check failed: ${error.message}", error)
                _state.value = State.Failed(failureFor(error, checking = true))
            }
        }
    }

    /** Downloads the release APK, then opens the system installer at once (automatic updates). */
    fun downloadAndInstall() = download(installWhenDone = true)

    /**
     * Downloads the release APK in the background with progress. The app goes on working meanwhile; when the
     * file is in and checked the state becomes [State.Ready] and the system installer opens on [installReady]
     * (or right away with [installWhenDone]). The file is kept under the version's name, so pressing Later and
     * coming back does not download it again.
     */
    fun download(installWhenDone: Boolean = false) {
        val info = (_state.value as? State.Available)?.info ?: return
        _state.value = State.Downloading(savedPercent(info.version), info)
        scope.launch {
            runCatching {
                val dir = updatesDir()
                val out = apkFor(info.version)
                val part = partFor(info.version)
                val meta = metaFor(info.version)
                // The viewer asked for this update: if the TV is switched off or the app closed halfway, the next
                // start picks it up again from the bytes already on disk.
                acceptedFor(info.version).createNewFile()
                var restarted = false
                while (true) {
                    val saved = readMeta(meta)
                    val canResume = saved != null && saved.url == info.apkUrl && saved.validator.isNotEmpty() &&
                        !saved.validator.startsWith("W/") && part.isFile && part.length() > 0
                    val offset = if (canResume) part.length() else 0L
                    if (!canResume) { part.delete(); meta.delete() }
                    val request = Request.Builder().url(info.apkUrl)
                        .header("User-Agent", tv.own.owntv.core.brand.BrandName.SHORT)
                        .apply { if (canResume) { header("Range", "bytes=$offset-"); header("If-Range", saved!!.validator) } }
                        .build()
                    val finished = client.newCall(request).execute().use { resp ->
                        // The file on the server changed, or the part already holds all of it: start from nothing.
                        if (resp.code == 416 && canResume) { part.delete(); meta.delete(); return@use false }
                        if (!resp.isSuccessful) throw DownloadHttpException(resp.code)
                        val body = resp.body
                        val resumed = canResume && resp.code == 206
                        val total = if (resumed) {
                            resp.header("Content-Range")?.substringAfterLast('/')?.toLongOrNull() ?: -1L
                        } else {
                            body.contentLength()
                        }
                        val have = if (resumed) offset else 0L
                        // The APK is written once here and copied again into the install session, so
                        // the download needs room for what is still to come plus a second whole copy. Checking
                        // up front turns a silent short write — which reaches the installer as "App not
                        // installed" — into a real message.
                        if (total > 0 && dir.usableSpace < (total - have) + total) throw NotEnoughSpaceException(total * 2 - have)
                        val validator = resp.header("ETag") ?: resp.header("Last-Modified").orEmpty()
                        writeMeta(meta, DownloadMeta(info.apkUrl, validator, total))
                        var written = have
                        var shown = -1
                        body.byteStream().use { input ->
                            java.io.FileOutputStream(part, resumed).use { output ->
                                val buf = ByteArray(64 * 1024)
                                while (true) {
                                    val n = input.read(buf)
                                    if (n < 0) break
                                    output.write(buf, 0, n)
                                    written += n
                                    val percent = if (total > 0) (written * 100 / total).toInt() else 0
                                    if (percent != shown) { shown = percent; _state.value = State.Downloading(percent, info) }
                                }
                            }
                        }
                        if (written == 0L) throw EmptyDownloadException()
                        // A cut connection is not a damaged file: the part stays and the next try goes on from it.
                        if (total > 0 && written != total) throw IOException("short read: $written of $total bytes")
                        true
                    }
                    if (finished) break
                    if (restarted) throw DownloadHttpException(416)
                    restarted = true
                }
                try {
                    verifyApk(part)
                } catch (e: Throwable) {
                    // Only a file that arrived whole and is wrong is thrown away.
                    part.delete(); meta.delete(); acceptedFor(info.version).delete()
                    throw e
                }
                out.delete()
                if (!part.renameTo(out)) throw DamagedDownloadException("could not keep the download")
                meta.delete()
                _state.value = State.Ready(info)
                if (installWhenDone) installReady()
            }.onFailure { error ->
                Log.w(TAG, "update download failed: ${error.message}", error)
                _state.value = State.Failed(failureFor(error, checking = false), retryInfo = info)
            }
        }
    }

    /** Opens the system installer for the downloaded update. The app is replaced in place: data and settings stay. */
    fun installReady() {
        val info = (_state.value as? State.Ready)?.info ?: return
        scope.launch {
            runCatching {
                val apk = apkFor(info.version)
                if (!apk.isFile) throw DamagedDownloadException("the downloaded update is gone")
                verifyApk(apk)
                install(apk)
            }.onFailure { error ->
                Log.w(TAG, "update install failed: ${error.message}", error)
                val failure = if (error is InstallException) Failure.Install else failureFor(error, checking = false)
                _state.value = State.Failed(failure, retryInfo = info)
            }
        }
    }

    private fun updatesDir(): File = File(context.filesDir, "updates").apply { mkdirs() }

    private fun stemFor(version: String): String {
        val safe = version.filter { it.isLetterOrDigit() || it == '.' || it == '-' }
        return "update-$safe"
    }

    private fun apkFor(version: String): File = File(updatesDir(), stemFor(version) + ".apk")

    /** The half-downloaded file; it survives a lost connection, a restart of the app and a switched-off TV. */
    private fun partFor(version: String): File = File(updatesDir(), stemFor(version) + ".apk.part")

    /** What the part belongs to: the address, the server's validator for the file, its full size. */
    private fun metaFor(version: String): File = File(updatesDir(), stemFor(version) + ".meta")

    /** Present once the viewer pressed Update for this version: the next start carries on by itself. */
    private fun acceptedFor(version: String): File = File(updatesDir(), stemFor(version) + ".accepted")

    private class DownloadMeta(val url: String, val validator: String, val total: Long)

    private fun readMeta(file: File): DownloadMeta? = runCatching {
        val o = JSONObject(file.readText())
        DownloadMeta(o.getString("url"), o.getString("validator"), o.getLong("total"))
    }.getOrNull()

    private fun writeMeta(file: File, meta: DownloadMeta) {
        runCatching {
            file.writeText(JSONObject().put("url", meta.url).put("validator", meta.validator).put("total", meta.total).toString())
        }
    }

    /** How much of [version]'s file is already on disk, so a carried-on download does not start at 0 %. */
    private fun savedPercent(version: String): Int {
        val part = partFor(version)
        val total = readMeta(metaFor(version))?.total ?: return 0
        return if (part.isFile && total > 0) (part.length() * 100 / total).toInt().coerceIn(0, 99) else 0
    }

    /**
     * Old downloads go: an update already installed, or one a newer release replaced. Everything that
     * belongs to [keepStem] stays — the finished file, the half-done part and its notes — so a check at
     * start never throws away a download that is still being carried on.
     */
    private fun dropOtherDownloads(keepStem: String?) {
        updatesDir().listFiles()?.forEach { file ->
            if (keepStem == null || !(file.name == "$keepStem.apk" || file.name.startsWith("$keepStem."))) file.delete()
        }
    }

    /**
     * Refuses anything the system cannot read back as this app's package. A truncated or corrupted
     * APK is otherwise only rejected by the installer itself, which reports nothing to us and shows
     * the user a bare "App not installed" — the failure this whole guard exists to explain.
     */
    private fun verifyApk(apk: File) {
        val info = context.packageManager.getPackageArchiveInfo(apk.absolutePath, 0)
            ?: throw DamagedDownloadException("unparseable APK (${apk.length()} bytes)")
        if (info.packageName != context.packageName) {
            throw DamagedDownloadException("wrong package ${info.packageName}")
        }
        // The two refusals Android calls a conflict, caught here with a clear message instead.
        val installed = context.packageManager.getPackageInfo(context.packageName, 0)
        if (androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(info) <= androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(installed)) {
            throw ConflictException("not newer than the installed build")
        }
        if (!sameSigner(apk)) throw ConflictException("signed with another key")
    }

    /** Whether [apk] is signed by the same key as the installed app (an update from another build would be refused). */
    @Suppress("DEPRECATION")
    private fun sameSigner(apk: File): Boolean {
        val pm = context.packageManager
        val flags = if (android.os.Build.VERSION.SDK_INT >= 28) android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES else android.content.pm.PackageManager.GET_SIGNATURES
        val archive = pm.getPackageArchiveInfo(apk.absolutePath, flags) ?: return false
        val mine = pm.getPackageInfo(context.packageName, flags)
        fun certs(i: android.content.pm.PackageInfo): Set<String> =
            if (android.os.Build.VERSION.SDK_INT >= 28) {
                i.signingInfo?.let { si -> (if (si.hasMultipleSigners()) si.apkContentsSigners else si.signingCertificateHistory) }
                    ?.map { it.toCharsString() }?.toSet().orEmpty()
            } else {
                i.signatures?.map { it.toCharsString() }?.toSet().orEmpty()
            }
        val theirs = certs(archive)
        val ours = certs(mine)
        // A key rotation keeps the old certificate in the history: any shared certificate is the same signer.
        return theirs.isNotEmpty() && ours.isNotEmpty() && theirs.any { it in ours }
    }

    /**
     * Installs through [PackageInstaller] rather than an `ACTION_VIEW` intent on a FileProvider URI.
     * Two reasons: the session reads the APK from our own storage (no cross-app URI grant to go wrong
     * on older TV installers), and its status broadcast carries the real reason a package was refused
     * — insufficient storage, a signature conflict, a bad file — instead of the system's silent
     * "App not installed".
     */
    private fun install(apk: File) {
        registerInstallReceiver()
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        val sessionId = try {
            installer.createSession(params)
        } catch (e: IOException) {
            throw InstallException(e)
        }
        installer.openSession(sessionId).use { session ->
            session.openWrite(SESSION_ENTRY, 0, apk.length()).use { output ->
                apk.inputStream().use { it.copyTo(output) }
                session.fsync(output)
            }
            val intent = Intent(INSTALL_STATUS_ACTION).setPackage(context.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            session.commit(PendingIntent.getBroadcast(context, 0, intent, flags).intentSender)
        }
        // The file stays until the new version has started (the next check removes it), so a declined
        // system prompt can be answered again with Install, without a second download.
    }

    /** Registered once, for the app's lifetime: the confirmation round trip outlives any one call. */
    private fun registerInstallReceiver() {
        if (installReceiverRegistered) return
        installReceiverRegistered = true
        ContextCompat.registerReceiver(
            context,
            installStatusReceiver,
            IntentFilter(INSTALL_STATUS_ACTION),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    private var installReceiverRegistered = false

    private val installStatusReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
            val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
            when (status) {
                // The user still has to approve the install — this is the system prompt, not a failure.
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java)
                    confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { confirm?.let { context.startActivity(it) } }
                        .onFailure { _state.value = State.Failed(Failure.Install) }
                }
                PackageInstaller.STATUS_SUCCESS -> Log.i(TAG, "update installed")
                // Declining the system prompt is a choice, not an error — leave the dialog as it was.
                PackageInstaller.STATUS_FAILURE_ABORTED -> Log.i(TAG, "install cancelled by user")
                else -> {
                    Log.w(TAG, "install refused status=$status message=$message")
                    _state.value = State.Failed(Failure.InstallRejected(message?.takeIf { it.isNotBlank() }))
                }
            }
        }
    }

    /** Retries the failed phase without losing a successfully resolved release asset. */
    fun retry() {
        val failed = _state.value as? State.Failed ?: return
        val info = failed.retryInfo
        if (info != null && failed.failure !is Failure.CheckHttp && failed.failure !is Failure.NoCompatibleApk &&
            failed.failure !is Failure.InvalidReleaseResponse && failed.failure !is Failure.CheckNetwork &&
            failed.failure !is Failure.Conflict
        ) {
            _state.value = State.Available(info)
            downloadAndInstall()
        } else {
            check()
        }
    }

    /** Back to quiet; a download in progress or a file waiting to be installed is kept. */
    fun reset() {
        if (_state.value !is State.Downloading && _state.value !is State.Ready) _state.value = State.Idle
    }

    /** Numeric segment-wise compare: "1.10.0" > "1.9.3"; non-numeric junk compares as 0. */
    private fun isNewer(remote: String, local: String): Boolean {
        val r = remote.split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
        val l = local.split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(r.size, l.size)) {
            val a = r.getOrElse(i) { 0 }
            val b = l.getOrElse(i) { 0 }
            if (a != b) return a > b
        }
        return false
    }

    private class InstallException(cause: Throwable) : IOException(cause)

    companion object {
        private const val TAG = "UpdateManager"
        private const val SESSION_ENTRY = "owntv-update"
        private const val INSTALL_STATUS_ACTION = "tv.own.owntv.UPDATE_INSTALL_STATUS"
    }
}
