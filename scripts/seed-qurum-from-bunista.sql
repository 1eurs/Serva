-- Seed Qurum Juice (restaurant 2) with Bunista's (restaurant 6) recent basket history so the
-- "goes well with your order" cart suggestions light up. Qurum is a sandbox shop and a menu-clone
-- of Bunista; Bunista is a real shop and is READ-ONLY here — nothing of its is written or deleted.
--
-- What is copied is only the basket STRUCTURE — which items were ordered together — remapped to
-- Qurum's own cloned items by English name. No customer identity is copied: names, phones,
-- pagers, plates, notes are all left null. Timestamps are freshened into the last ~75 days so the
-- 90-day suggestion window keeps the seed alive rather than aging it out next week.
--
-- Re-runnable: it first clears its OWN prior seed (order_number 'SEED2-%') and never touches
-- Qurum's original orders. Only rows with restaurant_id = 2 are ever inserted.

BEGIN;

-- Clear a previous run of THIS seed only. order_items cascade on delete; nothing else hangs off
-- these rows (no payments / loyalty / stock were seeded), and Qurum's own orders are untouched.
DELETE FROM orders WHERE restaurant_id = 2 AND order_number LIKE 'SEED2-%';

-- Bunista item id -> Qurum item id, by unique English name (Qurum is a clone of Bunista, so the
-- names line up). Unmatched Bunista items simply have no row here and their lines are dropped.
CREATE TEMP TABLE imap ON COMMIT DROP AS
SELECT b.id AS old_id, q.id AS new_id
FROM menu_items b
JOIN menu_items q ON q.restaurant_id = 2 AND q.name_en = b.name_en
WHERE b.restaurant_id = 6;

-- The orders. order_number encodes the source id (globally unique -> also the re-run guard), and
-- lets the lines join back. Identity columns are omitted, so they land null. daily_number and
-- from_suggestion take their column defaults.
INSERT INTO orders
  (order_number, tracking_token, restaurant_id, branch_id,
   order_type, status, payment_status, payment_method,
   subtotal, vat_amount, total,
   created_at, updated_at)
SELECT
  'SEED2-' || o.id,
  'seed2-' || o.id,
  2,
  (SELECT id FROM branches WHERE restaurant_id = 2 ORDER BY id LIMIT 1),
  o.order_type, o.status, o.payment_status, o.payment_method,
  o.subtotal, o.vat_amount, o.total,
  now() - (random() * interval '75 days'),
  now()
FROM orders o
WHERE o.restaurant_id = 6
  AND o.status NOT IN ('DECLINED', 'CANCELLED')
  AND o.created_at > now() - interval '90 days'
  AND EXISTS (SELECT 1 FROM order_items oi JOIN imap m ON m.old_id = oi.menu_item_id
              WHERE oi.order_id = o.id);

-- The lines, remapped to Qurum's items. Lines whose Bunista item has no Qurum twin are dropped
-- by the join; the snapshots (name/price) are carried across as-is.
INSERT INTO order_items
  (order_id, menu_item_id, name_en_snapshot, name_ar_snapshot, price_snapshot, quantity, line_total)
SELECT
  n.id, m.new_id, oi.name_en_snapshot, oi.name_ar_snapshot, oi.price_snapshot, oi.quantity, oi.line_total
FROM order_items oi
JOIN orders src ON src.id = oi.order_id AND src.restaurant_id = 6
JOIN orders n   ON n.order_number = 'SEED2-' || src.id
JOIN imap  m    ON m.old_id = oi.menu_item_id;

COMMIT;
