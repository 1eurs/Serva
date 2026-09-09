package om.serva.station

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * A café loses power more often than it loses a tablet. Without this, the printer comes back
 * and the station does not, and nobody notices until the first ticket goes missing.
 *
 * Several actions because manufacturers do not agree on what "the tablet just came on" is
 * called: stock Android fires BOOT_COMPLETED, Xiaomi/HTC fire QUICKBOOT_POWERON, and a
 * lock-screen delay is USER_UNLOCKED. The keepalive action is our own alarm, a backstop
 * for the OEMs that kill the service overnight anyway.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val relevant = action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == Intent.ACTION_USER_UNLOCKED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON" ||
            action == KeepAlive.ACTION
        val prefs = Prefs(context)
        if (!relevant || !prefs.configured || prefs.paused) return
        try {
            StationService.start(context)
        } catch (_: Exception) {
            // Android 12+ can refuse a foreground start from an idle alarm. The next boot
            // or the next time someone opens the app is then the path back.
        }
        KeepAlive.arm(context)
    }
}
