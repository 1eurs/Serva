-- Where a shop shows the cart's "goes well with your order" upsell, chosen per shop:
-- UNDER_ITEMS (default) | BEFORE_CHECKOUT | POPUP.
ALTER TABLE restaurants ADD COLUMN suggestions_placement VARCHAR(20) NOT NULL DEFAULT 'UNDER_ITEMS';

-- Marks an order line the customer added from the suggestion UI, so its revenue can be
-- attributed back to the feature. Existing rows are pre-feature, so false.
ALTER TABLE order_items ADD COLUMN from_suggestion BOOLEAN NOT NULL DEFAULT false;
