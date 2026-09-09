package com.cafeqr.restaurants.dto;

import jakarta.validation.constraints.Size;

/**
 * The house card at the top of the public menu — a JSON document (show flag, bilingual
 * note): same shape of contract as themeCustomJson and receiptSettingsJson, where the
 * frontend owns the schema and the backend only guards "valid JSON object, sane size".
 * Blank/null clears the card back off.
 */
public record UpdateRestaurantMenuInfoRequest(
        @Size(max = 4000)
        String menuInfoJson
) {}
