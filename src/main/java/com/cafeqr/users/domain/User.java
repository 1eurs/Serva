package com.cafeqr.users.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;

@Entity
@Table(name = "users")
public class User extends BaseEntity {

    @Column(name = "full_name", nullable = false)
    private String fullName;

    /** Login identifier. Required and unique (case-insensitive). */
    @Column(name = "username", nullable = false, length = 60)
    private String username;

    /** Optional — only owner/admin accounts need one (email-based password reset). */
    @Column(name = "email")
    private String email;

    @Column(name = "phone")
    private String phone;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    /** Marks the restaurant's primary/billing account (created at onboarding). */
    @Column(name = "owner", nullable = false)
    private boolean owner = false;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "user_permissions",
            joinColumns = @JoinColumn(name = "user_id",
                    foreignKey = @ForeignKey(name = "fk_user_permissions_user")))
    @Enumerated(EnumType.STRING)
    @Column(name = "permission", nullable = false, length = 40)
    private Set<Permission> permissions = EnumSet.noneOf(Permission.class);

    /** Tenant scoping. Null for platform admins ({@link Permission#PLATFORM_ADMIN}). */
    @Column(name = "restaurant_id")
    private Long restaurantId;

    /** Branch scoping for branch-level staff. */
    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    /**
     * When this member was invited, or null once they have accepted (or if they were created the
     * old way with a password handed over). Distinguishes a <em>pending</em> account from a
     * <em>deactivated</em> one — both are {@code active = false}, but they mean opposite things
     * to whoever is looking at the team list.
     */
    @Column(name = "invited_at")
    private Instant invitedAt;

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public boolean isOwner() {
        return owner;
    }

    public void setOwner(boolean owner) {
        this.owner = owner;
    }

    public Set<Permission> getPermissions() {
        return permissions;
    }

    public void setPermissions(Set<Permission> permissions) {
        this.permissions = (permissions == null || permissions.isEmpty())
                ? EnumSet.noneOf(Permission.class)
                : EnumSet.copyOf(permissions);
    }

    public boolean hasPermission(Permission permission) {
        return permissions.contains(permission);
    }

    public Long getRestaurantId() {
        return restaurantId;
    }

    public void setRestaurantId(Long restaurantId) {
        this.restaurantId = restaurantId;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    /** True while the invite is outstanding: the shell exists but nobody has claimed it. */
    public boolean isPendingInvite() {
        return invitedAt != null && !active;
    }

    public Instant getInvitedAt() {
        return invitedAt;
    }

    public void setInvitedAt(Instant invitedAt) {
        this.invitedAt = invitedAt;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
