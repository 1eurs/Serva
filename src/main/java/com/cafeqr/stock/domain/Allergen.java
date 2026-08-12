package com.cafeqr.stock.domain;

/**
 * Allergens tagged on a stock item and rolled up along recipes to label menu items for
 * customers. Serva already *is* the menu, so once ingredients exist this labelling comes
 * almost free — and it is the strongest reason a café will bother finishing their recipes.
 */
public enum Allergen {
    DAIRY,
    GLUTEN,
    NUTS,
    PEANUTS,
    SOY,
    EGG,
    SESAME,
    FISH,
    SHELLFISH
}
