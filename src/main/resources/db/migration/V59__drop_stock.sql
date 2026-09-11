-- =====================================================================
-- Remove stock & inventory.
--
-- Everything V38 introduced, plus what V40/V41/V48 added to it: the
-- catalogue, the ledger, recipes, packaging, suppliers, purchase orders,
-- stocktakes and the daily-limit tally, along with the hooks those tables
-- put on menu_items, menu_item_options and restaurants.
--
-- The earlier migrations stay in place — they are the history a deployed
-- database has already applied, and deleting them would fail validation.
-- This is the undo, written forward.
--
-- Menu availability is untouched: `available` has been the owner's own
-- decision since V47, so nothing here takes an item off sale or puts one
-- back on.
-- =====================================================================

-- Hooks first: these columns are what point at the tables below.
ALTER TABLE menu_items
    DROP COLUMN IF EXISTS stock_mode,
    DROP COLUMN IF EXISTS stock_item_id,
    DROP COLUMN IF EXISTS daily_limit,
    DROP COLUMN IF EXISTS packaging_rule_id;

ALTER TABLE menu_item_options
    DROP COLUMN IF EXISTS packaging_rule_id;

ALTER TABLE restaurants
    DROP COLUMN IF EXISTS disposables_for_dine_in,
    -- Only ever meant "may stock hide an item by itself?", which is no longer a question.
    DROP COLUMN IF EXISTS auto_hide_out_of_stock;

-- Then the tables, children before parents.
DROP TABLE IF EXISTS menu_item_daily_tally;
DROP TABLE IF EXISTS stocktake_lines;
DROP TABLE IF EXISTS stocktakes;
DROP TABLE IF EXISTS purchase_order_lines;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS packaging_rule_lines;
DROP TABLE IF EXISTS packaging_rules;
DROP TABLE IF EXISTS recipe_lines;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS stock_levels;
DROP TABLE IF EXISTS stock_items;
DROP TABLE IF EXISTS suppliers;

-- Finally the grants and the entitlement. Both are read back into Java enums that no
-- longer have these constants, so leaving the rows behind would break every load.
DELETE FROM user_permissions WHERE permission = 'STOCK';
DELETE FROM plan_features    WHERE feature    = 'STOCK_INSIGHTS';
