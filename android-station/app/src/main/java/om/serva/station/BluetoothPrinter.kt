package om.serva.station

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.io.IOException
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The same printer, reached over Bluetooth instead of the network.
 *
 * A café that already owns a Bluetooth-only printer should not have to buy another one, and a
 * counter with no WiFi at all is a real place. Nothing above this file changes: the queue, the
 * renderer, the ESC/POS and the ack are identical — only the pipe the bytes go down.
 *
 * Bluetooth Classic SPP (serial port profile), never BLE: every ESC/POS printer on the market
 * speaks it, and it is a plain byte stream, which is exactly what a thermal printer wants.
 * Pairing is Android's job, done once in system settings, so this only ever lists devices the
 * tablet is already bonded to — no scanning, and therefore no location permission to explain.
 *
 * Three things here are not true of the network transport, all learned from how these printers
 * actually behave rather than from the spec:
 *
 *  1. **One connection at a time.** Most printers accept a single RFCOMM link and refuse the
 *     next until the first is closed. So status and the job share one connection here, where
 *     the TCP path happily opens two.
 *  2. **Write in small pieces.** The radio is far faster than the printer's own UART, and a
 *     cheap controller with a small buffer answers a firehose by dropping the middle of the
 *     receipt — a garbled slip, not an error. Small writes with a breath between them cost
 *     nothing against a link this slow anyway.
 *  3. **Do not close on the last byte.** Closing an RFCOMM socket discards whatever the
 *     printer has not consumed yet, so a close straight after the final write truncates the
 *     receipt. The wait before closing is the price of the whole job actually printing.
 */
object BluetoothPrinter {

    /** The standard Serial Port Profile UUID. Every ESC/POS printer advertises this one. */
    private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    /** Small enough that a printer with a 1KB buffer keeps up; big enough to not be silly. */
    private const val CHUNK = 512
    private const val CHUNK_PAUSE_MS = 15L

    /**
     * How long to let the printer chew before hanging up, assuming the ~115200 baud these
     * controllers run internally: roughly 12 bytes per millisecond. A receipt is ~63KB of
     * dots, so this is genuinely seconds — Bluetooth printing is slow, and pretending
     * otherwise just truncates receipts.
     */
    private fun drainMsFor(bytes: Int): Long = (bytes / 12L).coerceIn(300L, 8_000L)

    private const val CONNECT_TIMEOUT_MS = 12_000

    /** How long to wait for a status answer before deciding this printer does not do status. */
    private const val STATUS_WAIT_MS = 1_500

    class NotAllowed : IOException("Serva Station is not allowed to use Bluetooth on this tablet")
    class NoAdapter : IOException("This tablet has no Bluetooth")
    class NotPaired(address: String) : IOException("That printer is not paired with this tablet ($address)")

    data class Paired(val name: String, val address: String, val looksLikeAPrinter: Boolean)

    /** Granted by default below Android 12, a runtime prompt from Android 12 on. */
    fun allowed(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED

    private fun adapter(context: Context): BluetoothAdapter {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? android.bluetooth.BluetoothManager
        return manager?.adapter ?: throw NoAdapter()
    }

    fun enabled(context: Context): Boolean = runCatching { adapter(context).isEnabled }.getOrDefault(false)

    /**
     * Everything this tablet is paired with, printers first.
     *
     * Deliberately not filtered down to the printer device class: plenty of cheap thermal
     * printers report themselves as something else entirely, and a café staring at an empty
     * list has no way forward. Sorting is enough of an opinion.
     */
    @SuppressLint("MissingPermission")   // guarded by allowed(), which the caller must check
    fun paired(context: Context): List<Paired> {
        if (!allowed(context)) throw NotAllowed()
        return adapter(context).bondedDevices.orEmpty()
            .map { device ->
                Paired(
                    name = device.name ?: device.address,
                    address = device.address,
                    looksLikeAPrinter = isPrinter(device),
                )
            }
            .sortedWith(compareByDescending<Paired> { it.looksLikeAPrinter }.thenBy { it.name.lowercase() })
    }

    @SuppressLint("MissingPermission")
    private fun isPrinter(device: BluetoothDevice): Boolean {
        val klass = device.bluetoothClass ?: return false
        return klass.hasService(BluetoothClass.Service.RENDER) ||
            klass.majorDeviceClass == BluetoothClass.Device.Major.IMAGING
    }

    /** Is the printer there and willing to talk? Connect, then hang up — nothing is printed. */
    fun probe(context: Context, address: String): Boolean = runCatching {
        open(context, address).use { true }
    }.getOrDefault(false)

    /** What the printer says about itself, or null when it does not answer the status channel. */
    fun status(context: Context, address: String): EscPosPrinter.Status? = runCatching {
        open(context, address).use { socket ->
            EscPosPrinter.statusOver(socket.outputStream, socket.inputStream, STATUS_WAIT_MS)
        }
    }.getOrNull()

    /**
     * Sends a job, and — where the printer answers the status channel — refuses to send one
     * into an empty roll, which is the failure that otherwise looks exactly like success.
     */
    @Throws(IOException::class)
    fun send(context: Context, address: String, bytes: ByteArray) {
        open(context, address).use { socket ->
            val out = socket.outputStream
            // Same connection as the job: most of these printers only accept one link at a time.
            EscPosPrinter.statusOver(out, socket.inputStream, STATUS_WAIT_MS)?.problem()?.let {
                throw IOException("Printer is $it")
            }
            var at = 0
            while (at < bytes.size) {
                val n = minOf(CHUNK, bytes.size - at)
                out.write(bytes, at, n)
                out.flush()
                at += n
                if (at < bytes.size) Thread.sleep(CHUNK_PAUSE_MS)
            }
            Thread.sleep(drainMsFor(bytes.size))
        }
    }

    @SuppressLint("MissingPermission")
    private fun open(context: Context, address: String): BluetoothSocket {
        if (!allowed(context)) throw NotAllowed()
        val adapter = adapter(context)
        if (!adapter.isEnabled) throw IOException("Bluetooth is switched off on this tablet")
        val device = adapter.bondedDevices.orEmpty().firstOrNull { it.address.equals(address, ignoreCase = true) }
            ?: throw NotPaired(address)
        // Discovery is a bandwidth hog and the documented cause of failed connects.
        runCatching { adapter.cancelDiscovery() }
        val socket = device.createRfcommSocketToServiceRecord(SPP)
        try {
            socket.connectWithin(CONNECT_TIMEOUT_MS)
        } catch (e: IOException) {
            runCatching { socket.close() }
            throw e
        }
        return socket
    }

    /**
     * BluetoothSocket.connect() takes no timeout and can sit there for a long time when a
     * printer is off or out of range — long enough for the poll loop behind it to look wedged.
     * A watchdog thread closes the socket, which is the only thing that makes connect() return.
     */
    private fun BluetoothSocket.connectWithin(timeoutMs: Int) {
        val settled = AtomicBoolean(false)
        val timedOut = AtomicBoolean(false)
        val watchdog = Thread {
            try { Thread.sleep(timeoutMs.toLong()) } catch (e: InterruptedException) { return@Thread }
            if (!settled.get()) { timedOut.set(true); runCatching { close() } }
        }
        watchdog.isDaemon = true
        watchdog.start()
        try {
            connect()
            settled.set(true)
        } catch (e: IOException) {
            settled.set(true)
            throw if (timedOut.get())
                IOException("The printer did not answer — check it is switched on and in range")
            else e
        } finally {
            watchdog.interrupt()
        }
    }
}
