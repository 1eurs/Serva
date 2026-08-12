-- =====================================================================
-- Staff invitations.
--
-- Replaces the "owner types a temporary password and hands it over" flow.
-- That flow has a real problem: the owner ends up knowing the member's
-- password, and nothing ever forces it to change.
--
-- Instead the owner creates the account shell — username, permissions,
-- branch — and gets a single-use link. The member opens it, sets their own
-- password, and is logged in. Nobody else ever knows it.
--
-- The invited user row exists from the moment the invite is created but is
-- inactive, so the normal login path already refuses it (ACCOUNT_DISABLED)
-- and no special case is needed anywhere else. `users.invited_at` marks it
-- as *pending* rather than *deactivated staff* — two states that look
-- identical on `active` alone but mean very different things in the UI.
-- It is cleared on acceptance.
--
-- Link-first rather than email-first on purpose: café staff here often have
-- no work email, and the owner already has them on WhatsApp. An email is
-- sent as well when an address happens to be known.
-- =====================================================================

CREATE TABLE staff_invites (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token       VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    -- Set the moment the member sets a password. Non-null = spent.
    accepted_at TIMESTAMPTZ,
    revoked     BOOLEAN      NOT NULL DEFAULT FALSE,
    invited_by  BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL
);
CREATE UNIQUE INDEX ux_staff_invites_token ON staff_invites (token);
CREATE INDEX ix_staff_invites_user ON staff_invites (user_id);

-- When the invite was sent; NULL once accepted (or for staff created the old way).
ALTER TABLE users ADD COLUMN invited_at TIMESTAMPTZ;
