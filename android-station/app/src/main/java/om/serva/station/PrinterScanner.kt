package om.serva.station

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.InterfaceAddress
import java.net.NetworkInterface
import java.net.Socket

/**
 * Finds the printer, so nobody has to type an IP address.
 *
 * Asking a café owner for the printer's address is the hardest thing in the whole setup: it
 * means power-cycling the printer while holding FEED, reading a self-test slip, and typing
 * four numbers correctly. Almost every support call about printing starts there.
 *
 * There is no need for any of it. A thermal printer on the café's WiFi is a device with a
 * print port open, and nothing else in a café listens on one. So the app sweeps its own
 * network and offers what it finds — then ASKS each hit whether it is really a printer,
 * using ESC/POS's own status channel, so an open port is a candidate and an answer is proof.
 */
object PrinterScanner {

    /** The port every network thermal printer speaks raw ESC/POS on. */
    private const val PRINTER_PORT = 9100

    /**
     * Frozen contract for the setup screen: tap Cancel during a sweep, and the next batch
     * returns whatever has been found so far. [beginScan] clears the flag at the start of
     * [scan] / [scanWider].
     */
    @Volatile var cancelled: Boolean = false
        private set
    fun cancel() { cancelled = true }
    internal fun beginScan() { cancelled = false }

    /**
     * Tried only when the usual port finds nothing, because each extra port costs another
     * full sweep. 9101/9102 are the second and third heads on multi-port models; 515 is LPD,
     * which a few older units still expose instead.
     */
    private val FALLBACK_PORTS = listOf(9101, 9102, 515)

    /**
     * A dead address does not refuse a connection, it goes unanswered — on a café LAN there
     * is nothing to send back an RST, so every one of the ~250 misses costs the full timeout.
     * Sweep time is roughly (hosts / PARALLEL) x TIMEOUT.
     *
     * Deliberately gentler than it could be: at 48 sockets in flight the sweep saturated a
     * NAT under test and found nothing at all, and a cheap router with a small connection
     * table would do the same in a café. A scan that silently finds nothing is worse than one
     * that takes a few seconds.
     */
    private const val CONNECT_TIMEOUT_MS = 800
    private const val PARALLEL = 24

    /** Never sweep wider than a /24. A /16 is 65,000 addresses and hours of timeouts. */
    private const val WIDEST_PREFIX = 24

    /** Ports an mDNS answer can be taken at face value on; anything else, try 9100 at that host. */
    private val RAW_PORTS = setOf(PRINTER_PORT, 9101, 9102, 515)

    /**
     * Where a hand-configured printer actually ends up, in rough order of likelihood. Not a
     * scan of "the private space" — that is 17 million addresses — just the handful of /24s
     * that routers and installers really use.
     */
    private val COMMON_SUBNETS = listOf("192.168.0", "192.168.1", "192.168.2", "10.0.0", "10.0.1", "172.16.0")

    data class Found(
        val host: String,
        val port: Int = PRINTER_PORT,
        /** It answered an ESC/POS status query: a printer, not merely an open port. */
        val confirmed: Boolean = false,
        val paperOut: Boolean = false,
        /**
         * Whether this tablet can actually open a socket to it.
         *
         * False means the address is real and answered something, but sits on a subnet this
         * tablet holds no address on — so every connection to it goes to the default gateway
         * and is dropped. The café cannot print to it until one of the two is re-addressed,
         * and saying THAT is worth far more than another "nothing found".
         */
        val routable: Boolean = true,
    )

    /** The subnets this tablet is on, as a café would read them: "192.168.100.x". */
    fun localSubnetLabels(): List<String> = interfaceAddresses().mapNotNull { addr ->
        val ip = addr.address.hostAddress ?: return@mapNotNull null
        val octets = ip.split('.')
        if (octets.size != 4) null else "${octets[0]}.${octets[1]}.${octets[2]}.x"
    }.distinct()

    /**
     * Is this address one this tablet could reach directly?
     *
     * Pure subnet arithmetic against every interface, which is exactly the test the OS itself
     * applies before deciding to ARP for a host rather than hand it to the gateway. A café
     * typing the address off a FEED slip is the moment this question gets asked, and the app
     * has always known the answer — it just never used it.
     */
    fun onLocalSubnet(host: String): Boolean {
        val target = host.split('.').mapNotNull { it.toIntOrNull() }
        if (target.size != 4 || target.any { it !in 0..255 }) return true   // not an IPv4 literal; let the socket decide
        val value = target.fold(0L) { acc, o -> (acc shl 8) or o.toLong() }
        return interfaceAddresses().any { addr ->
            val ip = addr.address.hostAddress?.split('.')?.mapNotNull { it.toIntOrNull() } ?: return@any false
            if (ip.size != 4) return@any false
            val prefix = addr.networkPrefixLength.toInt().coerceIn(1, 32)
            val mask = if (prefix == 32) 0xFFFFFFFFL else (0xFFFFFFFFL shl (32 - prefix)) and 0xFFFFFFFFL
            val mineValue = ip.fold(0L) { acc, o -> (acc shl 8) or o.toLong() }
            (mineValue and mask) == (value and mask)
        }
    }

    /** This device's own IPv4 on the local network, or null when there is no WiFi. */
    fun localAddress(): String? = interfaceAddresses().firstOrNull()?.address?.hostAddress

    /**
     * Every site-local IPv4 this device holds — not just the first.
     *
     * A tablet can easily have more than one: WiFi and Ethernet on a dock, a VPN, a tethered
     * connection. Picking the first one and sweeping its subnet is how you scan the wrong
     * network and report "no printer found" on a café where the printer is plainly there.
     */
    private fun interfaceAddresses(): List<InterfaceAddress> = runCatching {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.interfaceAddresses }
            .filter { it.address is Inet4Address && it.address.isSiteLocalAddress }
    }.getOrDefault(emptyList())

    /** The addresses to try on one interface, from its REAL netmask rather than an assumed /24. */
    private fun hostsFor(addr: InterfaceAddress): List<String> {
        val ip = addr.address.hostAddress ?: return emptyList()
        val octets = ip.split('.').mapNotNull { it.toIntOrNull() }
        if (octets.size != 4) return emptyList()
        val prefix = addr.networkPrefixLength.toInt().coerceIn(1, 32).coerceAtLeast(WIDEST_PREFIX)
        val value = octets.fold(0L) { acc, o -> (acc shl 8) or o.toLong() }
        val mask = if (prefix == 32) 0xFFFFFFFFL else (0xFFFFFFFFL shl (32 - prefix)) and 0xFFFFFFFFL
        val network = value and mask
        val broadcast = network or (mask.inv() and 0xFFFFFFFFL)
        if (broadcast - network < 2) return emptyList()
        return ((network + 1) until broadcast).map { n ->
            "${(n shr 24) and 0xFF}.${(n shr 16) and 0xFF}.${(n shr 8) and 0xFF}.${n and 0xFF}"
        }
    }

    /**
     * Sweeps every network this device is on. Reports what answered on the print port, and
     * confirms which of those are really printers.
     */
    suspend fun scan(context: Context, onProgress: (Int, Int) -> Unit = { _, _ -> }): List<Found> =
        withContext(Dispatchers.IO) {
            beginScan()
            // Ask the network before interrogating it address by address. mDNS answers in
            // seconds and — the part the sweep can never do — finds a printer whose address is
            // on a subnet this tablet is not on at all.
            val announced = runCatching { PrinterDiscovery.find(context) }.getOrDefault(emptyList())
                .map { (host, port) -> Found(host, if (port in RAW_PORTS) port else PRINTER_PORT) }

            val mine = interfaceAddresses()
            val self = mine.mapNotNull { it.address.hostAddress }.toSet()
            val hosts = mine.flatMap { hostsFor(it) }.distinct().filter { it !in self }

            var hits = if (hosts.isEmpty()) emptyList() else sweep(hosts, PRINTER_PORT, 0, hosts.size, onProgress)
            if (hits.isEmpty() && announced.isEmpty() && hosts.isNotEmpty()) {
                // Nothing on the usual port and nothing announced itself. Widen rather than
                // tell a café with a printer sitting right there that it does not exist.
                val total = hosts.size * (1 + FALLBACK_PORTS.size)
                var done = hosts.size
                for (port in FALLBACK_PORTS) {
                    hits = hits + sweep(hosts, port, done, total, onProgress)
                    done += hosts.size
                    if (hits.isNotEmpty()) break
                }
            }

            val found = confirm(announced + hits)
            android.util.Log.i("PrinterScanner",
                "swept ${hosts.size} address(es) across ${mine.size} interface(s), " +
                    "${announced.size} announced by mDNS, found ${found.size}: $found")
            found
        }

    /**
     * The last resort for a printer on a subnet of its own: try the addresses a router hands
     * out when somebody has configured one by hand, whether or not this tablet is on them.
     *
     * Only worth offering after a normal search has failed — it is minutes rather than
     * seconds, and every address that is not there costs the full timeout. It only finds
     * anything if the café's router will actually route between the two ranges; when it will
     * not, nothing an app does can help, and the honest answer is that the printer and the
     * tablet have to be on the same network.
     */
    suspend fun scanWider(onProgress: (Int, Int) -> Unit = { _, _ -> }): List<Found> =
        withContext(Dispatchers.IO) {
            beginScan()
            val alreadySwept = interfaceAddresses().flatMap { hostsFor(it) }.toSet()
            val hosts = COMMON_SUBNETS
                .flatMap { prefix -> (1..254).map { "$prefix.$it" } }
                .filter { it !in alreadySwept }
            if (hosts.isEmpty()) return@withContext emptyList()
            val found = confirm(sweep(hosts, PRINTER_PORT, 0, hosts.size, onProgress))
            android.util.Log.i("PrinterScanner", "wider sweep of ${hosts.size} address(es) found ${found.size}: $found")
            found
        }

    /**
     * Ask each candidate what it is. An answer proves a printer; silence is not disproof,
     * since plenty of cheap clones never implement the status channel.
     */
    private fun confirm(hits: List<Found>): List<Found> {
        val unique = hits.distinctBy { it.host }
        val out = ArrayList<Found>(unique.size)
        for (hit in unique) {
            if (cancelled) {
                // Cancel skips the extra status round-trip, not the addresses already found.
                out.addAll(unique.subList(out.size, unique.size))
                break
            }
            if (!onLocalSubnet(hit.host)) {
                // mDNS answers across subnets, so [PrinterDiscovery] can hand back a printer no
                // socket here can open. Asking it for ESC/POS status would connect to the
                // gateway and be dropped: 1.2s to learn nothing, and an "unconfirmed" label
                // that reads as "probably not your printer" when the truth is "your printer,
                // on the wrong network".
                out += hit.copy(routable = false)
                continue
            }
            val status = EscPosPrinter.status(hit.host, hit.port, timeoutMs = 1_200)
            out += hit.copy(confirmed = status != null, paperOut = status?.paperOut == true)
        }
        // Reachable first, then confirmed: an address the café can print to right now outranks
        // one it has to go and re-address the printer for.
        return out.sortedWith(compareByDescending<Found> { it.routable }.thenByDescending { it.confirmed })
    }

    private suspend fun sweep(
        hosts: List<String>, port: Int, doneBefore: Int, total: Int, onProgress: (Int, Int) -> Unit,
    ): List<Found> {
        val found = mutableListOf<Found>()
        var done = doneBefore
        for (batch in hosts.chunked(PARALLEL)) {
            if (cancelled) break
            val results = coroutineScope {
                batch.map { host ->
                    async(Dispatchers.IO) {
                        val open = runCatching {
                            Socket().use { s ->
                                s.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
                                true
                            }
                        }.getOrDefault(false)
                        host.takeIf { open }
                    }
                }.awaitAll()
            }
            results.filterNotNull().forEach { found += Found(it, port) }
            done += batch.size
            onProgress(done, total)
        }
        return found
    }

    /** Confirms one address by hand, for the café whose printer is on another subnet. */
    suspend fun probe(host: String, port: Int): Boolean = withContext(Dispatchers.IO) {
        EscPosPrinter.probe(host, port)
    }
}
