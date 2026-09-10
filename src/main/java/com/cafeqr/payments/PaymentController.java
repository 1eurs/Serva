package com.cafeqr.payments;

import com.cafeqr.common.api.ApiResponse;
import com.cafeqr.payments.dto.MarkPaidRequest;
import com.cafeqr.payments.dto.PaymentResponse;
import com.cafeqr.payments.dto.SplitPaymentRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/payments")
@Tag(name = "Payments")
@PreAuthorize("hasAuthority('PAYMENTS')")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @Operation(summary = "Manually mark an order as paid (cash/card at the cafe; defaults to CARD)")
    @PostMapping("/orders/{orderId}/mark-paid")
    public ApiResponse<PaymentResponse> markPaid(@PathVariable Long orderId,
                                                 @RequestBody(required = false) MarkPaidRequest request) {
        return ApiResponse.ok("Payment marked as paid",
                paymentService.markPaid(orderId, request != null ? request.method() : null));
    }

    @Operation(summary = "Settle one order with several tenders — a bill split between people at the table")
    @PostMapping("/orders/{orderId}/split")
    public ApiResponse<List<PaymentResponse>> settleSplit(@PathVariable Long orderId,
                                                          @RequestBody SplitPaymentRequest request) {
        return ApiResponse.ok("Split payment recorded",
                paymentService.settleSplit(orderId, request.tenders()));
    }

    @Operation(summary = "Manually mark an order payment as failed")
    @PostMapping("/orders/{orderId}/mark-failed")
    public ApiResponse<PaymentResponse> markFailed(@PathVariable Long orderId) {
        return ApiResponse.ok("Payment marked as failed", paymentService.markFailed(orderId));
    }
}
