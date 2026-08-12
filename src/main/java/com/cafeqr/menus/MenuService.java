package com.cafeqr.menus;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.auth.security.CustomUserDetails;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.branches.BranchService;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.menus.domain.DiscountType;
import com.cafeqr.menus.domain.MenuCategory;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemImage;
import com.cafeqr.menus.domain.MenuItemOption;
import com.cafeqr.menus.domain.MenuItemOptionGroup;
import com.cafeqr.menus.domain.OptionSelectionType;
import com.cafeqr.menus.dto.CategoryResponse;
import com.cafeqr.menus.dto.CreateCategoryRequest;
import com.cafeqr.menus.dto.CreateMenuItemRequest;
import com.cafeqr.menus.dto.MenuItemResponse;
import com.cafeqr.menus.dto.UpdateCategoryRequest;
import com.cafeqr.menus.dto.UpdateMenuItemRequest;
import com.cafeqr.menus.repository.MenuCategoryRepository;
import com.cafeqr.menus.repository.MenuItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Menu management (dashboard) plus the order-time item validation helper. */
@Service
public class MenuService {

    private final MenuCategoryRepository categoryRepository;
    private final MenuItemRepository itemRepository;
    private final BranchService branchService;
    private final AccessGuard accessGuard;

    public MenuService(MenuCategoryRepository categoryRepository,
                       MenuItemRepository itemRepository,
                       BranchService branchService,
                       AccessGuard accessGuard) {
        this.categoryRepository = categoryRepository;
        this.itemRepository = itemRepository;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
    }

    // ----------------------------------------------------------------- categories

    @Transactional
    public CategoryResponse createCategory(CreateCategoryRequest request) {
        Long restaurantId = resolveRestaurantId(request.restaurantId());
        accessGuard.requireRestaurantAccess(restaurantId);
        Long branchId = resolveBranchId(restaurantId, request.branchId());

        MenuCategory category = new MenuCategory();
        category.setRestaurantId(restaurantId);
        category.setBranchId(branchId);
        category.setNameEn(request.nameEn());
        category.setNameAr(request.nameAr());
        category.setDescriptionEn(request.descriptionEn());
        category.setDescriptionAr(request.descriptionAr());
        category.setDisplayOrder(request.displayOrder() != null ? request.displayOrder() : 0);
        category.setActive(request.active() == null || request.active());
        return CategoryResponse.from(categoryRepository.save(category));
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> listCategories(Long restaurantId, Long branchId) {
        Long scopedRestaurant = resolveRestaurantId(restaurantId);
        accessGuard.requireRestaurantAccess(scopedRestaurant);
        List<MenuCategory> categories = categoryRepository
                .findByRestaurantIdOrderByDisplayOrderAscIdAsc(scopedRestaurant);
        Long branchScope = (branchId != null) ? branchId : accessGuard.scopedBranchId();
        return categories.stream()
                .filter(c -> branchScope == null || c.getBranchId() == null || c.getBranchId().equals(branchScope))
                .map(CategoryResponse::from)
                .toList();
    }

    @Transactional
    public CategoryResponse updateCategory(Long id, UpdateCategoryRequest request) {
        MenuCategory category = getCategoryEntity(id);
        accessGuard.requireBranchAccess(category.getRestaurantId(), category.getBranchId());
        if (request.nameEn() != null) {
            category.setNameEn(request.nameEn());
        }
        if (request.nameAr() != null) {
            category.setNameAr(request.nameAr());
        }
        if (request.descriptionEn() != null) {
            category.setDescriptionEn(request.descriptionEn());
        }
        if (request.descriptionAr() != null) {
            category.setDescriptionAr(request.descriptionAr());
        }
        if (request.displayOrder() != null) {
            category.setDisplayOrder(request.displayOrder());
        }
        if (request.active() != null) {
            category.setActive(request.active());
        }
        return CategoryResponse.from(category);
    }

    @Transactional
    public void deleteCategory(Long id) {
        MenuCategory category = getCategoryEntity(id);
        accessGuard.requireBranchAccess(category.getRestaurantId(), category.getBranchId());
        if (!itemRepository.findByCategoryIdOrderByDisplayOrderAscIdAsc(id).isEmpty()) {
            throw new BadRequestException("Cannot delete a category that still has menu items");
        }
        categoryRepository.delete(category);
    }

    // ----------------------------------------------------------------- items

    @Transactional
    public MenuItemResponse createItem(CreateMenuItemRequest request) {
        Long restaurantId = resolveRestaurantId(request.restaurantId());
        accessGuard.requireRestaurantAccess(restaurantId);
        Long branchId = resolveBranchId(restaurantId, request.branchId());

        MenuCategory category = getCategoryEntity(request.categoryId());
        if (!category.getRestaurantId().equals(restaurantId)) {
            throw new BadRequestException("Category does not belong to this restaurant");
        }

        MenuItem item = new MenuItem();
        item.setRestaurantId(restaurantId);
        item.setBranchId(branchId);
        item.setCategoryId(category.getId());
        item.setNameEn(request.nameEn());
        item.setNameAr(request.nameAr());
        item.setDescriptionEn(request.descriptionEn());
        item.setDescriptionAr(request.descriptionAr());
        item.setPrice(request.price());
        applyDiscount(item, request.discountType(), request.discountValue(),
                request.discountStartsAt(), request.discountEndsAt());
        item.setImageUrl(request.imageUrl());
        item.setAvailable(request.available() == null || request.available());
        item.setPreparationTimeMinutes(request.preparationTimeMinutes());
        item.setDisplayOrder(request.displayOrder() != null ? request.displayOrder() : 0);
        applyImages(item, request.imageUrls(), request.imageUrl());
        applyOptionGroups(item, request.optionGroups());
        return MenuItemResponse.from(itemRepository.save(item));
    }

    @Transactional(readOnly = true)
    public List<MenuItemResponse> listItems(Long restaurantId, Long branchId, Long categoryId) {
        if (categoryId != null) {
            MenuCategory category = getCategoryEntity(categoryId);
            accessGuard.requireRestaurantAccess(category.getRestaurantId());
            return itemRepository.findByCategoryIdOrderByDisplayOrderAscIdAsc(categoryId)
                    .stream().map(MenuItemResponse::from).toList();
        }
        Long scopedRestaurant = resolveRestaurantId(restaurantId);
        accessGuard.requireRestaurantAccess(scopedRestaurant);
        Long branchScope = (branchId != null) ? branchId : accessGuard.scopedBranchId();
        return itemRepository.findByRestaurantIdOrderByDisplayOrderAscIdAsc(scopedRestaurant).stream()
                .filter(i -> branchScope == null || i.getBranchId() == null || i.getBranchId().equals(branchScope))
                .map(MenuItemResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public MenuItemResponse getItem(Long id) {
        MenuItem item = getItemEntity(id);
        accessGuard.requireRestaurantAccess(item.getRestaurantId());
        return MenuItemResponse.from(item);
    }

    @Transactional
    public MenuItemResponse updateItem(Long id, UpdateMenuItemRequest request) {
        MenuItem item = getItemEntity(id);
        accessGuard.requireBranchAccess(item.getRestaurantId(), item.getBranchId());
        if (request.categoryId() != null) {
            MenuCategory category = getCategoryEntity(request.categoryId());
            if (!category.getRestaurantId().equals(item.getRestaurantId())) {
                throw new BadRequestException("Category does not belong to this restaurant");
            }
            item.setCategoryId(category.getId());
        }
        if (request.nameEn() != null) {
            item.setNameEn(request.nameEn());
        }
        if (request.nameAr() != null) {
            item.setNameAr(request.nameAr());
        }
        if (request.descriptionEn() != null) {
            item.setDescriptionEn(request.descriptionEn());
        }
        if (request.descriptionAr() != null) {
            item.setDescriptionAr(request.descriptionAr());
        }
        if (request.price() != null) {
            item.setPrice(request.price());
        }
        // Discount is always (re)applied on update — the editor always sends the fields, so a
        // null/"NONE" type clears any existing discount. Runs after price so FIXED is validated
        // against the final price.
        applyDiscount(item, request.discountType(), request.discountValue(),
                request.discountStartsAt(), request.discountEndsAt());
        if (Boolean.TRUE.equals(request.removeImage())) {
            item.setImageUrl(null);
        } else if (request.imageUrl() != null) {
            item.setImageUrl(request.imageUrl());
        }
        // Gallery replace: a non-null imageUrls list overrides the set (empty list = clear).
        // When orchestrating via the gallery, also override imageUrl with the first entry.
        if (request.imageUrls() != null) {
            applyImages(item, request.imageUrls(), Boolean.TRUE.equals(request.removeImage()) ? null : request.imageUrl());
        }
        if (request.optionGroups() != null) {
            applyOptionGroups(item, request.optionGroups());
        }
        if (request.available() != null) {
            item.setAvailable(request.available());
        }
        if (request.preparationTimeMinutes() != null) {
            item.setPreparationTimeMinutes(request.preparationTimeMinutes());
        }
        if (request.displayOrder() != null) {
            item.setDisplayOrder(request.displayOrder());
        }
        return MenuItemResponse.from(item);
    }

    @Transactional
    public MenuItemResponse updateAvailability(Long id, boolean available) {
        MenuItem item = getItemEntity(id);
        accessGuard.requireBranchAccess(item.getRestaurantId(), item.getBranchId());
        item.setAvailable(available);
        return MenuItemResponse.from(item);
    }

    @Transactional
    public void deleteItem(Long id) {
        MenuItem item = getItemEntity(id);
        accessGuard.requireBranchAccess(item.getRestaurantId(), item.getBranchId());
        itemRepository.delete(item);
    }

    // ----------------------------------------------------------------- order-time helper

    /**
     * Resolves a menu item for an incoming public order, validating restaurant/branch scope
     * and availability. No authentication context is required.
     */
    @Transactional(readOnly = true)
    public MenuItem getOrderableItem(Long restaurantId, Long branchId, Long itemId) {
        MenuItem item = itemRepository.findById(itemId)
                .orElseThrow(() -> new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE,
                        "Menu item not found: " + itemId));
        if (!item.getRestaurantId().equals(restaurantId)
                || (item.getBranchId() != null && !item.getBranchId().equals(branchId))) {
            throw new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE,
                    "Menu item is not available at this branch");
        }
        if (!item.isAvailable()) {
            throw new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE,
                    "Menu item \"" + item.getNameEn() + "\" is not available");
        }
        return item;
    }

    // ----------------------------------------------------------------- internals

    private MenuCategory getCategoryEntity(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.of("Category", id));
    }

    private MenuItem getItemEntity(Long id) {
        return itemRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.of("Menu item", id));
    }

    private Long resolveRestaurantId(Long requested) {
        CustomUserDetails user = SecurityUtils.currentUser();
        if (user.isPlatformAdmin()) {
            if (requested == null) {
                throw new BadRequestException("restaurantId is required for platform admin");
            }
            return requested;
        }
        if (user.getRestaurantId() == null) {
            throw new BadRequestException("Your account is not associated with a restaurant");
        }
        return user.getRestaurantId();
    }

    private Long resolveBranchId(Long restaurantId, Long requestedBranchId) {
        Long scopedBranch = accessGuard.scopedBranchId();
        if (scopedBranch != null) {
            return scopedBranch; // branch-scoped users may only manage their own branch
        }
        if (requestedBranchId != null) {
            branchService.getEntityInRestaurant(restaurantId, requestedBranchId);
        }
        return requestedBranchId;
    }

    // ------------------------------------------------------------- gallery + options

    /**
     * Replaces the item's photo gallery. {@code explicitImageUrl} (from the legacy
     * single-image field) wins over the gallery's first entry when both are sent, so
     * existing dashboard flows that only set imageUrl keep working. Otherwise the first
     * gallery photo becomes the grid thumbnail stored in menu_items.image_url.
     */
    private void applyImages(MenuItem item, List<String> imageUrls, String explicitImageUrl) {
        item.getImages().clear();
        if (imageUrls == null || imageUrls.isEmpty()) {
            // No gallery sent: keep the explicit single imageUrl if provided, else leave as-is.
            if (explicitImageUrl != null) {
                item.setImageUrl(explicitImageUrl.isBlank() ? null : explicitImageUrl.trim());
            }
            return;
        }
        int order = 0;
        for (String url : imageUrls) {
            if (url == null || url.isBlank()) continue;
            MenuItemImage img = new MenuItemImage();
            img.setMenuItem(item);
            img.setUrl(url.trim());
            img.setDisplayOrder(order++);
            item.getImages().add(img);
        }
        if (explicitImageUrl != null && !explicitImageUrl.isBlank()) {
            item.setImageUrl(explicitImageUrl.trim());
        } else if (!item.getImages().isEmpty()) {
            item.setImageUrl(item.getImages().get(0).getUrl());
        }
    }

    /**
     * Validates and applies a discount to an item. A null/blank/"NONE" type clears the discount.
     * PERCENT must be in (0,100); FIXED (a sale price) must be in (0, item price). When both
     * dates are given, the end must be after the start. Validates against the item's current
     * price, so callers must set the final price first.
     */
    private void applyDiscount(MenuItem item, String type, BigDecimal value, Instant startsAt, Instant endsAt) {
        if (type == null || type.isBlank() || "NONE".equalsIgnoreCase(type.trim())) {
            item.setDiscountType(null);
            item.setDiscountValue(null);
            item.setDiscountStartsAt(null);
            item.setDiscountEndsAt(null);
            return;
        }
        DiscountType discountType;
        try {
            discountType = DiscountType.valueOf(type.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "Discount type must be PERCENT or FIXED.");
        }
        if (value == null || value.signum() <= 0) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "A discount needs a value greater than zero.");
        }
        if (discountType == DiscountType.PERCENT) {
            if (value.compareTo(BigDecimal.valueOf(100)) >= 0) {
                throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "Percent discount must be less than 100.");
            }
        } else { // FIXED sale price
            if (item.getPrice() != null && value.compareTo(item.getPrice()) >= 0) {
                throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "Sale price must be lower than the regular price.");
            }
        }
        if (startsAt != null && endsAt != null && !endsAt.isAfter(startsAt)) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "Discount end must be after its start.");
        }
        item.setDiscountType(discountType);
        item.setDiscountValue(value);
        item.setDiscountStartsAt(startsAt);
        item.setDiscountEndsAt(endsAt);
    }

    /**
     * Reconciles an item's option groups against the submitted list.
     *
     * <p>Rows are matched by English name and <em>updated in place</em> rather than dropped and
     * recreated. That matters because option ids are now referenced from outside the menu: a
     * modifier's stock recipe and its packaging rule both hang off {@code menu_item_options.id}
     * with ON DELETE CASCADE. Recreating an option on an unrelated edit — renaming the item,
     * changing its price — would silently delete the café's recipe work.
     *
     * <p>Anything not matched is removed, so orphanRemoval still does the real deleting.
     */
    private void applyOptionGroups(MenuItem item, List<CreateMenuItemRequest.OptionGroupInput> groups) {
        if (groups == null) {
            return;
        }
        List<CreateMenuItemRequest.OptionGroupInput> inputs = groups;
        List<MenuItemOptionGroup> existing = new ArrayList<>(item.getOptionGroups());

        // Which existing group each input maps onto (null = brand new).
        Map<Integer, MenuItemOptionGroup> matched = new HashMap<>();
        Set<Long> claimed = new HashSet<>();
        for (int i = 0; i < inputs.size(); i++) {
            MenuItemOptionGroup hit = findByName(existing, claimed, inputs.get(i).nameEn());
            // Single-group items (what the editor produces) are matched positionally as a
            // fallback, so renaming the group doesn't count as replacing it.
            if (hit == null && inputs.size() == 1 && existing.size() == 1
                    && !claimed.contains(existing.get(0).getId())) {
                hit = existing.get(0);
            }
            if (hit != null) {
                matched.put(i, hit);
                claimed.add(hit.getId());
            }
        }

        item.getOptionGroups().removeIf(g -> !claimed.contains(g.getId()));

        int groupOrder = 0;
        for (int i = 0; i < inputs.size(); i++) {
            CreateMenuItemRequest.OptionGroupInput g = inputs.get(i);
            MenuItemOptionGroup group = matched.get(i);
            if (group == null) {
                group = new MenuItemOptionGroup();
                group.setMenuItem(item);
                item.getOptionGroups().add(group);
            }
            group.setNameEn(g.nameEn());
            group.setNameAr(g.nameAr());
            group.setSelectionType(parseSelectionType(g.selectionType()));
            group.setRequired(Boolean.TRUE.equals(g.required()));
            group.setDisplayOrder(g.displayOrder() != null ? g.displayOrder() : groupOrder);
            applyOptions(group, g.options() == null ? List.of() : g.options());
            groupOrder++;
        }
    }

    /** Same name-matching reconciliation one level down, for the choices inside a group. */
    private void applyOptions(MenuItemOptionGroup group, List<CreateMenuItemRequest.OptionInput> inputs) {
        List<MenuItemOption> existing = new ArrayList<>(group.getOptions());
        Map<Integer, MenuItemOption> matched = new HashMap<>();
        Set<Long> claimed = new HashSet<>();
        for (int i = 0; i < inputs.size(); i++) {
            MenuItemOption hit = findOptionByName(existing, claimed, inputs.get(i).nameEn());
            if (hit != null) {
                matched.put(i, hit);
                claimed.add(hit.getId());
            }
        }
        group.getOptions().removeIf(o -> !claimed.contains(o.getId()));

        int optOrder = 0;
        for (int i = 0; i < inputs.size(); i++) {
            CreateMenuItemRequest.OptionInput o = inputs.get(i);
            MenuItemOption opt = matched.get(i);
            if (opt == null) {
                opt = new MenuItemOption();
                opt.setOptionGroup(group);
                group.getOptions().add(opt);
            }
            opt.setNameEn(o.nameEn());
            opt.setNameAr(o.nameAr());
            opt.setPriceDelta(o.priceDelta() != null ? o.priceDelta() : BigDecimal.ZERO);
            opt.setDisplayOrder(o.displayOrder() != null ? o.displayOrder() : optOrder);
            optOrder++;
        }
    }

    private static MenuItemOptionGroup findByName(List<MenuItemOptionGroup> pool, Set<Long> claimed, String nameEn) {
        if (nameEn == null) {
            return null;
        }
        return pool.stream()
                .filter(g -> g.getId() != null && !claimed.contains(g.getId()))
                .filter(g -> nameEn.equalsIgnoreCase(g.getNameEn()))
                .findFirst()
                .orElse(null);
    }

    private static MenuItemOption findOptionByName(List<MenuItemOption> pool, Set<Long> claimed, String nameEn) {
        if (nameEn == null) {
            return null;
        }
        return pool.stream()
                .filter(o -> o.getId() != null && !claimed.contains(o.getId()))
                .filter(o -> nameEn.equalsIgnoreCase(o.getNameEn()))
                .findFirst()
                .orElse(null);
    }

    private OptionSelectionType parseSelectionType(String raw) {
        if (raw == null) throw new BadRequestException("selectionType is required for option groups");
        try {
            return OptionSelectionType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("selectionType must be SINGLE or MULTI, got: " + raw);
        }
    }
}
