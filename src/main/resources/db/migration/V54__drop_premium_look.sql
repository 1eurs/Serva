-- =====================================================================
-- "Pro look studio" was never a plan feature, and now it is not a column either.
--
-- restaurants.premium_look was a per-café grant, flipped by hand from the admin console,
-- that unlocked the structural kits and theme JSON in the menu look studio. It sat next to
-- the real entitlement grid (plan_features, V51) answering the same kind of question in a
-- completely different way: the grid is bought with a tier and read by Entitlements, while
-- this was a favour granted per café and read straight off the restaurant row.
--
-- It also leaked into the owner's own "What's included" list, where it read as a third
-- plan feature alongside loyalty and analytics — so a Standard café saw a line item for
-- something no plan sells and no page lets them buy.
--
-- The admin UI that set it was removed some time ago, which left the flag unreachable:
-- every café on production is false, and no café can be made true. The studio's controls
-- are simply open now, so this drops the flag rather than migrating it into plan_features.
-- Nothing about it needs preserving: no row was ever true.
-- =====================================================================

ALTER TABLE restaurants DROP COLUMN premium_look;
