package com.cafeqr.audit;

import com.cafeqr.audit.domain.AuditEntry;
import com.cafeqr.audit.dto.AuditEntryResponse;
import com.cafeqr.audit.repository.AuditEntryRepository;
import com.cafeqr.auth.security.SecurityUtils;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Writes the platform-admin audit trail.
 *
 * <p>Where a caller is already inside a transaction — {@code LeadService.convert},
 * {@code SubscriptionService.recordPayment} — the entry joins it, so an action that rolls back
 * cannot leave a log claiming it happened. Callers that record after the fact (the controllers)
 * commit their entry separately; there the action is already done, and a failed audit write
 * must not undo it.
 *
 * <p>Either way a failed <em>attempt</em> leaves no trace. That is the right trade for a log
 * whose job is to explain the current state of the platform, not to catch intruders.
 */
@Service
public class AuditService {

    /** A page of history; the console pages rather than streaming a table that only grows. */
    private static final int MAX_PAGE = 500;

    private final AuditEntryRepository repository;

    public AuditService(AuditEntryRepository repository) {
        this.repository = repository;
    }

    /** Records an action against a target, stamped with whoever is currently authenticated. */
    @Transactional
    public void record(String action, String targetType, Long targetId, String targetLabel, String detail) {
        AuditEntry entry = new AuditEntry();
        entry.setActorId(SecurityUtils.currentUserIdOrNull());
        entry.setActorName(SecurityUtils.currentUserNameOrNull());
        entry.setAction(action);
        entry.setTargetType(targetType);
        entry.setTargetId(targetId);
        entry.setTargetLabel(trim(targetLabel, 200));
        entry.setDetail(trim(detail, 1000));
        repository.save(entry);
    }

    /** Shorthand for the common case: something happened to a café. */
    @Transactional
    public void recordCafe(String action, Long restaurantId, String cafeName, String detail) {
        record(action, "RESTAURANT", restaurantId, cafeName, detail);
    }

    @Transactional(readOnly = true)
    public List<AuditEntryResponse> recent(int limit) {
        return repository.findByOrderByIdDesc(PageRequest.of(0, Math.clamp(limit, 1, MAX_PAGE)))
                .map(AuditEntryResponse::from).getContent();
    }

    @Transactional(readOnly = true)
    public List<AuditEntryResponse> forTarget(String targetType, Long targetId, int limit) {
        return repository.findByTargetTypeAndTargetIdOrderByIdDesc(
                        targetType, targetId, PageRequest.of(0, Math.clamp(limit, 1, MAX_PAGE)))
                .map(AuditEntryResponse::from).getContent();
    }

    private static String trim(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
