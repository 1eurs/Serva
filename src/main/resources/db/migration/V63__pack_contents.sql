-- =====================================================================
-- What one piece holds.
--
-- A café counts milk in bottles and pours it in millilitres. V60 counts
-- the bottles — "12 pieces" is what the fridge says — and V62 lets a
-- recipe ask for 200 ml. Between the two there was no bridge: a piece
-- had no contents, so a latte could only be written as "0.2 pieces of
-- milk", which nobody writes, and the editor refused ml against a shelf
-- counted in pieces.
--
-- So a piece may say what it holds. "Each one is 1 L" is one fact typed
-- once, on the shelf item, and it is the whole bridge: the wall goes on
-- counting bottles, a sale goes on drawing one bottle, and a recipe in
-- millilitres is read as the fraction of a bottle it is.
--
-- Optional, and only for things counted in pieces — a shelf in kilos
-- already speaks grams. Contents are a weight or a volume, never pieces:
-- "a sleeve of 50 cups" would make a recipe line reading "1" ambiguous
-- between the cup and the sleeve, and that ambiguity is worse than
-- counting cups one at a time.
-- =====================================================================

ALTER TABLE stock_items
    ADD COLUMN pack_size NUMERIC(14,3),
    -- KG | G | L | ML — what pack_size is measured in.
    ADD COLUMN pack_unit VARCHAR(8),
    ADD CONSTRAINT ck_stock_items_pack_pair CHECK ((pack_size IS NULL) = (pack_unit IS NULL)),
    ADD CONSTRAINT ck_stock_items_pack_size CHECK (pack_size IS NULL OR pack_size > 0),
    ADD CONSTRAINT ck_stock_items_pack_only_pieces CHECK (pack_unit IS NULL OR unit = 'PIECE');
