-- ---------------------------------------------------------------------
-- Clean the invisible characters a copy-paste left in a login.
--
-- Credentials are handed over by message, and a copy taken out of a
-- right-to-left one carries bidi marks, isolates or a non-breaking space
-- that nothing on screen shows and trim() never removed. An account
-- created that way has a username nobody can type: from here on the code
-- cleans both what it stores and what it looks up (see Pasted.java), and
-- this cleans the rows written before it did.
--
-- translate() with a shorter target deletes the leftovers, so one pass
-- does all three jobs: invisible characters out, Arabic-Indic digits to
-- western ones, non-breaking space to a plain one for btrim to take.
-- ---------------------------------------------------------------------

WITH marks AS (
    SELECT U&'\00A0'                                                   -- non-breaking space
           || '٠١٢٣٤٥٦٧٨٩'                                             -- Arabic-Indic digits
           || '۰۱۲۳۴۵۶۷۸۹'                                             -- extended Arabic-Indic
           || U&'\00AD\061C\200B\200C\200D\200E\200F'                  -- soft hyphen, ALM, zero-widths, LRM/RLM
           || U&'\202A\202B\202C\202D\202E\2060\2066\2067\2068\2069'   -- embeddings, word joiner, isolates
           || U&'\FEFF'                            AS from_chars,      -- byte-order mark
           ' 01234567890123456789'                 AS to_chars
),
cleaned AS (
    SELECT u.id,
           btrim(translate(u.username, m.from_chars, m.to_chars)) AS username,
           btrim(translate(u.email, m.from_chars, m.to_chars))    AS email
    FROM users u CROSS JOIN marks m
),
-- Two rows can clean down to the same login: the unique index is on the raw text, so
-- "mutrah" and an RLM-wrapped "mutrah" sit side by side today. Rewriting both would fail
-- the migration on the index, so neither is touched — those two accounts stay exactly as
-- they are and an admin renames one, which is the only way to tell them apart anyway.
free AS (
    SELECT c.* FROM cleaned c
    WHERE NOT EXISTS (SELECT 1 FROM cleaned o
                       WHERE o.id <> c.id AND LOWER(o.username) = LOWER(c.username))
      AND NOT EXISTS (SELECT 1 FROM cleaned o
                       WHERE o.id <> c.id AND c.email IS NOT NULL AND LOWER(o.email) = LOWER(c.email))
)
UPDATE users u
SET username   = c.username,
    email      = c.email,
    updated_at = now()
FROM free c
WHERE u.id = c.id
  AND (u.username IS DISTINCT FROM c.username OR u.email IS DISTINCT FROM c.email);
