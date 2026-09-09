-- =====================================================================
-- One plan, not two.
--
-- A café's tier was written down in two unrelated places:
--
--   restaurants.plan        STANDARD | PRO | ENTERPRISE   — the only thing that GATES
--   subscriptions.plan_name free text                     — the only thing that BILLS
--
-- Nothing kept them in step. SubscriptionService wrote plan_name and never touched
-- restaurants.plan, so the two drifted silently in both directions: bill a café for Pro
-- and it stays gated as Standard, or flip the enum and it gets Pro for nothing. This is
-- not hypothetical — on the day this migration was written, production held
--
--   Mutrah Coffee | plan = PRO | plan_name = 'Standard' | price = 15.000
--
-- receiving every Pro feature at the Standard price, invisible from either screen.
--
-- plan_name was also carrying two different questions at once. Its live values were
-- 'Pro' (a tier), 'Annual' (a billing cycle) and 'Standard' (a tier) — sitting next to a
-- billing_cycle column that already answered the cycle question. So it is not replaced by
-- another string: the tier becomes an enum, the cycle stays where it always was, and the
-- display name comes from the pricing_plans catalogue, which has had a `tier` column
-- pointing at exactly this all along.
--
-- After this, subscriptions.tier is the single source of truth and restaurants.plan is a
-- mirror of it that only SubscriptionService writes.
-- =====================================================================

ALTER TABLE subscriptions ADD COLUMN tier VARCHAR(20);

-- Backfill from restaurants.plan, NOT from plan_name.
--
-- plan_name is the field that was never enforced; restaurants.plan is the one that has
-- actually been deciding what these cafés can open all along. Seeding from the enum keeps
-- every existing café's access exactly as it is today — this migration must not be the
-- thing that silently switches a paying customer's features off.
--
-- Where the two disagreed, the disagreement is preserved rather than resolved: the café
-- keeps the tier it has been using, and the price it has been paying stays on the row, so
-- the mismatch is now visible on the billing board instead of hidden between two tables.
UPDATE subscriptions s
   SET tier = r.plan
  FROM restaurants r
 WHERE r.id = s.restaurant_id;

-- A subscription orphaned from its café (should not exist; the FK prevents it) falls back
-- to the same default a new café gets.
UPDATE subscriptions SET tier = 'STANDARD' WHERE tier IS NULL;

ALTER TABLE subscriptions ALTER COLUMN tier SET NOT NULL;

ALTER TABLE subscriptions DROP COLUMN plan_name;

COMMENT ON COLUMN subscriptions.tier IS
    'The café tier this subscription buys. The single source of truth for feature access: '
    'restaurants.plan mirrors it, and Entitlements reads that mirror. Orthogonal to '
    'billing_cycle — "Pro" is a tier, "Annual" and "Lifetime" are cycles.';

-- The mirror is now derived. Nothing outside SubscriptionService may write it.
COMMENT ON COLUMN restaurants.plan IS
    'Mirror of the café''s active subscriptions.tier, kept so the entitlement check is a '
    'single row read. Written only by SubscriptionService; never set directly.';
