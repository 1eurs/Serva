-- Clone Bunista (restaurant 6, branch 8) into Qurum Juice (restaurant 2, branches 3 & 4).
-- Menu categories + items are restaurant-wide (branch_id NULL) in the source, so they
-- clone the same way. Stock / recipes / option-recipes are per-branch, so a full copy is
-- laid down in EACH Qurum branch (3 = Qurum Beach, 4 = Al Mouj) with its own stock rows
-- and recipe lines pointing at that branch's copies.
--
-- Wipes Qurum's existing menu + stock first (owner authorised). Wrapped in one transaction.

BEGIN;

-- 1. Clear Qurum's current data. FK cascades handle children; items go before their
--    categories (menu_items.category_id is NO ACTION).
DELETE FROM menu_items      WHERE restaurant_id = 2;
DELETE FROM menu_categories WHERE restaurant_id = 2;
DELETE FROM stock_items     WHERE restaurant_id = 2;

DO $$
DECLARE
  src_rest    CONSTANT bigint   := 6;
  dst_rest    CONSTANT bigint   := 2;
  src_branch  CONSTANT bigint   := 8;
  dst_branches CONSTANT bigint[] := ARRAY[3, 4];
  cat  RECORD; itm RECORD; grp RECORD; opt RECORD; img RECORD; s RECORD;
  new_cat_id  bigint;
  new_item_id bigint;
  new_grp_id  bigint;
  new_stock_id bigint;
  b bigint;
BEGIN
  CREATE TEMP TABLE cat_map   (old_id bigint, new_id bigint) ON COMMIT DROP;
  CREATE TEMP TABLE item_map  (old_id bigint, new_id bigint) ON COMMIT DROP;
  CREATE TEMP TABLE stock_map (branch_id bigint, old_id bigint, new_id bigint) ON COMMIT DROP;

  -- Categories (restaurant-wide)
  FOR cat IN SELECT * FROM menu_categories WHERE restaurant_id = src_rest ORDER BY id LOOP
    INSERT INTO menu_categories
      (restaurant_id, branch_id, name_en, name_ar, description_en, description_ar,
       display_order, active, created_at, updated_at)
    VALUES
      (dst_rest, NULL, cat.name_en, cat.name_ar, cat.description_en, cat.description_ar,
       cat.display_order, cat.active, now(), now())
    RETURNING id INTO new_cat_id;
    INSERT INTO cat_map VALUES (cat.id, new_cat_id);
  END LOOP;

  -- Menu items + images + option groups + options (restaurant-wide)
  FOR itm IN SELECT * FROM menu_items WHERE restaurant_id = src_rest ORDER BY id LOOP
    INSERT INTO menu_items
      (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
       price, image_url, available, preparation_time_minutes, display_order,
       created_at, updated_at, discount_type, discount_value, discount_starts_at, discount_ends_at)
    VALUES
      (dst_rest, NULL, (SELECT new_id FROM cat_map WHERE old_id = itm.category_id),
       itm.name_en, itm.name_ar, itm.description_en, itm.description_ar,
       itm.price, itm.image_url, itm.available, itm.preparation_time_minutes, itm.display_order,
       now(), now(), itm.discount_type, itm.discount_value, itm.discount_starts_at, itm.discount_ends_at)
    RETURNING id INTO new_item_id;
    INSERT INTO item_map VALUES (itm.id, new_item_id);

    FOR img IN SELECT * FROM menu_item_images WHERE menu_item_id = itm.id LOOP
      INSERT INTO menu_item_images (menu_item_id, url, display_order)
      VALUES (new_item_id, img.url, img.display_order);
    END LOOP;

    FOR grp IN SELECT * FROM menu_item_option_groups WHERE menu_item_id = itm.id ORDER BY id LOOP
      INSERT INTO menu_item_option_groups
        (menu_item_id, name_en, name_ar, selection_type, required, display_order, created_at, updated_at)
      VALUES
        (new_item_id, grp.name_en, grp.name_ar, grp.selection_type, grp.required, grp.display_order, now(), now())
      RETURNING id INTO new_grp_id;
      FOR opt IN SELECT * FROM menu_item_options WHERE option_group_id = grp.id ORDER BY id LOOP
        INSERT INTO menu_item_options
          (option_group_id, name_en, name_ar, price_delta, display_order, created_at, updated_at)
        VALUES
          (new_grp_id, opt.name_en, opt.name_ar, opt.price_delta, opt.display_order, now(), now());
      END LOOP;
    END LOOP;
  END LOOP;

  -- Per Qurum branch: stock, recipes, daily limits, option recipes
  FOREACH b IN ARRAY dst_branches LOOP
    DELETE FROM stock_map;  -- fresh stock id map for this branch

    FOR s IN SELECT * FROM stock_items WHERE restaurant_id = src_rest AND branch_id = src_branch ORDER BY id LOOP
      INSERT INTO stock_items
        (restaurant_id, branch_id, name_en, name_ar, unit, quantity, reorder_point, unit_price,
         last_moved_at, created_at, updated_at, pack_size, pack_unit)
      VALUES
        (dst_rest, b, s.name_en, s.name_ar, s.unit, s.quantity, s.reorder_point, s.unit_price,
         s.last_moved_at, now(), now(), s.pack_size, s.pack_unit)
      RETURNING id INTO new_stock_id;
      INSERT INTO stock_map VALUES (b, s.id, new_stock_id);
    END LOOP;

    INSERT INTO recipe_lines (menu_item_id, branch_id, stock_item_id, quantity, unit, created_at, updated_at)
    SELECT im.new_id, b, sm.new_id, r.quantity, r.unit, now(), now()
    FROM recipe_lines r
    JOIN item_map  im ON im.old_id = r.menu_item_id
    JOIN stock_map sm ON sm.old_id = r.stock_item_id AND sm.branch_id = b
    WHERE r.branch_id = src_branch;

    INSERT INTO menu_item_stock (menu_item_id, branch_id, daily_limit, created_at, updated_at)
    SELECT im.new_id, b, ms.daily_limit, now(), now()
    FROM menu_item_stock ms
    JOIN item_map im ON im.old_id = ms.menu_item_id
    WHERE ms.branch_id = src_branch;

    INSERT INTO option_recipe_lines
      (menu_item_id, branch_id, group_name, option_name, stock_item_id, replaces_stock_item_id,
       quantity, unit, created_at, updated_at)
    SELECT im.new_id, b, o.group_name, o.option_name, sm.new_id, sm2.new_id, o.quantity, o.unit, now(), now()
    FROM option_recipe_lines o
    JOIN item_map  im  ON im.old_id  = o.menu_item_id
    JOIN stock_map sm  ON sm.old_id  = o.stock_item_id          AND sm.branch_id  = b
    LEFT JOIN stock_map sm2 ON sm2.old_id = o.replaces_stock_item_id AND sm2.branch_id = b
    WHERE o.branch_id = src_branch;
  END LOOP;
END $$;

COMMIT;
