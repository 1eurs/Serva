-- Create the Thai Ice café (restaurant 7) + owner + branch + PRO trial subscription + menu.
-- Thai Ice, Al Haweel / Sohar, Oman. Source: Talabat vendor 1113753. Currency OMR.
-- Menu items are restaurant-wide (branch_id NULL), matching the Bunista/Qurum convention.
-- Owner login: thaiice@serva.om / thaiice123 (bcrypt hash below; simple password, change later).
-- One transaction; rolls back on any error.

BEGIN;

DO $$
DECLARE
  rid  bigint;   -- new restaurant id
  uid  bigint;   -- new owner user id
  cat_desserts bigint;
  cat_drinks   bigint;
  -- bcrypt($2b$10$) of the simple password 'thaiice123'.
  owner_hash   varchar := '$2b$10$WXkb0Fg61nlFfL1SWweAyO2XPke0fV2G3BNmnL8Y6aaaJQlxrL2W2';
BEGIN
  -- Restaurant (active, PRO, OMR, VAT default 5%).
  INSERT INTO restaurants (name, name_en, name_ar, slug, currency, plan, active, created_at, updated_at)
  VALUES ('Thai Ice', 'Thai Ice', 'تاي ايس', 'thai-ice', 'OMR', 'PRO', TRUE, now(), now())
  RETURNING id INTO rid;

  -- Owner user (active, full owner permission set).
  INSERT INTO users (full_name, full_name_en, full_name_ar, email, username, phone,
                     password_hash, restaurant_id, owner, active, created_at, updated_at)
  VALUES ('Thai Ice Owner', 'Thai Ice Owner', 'تاي ايس', 'thaiice@serva.om', 'thaiice@serva.om', NULL,
          owner_hash, rid, TRUE, TRUE, now(), now())
  RETURNING id INTO uid;

  INSERT INTO user_permissions (user_id, permission) VALUES
      (uid, 'ORDERS'),
      (uid, 'PAYMENTS'),
      (uid, 'MENU'),
      (uid, 'QR_TABLES'),
      (uid, 'TEAM'),
      (uid, 'ANALYTICS'),
      (uid, 'PROFILE'),
      (uid, 'BRANCHES'),
      (uid, 'STOCK');

  -- Default branch (name mirrors the café in both languages).
  INSERT INTO branches (restaurant_id, name, name_en, name_ar, active, created_at, updated_at)
  VALUES (rid, 'Thai Ice', 'Thai Ice', 'تاي ايس', TRUE, now(), now());

  -- PRO yearly trial subscription (matches the onboarding flow: TRIAL, bank transfer, 12-month term).
  INSERT INTO subscriptions (restaurant_id, price, status, billing_cycle, tier, payment_method,
                             start_date, end_date, created_at, updated_at)
  VALUES (rid, 240.000, 'TRIAL', 'YEARLY', 'PRO', 'BANK_TRANSFER',
          CURRENT_DATE, CURRENT_DATE + INTERVAL '12 months', now(), now());

  -- Categories.
  INSERT INTO menu_categories (restaurant_id, branch_id, name_en, name_ar, display_order, active, course_type, created_at, updated_at)
  VALUES (rid, NULL, 'Desserts', 'الحلويات', 1, TRUE, 'DESSERT', now(), now())
  RETURNING id INTO cat_desserts;

  INSERT INTO menu_categories (restaurant_id, branch_id, name_en, name_ar, display_order, active, course_type, created_at, updated_at)
  VALUES (rid, NULL, 'Drinks', 'المشروبات', 2, TRUE, 'DRINK', now(), now())
  RETURNING id INTO cat_drinks;

  -- Desserts
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'Pudding', 'بودينج', 'A smooth creamy dessert with a rich texture and a balanced sweet taste', NULL, 1.8, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D8%A8%D9%88%D8%AF%D9%8A%D9%86%D8%AC639173299908154151.jpg', TRUE, 1, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'Acai Bowl', 'أساي بول', 'Smooth and creamy acai bowl topped with fresh granola, sliced tropical fruits, and a drizzle of honey for a refreshing and nutritious dessert', NULL, 2.3, 'https://talabat.dhmedia.io/image/global-menu-service/TB_OM/vendor/1113753/product/e9cd1fc3-9f8f-4b6b-834f-8dfa37f63dda.jpg', TRUE, 2, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'Pudding Lotus', 'بودينج لوتس', 'Creamy Lotus pudding dessert with a delightfully sweet taste and smooth ice cream texture that melts on your palate', NULL, 2.2, 'https://talabat.dhmedia.io/image/global-menu-service/TB_OM/vendor/1113753/product/98f5c737-be16-403b-b1e9-6f65aed47b8d.jpg', TRUE, 3, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'Churros & Nachos Mix', 'تشورز وناتشوز مكس', 'A delicious mix combining churros and nachos with a flavorful sauce and a crispy touch', NULL, 2.0, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D8%AA%D8%B4%D9%88%D9%88%D8%B1%D8%B2__%D9%86%D8%A7%D8%AA%D8%B4%D9%88%D8%B2_%D9%85%D9%83%D8%B3639173302398447874.jpg', TRUE, 4, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'Caramelized French Toast', 'فرنش توست مكرمل', 'Soft french toast topped with a rich caramel layer, with a sweet and distinctive flavor', NULL, 1.8, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D9%81%D8%B1%D9%86%D8%B4_%D8%AA%D9%88%D8%B3%D8%AA_%D9%85%D9%83%D8%B1%D9%85%D9%84639173300158447367.jpg', TRUE, 5, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'Matilda', 'ماتيلدا', 'A luxurious chocolate cake with a rich taste and soft texture for chocolate lovers', NULL, 1.8, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D9%85%D8%A7%D8%AA%D9%8A%D9%84%D8%AF%D8%A7639173300334896667.jpg', TRUE, 6, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'Madrid Cheesecake', 'تشيز كيك مدريد', 'A creamy cheesecake with a Madrid-style, rich in flavor and smooth in texture', NULL, 1.8, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D8%AA%D8%B4%D9%8A%D8%B2_%D9%83%D9%8A%D9%83_%D9%85%D8%AF%D8%B1%D9%8A%D8%AF639173300581587855.jpg', TRUE, 7, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'Large French Toast', 'فرنش توست كبير', 'Large-sized french toast, soft and rich in sauce, suitable for sharing', NULL, 2.3, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D9%81%D8%B1%D9%86%D8%B4_%D8%AA%D9%88%D8%B3%D8%AA_%D9%83%D8%A8%D9%8A%D8%B1639173300658176144.jpg', TRUE, 8, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'French Toast Ice Cream', 'فرنش توست ايسكريم', 'Warm french toast served with ice cream and a flavorful sweet sauce', NULL, 1.6, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D9%81%D8%B1%D9%86%D8%B4_%D8%AA%D9%88%D8%B3%D8%AA_%D8%A7%D9%8A%D8%B3%D9%83%D8%B1%D9%8A%D9%85639173300961044815.jpg', TRUE, 9, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_desserts, 'Churros', 'تشورز', 'Churro pieces, crispy on the outside and soft on the inside, served with a delicious sauce', NULL, 1.8, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D8%AA%D8%B4%D9%88%D8%B1%D8%B2639173301030287677.jpg', TRUE, 10, now(), now());

  -- Drinks
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_drinks, 'Thai Ice Jamaica', 'تاي ايس جمايكا', 'A refreshing thai ice drink with a distinctive jamaica flavor and a cold, delicious taste', NULL, 0.7, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D8%AA%D8%A7%D9%8A_%D8%A7%D9%8A%D8%B3_%D8%AC%D9%85%D8%A7%D9%8A%D9%83%D8%A7639173301381769024.jpg', TRUE, 1, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_drinks, 'Acai', 'أساي', 'A healthy acai drink, made from fresh, antioxidant-rich acai berries, served cold and refreshing with fresh fruit and honey', NULL, 1.7, 'https://talabat.dhmedia.io/image/global-menu-service/TB_OM/vendor/1102632/product/f2c2b43b-fd90-4ef5-9da2-4a203a85d134.jpg', TRUE, 2, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_drinks, 'Thai Ice Lotus', 'تاي ايس لوتس', 'A cold thai ice drink with a rich and sweet lotus flavor', NULL, 0.7, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D8%AA%D8%A7%D9%8A_%D8%A7%D9%8A%D8%B3_%D9%84%D9%88%D8%AA%D8%B3639173301476058930.jpg', TRUE, 3, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_drinks, 'Thai Ice Strawberry', 'تاي ايس فراولة', 'A refreshing thai ice drink with strawberry flavor and a light creamy texture', NULL, 0.7, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D8%AA%D8%A7%D9%8A_%D8%A7%D9%8A%D8%B3_%D9%81%D8%B1%D8%A7%D9%88%D9%84%D8%A9639173301545636426.jpg', TRUE, 4, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_drinks, 'Thai Ice Pistachio', 'تاي ايس بستاشيو', 'A cold thai ice drink with a rich and smooth pistachio flavor', NULL, 0.8, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D8%AA%D8%A7%D9%8A_%D8%A7%D9%8A%D8%B3_%D8%A8%D8%B3%D8%AA%D8%A7%D8%B4%D9%8A%D9%88639173301626425432.jpg', TRUE, 5, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_drinks, 'Ice Tea Peach', 'ايس تي خوخ', 'Iced tea with refreshing peach flavor and a touch of fruity sweetness', NULL, 0.7, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D8%A7%D9%8A%D8%B3_%D8%AA%D9%8A_%D8%AE%D9%88%D8%AE639173301746089801.jpg', TRUE, 6, now(), now());
    INSERT INTO menu_items (restaurant_id, branch_id, category_id, name_en, name_ar, description_en, description_ar,
                            price, image_url, available, display_order, created_at, updated_at)
    VALUES (rid, NULL, cat_drinks, 'Hibiscus', 'كركديه', 'A refreshing hibiscus drink with a light fruity taste and an attractive color', NULL, 0.7, 'https://talabat.dhmedia.io/image/talabat/MenuItems/%D9%83%D8%B1%D9%83%D8%AF%D9%8A%D9%87639173301850943617.jpg', TRUE, 7, now(), now());

  RAISE NOTICE 'Thai Ice created: restaurant=%, owner=%', rid, uid;
END $$;

COMMIT;
