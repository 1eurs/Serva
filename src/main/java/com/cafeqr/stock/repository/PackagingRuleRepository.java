package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.PackagingRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PackagingRuleRepository extends JpaRepository<PackagingRule, Long> {

    List<PackagingRule> findByRestaurantIdOrderByDisplayOrderAscIdAsc(Long restaurantId);

    List<PackagingRule> findByIdIn(List<Long> ids);
}
