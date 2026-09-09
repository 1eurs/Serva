package com.cafeqr.loyalty.repository;

import com.cafeqr.loyalty.domain.LoyaltyTransaction;
import com.cafeqr.loyalty.domain.LoyaltyTxnStatus;
import com.cafeqr.loyalty.domain.LoyaltyTxnType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface LoyaltyTransactionRepository extends JpaRepository<LoyaltyTransaction, Long> {

    boolean existsByOrderIdAndType(Long orderId, LoyaltyTxnType type);

    Optional<LoyaltyTransaction> findByOrderIdAndTypeAndStatus(
            Long orderId, LoyaltyTxnType type, LoyaltyTxnStatus status);

    /**
     * Stamps earned and rewards handed over, per branch, in one window.
     *
     * <p>Rows: {@code [branchId, stampsEarned, rewardsRedeemed]}. Only CONFIRMED redemptions
     * count — a PENDING one is a customer who said they would redeem and may still not, and a
     * VOID one is a cancelled order. Counting either would tell a café it gave away rewards it
     * still has.
     *
     * <p>{@code branchId} is null for rows written before branch attribution existed. They are
     * grouped into their own bucket rather than dropped, so the totals still reconcile with
     * what the café actually gave away.
     */
    @Query(value = """
            SELECT t.branch_id,
                   COALESCE(SUM(t.stamps_delta) FILTER (WHERE t.type = 'EARN'), 0)  AS stamps_earned,
                   COUNT(*) FILTER (WHERE t.type = 'REDEEM' AND t.status = 'CONFIRMED') AS rewards_redeemed
            FROM loyalty_transactions t
            WHERE t.restaurant_id = :restaurantId
              AND (:branchId IS NULL OR t.branch_id = :branchId)
              AND t.created_at >= :from AND t.created_at < :to
            GROUP BY t.branch_id
            """, nativeQuery = true)
    List<Object[]> activityByBranch(@Param("restaurantId") Long restaurantId,
                                    @Param("branchId") Long branchId,
                                    @Param("from") Instant from,
                                    @Param("to") Instant to);
}
