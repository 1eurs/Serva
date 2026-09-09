package com.cafeqr.audit.repository;

import com.cafeqr.audit.domain.AuditEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditEntryRepository extends JpaRepository<AuditEntry, Long> {

    Page<AuditEntry> findByOrderByIdDesc(Pageable pageable);

    Page<AuditEntry> findByTargetTypeAndTargetIdOrderByIdDesc(String targetType, Long targetId, Pageable pageable);
}
