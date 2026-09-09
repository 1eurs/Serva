-- Which branch a stamp was earned at, and where a reward was handed over.
--
-- The programme, the member and their stamp balance are deliberately restaurant-wide: a
-- customer collects at one branch and redeems at another, and that is the point of a card.
-- But the ledger rows recording each earn and redeem carried no branch at all, so a café
-- with two shops could not tell which of them was giving the rewards away.
--
-- Nullable on purpose. Rows written before this migration genuinely have no branch — nothing
-- recorded it — and guessing one would invent history. Reporting counts them separately
-- rather than pretending they belong somewhere.
ALTER TABLE loyalty_transactions
    ADD COLUMN branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL;

-- The reporting query groups by branch over a date window.
CREATE INDEX ix_loyalty_txn_branch ON loyalty_transactions (restaurant_id, branch_id, created_at);
