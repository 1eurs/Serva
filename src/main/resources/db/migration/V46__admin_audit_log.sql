-- =====================================================================
-- What the platform admins did.
--
-- Until now a café could be deactivated, moved to a different tier, or have
-- its owner's password reset, and nothing anywhere recorded who did it or
-- when. With one admin that is merely uncomfortable; with two it is a
-- support call nobody can answer ("we didn't switch anything off").
--
-- Every platform-admin action that changes a café's world writes one row
-- here. Rows are never updated or deleted — an audit log that can be edited
-- is not an audit log.
--
-- actor_name and target_label are deliberate snapshots, not joins: the point
-- of the log is to read correctly a year later, after the admin left and the
-- café was renamed. The ids stay for linking while the rows still exist.
-- =====================================================================
CREATE TABLE admin_audit_log (
    id           BIGSERIAL    PRIMARY KEY,
    actor_id     BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    actor_name   VARCHAR(150),
    -- A short verb, e.g. CAFE_DEACTIVATED, PLAN_CHANGED, PAYMENT_RECORDED.
    action       VARCHAR(60)  NOT NULL,
    target_type  VARCHAR(40),
    target_id    BIGINT,
    target_label VARCHAR(200),
    -- Human-readable specifics: "STANDARD → PRO", "120.000 OMR ref TT-9931".
    detail       VARCHAR(1000),
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL
);

CREATE INDEX ix_audit_created_at ON admin_audit_log (created_at DESC);
CREATE INDEX ix_audit_target     ON admin_audit_log (target_type, target_id, created_at DESC);
