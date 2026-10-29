package tv.own.owntv.ui.theme

import android.app.ActivityManager
import android.content.Context

/**
 * How much picture the device can afford. Weak TVs (a gigabyte or two of memory, a small GPU) cannot redraw
 * a full 1080p frame with soft shadows and gradients thirty times a second, and the menus then stutter.
 * On them [lite] is on: the big blurred shadows and background glows are not drawn and the open menu lies
 * over the screen instead of pushing all of it aside. Decided once, at start.
 */
object DevicePerf {
    /** Below this much memory the TV is treated as weak. */
    private const val WeakMemoryBytes = 3L * 1024 * 1024 * 1024

    @Volatile
    var lite: Boolean = false
        private set

    fun init(context: Context) {
        val am = context.getSystemService(ActivityManager::class.java) ?: return
        val info = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        lite = am.isLowRamDevice || info.totalMem < WeakMemoryBytes
    }
}
