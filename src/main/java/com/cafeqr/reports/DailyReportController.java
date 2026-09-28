package com.cafeqr.reports;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * The one-page daily report as a PDF download. Money figures (payment split, till reconciliation)
 * are included only for a reader with the Payments permission — the rest of the page stands
 * without them, so ANALYTICS alone is enough to pull the report.
 */
@RestController
@RequestMapping("/api/dashboard/reports")
@Tag(name = "Reports")
@PreAuthorize("hasAuthority('ANALYTICS')")
public class DailyReportController {

    private final DailyReportService dailyReportService;

    public DailyReportController(DailyReportService dailyReportService) {
        this.dailyReportService = dailyReportService;
    }

    @Operation(summary = "One-page daily report (PDF)")
    @GetMapping(value = "/daily", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> daily(
            @RequestParam(required = false) Long branchId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        byte[] pdf = dailyReportService.pdf(branchId, date);
        String filename = "serva-daily-" + dailyReportService.effectiveDate(date) + ".pdf";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename).build().toString())
                .body(pdf);
    }
}
