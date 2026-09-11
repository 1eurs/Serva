package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.MenuItemStock;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MenuItemStockRepository extends JpaRepository<MenuItemStock, Long> {

    List<MenuItemStock> findByBranchId(Long branchId);

    Optional<MenuItemStock> findByMenuItemIdAndBranchId(Long menuItemId, Long branchId);

    List<MenuItemStock> findByBranchIdAndMenuItemIdIn(Long branchId, Collection<Long> menuItemIds);

    /** Every rule pointing at one shelf row — what the wall shows as "backs: Croissant". */
    List<MenuItemStock> findByStockItemId(Long stockItemId);
}
