package com.cafeqr.orders;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.common.util.Phones;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.common.util.Tokens;
import com.cafeqr.customers.CustomerService;
import com.cafeqr.loyalty.LoyaltyService;
import com.cafeqr.menus.MenuService;
import com.cafeqr.otp.OtpService;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.orders.domain.OrderStatus;
import com.cafeqr.orders.domain.OrderType;
import com.cafeqr.orders.dto.AcceptOrderRequest;
import com.cafeqr.orders.dto.CreateOrderRequest;
import com.cafeqr.orders.dto.CreateStaffOrderRequest;
import com.cafeqr.orders.dto.OrderResponse;
import com.cafeqr.orders.dto.OrderSummaryResponse;
import com.cafeqr.orders.dto.OrderTrackingResponse;
import com.cafeqr.orders.realtime.OrderEvent;
import com.cafeqr.orders.realtime.OrderStreamService;
import com.cafeqr.orders.repository.OrderRepository;
import com.cafeqr.analytics.EventLogService;
import com.cafeqr.menus.domain.MenuItemOption;
import com.cafeqr.menus.domain.MenuItemOptionGroup;
import com.cafeqr.notifications.NotificationPayload;
import com.cafeqr.notifications.NotificationService;
import com.cafeqr.notifications.NotificationType;
import com.cafeqr.presence.event.PresenceChangedEvent;
import org.springframework.context.ApplicationEventPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.stock.StockConsumptionService;
import com.cafeqr.tables.domain.RestaurantTable;
import com.cafeqr.tables.TableService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

@Service
public class OrderService {

    private static final int MONEY_SCALE = 3;
    private static final List<OrderStatus> LIVE_STATUSES =
            List.of(OrderStatus.PENDING, OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY);

    private final OrderRepository orderRepository;
    private final RestaurantService restaurantService;
    private final BranchService branchService;
    private final TableService tableService;
    private final MenuService menuService;
    private final AccessGuard accessGuard;
    private final NotificationService notificationService;
    private final OrderStreamService streamService;
    private final ApplicationEventPublisher events;
    private final CustomerService customerService;
    private final OtpService otpService;
    private final EventLogService eventLogService;
    private final LoyaltyService loyaltyService;
    private final StockConsumptionService stockConsumptionService;
    private final ObjectMapper objectMapper;

    public OrderService(OrderRepository orderRepository,
                        RestaurantService restaurantService,
                        BranchService branchService,
                        TableService tableService,
                        MenuService menuService,
                        AccessGuard accessGuard,
                        NotificationService notificationService,
                        OrderStreamService streamService,
                        ApplicationEventPublisher events,
                        CustomerService customerService,
                        OtpService otpService,
                        EventLogService eventLogService,
                        LoyaltyService loyaltyService,
                        StockConsumptionService stockConsumptionService,
                        ObjectMapper objectMapper) {
        this.orderRepository = orderRepository;
        this.restaurantService = restaurantService;
        this.branchService = branchService;
        this.tableService = tableService;
        this.menuService = menuService;
        this.accessGuard = accessGuard;
        this.notificationService = notificationService;
        this.streamService = streamService;
        this.events = events;
        this.customerService = customerService;
        this.otpService = otpService;
        this.eventLogService = eventLogService;
        this.loyaltyService = loyaltyService;
        this.stockConsumptionService = stockConsumptionService;
        this.objectMapper = objectMapper;
    }

    // ============================================================ customer (public)

    @Transactional
    public OrderTrackingResponse createOrder(CreateOrderRequest request) {
        Restaurant restaurant = restaurantService.getActiveBySlug(request.restaurantSlug());
        Branch branch = branchService.getEntityInRestaurant(restaurant.getId(), request.branchId());
        branchService.requireActive(branch);
        branchService.requireAcceptingOrders(branch);

        Long tableId = resolveTable(restaurant, branch, request);

        if (request.orderType() == OrderType.CAR) {
            if (request.customerName() == null || request.customerName().isBlank()) {
                throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "Name is required for car orders.");
            }
            // A car order has no table to anchor it to, so the phone is the only way staff can
            // reach the customer / match the car. DINE_IN already carries a table id, so the
            // phone there is purely opt-in (it only exists to attach loyalty stamps).
            if (request.customerPhone() == null || request.customerPhone().isBlank()) {
                throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "Phone is required for car orders.");
            }
        }

        String customerPhone = Phones.normalize(request.customerPhone());
        if (customerPhone != null && customerService.isBlocked(restaurant.getId(), customerPhone)) {
            throw new BadRequestException(ErrorCode.PHONE_BLOCKED,
                    "Ordering from this phone number is not accepted. Please contact the cafe.");
        }
        // OTP disabled — validate token only when one is present (re-enable once provider is set up).
        // Guarded on customerPhone != null too: without a phone there's nothing to verify a token
        // against (isPhoneTokenValid matches the token's subject against the normalized phone).
        if (customerPhone != null && request.phoneToken() != null && !request.phoneToken().isBlank()
                && !otpService.isPhoneTokenValid(customerPhone, request.phoneToken())) {
            throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                    "Phone verification required. Please verify your number via WhatsApp.");
        }

        Order order = new Order();
        order.setRestaurantId(restaurant.getId());
        order.setBranchId(branch.getId());
        order.setTableId(tableId);
        order.setCustomerName(request.customerName());
        order.setCustomerPhone(customerPhone);
        order.setCarPlate(normalizeCarPlate(request));
        order.setCarColor(normalizeCarColor(request));
        order.setCustomerNote(request.customerNote());
        order.setOrderType(request.orderType());
        order.setStatus(OrderStatus.PENDING);

        BigDecimal subtotal = addItems(order, restaurant, branch, request.items());

        BigDecimal vatAmount = computeVat(restaurant, subtotal);
        order.setSubtotal(subtotal);
        order.setVatAmount(vatAmount);
        order.setTotal(subtotal.add(vatAmount));
        order.setOrderNumber(nextOrderNumber());
        order.setDailyNumber(orderRepository.nextDailyNumber(branch.getId(), LocalDate.now(TimeZones.CAFES)));
        order.setTrackingToken(Tokens.random(18));

        Order saved = orderRepository.save(order);
        customerService.recordOrder(saved, request.deviceToken());
        // Reserve a loyalty reward redemption if requested (adjusts the saved order's total).
        loyaltyService.applyRedemption(saved, request.redeemReward(), request.redeemItemId());

        notifyAndStream(saved, NotificationType.NEW_ORDER, "order.created",
                "New order " + saved.getOrderNumber() + " received");
        eventLogService.recordOrderEvent(saved, OrderStatus.PENDING, null);
        events.publishEvent(new PresenceChangedEvent(saved.getBranchId())); // bump live QR activity
        return OrderTrackingResponse.from(saved);
    }

    /**
     * Manual order taken by staff from the dashboard order pad. Skips the customer
     * verification path entirely — no OTP, no phone requirement, no blocklist — since the
     * acting staff member is trusted (and recorded on the order event log). The order lands
     * straight in the kitchen queue as ACCEPTED rather than waiting on a PENDING accept.
     */
    @Transactional
    public OrderResponse createStaffOrder(CreateStaffOrderRequest request) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        if (restaurantId == null) {
            throw new BadRequestException("Only café staff can take manual orders.");
        }
        Restaurant restaurant = restaurantService.getEntity(restaurantId);
        Branch branch = branchService.getEntityInRestaurant(restaurantId, request.branchId());
        accessGuard.requireBranchAccess(restaurantId, branch.getId());
        branchService.requireActive(branch);

        Order order = new Order();
        order.setRestaurantId(restaurantId);
        order.setBranchId(branch.getId());
        order.setOrderType(request.orderType());

        if (request.orderType() == OrderType.DINE_IN && request.tableId() != null) {
            RestaurantTable table = tableService.getEntity(request.tableId());
            if (!table.getBranchId().equals(branch.getId()) || !table.getRestaurantId().equals(restaurantId)) {
                throw new BadRequestException(ErrorCode.TABLE_INVALID, "Table does not belong to this branch");
            }
            order.setTableId(table.getId());
        }
        if (request.orderType() == OrderType.CAR) {
            if (request.carPlate() != null && !request.carPlate().isBlank()) {
                order.setCarPlate(request.carPlate().trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT));
            }
            if (request.carColor() != null && !request.carColor().isBlank()) {
                order.setCarColor(request.carColor().trim().toLowerCase(Locale.ROOT));
            }
        }

        order.setCustomerName(blankToNull(request.customerName()));
        order.setCustomerPhone(request.customerPhone() == null || request.customerPhone().isBlank()
                ? null : Phones.normalize(request.customerPhone()));
        order.setCustomerNote(blankToNull(request.customerNote()));
        order.setStatus(OrderStatus.ACCEPTED);
        order.setAcceptedAt(Instant.now());

        BigDecimal subtotal = addItems(order, restaurant, branch, request.items());
        BigDecimal vatAmount = computeVat(restaurant, subtotal);
        order.setSubtotal(subtotal);
        order.setVatAmount(vatAmount);
        order.setTotal(subtotal.add(vatAmount));
        order.setOrderNumber(nextOrderNumber());
        order.setDailyNumber(orderRepository.nextDailyNumber(branch.getId(), LocalDate.now(TimeZones.CAFES)));
        order.setTrackingToken(Tokens.random(18));

        Order saved = orderRepository.save(order);
        // A staff order opens as ACCEPTED, so it draws stock the moment it is taken.
        stockConsumptionService.onOrderAccepted(saved, restaurant);
        eventLogService.recordOrderEvent(saved, OrderStatus.ACCEPTED, "Manual order (staff)");
        notifyAndStream(saved, NotificationType.NEW_ORDER, "order.created",
                "New manual order " + saved.getOrderNumber());
        events.publishEvent(new PresenceChangedEvent(saved.getBranchId()));
        return OrderResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public OrderTrackingResponse getTracking(String trackingToken) {
        Order order = orderRepository.findWithItemsByTrackingToken(trackingToken)
                .orElseThrow(() -> ResourceNotFoundException.of("Order", trackingToken));
        // The customer reached this page by placing the order, so it's safe to show their own
        // stamp progress here — closes the loop after a stamp is earned / reward redeemed.
        return OrderTrackingResponse.from(order,
                loyaltyService.summaryForRestaurant(order.getRestaurantId(), order.getCustomerPhone()),
                loyaltyService.orderEarnedStamp(order.getId()));
    }

    @Transactional(readOnly = true)
    public SseEmitter streamForCustomer(String trackingToken) {
        if (orderRepository.findByTrackingToken(trackingToken).isEmpty()) {
            throw ResourceNotFoundException.of("Order", trackingToken);
        }
        return streamService.subscribe(OrderStreamService.orderChannel(trackingToken));
    }

    // ============================================================ dashboard

    @Transactional(readOnly = true)
    public Page<OrderSummaryResponse> listForDashboard(OrderStatus status, Long branchId, Pageable pageable) {
        Long restaurantScope = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);
        return orderRepository.search(restaurantScope, branchScope, status, pageable)
                .map(OrderSummaryResponse::from);
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> liveForDashboard(Long branchId) {
        Long restaurantScope = accessGuard.scopedRestaurantId();
        Long branchScope = resolveBranchScope(branchId);
        return orderRepository.findLive(restaurantScope, branchScope, LIVE_STATUSES)
                .stream().map(OrderResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public OrderResponse getForDashboard(Long orderId) {
        Order order = loadWithItems(orderId);
        accessGuard.requireBranchAccess(order.getRestaurantId(), order.getBranchId());
        return OrderResponse.from(order);
    }

    @Transactional
    public OrderResponse accept(Long orderId, AcceptOrderRequest request) {
        Order order = loadGuarded(orderId);
        transition(order, OrderStatus.ACCEPTED);
        order.setAcceptedAt(Instant.now());
        if (request != null && request.prepTimeMinutes() != null) {
            order.setPrepTimeMinutes(request.prepTimeMinutes());
        }
        // Accepting is the moment the kitchen commits to making it, so it is where stock moves —
        // earlier would drain inventory for orders that end up declined, later would be too late
        // to stop the next customer ordering the last croissant.
        stockConsumptionService.onOrderAccepted(order, restaurantService.getEntity(order.getRestaurantId()));
        eventLogService.recordOrderEvent(order, OrderStatus.ACCEPTED, null);
        notifyAndStream(order, NotificationType.ORDER_ACCEPTED, "order.accepted",
                "Order " + order.getOrderNumber() + " accepted");
        return OrderResponse.from(order);
    }

    @Transactional
    public OrderResponse decline(Long orderId, String reason) {
        // "Decline" is the pre-accept reject; it now lands in the merged CANCELLED state (the
        // reason is still surfaced to the customer), so cafés have one "didn't happen" bucket.
        Order order = loadGuarded(orderId);
        OrderStatus previous = order.getStatus();
        transition(order, OrderStatus.CANCELLED);
        order.setCancelledAt(Instant.now());
        loyaltyService.onOrderCancelled(order); // return any reserved reward
        if (StockConsumptionService.hadBeenAccepted(previous)) {
            stockConsumptionService.onOrderCancelled(order); // give back what it drew
        }
        String trimmed = (reason == null || reason.isBlank()) ? null : reason.trim();
        order.setDeclineReason(trimmed);
        eventLogService.recordOrderEvent(order, OrderStatus.CANCELLED, trimmed);
        notifyAndStream(order, NotificationType.ORDER_DECLINED, "order.declined",
                "Order " + order.getOrderNumber() + " declined" + (trimmed != null ? ": " + trimmed : ""));
        return OrderResponse.from(order);
    }

    @Transactional
    public OrderResponse markReady(Long orderId) {
        Order order = loadGuarded(orderId);
        transition(order, OrderStatus.READY);
        order.setReadyAt(Instant.now());
        eventLogService.recordOrderEvent(order, OrderStatus.READY, null);
        notifyAndStream(order, NotificationType.ORDER_READY, "order.ready",
                "Order " + order.getOrderNumber() + " is ready");
        return OrderResponse.from(order);
    }

    @Transactional
    public OrderResponse complete(Long orderId) {
        Order order = loadGuarded(orderId);
        transition(order, OrderStatus.COMPLETED);
        order.setCompletedAt(Instant.now());
        loyaltyService.onOrderCompleted(order); // earn a stamp + confirm any reserved reward
        eventLogService.recordOrderEvent(order, OrderStatus.COMPLETED, null);
        // Receipt printing is device-local: the tablet that completes the order prints it via
        // RawBT (see frontend printer.ts). The print-jobs queue slice is dormant — kept in
        // case cross-device printing returns, but nothing enqueues into it anymore.
        notifyAndStream(order, NotificationType.ORDER_COMPLETED, "order.completed",
                "Order " + order.getOrderNumber() + " completed");
        return OrderResponse.from(order);
    }

    @Transactional
    public OrderResponse cancel(Long orderId, String reason) {
        Order order = loadGuarded(orderId);
        OrderStatus previous = order.getStatus();
        transition(order, OrderStatus.CANCELLED);
        order.setCancelledAt(Instant.now());
        loyaltyService.onOrderCancelled(order); // return any reserved reward
        if (StockConsumptionService.hadBeenAccepted(previous)) {
            stockConsumptionService.onOrderCancelled(order); // give back what it drew
        }
        String trimmed = (reason == null || reason.isBlank()) ? null : reason.trim();
        if (trimmed != null) {
            order.setInternalNote(trimmed);
        }
        eventLogService.recordOrderEvent(order, OrderStatus.CANCELLED, trimmed);
        streamOnly(order, "order.cancelled");
        return OrderResponse.from(order);
    }

    @Transactional(readOnly = true)
    public SseEmitter streamForDashboard(Long branchId) {
        Long branchScope = resolveBranchScope(branchId);
        Long restaurantScope = accessGuard.scopedRestaurantId();
        if (branchScope != null) {
            return streamService.subscribe(OrderStreamService.branchChannel(branchScope));
        }
        if (restaurantScope != null) {
            return streamService.subscribe(OrderStreamService.restaurantChannel(restaurantScope));
        }
        throw new BadRequestException("Platform admin must specify a branchId to stream");
    }

    // ============================================================ helpers

    private Long resolveTable(Restaurant restaurant, Branch branch, CreateOrderRequest request) {
        if (request.orderType() == OrderType.DINE_IN) {
            if (request.tableToken() == null || request.tableToken().isBlank()) {
                throw new BadRequestException(ErrorCode.TABLE_INVALID, "A table QR token is required for dine-in orders");
            }
            RestaurantTable table = tableService.getActiveByToken(request.tableToken());
            if (!table.getBranchId().equals(branch.getId())
                    || !table.getRestaurantId().equals(restaurant.getId())) {
                throw new BadRequestException(ErrorCode.TABLE_INVALID, "Table does not belong to this branch");
            }
            return table.getId();
        }
        return null;
    }

    private String normalizeCarPlate(CreateOrderRequest request) {
        if (request.orderType() != OrderType.CAR) {
            return null;
        }
        if (request.carPlate() == null || request.carPlate().isBlank()) {
            return null;
        }
        return request.carPlate().trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
    }

    private String normalizeCarColor(CreateOrderRequest request) {
        if (request.orderType() != OrderType.CAR
                || request.carColor() == null || request.carColor().isBlank()) {
            return null;
        }
        return request.carColor().trim().toLowerCase(Locale.ROOT);
    }

    /** Builds order lines from the request items (validating availability + options) and returns the subtotal. */
    private BigDecimal addItems(Order order, Restaurant restaurant, Branch branch, List<CreateOrderRequest.Item> items) {
        BigDecimal subtotal = BigDecimal.ZERO.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
        Instant pricedAt = Instant.now();
        for (CreateOrderRequest.Item line : items) {
            MenuItem menuItem = menuService.getOrderableItem(restaurant.getId(), branch.getId(), line.menuItemId());
            ResolvedOptions resolved = resolveOptions(menuItem, line.selectedOptions());

            // Stock is checked here rather than in getOrderableItem because only here do we know
            // the quantity, the chosen options and the service style — which is what catches
            // "no oat milk left" on a drink whose dairy version is perfectly makeable.
            stockConsumptionService.requireSellable(menuItem, branch.getId(), line.quantity(),
                    selectedOptionIds(line.selectedOptions()), order.getOrderType(),
                    restaurant.isDisposablesForDineIn());

            // effectivePrice honours any active discount/window; option deltas stack on top.
            BigDecimal unitPrice = menuItem.effectivePrice(pricedAt).add(resolved.priceDelta());
            BigDecimal lineTotal = unitPrice
                    .multiply(BigDecimal.valueOf(line.quantity()))
                    .setScale(MONEY_SCALE, RoundingMode.HALF_UP);

            OrderItem orderItem = new OrderItem();
            orderItem.setMenuItemId(menuItem.getId());
            orderItem.setNameEnSnapshot(menuItem.getNameEn());
            orderItem.setNameArSnapshot(menuItem.getNameAr());
            // price_snapshot records the effective per-unit price (base + chosen options),
            // so historical orders show what was actually paid per unit.
            orderItem.setPriceSnapshot(unitPrice);
            orderItem.setQuantity(line.quantity());
            orderItem.setNote(line.note());
            orderItem.setLineTotal(lineTotal);
            orderItem.setSelectedOptionsJson(resolved.snapshotJson());
            order.addItem(orderItem);

            subtotal = subtotal.add(lineTotal);
        }
        return subtotal;
    }

    /** Just the option ids from a request line — what the stock check needs from the selection. */
    private static List<Long> selectedOptionIds(List<CreateOrderRequest.SelectedOption> selections) {
        if (selections == null || selections.isEmpty()) {
            return List.of();
        }
        return selections.stream().map(CreateOrderRequest.SelectedOption::optionId).toList();
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private BigDecimal computeVat(Restaurant restaurant, BigDecimal subtotal) {
        if (!restaurant.isVatEnabled() || restaurant.getVatRate() == null
                || restaurant.getVatRate().signum() == 0) {
            return BigDecimal.ZERO.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
        }
        return subtotal.multiply(restaurant.getVatRate())
                .divide(BigDecimal.valueOf(100), MONEY_SCALE, RoundingMode.HALF_UP);
    }

    // ------------------------------------------------------ menu options at order time

    /**
     * Validates the customer's option selections against the menu item's option groups,
     * enforces single/multi and required rules, and returns the total price delta plus
     * a JSON snapshot for the order line. Selections may be null/empty for items with no
     * options (or where the customer chose none) — unless a SINGLE group is required.
     */
    private ResolvedOptions resolveOptions(MenuItem menuItem,
                                           List<CreateOrderRequest.SelectedOption> selections) {
        var groupsById = new java.util.HashMap<Long, MenuItemOptionGroup>();
        var optionsByGroupId = new java.util.HashMap<Long, java.util.Map<Long, MenuItemOption>>();
        for (MenuItemOptionGroup g : menuItem.getOptionGroups()) {
            groupsById.put(g.getId(), g);
            java.util.Map<Long, MenuItemOption> opts = new java.util.HashMap<>();
            for (MenuItemOption o : g.getOptions()) opts.put(o.getId(), o);
            optionsByGroupId.put(g.getId(), opts);
        }

        selections = selections == null ? List.of() : selections;
        java.util.Map<Long, Integer> countPerGroup = new java.util.HashMap<>();
        java.util.List<SelectedOptionSnapshot> snapshots = new java.util.ArrayList<>(selections.size());
        BigDecimal delta = BigDecimal.ZERO.setScale(MONEY_SCALE, RoundingMode.HALF_UP);

        for (CreateOrderRequest.SelectedOption s : selections) {
            MenuItemOptionGroup group = groupsById.get(s.optionGroupId());
            if (group == null) {
                throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "Unknown option group for item \"" + menuItem.getNameEn() + "\": " + s.optionGroupId());
            }
            MenuItemOption option = optionsByGroupId.get(s.optionGroupId()).get(s.optionId());
            if (option == null) {
                throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                        "Unknown option in group \"" + group.getNameEn() + "\": " + s.optionId());
            }
            countPerGroup.merge(group.getId(), 1, Integer::sum);
            delta = delta.add(option.getPriceDelta() == null ? BigDecimal.ZERO : option.getPriceDelta());
            snapshots.add(new SelectedOptionSnapshot(group.getId(), group.getNameEn(), group.getNameAr(),
                    option.getId(), option.getNameEn(), option.getNameAr(), option.getPriceDelta()));
        }

        // Enforce per-group rules.
        for (MenuItemOptionGroup g : menuItem.getOptionGroups()) {
            int count = countPerGroup.getOrDefault(g.getId(), 0);
            if (g.getSelectionType() == com.cafeqr.menus.domain.OptionSelectionType.SINGLE) {
                if (count > 1) {
                    throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                            "Group \"" + g.getNameEn() + "\" allows only one choice.");
                }
                if (g.isRequired() && count == 0) {
                    throw new BadRequestException(ErrorCode.VALIDATION_ERROR,
                            "Please choose a " + g.getNameEn() + ".");
                }
            }
            // MULTI groups are always optional (zero allowed).
        }

        String json = snapshots.isEmpty() ? null : serializeOptions(snapshots);
        return new ResolvedOptions(delta, json);
    }

    private String serializeOptions(java.util.List<SelectedOptionSnapshot> snapshots) {
        try {
            return objectMapper.writeValueAsString(snapshots);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize selected options", e);
        }
    }

    /** Effective price delta and JSON snapshot for one order line. */
    private record ResolvedOptions(BigDecimal priceDelta, String snapshotJson) {}

    /** Denormalized snapshot of one chosen option, persisted in order_items.selected_options_json. */
    private record SelectedOptionSnapshot(Long groupId, String groupNameEn, String groupNameAr,
                                          Long optionId, String optionNameEn, String optionNameAr,
                                          BigDecimal priceDelta) {}

    private String nextOrderNumber() {
        return "ORD-" + String.format("%06d", orderRepository.nextOrderNumber());
    }

    private Order loadWithItems(Long orderId) {
        return orderRepository.findWithItemsById(orderId)
                .orElseThrow(() -> ResourceNotFoundException.of("Order", orderId));
    }

    private Order loadGuarded(Long orderId) {
        Order order = loadWithItems(orderId);
        accessGuard.requireBranchAccess(order.getRestaurantId(), order.getBranchId());
        return order;
    }

    private void transition(Order order, OrderStatus target) {
        if (!order.getStatus().canTransitionTo(target)) {
            throw new BadRequestException(ErrorCode.INVALID_ORDER_STATUS_TRANSITION,
                    "Cannot change order from " + order.getStatus() + " to " + target);
        }
        order.setStatus(target);
    }

    private Long resolveBranchScope(Long requestedBranchId) {
        Long scoped = accessGuard.scopedBranchId();
        if (scoped != null) {
            return scoped; // branch-scoped users are pinned to their branch
        }
        if (requestedBranchId != null) {
            Branch branch = branchService.getEntity(requestedBranchId);
            accessGuard.requireRestaurantAccess(branch.getRestaurantId());
            return requestedBranchId;
        }
        return null;
    }

    private void notifyAndStream(Order order, NotificationType type, String eventName, String message) {
        notificationService.send(new NotificationPayload(
                type, order.getRestaurantId(), order.getBranchId(), order.getId(),
                order.getOrderNumber(), order.getCustomerPhone(), message));
        streamOnly(order, eventName);
    }

    private void streamOnly(Order order, String eventName) {
        // Snapshot the views now, while the entity (and its items) are still loaded,
        // then publish only after the transaction commits so dashboard refetches and
        // the customer tracking stream observe committed data (no read-after-write race,
        // no phantom orders if the commit rolls back).
        OrderResponse dashboardView = OrderResponse.from(order);
        OrderTrackingResponse trackingView = OrderTrackingResponse.from(order);
        List<String> dashboardChannels = List.of(
                OrderStreamService.restaurantChannel(order.getRestaurantId()),
                OrderStreamService.branchChannel(order.getBranchId()));
        String customerChannel = OrderStreamService.orderChannel(order.getTrackingToken());

        afterCommit(() -> {
            streamService.publishAll(dashboardChannels, OrderEvent.of(eventName, dashboardView));
            streamService.publish(customerChannel, OrderEvent.of(eventName, trackingView));
        });
    }

    /** Run {@code action} after the current transaction commits (or immediately if none is active). */
    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
