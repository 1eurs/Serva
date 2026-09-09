package com.cafeqr.orders.print.domain;

import com.cafeqr.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;

/** One device that has pulled this branch's print jobs, and when it last did. */
@Entity
@Table(name = "print_stations")
public class PrintStation extends BaseEntity {

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    /** Random, minted once per device in the browser — an identity, not a secret. */
    @Column(name = "station_id", nullable = false, length = 64)
    private String stationId;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    public Long getRestaurantId() { return restaurantId; }
    public void setRestaurantId(Long restaurantId) { this.restaurantId = restaurantId; }
    public Long getBranchId() { return branchId; }
    public void setBranchId(Long branchId) { this.branchId = branchId; }
    public String getStationId() { return stationId; }
    public void setStationId(String stationId) { this.stationId = stationId; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }
}
