package om.serva.station

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * A café loses power more often than it loses a tablet. Without this, the printer comes back
 * and the station does not, and nobody notices until the first ticket goes missing.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val relevant = intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        if (relevant && Prefs(context).configured) StationService.start(context)
    }
}
