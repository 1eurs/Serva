-- Refresh and password-reset tokens were stored verbatim: the `token` column held the exact
-- string a client presents to prove who it is. Anyone who could read the table could resume
-- any live session — and since the nightly dumps now leave the server for the offsite copy,
-- "read the table" includes "read a backup file".
--
-- Store SHA-256 of the token instead. The tokens are 48 random bytes, so a fast digest is
-- the right tool (see Tokens.sha256) — there is no low-entropy secret to brute-force.
--
-- The plaintext is still in the column at this point, so the hashes are backfilled from it
-- in place: nobody is logged out and no reset link in flight breaks. Postgres has had a
-- built-in sha256() since 11, so this needs no extension.
--
-- staff_invites is deliberately NOT included. Its join URL is re-read and re-displayed when
-- an owner lists pending invites (StaffInviteService.toResponse), so hashing it would mean
-- the link could only ever be shown once at creation. That is a product decision — probably
-- "re-issue the token when the owner asks to see the link again" — not a migration.

ALTER TABLE refresh_tokens ADD COLUMN token_hash VARCHAR(64);
UPDATE refresh_tokens SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
ALTER TABLE refresh_tokens ALTER COLUMN token_hash SET NOT NULL;
-- Dropping the column takes ux_refresh_tokens_token with it.
ALTER TABLE refresh_tokens DROP COLUMN token;
CREATE UNIQUE INDEX ux_refresh_tokens_token_hash ON refresh_tokens (token_hash);

ALTER TABLE password_reset_tokens ADD COLUMN token_hash VARCHAR(64);
UPDATE password_reset_tokens SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
ALTER TABLE password_reset_tokens ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE password_reset_tokens DROP COLUMN token;
CREATE UNIQUE INDEX ux_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);
