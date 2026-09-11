-- =====================================================================
-- Recipes, for knowing.
--
-- What a latte takes: 18 g of beans, 200 ml of milk, one cup. Used to
-- answer "where did the beans go" and "how long will the milk last" —
-- and for nothing else. A recipe never moves the shelf. The number on
-- the shelf stays what a person counted (V60's promise), so there is no
-- drift to chase, no ledger to build, and a half-finished recipe list
-- still pays: model the ten busiest drinks and the rest can wait.
--
-- Usage is read from menu_item_daily_tally (V61): sold × quantity per
-- line, summed over a window. Days of cover is the shelf divided by the
-- daily average. Countable links (menu_item_stock.stock_item_id) count
-- as a one-piece recipe in the same sum, so a croissant gets a "days
-- left" too.
--
-- A recipe line is per branch, like the rule it sits beside: the shelf
-- row it names belongs to a branch, so the line must too.
--
-- Units: a line may be written in the shelf row's unit or its ×1000
-- sibling (kg↔g, L↔ml) and nothing else. That one factor is the whole
-- conversion story — deliberately not the base-unit model V38 had,
-- which made the form ask for the same pack twice.
-- =====================================================================

CREATE TABLE recipe_lines (
    id            BIGSERIAL     PRIMARY KEY,
    menu_item_id  BIGINT        NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
    branch_id     BIGINT        NOT NULL REFERENCES branches (id)   ON DELETE CASCADE,
    stock_item_id BIGINT        NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
    quantity      NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    -- KG | G | L | ML | PIECE — the shelf row's unit or its ×1000 sibling.
    unit          VARCHAR(8)    NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL,
    updated_at    TIMESTAMPTZ   NOT NULL,
    CONSTRAINT uq_recipe_line UNIQUE (menu_item_id, branch_id, stock_item_id)
);
CREATE INDEX ix_recipe_lines_branch ON recipe_lines (branch_id);
CREATE INDEX ix_recipe_lines_stock  ON recipe_lines (stock_item_id);
