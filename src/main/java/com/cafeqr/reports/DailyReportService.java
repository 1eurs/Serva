package com.cafeqr.reports;

import com.cafeqr.analytics.AnalyticsService;
import com.cafeqr.analytics.dto.AnalyticsSummaryResponse;
import com.cafeqr.analytics.dto.BestSellingItem;
import com.cafeqr.analytics.dto.HourlyCount;
import com.cafeqr.analytics.dto.PaymentMethodRevenueResponse;
import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.auth.security.SecurityUtils;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.branches.dto.BranchResponse;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.util.TimeZones;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.repository.OrderItemDrawRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import com.cafeqr.till.domain.TillMovement;
import com.cafeqr.till.domain.TillSession;
import com.cafeqr.till.repository.TillMovementRepository;
import com.cafeqr.till.repository.TillSessionRepository;
import com.cafeqr.users.domain.Permission;
import com.openhtmltopdf.bidi.support.ICUBidiReorderer;
import com.openhtmltopdf.bidi.support.ICUBidiSplitter;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The daily report: one branch's day, gathered from the same services the dashboard reads and
 * rendered to a one-page PDF. It adds no new sums of its own — sales come from
 * {@link AnalyticsService}, the drawer from the till, the shelf from the stock draws.
 *
 * <p>Scope is a single branch, because the till and the shelf are both per-branch. A branch-scoped
 * user always gets their own; a restaurant-wide user names one, unless the restaurant has exactly
 * one branch, in which case naming it would be busywork.
 */
@Service
public class DailyReportService {

    // Every list is capped so the page holds even a heavy day to one A4 sheet — the report shows
    // the top of each and stops, rather than spilling over.
    private static final int BEST_SELLERS_ROWS = 8;
    private static final int STOCK_ROWS = 12;
    private static final int LOW_STOCK_ROWS = 8;
    private static final int TILL_ROWS = 2;
    // Enough to show where a day's cash went without spilling the page; a heavier day is topped.
    private static final int MOVEMENT_ROWS = 10;

    private final AnalyticsService analyticsService;
    private final TillSessionRepository tillSessions;
    private final TillMovementRepository tillMovements;
    private final StockItemRepository stockItems;
    private final OrderItemDrawRepository draws;
    private final BranchService branchService;
    private final RestaurantService restaurantService;
    private final AccessGuard accessGuard;

    public DailyReportService(AnalyticsService analyticsService,
                              TillSessionRepository tillSessions,
                              TillMovementRepository tillMovements,
                              StockItemRepository stockItems,
                              OrderItemDrawRepository draws,
                              BranchService branchService,
                              RestaurantService restaurantService,
                              AccessGuard accessGuard) {
        this.analyticsService = analyticsService;
        this.tillSessions = tillSessions;
        this.tillMovements = tillMovements;
        this.stockItems = stockItems;
        this.draws = draws;
        this.branchService = branchService;
        this.restaurantService = restaurantService;
        this.accessGuard = accessGuard;
    }

    @Transactional(readOnly = true)
    public byte[] pdf(Long requestedBranchId, LocalDate date) {
        LocalDate day = date != null ? date : LocalDate.now(TimeZones.CAFES);
        DailyReport report = build(requestedBranchId, day, canSeeMoney());
        return toPdf(DailyReportHtml.render(report));
    }

    /**
     * The owner's copy — the same day, for one named branch, always with the money figures. The
     * cashier who triggers it (by closing the till) need not have the Payments permission; this is
     * the owner's report, not theirs.
     */
    @Transactional(readOnly = true)
    public byte[] pdfForOwner(Long branchId, LocalDate day) {
        return toPdf(DailyReportHtml.render(build(branchId, day, true)));
    }

    /** The date the file is named after — kept in step with {@link #pdf} so both agree. */
    public LocalDate effectiveDate(LocalDate date) {
        return date != null ? date : LocalDate.now(TimeZones.CAFES);
    }

    private DailyReport build(Long requestedBranchId, LocalDate day, boolean money) {
        Long restaurantId = accessGuard.scopedRestaurantId();
        Long branchId = resolveBranch(restaurantId, requestedBranchId);
        Branch branch = branchService.getEntity(branchId);
        accessGuard.requireBranchAccess(branch.getRestaurantId(), branch.getId());
        Restaurant restaurant = restaurantService.getEntity(branch.getRestaurantId());

        Instant from = day.atStartOfDay(TimeZones.CAFES).toInstant();
        Instant to = day.plusDays(1).atStartOfDay(TimeZones.CAFES).toInstant();

        AnalyticsSummaryResponse s = analyticsService.summary(from, to, branchId);
        // Same weekday a week back — the honest yardstick for a café, where a Friday only
        // compares to a Friday. Missing history simply leaves the deltas null.
        Instant prevFrom = day.minusWeeks(1).atStartOfDay(TimeZones.CAFES).toInstant();
        Instant prevTo = day.minusWeeks(1).plusDays(1).atStartOfDay(TimeZones.CAFES).toInstant();
        AnalyticsSummaryResponse prev = analyticsService.summary(prevFrom, prevTo, branchId);
        DailyReport.Sales sales = new DailyReport.Sales(
                s.totalOrders(), s.completedOrders(),
                s.cancelledOrders() + s.declinedOrders(),
                s.totalRevenue(), s.averageOrderValue(),
                pctDelta(s.totalRevenue(), prev.totalRevenue()),
                pctDelta(BigDecimal.valueOf(s.totalOrders()), BigDecimal.valueOf(prev.totalOrders())));

        List<DailyReport.PayLine> payments = money ? payments(from, to, branchId) : List.of();
        List<TillSession> sessions = money ? tillSessions
                .findByBranchIdAndOpenedAtGreaterThanEqualAndOpenedAtLessThanOrderByOpenedAtAsc(branchId, from, to)
                : List.of();
        List<DailyReport.TillLine> till = till(sessions);
        List<DailyReport.MovementLine> cashMovements = cashMovements(sessions);
        List<StockItem> shelf = stockItems.findByBranchIdOrderByIdAsc(branchId);

        return new DailyReport(
                displayName(restaurant.getNameEn(), restaurant.getName(), "Serva"),
                displayName(branch.getNameEn(), branch.getName(), branch.getNameAr()),
                day, Instant.now(), sales, payments, till, cashMovements,
                bestSellers(s.bestSellingItems()), busyHours(s.busiestHours()),
                stock(shelf, branchId, from, to), lowStock(shelf));
    }

    /** Percent change against a baseline, or null when there is nothing to compare to. */
    private static Double pctDelta(BigDecimal now, BigDecimal base) {
        if (base == null || base.signum() <= 0) return null;
        return now.subtract(base)
                .divide(base, 4, java.math.RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100)).doubleValue();
    }

    private Long resolveBranch(Long restaurantId, Long requestedBranchId) {
        Long scoped = accessGuard.scopedBranchId();
        if (scoped != null) return scoped;
        if (requestedBranchId != null) return requestedBranchId;
        List<BranchResponse> branches = branchService.listByRestaurant(restaurantId);
        if (branches.size() == 1) return branches.get(0).id();
        throw new BadRequestException("Choose a branch for the daily report.");
    }

    private List<DailyReport.PayLine> payments(Instant from, Instant to, Long branchId) {
        List<DailyReport.PayLine> out = new ArrayList<>();
        for (PaymentMethodRevenueResponse p : analyticsService.paymentMethodRevenue(from, to, branchId)) {
            out.add(new DailyReport.PayLine(p.method(), p.paymentCount(), p.revenue()));
        }
        return out;
    }

    private List<DailyReport.TillLine> till(List<TillSession> sessions) {
        List<DailyReport.TillLine> out = new ArrayList<>();
        for (TillSession t : sessions) {
            if (out.size() >= TILL_ROWS) break;
            out.add(new DailyReport.TillLine(
                    t.getOpenedAt(), t.getClosedAt(), t.getOpenedByName(), t.getClosedByName(),
                    t.getOpeningFloat(), t.getCashSales(), t.getCardSales(),
                    t.getCashPaidOut(), t.getCashPaidIn(),
                    t.getExpectedCash(), t.getCountedCash(), t.getVariance(),
                    t.getOrderCount(), t.getClosedAt() == null));
        }
        return out;
    }

    /** Where the drawer's cash went and came from over the day, across its sessions — reasons and all. */
    private List<DailyReport.MovementLine> cashMovements(List<TillSession> sessions) {
        if (sessions.isEmpty()) return List.of();
        List<Long> ids = sessions.stream().map(TillSession::getId).toList();
        List<DailyReport.MovementLine> out = new ArrayList<>();
        for (TillMovement m : tillMovements.findBySessionIdInOrderByCreatedAtAsc(ids)) {
            if (out.size() >= MOVEMENT_ROWS) break;
            out.add(new DailyReport.MovementLine(
                    m.getCreatedAt(), m.getDirection().name(), m.getAmount(),
                    m.getNote(), m.getCreatedByName()));
        }
        return out;
    }

    private List<DailyReport.ItemLine> bestSellers(List<BestSellingItem> items) {
        List<DailyReport.ItemLine> out = new ArrayList<>();
        for (BestSellingItem i : items) {
            if (out.size() >= BEST_SELLERS_ROWS) break;
            out.add(new DailyReport.ItemLine(
                    displayName(i.nameEn(), i.nameAr(), "Item #" + i.menuItemId()),
                    i.totalQuantity(), i.totalRevenue()));
        }
        return out;
    }

    /**
     * The order-count-by-hour chart, filled from the first active hour to the last so quiet hours
     * read as gaps rather than vanishing — a continuous trading day, not a scatter of bars.
     */
    private List<DailyReport.HourLine> busyHours(List<HourlyCount> hours) {
        Map<Integer, Long> byHour = new HashMap<>();
        for (HourlyCount h : hours) if (h.orders() > 0) byHour.merge(h.hour(), h.orders(), Long::sum);
        if (byHour.isEmpty()) return List.of();
        int first = byHour.keySet().stream().min(Integer::compareTo).orElse(0);
        int last = byHour.keySet().stream().max(Integer::compareTo).orElse(0);
        List<DailyReport.HourLine> out = new ArrayList<>();
        for (int h = first; h <= last; h++) {
            out.add(new DailyReport.HourLine(h, byHour.getOrDefault(h, 0L)));
        }
        return out;
    }

    private List<DailyReport.StockLine> stock(List<StockItem> shelf, Long branchId, Instant from, Instant to) {
        Map<Long, BigDecimal> usedByTin = new HashMap<>();
        for (Object[] row : draws.wantedByTinBetween(branchId, from, to)) {
            usedByTin.put((Long) row[0], (BigDecimal) row[1]);
        }
        if (usedByTin.isEmpty()) return List.of();

        List<DailyReport.StockLine> out = new ArrayList<>();
        for (StockItem s : shelf) {
            BigDecimal used = usedByTin.get(s.getId());
            if (used == null || used.signum() <= 0) continue;
            out.add(new DailyReport.StockLine(
                    displayName(s.getNameEn(), s.getNameAr(), "Item #" + s.getId()),
                    used, s.getUnit().name()));
        }
        out.sort(Comparator.comparing(DailyReport.StockLine::used).reversed());
        return out.size() > STOCK_ROWS ? out.subList(0, STOCK_ROWS) : out;
    }

    /** Shelf items at or below their reorder point — the shortest runway first. */
    private List<DailyReport.LowStockLine> lowStock(List<StockItem> shelf) {
        List<DailyReport.LowStockLine> out = new ArrayList<>();
        for (StockItem s : shelf) {
            BigDecimal reorder = s.getReorderPoint();
            BigDecimal qty = s.getQuantity() == null ? BigDecimal.ZERO : s.getQuantity();
            if (reorder == null || reorder.signum() <= 0 || qty.compareTo(reorder) > 0) continue;
            out.add(new DailyReport.LowStockLine(
                    displayName(s.getNameEn(), s.getNameAr(), "Item #" + s.getId()),
                    qty, reorder, s.getUnit().name()));
        }
        // Closest to (or furthest past) empty first: rank by how much of the reorder point is left.
        out.sort(Comparator.comparing(l -> l.remaining()
                .divide(l.reorderPoint(), 4, java.math.RoundingMode.HALF_UP)));
        return out.size() > LOW_STOCK_ROWS ? out.subList(0, LOW_STOCK_ROWS) : out;
    }

    private boolean canSeeMoney() {
        var user = SecurityUtils.currentUser();
        return user.isPlatformAdmin() || user.hasPermission(Permission.PAYMENTS);
    }

    /** First non-blank of the candidates — English name preferred, then the fallbacks in order. */
    private static String displayName(String... candidates) {
        for (String c : candidates) {
            if (c != null && !c.isBlank()) return c;
        }
        return "";
    }

    /** Font family name the report's CSS falls back to for any non-Latin (Arabic) glyphs. */
    private static final String ARABIC_FAMILY = "Noto Sans Arabic";

    private byte[] toPdf(String html) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder()
                    .useFastMode()
                    // Split runs by script and reorder them, so Arabic joins and reads
                    // right-to-left within the otherwise left-to-right page.
                    .useUnicodeBidiSplitter(new ICUBidiSplitter.ICUBidiSplitterFactory())
                    .useUnicodeBidiReorderer(new ICUBidiReorderer())
                    .defaultTextDirection(BaseRendererBuilder.TextDirection.LTR);
            arabicFont(builder, "/fonts/NotoSansArabic-Regular.ttf", 400);
            arabicFont(builder, "/fonts/NotoSansArabic-Bold.ttf", 700);
            builder.withHtmlContent(html, null).toStream(out).run();
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to render daily report PDF", e);
        }
    }

    private static void arabicFont(PdfRendererBuilder builder, String resource, int weight) {
        builder.useFont(() -> {
            InputStream in = DailyReportService.class.getResourceAsStream(resource);
            if (in == null) throw new IllegalStateException("Missing bundled font: " + resource);
            return in;
        }, ARABIC_FAMILY, weight, BaseRendererBuilder.FontStyle.NORMAL, true);
    }
}
