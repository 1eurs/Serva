-- =====================================================================
-- Stock, second time round — the shelf and nothing else.
--
-- V38 built stock as twelve tables: a catalogue held in base units, an
-- append-only movement ledger, recipes, packaging rules, suppliers,
-- purchase orders and stocktakes. V59 dropped all of it, because what
-- owners actually opened the page to ask was "what's on the shelf?" and
-- the machinery that answered "why is it 400 g?" was the part nobody
-- used and everybody had to fill in first.
--
-- This is the question, with nothing behind it: a list of things, a
-- number beside each, and a line that says when to buy more.
--
-- The unit is stored exactly as it was typed. There is no base unit and
-- no conversion — 12 L is twelve litres, not 12000 ml. Conversion is what
-- made the old form ask for the same pack twice (count in grams, buy a
-- 1 kg bag, cost per gram), and nothing here ever has to add a kilo of
-- beans to a litre of milk.
--
-- There is no ledger either, so the quantity column IS the truth rather
-- than a cached balance. Nothing writes it but a person: a delivery adds
-- to it, a recount replaces it. Selling a coffee does not move it, which
-- is the deal — the café tells the shelf what happened, and in exchange
-- the shelf never quietly drifts away from what is in the room.
--
-- The name `stock_items` was freed by V59 and is taken back deliberately:
-- it is still the honest name for the row. The shape is not V38's, and a
-- database restored from before V59 will have been dropped and recreated
-- by the two migrations in order.
-- =====================================================================

CREATE TABLE stock_items (
    id            BIGSERIAL     PRIMARY KEY,
    restaurant_id BIGINT        NOT NULL REFERENCES restaurants (id),
    -- Stock is physical, so it belongs to the shop holding it. A café with two
    -- branches counts milk twice, because there are two fridges.
    branch_id     BIGINT        NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
    -- One name, filed under the script it was typed in (common.util.Names), the
    -- same way a café's own name is. This list is the owner's, not the customer's,
    -- so nobody is made to write "Milk" twice to save it once.
    name_en       VARCHAR(150),
    name_ar       VARCHAR(150),
    -- KG | G | L | ML | PIECE — what the number beside it counts, as typed.
    unit          VARCHAR(8)    NOT NULL,
    quantity      NUMERIC(14,3) NOT NULL DEFAULT 0,
    -- Buy more at or below this. NULL means nobody has said yet, and the tile
    -- draws no fill rather than inventing a line to fill up to.
    reorder_point NUMERIC(14,3),
    -- What one unit costs. Optional on purpose: an owner without the invoice to
    -- hand must still be able to record the stock, and a required field is a stop.
    unit_price    NUMERIC(14,3),
    -- When a person last said what was there. The figure's age is half of whether
    -- to trust it, and only the shelf knows it.
    last_moved_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL,
    updated_at    TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_stock_items_named CHECK (name_en IS NOT NULL OR name_ar IS NOT NULL),
    CONSTRAINT ck_stock_items_quantity CHECK (quantity >= 0)
);
CREATE INDEX ix_stock_items_branch ON stock_items (branch_id);

-- ---------------------------------------------------------------------
-- Access. STOCK is back in the Permission enum, so the grant V38 made and
-- V59 deleted has to be made again: everyone who can already edit the menu
-- (owners and managers) gets it. Staff accounts are deliberately left out —
-- an owner grants it to a person, one at a time, in the team editor.
-- ---------------------------------------------------------------------
INSERT INTO user_permissions (user_id, permission)
SELECT DISTINCT up.user_id, 'STOCK'
FROM user_permissions up
WHERE up.permission = 'MENU'
ON CONFLICT DO NOTHING;
