package com.cafeqr.till;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.till.dto.TillDtos.AddMovementRequest;
import com.cafeqr.till.dto.TillDtos.CloseTillRequest;
import com.cafeqr.till.dto.TillDtos.MovementResponse;
import com.cafeqr.till.dto.TillDtos.OpenTillRequest;
import com.cafeqr.till.dto.TillDtos.TillSessionResponse;
import com.cafeqr.till.dto.TillDtos.TillStateResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The drawer, per shop.
 *
 * <p>Two permissions, on purpose. Reading the state needs ORDERS, because everyone working the
 * board has to know whether the shop is selling — and the service withholds the cash figures
 * from anyone without PAYMENTS, so that answer costs no money. Opening and closing need
 * PAYMENTS: they are a cash count, and an owner grants that one account at a time.
 */
@RestController
@Tag(name = "Till")
public class TillController {

    private final TillService tillService;

    public TillController(TillService tillService) {
        this.tillService = tillService;
    }

    @Operation(summary = "Whether the till is open, and what it has taken")
    @PreAuthorize("hasAuthority('ORDERS')")
    @GetMapping("/api/branches/{branchId}/till")
    public ApiResponse<TillStateResponse> state(@PathVariable Long branchId) {
        return ApiResponse.ok(tillService.state(branchId));
    }

    @Operation(summary = "Open the till with a counted float")
    @PreAuthorize("hasAuthority('PAYMENTS')")
    @PostMapping("/api/branches/{branchId}/till/open")
    public ApiResponse<TillSessionResponse> open(@PathVariable Long branchId,
                                                 @Valid @RequestBody OpenTillRequest request) {
        return ApiResponse.ok("Till open", tillService.open(branchId, request));
    }

    @Operation(summary = "Count the drawer and close the till")
    @PreAuthorize("hasAuthority('PAYMENTS')")
    @PostMapping("/api/branches/{branchId}/till/close")
    public ApiResponse<TillSessionResponse> close(@PathVariable Long branchId,
                                                  @Valid @RequestBody CloseTillRequest request) {
        return ApiResponse.ok("Till closed", tillService.close(branchId, request));
    }

    @Operation(summary = "Record cash taken out of, or added to, the open drawer")
    @PreAuthorize("hasAuthority('PAYMENTS')")
    @PostMapping("/api/branches/{branchId}/till/movements")
    public ApiResponse<MovementResponse> addMovement(@PathVariable Long branchId,
                                                     @Valid @RequestBody AddMovementRequest request) {
        return ApiResponse.ok("Recorded", tillService.addMovement(branchId, request));
    }

    @Operation(summary = "Remove a cash movement while the drawer is still open")
    @PreAuthorize("hasAuthority('PAYMENTS')")
    @DeleteMapping("/api/branches/{branchId}/till/movements/{movementId}")
    public ApiResponse<Void> removeMovement(@PathVariable Long branchId,
                                            @PathVariable Long movementId) {
        tillService.removeMovement(branchId, movementId);
        return ApiResponse.ok("Removed", null);
    }

    @Operation(summary = "Past sessions of this branch's till, newest first")
    @PreAuthorize("hasAuthority('PAYMENTS')")
    @GetMapping("/api/branches/{branchId}/till/sessions")
    public ApiResponse<List<TillSessionResponse>> history(@PathVariable Long branchId) {
        return ApiResponse.ok(tillService.history(branchId));
    }
}
