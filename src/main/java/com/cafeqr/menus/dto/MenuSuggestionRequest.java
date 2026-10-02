package com.cafeqr.menus.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

/** The item ids currently in a customer's cart — the seed for "goes well with your order". */
public record MenuSuggestionRequest(
        @NotEmpty List<Long> itemIds
) {}
