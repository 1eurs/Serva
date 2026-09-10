package com.cafeqr.payments;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.PaymentStatus;
import com.cafeqr.orders.repository.OrderRepository;
import com.cafeqr.payments.domain.Payment;
import com.cafeqr.payments.domain.PaymentMethod;
import com.cafeqr.payments.dto.PaymentResponse;
import com.cafeqr.payments.dto.PaymentTender;
import com.cafeqr.payments.repository.PaymentRepository;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock private PaymentRepository paymentRepository;
    @Mock private OrderRepository orderRepository;
    @Mock private RestaurantService restaurantService;
    @Mock private AccessGuard accessGuard;

    private PaymentService paymentService;
    private Order order;

    @BeforeEach
    void setUp() {
        paymentService = new PaymentService(paymentRepository, orderRepository, restaurantService, accessGuard);

        order = new Order();
        order.setId(7L);
        order.setRestaurantId(1L);
        order.setBranchId(2L);
        order.setTotal(new BigDecimal("12.750"));
        order.setPaymentStatus(PaymentStatus.UNPAID);

        Restaurant restaurant = new Restaurant();
        restaurant.setCurrency("OMR");

        lenient().when(orderRepository.findById(7L)).thenReturn(Optional.of(order));
        lenient().when(restaurantService.getEntity(1L)).thenReturn(restaurant);
        // The real repository hands back a saved row with an identity; the settlement id is one
        // of those ids, so the test has to mint them too.
        AtomicLong ids = new AtomicLong(100);
        lenient().when(paymentRepository.save(any(Payment.class))).thenAnswer(call -> {
            Payment payment = call.getArgument(0);
            payment.setId(ids.incrementAndGet());
            return payment;
        });
    }

    private static PaymentTender tender(PaymentMethod method, String amount) {
        return new PaymentTender(method, new BigDecimal(amount));
    }

    @Test
    void splitRecordsEveryShareWithItsOwnMethodUnderOneSettlement() {
        List<PaymentResponse> responses = paymentService.settleSplit(7L, List.of(
                tender(PaymentMethod.CASH, "4.250"),
                tender(PaymentMethod.CASH, "4.250"),
                tender(PaymentMethod.CARD, "4.250")));

        assertThat(responses).hasSize(3);

        ArgumentCaptor<Payment> saved = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository, times(3)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(Payment::getMethod)
                .containsExactly(PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.CARD);
        assertThat(saved.getAllValues()).extracting(Payment::getAmount)
                .containsOnly(new BigDecimal("4.250"));
        // All three rows are one settlement, so reporting sums them instead of taking the last.
        assertThat(saved.getAllValues()).extracting(Payment::getSettlementId)
                .containsOnly(saved.getAllValues().get(0).getId());

        assertThat(order.getPaymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(order.getPaymentMethod()).isEqualTo(PaymentMethod.SPLIT);
    }

    @Test
    void splitWhereEveryoneUsedTheSameMethodKeepsThatMethodOnTheOrder() {
        paymentService.settleSplit(7L, List.of(
                tender(PaymentMethod.CASH, "6.375"),
                tender(PaymentMethod.CASH, "6.375")));

        assertThat(order.getPaymentMethod()).isEqualTo(PaymentMethod.CASH);
        assertThat(order.getPaymentStatus()).isEqualTo(PaymentStatus.PAID);
    }

    @Test
    void splitAcceptsSharesWrittenAtADifferentScale() {
        // 12.75 from the tablet is the same money as the order's 12.750.
        paymentService.settleSplit(7L, List.of(tender(PaymentMethod.CARD, "12.75")));

        assertThat(order.getPaymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(order.getPaymentMethod()).isEqualTo(PaymentMethod.CARD);
    }

    @Test
    void splitThatDoesNotCoverTheBillIsRefusedAndLeavesTheOrderUnpaid() {
        assertThatThrownBy(() -> paymentService.settleSplit(7L, List.of(
                tender(PaymentMethod.CASH, "4.250"),
                tender(PaymentMethod.CARD, "4.250"))))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("8.500");

        assertThat(order.getPaymentStatus()).isEqualTo(PaymentStatus.UNPAID);
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void splitShareWithoutAMethodIsRefused() {
        assertThatThrownBy(() -> paymentService.settleSplit(7L, List.of(
                tender(PaymentMethod.CASH, "6.375"),
                new PaymentTender(null, new BigDecimal("6.375")))))
                .isInstanceOf(BadRequestException.class);

        verify(paymentRepository, never()).save(any());
    }

    @Test
    void splitShareOfZeroIsRefused() {
        assertThatThrownBy(() -> paymentService.settleSplit(7L, List.of(
                tender(PaymentMethod.CASH, "12.750"),
                tender(PaymentMethod.CARD, "0.000"))))
                .isInstanceOf(BadRequestException.class);

        verify(paymentRepository, never()).save(any());
    }

    @Test
    void emptySplitIsRefusedBeforeTheOrderIsEvenLoaded() {
        assertThatThrownBy(() -> paymentService.settleSplit(7L, List.of()))
                .isInstanceOf(BadRequestException.class);

        verify(orderRepository, never()).findById(any());
    }

    @Test
    void markPaidStillWritesOneRowForTheWholeBill() {
        paymentService.markPaid(7L, PaymentMethod.CASH);

        ArgumentCaptor<Payment> saved = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository).save(saved.capture());
        assertThat(saved.getValue().getAmount()).isEqualTo(new BigDecimal("12.750"));
        assertThat(saved.getValue().getMethod()).isEqualTo(PaymentMethod.CASH);
        // No settlement id: this row settles the order on its own.
        assertThat(saved.getValue().getSettlementId()).isNull();
        assertThat(order.getPaymentMethod()).isEqualTo(PaymentMethod.CASH);
    }
}
