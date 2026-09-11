package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.RecipeLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface RecipeLineRepository extends JpaRepository<RecipeLine, Long> {

    List<RecipeLine> findByMenuItemIdAndBranchIdOrderByIdAsc(Long menuItemId, Long branchId);

    List<RecipeLine> findByBranchId(Long branchId);

    List<RecipeLine> findByBranchIdAndMenuItemIdIn(Long branchId, Collection<Long> menuItemIds);

    void deleteByMenuItemIdAndBranchId(Long menuItemId, Long branchId);
}
