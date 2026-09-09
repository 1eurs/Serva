package om.serva.station

import java.io.ByteArrayOutputStream

/**
 * The slip printed while setting a station up.
 *
 * Plain ASCII and ESC/POS text commands rather than a rendered image, on purpose: this step
 * is testing the socket, the paper and the cut, and nothing else. Keeping the WebView out of
 * it means a failure here can only mean one thing, which is what makes the answer to "did
 * paper come out?" worth anything.
 */
object TestSlip {

    fun bytes(branchName: String, stationId: String, printerHost: String): ByteArray {
        val out = ByteArrayOutputStream()
        fun esc(vararg b: Int) = out.write(b.map { it.toByte() }.toByteArray())
        fun line(text: String) { out.write(text.toByteArray(Charsets.US_ASCII)); out.write(0x0A) }
        // Thermal text mode cannot shape Arabic (or anything else outside ASCII) — the
        // printer would render `?`. A generic stand-in beats mojibake on the setup slip.
        fun asciiOr(value: String, fallback: String): String =
            if (value.all { it.code < 128 }) value.take(28) else fallback

        esc(0x1B, 0x40)              // ESC @   initialise
        esc(0x1B, 0x61, 0x01)        // ESC a 1 centre
        esc(0x1D, 0x21, 0x11)        // GS ! 17 double width and height
        line("SERVA")
        esc(0x1D, 0x21, 0x00)        // back to normal
        line("")
        line("Print station connected")
        line("")
        esc(0x1B, 0x61, 0x00)        // ESC a 0 left
        line("Branch:  ${asciiOr(branchName, "this branch")}")
        // The address, because a café can easily have two printers answering on the network
        // — a counter one and a kitchen one — and the scan cannot tell them apart. Whichever
        // machine this slip came out of is the one that address belongs to.
        line("Printer: ${asciiOr(printerHost, "this printer")}")
        line("Device:  ${asciiOr(stationId, "this station")}")
        line("")
        esc(0x1B, 0x61, 0x01)
        line("If this came out of the printer")
        line("at your counter, you are set up.")
        line("If it came out of another one,")
        line("go back and pick the other address.")
        esc(0x1B, 0x64, 0x04)        // ESC d 4 feed past the tear bar
        esc(0x1D, 0x56, 0x42, 0x00)  // GS V B 0 partial cut
        return out.toByteArray()
    }
}
