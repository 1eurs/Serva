package com.cafeqr.audit.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * One platform-admin action. Append-only: nothing in here is ever updated or deleted.
 *
 * <p>{@code actorName} and {@code targetLabel} are snapshots rather than joins on purpose —
 * the log has to read correctly a year later, after the admin has left and the café has been
 * renamed.
 */
@Entity
@Table(name = "admin_audit_log")
public class AuditEntry extends BaseEntity {

    @Column(name = "actor_id")
    private Long actorId;

    @Column(name = "actor_name", length = 150)
    private String actorName;

    @Column(name = "action", nullable = false, length = 60)
    private String action;

    @Column(name = "target_type", length = 40)
    private String targetType;

    @Column(name = "target_id")
    private Long targetId;

    @Column(name = "target_label", length = 200)
    private String targetLabel;

    @Column(name = "detail", length = 1000)
    private String detail;

    public Long getActorId() { return actorId; }
    public void setActorId(Long actorId) { this.actorId = actorId; }

    public String getActorName() { return actorName; }
    public void setActorName(String actorName) { this.actorName = actorName; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }

    public Long getTargetId() { return targetId; }
    public void setTargetId(Long targetId) { this.targetId = targetId; }

    public String getTargetLabel() { return targetLabel; }
    public void setTargetLabel(String targetLabel) { this.targetLabel = targetLabel; }

    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
}
