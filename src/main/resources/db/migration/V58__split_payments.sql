-- Splitting a bill turns one settlement into several tenders: a table of five pays part cash,
-- part card, and each part is its own payments row so the drawer count is true.
--
-- That breaks the old "latest payment row wins" dedupe in revenueByMethod(), which existed so
-- an order marked paid twice is not counted twice. settlement_id groups the rows written by a
-- single settle call, turning the rule into "latest settlement wins" — a split is summed, a
-- double mark-paid still is not. NULL means the row settles the order on its own, which is
-- every payment written before this migration and every plain mark-paid after it.
ALTER TABLE payments ADD COLUMN settlement_id BIGINT;

CREATE INDEX idx_payments_order_settlement ON payments (order_id, settlement_id);
