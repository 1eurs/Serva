package om.serva.station

import android.content.Context
import java.util.UUID

/**
 * What this tablet is. Set once at the counter and then never touched again — which is the
 * point of the app: everything that used to be a per-session choice in a browser tab is a
 * property of the device here.
 */
class Prefs(context: Context) {
    private val p = context.getSharedPreferences("serva-station", Context.MODE_PRIVATE)

    companion object {
        const val TRANSPORT_LAN = "lan"
        const val TRANSPORT_BLUETOOTH = "bluetooth"
    }

    var apiBase: String
        get() = p.getString("apiBase", "https://serva.om")!!.trimEnd('/')
        set(v) = p.edit().putString("apiBase", v.trimEnd('/')).apply()

    var username: String
        get() = p.getString("username", "")!!
        set(v) = p.edit().putString("username", v).apply()

    var password: String
        get() = p.getString("password", "")!!
        set(v) = p.edit().putString("password", v).apply()

    var branchId: Long
        get() = p.getLong("branchId", 0L)
        set(v) = p.edit().putLong("branchId", v).apply()

    /** Shown on the status screen, so the café never has to recognise a branch by its number. */
    var branchName: String
        get() = p.getString("branchName", "")!!
        set(v) = p.edit().putString("branchName", v).apply()

    var restaurantId: Long
        get() = p.getLong("restaurantId", 0L)
        set(v) = p.edit().putLong("restaurantId", v).apply()

    /**
     * How the printer is attached: [TRANSPORT_LAN] or [TRANSPORT_BLUETOOTH].
     *
     * Defaults to the network, which is the right answer for a printer that sits on a counter
     * and never moves — and keeps every station set up before Bluetooth existed working
     * untouched, since a stored config has no transport recorded at all.
     */
    var printerTransport: String
        get() = p.getString("printerTransport", TRANSPORT_LAN)!!
        set(v) = p.edit().putString("printerTransport", v).apply()

    var printerHost: String
        get() = p.getString("printerHost", "")!!
        set(v) = p.edit().putString("printerHost", v.trim()).apply()

    var printerPort: Int
        get() = p.getInt("printerPort", 9100)
        set(v) = p.edit().putInt("printerPort", v).apply()

    /** The paired printer's MAC address, when this station prints over Bluetooth. */
    var printerBtAddress: String
        get() = p.getString("printerBtAddress", "")!!
        set(v) = p.edit().putString("printerBtAddress", v.trim()).apply()

    /** Its Bluetooth name — the only part of it a café would recognise. */
    var printerBtName: String
        get() = p.getString("printerBtName", "")!!
        set(v) = p.edit().putString("printerBtName", v).apply()

    /** What to call this station's printer on screen and on the test slip. */
    val printerLabel: String
        get() = if (printerTransport == TRANSPORT_BLUETOOTH) printerBtName.ifBlank { printerBtAddress }
                else printerHost

    /** 80 or 58. Decides the raster width the renderer produces. */
    var paperWidth: Int
        get() = p.getInt("paperWidth", 80)
        set(v) = p.edit().putInt("paperWidth", if (v == 58) 58 else 80).apply()

    /**
     * Identifies this device to the server, which claims each job for one station id at a
     * time. Minted once and kept: a station that changed its name on every start would let
     * a job it was already printing be handed to "another" station and print twice.
     */
    val stationId: String
        get() = p.getString("stationId", null) ?: ("android-" + UUID.randomUUID().toString().take(12))
            .also { p.edit().putString("stationId", it).apply() }

    val configured: Boolean
        get() = username.isNotBlank() && branchId > 0 &&
            (if (printerTransport == TRANSPORT_BLUETOOTH) printerBtAddress.isNotBlank() else printerHost.isNotBlank())

    /**
     * Jobs the printer took that the server has not yet confirmed. Written before the ack
     * leaves, cleared when it lands. A restart in that gap — a crash, a reboot, an update —
     * would otherwise forget them and print the same ticket again.
     */
    var unackedJobs: Set<Long>
        get() = p.getStringSet("unacked", emptySet())!!.mapNotNull { it.toLongOrNull() }.toSet()
        set(v) = p.edit().putStringSet("unacked", v.map { it.toString() }.toSet()).apply()

    /** Last outcome, for the status screen — the app is unattended, so it has to keep a record. */
    var lastStatus: String
        get() = p.getString("lastStatus", "Not started")!!
        set(v) = p.edit().putString("lastStatus", v).apply()
}
