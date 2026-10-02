-- =====================================================================
-- API keys: a machine credential that acts as one owner account, so an AI or agent can
-- reach the API without the owner's password sitting in a config file.
--
-- Only the SHA-256 hash of the key is stored — the key itself is shown once, at mint, and
-- never again, so a leaked database row cannot be replayed against the API. A READ_ONLY key
-- is refused server-side for any write (see JwtAuthenticationFilter), which is what makes it
-- safe to hand to an agent: it can read the whole café and change nothing.
--
-- A key is switched off (revoked_at) rather than deleted, so nothing it did is rewritten.
-- =====================================================================

CREATE TABLE api_keys (
    id            BIGSERIAL    PRIMARY KEY,
    -- The account the key authenticates as; drop the keys when the account goes.
    user_id       BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Denormalised from the user so a café's keys list without a join.
    restaurant_id BIGINT       REFERENCES restaurants (id),
    label         VARCHAR(120) NOT NULL,
    -- SHA-256 hex (64 chars) of the presented key. The plaintext is never stored.
    token_hash    VARCHAR(64)  NOT NULL,
    -- Last 4 chars of the key, for telling two keys apart in a list.
    last4         VARCHAR(8)   NOT NULL,
    -- READ_ONLY = GET only; FULL = the owner's permissions. Read-only is the safe default.
    scope         VARCHAR(16)  NOT NULL DEFAULT 'READ_ONLY',
    created_at    TIMESTAMPTZ  NOT NULL,
    last_used_at  TIMESTAMPTZ,
    -- Reserved: no TTL today, so it ships null; adding expiry later needs no migration.
    expires_at    TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ,
    -- One row per key hash; also the index the per-request lookup rides on.
    CONSTRAINT uq_api_key_hash UNIQUE (token_hash)
);

-- Listing a café's keys is by owner.
CREATE INDEX idx_api_keys_user ON api_keys (user_id);
