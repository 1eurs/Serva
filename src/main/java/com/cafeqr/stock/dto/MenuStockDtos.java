package com.cafeqr.stock.dto;

import com.cafeqr.stock.domain.MenuItemStock;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockUnit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/** How a menu item meets the shelf, and what the shelf reads back from it. */
public final class MenuStockDtos {

    private MenuStockDtos() {
    }

    /**
     * The rule for one menu item at one branch, sent whole. Both fields are replaced by what
     * arrives — the form shows both, so an empty one means "no longer" — and both empty deletes
     * the rule, which is the same as never having had one.
     */
    public record RuleRequest(
            Long stockItemId,
            @Positive Integer dailyLimit
    ) {}

    public record RuleResponse(
            Long menuItemId,
            Long branchId,
            Long stockItemId,
            Integer dailyLimit
    ) {
        public static RuleResponse from(MenuItemStock r) {
            return new RuleResponse(r.getMenuItemId(), r.getBranchId(), r.getStockItemId(), r.getDailyLimit());
        }

        public static RuleResponse none(Long menuItemId, Long branchId) {
            return new RuleResponse(menuItemId, branchId, null, null);
        }
    }

    /** One ingredient. The unit is the shelf row's or its ×1000 sibling — anything else is refused. */
    public record RecipeLineInput(
            @NotNull Long stockItemId,
            @NotNull @Positive @DecimalMax("99999999999") BigDecimal quantity,
            @NotNull StockUnit unit
    ) {}

    /** The whole recipe, sent whole: what arrives replaces what was there. Empty clears it. */
    public record RecipeRequest(
            @NotNull @Size(max = 60) List<@Valid RecipeLineInput> lines
    ) {}

    public record RecipeLineResponse(
            Long id,
            Long menuItemId,
            Long stockItemId,
            BigDecimal quantity,
            StockUnit unit
    ) {
        public static RecipeLineResponse from(RecipeLine l) {
            return new RecipeLineResponse(l.getId(), l.getMenuItemId(), l.getStockItemId(), l.getQuantity(), l.getUnit());
        }
    }

    /**
     * What one shelf row has been used at, worked out from sales and recipes rather than from the
     * count — which is why it can say "3 days left" for a tin nobody has recounted this week.
     * Null {@code daysLeft} means nothing has been sold against it in the window, so there is no
     * honest rate to divide by.
     */
    public record UsageRow(
            Long stockItemId,
            /** In the shelf row's own unit, over the whole window. */
            BigDecimal used,
            BigDecimal perDay,
            BigDecimal daysLeft
    ) {}
}
