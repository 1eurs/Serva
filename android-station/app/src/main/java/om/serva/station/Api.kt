package om.serva.station

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * The Serva API, as much of it as a print station needs: sign in, pull jobs, acknowledge.
 * Deliberately the same endpoints a browser station calls — the server cannot tell the
 * difference, so nothing about permissions, branch scoping or the queue is special-cased.
 */
class Api(private val prefs: Prefs) {

    private var accessToken: String? = null
    private var refreshToken: String? = null

    class ApiException(val status: Int, message: String, val serverMessage: String? = null) : IOException(message)

    /** @return the signed-in user, which the auth response already carries. */
    fun login(): JSONObject {
        val body = JSONObject()
            .put("username", prefs.username)
            .put("password", prefs.password)
        val res = request("POST", "/api/auth/login", body.toString(), auth = false)
        val data = res.getJSONObject("data")
        accessToken = data.getString("accessToken")
        refreshToken = if (data.isNull("refreshToken")) null else data.optString("refreshToken").takeIf { it.isNotBlank() }
        return data.optJSONObject("user") ?: JSONObject()
    }

    /** The café's branches, so setup offers names to tap instead of asking for an id. */
    fun branches(restaurantId: Long): JSONArray =
        authed("GET", "/api/restaurants/$restaurantId/branches", null).optJSONArray("data") ?: JSONArray()

    /** The signed-in user, for the restaurant id and to show who the station runs as. */
    fun me(): JSONObject = authed("GET", "/api/auth/me", null).getJSONObject("data")

    /** Jobs this station now holds. The server has claimed each one for us for a short lease. */
    fun pull(): JSONArray {
        val station = URLEncoder.encode(prefs.stationId, "UTF-8")
        val path = "/api/dashboard/print-jobs/pull?branchId=${prefs.branchId}&stationId=$station"
        return authed("POST", path, "{}").optJSONArray("data") ?: JSONArray()
    }

    /** Until this lands the job stays pending and will be offered again. */
    fun ack(jobId: Long) {
        authed("POST", "/api/dashboard/print-jobs/$jobId/ack", "{}")
    }

    /** One retry behind a refresh: an access token outlives a shift but not a week. */
    private fun authed(method: String, path: String, body: String?): JSONObject {
        if (accessToken == null) login()
        return try {
            request(method, path, body, auth = true)
        } catch (e: ApiException) {
            if (e.status != 401) throw e
            if (!tryRefresh()) login()
            request(method, path, body, auth = true)
        }
    }

    private fun tryRefresh(): Boolean {
        val token = refreshToken ?: return false
        return try {
            val res = request("POST", "/api/auth/refresh", JSONObject().put("refreshToken", token).toString(), auth = false)
            val data = res.getJSONObject("data")
            accessToken = data.getString("accessToken")
            refreshToken = if (data.isNull("refreshToken")) token
                else data.optString("refreshToken").takeIf { it.isNotBlank() } ?: token
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun request(method: String, path: String, body: String?, auth: Boolean): JSONObject {
        val conn = (URL(prefs.apiBase + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 20_000
            // A POST that follows a 301 to https becomes a GET; the pull then claims nothing
            // and tickets sit in the queue looking like a dead printer.
            instanceFollowRedirects = false
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            if (auth) accessToken?.let { setRequestProperty("Authorization", "Bearer $it") }
            doInput = true
        }
        try {
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = conn.responseCode
            if (status in 300..399) {
                throw ApiException(status, "Serva redirected ($status). Use the https address.")
            }
            val text = (if (status in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (status !in 200..299) {
                val serverMessage = runCatching {
                    JSONObject(text).optString("message").takeIf { it.isNotBlank() }
                }.getOrNull()
                throw ApiException(
                    status,
                    "$method $path → $status ${serverMessage ?: ""}".trimEnd(),
                    serverMessage,
                )
            }
            return JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }
}
