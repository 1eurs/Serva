-- =====================================================================
-- Stock & inventory.
--
-- The vendor climbs an effort ladder, one rung at a time, per menu item
-- (menu_items.stock_mode):
--
--   NONE        nothing tracked (the default — inventory is opt-in)
--   DAILY_LIMIT "only 12 cheesecakes today", auto-resets each café day.
--               No counting, no recipes, no drift.
--   SIMPLE      a countable good: the item is backed by one stock_item of
--               base_unit PIECE and consumes 1 per sale.
--   RECIPE      made from ingredients: 18 g beans + 200 ml milk + a cup.
--
-- SIMPLE is not a separate engine — it is a RECIPE with a single line of
-- quantity 1 against an auto-created PIECE stock item. One consumption
-- path to reason about, two faces in the UI.
--
-- Everything is held in BASE UNITS (g / ml / piece). The vendor buys in
-- purchase units ("1 kg bag" = 1000 g, "carton of 12" = 12 pieces) and
-- stock_items.purchase_unit_size converts. Storing base units means a
-- recipe never has to care what the delivery looked like.
--
-- stock_movements is the append-only truth; stock_levels.quantity_base is
-- a cached balance kept in the same transaction. Never UPDATE a level
-- without writing the matching movement — the ledger is what answers
-- "why does it say 400 g?".
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catalogue: everything the café holds
-- ---------------------------------------------------------------------
CREATE TABLE stock_items (
    id                 BIGSERIAL     PRIMARY KEY,
    restaurant_id      BIGINT        NOT NULL REFERENCES restaurants (id),
    name_en            VARCHAR(150)  NOT NULL,
    name_ar            VARCHAR(150)  NOT NULL,
    -- INGREDIENT = consumed by recipes (beans, milk, syrup)
    -- GOOD       = a countable finished thing (croissant, bottled water); backs SIMPLE items
    -- PREP       = made in-house from other stock (simple syrup, a tray of cookies).
    --              Its own recipe lines hang off recipe_lines.prep_item_id and one batch
    --              yields batch_yield_base of this item.
    kind               VARCHAR(16)   NOT NULL,
    base_unit          VARCHAR(8)    NOT NULL,          -- G | ML | PIECE
    -- Display-only label for how the café buys it, and how many base units that is.
    purchase_unit_label VARCHAR(60),
    purchase_unit_size NUMERIC(14,3) NOT NULL DEFAULT 1,
    -- Rolling average cost, in base units, maintained on every RECEIVE. Drives plate cost.
    cost_per_base_unit NUMERIC(14,6) NOT NULL DEFAULT 0,
    -- Expected yield loss (grinder retention, trim, spillage) as a percent. A recipe asking
    -- for 18 g of a bean with waste_pct 2 actually draws 18.36 g.
    waste_pct          NUMERIC(6,3)  NOT NULL DEFAULT 0,
    -- Batch size for PREP items: one production run yields this many base units.
    batch_yield_base   NUMERIC(14,3),
    category           VARCHAR(60),
    -- How often this item should come up in a cycle count. Espresso beans daily,
    -- napkins never. NULL = never surface it in the count rotation.
    count_frequency    VARCHAR(16),                     -- DAILY | WEEKLY | MONTHLY
    -- Comma-separated allergen keys (DAIRY, GLUTEN, NUTS, SOY, EGG, SESAME, FISH,
    -- SHELLFISH). Rolled up along recipes to label menu items for customers.
    allergens          VARCHAR(200),
    -- Per-100-base-unit nutrition as a JSON object, rolled up the same way. Optional.
    nutrition_json     TEXT,
    supplier_id        BIGINT,                          -- FK added after suppliers exists
    archived           BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ   NOT NULL,
    updated_at         TIMESTAMPTZ   NOT NULL
);
CREATE INDEX ix_stock_items_restaurant ON stock_items (restaurant_id, archived);

-- ---------------------------------------------------------------------
-- On-hand, per branch. Stock is always physical, so always branch-scoped.
-- ---------------------------------------------------------------------
CREATE TABLE stock_levels (
    stock_item_id      BIGINT        NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
    branch_id          BIGINT        NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
    quantity_base      NUMERIC(14,3) NOT NULL DEFAULT 0,
    -- Target level to restock up to, and the level that triggers a low-stock alert.
    par_level_base     NUMERIC(14,3),
    reorder_point_base NUMERIC(14,3),
    updated_at         TIMESTAMPTZ   NOT NULL,
    CONSTRAINT pk_stock_levels PRIMARY KEY (stock_item_id, branch_id)
);
CREATE INDEX ix_stock_levels_branch ON stock_levels (branch_id);

-- ---------------------------------------------------------------------
-- The ledger. Append-only; every row is signed and carries the resulting
-- balance so an audit never has to replay from zero.
-- ---------------------------------------------------------------------
CREATE TABLE stock_movements (
    id                 BIGSERIAL     PRIMARY KEY,
    stock_item_id      BIGINT        NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
    branch_id          BIGINT        NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
    delta_base         NUMERIC(14,3) NOT NULL,          -- signed: + in, - out
    -- RECEIVE | SALE | WASTE | COUNT | TRANSFER_IN | TRANSFER_OUT
    -- | MANUAL | ORDER_RESTORE | PREP_PRODUCE | PREP_CONSUME
    reason             VARCHAR(24)   NOT NULL,
    balance_after      NUMERIC(14,3) NOT NULL,
    -- Why it was thrown away. Staff meals and comps are a large hidden cost bucket,
    -- so they get first-class reasons rather than hiding inside a free-text note.
    -- SPILLED | EXPIRED | STAFF_MEAL | COMP | TRAINING | DAMAGED | OTHER
    waste_reason       VARCHAR(20),
    order_id           BIGINT        REFERENCES orders (id) ON DELETE SET NULL,
    user_id            BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    unit_cost          NUMERIC(14,6),
    note               VARCHAR(300),
    created_at         TIMESTAMPTZ   NOT NULL
);
CREATE INDEX ix_stock_movements_item ON stock_movements (stock_item_id, branch_id, created_at DESC);
CREATE INDEX ix_stock_movements_branch_time ON stock_movements (branch_id, created_at DESC);
-- One SALE row per (order, item) is the idempotency guard: a double-accept can't
-- deduct twice, and the restore path finds exactly what to give back.
CREATE UNIQUE INDEX ux_stock_movements_order_sale
    ON stock_movements (order_id, stock_item_id)
    WHERE reason = 'SALE';

-- ---------------------------------------------------------------------
-- The bill of materials.
--
-- Exactly one owner column is set:
--   menu_item_id        the item's own base recipe
--   menu_item_option_id a modifier's delta (extra shot = +9 g beans).
--                       quantity_base may be NEGATIVE — options work on stock
--                       exactly like they already work on price: the line is
--                       base + SUM(chosen option deltas).
--   prep_item_id        a PREP stock item's own recipe (sub-recipe / batch).
-- ---------------------------------------------------------------------
CREATE TABLE recipe_lines (
    id                  BIGSERIAL     PRIMARY KEY,
    restaurant_id       BIGINT        NOT NULL REFERENCES restaurants (id),
    menu_item_id        BIGINT        REFERENCES menu_items (id) ON DELETE CASCADE,
    menu_item_option_id BIGINT        REFERENCES menu_item_options (id) ON DELETE CASCADE,
    prep_item_id        BIGINT        REFERENCES stock_items (id) ON DELETE CASCADE,
    stock_item_id       BIGINT        NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
    quantity_base       NUMERIC(14,3) NOT NULL,
    -- ALL | DINE_IN | CAR. Lets a line apply only to one service style; the packaging
    -- tables below cover the common case, this is the manual escape hatch.
    order_type_scope    VARCHAR(10)   NOT NULL DEFAULT 'ALL',
    created_at          TIMESTAMPTZ   NOT NULL,
    updated_at          TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_recipe_line_one_owner CHECK (
        (CASE WHEN menu_item_id        IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN menu_item_option_id IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN prep_item_id        IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);
CREATE INDEX ix_recipe_lines_item   ON recipe_lines (menu_item_id);
CREATE INDEX ix_recipe_lines_option ON recipe_lines (menu_item_option_id);
CREATE INDEX ix_recipe_lines_prep   ON recipe_lines (prep_item_id);
CREATE INDEX ix_recipe_lines_stock  ON recipe_lines (stock_item_id);

-- ---------------------------------------------------------------------
-- Packaging.
--
-- Cups, lids, sleeves and straws are the most-run-out-of items in a café and
-- the most tedious to model: nobody will hand-add three lines to forty drinks.
-- So packaging is a small reusable rule ("Large hot cup" = 1 x 12oz cup +
-- 1 x 12oz lid + 1 x sleeve) mapped onto a size OPTION (or onto the item when
-- it has no size choice), and resolved at consumption time. The recipe tables
-- stay clean and re-mapping a rule doesn't rewrite thousands of BOM rows.
-- ---------------------------------------------------------------------
CREATE TABLE packaging_rules (
    id            BIGSERIAL     PRIMARY KEY,
    restaurant_id BIGINT        NOT NULL REFERENCES restaurants (id),
    name_en       VARCHAR(120)  NOT NULL,
    name_ar       VARCHAR(120)  NOT NULL,
    display_order INT           NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL,
    updated_at    TIMESTAMPTZ   NOT NULL
);
CREATE INDEX ix_packaging_rules_restaurant ON packaging_rules (restaurant_id, display_order);

CREATE TABLE packaging_rule_lines (
    id                BIGSERIAL     PRIMARY KEY,
    packaging_rule_id BIGINT        NOT NULL REFERENCES packaging_rules (id) ON DELETE CASCADE,
    stock_item_id     BIGINT        NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
    quantity_base     NUMERIC(14,3) NOT NULL DEFAULT 1
);
CREATE INDEX ix_packaging_rule_lines_rule ON packaging_rule_lines (packaging_rule_id);

-- Which rule applies. An option's rule (the size the customer picked) wins over the
-- item's default; NULL on both means the drink consumes no packaging.
ALTER TABLE menu_items        ADD COLUMN packaging_rule_id BIGINT REFERENCES packaging_rules (id) ON DELETE SET NULL;
ALTER TABLE menu_item_options ADD COLUMN packaging_rule_id BIGINT REFERENCES packaging_rules (id) ON DELETE SET NULL;

-- Some cafés serve dine-in in ceramic (no disposables), some use paper for
-- everything. Per-café switch rather than a product-wide assumption.
ALTER TABLE restaurants ADD COLUMN disposables_for_dine_in BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------
-- Menu item hooks
-- ---------------------------------------------------------------------
ALTER TABLE menu_items
    ADD COLUMN stock_mode       VARCHAR(16) NOT NULL DEFAULT 'NONE',   -- NONE|DAILY_LIMIT|SIMPLE|RECIPE
    -- SIMPLE mode: the countable good backing this item.
    ADD COLUMN stock_item_id    BIGINT REFERENCES stock_items (id) ON DELETE SET NULL,
    -- DAILY_LIMIT mode: cap and today's tally. daily_limit_date is the café-local day
    -- (Asia/Muscat) the tally belongs to; a different date means the counter has reset.
    ADD COLUMN daily_limit      INT,
    ADD COLUMN daily_limit_sold INT  NOT NULL DEFAULT 0,
    ADD COLUMN daily_limit_date DATE,
    -- TRUE when Serva switched the item off because stock ran out, as opposed to the
    -- owner deliberately switching it off. Without this, a restock would silently
    -- re-enable something the owner meant to keep hidden.
    ADD COLUMN auto_unavailable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX ix_menu_items_stock_mode ON menu_items (restaurant_id, stock_mode)
    WHERE stock_mode <> 'NONE';

-- ---------------------------------------------------------------------
-- Suppliers & purchase orders
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
    id            BIGSERIAL    PRIMARY KEY,
    restaurant_id BIGINT       NOT NULL REFERENCES restaurants (id),
    name          VARCHAR(150) NOT NULL,
    phone         VARCHAR(40),
    email         VARCHAR(150),
    notes         VARCHAR(500),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_suppliers_restaurant ON suppliers (restaurant_id, active);

ALTER TABLE stock_items
    ADD CONSTRAINT fk_stock_items_supplier
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL;

CREATE TABLE purchase_orders (
    id            BIGSERIAL    PRIMARY KEY,
    restaurant_id BIGINT       NOT NULL REFERENCES restaurants (id),
    branch_id     BIGINT       NOT NULL REFERENCES branches (id),
    supplier_id   BIGINT       REFERENCES suppliers (id) ON DELETE SET NULL,
    -- DRAFT | SENT | PARTIAL | RECEIVED | CANCELLED
    status        VARCHAR(16)  NOT NULL DEFAULT 'DRAFT',
    reference     VARCHAR(60),
    notes         VARCHAR(500),
    expected_at   DATE,
    created_by    BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ  NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_purchase_orders_branch ON purchase_orders (branch_id, status, created_at DESC);

CREATE TABLE purchase_order_lines (
    id                     BIGSERIAL     PRIMARY KEY,
    purchase_order_id      BIGINT        NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    stock_item_id          BIGINT        NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
    quantity_base          NUMERIC(14,3) NOT NULL,
    quantity_received_base NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit_cost              NUMERIC(14,6)
);
CREATE INDEX ix_purchase_order_lines_po ON purchase_order_lines (purchase_order_id);

-- ---------------------------------------------------------------------
-- Stocktakes (physical counts)
--
-- `blind` hides the expected quantity from whoever is counting. Without it,
-- counts get written to match the system and the variance number — the whole
-- point of the exercise — becomes worthless.
--
-- scope CYCLE counts only the items due per stock_items.count_frequency, which
-- is far better adhered to than a monthly count of everything.
-- ---------------------------------------------------------------------
CREATE TABLE stocktakes (
    id            BIGSERIAL    PRIMARY KEY,
    restaurant_id BIGINT       NOT NULL REFERENCES restaurants (id),
    branch_id     BIGINT       NOT NULL REFERENCES branches (id),
    status        VARCHAR(16)  NOT NULL DEFAULT 'OPEN',   -- OPEN | CLOSED | CANCELLED
    scope         VARCHAR(16)  NOT NULL DEFAULT 'FULL',   -- FULL | CYCLE
    blind         BOOLEAN      NOT NULL DEFAULT TRUE,
    notes         VARCHAR(500),
    started_by    BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    closed_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_stocktakes_branch ON stocktakes (branch_id, status, created_at DESC);

CREATE TABLE stocktake_lines (
    id            BIGSERIAL     PRIMARY KEY,
    stocktake_id  BIGINT        NOT NULL REFERENCES stocktakes (id) ON DELETE CASCADE,
    stock_item_id BIGINT        NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
    -- What the system believed at the moment the count was opened.
    expected_base NUMERIC(14,3) NOT NULL,
    -- What the staff actually found. NULL until someone counts it.
    counted_base  NUMERIC(14,3),
    unit_cost     NUMERIC(14,6),
    CONSTRAINT uq_stocktake_line UNIQUE (stocktake_id, stock_item_id)
);
CREATE INDEX ix_stocktake_lines_take ON stocktake_lines (stocktake_id);

-- ---------------------------------------------------------------------
-- Access: a new STOCK permission, granted to everyone who can already edit
-- the menu (owners and branch managers). Staff and kitchen accounts are
-- deliberately left out — an owner grants it explicitly.
-- ---------------------------------------------------------------------
INSERT INTO user_permissions (user_id, permission)
SELECT DISTINCT up.user_id, 'STOCK'
FROM user_permissions up
WHERE up.permission = 'MENU'
ON CONFLICT DO NOTHING;
