-- Daily limits are counted per branch.
--
-- daily_limit_sold and daily_limit_date sat on menu_items next to the cap, but a menu item
-- with branch_id IS NULL belongs to every branch of the restaurant — so all of them shared
-- one counter. "Twenty a day" meant twenty across the whole café: the busy branch selling
-- its twenty sold the item out at the quiet one, and a cancellation at either handed the
-- slot to the other.
--
-- The cap stays on menu_items, because it genuinely does read the same everywhere. The
-- tally against it moves here, keyed by branch, the same way stock_levels holds on-hand.

CREATE TABLE menu_item_daily_tally (
    menu_item_id BIGINT      NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    branch_id    BIGINT      NOT NULL REFERENCES branches(id)   ON DELETE CASCADE,
    -- The café-local day `sold` belongs to. A row whose date is not today has already
    -- reset, which is why one row per (item, branch) is enough and no nightly job is needed.
    tally_date   DATE        NOT NULL,
    sold         INT         NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (menu_item_id, branch_id)
);

-- The old counter cannot be split: nothing recorded which branch sold which. Today's tallies
-- therefore start over at zero. Worst case is a branch selling a few past its cap on the day
-- this ships, which is the milder error of the two — the bug being fixed refused sales at
-- branches that had sold nothing at all.
ALTER TABLE menu_items
    DROP COLUMN daily_limit_sold,
    DROP COLUMN daily_limit_date;
