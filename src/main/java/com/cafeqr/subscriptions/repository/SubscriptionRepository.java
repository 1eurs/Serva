package com.cafeqr.subscriptions.repository;

import com.cafeqr.restaurants.domain.Plan;
import com.cafeqr.subscriptions.domain.Subscription;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    Optional<Subscription> findFirstByRestaurantIdOrderByIdDesc(Long restaurantId);

    List<Subscription> findByStatusOrderByIdDesc(SubscriptionStatus status);

    List<Subscription> findByStatusIn(Collection<SubscriptionStatus> statuses);

    List<Subscription> findByTier(Plan tier);
}
