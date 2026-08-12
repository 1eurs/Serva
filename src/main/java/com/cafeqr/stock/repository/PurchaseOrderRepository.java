package com.cafeqr.stock.repository;

import com.cafeqr.stock.domain.PurchaseOrder;
import com.cafeqr.stock.domain.PurchaseOrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, Long> {

    List<PurchaseOrder> findTop100ByBranchIdOrderByCreatedAtDesc(Long branchId);

    List<PurchaseOrder> findByBranchIdAndStatusInOrderByCreatedAtDesc(
            Long branchId, List<PurchaseOrderStatus> statuses);
}
