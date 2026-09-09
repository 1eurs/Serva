package om.serva.station

import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket

/**
 * The printer, as far as this app is concerned: a socket you write bytes to, which can also
 * be asked how it is.
 *
 * Every network thermal printer worth buying speaks raw ESC/POS on port 9100, which is why
 * this needs no driver, no SDK and no third-party printing app.
 *
 * A clean close after a write proves the printer ACCEPTED the job. It does not prove paper
 * came out, and no printer can tell you that over a socket — but ESC/POS does have a
 * real-time status channel, and asking it turns the two most common café failures, an empty
 * roll and an open cover, from silence into a sentence.
 */
object EscPosPrinter {

    /**
     * DLE EOT n — real-time status. "Real-time" is the point: the printer answers from its
     * interrupt handler, so this is safe to send mid-job and cannot corrupt a receipt.
     * Plenty of cheap clones ignore it entirely, which is why every caller treats no answer
     * as "unknown" rather than as a fault.
     */
    private const val DLE = 0x10
    private const val EOT = 0x04
    private const val STATUS_PRINTER = 1   // online / offline
    private const val STATUS_PAPER = 4     // roll paper sensors

    /**
     * Every status byte carries the same four fixed bits (0, 1, 4 and 7). Checking them is
     * what separates a real printer's answer from a stray byte off some other service that
     * happens to sit on this port.
     */
    private const val FIXED_MASK = 0x93
    private const val FIXED_VALUE = 0x12

    data class Status(
        val online: Boolean,
        val paperOut: Boolean,
        val paperLow: Boolean,
    ) {
        /** What to tell the person standing at the counter, or null when nothing is wrong. */
        fun problem(): String? = when {
            paperOut -> "out of paper"
            !online -> "offline — check the cover is closed"
            else -> null
        }
    }

    /**
     * The status conversation itself, over whatever pair of streams reaches the printer.
     *
     * Lifted off the socket because a Bluetooth printer answers exactly the same bytes on an
     * RFCOMM link, and having two copies of "which bits mean an empty roll" is how the two
     * transports would eventually disagree about a printer being broken.
     */
    fun statusOver(out: OutputStream, input: InputStream, waitMs: Int = 0): Status? {
        /**
         * A socket carries its own read timeout; a Bluetooth stream has no such setting, and a
         * printer that ignores the status channel — plenty of clones do — would otherwise park
         * this thread forever on the first ticket of the shift. Pass a wait for those, and give
         * up into the "no answer means unknown" branch every caller already handles.
         */
        fun readByte(): Int {
            if (waitMs <= 0) return try { input.read() } catch (e: IOException) { -1 }
            val deadline = System.currentTimeMillis() + waitMs
            while (System.currentTimeMillis() < deadline) {
                val ready = try { input.available() } catch (e: IOException) { return -1 }
                if (ready > 0) return try { input.read() } catch (e: IOException) { -1 }
                try { Thread.sleep(25) } catch (e: InterruptedException) { return -1 }
            }
            return -1
        }

        fun ask(which: Int): Int? {
            out.write(byteArrayOf(DLE.toByte(), EOT.toByte(), which.toByte()))
            out.flush()
            val b = readByte()
            if (b < 0) return null
            return if (b and FIXED_MASK == FIXED_VALUE) b else null
        }

        val printer = ask(STATUS_PRINTER) ?: return null
        val paper = ask(STATUS_PAPER)
        return Status(
            online = printer and 0x08 == 0,
            // Both roll-end bits set is the standard's "printing stopped, paper is out".
            paperOut = paper != null && paper and 0x60 == 0x60,
            paperLow = paper != null && paper and 0x0C == 0x0C,
        )
    }

    /** @return the printer's own account of itself, or null if it does not answer. */
    fun status(host: String, port: Int, timeoutMs: Int = 2_000): Status? = runCatching {
        Socket().use { socket ->
            socket.tcpNoDelay = true
            socket.soTimeout = timeoutMs
            socket.connect(InetSocketAddress(host, port), timeoutMs)
            statusOver(socket.getOutputStream(), socket.getInputStream())
        }
    }.getOrNull()

    /** Is anything answering there? A connect and a close, no bytes — what discovery does. */
    fun probe(host: String, port: Int, timeoutMs: Int = 2_000): Boolean = runCatching {
        Socket().use { it.connect(InetSocketAddress(host, port), timeoutMs); true }
    }.getOrDefault(false)

    /**
     * Sends a job. Throws when the printer will not take it, and — where the printer supports
     * the status channel — when it would take it and produce nothing, which is the failure
     * that otherwise looks exactly like success.
     */
    @Throws(IOException::class)
    fun send(host: String, port: Int, bytes: ByteArray, timeoutMs: Int = 15_000) {
        status(host, port)?.problem()?.let { throw IOException("Printer is $it") }
        Socket().use { socket ->
            socket.tcpNoDelay = true
            socket.soTimeout = timeoutMs
            socket.connect(InetSocketAddress(host, port), timeoutMs)
            socket.getOutputStream().apply {
                write(bytes)
                flush()
            }
            // Half-close so the printer sees end-of-job rather than waiting on the socket.
            socket.shutdownOutput()
        }
    }
}
