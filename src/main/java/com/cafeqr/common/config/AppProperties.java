package com.cafeqr.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;
import java.util.List;

/** Type-safe binding of the {@code app.*} configuration tree. */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        Jwt jwt,
        Storage storage,
        String publicBaseUrl,
        Cors cors,
        Bootstrap bootstrap,
        Billing billing,
        Subscription subscription,
        Notifications notifications,
        RateLimit rateLimit
) {

    /** Per-IP request limits on sensitive public endpoints (in-memory, fixed 1-minute window). */
    public record RateLimit(
            Boolean enabled,
            Integer authPerMinute,    // /api/auth/login, forgot/reset/refresh
            Integer publicPerMinute   // /api/public/onboarding, /api/public/leads
    ) {
        public boolean enabledOrDefault() {
            return enabled == null || enabled;
        }

        public int authPerMinuteOrDefault() {
            return authPerMinute != null && authPerMinute > 0 ? authPerMinute : 10;
        }

        public int publicPerMinuteOrDefault() {
            return publicPerMinute != null && publicPerMinute > 0 ? publicPerMinute : 8;
        }
    }

    public record Jwt(
            String secret,
            long accessTokenTtlMinutes,
            long refreshTokenTtlDays,
            String issuer
    ) {}

    public record Storage(
            String type,
            String localDir
    ) {}

    public record Cors(
            List<String> allowedOrigins
    ) {}

    public record Bootstrap(
            boolean enabled,
            String adminEmail,
            String adminPassword,
            String adminFullName
    ) {}

    /**
     * Billing details for café subscriptions: the recurring price, the currency, and the
     * bank transfer details that renewal
     * reminder emails include. (Self-serve public signup was removed; this stays because
     * the renewal/expiry lifecycle job still emails these bank instructions to existing cafés.)
     */
    public record Billing(
            BigDecimal price,
            String currency,
            String bankName,
            String accountName,
            String accountNumber,
            String iban
    ) {}

    /**
     * Subscription lifecycle for the annual model: how long a paid term lasts, the grace window
     * after it lapses before the café goes offline, and when to email renewal reminders.
     */
    public record Subscription(
            Integer termMonths,         // length of a paid term (default 12)
            Integer graceDays,          // days past end-date the café stays live before going offline
            List<Integer> reminderDaysBefore // days-before-expiry to email a renewal reminder
    ) {
        public int termMonthsOrDefault() {
            return termMonths != null && termMonths > 0 ? termMonths : 12;
        }

        public int graceDaysOrDefault() {
            return graceDays != null && graceDays >= 0 ? graceDays : 7;
        }

        public List<Integer> reminderDaysBeforeOrDefault() {
            return reminderDaysBefore != null && !reminderDaysBefore.isEmpty()
                    ? reminderDaysBefore : List.of(14, 7, 1);
        }
    }

    /**
     * Outbound channels: transactional email via Brevo (free tier) and customer order SMS via
     * Infobip (kept ready for a future, owner-activated paid feature). Each channel defaults to
     * {@code provider: log} (nothing sent — delivery only logged) until its provider + credentials
     * are set, so the app runs with zero external setup.
     */
    public record Notifications(
            Email email,
            Sms sms,
            Infobip infobip,
            Whatsapp whatsapp
    ) {

        /** Meta WhatsApp Cloud API credentials for OTP delivery. */
        public record Whatsapp(
                String accessToken,    // permanent system-user token from Meta Business Manager
                String phoneNumberId   // WhatsApp Phone Number ID from Meta Developer Console
        ) {
            public boolean configured() {
                return accessToken != null && !accessToken.isBlank()
                        && phoneNumberId != null && !phoneNumberId.isBlank();
            }
        }
        /** Infobip account credentials (used by the SMS channel). */
        public record Infobip(
                String baseUrl,         // e.g. "xxxxx.api.infobip.com" (no scheme needed)
                String apiKey
        ) {
            public boolean configured() {
                return baseUrl != null && !baseUrl.isBlank() && apiKey != null && !apiKey.isBlank();
            }

            /** Normalises to a scheme-qualified base with no trailing slash. */
            public String httpBase() {
                String b = baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
                return b.startsWith("http") ? b : "https://" + b;
            }
        }

        /** Transactional email via SMTP (Brevo relay). Credentials live in {@code spring.mail.*}. */
        public record Email(
                String provider,        // "smtp" to enable; anything else = log only
                String from,            // e.g. "Serva <onboarding@yourdomain.com>" (Brevo-verified sender)
                String adminAlertTo     // where new-signup alerts go (optional)
        ) {
            public boolean smtpEnabled() {
                return "smtp".equalsIgnoreCase(provider);
            }
        }

        /** Customer order SMS via Infobip. Deferred paid feature — integration kept ready. */
        public record Sms(
                String provider,        // "infobip" to enable; anything else = log only
                String from,            // alphanumeric sender id (or number)
                String defaultCountryCode // prepended to local numbers, e.g. "968" for Oman
        ) {
            public boolean enabled(Infobip infobip) {
                return "infobip".equalsIgnoreCase(provider) && infobip != null && infobip.configured();
            }

            public String defaultCountryCodeOrDefault() {
                return defaultCountryCode != null && !defaultCountryCode.isBlank() ? defaultCountryCode : "968";
            }
        }
    }
}
