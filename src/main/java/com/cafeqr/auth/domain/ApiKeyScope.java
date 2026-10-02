package com.cafeqr.auth.domain;

/** What an API key is allowed to do. */
public enum ApiKeyScope {
    /** GET only. Any write (POST/PUT/PATCH/DELETE) is refused server-side, whatever the client sends. */
    READ_ONLY,
    /** Acts with the owning account's full permission set — reads and writes alike. */
    FULL
}
