-- =====================================================================
-- Leads become a pipeline, not an inbox.
--
-- A lead arrives from the landing page and then *moves*: somebody calls the
-- café, writes down what was said, and either provisions the café or lets it
-- go. Until now the only recorded state was NEW — the follow-up lived in
-- whoever happened to answer the phone.
--
-- Three columns carry that follow-up:
--   admin_note    what was said on the call (the admin's own notes, not the
--                 café's `note`, which is what the café itself typed).
--   contacted_at  when somebody first reached out — the number that answers
--                 "how long has this been sitting there?".
--   restaurant_id the café this lead became. Non-null = converted, and it is
--                 the link that lets the console jump from a lead straight to
--                 the café it produced.
-- =====================================================================
ALTER TABLE leads ADD COLUMN admin_note    VARCHAR(1000);
ALTER TABLE leads ADD COLUMN contacted_at  TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN restaurant_id BIGINT REFERENCES restaurants (id) ON DELETE SET NULL;

-- The pipeline board reads one status at a time, oldest-first within a column.
CREATE INDEX idx_leads_status ON leads (status, created_at DESC);
