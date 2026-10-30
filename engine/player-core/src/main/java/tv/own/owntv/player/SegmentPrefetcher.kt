package tv.own.owntv.player

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ThreadFactory
import java.util.concurrent.TimeUnit

/**
 * Loads the next live HLS segments in parallel while the player works on the current one.
 *
 * **Why.** Some providers throttle every connection: measured on one panel, a 5 MB / 10 s segment (4.1 Mbit/s
 * of video) came down at 0.2–0.3 MB/s on most connections and 3 MB/s on a few, so a single download at a time
 * averaged 3.2 Mbit/s — below the stream's own bitrate — while six at once gave 10 Mbit/s. Media3 loads one
 * segment at a time, so on such a panel the picture rebuffers every ten seconds and, with a short live window,
 * falls behind it and starts over from the default position (the "same 40 seconds again and again").
 *
 * **How.** [open] wraps the HLS data source. It reads each media playlist as it passes through, remembers the
 * segment order, and when the player opens segment N it starts fetching N+1 and N+2 into memory over their own
 * connections. When the player then asks for N+1 it is served from memory (or from the download already in
 * flight), so the loader never waits on a slow connection it could have started earlier.
 *
 * Anything unusual falls back to the plain path: byte ranges, a range request, an entry that failed, a panel that
 * refused a parallel connection. A fault in the prefetcher can therefore only cost what it saves, never break a
 * stream that played before.
 */
@UnstableApi
internal class SegmentPrefetcher(private val upstream: DataSource.Factory) {

    private class Entry(val uri: Uri) {
        private val lock = Object()
        private var data = ByteArray(INITIAL_BYTES)
        private var size = 0
        private var finished = false
        private var failure: IOException? = null
        @Volatile var cancelled = false
        @Volatile var contentLength: Long = C.LENGTH_UNSET.toLong()
        @Volatile var headers: Map<String, List<String>> = emptyMap()

        fun append(buf: ByteArray, n: Int) = synchronized(lock) {
            // The declared length can be missing or wrong (chunked replies), so the cap is on what really arrives.
            if (size.toLong() + n > MAX_BYTES) throw IOException("segment too large to hold")
            if (size + n > data.size) data = data.copyOf(maxOf(data.size * 2, size + n))
            System.arraycopy(buf, 0, data, size, n)
            size += n
            lock.notifyAll()
        }

        fun finish() = synchronized(lock) { finished = true; lock.notifyAll() }
        fun fail(e: IOException) = synchronized(lock) { failure = e; finished = true; lock.notifyAll() }
        fun hasFailed() = synchronized(lock) { failure != null }
        fun size() = synchronized(lock) { size.toLong() }

        /** Blocks until byte [pos] exists, the download ended, or it failed; copies what is there. -1 at the end. */
        fun read(pos: Int, out: ByteArray, off: Int, len: Int): Int = synchronized(lock) {
            while (pos >= size && !finished) {
                if (cancelled) throw IOException("prefetch cancelled")
                lock.wait(WAIT_MS)
            }
            failure?.let { throw it }
            if (pos >= size) return@synchronized C.RESULT_END_OF_INPUT
            val n = minOf(len, size - pos)
            System.arraycopy(data, pos, out, off, n)
            n
        }

        /** Blocks until the response is known (first bytes or the end), so [contentLength] is set. */
        fun awaitStart() = synchronized(lock) {
            while (size == 0 && !finished) lock.wait(WAIT_MS)
            failure?.let { throw it }
        }
    }

    private val executor: ScheduledExecutorService = Executors.newScheduledThreadPool(
        MAX_DEPTH,
        ThreadFactory { r -> Thread(r, "segment-prefetch").apply { isDaemon = true } },
    )
    private val entries = LinkedHashMap<String, Entry>()
    private var order: List<String> = emptyList()
    private var firstOpenDone = false
    /** The latest segment the player has itself opened (the window slides, so a position would go stale). */
    private var lastOpened: String? = null
    /** Seconds of picture in one segment, from the playlist's own #EXTINF lines. */
    private var segmentSecs = 10.0
    /** What one connection to this panel delivers, bytes per second (smoothed); 0 until a download has finished. */
    private var connectionBps = 0.0
    private var segmentBytes = 0L
    @Volatile private var disabled = false
    private val failures = java.util.concurrent.atomic.AtomicInteger(0)

    /** Forget everything: a new channel (or a reload of this one) starts from nothing. */
    fun reset() {
        synchronized(this) {
            entries.values.forEach { it.cancelled = true }
            entries.clear()
            order = emptyList()
            firstOpenDone = false
            lastOpened = null
            connectionBps = 0.0
            segmentBytes = 0L
            failures.set(0)
            disabled = false
        }
    }

    fun shutdown() {
        reset()
        executor.shutdownNow()
    }

    fun wrap(source: DataSource): DataSource = PrefetchingSource(source)

    internal fun onPlaylist(segments: List<String>) = synchronized(this) {
        order = segments
        val keep = segments.toHashSet()
        val it = entries.entries.iterator()
        while (it.hasNext()) {
            val e = it.next()
            if (e.key !in keep) { e.value.cancelled = true; it.remove() }
        }
    }

    /**
     * How many segments ahead to hold: as many connections as it takes for them together to outrun the picture.
     * Two until a download has finished and told us what one connection delivers; then
     * ceil(segment bytes / (connection speed × segment seconds)), within 2..[MAX_DEPTH].
     */
    private fun depth(): Int = synchronized(this) {
        if (connectionBps <= 0.0 || segmentBytes <= 0L) return@synchronized MIN_DEPTH
        val need = Math.ceil(segmentBytes / (connectionBps * segmentSecs)).toInt()
        need.coerceIn(MIN_DEPTH, MAX_DEPTH)
    }

    private fun measured(bytes: Long, millis: Long) = synchronized(this) {
        if (bytes < MIN_MEASURED_BYTES || millis <= 0L) return@synchronized
        val bps = bytes * 1000.0 / millis
        connectionBps = if (connectionBps <= 0.0) bps else connectionBps * 0.7 + bps * 0.3
        segmentBytes = bytes
    }

    private fun take(uri: String): Entry? = synchronized(this) { entries[uri]?.takeIf { !it.hasFailed() } }

    private fun drop(uri: String, e: Entry) = synchronized(this) { if (entries[uri] === e) entries.remove(uri) }

    /** The player opened [uri]: start the ones after it. The very first open of a tune waits, so the segment the
     *  picture is waiting for is not slowed down by its own followers. */
    private fun opened(uri: String) {
        if (disabled) return
        val delayMs: Long
        synchronized(this) {
            delayMs = if (!firstOpenDone) FIRST_DELAY_MS else 0L
            firstOpenDone = true
            lastOpened = uri
        }
        val start = Runnable {
            val next = synchronized(this) {
                // Only what lies beyond everything the player has already asked for itself: fetching a segment it
                // is downloading right now would just split the panel's bandwidth between two copies of it.
                val at = lastOpened?.let { order.indexOf(it) } ?: -1
                if (at < 0) emptyList() else order.drop(at + 1).take(depth()).filter { it !in entries }
            }
            next.forEach { startEntry(it) }
        }
        if (delayMs == 0L) start.run() else runCatching { executor.schedule(start, delayMs, TimeUnit.MILLISECONDS) }
    }

    private fun startEntry(uri: String) {
        val e = Entry(Uri.parse(uri))
        synchronized(this) {
            if (disabled || uri in entries) return
            entries[uri] = e
        }
        LiveDiagnosticsLog.event("prefetch start host=${e.uri.host}")
        runCatching {
            executor.execute {
                val source = upstream.createDataSource()
                val began = android.os.SystemClock.elapsedRealtime()
                try {
                    val length = source.open(DataSpec(e.uri))
                    e.contentLength = length
                    e.headers = source.responseHeaders
                    if (length > MAX_BYTES) throw IOException("segment too large to hold")
                    val buf = ByteArray(CHUNK)
                    while (!e.cancelled) {
                        val n = source.read(buf, 0, buf.size)
                        if (n == C.RESULT_END_OF_INPUT) break
                        e.append(buf, n)
                    }
                    if (e.cancelled) e.fail(IOException("prefetch cancelled")) else {
                        e.finish()
                        measured(e.size(), android.os.SystemClock.elapsedRealtime() - began)
                    }
                } catch (t: Throwable) {
                    e.fail(if (t is IOException) t else IOException(t))
                    // A panel that answers a second connection with an error is telling us to stop doing that.
                    if (!e.cancelled && failures.incrementAndGet() >= MAX_FAILURES) disabled = true
                    drop(e.uri.toString(), e)
                } finally {
                    runCatching { source.close() }
                }
            }
        }.onFailure { drop(uri, e) }
    }

    private inner class PrefetchingSource(private val direct: DataSource) : DataSource {
        private var cached: Entry? = null
        private var cachedUri: String? = null
        private var cachedPos = 0
        private var spec: DataSpec? = null
        private var playlist: java.io.ByteArrayOutputStream? = null
        private var playlistUrl: String? = null
        private val listeners = ArrayList<TransferListener>()

        override fun addTransferListener(listener: TransferListener) {
            listeners += listener
            direct.addTransferListener(listener)
        }

        override fun open(dataSpec: DataSpec): Long {
            spec = dataSpec
            val key = dataSpec.uri.toString()
            val whole = dataSpec.position == 0L && dataSpec.length == C.LENGTH_UNSET.toLong()
            val hit = if (whole && !disabled) take(key) else null
            if (hit != null) {
                try {
                    hit.awaitStart()
                } catch (e: IOException) {
                    drop(key, hit)
                    return openDirect(dataSpec, key)
                }
                cached = hit; cachedUri = key; cachedPos = 0
                LiveDiagnosticsLog.event("prefetch hit ${hit.contentLength}B host=${hit.uri.host}")
                opened(key)
                return hit.contentLength
            }
            return openDirect(dataSpec, key)
        }

        private fun openDirect(dataSpec: DataSpec, key: String): Long {
            val length = direct.open(dataSpec)
            val type = direct.responseHeaders.entries
                .firstOrNull { it.key.equals("Content-Type", ignoreCase = true) }?.value?.firstOrNull().orEmpty()
            val path = dataSpec.uri.path.orEmpty()
            if (path.endsWith(".m3u8", ignoreCase = true) || type.contains("mpegurl", ignoreCase = true)) {
                playlist = java.io.ByteArrayOutputStream(); playlistUrl = key
            } else if (dataSpec.position == 0L) {
                opened(key)
            }
            return length
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            val c = cached
            if (c != null) {
                val n = c.read(cachedPos, buffer, offset, length)
                if (n > 0) cachedPos += n
                return n
            }
            val n = direct.read(buffer, offset, length)
            val pl = playlist
            if (pl != null) {
                if (n > 0) {
                    if (pl.size() + n <= MAX_PLAYLIST_BYTES) pl.write(buffer, offset, n) else playlist = null
                } else if (n == C.RESULT_END_OF_INPUT) {
                    publishPlaylist()
                }
            }
            return n
        }

        private fun publishPlaylist() {
            // Not toString(Charset): that overload is Java 10+ and crashes Android 9–11 televisions.
            val text = playlist?.let { String(it.toByteArray(), Charsets.UTF_8) } ?: return
            val base = playlistUrl ?: return
            playlist = null
            HlsSegmentList.parse(text, base)?.let { onPlaylist(it); HlsSegmentList.averageSecs(text)?.let { d -> synchronized(this@SegmentPrefetcher) { segmentSecs = d } } }
        }

        override fun getUri(): Uri? = cached?.uri ?: direct.uri

        override fun getResponseHeaders(): Map<String, List<String>> = cached?.headers ?: direct.responseHeaders

        override fun close() {
            val c = cached
            if (c != null) {
                c.cancelled = true
                drop(cachedUri.orEmpty(), c)
                cached = null
            } else {
                direct.close()
            }
            playlist = null
        }
    }

    companion object {
        /** Segments fetched ahead of the one being played: at least two (they triple a throttled panel's speed). */
        const val MIN_DEPTH = 2
        const val MAX_DEPTH = 5
        private const val MIN_MEASURED_BYTES = 256L * 1024
        private const val FIRST_DELAY_MS = 2_000L
        private const val INITIAL_BYTES = 256 * 1024
        private const val CHUNK = 64 * 1024
        private const val MAX_BYTES = 24L * 1024 * 1024
        private const val MAX_PLAYLIST_BYTES = 512 * 1024
        private const val WAIT_MS = 250L
        private const val MAX_FAILURES = 3
    }
}

/** The segment URLs of a live HLS media playlist, in order; null for anything the prefetcher should leave alone. */
internal object HlsSegmentList {
    fun parse(text: String, playlistUrl: String): List<String>? {
        if (!text.startsWith("#EXTM3U")) return null
        // A master playlist lists renditions, not segments; byte ranges and init sections need the plain path.
        if (text.contains("#EXT-X-STREAM-INF") || text.contains("#EXT-X-BYTERANGE") || text.contains("#EXT-X-MAP")) return null
        if (!text.contains("#EXTINF")) return null
        val base = runCatching { java.net.URI(playlistUrl) }.getOrNull() ?: return null
        val out = ArrayList<String>()
        for (raw in text.lineSequence()) {
            val line = raw.trim()
            if (line.isEmpty() || line.startsWith("#")) continue
            val resolved = runCatching { base.resolve(line).toString() }.getOrNull() ?: continue
            out += resolved
        }
        return out.takeIf { it.isNotEmpty() }
    }

    /** Mean #EXTINF duration of the playlist, seconds; null when it has none. */
    fun averageSecs(text: String): Double? {
        val d = text.lineSequence().filter { it.startsWith("#EXTINF:") }
            .mapNotNull { it.removePrefix("#EXTINF:").substringBefore(',').trim().toDoubleOrNull() }.toList()
        return d.takeIf { it.isNotEmpty() }?.average()?.takeIf { it > 0.5 }
    }
}
