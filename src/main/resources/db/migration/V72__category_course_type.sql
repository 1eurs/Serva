-- A category's course/role (DRINK, FOOD, DESSERT). The cart's "goes well with your order"
-- suggestions use it to avoid recommending a second item of the same role — two coffees in one
-- order usually means two people, not a pairing. Null = untagged; suggestions then fall back to
-- excluding only the exact same category.
ALTER TABLE menu_categories ADD COLUMN course_type VARCHAR(20);
