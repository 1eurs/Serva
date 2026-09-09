-- =====================================================================
-- A person's name in both scripts.
--
-- V42 made the café and the branch bilingual. The people did not follow,
-- deliberately at first: a person has ONE name, and the second version is a
-- transliteration rather than a translation. But the console still reads
--
--     Team · خالد البلوشي · Owner · Active
--
-- in English, and that is the same broken half-translated page V42 set out
-- to fix. So staff and owners get the pair too.
--
-- Customers still do not, and cannot: orders.customer_name is typed once by
-- the customer at checkout, and nobody is going to ask them to spell it
-- again in the other language. loyalty_members.name and
-- customer_profiles.customer_name derive from it. Those stay single fields.
--
-- Same shape as V42: full_name stays NOT NULL as the legacy column the
-- entity keeps in step, both new columns are nullable, and the backfill
-- files the existing name under the script it is written in. There is no
-- slug to borrow a second version from the way a café could, so a name in
-- one script simply has no counterpart until a human types one — and the
-- reader falls back rather than showing a blank where a person should be.
-- =====================================================================

ALTER TABLE users
    ADD COLUMN full_name_en VARCHAR(150),
    ADD COLUMN full_name_ar VARCHAR(150);

UPDATE users SET full_name_ar = full_name WHERE full_name ~ E'[؀-ۿ]';
UPDATE users SET full_name_en = full_name WHERE full_name_ar IS NULL;

COMMENT ON COLUMN users.full_name_en IS
    'Name in Latin script, shown when the UI language is English. NULL falls back to full_name_ar.';
COMMENT ON COLUMN users.full_name_ar IS
    'Name in Arabic script, shown when the UI language is Arabic. NULL falls back to full_name_en.';
COMMENT ON COLUMN users.full_name IS
    'Legacy single name, kept in step with the pair above by the entity (Arabic preferred). '
    'Read by emails and the order-event actor snapshot; never typed into directly.';
