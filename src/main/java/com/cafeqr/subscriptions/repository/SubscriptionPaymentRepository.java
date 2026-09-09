package com.cafeqr.subscriptions.repository;

import com.cafeqr.subscriptions.domain.SubscriptionPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface SubscriptionPaymentRepository extends JpaRepository<SubscriptionPayment, Long> {

    List<SubscriptionPayment> findByRestaurantIdOrderByPaidOnDescIdDesc(Long restaurantId);

    List<SubscriptionPayment> findByPaidOnBetweenOrderByPaidOnDescIdDesc(LocalDate from, LocalDate to);

    /** Total collected in a date range — null when nothing was collected, so callers coalesce. */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM SubscriptionPayment p "
            + "WHERE p.paidOn >= :from AND p.paidOn <= :to")
    BigDecimal totalCollected(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
