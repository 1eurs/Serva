-- =====================================================================
-- A café's name in both languages, the way its menu items already are.
--
-- Everything the product shows a person is bilingual — items, categories,
-- options, every label in the UI — except the two nouns printed largest:
-- the café and the branch. Those were one column, filled in with whatever
-- the owner typed, which in Oman is Arabic. So the English UI reads
--
--     عصير و قهوة القرم   |   qurum-juice   |   114.766 OMR   |   Active
--
-- and the demo has to be apologised for. The branch line on the customer
-- menu had the opposite problem: the page already asked for a bilingual
-- branch name and the API had none to give, so it rendered nothing at all.
--
-- So: name_en / name_ar, exactly the menu-item pattern, both nullable
-- because a café may genuinely only have one. The old `name` column stays
-- and stays NOT NULL — receipts, loyalty cards and welcome emails read it —
-- but it is no longer typed into. The entity keeps it in step (Arabic if
-- there is Arabic, otherwise English), so nothing downstream changes.
--
-- Backfill reads the existing name and files it under the script it is
-- written in. Where that leaves a café with no English name, the slug is
-- the English name it already chose for itself — qurum-juice was never
-- anything but "Qurum Juice" — so title-casing it beats showing Arabic in
-- an English page. It is a guess, and it is editable in the admin drawer.
-- A branch named after its café (what onboarding does by default) inherits
-- that café's English name rather than guessing a second time.
-- =====================================================================

ALTER TABLE restaurants
    ADD COLUMN name_en VARCHAR(150),
    ADD COLUMN name_ar VARCHAR(150);

ALTER TABLE branches
    ADD COLUMN name_en VARCHAR(150),
    ADD COLUMN name_ar VARCHAR(150);

-- ---- restaurants: file the existing name under its own script ----
UPDATE restaurants SET name_ar = name WHERE name ~ E'[؀-ۿ]';
UPDATE restaurants SET name_en = name WHERE name_ar IS NULL;

-- Arabic-only cafés borrow the English name they already published as their slug.
UPDATE restaurants
   SET name_en = initcap(replace(slug, '-', ' '))
 WHERE name_en IS NULL
   AND slug IS NOT NULL
   AND slug <> '';

-- ---- branches: same rule ----
UPDATE branches SET name_ar = name WHERE name ~ E'[؀-ۿ]';
UPDATE branches SET name_en = name WHERE name_ar IS NULL;

-- A branch still carrying its café's name (onboarding's default) takes that café's
-- English name too, instead of a second guess at the same words.
UPDATE branches b
   SET name_en = r.name_en
  FROM restaurants r
 WHERE b.restaurant_id = r.id
   AND b.name_en IS NULL
   AND b.name = r.name;

COMMENT ON COLUMN restaurants.name_en IS
    'English name, shown when the UI language is English. NULL = not given; the UI falls back to name_ar.';
COMMENT ON COLUMN restaurants.name_ar IS
    'Arabic name, shown when the UI language is Arabic. NULL = not given; the UI falls back to name_en.';
COMMENT ON COLUMN restaurants.name IS
    'Legacy single name, kept in step with the pair above by the entity (Arabic preferred). '
    'Read by receipts, loyalty cards and emails; never typed into directly.';
COMMENT ON COLUMN branches.name_en IS
    'English branch name, shown when the UI language is English. NULL falls back to name_ar.';
COMMENT ON COLUMN branches.name_ar IS
    'Arabic branch name, shown when the UI language is Arabic. NULL falls back to name_en.';
