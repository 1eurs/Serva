package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.MenuItemDailyTally;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/**
 * Sold today, per item, per branch.
 *
 * <p>Both writes are single atomic statements rather than find-then-save: two orders for the
 * same item are routinely accepted within the same second, and an entity round-trip would
 * either lose one of them or trip the unique constraint. The upsert lets Postgres settle it.
 */
public interface MenuItemDailyTallyRepository extends JpaRepository<MenuItemDailyTally, Long> {

    @Modifying
    @Query(value = """
            INSERT INTO menu_item_daily_tally (menu_item_id, branch_id, cafe_day, sold, created_at, updated_at)
            VALUES (:menuItemId, :branchId, :day, :qty, now(), now())
            ON CONFLICT (menu_item_id, branch_id, cafe_day)
            DO UPDATE SET sold = menu_item_daily_tally.sold + EXCLUDED.sold, updated_at = now()
            """, nativeQuery = true)
    void add(@Param("menuItemId") Long menuItemId, @Param("branchId") Long branchId,
             @Param("day") LocalDate day, @Param("qty") int qty);

    /**
     * Take a cancelled order's lines back off the day they were counted on. Floored at zero: a
     * tally can only ever be short of the truth by a restore that met no row, never negative.
     */
    @Modifying
    @Query(value = """
            UPDATE menu_item_daily_tally
            SET sold = GREATEST(0, sold - :qty), updated_at = now()
            WHERE menu_item_id = :menuItemId AND branch_id = :branchId AND cafe_day = :day
            """, nativeQuery = true)
    void subtract(@Param("menuItemId") Long menuItemId, @Param("branchId") Long branchId,
                  @Param("day") LocalDate day, @Param("qty") int qty);

    List<MenuItemDailyTally> findByBranchIdAndCafeDayAndMenuItemIdIn(
            Long branchId, LocalDate cafeDay, Collection<Long> menuItemIds);

    /** Everything a branch sold across a window of days — the raw material of usage figures. */
    List<MenuItemDailyTally> findByBranchIdAndCafeDayBetween(Long branchId, LocalDate from, LocalDate to);
}
