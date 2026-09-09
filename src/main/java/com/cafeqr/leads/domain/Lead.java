package com.cafeqr.leads.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;

/** A café's request to use the platform, captured from the public landing page. */
@Entity
@Table(name = "leads")
public class Lead extends BaseEntity {

    @Column(name = "cafe_name", nullable = false, length = 150)
    private String cafeName;

    @Column(name = "contact_name", nullable = false, length = 150)
    private String contactName;

    @Column(name = "phone", length = 40)
    private String phone;

    @Column(name = "email", length = 150)
    private String email;

    @Column(name = "city", length = 100)
    private String city;

    @Column(name = "note", length = 1000)
    private String note;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private LeadStatus status = LeadStatus.NEW;

    /** What the admin learned on the call — distinct from {@code note}, which the café wrote. */
    @Column(name = "admin_note", length = 1000)
    private String adminNote;

    /** When somebody first reached out. Null while the lead is still untouched. */
    @Column(name = "contacted_at")
    private Instant contactedAt;

    /** The café this lead became; non-null once converted. */
    @Column(name = "restaurant_id")
    private Long restaurantId;

    public String getCafeName() { return cafeName; }
    public void setCafeName(String cafeName) { this.cafeName = cafeName; }

    public String getContactName() { return contactName; }
    public void setContactName(String contactName) { this.contactName = contactName; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public LeadStatus getStatus() { return status; }
    public void setStatus(LeadStatus status) { this.status = status; }

    public String getAdminNote() { return adminNote; }
    public void setAdminNote(String adminNote) { this.adminNote = adminNote; }

    public Instant getContactedAt() { return contactedAt; }
    public void setContactedAt(Instant contactedAt) { this.contactedAt = contactedAt; }

    public Long getRestaurantId() { return restaurantId; }
    public void setRestaurantId(Long restaurantId) { this.restaurantId = restaurantId; }
}
