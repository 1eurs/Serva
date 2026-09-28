package com.cafeqr.restaurants.domain;

/**
 * Where the customer cart shows its "goes well with your order" upsell. Owner-chosen per shop —
 * they can move it to see which spot sells more (revenue is attributed via OrderItem#fromSuggestion).
 */
public enum SuggestionsPlacement {
    /** Chips right under the cart items (default). */
    UNDER_ITEMS,
    /** Just above the total and the Place-order button. */
    BEFORE_CHECKOUT,
    /** A bottom sheet that slides up when the customer taps Place order. */
    POPUP
}
