-- =====================================================================
-- The till — what was behind the Pause button all along, and wasn't.
--
-- "Accepting orders" was one boolean on a branch. Anyone could flip it,
-- nothing recorded that they had, and the shop being open meant nothing
-- more than somebody having last tapped the button that way. A café
-- already answers the same question every morning and every night with
-- the drawer: count the float in, count the cash out. That is the real
-- state, and this is the table that holds it.
--
-- A session is one stretch of the till being open: who opened it and
-- with how much, and — when it closes — what the drawer actually held
-- against what it should have. Orders can only exist inside one. So the
-- switch in the header stops being a mood and becomes the till: closed
-- means nothing can be sold, because no drawer is counted open to take
-- the money.
--
-- Pause is the other half, and it is deliberately NOT a session. A café
-- slammed at 2pm stops taking QR orders for twenty minutes without
-- cashing out — the drawer stays open, the counter keeps serving, and
-- the pause lifts itself. That is branches.accepting_orders, kept, with
-- an expiry beside it so a pause can be for twenty minutes rather than
-- until someone remembers.
-- =====================================================================

CREATE TABLE till_sessions (
    id             BIGSERIAL     PRIMARY KEY,
    restaurant_id  BIGINT        NOT NULL REFERENCES restaurants (id),
    -- The drawer is physical, like the shelf: two branches count two drawers.
    branch_id      BIGINT        NOT NULL REFERENCES branches (id) ON DELETE CASCADE,

    opened_at      TIMESTAMPTZ   NOT NULL,
    -- Who did it, and their name at the time. The id can go (staff leave, accounts
    -- are deleted) and a close from three months ago must still say whose count it
    -- was, so the name is snapshotted rather than joined — the same deal the order
    -- event log makes.
    opened_by      BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    opened_by_name VARCHAR(200),
    -- The change in the drawer at the start. Zero is a legitimate answer.
    opening_float  NUMERIC(14,3) NOT NULL DEFAULT 0,

    closed_at      TIMESTAMPTZ,
    closed_by      BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    closed_by_name VARCHAR(200),

    -- Everything below is written once, at close, and never recomputed. A session is
    -- a historical record: a refund tomorrow, or a bill re-marked paid next week,
    -- must not quietly move what last Tuesday's drawer was counted against.
    counted_cash   NUMERIC(14,3),
    expected_cash  NUMERIC(14,3),
    -- counted - expected. Stored rather than derived so a report can sort and sum on
    -- it without every reader re-deriving the subtraction the same way.
    variance       NUMERIC(14,3),
    cash_sales     NUMERIC(14,3),
    card_sales     NUMERIC(14,3),
    order_count    INTEGER,
    close_note     VARCHAR(500),

    created_at     TIMESTAMPTZ   NOT NULL,
    updated_at     TIMESTAMPTZ   NOT NULL,

    CONSTRAINT ck_till_sessions_float CHECK (opening_float >= 0),
    CONSTRAINT ck_till_sessions_counted CHECK (counted_cash IS NULL OR counted_cash >= 0),
    -- A closed session says who closed it and what was in the drawer; an open one
    -- says none of it. Half-closed is not a state the till has.
    CONSTRAINT ck_till_sessions_closed CHECK (
        (closed_at IS NULL AND counted_cash IS NULL)
        OR (closed_at IS NOT NULL AND counted_cash IS NOT NULL)
    )
);

-- One open drawer per branch, enforced here rather than in a service: two tablets
-- tapping "Open" at the same moment is exactly how a café ends the day with two
-- half-right counts, and no amount of checking-then-inserting in Java prevents it.
CREATE UNIQUE INDEX ux_till_sessions_open ON till_sessions (branch_id) WHERE closed_at IS NULL;
-- The history list: most recent first, per branch.
CREATE INDEX ix_till_sessions_branch_opened ON till_sessions (branch_id, opened_at DESC);

-- ---------------------------------------------------------------------
-- How each branch wants its till run. Per branch, like the printer and
-- counter mode, because these describe a room with a drawer in it.
-- ---------------------------------------------------------------------

-- The escape hatch, and the reason this can ship without an argument: a café that
-- does not want to count a drawer turns it off, and the header switch goes back to
-- being a plain pause. Nobody is made to do a cash count to sell a coffee.
ALTER TABLE branches ADD COLUMN till_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Blind count: the closing screen takes the counted figure BEFORE it shows what was
-- expected. A cashier who can see the target can type the target, and then the count
-- stops being evidence of anything. Cafés that would rather count with the number in
-- view can say so — it is their drawer.
ALTER TABLE branches ADD COLUMN till_blind_count BOOLEAN NOT NULL DEFAULT TRUE;

-- Carry last night's counted cash into tonight's opening float, so opening the till
-- is one tap for the shop that leaves its change in the drawer. Off for the shop that
-- banks the lot and starts from a fresh bag.
ALTER TABLE branches ADD COLUMN till_carry_float BOOLEAN NOT NULL DEFAULT TRUE;

-- Ask for a written reason when the drawer is off by more than this. NULL means never
-- ask. The default is small enough to catch a real mistake and large enough that a
-- rounded rial does not make anyone write a sentence every night.
ALTER TABLE branches ADD COLUMN till_note_over NUMERIC(14,3) DEFAULT 1.000;

-- When the current pause lifts by itself. NULL while paused means "until somebody
-- says otherwise" — the pause this column exists to make rarer.
ALTER TABLE branches ADD COLUMN pause_until TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- Nobody wakes up unable to sell.
--
-- Every active branch is already open for business by yesterday's rules, so
-- every active branch gets an open session dated now, with a float of zero
-- and no name on it. It reads as what it is: the till was open before anyone
-- was counting it. The first real count is the first close.
--
-- A branch that was paused stays paused — that is accepting_orders, which
-- this does not touch. Inactive branches get nothing; they cannot sell.
-- ---------------------------------------------------------------------
INSERT INTO till_sessions (restaurant_id, branch_id, opened_at, opening_float, created_at, updated_at)
SELECT b.restaurant_id, b.id, NOW(), 0, NOW(), NOW()
FROM branches b
WHERE b.active;
