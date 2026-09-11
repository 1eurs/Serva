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
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.tables.TableService;
import com.cafeqr.tables.domain.RestaurantTable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Builds the bilingual public menu served to customers (no authentication). */
@Service
public class PublicMenuService {

    private final MenuCategoryRepository categoryRepository;
    private final MenuItemRepository itemRepository;
    private final RestaurantService restaurantService;
    private final BranchService branchService;
    private final TableService tableService;

    public PublicMenuService(MenuCategoryRepository categoryRepository,
                             MenuItemRepository itemRepository,
                             RestaurantService restaurantService,
                             BranchService branchService,
                             TableService tableService) {
        this.categoryRepository = categoryRepository;
        this.itemRepository = itemRepository;
        this.restaurantService = restaurantService;
        this.branchService = branchService;
        this.tableService = tableService;
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

        List<PublicCategory> publicCategories = categories.stream()
                .map(category -> {
                    List<PublicItem> publicItems = itemsByCategory
                            .getOrDefault(category.getId(), List.of())
                            .stream()
                            .map(item -> PublicItem.from(item, now))
                            .toList();
                    return PublicCategory.of(category, publicItems);
                })
                .toList();

        return new PublicMenuResponse(
                PublicRestaurant.from(restaurant),
                PublicBranch.from(branch),
                PublicTable.from(table),
                publicCategories);
    }
}
