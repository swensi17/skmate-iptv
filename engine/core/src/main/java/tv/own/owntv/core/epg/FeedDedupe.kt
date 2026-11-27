package tv.own.owntv.core.epg

/**
 * Drops the second copy of a programme inside one feed, while it is being read.
 *
 * Feeds list some channels twice under ids that differ only by case ("SkyCinemaClassics.de" and
 * "skycinemaclassics.de"), with the same films a minute or two apart. Ids are stored lowercased, so
 * both copies landed on one guide row. They used to be written and then collapsed after the sync —
 * and because the collapsed copy was missing next time, it was written again, every sync, for ever.
 *
 * Same test as [EpgDedupe]: same title and overlapping time. The first copy the feed lists wins, so
 * the kept row is the same on every sync and nothing churns.
 *
 * Kept small: a sync of a large guide passes hundreds of thousands of programmes through here, on boxes with
 * a 192 MB heap. Each one costs three primitive slots (start, stop and a 64-bit hash of the title), about
 * 24 bytes, instead of an object holding the title itself — that alone ran the heap out on a first sync.
 */
class FeedDedupe {
    /** One channel's accepted programmes as parallel arrays, grown as needed. */
    private class Slots {
        var starts = LongArray(INITIAL)
        var stops = LongArray(INITIAL)
        var titles = LongArray(INITIAL)
        var size = 0

        fun add(start: Long, stop: Long, title: Long) {
            if (size == starts.size) {
                starts = starts.copyOf(size * 2)
                stops = stops.copyOf(size * 2)
                titles = titles.copyOf(size * 2)
            }
            starts[size] = start
            stops[size] = stop
            titles[size] = title
            size++
        }
    }

    private val byChannel = HashMap<String, Slots>()

    /** True when this programme is new for [channelKey]; false for a copy of one already accepted. */
    fun accept(channelKey: String, startMs: Long, stopMs: Long, title: String): Boolean {
        val slots = byChannel.getOrPut(channelKey) { Slots() }
        val key = titleHash(title)
        for (i in 0 until slots.size) {
            if (slots.titles[i] == key && slots.starts[i] < stopMs && startMs < slots.stops[i]) return false
        }
        slots.add(startMs, stopMs, key)
        return true
    }

    private companion object {
        const val INITIAL = 32
        private const val FNV_OFFSET = -0x340d631b7bdddcdbL
        private const val FNV_PRIME = 0x100000001b3L

        /** FNV-1a over the title's characters: 64 bits, so two different titles practically never collide. */
        fun titleHash(title: String): Long {
            var h = FNV_OFFSET
            for (c in title) {
                h = h xor c.code.toLong()
                h *= FNV_PRIME
            }
            return h
        }
    }
}
