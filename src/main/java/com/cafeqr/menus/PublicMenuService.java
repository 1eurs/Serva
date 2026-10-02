package com.cafeqr.menus;

import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.menus.domain.MenuCategory;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.dto.PublicMenuResponse;
import com.cafeqr.menus.dto.PublicMenuResponse.PublicBranch;
import com.cafeqr.menus.dto.PublicMenuResponse.PublicCategory;
import com.cafeqr.menus.dto.PublicMenuResponse.PublicItem;
import com.cafeqr.menus.dto.PublicMenuResponse.PublicRestaurant;
import com.cafeqr.menus.dto.PublicMenuResponse.PublicTable;
import com.cafeqr.menus.repository.MenuCategoryRepository;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.repository.OrderItemRepository;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.stock.StockDrawService;
import com.cafeqr.stock.StockDrawService.ItemAvailability;
import com.cafeqr.tables.TableService;
import com.cafeqr.tables.domain.RestaurantTable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Builds the bilingual public menu served to customers (no authentication). */
@Service
public class PublicMenuService {

    /** How far back co-order history is mined for cart suggestions. */
    private static final int SUGGESTION_WINDOW_DAYS = 90;
    /** Most suggestions the cart will ever ask for; keeps the row short and the query cheap. */
    private static final int SUGGESTION_LIMIT = 4;

    private final MenuCategoryRepository categoryRepository;
    private final MenuItemRepository itemRepository;
    private final OrderItemRepository orderItemRepository;
    private final RestaurantService restaurantService;
    private final BranchService branchService;
    private final TableService tableService;
    private final StockDrawService stockDrawService;

    public PublicMenuService(MenuCategoryRepository categoryRepository,
                             MenuItemRepository itemRepository,
                             OrderItemRepository orderItemRepository,
                             RestaurantService restaurantService,
                             BranchService branchService,
                             TableService tableService,
                             StockDrawService stockDrawService) {
        this.categoryRepository = categoryRepository;
        this.itemRepository = itemRepository;
        this.orderItemRepository = orderItemRepository;
        this.restaurantService = restaurantService;
        this.branchService = branchService;
        this.tableService = tableService;
        this.stockDrawService = stockDrawService;
    }

    /**
     * Item ids most often ordered alongside what's already in the cart, ranked by co-orders across
     * the whole restaurant's recent history. The customer's app renders these from the menu it has
     * already loaded, so we hand back only ids — the seeds themselves are never suggested back.
     */
    @Transactional(readOnly = true)
    public List<Long> suggestionsForCart(String slug, List<Long> cartItemIds) {
        if (cartItemIds == null || cartItemIds.isEmpty()) return List.of();
        List<Long> seeds = cartItemIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (seeds.isEmpty()) return List.of();
        Restaurant restaurant = restaurantService.getActiveBySlug(slug);
        Instant now = Instant.now();
        Instant from = now.minus(SUGGESTION_WINDOW_DAYS, ChronoUnit.DAYS);
        List<Object[]> rows = orderItemRepository.suggestionsForItems(
                restaurant.getId(), seeds, from, now, SUGGESTION_LIMIT);
        List<Long> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) out.add(((Number) r[0]).longValue());
        return out;
    }

    @Transactional(readOnly = true)
    public PublicMenuResponse byRestaurantSlug(String slug) {
        Restaurant restaurant = restaurantService.getActiveBySlug(slug);
        List<MenuCategory> categories = categoryRepository.findActiveRestaurantWide(restaurant.getId());
        List<MenuItem> items = itemRepository.findRestaurantWide(restaurant.getId());
        return build(restaurant, null, null, categories, items);
    }

    @Transactional(readOnly = true)
    public PublicMenuResponse byBranch(String slug, Long branchId) {
        Restaurant restaurant = restaurantService.getActiveBySlug(slug);
        Branch branch = branchService.getEntityInRestaurant(restaurant.getId(), branchId);
        branchService.requireActive(branch);
        return buildForBranch(restaurant, branch, null);
    }

    @Transactional(readOnly = true)
    public PublicMenuResponse byTableToken(String token) {
        RestaurantTable table = tableService.getActiveByToken(token);
        Restaurant restaurant = restaurantService.getEntity(table.getRestaurantId());
        restaurantService.requireActive(restaurant);
        Branch branch = branchService.getEntity(table.getBranchId());
        branchService.requireActive(branch);
        return buildForBranch(restaurant, branch, table);
    }

    private PublicMenuResponse buildForBranch(Restaurant restaurant, Branch branch, RestaurantTable table) {
        List<MenuCategory> categories = categoryRepository.findActiveForBranch(restaurant.getId(), branch.getId());
        List<MenuItem> items = itemRepository.findForBranch(restaurant.getId(), branch.getId());
        return build(restaurant, branch, table, categories, items);
    }

    private PublicMenuResponse build(Restaurant restaurant, Branch branch, RestaurantTable table,
                                     List<MenuCategory> categories, List<MenuItem> items) {
        Map<Long, List<MenuItem>> itemsByCategory = items.stream()
                .collect(Collectors.groupingBy(MenuItem::getCategoryId));

        // Evaluate every item's discount window against one timestamp so the whole menu is consistent.
        Instant now = Instant.now();

        // The shelf is per branch, so only a branch menu can carry its verdict. The restaurant-wide
        // menu (no branch chosen yet) says nothing — which is the same as "not sold out".
        Map<Long, ItemAvailability> shelf = branch == null ? Map.of()
                : stockDrawService.availability(restaurant, branch.getId(),
                        items.stream().map(MenuItem::getId).toList());

        Map<Long, MenuItem> byId = items.stream().collect(Collectors.toMap(MenuItem::getId, i -> i));

        List<PublicCategory> publicCategories = categories.stream()
                .map(category -> {
                    List<PublicItem> publicItems = itemsByCategory
                            .getOrDefault(category.getId(), List.of())
                            .stream()
                            .map(item -> {
                                ItemAvailability a = comboVerdict(item, byId, shelf);
                                return a == null ? PublicItem.from(item, now)
                                        : PublicItem.from(item, now, a.soldOut(), a.remainingToday());
                            })
                            .toList();
                    return PublicCategory.of(category, publicItems);
                })
                .toList();

        return new PublicMenuResponse(
                PublicRestaurant.from(restaurant),
                PublicBranch.from(branch, branch != null && branchService.canOrderNow(branch)),
                PublicTable.from(table),
                publicCategories);
    }

    /**
     * A combo is only as sellable as its parts: out when any part is switched off, missing from
     * this branch's menu, or sold out on the shelf; and it can go out only as many times today as
     * its scarcest part (counting "2 × Croissant" twice). A plain item keeps its own verdict.
     */
    private static ItemAvailability comboVerdict(MenuItem item, Map<Long, MenuItem> byId,
                                                 Map<Long, ItemAvailability> shelf) {
        ItemAvailability own = shelf.get(item.getId());
        List<Long> parts = item.getComboItemIds();
        if (parts.isEmpty()) return own;
        boolean out = own != null && own.soldOut();
        Integer remaining = own == null ? null : own.remainingToday();
        Map<Long, Integer> perCombo = new java.util.HashMap<>();
        parts.forEach(p -> perCombo.merge(p, 1, Integer::sum));
        for (Map.Entry<Long, Integer> e : perCombo.entrySet()) {
            MenuItem part = byId.get(e.getKey());
            ItemAvailability a = shelf.get(e.getKey());
            if (part == null || !part.isAvailable() || (a != null && a.soldOut())) out = true;
            if (a != null && a.remainingToday() != null) {
                int fits = a.remainingToday() / e.getValue();
                remaining = remaining == null ? fits : Math.min(remaining, fits);
            }
        }
        if (remaining != null && remaining == 0) out = true;
        if (!out && remaining == null && own == null) return null;
        return new ItemAvailability(out, remaining);
    }
}
