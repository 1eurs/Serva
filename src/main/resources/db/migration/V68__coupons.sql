-- =====================================================================
-- Coupons: a code the counter types in, and the items it takes money off.
--
-- A coupon here is deliberately NOT "20% off the bill". What a café actually hands
-- out is "your coffee is on us and 25% off the food" — the discount belongs to the
-- ITEM, not to the order. So a coupon carries a list of menu items, each with its
-- own percent off, and 100 means free. Anything not on the list is charged in full,
-- which is also what makes a coupon safe to hand to staff: it can only ever reach
-- the items the owner put on it.
--
-- Who the code is for is the owner's business and not a column here — the same
-- shape covers a staff meal card, an influencer code and a "sorry about that"
-- gesture. Ungated by plan: a café that cannot discount its own coffee is not a café.
-- =====================================================================

CREATE TABLE coupons (
    id             BIGSERIAL    PRIMARY KEY,
    restaurant_id  BIGINT       NOT NULL REFERENCES restaurants (id),
    -- Typed one-handed by someone holding a tray, so it is short, and stored and
    -- matched uppercase: nobody is going to get the case right at a counter.
    code           VARCHAR(24)  NOT NULL,
    -- What the receipt and the order card call it ("Staff meal"), so a discount on a
    -- printed slip is never an unexplained subtraction.
    label          VARCHAR(80)  NOT NULL,
    -- Retiring a code must not rewrite the orders that already used it, so a coupon
    -- that has been out in the world is switched off rather than deleted.
    active         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL,
    updated_at     TIMESTAMPTZ  NOT NULL,
    -- One café's codes are its own; two cafés may both hand out STAFF.
    CONSTRAINT uq_coupon_code UNIQUE (restaurant_id, code)
);

CREATE TABLE coupon_items (
    coupon_id     BIGINT NOT NULL REFERENCES coupons (id) ON DELETE CASCADE,
    -- Deleting a menu item simply drops it from the coupon, exactly as it does from a
    -- loyalty reward list (loyalty_reward_items).
    menu_item_id  BIGINT NOT NULL REFERENCES menu_items (id) ON DELETE CASCADE,
    -- 1..100, where 100 is free. Whole percents only: a café says "half price", it
    -- never says "37.4% off".
    percent_off   INT    NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
    PRIMARY KEY (coupon_id, menu_item_id)
);

-- The snapshot on the order, mirroring loyalty_reward_label / loyalty_reward_discount:
-- the stored total already has the discount taken off, and these columns are how the
-- board, the receipt and the day's takings can say why it is lower.
--
-- Code AND label, because a coupon can be renamed or switched off next week and a
-- finished order has to keep reading the way it read on the day it was paid for.
ALTER TABLE orders
    ADD COLUMN coupon_code     VARCHAR(24),
    ADD COLUMN coupon_label    VARCHAR(80),
    ADD COLUMN coupon_discount NUMERIC(12,3);
