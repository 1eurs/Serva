-- =====================================================================
-- Options draw too: a latte with almond milk pours almond milk.
--
-- A menu item's recipe says what it takes. A customer's choice can change
-- that in two ways, and both are here. It can SUBSTITUTE an ingredient —
-- "Almond Milk" means the 200 ml the latte takes come from the almond
-- carton instead of the milk, same quantity — or it can ADD one: "Extra
-- shot" is 18 g more beans on top. Bunista's whole menu is the first kind:
-- nine drinks, each with an optional choice of four other milks.
--
-- Keyed by the option's NAME, not its id, on purpose. The menu editor
-- rebuilds option rows on every save, so an id is gone the moment an
-- owner corrects a price; the name survives, and it is what the order
-- line's snapshot carries anyway. Renaming an option drops its rule,
-- which is visible and fixable; a price edit dropping it would not be.
--
-- Draws now record what the recipe ASKED for beside what was taken. The
-- shelf is put back from what was taken; usage is read from what was
-- asked, because a tin that had run out was still used — and because
-- only the draw knows whether that latte was almond.
-- =====================================================================

CREATE TABLE option_recipe_lines (
    id                     BIGSERIAL     PRIMARY KEY,
    menu_item_id           BIGINT        NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
    branch_id              BIGINT        NOT NULL REFERENCES branches (id)   ON DELETE CASCADE,
    group_name             VARCHAR(150)  NOT NULL,
    option_name            VARCHAR(150)  NOT NULL,
    -- The tin this option pours from.
    stock_item_id          BIGINT        NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
    -- Set: instead of this tin in the base recipe, same quantity. Null: an addition.
    replaces_stock_item_id BIGINT        REFERENCES stock_items (id) ON DELETE CASCADE,
    -- For an addition: how much, in a unit the tin can read.
    quantity               NUMERIC(14,3) CHECK (quantity IS NULL OR quantity > 0),
    unit                   VARCHAR(8),
    created_at             TIMESTAMPTZ   NOT NULL,
    updated_at             TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_option_recipe_shape CHECK (
        (replaces_stock_item_id IS NOT NULL AND quantity IS NULL AND unit IS NULL)
        OR (replaces_stock_item_id IS NULL AND quantity IS NOT NULL AND unit IS NOT NULL))
);
CREATE INDEX ix_option_recipe_item ON option_recipe_lines (menu_item_id, branch_id);

ALTER TABLE order_item_draws
    -- What the recipe asked for. Equal to quantity unless the count was clamped at zero.
    ADD COLUMN wanted NUMERIC(14,3);
UPDATE order_item_draws SET wanted = quantity WHERE wanted IS NULL;
ALTER TABLE order_item_draws ALTER COLUMN wanted SET NOT NULL;
