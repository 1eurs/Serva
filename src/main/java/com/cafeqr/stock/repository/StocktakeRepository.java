package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.Stocktake;
import com.cafeqr.stock.domain.StocktakeStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StocktakeRepository extends JpaRepository<Stocktake, Long> {

    List<Stocktake> findTop50ByBranchIdOrderByCreatedAtDesc(Long branchId);

    /** At most one count may be open per branch — the UI resumes it rather than starting a second. */
    Optional<Stocktake> findFirstByBranchIdAndStatus(Long branchId, StocktakeStatus status);

    List<Stocktake> findTop12ByBranchIdAndStatusOrderByClosedAtDesc(Long branchId, StocktakeStatus status);
}
