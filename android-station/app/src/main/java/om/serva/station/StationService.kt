package om.serva.station

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * The print station.
 *
 * This is the whole reason the app exists. The browser station it replaces stopped the moment
 * the tablet slept, Chrome was killed, or a staff member navigated away — and it failed
 * silently, which is the worst way for a printer to fail. A foreground service does not stop
 * for any of those, restarts itself after a power cut, and carries a notification the café can
 * see.
 *
 * The loop is deliberately dull: pull, render, print, acknowledge. Nothing is remembered
 * between passes except which jobs printed but were not yet acknowledged, because the server
 * is the thing that remembers. A job stays pending until this app says otherwise, so a crash
 * anywhere in the loop costs a duplicate at worst and never a lost ticket.
 */
class StationService : Service() {

    companion object {
        private const val TAG = "StationService"
        private const val CHANNEL = "serva-station"
        private const val NOTIFICATION_ID = 1
        private const val POLL_MS = 5_000L

        fun start(context: Context) {
            val intent = Intent(context, StationService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }
        fun stop(context: Context) = context.stopService(Intent(context, StationService::class.java))
    }

    private val supervisor = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + supervisor)
    private var loop: Job? = null
    private lateinit var prefs: Prefs
    private lateinit var api: Api
    private var renderer: Renderer? = null
    private var wakeLock: PowerManager.WakeLock? = null

    /** Whatever this station prints through — a network socket or a Bluetooth link. */
    private val printer: PrinterLink? get() = prefs.printerLink(this)

    /** Worded for the transport, because "check it is on the WiFi" is useless advice to a
     *  café whose printer is not on the WiFi. */
    private fun notAnswering(): String =
        if (prefs.printerTransport == Prefs.TRANSPORT_BLUETOOTH)
            "Printer ${prefs.printerLabel} is not answering — check it is switched on and in range"
        else
            "Printer not answering at ${prefs.printerLabel} — check it is on and on the WiFi"

    /** Printed, but the acknowledgement never landed. Retried, never reprinted — and kept on
     *  disk, so a restart in the gap does not print the ticket a second time. */
    private val printedAwaitingAck: MutableSet<Long> by lazy { prefs.unackedJobs.toMutableSet() }
    private fun rememberUnacked() { prefs.unackedJobs = printedAwaitingAck }

    /** Renders that failed in a row. Three means the page is wedged, not the ticket. */
    private var renderFailures = 0
    private val RENDER_FAILURES_BEFORE_RESTART = 3

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        api = Api(prefs)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Never let this throw. A café's printer going quiet is bad; an app that crash-loops
        // every few seconds on the counter is worse, and Android's rules about which service
        // types need which permissions have changed in three of the last four releases.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification(prefs.lastStatus),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(NOTIFICATION_ID, notification(prefs.lastStatus))
            }
        } catch (e: Exception) {
            Log.e(TAG, "could not go foreground", e)
            prefs.lastStatus = "Android would not let the station run in the background: ${e.message}"
            stopSelf()
            return START_NOT_STICKY
        }
        if (!prefs.configured) {
            update("Not set up yet — open Serva Station")
            return START_STICKY
        }
        // A partial wake lock keeps the CPU alive with the screen off. The tablet is on a
        // charger at the counter; this is what lets the screen go dark and still print.
        if (wakeLock == null) {
            wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "serva:station")
                .also { it.setReferenceCounted(false); it.acquire() }
        }
        if (loop?.isActive != true) loop = scope.launch { run() }
        // START_STICKY: if Android reclaims the process, bring it back.
        return START_STICKY
    }

    private suspend fun run() {
        val r = Renderer(applicationContext, prefs)
        renderer = r
        if (!r.start()) {
            update("Could not load the receipt renderer — check the internet connection")
            delay(15_000)
            if (scope.isActive) StationService.start(this)   // try the whole thing again
            return
        }
        // Say something true about the printer before the first ticket needs it, so the
        // status screen answers "is it going to work?" and not just "did it work?".
        val printerUp = runCatching { printer?.probe() ?: false }.getOrDefault(false)
        update(if (printerUp) "Collecting for ${prefs.branchName.ifBlank { "branch ${prefs.branchId}" }}"
               else "Printer ${prefs.printerLabel} is not answering — collecting anyway, will print when it is back")
        while (scope.isActive) {
            runCatching { tick() }.onFailure { update("Offline: ${it.message ?: "unknown error"}") }
            delay(POLL_MS)
        }
    }

    /** The renderer's page was killed or is wedged: rebuild it rather than fail every ticket. */
    private fun healRenderer() {
        val r = renderer ?: return
        update("Restarting the receipt renderer")
        if (r.restart()) { renderFailures = 0; update("Collecting again") }
    }

    private fun tick() {
        val jobs = api.pull()
        if (jobs.length() == 0) return
        for (i in 0 until jobs.length()) {
            val job = jobs.getJSONObject(i)
            val id = job.getLong("id")

            // Printed on an earlier pass and the ack was lost: retry that alone.
            if (printedAwaitingAck.contains(id)) {
                runCatching { api.ack(id) }.onSuccess { printedAwaitingAck.remove(id); rememberUnacked() }
                continue
            }

            val r = renderer
            if (r == null || r.gone) { healRenderer(); continue }
            val bytes = try {
                r.render(job).also { renderFailures = 0 }
            } catch (e: Exception) {
                Log.w(TAG, "render failed for job $id", e)
                update("Could not draw ticket #${ticketNumber(job)}: ${e.message}")
                if (++renderFailures >= RENDER_FAILURES_BEFORE_RESTART) healRenderer()
                continue  // not acknowledged, so the server offers it again
            }

            try {
                val link = printer ?: throw IllegalStateException("No printer is set up on this device")
                link.send(bytes)
                printedAwaitingAck.add(id)
                rememberUnacked()   // on disk before the ack leaves
                update("Printed #${ticketNumber(job)}")
            } catch (e: Exception) {
                Log.w(TAG, "printer refused job $id", e)
                // send() now fails loudly on an empty roll, which used to look like success.
                val why = e.message?.takeIf { it.startsWith("Printer is") }
                update(why ?: notAnswering())
                continue
            }

            runCatching { api.ack(id) }.onSuccess { printedAwaitingAck.remove(id); rememberUnacked() }
        }
    }

    private fun ticketNumber(job: JSONObject): String =
        job.optJSONObject("order")?.optInt("dailyNumber")?.toString() ?: "?"

    private fun update(status: String) {
        prefs.lastStatus = status
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID, notification(status))
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW)
        channel.setShowBadge(false)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }

    private fun notification(status: String): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
        return builder
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(status)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    override fun onDestroy() {
        loop?.cancel()
        scope.cancel()
        renderer?.stop()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }
}
