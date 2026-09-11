package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.OptionRecipeLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface OptionRecipeLineRepository extends JpaRepository<OptionRecipeLine, Long> {

    List<OptionRecipeLine> findByBranchId(Long branchId);

    List<OptionRecipeLine> findByBranchIdAndMenuItemIdIn(Long branchId, Collection<Long> menuItemIds);

    void deleteByMenuItemIdAndBranchId(Long menuItemId, Long branchId);
}
