package com.cafeqr.menus.domain;

/**
 * The role a category plays in an order. Used by the cart's "goes well with your order"
 * suggestions to tell complements apart from duplicates: a second DRINK alongside a drink is
 * usually just a second person at the table, whereas a DESSERT with a drink is a real pairing.
 * Null on a category = untagged, and suggestions fall back to excluding only the same category.
 */
public enum CourseType {
    DRINK, FOOD, DESSERT
}
