package com.cafeqr.subscriptions;

import com.cafeqr.common.config.AppProperties;
import com.cafeqr.notifications.email.EmailMessage;
import com.cafeqr.notifications.email.EmailSender;
import com.cafeqr.common.util.Names;
import com.cafeqr.notifications.email.EmailTemplate;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.subscriptions.domain.BillingCycle;
import com.cafeqr.subscriptions.domain.Subscription;
import com.cafeqr.subscriptions.domain.SubscriptionStatus;
import com.cafeqr.subscriptions.repository.SubscriptionRepository;
import com.cafeqr.users.domain.User;
import com.cafeqr.users.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Daily annual-billing housekeeping: moves lapsed subscriptions through
 * ACTIVE → PAST_DUE → (after grace) EXPIRED, takes expired cafés offline,
 * and sends branded renewal reminders and expiry notices.
 */
@Component
public class SubscriptionLifecycleJob {

    private static final Logger log = LoggerFactory.getLogger("subscriptions.lifecycle");

    private final SubscriptionRepository subscriptionRepository;
    private final RestaurantService restaurantService;
    private final UserRepository userRepository;
    private final EmailSender email;
    private final AppProperties props;

    public SubscriptionLifecycleJob(SubscriptionRepository subscriptionRepository,
                                    RestaurantService restaurantService,
                                    UserRepository userRepository,
                                    EmailSender email,
                                    AppProperties props) {
        this.subscriptionRepository = subscriptionRepository;
        this.restaurantService = restaurantService;
        this.userRepository = userRepository;
        this.email = email;
        this.props = props;
    }

    @Scheduled(cron = "${app.subscription.cron:0 15 2 * * *}")
    @Transactional
    public void run() { runFor(LocalDate.now()); }

    @Transactional
    public void runFor(LocalDate today) {
        AppProperties.Subscription cfg = props.subscription();
        int graceDays = cfg != null ? cfg.graceDaysOrDefault() : 7;
        List<Integer> reminderOffsets = cfg != null ? cfg.reminderDaysBeforeOrDefault() : List.of(14, 7, 1);

        List<Subscription> subs = subscriptionRepository.findByStatusIn(
                List.of(SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE));

        for (Subscription s : subs) {
            if (s.getBillingCycle() == BillingCycle.ONE_TIME) {
                continue;
            }
            LocalDate end = s.getEndDate();
            if (end == null) continue; // lifetime — never expires

            if (s.getStatus() == SubscriptionStatus.ACTIVE) {
                if (end.isBefore(today)) {
                    s.setStatus(SubscriptionStatus.PAST_DUE);
                    sendReminder(s, true); // lapsed today — urgent
                } else {
                    long daysUntil = ChronoUnit.DAYS.between(today, end);
                    if (reminderOffsets.contains((int) daysUntil)
                            && !today.equals(s.getLastReminderOn())) {
                        sendReminder(s, false);
                        s.setLastReminderOn(today);
                    }
                }
            } else if (s.getStatus() == SubscriptionStatus.PAST_DUE
                    && end.isBefore(today.minusDays(graceDays))) {
                s.setStatus(SubscriptionStatus.EXPIRED);
                restaurantService.setActive(s.getRestaurantId(), false);
                log.info("Subscription {} EXPIRED — restaurant {} taken offline", s.getId(), s.getRestaurantId());
                sendExpired(s);
            }
        }
    }

    // ------------------------------------------------------------------ emails

    private void sendReminder(Subscription s, boolean pastDue) {
        owner(s.getRestaurantId()).ifPresent(owner -> {
            AppProperties.Billing o = props.billing();
            String amount = fmt(s);
            String endDate = s.getEndDate() != null ? s.getEndDate().toString() : "";
            String ref = s.getPaymentReference() != null ? s.getPaymentReference() : "";

            String urgencyEn = pastDue
                ? "Your subscription <strong>expired on " + endDate + "</strong>. "
                  + "Your café is still live during the grace period, but please renew now to avoid interruption."
                : "Your subscription expires on <strong>" + endDate + "</strong>. "
                  + "Renew now to keep your café online without interruption.";
            String urgencyAr = pastDue
                ? "انتهى اشتراكك <strong>بتاريخ " + endDate + "</strong>. "
                  + "مطعمك لا يزال نشطاً خلال فترة السماح، لكن يرجى التجديد الآن تجنباً للانقطاع."
                : "ينتهي اشتراكك <strong>بتاريخ " + endDate + "</strong>. "
                  + "جدّد الآن للإبقاء على مطعمك نشطاً دون انقطاع.";

            String html = EmailTemplate.build()
                .line("Hi <strong>" + Names.preferring(owner.getFullNameEn(), owner.getFullNameAr(), owner.getFullName(), false) + "</strong>,")
                .line(urgencyEn)
                .line("Transfer <strong>" + amount + "</strong> with your reference in the note:")
                .code("Your reference", ref)
                .kvTable(
                    "Bank",           bank(o),
                    "Account name",   accName(o),
                    "Account number", accNo(o),
                    "IBAN",           iban(o),
                    "Amount",         amount
                )
                .muted("We'll extend your subscription within 1 business day of receiving the transfer.")
                .divider()
                .rtl()
                .line("مرحباً <strong>" + Names.preferring(owner.getFullNameEn(), owner.getFullNameAr(), owner.getFullName(), true) + "</strong>،")
                .line(urgencyAr)
                .line("حوّل <strong>" + amount + "</strong> واكتب رمزك المرجعي في الملاحظة:")
                .code("رمزك المرجعي", ref)
                .kvTable(
                    "البنك",       bank(o),
                    "اسم الحساب",  accName(o),
                    "رقم الحساب",  accNo(o),
                    "الآيبان",     iban(o),
                    "المبلغ",      amount
                )
                .muted("سنمدّد اشتراكك خلال يوم عمل واحد من استلام التحويل.")
                .html();

            String text = (pastDue
                ? "Your Serva subscription expired on " + endDate + ". Renew now.\n"
                : "Your Serva subscription expires on " + endDate + ".\n")
                + "Transfer " + amount + " — ref: " + ref + "\n— Serva";

            String subject = pastDue
                ? "Action needed: renew your Serva subscription"
                : "Reminder: your Serva subscription expires on " + endDate;

            email.send(new EmailMessage(owner.getEmail(), subject, html, text));
        });
    }

    private void sendExpired(Subscription s) {
        owner(s.getRestaurantId()).ifPresent(owner -> {
            AppProperties.Billing o = props.billing();
            String amount = fmt(s);
            String endDate = s.getEndDate() != null ? s.getEndDate().toString() : "";
            String ref = s.getPaymentReference() != null ? s.getPaymentReference() : "";

            String html = EmailTemplate.build()
                .line("Hi <strong>" + Names.preferring(owner.getFullNameEn(), owner.getFullNameAr(), owner.getFullName(), false) + "</strong>,")
                .line("Your Serva subscription expired on <strong>" + endDate + "</strong> "
                    + "and your café's menu is now <strong>offline</strong>. "
                    + "Customers can't place orders until you renew.")
                .line("To reactivate, transfer <strong>" + amount + "</strong> with your reference:")
                .code("Your reference", ref)
                .kvTable(
                    "Bank",           bank(o),
                    "Account name",   accName(o),
                    "Account number", accNo(o),
                    "IBAN",           iban(o),
                    "Amount",         amount
                )
                .muted("Your menu will come back online within 1 business day of us confirming the transfer.")
                .divider()
                .rtl()
                .line("مرحباً <strong>" + Names.preferring(owner.getFullNameEn(), owner.getFullNameAr(), owner.getFullName(), true) + "</strong>،")
                .line("انتهى اشتراكك في Serva بتاريخ <strong>" + endDate + "</strong> "
                    + "وقائمة مطعمك أصبحت <strong>غير متاحة</strong>. "
                    + "لا يستطيع العملاء الطلب حتى تجدّد اشتراكك.")
                .line("لإعادة التفعيل، حوّل <strong>" + amount + "</strong> مع رمزك المرجعي:")
                .code("رمزك المرجعي", ref)
                .kvTable(
                    "البنك",       bank(o),
                    "اسم الحساب",  accName(o),
                    "رقم الحساب",  accNo(o),
                    "الآيبان",     iban(o),
                    "المبلغ",      amount
                )
                .muted("ستعود قائمتك للعمل خلال يوم عمل واحد من تأكيد التحويل.")
                .html();

            String text = "Your Serva subscription expired. Menu is offline. "
                + "Renew: transfer " + amount + " — ref: " + ref + "\n— Serva";

            email.send(new EmailMessage(owner.getEmail(),
                "Your Serva café is offline — renew to reactivate", html, text));
        });
    }

    // ------------------------------------------------------------------ helpers

    private java.util.Optional<User> owner(Long restaurantId) {
        return userRepository.findFirstByRestaurantIdAndOwnerTrueOrderByIdAsc(restaurantId);
    }

    private String fmt(Subscription s) {
        AppProperties.Billing o = props.billing();
        return (s.getPrice() != null ? s.getPrice().toPlainString() : "")
            + " " + (o != null ? o.currency() : "OMR");
    }

    private static String bank(AppProperties.Billing o)    { return o != null ? o.bankName()      : ""; }
    private static String accName(AppProperties.Billing o) { return o != null ? o.accountName()   : ""; }
    private static String accNo(AppProperties.Billing o)   { return o != null ? o.accountNumber() : ""; }
    private static String iban(AppProperties.Billing o)    { return o != null ? o.iban()          : ""; }
}
