package tv.own.owntv.core.settings

/**
 * The player clock's look. Each field is an index into its list of choices:
 * size small / medium / large, weight regular / bold, background none / dark / light / blue,
 * colour white / yellow / light blue (on the light background the digits are always dark).
 */
data class ClockStyle(val size: Int, val weight: Int, val background: Int, val color: Int) {
    companion object {
        val DEFAULT = ClockStyle(size = 1, weight = 1, background = 1, color = 0)
        const val SIZES = 3
        const val WEIGHTS = 2
        const val BACKGROUNDS = 4
        const val COLORS = 3
        const val BG_LIGHT = 2
    }
}
