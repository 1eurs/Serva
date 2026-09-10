package com.cafeqr.payments;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ResourceNotFoundException;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Manual payment status management. A real gateway (Thawani / Tap) can later create
 * {@link Payment} rows with a real {@code provider} and {@code providerPaymentId}.
 */
@Service
public class PaymentService {

    private static final String STUB_PROVIDER = "STUB";
    private static final String IN_PERSON_PROVIDER = "IN_PERSON";

    /** A café counter, not a wedding: more shares than this is a mis-tap, not a real bill. */
    private static final int MAX_TENDERS = 20;

    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final RestaurantService restaurantService;
    private final AccessGuard accessGuard;

    public PaymentService(PaymentRepository paymentRepository,
                          OrderRepository orderRepository,
                          RestaurantService restaurantService,
                          AccessGuard accessGuard) {
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.restaurantService = restaurantService;
        this.accessGuard = accessGuard;
    }

    @Transactional
    public PaymentResponse markPaid(Long orderId, PaymentMethod method) {
        // Most cafe orders are paid in person; default to CARD when unspecified.
        return record(orderId, PaymentStatus.PAID, method != null ? method : PaymentMethod.CARD);
    }

    @Transactional
    public PaymentResponse markFailed(Long orderId) {
        return record(orderId, PaymentStatus.FAILED, null);
    }

    /**
     * Settles one order with several tenders — the table of five where three pay cash and two
     * pay card. Each share becomes its own {@link Payment} row carrying the method that person
     * actually handed over, which is the only way the end-of-day cash count can be right; the
     * rows share a settlement id so reporting sums the split once.
     *
     * <p>The shares must add up to the order total exactly. The tablet does the dividing and
     * knows the total, so a mismatch here is a bug or a stale order, and accepting it would
     * close a bill that was never covered.
     */
    @Transactional
    public List<PaymentResponse> settleSplit(Long orderId, List<PaymentTender> tenders) {
        if (tenders == null || tenders.isEmpty()) {
            throw new BadRequestException("A split needs at least one share.");
        }
        if (tenders.size() > MAX_TENDERS) {
            throw new BadRequestException("A bill can be split at most " + MAX_TENDERS + " ways.");
        }

        Order order = loadForPayment(orderId);
        Restaurant restaurant = restaurantService.getEntity(order.getRestaurantId());

        BigDecimal covered = BigDecimal.ZERO;
        for (PaymentTender tender : tenders) {
            if (tender.method() == null || tender.method() == PaymentMethod.SPLIT) {
                throw new BadRequestException("Every share needs a payment method of its own.");
            }
            if (tender.amount() == null || tender.amount().signum() <= 0) {
                throw new BadRequestException("Every share must be more than zero.");
            }
            covered = covered.add(tender.amount());
        }
        // compareTo, not equals: 12.75 and 12.750 are the same money at different scales.
        if (covered.compareTo(order.getTotal()) != 0) {
            throw new BadRequestException("The shares add up to " + covered.toPlainString()
                    + ", but the order total is " + order.getTotal().toPlainString() + ".");
        }

        order.setPaymentStatus(PaymentStatus.PAID);
        order.setPaymentMethod(settledMethod(tenders));

        List<Payment> saved = new ArrayList<>(tenders.size());
        for (PaymentTender tender : tenders) {
            saved.add(paymentRepository.save(
                    newPayment(order, restaurant, PaymentStatus.PAID, tender.method(), tender.amount())));
        }
        // One settlement, several rows: stamp them all with the first row's id so reporting can
        // tell "this bill was split five ways" apart from "this bill was marked paid five times".
        Long settlementId = saved.get(0).getId();
        saved.forEach(payment -> payment.setSettlementId(settlementId));

        return saved.stream().map(PaymentResponse::from).toList();
    }

    /**
     * What the order itself should say it was paid with. A five-way split where everyone paid
     * cash is still cash — the order, the receipt and the history read better that way, and
     * degrade to the truth. {@link PaymentMethod#SPLIT} is only for a genuinely mixed bill,
     * where one label cannot describe what happened.
     */
    private static PaymentMethod settledMethod(List<PaymentTender> tenders) {
        PaymentMethod first = tenders.get(0).method();
        boolean uniform = tenders.stream().allMatch(tender -> tender.method() == first);
        return uniform ? first : PaymentMethod.SPLIT;
    }

    private PaymentResponse record(Long orderId, PaymentStatus status, PaymentMethod method) {
        Order order = loadForPayment(orderId);
        Restaurant restaurant = restaurantService.getEntity(order.getRestaurantId());

        order.setPaymentStatus(status);
        // Mirror the method onto the order so dashboard reads and printed receipts get it
        // without joining the ledger. Only meaningful for PAID; a failure leaves it as-is.
        if (status == PaymentStatus.PAID) {
            order.setPaymentMethod(method);
        }

        return PaymentResponse.from(
                paymentRepository.save(newPayment(order, restaurant, status, method, order.getTotal())));
    }

    private Order loadForPayment(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> ResourceNotFoundException.of("Order", orderId));
        accessGuard.requireBranchAccess(order.getRestaurantId(), order.getBranchId());
        return order;
    }

    private Payment newPayment(Order order, Restaurant restaurant, PaymentStatus status,
                               PaymentMethod method, BigDecimal amount) {
        Payment payment = new Payment();
        payment.setOrderId(order.getId());
        payment.setProvider(method == PaymentMethod.ONLINE ? STUB_PROVIDER : IN_PERSON_PROVIDER);
        payment.setAmount(amount);
        payment.setCurrency(restaurant.getCurrency());
        payment.setStatus(status);
        payment.setMethod(method);
        return payment;
    }
}
