package com.cafeqr.leads;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.leads.dto.CreateLeadRequest;
import com.cafeqr.leads.dto.LeadResponse;
import com.cafeqr.leads.dto.UpdateLeadRequest;
import com.cafeqr.restaurants.dto.CreateRestaurantRequest;
import com.cafeqr.restaurants.dto.RestaurantResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Tag(name = "Leads")
public class LeadController {

    private final LeadService leadService;

    public LeadController(LeadService leadService) {
        this.leadService = leadService;
    }

    @Operation(summary = "Submit a café access / demo request (public)")
    @PostMapping("/api/public/leads")
    public ApiResponse<LeadResponse> submit(@Valid @RequestBody CreateLeadRequest request) {
        return ApiResponse.ok("Request received", leadService.create(request));
    }

    @Operation(summary = "List café access requests (platform admin)")
    @PreAuthorize("hasAuthority('PLATFORM_ADMIN')")
    @GetMapping("/api/admin/leads")
    public ApiResponse<List<LeadResponse>> list() {
        return ApiResponse.ok(leadService.list());
    }

    @Operation(summary = "Move a lead along the pipeline / file call notes (platform admin)")
    @PreAuthorize("hasAuthority('PLATFORM_ADMIN')")
    @PatchMapping("/api/admin/leads/{id}")
    public ApiResponse<LeadResponse> update(@PathVariable Long id,
                                            @Valid @RequestBody UpdateLeadRequest request) {
        return ApiResponse.ok("Lead updated", leadService.update(id, request));
    }

    @Operation(summary = "Provision the café this lead asked for and close the lead (platform admin)")
    @PreAuthorize("hasAuthority('PLATFORM_ADMIN')")
    @PostMapping("/api/admin/leads/{id}/convert")
    public ApiResponse<RestaurantResponse> convert(@PathVariable Long id,
                                                   @Valid @RequestBody CreateRestaurantRequest request) {
        return ApiResponse.ok("Café created", leadService.convert(id, request));
    }
}
