package com.cafeqr.menus.repository;

import com.cafeqr.menus.domain.MenuItemDailyTally;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface MenuItemDailyTallyRepository extends JpaRepository<MenuItemDailyTally, MenuItemDailyTally.Key> {

    Optional<MenuItemDailyTally> findByMenuItemIdAndBranchId(Long menuItemId, Long branchId);

    /** Every tally at one branch, for the menu-wide passes that would otherwise query per item. */
    List<MenuItemDailyTally> findByBranchId(Long branchId);

    List<MenuItemDailyTally> findByBranchIdAndMenuItemIdIn(Long branchId, List<Long> menuItemIds);

    /**
     * Locking read used whenever the cap is booked against. Two orders for the last croissant
     * serialize here, so the cap cannot be oversold by a race — which the old counter, a plain
     * read-modify-write on the shared menu item row, could be.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from MenuItemDailyTally t where t.menuItemId = :menuItemId and t.branchId = :branchId")
    Optional<MenuItemDailyTally> lock(@Param("menuItemId") Long menuItemId,
                                      @Param("branchId") Long branchId);

    /**
     * Creates the (item, branch) row only if absent, atomically. Two concurrent first-of-the-day
     * sales would otherwise race into a duplicate-key failure; the loser here is a no-op and its
     * following {@link #lock} finds the row.
     */
    @Modifying
    @Query(value = """
            INSERT INTO menu_item_daily_tally (menu_item_id, branch_id, tally_date, sold, updated_at)
            VALUES (:menuItemId, :branchId, :today, 0, now())
            ON CONFLICT (menu_item_id, branch_id) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("menuItemId") Long menuItemId,
                        @Param("branchId") Long branchId,
                        @Param("today") LocalDate today);
}
