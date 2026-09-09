package com.cafeqr.stock;

import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.domain.MenuItemDailyTally;
import com.cafeqr.menus.repository.MenuItemDailyTallyRepository;
import com.cafeqr.stock.domain.StockMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * "We only make twenty a day" — counted per branch.
 *
 * <p>The cap lives on the menu item because it reads the same at every branch; the tally
 * against it lives in {@link MenuItemDailyTally} because selling one is physical and happens
 * somewhere. Splitting the two is the whole point: a restaurant-wide item used to share one
 * counter, so the busy branch selling out took the quiet branch's cake off the menu too.
 *
 * <p>Nothing here throws for an uncapped item; callers may pass anything and get "no cap"
 * back, which keeps the ordering paths free of mode checks.
 */
@Service
public class DailyLimitService {

    private final MenuItemDailyTallyRepository tallyRepository;

    public DailyLimitService(MenuItemDailyTallyRepository tallyRepository) {
        this.tallyRepository = tallyRepository;
    }

    private static boolean capped(MenuItem item) {
        return item.getStockMode() == StockMode.DAILY_LIMIT && item.getDailyLimit() != null;
    }

    /**
     * How many are still sellable at this branch today, or null when the item is not capped.
     *
     * <p>Null is also the honest answer when no branch is named: the count is a fact about one
     * branch, and there is no restaurant-wide number to give. Callers that render a dashboard
     * without a branch in hand show nothing rather than a figure that is true nowhere.
     */
    @Transactional(readOnly = true)
    public Integer remainingAt(MenuItem item, Long branchId, LocalDate today) {
        if (!capped(item) || branchId == null) {
            return null;
        }
        int sold = tallyRepository.findByMenuItemIdAndBranchId(item.getId(), branchId)
                .map(t -> t.soldOn(today))
                .orElse(0);
        return Math.max(0, item.getDailyLimit() - sold);
    }

    /**
     * Today's sold counts at one branch for many items in one query — the menu-wide passes run
     * on the public menu and must not issue a query per item.
     */
    @Transactional(readOnly = true)
    public Map<Long, Integer> soldByItem(Long branchId, List<Long> menuItemIds, LocalDate today) {
        if (branchId == null || menuItemIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Integer> byItem = new LinkedHashMap<>();
        for (MenuItemDailyTally tally : tallyRepository.findByBranchIdAndMenuItemIdIn(branchId, menuItemIds)) {
            byItem.put(tally.getMenuItemId(), tally.soldOn(today));
        }
        return byItem;
    }

    /** Remaining today from an already-loaded {@link #soldByItem} map; no query. */
    public Integer remainingFrom(MenuItem item, Map<Long, Integer> soldByItem) {
        if (!capped(item)) {
            return null;
        }
        return Math.max(0, item.getDailyLimit() - soldByItem.getOrDefault(item.getId(), 0));
    }

    /**
     * Books {@code quantity} against this branch's cap for today. Returns false, changing
     * nothing, when the cap cannot cover it.
     *
     * <p>The row is locked first, so two orders for the last one serialize here instead of both
     * reading the same count and one of them losing its write.
     */
    @Transactional
    public boolean consume(MenuItem item, Long branchId, int quantity, LocalDate today) {
        if (!capped(item) || branchId == null) {
            return true;
        }
        MenuItemDailyTally tally = lock(item.getId(), branchId, today);
        tally.rollOverTo(today);
        if (tally.getSold() + quantity > item.getDailyLimit()) {
            return false;
        }
        tally.setSold(tally.getSold() + quantity);
        tallyRepository.save(tally);
        return true;
    }

    /** Gives back {@code quantity} when an accepted order is cancelled the same day. */
    @Transactional
    public void release(MenuItem item, Long branchId, int quantity, LocalDate today) {
        if (!capped(item) || branchId == null) {
            return;
        }
        tallyRepository.lock(item.getId(), branchId).ifPresent(tally -> {
            /* Only today's tally can be given back to. A cancellation that lands after
               midnight is releasing against a count that has already reset, and taking it
               off today's would hand the branch a slot it never used. */
            if (!today.equals(tally.getTallyDate())) {
                return;
            }
            tally.setSold(Math.max(0, tally.getSold() - quantity));
            tallyRepository.save(tally);
        });
    }

    /** Ensures the (item, branch) row exists, then takes a write lock on it. */
    private MenuItemDailyTally lock(Long menuItemId, Long branchId, LocalDate today) {
        return tallyRepository.lock(menuItemId, branchId).orElseGet(() -> {
            tallyRepository.insertIfAbsent(menuItemId, branchId, today);
            return tallyRepository.lock(menuItemId, branchId)
                    .orElseThrow(() -> new IllegalStateException(
                            "Daily tally row vanished for item " + menuItemId + " at branch " + branchId));
        });
    }
}
