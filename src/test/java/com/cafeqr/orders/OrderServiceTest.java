package com.cafeqr.orders;

import com.cafeqr.analytics.EventLogService;
import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.customers.CustomerService;
import com.cafeqr.loyalty.LoyaltyService;
import com.cafeqr.menus.MenuService;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.notifications.NotificationService;
import com.cafeqr.otp.OtpService;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderStatus;
import com.cafeqr.orders.domain.OrderType;
import com.cafeqr.orders.dto.AcceptOrderRequest;
import com.cafeqr.orders.dto.CreateOrderRequest;
import com.cafeqr.orders.dto.OrderResponse;
import com.cafeqr.orders.dto.OrderTrackingResponse;
import com.cafeqr.orders.realtime.OrderStreamService;
import com.cafeqr.orders.repository.OrderRepository;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.tables.TableService;
import com.cafeqr.tables.domain.RestaurantTable;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock private OrderRepository orderRepository;
    @Mock private RestaurantService restaurantService;
    @Mock private BranchService branchService;
    @Mock private TableService tableService;
    @Mock private MenuService menuService;
    @Mock private AccessGuard accessGuard;
    @Mock private NotificationService notificationService;
    @Mock private OrderStreamService streamService;
    @Mock private org.springframework.context.ApplicationEventPublisher events;
    @Mock private CustomerService customerService;
    @Mock private OtpService otpService;
    @Mock private EventLogService eventLogService;
    @Mock private LoyaltyService loyaltyService;
    @Mock private com.cafeqr.stock.StockConsumptionService stockConsumptionService;

    private OrderService orderService;

    @BeforeEach
    void setUp() {
        orderService = new OrderService(orderRepository, restaurantService, branchService, tableService,
                menuService, accessGuard, notificationService, streamService, events, customerService,
                otpService, eventLogService, loyaltyService, stockConsumptionService, new ObjectMapper());
        lenient().when(otpService.isPhoneTokenValid(any(), any())).thenReturn(true);
    }

    private Restaurant restaurant() {
        Restaurant r = new Restaurant();
        r.setId(1L);
        r.setSlug("demo");
        r.setName("Demo Cafe");
        r.setCurrency("OMR");
        r.setVatEnabled(true);
        r.setVatRate(new BigDecimal("5"));
        r.setActive(true);
        return r;
    }

    private Branch branch() {
        Branch b = new Branch();
        b.setId(5L);
        b.setRestaurantId(1L);
        b.setActive(true);
        return b;
    }

    private MenuItem menuItem() {
        MenuItem i = new MenuItem();
        i.setId(100L);
        i.setRestaurantId(1L);
        i.setCategoryId(3L);
        i.setNameEn("Latte");
        i.setNameAr("لاتيه");
        i.setPrice(new BigDecimal("1.500"));
        i.setAvailable(true);
        return i;
    }

    private Order existingOrder(OrderStatus status) {
        Order o = new Order();
        o.setId(1L);
        o.setRestaurantId(1L);
        o.setBranchId(5L);
        o.setOrderNumber("ORD-001001");
        o.setTrackingToken("track-123");
        o.setOrderType(OrderType.DINE_IN);
        o.setStatus(status);
        o.setSubtotal(new BigDecimal("3.000"));
        o.setVatAmount(new BigDecimal("0.150"));
        o.setTotal(new BigDecimal("3.150"));
        return o;
    }

    @Test
    void createsDineInOrderWithCorrectTotalsAndVat() {
        when(restaurantService.getActiveBySlug("demo")).thenReturn(restaurant());
        when(branchService.getEntityInRestaurant(1L, 5L)).thenReturn(branch());
        RestaurantTable table = new RestaurantTable();
        table.setId(9L);
        table.setBranchId(5L);
        table.setRestaurantId(1L);
        when(tableService.getActiveByToken("tok")).thenReturn(table);
        when(menuService.getOrderableItem(1L, 5L, 100L)).thenReturn(menuItem());
        when(orderRepository.nextOrderNumber()).thenReturn(1001L);
        when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order o = inv.getArgument(0);
            o.setId(1L);
            return o;
        });

        CreateOrderRequest request = new CreateOrderRequest(
                "demo", 5L, "tok", OrderType.DINE_IN, "Sara", "9999", null, null, "no sugar", null, "ptok",
                false, null, List.of(new CreateOrderRequest.Item(100L, 2, null, null)));

        OrderTrackingResponse response = orderService.createOrder(request);

        assertThat(response.subtotal()).isEqualByComparingTo("3.000");
        assertThat(response.vatAmount()).isEqualByComparingTo("0.150");
        assertThat(response.total()).isEqualByComparingTo("3.150");
        assertThat(response.status()).isEqualTo(OrderStatus.PENDING);
        assertThat(response.orderNumber()).isEqualTo("ORD-001001");
        assertThat(response.trackingToken()).isNotBlank();
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).lineTotal()).isEqualByComparingTo("3.000");
        assertThat(response.items().get(0).nameEn()).isEqualTo("Latte");

        verify(notificationService, times(1)).send(any());
    }

    @Test
    void rejectsOrderWithUnavailableItem() {
        when(restaurantService.getActiveBySlug("demo")).thenReturn(restaurant());
        when(branchService.getEntityInRestaurant(1L, 5L)).thenReturn(branch());
        when(menuService.getOrderableItem(eq(1L), eq(5L), anyLong()))
                .thenThrow(new BadRequestException(ErrorCode.MENU_ITEM_UNAVAILABLE, "unavailable"));

        CreateOrderRequest request = new CreateOrderRequest(
                "demo", 5L, null, OrderType.CAR, "Ali", "9999", "ABC1234", null, null, null, "ptok",
                false, null, List.of(new CreateOrderRequest.Item(100L, 1, null, null)));

        assertThatThrownBy(() -> orderService.createOrder(request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MENU_ITEM_UNAVAILABLE));
    }

    @Test
    void rejectsCustomerOrderWhenBranchIsNotAcceptingOrders() {
        Restaurant restaurant = restaurant();
        Branch branch = branch();
        when(restaurantService.getActiveBySlug("demo")).thenReturn(restaurant);
        when(branchService.getEntityInRestaurant(1L, 5L)).thenReturn(branch);
        org.mockito.Mockito.doThrow(new BadRequestException(
                        ErrorCode.BRANCH_NOT_ACCEPTING_ORDERS,
                        "This branch is not accepting orders right now"))
                .when(branchService).requireAcceptingOrders(branch);

        CreateOrderRequest request = new CreateOrderRequest(
                "demo", 5L, null, OrderType.CAR, "Ali", "9999", null, null, null, null, "ptok",
                false, null, List.of(new CreateOrderRequest.Item(100L, 1, null, null)));

        assertThatThrownBy(() -> orderService.createOrder(request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.BRANCH_NOT_ACCEPTING_ORDERS));
    }

    @Test
    void dineInAllowsMissingPhone() {
        // A table order already carries a table id — the phone is only for loyalty, so DINE_IN
        // must succeed without one (unlike CAR, see carOrderRequiresPhone below).
        when(restaurantService.getActiveBySlug("demo")).thenReturn(restaurant());
        when(branchService.getEntityInRestaurant(1L, 5L)).thenReturn(branch());
        RestaurantTable table = new RestaurantTable();
        table.setId(9L);
        table.setBranchId(5L);
        table.setRestaurantId(1L);
        when(tableService.getActiveByToken("tok")).thenReturn(table);
        when(menuService.getOrderableItem(1L, 5L, 100L)).thenReturn(menuItem());
        when(orderRepository.nextOrderNumber()).thenReturn(1004L);
        org.mockito.ArgumentCaptor<Order> savedOrder = org.mockito.ArgumentCaptor.forClass(Order.class);
        when(orderRepository.save(savedOrder.capture())).thenAnswer(inv -> {
            Order o = inv.getArgument(0);
            o.setId(4L);
            return o;
        });

        CreateOrderRequest request = new CreateOrderRequest(
                "demo", 5L, "tok", OrderType.DINE_IN, "Sara", null, null, null, null, null, null,
                false, null, List.of(new CreateOrderRequest.Item(100L, 1, null, null)));

        OrderTrackingResponse response = orderService.createOrder(request);

        assertThat(response.status()).isEqualTo(OrderStatus.PENDING);
        assertThat(savedOrder.getValue().getCustomerPhone()).isNull();
        // No phone means isBlocked/OTP/notification/loyalty must all no-op rather than NPE.
        verify(notificationService, times(1)).send(any());
    }

    @Test
    void dineInRequiresTableToken() {
        when(restaurantService.getActiveBySlug("demo")).thenReturn(restaurant());
        when(branchService.getEntityInRestaurant(1L, 5L)).thenReturn(branch());

        CreateOrderRequest request = new CreateOrderRequest(
                "demo", 5L, null, OrderType.DINE_IN, null, null, null, null, null, null, null,
                false, null, List.of(new CreateOrderRequest.Item(100L, 1, null, null)));

        assertThatThrownBy(() -> orderService.createOrder(request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.TABLE_INVALID));
    }

    @Test
    void createsCarOrderWithNormalizedPlate() {
        when(restaurantService.getActiveBySlug("demo")).thenReturn(restaurant());
        when(branchService.getEntityInRestaurant(1L, 5L)).thenReturn(branch());
        when(menuService.getOrderableItem(1L, 5L, 100L)).thenReturn(menuItem());
        when(orderRepository.nextOrderNumber()).thenReturn(1002L);
        when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order o = inv.getArgument(0);
            o.setId(2L);
            return o;
        });

        CreateOrderRequest request = new CreateOrderRequest(
                "demo", 5L, null, OrderType.CAR, "Sara", "9999", "  a 1234  ", "  White ", null, null, "ptok",
                false, null, List.of(new CreateOrderRequest.Item(100L, 1, null, null)));

        OrderTrackingResponse response = orderService.createOrder(request);

        assertThat(response.orderType()).isEqualTo(OrderType.CAR);
        assertThat(response.carPlate()).isEqualTo("A 1234");
        assertThat(response.carColor()).isEqualTo("white");
    }

    @Test
    void carOrderRequiresPhone() {
        when(restaurantService.getActiveBySlug("demo")).thenReturn(restaurant());
        when(branchService.getEntityInRestaurant(1L, 5L)).thenReturn(branch());

        CreateOrderRequest request = new CreateOrderRequest(
                "demo", 5L, null, OrderType.CAR, "Sara", null, "A 1234", null, null, null, null,
                false, null, List.of(new CreateOrderRequest.Item(100L, 1, null, null)));

        assertThatThrownBy(() -> orderService.createOrder(request))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Phone is required");
    }

    @Test
    void createsCarOrderWithoutPlate() {
        when(restaurantService.getActiveBySlug("demo")).thenReturn(restaurant());
        when(branchService.getEntityInRestaurant(1L, 5L)).thenReturn(branch());
        when(menuService.getOrderableItem(1L, 5L, 100L)).thenReturn(menuItem());
        when(orderRepository.nextOrderNumber()).thenReturn(1003L);
        when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order o = inv.getArgument(0);
            o.setId(3L);
            return o;
        });

        CreateOrderRequest request = new CreateOrderRequest(
                "demo", 5L, null, OrderType.CAR, "Sara", "9999", " ", null, null, null, "ptok",
                false, null, List.of(new CreateOrderRequest.Item(100L, 1, null, null)));

        OrderTrackingResponse response = orderService.createOrder(request);

        assertThat(response.orderType()).isEqualTo(OrderType.CAR);
        assertThat(response.carPlate()).isNull();
    }

    @Test
    void rejectsOrderFromBlockedPhone() {
        when(restaurantService.getActiveBySlug("demo")).thenReturn(restaurant());
        when(branchService.getEntityInRestaurant(1L, 5L)).thenReturn(branch());
        when(customerService.isBlocked(1L, "99990000")).thenReturn(true);

        CreateOrderRequest request = new CreateOrderRequest(
                "demo", 5L, null, OrderType.CAR, "Ali", "9999-0000", "ABC1234", null, null, null, "ptok",
                false, null, List.of(new CreateOrderRequest.Item(100L, 1, null, null)));

        assertThatThrownBy(() -> orderService.createOrder(request))
                .isInstanceOf(BadRequestException.class)
                .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PHONE_BLOCKED));
    }

    @Test
    void acceptsPendingOrderAndSetsPrepTime() {
        when(orderRepository.findWithItemsById(1L)).thenReturn(java.util.Optional.of(existingOrder(OrderStatus.PENDING)));

        OrderResponse response = orderService.accept(1L, new AcceptOrderRequest(15));

        assertThat(response.status()).isEqualTo(OrderStatus.ACCEPTED);
        assertThat(response.prepTimeMinutes()).isEqualTo(15);
        assertThat(response.acceptedAt()).isNotNull();
        verify(accessGuard).requireBranchAccess(1L, 5L);
    }

    @Test
    void cannotAcceptACompletedOrder() {
        when(orderRepository.findWithItemsById(1L)).thenReturn(java.util.Optional.of(existingOrder(OrderStatus.COMPLETED)));

        assertThatThrownBy(() -> orderService.accept(1L, new AcceptOrderRequest(10)))
                .isInstanceOf(BadRequestException.class)
                .satisfies(ex -> assertThat(((BadRequestException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_ORDER_STATUS_TRANSITION));
    }

    @Test
    void declinesPendingOrderWithReason() {
        when(orderRepository.findWithItemsById(1L)).thenReturn(java.util.Optional.of(existingOrder(OrderStatus.PENDING)));

        OrderResponse response = orderService.decline(1L, "Out of stock");

        // Since the V23 status merge, a pre-accept decline lands in the unified CANCELLED state
        // (reason still surfaced) and stamps cancelledAt rather than the legacy declinedAt.
        assertThat(response.status()).isEqualTo(OrderStatus.CANCELLED);
        assertThat(response.declineReason()).isEqualTo("Out of stock");
        assertThat(response.cancelledAt()).isNotNull();
    }
}
