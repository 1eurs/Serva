package om.serva.station

import android.content.Context
import java.io.IOException

/**
 * The printer, whichever way it is attached.
 *
 * Everything above this — the poll loop, the renderer, the ack, the status screen — is written
 * against these three verbs and never learns which transport a café chose. That is the whole
 * design: adding Bluetooth changed how bytes leave the tablet and nothing else, and a future
 * transport (USB, or a print server) would be one more implementation here.
 */
sealed interface PrinterLink {

    /** What to call this printer when talking to a human: an address, or a Bluetooth name. */
    val label: String

    /** Is it there? Nothing is printed. */
    fun probe(): Boolean

    /** Print, or throw saying why not. */
    @Throws(IOException::class)
    fun send(bytes: ByteArray)
}

class NetworkPrinter(private val host: String, private val port: Int) : PrinterLink {
    override val label: String get() = host
    override fun probe(): Boolean = EscPosPrinter.probe(host, port)
    override fun send(bytes: ByteArray) = EscPosPrinter.send(host, port, bytes)
}

class BluetoothPrinterLink(
    private val context: Context,
    private val address: String,
    private val name: String,
) : PrinterLink {
    override val label: String get() = name.ifBlank { address }
    override fun probe(): Boolean = BluetoothPrinter.probe(context, address)
    override fun send(bytes: ByteArray) = BluetoothPrinter.send(context, address, bytes)
}

/**
 * The printer this station was set up with, or null if it has not been set up yet.
 *
 * Takes the application context: a link outlives any screen, and the service holds one for the
 * length of a shift.
 */
fun Prefs.printerLink(context: Context): PrinterLink? = when {
    printerTransport == Prefs.TRANSPORT_BLUETOOTH && printerBtAddress.isNotBlank() ->
        BluetoothPrinterLink(context.applicationContext, printerBtAddress, printerBtName)
    printerTransport == Prefs.TRANSPORT_LAN && printerHost.isNotBlank() ->
        NetworkPrinter(printerHost, printerPort)
    else -> null
}
