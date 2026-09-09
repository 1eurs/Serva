package com.cafeqr.orders.print.repository;

import com.cafeqr.orders.print.domain.PrintStation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface PrintStationRepository extends JpaRepository<PrintStation, Long> {

    /** One write per poll, racing nothing: an upsert on (branch, station). */
    @Modifying
    @Query(value = """
            INSERT INTO print_stations (restaurant_id, branch_id, station_id, last_seen_at, created_at, updated_at)
            VALUES (:restaurantId, :branchId, :stationId, now(), now(), now())
            ON CONFLICT (branch_id, station_id) DO UPDATE SET last_seen_at = now(), updated_at = now()
            """, nativeQuery = true)
    void touch(@Param("restaurantId") Long restaurantId, @Param("branchId") Long branchId, @Param("stationId") String stationId);

    long countByBranchIdAndLastSeenAtAfter(Long branchId, Instant after);

    Optional<PrintStation> findFirstByBranchIdOrderByLastSeenAtDesc(Long branchId);
}
