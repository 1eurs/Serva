-- A combo is an ordinary menu item that also lists the items it bundles ("Latte + Croissant"),
-- so it keeps its own name, photo, price, options, caps and order history like any item.
-- Comma-separated menu_items ids; an id appears twice for "2 x". Null = not a combo.
ALTER TABLE menu_items ADD COLUMN combo_item_ids TEXT;
