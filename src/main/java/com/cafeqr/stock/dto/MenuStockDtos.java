package com.cafeqr.stock.dto;

import com.cafeqr.stock.domain.MenuItemStock;
import com.cafeqr.stock.domain.OptionRecipeLine;
import com.cafeqr.stock.domain.RecipeLine;
import com.cafeqr.stock.domain.StockUnit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
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
     * The cap on one menu item at one branch. Replaced by what arrives — the form shows the
     * field, so empty means "no cap any more", which deletes the rule.
     */
    public record RuleRequest(
            @Positive Integer dailyLimit
    ) {}

    public record RuleResponse(
            Long menuItemId,
            Long branchId,
            Integer dailyLimit
    ) {
        public static RuleResponse from(MenuItemStock r) {
            return new RuleResponse(r.getMenuItemId(), r.getBranchId(), r.getDailyLimit());
        }

        public static RuleResponse none(Long menuItemId, Long branchId) {
            return new RuleResponse(menuItemId, branchId, null);
        }
    }

    /** One ingredient. The unit is the shelf row's or its ×1000 sibling — anything else is refused. */
    public record RecipeLineInput(
            @NotNull Long stockItemId,
            @NotNull @Positive @DecimalMax("99999999999") BigDecimal quantity,
            @NotNull StockUnit unit
    ) {}

    /**
     * What a customer's choice does to the recipe. A substitution names the base tin it stands in
     * for ({@code replacesStockItemId}) and pours the same quantity from {@code stockItemId}
     * instead; an addition leaves that null and says how much on top.
     */
    public record OptionLineInput(
            @NotBlank @Size(max = 150) String groupName,
            @NotBlank @Size(max = 150) String optionName,
            @NotNull Long stockItemId,
            Long replacesStockItemId,
            @Positive @DecimalMax("99999999999") BigDecimal quantity,
            StockUnit unit
    ) {}

    /**
     * The whole recipe, sent whole: what arrives replaces what was there, options included.
     * Empty clears it.
     */
    public record RecipeRequest(
            @NotNull @Size(max = 60) List<@Valid RecipeLineInput> lines,
            @Size(max = 200) List<@Valid OptionLineInput> options
    ) {
        public List<OptionLineInput> optionsOrEmpty() {
            return options == null ? List.of() : options;
        }
    }

    public record OptionLineResponse(
            Long id,
            Long menuItemId,
            String groupName,
            String optionName,
            Long stockItemId,
            Long replacesStockItemId,
            BigDecimal quantity,
            StockUnit unit
    ) {
        public static OptionLineResponse from(OptionRecipeLine o) {
            return new OptionLineResponse(o.getId(), o.getMenuItemId(), o.getGroupName(), o.getOptionName(),
                    o.getStockItemId(), o.getReplacesStockItemId(), o.getQuantity(), o.getUnit());
        }
    }

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
     * What one shelf row is being used at, worked out from sales and recipes. Null
     * {@code daysLeft} means nothing has been sold against it in the window, so there is no
     * honest rate to divide by. {@code usedSinceCount} is what sales have actually drawn out of
     * it since somebody last counted — the answer to "why does it say 4.6" — and null when nobody
     * ever has.
     */
    public record UsageRow(
            Long stockItemId,
            /** In the shelf row's own unit, over the whole window. */
            BigDecimal used,
            BigDecimal perDay,
            BigDecimal daysLeft,
            BigDecimal usedSinceCount
    ) {}
}
