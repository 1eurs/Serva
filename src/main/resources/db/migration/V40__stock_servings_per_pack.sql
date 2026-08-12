-- =====================================================================
-- Yield: "one pack makes about N servings".
--
-- A gram-level bill of materials is correct and nobody fills it in. Sixty
-- menu items times five lines each is three hundred numbers, in grams, that
-- nobody in a café knows — so RECIPE mode stays empty, and with it every
-- number that depends on it: plate cost, food-cost percent, days of cover.
--
-- The one number an owner CAN answer, standing at the machine, is how far a
-- pack goes: a kilo of beans is about fifty-five drinks. That is the same
-- fact as the recipe line, said the way the trade says it —
--
--     quantity_base = purchase_unit_size / servings_per_pack
--     1000 g / 55   = 18.18 g per drink
--
-- So this column does not introduce a second consumption engine. It is an
-- authoring shortcut: the dish editor writes ordinary recipe_lines from it,
-- and everything downstream — StockConsumptionService, plate cost, allergen
-- rollup, availability — carries on unchanged and unaware.
--
-- NULL means "not answered yet", which is different from zero and must stay
-- distinguishable: an item with no yield simply cannot price a serving.
-- =====================================================================

ALTER TABLE stock_items
    ADD COLUMN servings_per_pack NUMERIC(10,2);

COMMENT ON COLUMN stock_items.servings_per_pack IS
    'About how many servings one purchase unit yields. Authoring aid for recipe lines: '
    'quantity_base = purchase_unit_size / servings_per_pack. NULL = not answered.';
