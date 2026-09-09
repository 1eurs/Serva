package com.cafeqr.plans;

import com.cafeqr.audit.AuditService;
import com.cafeqr.audit.domain.AuditAction;
import com.cafeqr.plans.domain.Feature;
import com.cafeqr.plans.domain.PlanFeature;
import com.cafeqr.plans.dto.PlanFeatureMatrix;
import com.cafeqr.plans.repository.PlanFeatureRepository;
import com.cafeqr.restaurants.domain.Plan;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

/**
 * What each tier includes.
 *
 * <p>Every gated request asks this, so the grid is held in memory rather than read per call —
 * it is eighteen booleans that change when a platform admin edits the Plans page and never
 * otherwise. The cache is rebuilt when a change <em>commits</em>, so a request arriving straight
 * after the edit sees the new answer and a transaction that rolls back leaves nothing behind.
 *
 * <p>A feature with no row is treated as not included. That only happens for a value added to
 * {@link Feature} whose migration has not run yet, and refusing is the safe direction: a café
 * being told to upgrade for something it should have is a support call, while silently handing
 * out a paid feature is revenue nobody notices leaving.
 */
@Service
public class PlanFeatureService {

    private final PlanFeatureRepository repository;
    private final AuditService audit;

    /** Rebuilt on every write; read without locking, so the reference is swapped, never mutated. */
    private volatile Map<Plan, EnumSet<Feature>> grid = new EnumMap<>(Plan.class);

    public PlanFeatureService(PlanFeatureRepository repository, AuditService audit) {
        this.repository = repository;
        this.audit = audit;
        reload();
    }

    /** True if this tier includes the feature. */
    public boolean includes(Plan tier, Feature feature) {
        return includedFor(tier).contains(feature);
    }

    /**
     * Everything this tier includes, as a copy.
     *
     * <p>A copy because the map behind it is shared by every request and swapped rather than
     * mutated — handing out the live set would let one caller's edit become everybody's answer.
     */
    public EnumSet<Feature> includedFor(Plan tier) {
        EnumSet<Feature> included = tier == null ? null : grid.get(tier);
        return included == null ? EnumSet.noneOf(Feature.class) : EnumSet.copyOf(included);
    }

    @Transactional(readOnly = true)
    public PlanFeatureMatrix matrix() {
        return PlanFeatureMatrix.of(repository.findAll());
    }

    /**
     * Turn one feature on or off for one tier.
     *
     * <p>Audited, because this is a pricing decision: it changes what every café on that tier
     * can open, at once, with no other trace that anything happened.
     */
    @Transactional
    public PlanFeatureMatrix set(Plan tier, Feature feature, boolean enabled) {
        PlanFeature row = repository.findByTierAndFeature(tier, feature)
                .orElseGet(() -> new PlanFeature(tier, feature, enabled));
        boolean before = row.isEnabled();
        row.setEnabled(enabled);
        repository.save(row);
        if (before != enabled) {
            audit.record(AuditAction.PLAN_FEATURES_CHANGED, "PLAN", null, tier.name(),
                    feature + ": " + (before ? "on" : "off") + " → " + (enabled ? "on" : "off"));
        }
        reloadOnCommit();
        // Built from the transaction's own view, so the response shows the edit even though the
        // cache behind it does not move until this commits.
        return matrix();
    }

    /**
     * Refresh the cache once this transaction commits — never before it.
     *
     * <p>Rebuilding inline would publish a change that the audit write, a constraint, or any
     * later failure in the same transaction could still roll back, and the grid would then be
     * granting a paid feature that no row in the database supports until the next successful
     * write or a restart. Committing first costs nothing: the request that made the edit reads
     * its own transaction, and the next one reads a cache that matches the table.
     */
    private void reloadOnCommit() {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            reload();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                reload();
            }
        });
    }

    private void reload() {
        Map<Plan, EnumSet<Feature>> next = new EnumMap<>(Plan.class);
        for (Plan tier : Plan.values()) {
            next.put(tier, EnumSet.noneOf(Feature.class));
        }
        List<PlanFeature> rows = repository.findAll();
        for (PlanFeature row : rows) {
            if (row.isEnabled()) {
                next.get(row.getTier()).add(row.getFeature());
            }
        }
        grid = next;
    }
}
