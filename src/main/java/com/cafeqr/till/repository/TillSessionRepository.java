package com.cafeqr.till.repository;

import com.cafeqr.till.domain.TillSession;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TillSessionRepository extends JpaRepository<TillSession, Long> {

    /**
     * The branch's open drawer, if it has one. At most one row can match — a partial unique
     * index in V67 makes that the database's rule rather than this method's hope.
     */
    Optional<TillSession> findFirstByBranchIdAndClosedAtIsNull(Long branchId);

    /** Cheaper than loading the row, for the "can this branch sell right now" check on every order. */
    boolean existsByBranchIdAndClosedAtIsNull(Long branchId);

    /** The history list, newest first. */
    List<TillSession> findByBranchIdOrderByOpenedAtDesc(Long branchId, Pageable pageable);
}
