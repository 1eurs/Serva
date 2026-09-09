-- The "house card" at the top of the public menu: a short bilingual note in the café's
-- own voice, plus the switch that shows or hides the whole block. Free-form JSON owned by
-- the frontend, mirroring receipt_settings_json. NULL = no card (today's behaviour).
--
-- Deliberately NOT stored inside menu_theme_custom_json: that document is the theme, and
-- Quick mix / Reset overwrite it wholesale — which would throw away a café's own words.
ALTER TABLE restaurants ADD COLUMN menu_info_json TEXT;
