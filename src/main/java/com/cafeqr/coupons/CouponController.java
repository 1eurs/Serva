package com.cafeqr.coupons;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.coupons.dto.CouponRequest;
import com.cafeqr.coupons.dto.CouponResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The café's discount codes.
 *
 * <p>Two audiences, two authorities: making a coupon is the owner's (PROFILE), typing one on an
 * order is the counter's (ORDERS). The lookup is deliberately the only thing a till account can
 * reach here — a barista can spend a code the owner made, and cannot make one.
 */
@RestController
@RequestMapping("/api/coupons")
@PreAuthorize("hasAuthority('PROFILE')")
@Tag(name = "Coupons")
public class CouponController {

    private final CouponService couponService;

    public CouponController(CouponService couponService) {
        this.couponService = couponService;
    }

    @Operation(summary = "The café's coupons")
    @GetMapping
    public ApiResponse<List<CouponResponse>> list() {
        return ApiResponse.ok(couponService.list());
    }

    @Operation(summary = "A fresh unused coupon code to offer on the New coupon button")
    @GetMapping("/suggest")
    public ApiResponse<String> suggest(@RequestParam(required = false) String prefix) {
        return ApiResponse.ok(couponService.suggestCode(prefix));
    }

    @Operation(summary = "Create a coupon")
    @PostMapping
    public ApiResponse<CouponResponse> create(@Valid @RequestBody CouponRequest request) {
        return ApiResponse.ok("Coupon created", couponService.create(request));
    }

    @Operation(summary = "Update a coupon")
    @PatchMapping("/{id}")
    public ApiResponse<CouponResponse> update(@PathVariable Long id, @Valid @RequestBody CouponRequest request) {
        return ApiResponse.ok("Coupon saved", couponService.update(id, request));
    }

    @Operation(summary = "Delete a coupon")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        couponService.delete(id);
        return ApiResponse.ok("Coupon deleted", null);
    }

    /** The counter's half: what this code takes off, so the pad can show it before sending. */
    @Operation(summary = "Look up a coupon by the code typed on the order pad")
    @GetMapping("/lookup")
    @PreAuthorize("hasAuthority('ORDERS')")
    public ApiResponse<CouponResponse> lookup(@RequestParam String code) {
        return ApiResponse.ok(couponService.lookup(code));
    }
}
