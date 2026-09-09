package om.serva.station

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import om.serva.station.databinding.ActivityMainBinding
import om.serva.station.databinding.ItemPickBinding
import org.json.JSONArray
import org.json.JSONObject

/**
 * Setting a station up, in four steps, then getting out of the way.
 *
 * The hardest thing about connecting a thermal printer is that every other product asks the
 * café for an IP address — which means power-cycling the printer while holding FEED, reading
 * a self-test slip, and typing four numbers correctly. This asks for none of it: the app
 * sweeps the café's own WiFi for anything answering on the printer port and offers what it
 * finds. Branches are picked by name for the same reason.
 *
 * Nothing here prints in service. Once set up, this screen exists only to answer "is it
 * working?" — the service does the work, and the tablet's screen can be off.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var b: ActivityMainBinding
    private lateinit var prefs: Prefs
    private lateinit var api: Api
    private val ticker = Handler(Looper.getMainLooper())
    private var pickedHost: String? = null
    /** True when sign-in found a single branch and skipped the pick step. */
    private var oneBranch = false
    /** Bumps so a cancelled or superseded scan cannot paint a later screen. */
    private var scanSeq = 0

    private companion object { const val BT_PERMISSION = 2 }

    private val refresh = object : Runnable {
        override fun run() {
            if (b.statusBox.visibility == View.VISIBLE) refreshStatus()
            ticker.postDelayed(this, 2000)
        }
    }

    private val wizardBack = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() { goWizardBack() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        api = Api(prefs)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)
        onBackPressedDispatcher.addCallback(this, wizardBack)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            // The station's notification is how a café sees it is alive.
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        b.apiBase.setText(prefs.apiBase)
        b.username.setText(prefs.username)
        b.paper58.isChecked = prefs.paperWidth == 58

        b.signIn.setOnClickListener { signIn() }
        b.scan.setOnClickListener { scanForPrinters() }
        b.cancelScan.setOnClickListener { cancelScan() }
        b.manual.setOnClickListener {
            b.manualBox.visibility = View.VISIBLE
            b.manual.visibility = View.GONE
        }
        b.useManual.setOnClickListener { useManualAddress() }
        b.wider.setOnClickListener { scanWider() }
        b.bluetooth.setOnClickListener { chooseBluetoothPrinter() }
        b.testPrint.setOnClickListener { sendTestSlip() }
        b.statusTest.setOnClickListener { sendTestSlip() }
        b.yes.setOnClickListener { finishSetup() }
        b.no.setOnClickListener {
            b.troubleshoot.visibility = View.VISIBLE
            b.askBox.visibility = View.GONE
        }
        b.back2.setOnClickListener { show(1) }
        b.back3.setOnClickListener { backFromPrinter() }
        b.back4.setOnClickListener { show(3) }
        b.pause.setOnClickListener { togglePause() }
        b.change.setOnClickListener {
            prefs.setupComplete = false
            StationService.stop(this)
            show(1)
        }
        b.battery.setOnClickListener { askToStayAwake() }

        if (prefs.configured) {
            if (!prefs.paused) StationService.start(this)
            showStatus()
        } else show(1)
    }

    /* ------------------------------------------------------------------ steps */

    private fun show(step: Int) {
        b.statusBox.visibility = View.GONE
        b.step1.visibility = if (step == 1) View.VISIBLE else View.GONE
        b.step2.visibility = if (step == 2) View.VISIBLE else View.GONE
        b.step3.visibility = if (step == 3) View.VISIBLE else View.GONE
        b.step4.visibility = if (step == 4) View.VISIBLE else View.GONE
        wizardBack.isEnabled = step in 2..4
    }

    private fun showStatus() {
        show(0)
        b.statusBox.visibility = View.VISIBLE
        refreshStatus()
    }

    private fun goWizardBack() {
        when {
            b.step4.visibility == View.VISIBLE -> show(3)
            b.step3.visibility == View.VISIBLE -> backFromPrinter()
            b.step2.visibility == View.VISIBLE -> show(1)
        }
    }

    private fun backFromPrinter() {
        PrinterScanner.cancel()
        scanSeq++
        setScanning(false)
        if (oneBranch) show(1) else show(2)
    }

    private fun signIn() {
        b.username.error = null
        b.password.error = null
        val user = b.username.text.toString().trim()
        val pass = b.password.text.toString()
        if (user.isBlank()) b.username.error = getString(R.string.needed)
        if (pass.isBlank()) b.password.error = getString(R.string.needed)
        if (user.isBlank() || pass.isBlank()) return
        prefs.apiBase = b.apiBase.text.toString().ifBlank { "https://serva.om" }
        prefs.username = user
        prefs.password = pass
        b.signIn.isEnabled = false
        b.signIn.text = getString(R.string.signing_in)
        lifecycleScope.launch {
            val branches = runCatching {
                withContext(Dispatchers.IO) {
                    val userJson = api.login()
                    prefs.restaurantId = userJson.optLong("restaurantId", 0L)
                    // A platform-admin account belongs to no café, so it has no branches to
                    // print for. Say so here rather than let the next call fail obscurely.
                    if (prefs.restaurantId == 0L) throw IllegalStateException(getString(R.string.not_a_cafe_account))
                    val scoped = userJson.optLong("branchId", 0L)
                    val all = api.branches(prefs.restaurantId)
                    if (scoped <= 0L) all
                    else {
                        // A branch-scoped account must not be offered the other branches:
                        // picking one they cannot pull for looks like a dead printer tomorrow.
                        val only = JSONArray()
                        for (i in 0 until all.length()) {
                            val b = all.getJSONObject(i)
                            if (b.optLong("id") == scoped) only.put(b)
                        }
                        if (only.length() == 0) all else only
                    }
                }
            }
            b.signIn.isEnabled = true
            b.signIn.text = getString(R.string.sign_in)
            branches.onFailure { b.password.error = it.message }
            branches.onSuccess { list ->
                b.branchList.removeAllViews()
                for (i in 0 until list.length()) {
                    val branch = list.getJSONObject(i)
                    addPick(b.branchList, name(branch), branch.optString("address", "")) {
                        oneBranch = false
                        prefs.branchId = branch.getLong("id")
                        prefs.branchName = name(branch)
                        show(3)
                        scanForPrinters()
                    }
                }
                // One branch is the common case — skip a question with one answer.
                if (list.length() == 1) {
                    val only = list.getJSONObject(0)
                    oneBranch = true
                    prefs.branchId = only.getLong("id")
                    prefs.branchName = name(only)
                    show(3); scanForPrinters()
                } else {
                    oneBranch = false
                    show(2)
                }
            }
        }
    }

    /** The branch's own name, in whichever language it was given one. */
    private fun name(branch: JSONObject): String =
        listOf("nameEn", "nameAr", "name").firstNotNullOfOrNull { key ->
            branch.optString(key, "").takeIf { it.isNotBlank() }
        } ?: "Branch ${branch.optLong("id")}"

    private fun scanForPrinters() {
        b.printerList.removeAllViews()
        b.manualBox.visibility = View.GONE
        b.manual.visibility = View.VISIBLE
        b.wider.visibility = View.GONE
        if (PrinterScanner.localAddress() == null) {
            b.printerBody.text = getString(R.string.no_wifi)
            setScanning(false)
            return
        }
        val seq = ++scanSeq
        setScanning(true)
        // mDNS answers before the sweep starts, and a few seconds of a screen saying nothing
        // is how a café decides the app is broken.
        b.printerBody.text = getString(R.string.asking_network)
        lifecycleScope.launch {
            val found = PrinterScanner.scan(this@MainActivity) { done, total ->
                runOnUiThread {
                    if (seq == scanSeq) b.printerBody.text = getString(R.string.scanning, done, total)
                }
            }
            if (seq != scanSeq) return@launch
            setScanning(false)
            if (found.isEmpty() && PrinterScanner.cancelled) return@launch
            b.printerBody.text = when {
                found.isEmpty() -> getString(R.string.found_none)
                found.size == 1 -> getString(R.string.found_one)
                else -> getString(R.string.found_many, found.size)
            }
            // The printer that is plainly there and was not found is nearly always on an
            // address this tablet's own subnet does not contain. Offer the slow search that
            // can reach it rather than leaving "nothing found" as the last word.
            b.wider.visibility = if (found.isEmpty()) View.VISIBLE else View.GONE
            for (printer in found) offerPrinter(printer)
        }
    }

    /** The search for a printer on a subnet of its own. Minutes, not seconds — so it is asked
     *  for, never automatic, and it says how far along it is the whole way. */
    private fun scanWider() {
        b.printerList.removeAllViews()
        val seq = ++scanSeq
        setScanning(true)
        b.wider.isEnabled = false
        lifecycleScope.launch {
            val found = PrinterScanner.scanWider { done, total ->
                runOnUiThread {
                    if (seq == scanSeq) b.printerBody.text = getString(R.string.scanning_wider, done, total)
                }
            }
            if (seq != scanSeq) return@launch
            setScanning(false)
            b.wider.isEnabled = true
            if (found.isEmpty() && PrinterScanner.cancelled) return@launch
            b.printerBody.text = when {
                found.isEmpty() -> getString(R.string.found_none_wider)
                found.size == 1 -> getString(R.string.found_one)
                else -> getString(R.string.found_many, found.size)
            }
            b.wider.visibility = View.GONE   // asked for once; the guidance below carries on from here
            for (printer in found) offerPrinter(printer)
        }
    }

    private fun cancelScan() {
        PrinterScanner.cancel()
        setScanning(false)
        b.wider.isEnabled = true
    }

    private fun setScanning(on: Boolean) {
        b.scan.isEnabled = !on
        b.cancelScan.visibility = if (on) View.VISIBLE else View.GONE
    }

    private fun offerPrinter(printer: PrinterScanner.Found) {
        // "Answered as a printer" is worth saying out loud: it is the difference
        // between something that is definitely the machine they want and something
        // that merely has the port open.
        val detail = when {
            printer.paperOut -> getString(R.string.printer_no_paper)
            printer.confirmed -> getString(R.string.printer_confirmed)
            else -> getString(R.string.printer_open_port, printer.port)
        }
        addPick(b.printerList, getString(R.string.printer_at, printer.host), detail) {
            usePrinter(printer.host, printer.port)
        }
    }

    private fun useManualAddress() {
        val host = b.printerHost.text.toString().trim()
        if (host.isBlank()) return
        b.useManual.isEnabled = false
        lifecycleScope.launch {
            val reachable = PrinterScanner.probe(host, 9100)
            b.useManual.isEnabled = true
            if (reachable) usePrinter(host, 9100) else b.printerHost.error = getString(R.string.cannot_reach)
        }
    }

    private fun usePrinter(host: String, port: Int) {
        pickedHost = host
        prefs.printerTransport = Prefs.TRANSPORT_LAN
        prefs.printerHost = host
        prefs.printerPort = port
        openTestStep()
    }

    /* -------------------------------------------------------------- bluetooth */

    /**
     * The printers this tablet is already paired with.
     *
     * Pairing itself stays in Android's own settings, where a café has already done it (and
     * where the PIN prompt belongs). Listing bonded devices needs one permission from Android
     * 12 on; scanning would need location, which is why this app never scans.
     */
    private fun chooseBluetoothPrinter() {
        if (!BluetoothPrinter.allowed(this)) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.BLUETOOTH_CONNECT), BT_PERMISSION)
            return
        }
        if (!BluetoothPrinter.enabled(this)) {
            b.printerBody.text = getString(R.string.bt_off)
            startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
            return
        }
        val devices = runCatching { BluetoothPrinter.paired(this) }.getOrDefault(emptyList())
        b.printerList.removeAllViews()
        b.manualBox.visibility = View.GONE
        if (devices.isEmpty()) {
            // A café that has not paired the printer yet cannot be helped from in here.
            b.printerBody.text = getString(R.string.bt_none_paired)
            startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
            return
        }
        b.printerBody.text = getString(R.string.bt_pick)
        for (device in devices) {
            val detail = if (device.looksLikeAPrinter) getString(R.string.bt_is_printer) else device.address
            addPick(b.printerList, device.name, detail) { useBluetoothPrinter(device) }
        }
    }

    private fun useBluetoothPrinter(device: BluetoothPrinter.Paired) {
        prefs.printerTransport = Prefs.TRANSPORT_BLUETOOTH
        prefs.printerBtAddress = device.address
        prefs.printerBtName = device.name
        openTestStep()
    }

    private fun openTestStep() {
        PrinterScanner.cancel()
        scanSeq++
        setScanning(false)
        b.askBox.visibility = View.GONE
        b.troubleshoot.visibility = View.GONE
        b.testBody.text = getString(R.string.test_body)
        show(4)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == BT_PERMISSION && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            chooseBluetoothPrinter()
        }
    }

    private fun sendTestSlip() {
        prefs.paperWidth = if (b.paper58.isChecked) 58 else 80
        val onStatus = b.statusBox.visibility == View.VISIBLE
        val btn = if (onStatus) b.statusTest else b.testPrint
        btn.isEnabled = false
        btn.text = getString(R.string.sending)
        lifecycleScope.launch {
            val sent = withContext(Dispatchers.IO) {
                runCatching {
                    val link = prefs.printerLink(this@MainActivity)
                        ?: throw IllegalStateException(getString(R.string.no_printer_picked))
                    link.send(TestSlip.bytes(prefs.branchName, prefs.stationId, link.label))
                }
            }
            btn.isEnabled = true
            btn.text = getString(R.string.send_test)
            if (onStatus) {
                sent.onFailure {
                    prefs.printerOk = false
                    b.printerHealth.text = getString(R.string.test_failed, it.message ?: "")
                    b.printerHealthDot.setBackgroundResource(R.drawable.dot_bad)
                }
                sent.onSuccess {
                    prefs.printerOk = true
                    refreshStatus()
                }
                return@launch
            }
            sent.onSuccess {
                // The socket accepting the job says nothing about paper, so ask the one
                // question only a person standing at the printer can answer.
                b.askBox.visibility = View.VISIBLE
            }
            sent.onFailure {
                b.testBody.text = getString(R.string.test_failed, it.message ?: "")
            }
        }
    }

    private fun finishSetup() {
        prefs.paperWidth = if (b.paper58.isChecked) 58 else 80
        prefs.setupComplete = true
        prefs.paused = false
        prefs.printerOk = true // they just confirmed paper came out
        StationService.stop(this)
        StationService.start(this)
        showStatus()
        // The one dialog that stops Android's battery manager killing the station overnight.
        // Shown here, not earlier: before a test slip it is a permission with no reason.
        askToStayAwake()
    }

    private fun askToStayAwake() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
    }

    private fun togglePause() {
        if (prefs.paused) {
            prefs.paused = false
            StationService.start(this)
        } else {
            prefs.paused = true
            StationService.stop(this)
        }
        refreshStatus()
    }

    /* ------------------------------------------------------------------ status */

    private fun addPick(into: android.view.ViewGroup, title: String, subtitle: String, onPick: () -> Unit) {
        val row = ItemPickBinding.inflate(LayoutInflater.from(this), into, false)
        row.pickTitle.text = title
        row.pickSub.text = subtitle
        row.pickSub.visibility = if (subtitle.isBlank()) View.GONE else View.VISIBLE
        row.root.setOnClickListener { onPick() }
        into.addView(row.root)
    }

    private fun refreshStatus() {
        when {
            prefs.paused -> {
                b.statusDot.setBackgroundResource(R.drawable.dot_faint)
                b.statusHeadline.text = getString(R.string.paused)
            }
            prefs.configured -> {
                b.statusDot.setBackgroundResource(R.drawable.dot_lime)
                b.statusHeadline.text = getString(R.string.running)
            }
            else -> {
                b.statusDot.setBackgroundResource(R.drawable.dot_faint)
                b.statusHeadline.text = getString(R.string.not_running)
            }
        }
        // The service's own last word wins when it has one — it knows about printers and
        // tickets; this screen only knows the settings.
        b.statusDetail.text =
            if (prefs.configured && !prefs.paused) prefs.lastStatus.ifBlank { getString(R.string.running_detail, prefs.branchName) }
            else prefs.lastStatus
        b.cloudHealth.text = cloudHealthText()
        b.cloudDot.setBackgroundResource(
            when {
                prefs.cloudOk -> R.drawable.dot_lime
                prefs.lastPullAt == 0L -> R.drawable.dot_faint
                else -> R.drawable.dot_bad
            }
        )
        b.printerHealth.text = printerHealthText()
        b.printerHealthDot.setBackgroundResource(
            when {
                prefs.printerOk -> R.drawable.dot_lime
                prefs.lastPrintAt == 0L && !printerProblemStatus() -> R.drawable.dot_faint
                else -> R.drawable.dot_bad
            }
        )
        b.statusMeta.text = getString(R.string.status_meta, prefs.printerLabel, prefs.stationId)
        b.pause.text = getString(if (prefs.paused) R.string.resume_collecting else R.string.pause_collecting)
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        b.battery.visibility = if (pm.isIgnoringBatteryOptimizations(packageName)) View.GONE else View.VISIBLE
    }

    private fun cloudHealthText(): String {
        val host = cloudHost()
        if (prefs.lastPullAt == 0L) return getString(if (prefs.cloudOk) R.string.cloud_never else R.string.cloud_waiting, host)
        if (!prefs.cloudOk) return getString(R.string.cloud_down)
        return getString(R.string.cloud_ok, host, lastPullPhrase())
    }

    private fun cloudHost(): String {
        val host = Uri.parse(prefs.apiBase).host
        return host?.takeIf { it.isNotBlank() }
            ?: prefs.apiBase.removePrefix("https://").removePrefix("http://").substringBefore('/')
    }

    private fun lastPullPhrase(): String {
        val at = prefs.lastPullAt
        if (at <= 0L) return getString(R.string.last_pull_never)
        val ago = System.currentTimeMillis() - at
        return when {
            ago < 60_000L -> getString(R.string.last_pull_just_now)
            ago < 3_600_000L -> getString(R.string.last_pull_minutes, (ago / 60_000L).toInt().coerceAtLeast(1))
            else -> getString(R.string.last_pull_hours, (ago / 3_600_000L).toInt().coerceAtLeast(1))
        }
    }

    private fun printerProblemStatus(): Boolean {
        val status = prefs.lastStatus
        return status.contains("printer", ignoreCase = true) || status.contains("paper", ignoreCase = true)
    }

    private fun printerHealthText(): String {
        if (prefs.printerOk) return getString(R.string.printer_answering, prefs.printerLabel)
        if (printerProblemStatus()) return prefs.lastStatus
        if (prefs.lastPrintAt == 0L) return getString(R.string.printer_waiting, prefs.printerLabel)
        return getString(R.string.printer_silent, prefs.printerLabel)
    }

    override fun onResume() {
        super.onResume()
        ticker.post(refresh)
    }

    override fun onPause() {
        super.onPause()
        ticker.removeCallbacksAndMessages(null)
    }
}
