-- OTP codes lived in a ConcurrentHashMap on the backend, which had two consequences:
-- a code issued by one instance could not be verified by another (so a second instance was
-- impossible), and every restart silently voided every code in flight — a customer who asked
-- for a code seconds before a deploy just never gets in, with nothing to explain why.
--
-- NOTE ON ORDERING: V42 belongs to the token-hashing branch, which is not merged yet. Merge
-- that first, or renumber this migration down to V42 — Flyway rejects an out-of-order
-- version by default, so applying V43 before V42 exists will block V42 later.
--
-- The code is stored as-is rather than hashed, unlike the bearer tokens in V42. Hashing a
-- 6-digit code buys essentially nothing: the whole keyspace is a million entries and falls to
-- an offline search instantly. What actually protects it is that it dies in 5 minutes and
-- after 5 wrong guesses — so those are enforced here rather than dressed up with a digest.

CREATE TABLE otp_codes (
    id         BIGSERIAL   PRIMARY KEY,
    -- Normalized phone (see Phones.normalize). One live code per phone: requesting a new
    -- code replaces the old one rather than leaving several valid at once.
    phone      VARCHAR(40) NOT NULL,
    code       VARCHAR(10) NOT NULL,
    attempts   INT         NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX ux_otp_codes_phone ON otp_codes (phone);
-- The sweep deletes by expiry, and it runs every minute.
CREATE INDEX ix_otp_codes_expires_at ON otp_codes (expires_at);
