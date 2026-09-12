-- What the counter's order pad asks for, and the buzzer number it can now record.
--
-- The pad has always asked for a customer name and a phone number. Both exist for
-- loyalty: the phone is how a stamp finds its card. A café with no stamp card types
-- into two boxes all day that nothing ever reads — so the three questions become the
-- café's own to switch on and off.
--
-- Name and phone default ON: that is what every existing pad already shows, and a
-- migration must not quietly stop a café collecting the numbers its stamp card runs on.
-- The pager defaults OFF because no café has buzzers until it says it does.
ALTER TABLE restaurants ADD COLUMN pad_ask_name  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE restaurants ADD COLUMN pad_ask_phone BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE restaurants ADD COLUMN pad_ask_pager BOOLEAN NOT NULL DEFAULT FALSE;

-- The numbered buzzer handed over the counter. Text, not an integer: the number on the
-- device is a label printed on plastic ("07", "A3"), not a quantity to do arithmetic on,
-- and a leading zero has to survive the round trip.
ALTER TABLE orders ADD COLUMN pager_number VARCHAR(10);
