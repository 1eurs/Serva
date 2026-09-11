-- =====================================================================
-- The shelf meets the menu: countable goods and daily limits.
--
-- V60 put the shelf back as one table that only a person moves. This
-- lets a sale move it too — but only where the owner has said, per menu
-- item, "this IS that box of croissants". One sale draws one unit. No
-- recipes, no unit conversion, no estimate: the things a café actually
-- runs out of are countable, and counting them is exact.
--
-- A menu item belongs to the restaurant and a shelf row belongs to a
-- branch (two branches, two fridges), so the link between them has to
-- name the branch. That is menu_item_stock: for THIS branch, this menu
-- item is backed by that shelf row and/or capped at this many a day.
-- V47 is the history behind the shape — stock once wrote a computed
-- "sold out" onto menu_items, which every branch shares, and one branch
-- running out took the item off sale everywhere. Nothing here writes to
-- menu_items. Availability is worked out per branch when it is asked for.
--
-- Every draw is recorded on the order line that made it, so a cancel
-- puts back exactly what was taken even if the link has since changed,
-- the count was clamped at zero, or the shelf row is gone. The order
-- carries one timestamp saying a draw is outstanding; that single mark
-- is what keeps a double accept or a double cancel from moving stock
-- twice. Four paths reach these transitions and two of them land in the
-- same state, so the mark matters more than it looks.
--
-- The daily tally counts EVERY accepted line, whether or not the item has
-- a limit. A limit set at two in the afternoon then honestly includes the
-- morning's sales, rather than starting from nothing — and "sold today,
-- per item, per branch" is the figure recipes will read usage from.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The rule: what backs a menu item at a branch, and/or how many a day.
-- ---------------------------------------------------------------------
CREATE TABLE menu_item_stock (
    id            BIGSERIAL   PRIMARY KEY,
    menu_item_id  BIGINT      NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
    branch_id     BIGINT      NOT NULL REFERENCES branches (id)   ON DELETE CASCADE,
    -- One sale draws one of this. NULL = not backed by the shelf. Losing the shelf row
    -- unlinks the item rather than blocking the delete, and an unlinked item is never
    -- hidden — silence is the safe default. Same-branch is enforced by the service.
    stock_item_id BIGINT      REFERENCES stock_items (id) ON DELETE SET NULL,
    -- At most this many a café day. NULL = no cap.
    daily_limit   INTEGER     CHECK (daily_limit > 0),
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_menu_item_stock UNIQUE (menu_item_id, branch_id)
);
CREATE INDEX ix_menu_item_stock_branch ON menu_item_stock (branch_id);
CREATE INDEX ix_menu_item_stock_item   ON menu_item_stock (stock_item_id);

-- ---------------------------------------------------------------------
-- What each order took, written on the line that took it.
-- ---------------------------------------------------------------------
ALTER TABLE orders
    -- Set when the order's draw is made, cleared when it is put back. Null means nothing is
    -- outstanding, so a restore does nothing and a second draw does nothing.
    ADD COLUMN stock_drawn_at TIMESTAMPTZ;

ALTER TABLE order_items
    -- The shelf row this line drew from, and how much it actually got — which is less than
    -- the line's quantity when the count was clamped at zero. Restore reads these, never the
    -- current link, so a rule edited between accept and cancel cannot misdirect it.
    ADD COLUMN drawn_stock_item_id BIGINT REFERENCES stock_items (id) ON DELETE SET NULL,
    ADD COLUMN drawn_qty           NUMERIC(14,3);

-- ---------------------------------------------------------------------
-- Sold today, per item, per branch. Every accepted line, limit or not.
-- ---------------------------------------------------------------------
CREATE TABLE menu_item_daily_tally (
    id           BIGSERIAL   PRIMARY KEY,
    menu_item_id BIGINT      NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
    branch_id    BIGINT      NOT NULL REFERENCES branches (id)   ON DELETE CASCADE,
    -- The café's own day (Asia/Muscat), not UTC — midnight UTC is four in the morning here.
    cafe_day     DATE        NOT NULL,
    sold         INTEGER     NOT NULL DEFAULT 0 CHECK (sold >= 0),
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_menu_item_daily_tally UNIQUE (menu_item_id, branch_id, cafe_day)
);
CREATE INDEX ix_daily_tally_branch_day ON menu_item_daily_tally (branch_id, cafe_day);

-- ---------------------------------------------------------------------
-- The switch. Off by default: nothing changes for any café until its
-- owner turns it on, and even then only for items they have linked.
-- Daily limits are not behind it — an owner who typed "12 today" has
-- already said what they want.
-- ---------------------------------------------------------------------
ALTER TABLE restaurants
    ADD COLUMN hide_when_out_of_stock BOOLEAN NOT NULL DEFAULT FALSE;
