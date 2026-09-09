package com.cafeqr.restaurants;

import com.cafeqr.common.exception.BadRequestException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.common.util.Names;
import com.cafeqr.common.util.Slugs;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.restaurants.dto.CreateRestaurantRequest;
import com.cafeqr.restaurants.dto.RestaurantResponse;
import com.cafeqr.restaurants.dto.UpdateRestaurantRequest;
import com.cafeqr.restaurants.repository.RestaurantRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
public class RestaurantService {

    private static final ObjectMapper THEME_JSON = new ObjectMapper();

    private final RestaurantRepository restaurantRepository;

    public RestaurantService(RestaurantRepository restaurantRepository) {
        this.restaurantRepository = restaurantRepository;
    }

    @Transactional
    public RestaurantResponse create(CreateRestaurantRequest request) {
        Restaurant restaurant = new Restaurant();
        Names.applyOnCreate(restaurant, request.name(), request.nameEn(), request.nameAr());
        restaurant.setSlug(resolveSlug(request.slug(), restaurant));
        restaurant.setLogoUrl(request.logoUrl());
        restaurant.setPhone(request.phone());
        restaurant.setEmail(request.email());
        restaurant.setInstagramUrl(request.instagramUrl());
        restaurant.setCurrency(request.currency() != null ? request.currency().toUpperCase() : "OMR");
        restaurant.setVatEnabled(request.vatEnabled() == null || request.vatEnabled());
        restaurant.setVatRate(request.vatRate() != null ? request.vatRate() : new BigDecimal("5"));
        restaurant.setActive(true);
        // New cafés default to STANDARD (gate is on); honor an explicit tier choice from the admin.
        if (request.plan() != null) {
            restaurant.setPlan(request.plan());
        }
        return RestaurantResponse.from(restaurantRepository.save(restaurant));
    }

    @Transactional(readOnly = true)
    public Page<RestaurantResponse> list(Boolean active, Pageable pageable) {
        Page<Restaurant> page = (active == null)
                ? restaurantRepository.findAll(pageable)
                : restaurantRepository.findByActive(active, pageable);
        return page.map(RestaurantResponse::from);
    }

    @Transactional(readOnly = true)
    public RestaurantResponse get(Long id) {
        return RestaurantResponse.from(getEntity(id));
    }

    @Transactional
    public RestaurantResponse update(Long id, UpdateRestaurantRequest request) {
        Restaurant restaurant = getEntity(id);
        Names.applyOnUpdate(restaurant, request.name(), request.nameEn(), request.nameAr());
        // Blank string clears the logo (PATCH null = "leave unchanged", so clients send "").
        if (request.logoUrl() != null) {
            restaurant.setLogoUrl(request.logoUrl().isBlank() ? null : request.logoUrl().trim());
        }
        if (request.phone() != null) {
            restaurant.setPhone(request.phone());
        }
        if (request.email() != null) {
            restaurant.setEmail(request.email());
        }
        if (request.instagramUrl() != null) {
            restaurant.setInstagramUrl(request.instagramUrl());
        }
        if (request.currency() != null) {
            restaurant.setCurrency(request.currency().toUpperCase());
        }
        if (request.vatEnabled() != null) {
            restaurant.setVatEnabled(request.vatEnabled());
        }
        if (request.autoHideOutOfStock() != null) {
            restaurant.setAutoHideOutOfStock(request.autoHideOutOfStock());
        }
        if (request.disposablesForDineIn() != null) {
            restaurant.setDisposablesForDineIn(request.disposablesForDineIn());
        }
        if (request.vatRate() != null) {
            restaurant.setVatRate(request.vatRate());
        }
        if (request.paymentMethodSelectionEnabled() != null) {
            restaurant.setPaymentMethodSelectionEnabled(request.paymentMethodSelectionEnabled());
        }
        return RestaurantResponse.from(restaurant);
    }

    @Transactional
    public RestaurantResponse updateTheme(Long id, String theme, String themeCustomJson) {
        Restaurant restaurant = getEntity(id);
        String json = (themeCustomJson == null || themeCustomJson.isBlank()) ? null : themeCustomJson.trim();
        if (json != null && !isJsonObject(json)) {
            throw new BadRequestException("themeCustomJson must be a valid JSON object");
        }
        restaurant.setTheme(theme);
        restaurant.setThemeCustomJson(json);
        return RestaurantResponse.from(restaurant);
    }

    @Transactional
    public RestaurantResponse updateReceiptSettings(Long id, String receiptSettingsJson) {
        Restaurant restaurant = getEntity(id);
        String json = (receiptSettingsJson == null || receiptSettingsJson.isBlank()) ? null : receiptSettingsJson.trim();
        if (json != null && !isJsonObject(json)) {
            throw new BadRequestException("receiptSettingsJson must be a valid JSON object");
        }
        restaurant.setReceiptSettingsJson(json);
        return RestaurantResponse.from(restaurant);
    }

    @Transactional
    public RestaurantResponse updateMenuInfo(Long id, String menuInfoJson) {
        Restaurant restaurant = getEntity(id);
        String json = (menuInfoJson == null || menuInfoJson.isBlank()) ? null : menuInfoJson.trim();
        if (json != null && !isJsonObject(json)) {
            throw new BadRequestException("menuInfoJson must be a valid JSON object");
        }
        restaurant.setMenuInfoJson(json);
        return RestaurantResponse.from(restaurant);
    }

    private boolean isJsonObject(String json) {
        try {
            return THEME_JSON.readTree(json).isObject();
        } catch (JsonProcessingException e) {
            return false;
        }
    }

    @Transactional
    public RestaurantResponse setActive(Long id, boolean active) {
        Restaurant restaurant = getEntity(id);
        restaurant.setActive(active);
        return RestaurantResponse.from(restaurant);
    }

    // setPlan(..) removed: a café's tier is now bought through its subscription, not assigned
    // to the café directly. See SubscriptionService#applyTier — one writer, so the gate and the
    // bill cannot disagree.

    // ---- helpers shared with other modules ----

    @Transactional(readOnly = true)
    public Restaurant getEntity(Long id) {
        return restaurantRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.of("Restaurant", id));
    }

    @Transactional(readOnly = true)
    public Restaurant getActiveBySlug(String slug) {
        Restaurant restaurant = restaurantRepository.findBySlug(slug)
                .orElseThrow(() -> ResourceNotFoundException.of("Restaurant", slug));
        if (!restaurant.isActive()) {
            throw new BadRequestException(ErrorCode.RESTAURANT_INACTIVE, "Restaurant is not active");
        }
        return restaurant;
    }

    public void requireActive(Restaurant restaurant) {
        if (!restaurant.isActive()) {
            throw new BadRequestException(ErrorCode.RESTAURANT_INACTIVE, "Restaurant is not active");
        }
    }

    /**
     * The slug comes from the English name when there is one: slugifying Arabic strips every
     * letter and leaves nothing to derive a URL from, which used to make an Arabic-named café
     * impossible to create without typing a slug by hand.
     */
    private String resolveSlug(String requestedSlug, Restaurant restaurant) {
        String base = (requestedSlug != null && !requestedSlug.isBlank())
                ? Slugs.slugify(requestedSlug)
                : Slugs.slugify(restaurant.getNameEn() != null ? restaurant.getNameEn() : restaurant.getName());
        if (base.isBlank()) {
            throw new BadRequestException("Unable to derive a slug; please provide one explicitly");
        }
        if (!restaurantRepository.existsBySlug(base)) {
            return base;
        }
        // Provided slug must be unique; auto-generated ones get a numeric suffix.
        if (requestedSlug != null && !requestedSlug.isBlank()) {
            throw new ConflictException(ErrorCode.SLUG_ALREADY_EXISTS, "Slug already in use: " + base);
        }
        int suffix = 2;
        String candidate = base + "-" + suffix;
        while (restaurantRepository.existsBySlug(candidate)) {
            suffix++;
            candidate = base + "-" + suffix;
        }
        return candidate;
    }
}
