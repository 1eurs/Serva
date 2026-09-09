package com.cafeqr.presence;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.orders.domain.OrderStatus;
import com.cafeqr.orders.domain.OrderType;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.orders.realtime.OrderStreamService;
import com.cafeqr.orders.repository.OrderRepository;
import com.cafeqr.presence.dto.LiveCount;
import com.cafeqr.presence.dto.QrActivityResponse;
import com.cafeqr.presence.dto.QrActivityResponse.CartItemView;
import com.cafeqr.presence.dto.QrActivityResponse.DayStat;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/** Combines live presence with today's per-QR order totals; serves both polled reads and SSE pushes. */
@Service
public class QrActivityService {

    /** Orders that don't count toward a QR's takings. */
    private static final List<OrderStatus> EXCLUDED = List.of(OrderStatus.DECLINED, OrderStatus.CANCELLED);

    private final OrderRepository orderRepository;
    private final PresenceService presenceService;
    private final BranchService branchService;
    private final AccessGuard accessGuard;
    private final OrderStreamService streamService;
    private final MenuItemRepository menuItemRepository;

    public QrActivityService(OrderRepository orderRepository,
                             PresenceService presenceService,
                             BranchService branchService,
                             AccessGuard accessGuard,
                             OrderStreamService streamService,
                             MenuItemRepository menuItemRepository) {
        this.orderRepository = orderRepository;
        this.presenceService = presenceService;
        this.branchService = branchService;
        this.accessGuard = accessGuard;
        this.streamService = streamService;
        this.menuItemRepository = menuItemRepository;
    }

    /** One-shot read for the dashboard (access-checked). */
    @Transactional(readOnly = true)
    public QrActivityResponse forBranch(Long requestedBranchId) {
        Long branchId = resolveAccessibleBranch(requestedBranchId);
        return branchId == null ? empty() : snapshot(branchId);
    }

    /** Live SSE stream — pushes a fresh snapshot whenever the branch's activity changes. */
    public SseEmitter streamForDashboard(Long requestedBranchId) {
        Long branchId = resolveAccessibleBranch(requestedBranchId);
        SseEmitter emitter = streamService.subscribe(
                OrderStreamService.qaChannel(branchId == null ? 0L : branchId),
                SecurityUtils.currentUserIdOrNull());
        try {
            emitter.send(SseEmitter.event().name("qr-activity").data(branchId == null ? empty() : snapshot(branchId)));
        } catch (IOException ignored) {
            // client already gone; the registry will clean it up
        }
        return emitter;
    }

    /** Builds the snapshot for a branch <b>without</b> an access check — used by the SSE broadcaster. */
    @Transactional(readOnly = true)
    public QrActivityResponse snapshot(Long branchId) {
        Branch branch = branchService.getEntity(branchId);

        Map<String, LiveCount> live = presenceService.liveCounts(branchId);
        int totalPresent = live.values().stream().mapToInt(LiveCount::present).sum();
        int totalOrdering = live.values().stream().mapToInt(LiveCount::ordering).sum();

        Instant from = LocalDate.now(TimeZones.CAFES).atStartOfDay(TimeZones.CAFES).toInstant();
        Instant to = Instant.now();
        Map<String, DayStat> today = new HashMap<>();
        for (Object[] row : orderRepository.qrActivityToday(branch.getRestaurantId(), branchId, EXCLUDED, from, to)) {
            Long tableId = (Long) row[0];
            OrderType type = (OrderType) row[1];
            int orders = ((Number) row[2]).intValue();
            BigDecimal revenue = (BigDecimal) row[3];
            String key = tableId != null ? String.valueOf(tableId) : typeKey(type);
            today.merge(key, new DayStat(orders, revenue),
                    (a, b) -> new DayStat(a.orders() + b.orders(), a.revenue().add(b.revenue())));
        }
        return new QrActivityResponse(totalPresent, totalOrdering, live, liveCartViews(branchId), today);
    }

    /** Resolves the live cart aggregates (menuItemId → qty) into named lines, one batched lookup. */
    private Map<String, List<CartItemView>> liveCartViews(Long branchId) {
        Map<String, Map<Long, Integer>> carts = presenceService.liveCarts(branchId);
        if (carts.isEmpty()) {
            return Map.of();
        }
        Set<Long> itemIds = carts.values().stream()
                .flatMap(m -> m.keySet().stream())
                .collect(Collectors.toSet());
        Map<Long, MenuItem> items = menuItemRepository.findAllById(itemIds).stream()
                .collect(Collectors.toMap(MenuItem::getId, i -> i));

        Map<String, List<CartItemView>> result = new HashMap<>();
        carts.forEach((qrKey, totals) -> {
            List<CartItemView> views = totals.entrySet().stream()
                    .map(e -> {
                        MenuItem item = items.get(e.getKey());
                        return item == null ? null
                                : new CartItemView(item.getId(), item.getNameEn(), item.getNameAr(), e.getValue());
                    })
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparingInt(CartItemView::quantity).reversed())
                    .toList();
            if (!views.isEmpty()) {
                result.put(qrKey, views);
            }
        });
        return result;
    }

    private Long resolveAccessibleBranch(Long requestedBranchId) {
        Long branchScope = accessGuard.scopedBranchId();
        Long branchId = branchScope != null ? branchScope : requestedBranchId;
        if (branchId == null) {
            return null;
        }
        Branch branch = branchService.getEntity(branchId);
        accessGuard.requireRestaurantAccess(branch.getRestaurantId()); // 403 if not yours
        return branchId;
    }

    private static QrActivityResponse empty() {
        return new QrActivityResponse(0, 0, Map.of(), Map.of(), Map.of());
    }

    private static String typeKey(OrderType type) {
        return type == OrderType.DINE_IN ? "other" : "car";
    }
}
