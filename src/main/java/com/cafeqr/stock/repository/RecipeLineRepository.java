package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.RecipeLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface RecipeLineRepository extends JpaRepository<RecipeLine, Long> {

    List<RecipeLine> findByMenuItemId(Long menuItemId);

    List<RecipeLine> findByMenuItemIdIn(List<Long> menuItemIds);

    List<RecipeLine> findByMenuItemOptionIdIn(List<Long> optionIds);

    List<RecipeLine> findByPrepItemId(Long prepItemId);

    List<RecipeLine> findByRestaurantId(Long restaurantId);

    void deleteByMenuItemId(Long menuItemId);

    void deleteByMenuItemOptionId(Long menuItemOptionId);

    void deleteByPrepItemId(Long prepItemId);

    /** Every menu item whose recipe touches one of these stock items — the auto-86 lookup. */
    @Query("select distinct r.menuItemId from RecipeLine r "
            + "where r.stockItemId in :stockItemIds and r.menuItemId is not null")
    List<Long> menuItemIdsUsing(@Param("stockItemIds") List<Long> stockItemIds);

    /** Same, reached through a modifier rather than the item's own recipe. */
    @Query("select distinct g.menuItem.id from MenuItemOption o "
            + "join o.optionGroup g "
            + "where o.id in (select r.menuItemOptionId from RecipeLine r "
            + "               where r.stockItemId in :stockItemIds and r.menuItemOptionId is not null)")
    List<Long> menuItemIdsUsingViaOptions(@Param("stockItemIds") List<Long> stockItemIds);

    boolean existsByStockItemId(Long stockItemId);
}
