-- =====================================================================
-- Cash in and out of the drawer, mid-shift.
--
-- The till counted two moments — the float in the morning, the count at
-- night — and judged the drawer against the cash it took between them.
-- But a café pulls notes out of the drawer all day for things the till
-- never sees: a crate of milk, a bag of bread, the gas bottle. The
-- drawer then reads "short" at close, and nobody can say why.
--
-- A movement is one of those: money taken OUT of the drawer, or (less
-- often) put IN, with the reason written on it. It hangs off the open
-- session, and at close it moves what the drawer is expected to hold —
-- expected = float + cash sales - paid out + paid in. So a drawer that
-- is 5 rials down because someone bought milk reads as exactly right,
-- and the report says where the 5 went.
-- =====================================================================

CREATE TABLE till_movements (
    id             BIGSERIAL     PRIMARY KEY,
    -- The stretch of the drawer being open that this belongs to. Cascades with the
    -- session, which cascades with the branch.
    session_id     BIGINT        NOT NULL REFERENCES till_sessions (id) ON DELETE CASCADE,
    restaurant_id  BIGINT        NOT NULL REFERENCES restaurants (id),
    branch_id      BIGINT        NOT NULL REFERENCES branches (id) ON DELETE CASCADE,

    -- Always positive; the direction carries the sign. A movement of zero is not one.
    amount         NUMERIC(14,3) NOT NULL,
    -- OUT: money left the drawer. IN: money was added to it.
    direction      VARCHAR(8)    NOT NULL,
    -- Why. The whole point of the row — a drawer short by 5 is a mistake, a drawer
    -- short by 5 "for milk" is a receipt.
    note           VARCHAR(200)  NOT NULL,

    -- Who did it, and their name at the time — snapshotted, like a session's open/close,
    -- so a movement from three months ago still names whoever made it after they leave.
    created_by      BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    created_by_name VARCHAR(200),

    created_at     TIMESTAMPTZ   NOT NULL,
    updated_at     TIMESTAMPTZ   NOT NULL,

    CONSTRAINT ck_till_movements_amount    CHECK (amount > 0),
    CONSTRAINT ck_till_movements_direction CHECK (direction IN ('OUT', 'IN'))
);

-- The movements of one session, read together when the sheet or the report asks.
CREATE INDEX ix_till_movements_session ON till_movements (session_id);

-- Frozen onto the session at close, beside the other close figures, and never
-- recomputed — a movement edited next week must not move what tonight's drawer was
-- counted against. Both are the sum of this session's movements by direction.
ALTER TABLE till_sessions ADD COLUMN cash_paid_out NUMERIC(14,3);
ALTER TABLE till_sessions ADD COLUMN cash_paid_in  NUMERIC(14,3);
