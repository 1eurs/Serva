-- =====================================================================
-- The list price is the price.
--
-- V50 made the tier a single value and deliberately LEFT the price disagreements alone —
-- its job was to stop the drift, not to decide what to bill anyone, and resolving a real
-- café's price silently inside a schema change is exactly the kind of thing that should
-- never happen in a migration nobody read.
--
-- This is that decision, taken on purpose. Only ENTERPRISE is negotiable; STANDARD and PRO
-- are list-price tiers, and SubscriptionService now derives their price from the catalogue
-- instead of accepting a typed one. That rule holds for every write from here on, but it
-- says nothing about rows written before it existed — so the table still holds prices the
-- code can no longer produce, and the invariant is only half true until they are fixed.
--
-- On the day this was written, production held exactly one such row:
--
--   Mutrah Coffee | tier PRO | 15.000 OMR MONTHLY | TRIAL
--
-- gated PRO, using PRO, paying the STANDARD list price. Two ways to end it:
--
--   * move the café to STANDARD — honest about the price, but it takes away features a
--     live café is using today, and the café did nothing wrong;
--   * charge the PRO list price for the PRO it already has.
--
-- The second. Access is the thing the café can see and depends on; the price is the thing
-- that was recorded wrong. It is also still a TRIAL, so nothing was ever invoiced at the
-- wrong number and the correction costs this café nothing today.
--
-- Written as the general rule rather than as one UPDATE naming one café: the point is that
-- afterwards NO non-negotiable subscription is off its list price, not that one known row
-- got patched. If a second one is hiding in a table this small, it goes too.
-- =====================================================================

UPDATE subscriptions s
   SET price = CASE s.billing_cycle
                   WHEN 'YEARLY' THEN p.monthly_price * 12
                   ELSE p.monthly_price
               END
  FROM pricing_plans p
 WHERE p.tier = s.tier
   AND s.tier <> 'ENTERPRISE'
   -- ONE_TIME has no catalogue basis — a lifetime deal is a negotiation by definition, and
   -- the code now refuses to create one below ENTERPRISE. An older row is left as it is
   -- rather than given an invented number; there are none in production today.
   AND s.billing_cycle IN ('MONTHLY', 'YEARLY')
   AND p.monthly_price IS NOT NULL
   AND s.price IS DISTINCT FROM (CASE s.billing_cycle
                                     WHEN 'YEARLY' THEN p.monthly_price * 12
                                     ELSE p.monthly_price
                                 END);
