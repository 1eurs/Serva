package com.cafeqr.stock;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.stock.domain.Allergen;
import com.cafeqr.stock.domain.BaseUnit;
import com.cafeqr.stock.domain.CountFrequency;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockKind;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.domain.StockMovement;
import com.cafeqr.stock.domain.WasteReason;
import com.cafeqr.stock.dto.MovementResponse;
import com.cafeqr.stock.dto.StockActions;
import com.cafeqr.stock.dto.StockItemRequest;
import com.cafeqr.stock.dto.StockItemResponse;
import com.cafeqr.stock.dto.StockOverviewResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The café's stock catalogue, on-hand levels and the day-to-day actions that move them.
 *
 * <p>Everything is scoped to one branch: stock is physical, so "how much is left" has no meaning
 * without saying where. A branch-scoped staff account always resolves to its own branch and the
 * {@code branchId} parameter is ignored for them.
 */
@RestController
@RequestMapping("/api/dashboard/stock")
@PreAuthorize("hasAuthority('STOCK')")
@Tag(name = "Stock")
public class StockController {

    private final StockService stockService;
    private final StockConsumptionService consumptionService;
    private final StockInsightsService insightsService;

    public StockController(StockService stockService,
                           StockConsumptionService consumptionService,
                           StockInsightsService insightsService) {
        this.stockService = stockService;
        this.consumptionService = consumptionService;
        this.insightsService = insightsService;
    }

    // ============================================================ overview

    @Operation(summary = "Today's stock picture for one branch")
    @GetMapping("/overview")
    public ApiResponse<StockOverviewResponse> overview(@RequestParam(required = false) Long branchId) {
        Long branch = stockService.resolveBranch(branchId);
        Long restaurantId = stockService.requireCafeScope();
        Map<Long, StockLevel> levels = stockService.levelsByItem(branch);

        List<StockItemResponse> low = new ArrayList<>();
        List<StockItemResponse> out = new ArrayList<>();
        BigDecimal value = BigDecimal.ZERO;
        for (StockItem item : stockService.listItems(false)) {
            StockLevel level = levels.get(item.getId());
            StockItemResponse row = StockItemResponse.from(item, level);
            if (row.out()) {
                out.add(row);
            } else if (row.low()) {
                low.add(row);
            }
            if (level != null && level.getQuantityBase().signum() > 0) {
                value = value.add(item.costOf(level.getQuantityBase()));
            }
        }

        List<StockOverviewResponse.CoverRow> ending = insightsService
                .endingSoon(branch, BigDecimal.ONE).stream()
                .map(c -> new StockOverviewResponse.CoverRow(c.item().getId(), c.item().getNameEn(),
                        c.item().getNameAr(), c.item().getBaseUnit().name(),
                        c.onHand(), c.dailyUsage(), c.daysLeft()))
                .toList();

        List<StockOverviewResponse.SoldOutRow> soldOut = consumptionService
                .soldOutDetail(restaurantId, branch).stream()
                .map(d -> new StockOverviewResponse.SoldOutRow(d.menuItemId(), d.nameEn(), d.nameAr(),
                        d.reason(), d.blockerId(), d.blockerName()))
                .toList();

        return ApiResponse.ok(new StockOverviewResponse(branch, low.size(), out.size(), ending.size(),
                value.setScale(3, java.math.RoundingMode.HALF_UP), low, out, ending, soldOut));
    }

    // ============================================================ catalogue

    @Operation(summary = "List stock items with this branch's on-hand")
    @GetMapping("/items")
    public ApiResponse<List<StockItemResponse>> items(@RequestParam(required = false) Long branchId,
                                                      @RequestParam(defaultValue = "false") boolean includeArchived) {
        Long branch = stockService.resolveBranch(branchId);
        Map<Long, StockLevel> levels = stockService.levelsByItem(branch);
        return ApiResponse.ok(stockService.listItems(includeArchived).stream()
                .map(item -> StockItemResponse.from(item, levels.get(item.getId())))
                .toList());
    }

    @Operation(summary = "Add a stock item")
    @PostMapping("/items")
    public ApiResponse<StockItemResponse> createItem(@Valid @RequestBody StockItemRequest request) {
        StockItem item = new StockItem();
        item.setRestaurantId(stockService.requireCafeScope());
        apply(item, request);
        return ApiResponse.ok("Item added", StockItemResponse.from(stockService.saveItem(item), null));
    }

    @Operation(summary = "Update a stock item")
    @PatchMapping("/items/{id}")
    public ApiResponse<StockItemResponse> updateItem(@PathVariable Long id,
                                                     @Valid @RequestBody StockItemRequest request) {
        StockItem item = stockService.getItem(id);
        apply(item, request);
        return ApiResponse.ok("Item saved", StockItemResponse.from(stockService.saveItem(item), null));
    }

    @Operation(summary = "Archive a stock item (recipes and history keep working)")
    @DeleteMapping("/items/{id}")
    public ApiResponse<Void> archiveItem(@PathVariable Long id) {
        stockService.archiveItem(id);
        return ApiResponse.message("Item archived");
    }

    @Operation(summary = "Set the reorder point and par level for one item at one branch")
    @PatchMapping("/items/{id}/levels")
    public ApiResponse<Void> levels(@PathVariable Long id, @RequestBody StockActions.LevelsRequest request) {
        Long branch = stockService.resolveBranch(request.branchId());
        stockService.setLevels(branch, id, request.parLevelBase(), request.reorderPointBase());
        return ApiResponse.message("Levels saved");
    }

    // ============================================================ daily actions

    @Operation(summary = "Record a delivery")
    @PostMapping("/receive")
    public ApiResponse<Void> receive(@Valid @RequestBody StockActions.ReceiveRequest request) {
        Long branch = stockService.resolveBranch(request.branchId());
        Long restaurantId = stockService.requireCafeScope();
        Set<Long> touched = new java.util.LinkedHashSet<>();
        for (StockActions.ReceiveRequest.Line line : request.lines()) {
            stockService.receive(branch, line.stockItemId(), line.quantityBase(),
                    line.unitCost(), request.note());
            touched.add(line.stockItemId());
        }
        // A delivery is the usual way an 86'd item comes back; put it on the menu again.
        consumptionService.refreshAvailability(restaurantId, branch, touched);
        return ApiResponse.message("Delivery recorded");
    }

    @Operation(summary = "Log waste, a staff meal or a comp")
    @PostMapping("/waste")
    public ApiResponse<Void> waste(@Valid @RequestBody StockActions.WasteRequest request) {
        Long branch = stockService.resolveBranch(request.branchId());
        Long restaurantId = stockService.requireCafeScope();
        stockService.logWaste(branch, request.stockItemId(), request.quantityBase(),
                parseEnum(WasteReason.class, request.reason(), WasteReason.OTHER), request.note());
        consumptionService.refreshAvailability(restaurantId, branch, Set.of(request.stockItemId()));
        return ApiResponse.message("Waste logged");
    }

    @Operation(summary = "Correct on-hand to what the shelf actually says")
    @PostMapping("/adjust")
    public ApiResponse<Void> adjust(@Valid @RequestBody StockActions.AdjustRequest request) {
        Long branch = stockService.resolveBranch(request.branchId());
        Long restaurantId = stockService.requireCafeScope();
        stockService.adjustTo(branch, request.stockItemId(), request.quantityBase(), request.note());
        consumptionService.refreshAvailability(restaurantId, branch, Set.of(request.stockItemId()));
        return ApiResponse.message("Stock corrected");
    }

    @Operation(summary = "Move stock to another branch")
    @PostMapping("/transfer")
    public ApiResponse<Void> transfer(@Valid @RequestBody StockActions.TransferRequest request) {
        Long restaurantId = stockService.requireCafeScope();
        stockService.transfer(request.fromBranchId(), request.toBranchId(), request.stockItemId(),
                request.quantityBase(), request.note());
        consumptionService.refreshAvailability(restaurantId, request.fromBranchId(), Set.of(request.stockItemId()));
        consumptionService.refreshAvailability(restaurantId, request.toBranchId(), Set.of(request.stockItemId()));
        return ApiResponse.message("Transferred");
    }

    @Operation(summary = "Produce a batch of an in-house prep item")
    @PostMapping("/produce")
    public ApiResponse<Void> produce(@Valid @RequestBody StockActions.ProduceRequest request) {
        Long branch = stockService.resolveBranch(request.branchId());
        Long restaurantId = stockService.requireCafeScope();
        stockService.produceBatch(branch, request.prepItemId(), request.batches(), request.note());
        consumptionService.refreshAvailability(restaurantId, branch, Set.of(request.prepItemId()));
        return ApiResponse.message("Batch produced");
    }

    // ============================================================ ledger

    @Operation(summary = "The stock ledger — why the number is what it is")
    @GetMapping("/movements")
    public ApiResponse<List<MovementResponse>> movements(@RequestParam(required = false) Long branchId,
                                                         @RequestParam(required = false) Long stockItemId,
                                                         @RequestParam(defaultValue = "0") int page,
                                                         @RequestParam(defaultValue = "100") int size) {
        Long branch = stockService.resolveBranch(branchId);
        var pageable = PageRequest.of(page, Math.min(size, 300));
        Page<StockMovement> movements = stockService.movements(branch, stockItemId, pageable);
        Map<Long, StockItem> items = stockService.itemsById(
                movements.getContent().stream().map(StockMovement::getStockItemId).distinct().toList());
        return ApiResponse.ok(movements.getContent().stream()
                .map(m -> {
                    StockItem item = items.get(m.getStockItemId());
                    return MovementResponse.from(m,
                            item == null ? null : item.getNameEn(),
                            item == null ? null : item.getNameAr(),
                            item == null ? null : item.getBaseUnit().name());
                })
                .toList());
    }

    // ============================================================ mapping

    private void apply(StockItem item, StockItemRequest request) {
        item.setNameEn(request.nameEn().trim());
        item.setNameAr(request.nameAr().trim());
        item.setKind(parseEnum(StockKind.class, request.kind(), StockKind.INGREDIENT));
        item.setBaseUnit(parseEnum(BaseUnit.class, request.baseUnit(), BaseUnit.G));
        item.setPurchaseUnitLabel(blankToNull(request.purchaseUnitLabel()));
        item.setPurchaseUnitSize(request.purchaseUnitSize() == null
                ? BigDecimal.ONE : request.purchaseUnitSize());
        if (request.costPerBaseUnit() != null) {
            item.setCostPerBaseUnit(request.costPerBaseUnit());
        }
        item.setWastePct(request.wastePct() == null ? BigDecimal.ZERO : request.wastePct());
        item.setBatchYieldBase(request.batchYieldBase());
        /* Zero servings per pack is not a yield, it is a division by zero waiting to happen —
           treat it the same as never having answered. */
        item.setServingsPerPack(request.servingsPerPack() == null || request.servingsPerPack().signum() <= 0
                ? null : request.servingsPerPack());
        item.setCategory(blankToNull(request.category()));
        item.setCountFrequency(request.countFrequency() == null || request.countFrequency().isBlank()
                ? null : parseEnum(CountFrequency.class, request.countFrequency(), null));
        item.setAllergenSet(parseAllergens(request.allergens()));
        item.setNutritionJson(blankToNull(request.nutritionJson()));
        item.setSupplierId(request.supplierId());
        if (item.getKind() == StockKind.PREP && item.getBatchYieldBase() == null) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "Say how much one batch makes for an in-house item.");
        }
    }

    private static Set<Allergen> parseAllergens(List<String> names) {
        Set<Allergen> set = EnumSet.noneOf(Allergen.class);
        if (names == null) {
            return set;
        }
        for (String name : names) {
            Allergen allergen = parseEnum(Allergen.class, name, null);
            if (allergen != null) {
                set.add(allergen);
            }
        }
        return set;
    }

    /** Lenient enum parsing: an unknown value falls back rather than 500-ing the request. */
    static <E extends Enum<E>> E parseEnum(Class<E> type, String value, E fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
