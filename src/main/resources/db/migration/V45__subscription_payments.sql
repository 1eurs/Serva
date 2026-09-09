-- =====================================================================
-- A ledger of what cafés actually paid us.
--
-- `subscriptions` already carried three confirmation columns
-- (payment_reference, payment_confirmed_at, payment_confirmed_by), but a
-- subscription is a *current state* — one row, overwritten every renewal.
-- That answers "is this café paid up?" and nothing else. It cannot answer
-- "how much did we collect in March?", "which transfer covered this term?",
-- or "who confirmed it?" a year later, because each renewal erases the last
-- one's evidence.
--
-- So payments get their own append-only table. The subscription keeps its
-- confirmation columns as the fast current-state read; this is the history
-- behind them. Nothing here is ever edited — a mistake is corrected by
-- recording a reversing entry, so the ledger and the bank statement can
-- always be reconciled line by line.
-- =====================================================================
CREATE TABLE subscription_payments (
    id              BIGSERIAL     PRIMARY KEY,
    subscription_id BIGINT        NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
    -- Denormalised so the billing board can total per café without a join
    -- through subscriptions, and so a café's history survives a subscription
    -- being replaced rather than renewed.
    restaurant_id   BIGINT        NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
    -- Negative amounts are legal: that is how a refund or a correction is filed.
    amount          NUMERIC(12,3) NOT NULL,
    method          VARCHAR(30)   NOT NULL,
    -- The bank's transfer reference. This is what gets matched against the statement.
    reference       VARCHAR(120),
    -- The date the money moved, which is often not the date somebody got around
    -- to recording it — monthly totals must follow the former.
    paid_on         DATE          NOT NULL,
    -- What this payment bought: the term end date the subscription was moved to.
    covers_until    DATE,
    note            VARCHAR(500),
    recorded_by     BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ   NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL
);

CREATE INDEX ix_sub_payments_restaurant ON subscription_payments (restaurant_id, paid_on DESC);
CREATE INDEX ix_sub_payments_paid_on    ON subscription_payments (paid_on DESC);
