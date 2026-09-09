package om.serva.station

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock

/**
 * A backstop for the phone maker, not for Android's own rules.
 *
 * The station is a foreground service with a CPU wake lock and a Wi-Fi lock. That is enough
 * on a Pixel. Xiaomi, Huawei, Oppo and friends still kill background apps, and they do it
 * without telling anyone. This alarm asks to be brought back every ten minutes. On a tablet
 * that was never killed it is a no-op. On one that was, tickets wait at most ten minutes
 * instead of until someone opens the app.
 *
 * Starting a foreground service from an alarm is refused on some Android 12+ builds; the
 * receiver swallows that. Boot, unlock, and swipe-away are the paths that always work.
 */
object KeepAlive {

    const val ACTION = "om.serva.station.KEEPALIVE"
    private const val INTERVAL_MS = 10 * 60_000L
    private const val REQ = 7

    fun arm(context: Context) {
        val app = context.applicationContext
        val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val at = SystemClock.elapsedRealtime() + INTERVAL_MS
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending(app))
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending(app))
            }
        } catch (_: Exception) {
            // An OEM that refuses alarms still has the foreground service. Fail quiet.
        }
    }

    fun disarm(context: Context) {
        val app = context.applicationContext
        runCatching {
            (app.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pending(app))
        }
    }

    private fun pending(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context, REQ,
            Intent(context, BootReceiver::class.java).setAction(ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}
