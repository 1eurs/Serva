package om.serva.station

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.net.Inet4Address
import kotlin.coroutines.resume

/**
 * Asking the network what printers it has, instead of guessing addresses one at a time.
 *
 * The sweep in [PrinterScanner] can only try addresses on the subnets this tablet is itself on
 * — that is what an address sweep IS. So the café whose printer still carries a static address
 * from wherever it was installed before, sitting on the same switch but in a different range,
 * gets "no printer found" no matter how long it waits. That is a real morning, and it ends in
 * a phone call to somebody who owns a laptop.
 *
 * mDNS does not have that problem. It is multicast on the local LINK, so a printer answers
 * whatever subnet its address happens to belong to. Android's own NsdManager speaks it, which
 * also means no multicast lock and no extra permission.
 *
 * It is not a replacement for the sweep: plenty of cheap printers advertise nothing at all.
 * The two are complementary and both run.
 */
object PrinterDiscovery {

    /**
     * `_pdl-datastream` IS raw port 9100 — the thing this app prints to. The other two are
     * worth listening for anyway: a printer that advertises only IPP or LPD nearly always has
     * 9100 open too, and its ADDRESS is the part that cannot be guessed.
     *
     * NsdManager only likes one discoverServices at a time on many Android builds, so these
     * run sequentially. Windows add up to ~3s; we stop after pdl-datastream if it already
     * yielded hosts, because those are the real raw-9100 printers.
     */
    private val SERVICE_TYPES = listOf(
        "_pdl-datastream._tcp." to 1_200L,
        "_printer._tcp." to 900L,
        "_ipp._tcp." to 900L,
    )

    private const val RESOLVE_MS = 3_000L

    /** Resolving more than one service at a time fails outright on older Android. */
    private val resolving = Mutex()

    /**
     * Addresses that answered an mDNS query, with the port each advertised.
     */
    suspend fun find(context: Context): List<Pair<String, Int>> {
        val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return emptyList()
        val services = mutableListOf<NsdServiceInfo>()
        for ((type, listenMs) in SERVICE_TYPES) {
            val found = runCatching { discover(nsd, type, listenMs) }.getOrDefault(emptyList())
            services += found
            if (type == "_pdl-datastream._tcp." && found.isNotEmpty()) break
        }
        val out = LinkedHashMap<String, Int>()
        // One resolve at a time — see [resolving]. If the timeout fires we cannot unregister
        // the listener, so the mutex stays held for the whole wait and the next resolve
        // cannot start until this one has finished timing out.
        for (service in services) {
            val resolved = resolve(nsd, service) ?: continue
            @Suppress("DEPRECATION") val address = resolved.host
            if (address !is Inet4Address) continue          // a station prints over IPv4
            val host = address.hostAddress ?: continue
            // First answer wins: the types are listed most-useful first, so a printer that
            // advertises both raw and IPP is remembered by its raw port.
            out.putIfAbsent(host, resolved.port)
        }
        android.util.Log.i("PrinterDiscovery", "mDNS offered ${out.size}: $out")
        return out.toList()
    }

    /**
     * Listen for a fixed window and take what turned up.
     *
     * Deliberately not "wait until we have one": mDNS has no idea how many printers exist, so
     * there is nothing to wait for. A second or so is long enough for a printer on the same
     * link; the three types together stay around three seconds.
     */
    private suspend fun discover(nsd: NsdManager, type: String, listenMs: Long): List<NsdServiceInfo> {
        val seen = mutableListOf<NsdServiceInfo>()
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String?) {}
            override fun onServiceFound(info: NsdServiceInfo) { synchronized(seen) { seen += info } }
            override fun onServiceLost(info: NsdServiceInfo?) {}
            override fun onDiscoveryStopped(serviceType: String?) {}
            override fun onStartDiscoveryFailed(serviceType: String?, errorCode: Int) {}
            override fun onStopDiscoveryFailed(serviceType: String?, errorCode: Int) {}
        }
        return try {
            nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, listener)
            delay(listenMs)
            synchronized(seen) { seen.toList() }
        } catch (e: Exception) {
            // A device with the mDNS daemon disabled must cost the sweep nothing.
            android.util.Log.w("PrinterDiscovery", "discovery failed for $type", e)
            emptyList()
        } finally {
            runCatching { nsd.stopServiceDiscovery(listener) }
        }
    }

    private suspend fun resolve(nsd: NsdManager, service: NsdServiceInfo): NsdServiceInfo? =
        resolving.withLock {
            withTimeoutOrNull(RESOLVE_MS) {
                suspendCancellableCoroutine { cont ->
                    @Suppress("DEPRECATION")
                    nsd.resolveService(service, object : NsdManager.ResolveListener {
                        override fun onResolveFailed(info: NsdServiceInfo?, errorCode: Int) {
                            if (cont.isActive) cont.resume(null)
                        }
                        override fun onServiceResolved(info: NsdServiceInfo) {
                            if (cont.isActive) cont.resume(info)
                        }
                    })
                }
            }
        }
}
