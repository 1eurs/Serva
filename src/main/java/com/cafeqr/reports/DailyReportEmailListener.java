package com.cafeqr.reports;

import com.cafeqr.common.util.Names;
import com.cafeqr.notifications.email.EmailMessage;
import com.cafeqr.notifications.email.EmailSender;
import com.cafeqr.notifications.email.EmailTemplate;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import com.cafeqr.till.TillClosedEvent;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Emails the owner their one-page daily report when a branch closes its till. It runs
 * <em>after</em> the close commits, so a bad address or an SMTP hiccup can never undo a counted
 * drawer — and the whole thing is wrapped so a failed report is a logged line, never a 500 handed
 * back to the cashier.
 */
@Component
public class DailyReportEmailListener {

    private static final Logger log = LoggerFactory.getLogger("reports.daily-email");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);

    private final DailyReportService reports;
    private final UserRepository users;
    private final RestaurantService restaurants;
    private final EmailSender email;

    public DailyReportEmailListener(DailyReportService reports, UserRepository users,
                                    RestaurantService restaurants, EmailSender email) {
        this.reports = reports;
        this.users = users;
        this.restaurants = restaurants;
        this.email = email;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTillClosed(TillClosedEvent event) {
        try {
            User owner = users.findFirstByRestaurantIdAndOwnerTrueOrderByIdAsc(event.restaurantId()).orElse(null);
            if (owner == null || owner.getEmail() == null || owner.getEmail().isBlank()) {
                log.info("[daily-report] no owner address for restaurant={} — skipping", event.restaurantId());
                return;
            }
            Restaurant restaurant = restaurants.getEntity(event.restaurantId());
            byte[] pdf = reports.pdfForOwner(event.branchId(), event.businessDate());

            String shop = firstNonBlank(restaurant.getNameEn(), restaurant.getName(), "your café");
            String dateLabel = event.businessDate().format(DATE);
            String greetName = Names.preferring(owner.getFullNameEn(), owner.getFullNameAr(), owner.getFullName(), false);

            String html = EmailTemplate.build()
                    .line("Hi <strong>" + esc(greetName) + "</strong>,")
                    .line("The till at <strong>" + esc(shop) + "</strong> has been closed for <strong>"
                            + esc(dateLabel) + "</strong>. Your one-page daily report is attached.")
                    .muted("Sales, payments, till reconciliation, best sellers and stock — the whole day on one sheet.")
                    .html();
            String text = "The till at " + shop + " has been closed for " + dateLabel
                    + ". Your daily report is attached.\n— Serva";

            String filename = "serva-daily-" + event.businessDate() + ".pdf";
            email.send(new EmailMessage(owner.getEmail(),
                    "Daily report — " + shop + " — " + dateLabel,
                    html, text,
                    new EmailMessage.Attachment(filename, pdf, "application/pdf")));
            log.info("[daily-report] sent branch={} date={} to owner", event.branchId(), event.businessDate());
        } catch (Exception e) {
            // A report is a courtesy; never let it surface as a failure of closing the till.
            log.error("[daily-report] failed for branch={} date={}: {}",
                    event.branchId(), event.businessDate(), e.getMessage(), e);
        }
    }

    private static String firstNonBlank(String... xs) {
        for (String x : xs) if (x != null && !x.isBlank()) return x;
        return "";
    }

    /** The greeting is the only free text that reaches the HTML body. */
    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
