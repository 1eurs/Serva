package com.cafeqr.audit;

import com.cafeqr.audit.dto.AuditEntryResponse;
import com.cafeqr.common.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/audit")
@Tag(name = "Audit log (admin)")
@PreAuthorize("hasAuthority('PLATFORM_ADMIN')")
public class AuditController {

    private final AuditService auditService;

    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    @Operation(summary = "Recent platform-admin actions, newest first")
    @GetMapping
    public ApiResponse<List<AuditEntryResponse>> recent(
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) Long targetId) {
        return ApiResponse.ok(targetType != null && targetId != null
                ? auditService.forTarget(targetType, targetId, limit)
                : auditService.recent(limit));
    }
}
