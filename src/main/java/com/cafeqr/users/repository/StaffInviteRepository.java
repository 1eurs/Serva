package com.cafeqr.users.repository;

import com.cafeqr.users.domain.StaffInvite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StaffInviteRepository extends JpaRepository<StaffInvite, Long> {

    Optional<StaffInvite> findByToken(String token);

    Optional<StaffInvite> findFirstByUserIdOrderByCreatedAtDesc(Long userId);

    /** Every still-openable invite for a café, newest first — the pending list on the team page. */
    @Query("""
            select i from StaffInvite i
            where i.userId in (select u.id from User u where u.restaurantId = :restaurantId)
              and i.acceptedAt is null and i.revoked = false
            order by i.createdAt desc
            """)
    List<StaffInvite> pendingForRestaurant(@Param("restaurantId") Long restaurantId);

    /** Burns any outstanding invite for a user — used before issuing a fresh one on resend. */
    @Modifying
    @Query("update StaffInvite i set i.revoked = true "
            + "where i.userId = :userId and i.acceptedAt is null and i.revoked = false")
    void revokeAllForUser(@Param("userId") Long userId);
}
