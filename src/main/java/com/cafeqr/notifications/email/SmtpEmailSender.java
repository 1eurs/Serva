package com.cafeqr.notifications.email;

import com.cafeqr.common.config.AppProperties;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sends email over SMTP (Brevo relay) using Spring's autoconfigured {@link JavaMailSender}
 * (credentials in {@code spring.mail.*}). When {@code app.notifications.email.provider != smtp} it
 * only logs, so the app runs without external setup.
 */
@Component
public class SmtpEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger("notifications.email");
    private static final Pattern NAMED = Pattern.compile("^\\s*(.*?)\\s*<\\s*(.+?)\\s*>\\s*$");

    private final AppProperties.Notifications.Email config;
    private final ObjectProvider<JavaMailSender> mailSenderProvider;

    public SmtpEmailSender(AppProperties appProperties, ObjectProvider<JavaMailSender> mailSenderProvider) {
        this.config = appProperties.notifications() != null ? appProperties.notifications().email() : null;
        this.mailSenderProvider = mailSenderProvider;
    }

    @Override
    public void send(EmailMessage message) {
        if (config == null || !config.smtpEnabled()) {
            log.info("[EMAIL:log] to={} subject=\"{}\"", message.to(), message.subject());
            return;
        }
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            log.error("[EMAIL:smtp] provider=smtp but no mail sender — set spring.mail.host/username/password");
            return;
        }
        try {
            String[] sender = parseSender(config.from());
            MimeMessage mime = mailSender.createMimeMessage();
            // Multipart when there's HTML or a file to carry — a plain text-only mail stays simple.
            boolean multipart = message.html() != null || message.attachment() != null;
            MimeMessageHelper helper = new MimeMessageHelper(mime, multipart, "UTF-8");
            helper.setFrom(sender[1], sender[0]);
            helper.setTo(message.to());
            helper.setSubject(message.subject());
            if (message.html() != null) {
                helper.setText(message.text() != null ? message.text() : "", message.html());
            } else {
                helper.setText(message.text() != null ? message.text() : "");
            }
            EmailMessage.Attachment att = message.attachment();
            if (att != null) {
                helper.addAttachment(att.filename(),
                        new org.springframework.core.io.ByteArrayResource(att.content()), att.contentType());
            }
            mailSender.send(mime);
            log.info("[EMAIL:smtp] sent to={} subject=\"{}\"", message.to(), message.subject());
        } catch (Exception e) {
            // Never break the caller's flow because an email failed.
            log.error("[EMAIL:smtp] failed to={} subject=\"{}\": {}", message.to(), message.subject(), e.getMessage());
        }
    }

    /** Parses {@code "Name <email>"} (or a bare {@code "email"}) into {@code [name, email]}. */
    static String[] parseSender(String from) {
        if (from == null || from.isBlank()) {
            return new String[]{"Serva", "no-reply@example.com"};
        }
        Matcher m = NAMED.matcher(from);
        if (m.matches()) {
            String name = m.group(1).isBlank() ? "Serva" : m.group(1);
            return new String[]{name, m.group(2)};
        }
        return new String[]{"Serva", from.trim()};
    }
}
