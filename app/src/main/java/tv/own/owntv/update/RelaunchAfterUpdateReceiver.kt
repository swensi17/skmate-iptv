package tv.own.owntv.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Opens the app again once its own update has gone in. Installing a new version closes the old one, and
 * the viewer was left on the TV's home screen; worse, opening it straight away on a slow TV could still
 * start the old build. Only an update started from inside the app (see UpdateManager's mark) relaunches.
 */
class RelaunchAfterUpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val ours = intent.action == Intent.ACTION_MY_PACKAGE_REPLACED &&
            tv.own.owntv.core.update.UpdateManager.consumeRelaunchMark(context)
        if (!ours) return
        // Android 10 and later refuse an activity start from here unless the app is on screen; the attempt is
        // harmless there, and on older TVs it brings the new version up by itself.
        val launch = context.packageManager.getLeanbackLaunchIntentForPackage(context.packageName)
            ?: context.packageManager.getLaunchIntentForPackage(context.packageName)
        launch?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        launch?.let { runCatching { context.startActivity(it) } }
    }
}
