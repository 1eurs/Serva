-- =====================================================================
-- Let the owner switch off the one thing stock does without asking.
--
-- Tracking already hides a menu item the moment an ingredient runs short.
-- That is right when the count is right — and the count drifts. An
-- ingredient added to a recipe by mistake, a delivery entered tomorrow, an
-- over-pour nobody logged, and a drink that is physically sitting there
-- stops being sellable. One wrongly hidden flat white costs more trust than
-- the feature earns in a month, and the café has no way to overrule it.
--
-- So it becomes a choice. TRUE keeps today's behaviour, which is why it is
-- the default: no café wakes up to a change it did not ask for. FALSE keeps
-- every calculation — the draw-down, the ledger, the cost, the alerts — and
-- only stops the automatic hiding, leaving the owner to decide what is
-- genuinely off the menu.
-- =====================================================================

ALTER TABLE restaurants
    ADD COLUMN auto_hide_out_of_stock BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN restaurants.auto_hide_out_of_stock IS
    'When true, a menu item whose ingredients ran out is hidden from customers automatically. '
    'When false stock is still tracked and still warns, but only a human takes an item off sale.';
