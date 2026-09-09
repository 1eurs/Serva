-- Stock no longer writes menu availability down.
--
-- auto_unavailable existed so a restock could re-enable only the items Serva had hidden
-- itself. The pass that set it computed "can we make it" from one branch's shelf and then
-- wrote the answer to menu_items.available, which every branch of the restaurant shares —
-- so one branch running out took the item off sale everywhere. There was no per-branch
-- place to put the result, so the result is no longer stored: the customer menu and the
-- order-time check both work it out per branch when they are asked.
--
-- Put back everything stock had hidden. An item the owner switched off by hand has
-- auto_unavailable = FALSE and is left exactly as it is.
UPDATE menu_items
SET available = TRUE
WHERE auto_unavailable = TRUE
  AND available = FALSE;

ALTER TABLE menu_items
    DROP COLUMN auto_unavailable;
