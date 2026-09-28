package com.cafeqr.notifications.email;

/** A transactional email to a single recipient. {@code html} is optional; {@code text} is the fallback. */
public record EmailMessage(
        String to,
        String subject,
        String html,
        String text,
        Attachment attachment
) {
    /** The common case — no file attached. */
    public EmailMessage(String to, String subject, String html, String text) {
        this(to, subject, html, text, null);
    }

    /** A single file to hang off the message, held in memory (reports are small one-page PDFs). */
    public record Attachment(String filename, byte[] content, String contentType) {}
}
