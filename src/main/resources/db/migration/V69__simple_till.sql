-- =====================================================================
-- The till, without the settings.
--
-- V67 shipped the drawer with four knobs beside it — an off switch, a
-- blind count, carrying the float overnight, a threshold for demanding
-- a written reason — and a pause that could carry its own expiry. All
-- of it was defensible and none of it was asked for. What a café does
-- with a till is: type what is in the drawer in the morning, type what
-- is in it at night, see the difference. That is the whole feature now.
-- =====================================================================

ALTER TABLE branches
    DROP COLUMN IF EXISTS till_enabled,
    DROP COLUMN IF EXISTS till_blind_count,
    DROP COLUMN IF EXISTS till_carry_float,
    DROP COLUMN IF EXISTS till_note_over,
    DROP COLUMN IF EXISTS pause_until;

ALTER TABLE till_sessions DROP COLUMN IF EXISTS close_note;

-- A branch that had turned the till off and then let its session close had no drawer
-- and no need of one. It has one again now, so it gets the same deal V67 gave every
-- branch on day one: an open, uncounted session, so nobody wakes up unable to sell.
INSERT INTO till_sessions (restaurant_id, branch_id, opened_at, opening_float, created_at, updated_at)
SELECT b.restaurant_id, b.id, NOW(), 0, NOW(), NOW()
FROM branches b
WHERE b.active
  AND NOT EXISTS (SELECT 1 FROM till_sessions s WHERE s.branch_id = b.id AND s.closed_at IS NULL);
