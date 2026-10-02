-- =====================================================================
-- The pause is gone; the drawer is the whole answer.
--
-- branches.accepting_orders (V28) was a boolean anyone could flip that
-- said whether the QR menu would take an order. V67 put the till behind
-- it, and the till turned out to be the question a café already asks:
-- the shop sells while a counted drawer is open. Two switches for one
-- fact meant a café could be "accepting orders" with no drawer open, or
-- sat behind a pause nobody remembered to lift.
--
-- So there is one switch now. "Can this branch take an order right now"
-- is answered by till_sessions alone — the same answer for the customer's
-- menu and the counter's order pad — and the column that used to hold
-- half of it goes.
-- =====================================================================

ALTER TABLE branches DROP COLUMN IF EXISTS accepting_orders;
