package com.cafeqr.leads;

import com.cafeqr.audit.AuditService;
import com.cafeqr.audit.domain.AuditAction;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.common.exception.ResourceNotFoundException;
import com.cafeqr.leads.domain.Lead;
import com.cafeqr.leads.domain.LeadStatus;
import com.cafeqr.leads.dto.CreateLeadRequest;
import com.cafeqr.leads.dto.LeadResponse;
import com.cafeqr.leads.dto.UpdateLeadRequest;
import com.cafeqr.leads.repository.LeadRepository;
import com.cafeqr.restaurants.RestaurantOnboardingService;
import com.cafeqr.restaurants.dto.CreateRestaurantRequest;
import com.cafeqr.restaurants.dto.RestaurantResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class LeadService {

    private final LeadRepository leadRepository;
    private final RestaurantOnboardingService onboardingService;
    private final AuditService audit;

    public LeadService(LeadRepository leadRepository,
                       RestaurantOnboardingService onboardingService,
                       AuditService audit) {
        this.leadRepository = leadRepository;
        this.onboardingService = onboardingService;
        this.audit = audit;
    }

    @Transactional
    public LeadResponse create(CreateLeadRequest request) {
        Lead lead = new Lead();
        lead.setCafeName(request.cafeName());
        lead.setContactName(request.contactName());
        lead.setPhone(request.phone());
        lead.setEmail(request.email());
        lead.setCity(request.city());
        lead.setNote(request.note());
        lead.setStatus(LeadStatus.NEW);
        return LeadResponse.from(leadRepository.save(lead));
    }

    @Transactional(readOnly = true)
    public List<LeadResponse> list() {
        return leadRepository.findAllByOrderByCreatedAtDesc().stream().map(LeadResponse::from).toList();
    }

    /**
     * Moves a lead along the pipeline and/or files the admin's call notes.
     *
     * <p>The first move off {@code NEW} stamps {@code contactedAt} — the clock that says how
     * long a café waited to hear back. It is stamped once and never overwritten, so a lead
     * bounced back to CONTACTED later still reports its original response time.
     */
    @Transactional
    public LeadResponse update(Long id, UpdateLeadRequest request) {
        Lead lead = find(id);
        if (request.adminNote() != null) {
            lead.setAdminNote(request.adminNote().isBlank() ? null : request.adminNote());
        }
        if (request.status() != null) {
            if (request.status() == LeadStatus.CONVERTED && lead.getRestaurantId() == null) {
                throw new ConflictException("Convert the lead into a café instead of marking it converted by hand.");
            }
            lead.setStatus(request.status());
            if (request.status() != LeadStatus.NEW && lead.getContactedAt() == null) {
                lead.setContactedAt(Instant.now());
            }
        }
        return LeadResponse.from(lead);
    }

    /**
     * Provisions the café this lead asked for and closes the lead in the same transaction —
     * the whole point of the pipeline is that "we said yes" and "the café exists" can't drift
     * apart. Re-converting an already-converted lead is refused rather than silently creating
     * a second café for the same request.
     */
    @Transactional
    public RestaurantResponse convert(Long id, CreateRestaurantRequest request) {
        Lead lead = find(id);
        if (lead.getRestaurantId() != null) {
            throw new ConflictException("This lead was already converted into a café.");
        }
        RestaurantResponse restaurant = onboardingService.onboard(request);
        lead.setRestaurantId(restaurant.id());
        lead.setStatus(LeadStatus.CONVERTED);
        if (lead.getContactedAt() == null) {
            lead.setContactedAt(Instant.now());
        }
        audit.recordCafe(AuditAction.LEAD_CONVERTED, restaurant.id(), lead.getCafeName(),
                "From lead #" + lead.getId() + " (" + lead.getContactName()
                        + (lead.getPhone() != null ? ", " + lead.getPhone() : "") + ")");
        return restaurant;
    }

    private Lead find(Long id) {
        return leadRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Lead not found"));
    }
}
