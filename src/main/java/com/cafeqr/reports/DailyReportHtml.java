package com.cafeqr.reports;

import com.cafeqr.reports.DailyReport.HourLine;
import com.cafeqr.reports.DailyReport.ItemLine;
import com.cafeqr.reports.DailyReport.LowStockLine;
import com.cafeqr.reports.DailyReport.MovementLine;
import com.cafeqr.reports.DailyReport.PayLine;
import com.cafeqr.reports.DailyReport.StockLine;
import com.cafeqr.reports.DailyReport.TillLine;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import static com.cafeqr.common.util.TimeZones.CAFES;

/**
 * Turns a {@link DailyReport} into the self-contained XHTML that openhtmltopdf lays out onto one
 * A4 page. Everything is inline: Helvetica carries the Latin chrome, and the font stack falls back
 * to the bundled Noto Sans Arabic so Arabic shop and item names get their glyphs (the service
 * registers the font and enables bidi) instead of rendering as boxes.
 *
 * <p>The page is built to always look full and never spill: the service caps every list, and the
 * hourly chart is a fixed-height band that carries the middle of the page whether the day was busy
 * or quiet.
 */
final class DailyReportHtml {

    private DailyReportHtml() {}

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final String INK = "#111827";
    private static final String MUTED = "#6b7280";
    private static final String LINE = "#e5e7eb";
    private static final String ACCENT = "#10b981";
    private static final String RED = "#b91c1c";
    /** Tallest a chart bar gets, in px — the band the chart occupies is this plus its labels. */
    private static final int CHART_H = 118;

    static String render(DailyReport r) {
        StringBuilder b = new StringBuilder(12288);
        b.append("<html><head><style>");
        b.append("@page{size:A4;margin:13mm 13mm 11mm 13mm;}");
        b.append("body{font-family:Helvetica,'Noto Sans Arabic',sans-serif;color:").append(INK)
                .append(";font-size:9.5pt;line-height:1.32;}");
        b.append("table{width:100%;border-collapse:collapse;}");
        b.append("h2{font-size:8pt;letter-spacing:1.5px;text-transform:uppercase;color:").append(MUTED)
                .append(";margin:0 0 6px 0;padding-bottom:3px;border-bottom:1px solid ").append(LINE).append(";}");
        b.append("td,th{padding:2.5px 0;text-align:left;vertical-align:top;}");
        b.append("th{font-size:7.5pt;letter-spacing:.5px;text-transform:uppercase;color:").append(MUTED).append(";}");
        b.append(".r{text-align:right;}");
        b.append(".row td{border-bottom:1px solid ").append(LINE).append(";}");
        b.append(".sec{margin-top:15px;}");
        b.append("</style></head><body>");

        header(b, r);
        kpis(b, r);
        hourChart(b, r);

        // Middle band — the money on the left, the products on the right.
        b.append("<table class=\"sec\"><tr>");
        b.append("<td style=\"width:52%;padding-right:16px;vertical-align:top;\">");
        payments(b, r);
        till(b, r);
        cashMovements(b, r);
        b.append("</td><td style=\"width:48%;padding-left:16px;vertical-align:top;border-left:1px solid ")
                .append(LINE).append(";\">");
        bestSellers(b, r);
        b.append("</td></tr></table>");

        // Bottom band — what the day burned, and what to buy before tomorrow.
        b.append("<table class=\"sec\"><tr>");
        b.append("<td style=\"width:52%;padding-right:16px;vertical-align:top;\">");
        stock(b, r);
        b.append("</td><td style=\"width:48%;padding-left:16px;vertical-align:top;border-left:1px solid ")
                .append(LINE).append(";\">");
        lowStock(b, r);
        b.append("</td></tr></table>");

        footer(b, r);
        b.append("</body></html>");
        return b.toString();
    }

    private static void header(StringBuilder b, DailyReport r) {
        String date = r.date().format(DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale.ENGLISH));
        String shop = esc(r.shopName());
        if (r.branchName() != null && !r.branchName().isBlank()) {
            shop = shop + " &#183; " + esc(r.branchName());
        }
        // The rule lives on a wrapping <div>, not on the table: openhtmltopdf drops padding on a
        // border-collapse table, so a border-bottom set there hugs the baseline and strikes through
        // the "serva" wordmark. A block div honours padding-bottom, so the line clears the logo.
        b.append("<div style=\"border-bottom:3px solid ").append(INK).append(";padding-bottom:8px;\">");
        b.append("<table><tr>");
        b.append("<td style=\"vertical-align:bottom;\">");
        // line-height must contain the 30pt glyphs: at 1 they overflow the line box downward and the
        // rule below (border on the wrapping div) cuts through the wordmark. 1.25 seats them above it.
        b.append("<div style=\"font-size:30pt;font-weight:bold;letter-spacing:-1px;line-height:1.25;\">serva")
                .append("<span style=\"color:").append(ACCENT).append(";\">.</span></div>");
        b.append("</td>");
        b.append("<td class=\"r\" style=\"vertical-align:bottom;\">");
        b.append("<div style=\"font-size:13pt;font-weight:bold;\">").append(shop).append("</div>");
        b.append("<div style=\"font-size:8pt;letter-spacing:2px;text-transform:uppercase;color:")
                .append(ACCENT).append(";font-weight:bold;\">Daily Report</div>");
        b.append("<div style=\"color:").append(MUTED).append(";\">").append(esc(date)).append("</div>");
        b.append("</td></tr></table></div>");
    }

    private static void kpis(StringBuilder b, DailyReport r) {
        DailyReport.Sales s = r.sales();
        b.append("<table class=\"sec\"><tr>");
        kpi(b, "Revenue", money(s.revenue()), s.revenueDelta(), true);
        kpi(b, "Orders", num(s.orders()), s.ordersDelta(), false);
        kpi(b, "Avg order", money(s.averageOrderValue()), null, false);
        kpi(b, "Completed", num(s.completed()) + " / " + num(s.cancelled()) + " lost", null, false);
        b.append("</tr></table>");
    }

    private static void kpi(StringBuilder b, String label, String value, Double delta, boolean lead) {
        b.append("<td style=\"width:25%;padding:2px;\">");
        b.append("<div style=\"border:1px solid ").append(LINE).append(";border-top:3px solid ")
                .append(lead ? ACCENT : INK).append(";padding:9px 11px;\">");
        b.append("<div style=\"font-size:7.5pt;letter-spacing:1px;text-transform:uppercase;color:")
                .append(MUTED).append(";\">").append(esc(label)).append("</div>");
        b.append("<div style=\"font-size:15pt;font-weight:bold;margin-top:3px;white-space:nowrap;\">").append(esc(value)).append("</div>");
        if (delta != null) {
            String color = delta >= 0 ? ACCENT : RED;
            String sign = delta >= 0 ? "+" : "-";
            b.append("<div style=\"font-size:8pt;font-weight:bold;margin-top:3px;color:").append(color).append(";\">")
                    .append(sign).append(fmt1(Math.abs(delta)))
                    .append("% <span style=\"color:").append(MUTED).append(";font-weight:normal;\">vs last week</span></div>");
        } else {
            b.append("<div style=\"font-size:8pt;margin-top:3px;color:").append(MUTED).append(";\">&#160;</div>");
        }
        b.append("</div></td>");
    }

    private static void hourChart(StringBuilder b, DailyReport r) {
        b.append("<div class=\"sec\"><h2>Orders by hour</h2>");
        if (r.busyHours().isEmpty()) {
            b.append(empty("No orders were taken on this day."));
            b.append("</div>");
            return;
        }
        long peak = r.busyHours().stream().mapToLong(HourLine::orders).max().orElse(1);
        b.append("<table style=\"table-layout:fixed;\"><tr>");
        for (HourLine h : r.busyHours()) {
            int barPx = h.orders() <= 0 ? 0
                    : Math.max(3, (int) Math.round(h.orders() * (double) CHART_H / Math.max(peak, 1)));
            b.append("<td style=\"height:").append(CHART_H).append("px;vertical-align:bottom;text-align:center;padding:0 2px;\">");
            b.append("<div style=\"font-size:6.5pt;color:").append(MUTED).append(";\">")
                    .append(h.orders() > 0 ? num(h.orders()) : "").append("</div>");
            b.append("<div style=\"background:").append(h.orders() > 0 ? ACCENT : LINE)
                    .append(";height:").append(barPx).append("px;width:66%;margin:2px auto 0 auto;\"></div>");
            b.append("</td>");
        }
        b.append("</tr><tr>");
        for (HourLine h : r.busyHours()) {
            b.append("<td style=\"text-align:center;font-size:7pt;color:").append(MUTED)
                    .append(";border-top:1px solid ").append(LINE).append(";padding-top:3px;\">")
                    .append(esc(hh(h.hour()))).append("</td>");
        }
        b.append("</tr></table></div>");
    }

    private static void payments(StringBuilder b, DailyReport r) {
        b.append("<h2>Payments</h2>");
        if (r.payments().isEmpty()) {
            b.append(empty("Payment figures need the Payments permission."));
            return;
        }
        b.append("<table><tr><th>Method</th><th class=\"r\">Count</th><th class=\"r\">Revenue</th></tr>");
        BigDecimal total = BigDecimal.ZERO;
        for (PayLine p : r.payments()) {
            total = total.add(p.revenue() == null ? BigDecimal.ZERO : p.revenue());
            b.append("<tr class=\"row\"><td>").append(esc(method(p.method()))).append("</td>")
                    .append("<td class=\"r\">").append(num(p.count())).append("</td>")
                    .append("<td class=\"r\">").append(money(p.revenue())).append("</td></tr>");
        }
        b.append("<tr><td style=\"font-weight:bold;padding-top:4px;\">Total</td><td></td>")
                .append("<td class=\"r\" style=\"font-weight:bold;padding-top:4px;\">").append(money(total)).append("</td></tr>");
        b.append("</table>");
    }

    private static void till(StringBuilder b, DailyReport r) {
        if (r.till().isEmpty()) return;
        b.append("<div class=\"sec\"><h2>Till reconciliation</h2>");
        for (TillLine t : r.till()) {
            String when = fmt(t.openedAt()) + " &#8211; " + (t.open() ? "open" : fmt(t.closedAt()));
            b.append("<div style=\"margin-bottom:9px;\">");
            b.append("<div style=\"font-weight:bold;margin-bottom:2px;\">").append(when);
            String by = t.open() ? t.openedBy() : t.closedBy();
            if (by != null && !by.isBlank()) b.append(" <span style=\"font-weight:normal;color:").append(MUTED)
                    .append(";\">&#183; ").append(esc(by)).append("</span>");
            if (t.orderCount() != null) b.append(" <span style=\"font-weight:normal;color:").append(MUTED)
                    .append(";\">&#183; ").append(num(t.orderCount())).append(" orders</span>");
            b.append("</div>");
            // Two pairs per row (numbers only — the KPI/Payments blocks already say OMR) so it stays short.
            b.append("<table style=\"table-layout:fixed;\">");
            pair(b, "Opening float", amount(t.openingFloat()), false, "Cash sales", amount(t.cashSales()), false);
            boolean moved = signum(t.paidOut()) != 0 || signum(t.paidIn()) != 0;
            if (t.open()) {
                if (moved) pair(b, "Paid out", amount(t.paidOut()), false, "Paid in", amount(t.paidIn()), false);
                pair(b, "Card sales", amount(t.cardSales()), false, "", "", false);
            } else {
                boolean off = t.variance() != null && t.variance().signum() != 0;
                if (moved) pair(b, "Paid out", amount(t.paidOut()), false, "Paid in", amount(t.paidIn()), false);
                pair(b, "Card sales", amount(t.cardSales()), false, "Expected", amount(t.expectedCash()), false);
                pair(b, "Counted", amount(t.countedCash()), false, "Variance", amount(t.variance()), off);
            }
            b.append("</table></div>");
        }
        b.append("</div>");
    }

    /**
     * Where the drawer's cash went and came from — the reasons behind the "paid out" figure, so a
     * short drawer reads as a list of receipts rather than a mystery. Nothing to say if none moved.
     */
    private static void cashMovements(StringBuilder b, DailyReport r) {
        if (r.cashMovements().isEmpty()) return;
        b.append("<div class=\"sec\"><h2>Cash in &#38; out</h2>");
        b.append("<table>");
        for (MovementLine m : r.cashMovements()) {
            boolean out = "OUT".equals(m.direction());
            String sign = out ? "&#8722;" : "+";                 // minus / plus
            String colour = out ? RED : ACCENT;
            b.append("<tr class=\"row\"><td style=\"color:").append(MUTED).append(";white-space:nowrap;width:16%;\">")
                    .append(fmt(m.at())).append("</td>");
            b.append("<td>").append(esc(m.note()));
            if (m.by() != null && !m.by().isBlank()) {
                b.append(" <span style=\"color:").append(MUTED).append(";\">&#183; ").append(esc(m.by())).append("</span>");
            }
            b.append("</td>");
            b.append("<td class=\"r\" style=\"white-space:nowrap;font-weight:bold;color:").append(colour).append(";\">")
                    .append(sign).append(' ').append(amount(m.amount())).append("</td></tr>");
        }
        b.append("</table></div>");
    }

    private static int signum(BigDecimal v) {
        return v == null ? 0 : v.signum();
    }

    /** One row of the till grid: two label/value pairs side by side. Empty label = blank cell. */
    private static void pair(StringBuilder b, String l1, String v1, boolean f1, String l2, String v2, boolean f2) {
        b.append("<tr>");
        cell(b, l1, v1, f1);
        cell(b, l2, v2, f2);
        b.append("</tr>");
    }

    private static void cell(StringBuilder b, String label, String value, boolean flag) {
        if (label.isEmpty()) { b.append("<td></td><td></td>"); return; }
        b.append("<td style=\"color:").append(MUTED).append(";width:26%;\">").append(esc(label)).append("</td>");
        b.append("<td class=\"r\" style=\"width:24%;padding-right:10px;white-space:nowrap;")
                .append(flag ? "color:" + RED + ";font-weight:bold;" : "").append("\">").append(esc(value)).append("</td>");
    }

    private static void bestSellers(StringBuilder b, DailyReport r) {
        b.append("<h2>Best sellers</h2>");
        if (r.bestSellers().isEmpty()) {
            b.append(empty("No items sold."));
            return;
        }
        b.append("<table><tr><th>Item</th><th class=\"r\">Qty</th><th class=\"r\">Revenue</th></tr>");
        for (ItemLine i : r.bestSellers()) {
            b.append("<tr class=\"row\"><td>").append(esc(i.name())).append("</td>")
                    .append("<td class=\"r\">").append(num(i.quantity())).append("</td>")
                    .append("<td class=\"r\">").append(money(i.revenue())).append("</td></tr>");
        }
        b.append("</table>");
    }

    private static void stock(StringBuilder b, DailyReport r) {
        b.append("<h2>Stock used today</h2>");
        if (r.stock().isEmpty()) {
            b.append(empty("No stock draws recorded."));
            return;
        }
        // Two sub-columns so a dozen shelf items stay half as tall.
        int n = r.stock().size();
        int half = (n + 1) / 2;
        b.append("<table><tr><td style=\"width:50%;padding-right:10px;vertical-align:top;\"><table>");
        for (int i = 0; i < half; i++) stockRow(b, r.stock().get(i));
        b.append("</table></td><td style=\"width:50%;padding-left:10px;vertical-align:top;\"><table>");
        for (int i = half; i < n; i++) stockRow(b, r.stock().get(i));
        b.append("</table></td></tr></table>");
    }

    private static void stockRow(StringBuilder b, StockLine s) {
        b.append("<tr class=\"row\"><td>").append(esc(s.name())).append("</td>")
                .append("<td class=\"r\" style=\"white-space:nowrap;\">").append(esc(qty(s.used()))).append(' ')
                .append(esc(s.unit().toLowerCase(Locale.ENGLISH))).append("</td></tr>");
    }

    private static void lowStock(StringBuilder b, DailyReport r) {
        b.append("<h2>Low stock &#183; reorder</h2>");
        if (r.lowStock().isEmpty()) {
            b.append("<div style=\"color:").append(ACCENT).append(";font-weight:bold;\">All shelves above their reorder point.</div>");
            return;
        }
        b.append("<table><tr><th>Item</th><th class=\"r\">Left</th><th class=\"r\">Reorder at</th></tr>");
        for (LowStockLine l : r.lowStock()) {
            String unit = " " + esc(l.unit().toLowerCase(Locale.ENGLISH));
            boolean out = l.remaining().signum() <= 0;
            b.append("<tr class=\"row\"><td>").append(esc(l.name())).append("</td>")
                    .append("<td class=\"r\" style=\"font-weight:bold;color:").append(out ? RED : INK).append(";\">")
                    .append(esc(qty(l.remaining()))).append(unit).append("</td>")
                    .append("<td class=\"r\" style=\"color:").append(MUTED).append(";\">")
                    .append(esc(qty(l.reorderPoint()))).append(unit).append("</td></tr>");
        }
        b.append("</table>");
    }

    private static void footer(StringBuilder b, DailyReport r) {
        String gen = ZonedDateTime.ofInstant(r.generatedAt(), CAFES)
                .format(DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale.ENGLISH));
        b.append("<div style=\"position:fixed;bottom:0;left:0;right:0;border-top:1px solid ").append(LINE)
                .append(";padding-top:5px;font-size:7.5pt;color:").append(MUTED).append(";\">");
        b.append("<table><tr><td>Generated ").append(esc(gen))
                .append("</td><td class=\"r\">Serva &#183; automated daily report</td></tr></table>");
        b.append("</div>");
    }

    // ------------------------------------------------------------------ formatting

    private static String empty(String s) {
        return "<div style=\"color:" + MUTED + ";font-style:italic;\">" + esc(s) + "</div>";
    }

    /** OMR-prefixed, grouped — for the tiles and the payment table, which have room to spell it out. */
    private static String money(BigDecimal v) {
        return "OMR " + amount(v);
    }

    /** Just the number, grouped to three decimals — for the dense grids where OMR would only wrap. */
    private static String amount(BigDecimal v) {
        BigDecimal n = (v == null ? BigDecimal.ZERO : v).setScale(3, RoundingMode.HALF_UP);
        return new java.text.DecimalFormat("#,##0.000").format(n);
    }

    private static String qty(BigDecimal v) {
        if (v == null) return "0";
        BigDecimal n = v.setScale(3, RoundingMode.HALF_UP).stripTrailingZeros();
        return n.scale() < 0 ? n.setScale(0).toPlainString() : n.toPlainString();
    }

    private static String num(long n) {
        return String.format(Locale.ENGLISH, "%,d", n);
    }

    private static String fmt1(double d) {
        return String.format(Locale.ENGLISH, "%.1f", d);
    }

    private static String method(String m) {
        if (m == null || m.isBlank()) return "Other";
        return Character.toUpperCase(m.charAt(0)) + m.substring(1).toLowerCase(Locale.ENGLISH);
    }

    /** Two-digit hour for the chart axis: 8 -> "08". */
    private static String hh(int h) {
        return String.format(Locale.ENGLISH, "%02d", Math.floorMod(h, 24));
    }

    private static String fmt(Instant i) {
        if (i == null) return "&#8212;";
        return ZonedDateTime.ofInstant(i, CAFES).format(TIME);
    }

    /** XHTML has to stay well-formed for the layout engine, so text becomes entities. */
    private static String esc(String s) {
        if (s == null) return "";
        StringBuilder out = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                default -> out.append(c);
            }
        }
        return out.toString();
    }
}
