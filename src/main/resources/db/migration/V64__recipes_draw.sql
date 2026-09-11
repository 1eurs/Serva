-- =====================================================================
-- The recipe is the only concept, and selling draws it.
--
-- V61 split "this menu item IS that tin" (one sale draws one — exact,
-- moves the shelf) from V62's recipe ("a latte takes 200 ml" — an
-- estimate, never moves the shelf). Principled, and wrong to use: an
-- owner writes that a latte takes milk, sells a latte, and watches the
-- milk not move. Two ways to say "this uses a croissant" with different
-- consequences, and the thing they asked for — the milk goes down, the
-- latte disappears when it is gone — never happening for a drink.
--
-- So there is one thing to say about a menu item: what it takes from the
-- shelf. A croissant takes one croissant. A latte takes 200 ml of milk
-- and 18 g of beans. Selling it draws every line. Nothing is hidden
-- unless the owner's switch is on, and then an item is sold out the
-- moment one ingredient cannot cover one more sale. "Correct the count"
-- is how drift gets fixed, and the tin's sheet says how much has been
-- used since the last count, so the figure is never a mystery.
--
-- What each line took is recorded per tin, because a latte draws from
-- two. A cancel puts back exactly those rows. The one-tin columns V61
-- put on order_items go, and so does menu_item_stock.stock_item_id —
-- every existing link becomes a one-unit recipe line first, so nothing
-- an owner set up is lost.
-- =====================================================================

-- ---------------------------------------------------------------------
-- What each order line took, per tin.
-- ---------------------------------------------------------------------
CREATE TABLE order_item_draws (
    id            BIGSERIAL     PRIMARY KEY,
    order_item_id BIGINT        NOT NULL REFERENCES order_items (id) ON DELETE CASCADE,
    -- Nulled if the tin is thrown away: the row then has nothing to give back and is skipped.
    stock_item_id BIGINT        REFERENCES stock_items (id) ON DELETE SET NULL,
    -- In the tin's own unit. Less than the recipe asked for when the count was clamped at zero.
    quantity      NUMERIC(14,3) NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL,
    updated_at    TIMESTAMPTZ   NOT NULL
);
CREATE INDEX ix_order_item_draws_line ON order_item_draws (order_item_id);
CREATE INDEX ix_order_item_draws_tin  ON order_item_draws (stock_item_id);

-- Anything drawn under the old one-tin scheme is carried over so a cancel still restores it.
INSERT INTO order_item_draws (order_item_id, stock_item_id, quantity, created_at, updated_at)
SELECT id, drawn_stock_item_id, drawn_qty, now(), now()
FROM order_items
WHERE drawn_stock_item_id IS NOT NULL AND drawn_qty IS NOT NULL AND drawn_qty > 0;

ALTER TABLE order_items
    DROP COLUMN drawn_stock_item_id,
    DROP COLUMN drawn_qty;

-- ---------------------------------------------------------------------
-- "Backed by" becomes a one-unit recipe line, then the column goes.
-- ---------------------------------------------------------------------
INSERT INTO recipe_lines (menu_item_id, branch_id, stock_item_id, quantity, unit, created_at, updated_at)
SELECT ms.menu_item_id, ms.branch_id, ms.stock_item_id, 1, s.unit, now(), now()
FROM menu_item_stock ms
JOIN stock_items s ON s.id = ms.stock_item_id
WHERE ms.stock_item_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM recipe_lines r
      WHERE r.menu_item_id = ms.menu_item_id AND r.branch_id = ms.branch_id
        AND r.stock_item_id = ms.stock_item_id);

ALTER TABLE menu_item_stock DROP COLUMN stock_item_id;

-- A rule now only ever says "at most this many a day"; one that says nothing is nothing.
DELETE FROM menu_item_stock WHERE daily_limit IS NULL;
