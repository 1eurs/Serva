package om.serva.station

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/**
 * Turns a print job into printable bytes, by asking the server's own receipt page to do it.
 *
 * The app deliberately owns no part of how a receipt looks. It loads /print/render once and
 * keeps it, and for each job calls window.servaRenderJob(...), which lays the slip out with
 * the same React component, the same CSS and the same rasteriser the dashboard prints with.
 * So a café that changes its receipt style, or switches to English-only, sees it on the next
 * ticket — with no app update in any café.
 *
 * The WebView is never shown. It is measured and laid out by hand so the DOM has real
 * geometry to rasterise, then left off-screen: this is a JavaScript host, not a screen. That
 * is also why the poll loop lives in the service and not in the page — nothing here depends
 * on the tablet being awake or the app being in front.
 */
class Renderer(private val context: Context, private val prefs: Prefs) {

    private val main = Handler(Looper.getMainLooper())
    private var webView: WebView? = null

    /** Set when Android killed the WebView's renderer process under it (memory pressure does
     *  this to unattended tablets). The next render sees it and rebuilds the page instead of
     *  evaluating JavaScript into a corpse. */
    @Volatile var gone: Boolean = false
        private set

    /** Why the last [start] failed, if it did — HTTP 404, chrome-error, crash, timeout. */
    @Volatile var startError: String? = null
        private set

    class RenderException(message: String) : IOException(message)

    /** Width in CSS pixels to lay the page out at. The slip itself is sized by the renderer. */
    private val layoutWidth = 800
    private val layoutHeight = 2000

    /**
     * How a finished render gets back into Kotlin.
     *
     * evaluateJavascript hands back the value of the expression, immediately — and a promise
     * is a value, so it returned `{}` before the receipt had drawn and every job failed with
     * nothing to show for it. The page has to call US when it is done, which is what this is.
     */
    private val inFlight = java.util.concurrent.atomic.AtomicReference<CountDownLatch?>(null)
    private val lastResult = AtomicReference<String?>(null)
    /** Stale JS callbacks from a timed-out render must not complete the next ticket. */
    private val renderGen = AtomicInteger(0)

    private inner class Bridge {
        @JavascriptInterface
        fun onRendered(id: Int, json: String) {
            if (id != renderGen.get()) return
            lastResult.set(json)
            inFlight.get()?.countDown()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun start(): Boolean {
        startError = null
        val ready = CountDownLatch(1)
        val loaded = AtomicReference(false)
        main.post {
            val wv = WebView(context)
            wv.settings.javaScriptEnabled = true
            // Only ever loads the receipt page from the configured Serva address, so the one
            // method exposed here is not reachable by anything else.
            wv.addJavascriptInterface(Bridge(), "AndroidStation")
            wv.settings.domStorageEnabled = true
            wv.settings.blockNetworkImage = false
            wv.settings.loadsImagesAutomatically = true
            // A station that cached yesterday's /print/render would keep printing the old
            // layout after a deploy until the process died.
            wv.settings.cacheMode = WebSettings.LOAD_NO_CACHE
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                wv.settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            }
            wv.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    // Chrome-error and HTTP error pages also finish; those already set startError.
                    if (startError != null) return
                    loaded.set(true)
                    ready.countDown()
                }
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (!request.isForMainFrame) return
                    failLoad(error.description?.toString()?.takeIf { it.isNotBlank() }
                        ?: "the receipt page failed to load")
                }
                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                    if (!request.isForMainFrame) return
                    val phrase = errorResponse.reasonPhrase?.takeIf { it.isNotBlank() }
                    failLoad("HTTP ${errorResponse.statusCode}" + (phrase?.let { " $it" } ?: ""))
                }
                // Returning true claims the crash so the app itself is not killed with it.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    gone = true
                    startError = "the receipt renderer crashed"
                    runCatching { view.destroy() }
                    if (webView === view) webView = null
                    ready.countDown()
                    return true
                }
                private fun failLoad(reason: String) {
                    startError = reason
                    ready.countDown()
                }
            }
            gone = false
            // Detached from any window, so nothing lays it out for us.
            wv.measure(
                View.MeasureSpec.makeMeasureSpec(layoutWidth, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(layoutHeight, View.MeasureSpec.EXACTLY),
            )
            wv.layout(0, 0, layoutWidth, layoutHeight)
            webView = wv
            wv.loadUrl("${prefs.apiBase}/print/render")
        }
        if (!ready.await(60, TimeUnit.SECONDS)) {
            if (startError == null) startError = "the receipt page did not load in time"
            return false
        }
        if (gone) {
            if (startError == null) startError = "the receipt renderer crashed"
            return false
        }
        if (startError != null || !loaded.get()) return false
        // The page sets this once its render function is installed.
        if (!waitForRenderer()) {
            if (startError == null) {
                startError = if (gone) "the receipt renderer crashed"
                    else "the receipt page loaded but the renderer did not become ready"
            }
            return false
        }
        return true
    }

    private fun waitForRenderer(): Boolean {
        repeat(30) {
            if (gone || startError != null) return false
            val result = evaluate("window.servaRenderReady === true")
            if (gone || startError != null) return false
            if (result == "true") return true
            Thread.sleep(500)
        }
        return false
    }

    /**
     * Blocking on purpose: the service's poll loop prints one job at a time, in order, and a
     * queue of half-rendered receipts would be harder to reason about than a slow one.
     */
    @Throws(RenderException::class)
    fun render(job: JSONObject): ByteArray {
        val receipt = job.optJSONObject("receipt")
        val request = JSONObject()
            .put("order", job.getJSONObject("order"))
            .put("restaurant", receipt ?: JSONObject.NULL)
            .put("tableNumber", realString(receipt, "tableNumber"))
            .put("paperWidth", prefs.paperWidth)

        val latch = CountDownLatch(1)
        if (!inFlight.compareAndSet(null, latch)) throw RenderException("a render is already in flight")
        val id = renderGen.incrementAndGet()
        lastResult.set(null)
        try {
            val script = "window.servaRenderJob(${JSONObject.quote(request.toString())})" +
                ".then(r => AndroidStation.onRendered($id, JSON.stringify(r))," +
                " e => AndroidStation.onRendered($id, JSON.stringify({ok:false, error:String(e)})))"
            evaluate(script)
            if (gone) throw RenderException("renderer process is gone")
            // Generous: a first render pays for fonts and layout, and a receipt is tall.
            if (!latch.await(60, TimeUnit.SECONDS)) {
                renderGen.compareAndSet(id, id + 1) // late JS must not complete the next ticket
                throw RenderException("renderer did not answer in time")
            }
            val raw = lastResult.get() ?: throw RenderException("renderer answered with nothing")
            val json = runCatching { JSONObject(raw) }
                .getOrElse { throw RenderException("renderer returned junk: ${raw.take(120)}") }
            if (!json.optBoolean("ok")) throw RenderException(json.optString("error", "render failed"))
            return Base64.decode(json.getString("base64"), Base64.DEFAULT)
        } finally {
            inFlight.compareAndSet(latch, null)
        }
    }

    /**
     * Android's optString turns JSON null into the word "null", which then printed as the
     * table name on dine-in tickets with no table.
     */
    private fun realString(obj: JSONObject?, key: String): Any {
        if (obj == null || !obj.has(key) || obj.isNull(key)) return JSONObject.NULL
        val s = obj.optString(key, "")
        return if (s.isBlank() || s == "null") JSONObject.NULL else s
    }

    /** evaluateJavascript is main-thread and asynchronous; the poll loop is neither. */
    private fun evaluate(script: String, timeoutSeconds: Long = 15): String? {
        val latch = CountDownLatch(1)
        val out = AtomicReference<String?>(null)
        main.post {
            val wv = webView
            if (wv == null) {
                gone = true
                latch.countDown()
                return@post
            }
            try {
                wv.evaluateJavascript(script) { value ->
                    out.set(value)
                    latch.countDown()
                }
            } catch (_: Exception) {
                gone = true
                latch.countDown()
            }
        }
        if (!latch.await(timeoutSeconds, TimeUnit.SECONDS)) return null
        return out.get()
    }

    fun stop() {
        main.post {
            webView?.destroy()
            webView = null
        }
    }

    /** Tear down and load the page again — after a renderer crash, or a run of failures. */
    fun restart(): Boolean {
        val latch = CountDownLatch(1)
        main.post {
            runCatching { webView?.destroy() }
            webView = null
            latch.countDown()
        }
        latch.await(5, TimeUnit.SECONDS)
        return start()
    }
}
