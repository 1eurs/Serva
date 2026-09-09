package com.cafeqr.orders;

import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ErrorCode;
import com.cafeqr.orders.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CounterModeSweepJobTest {

    @Mock private OrderRepository orderRepository;
    @Mock private OrderService orderService;

    @Test
    void completesEveryHandedOverOrderThatSatLongEnough() {
        CounterModeSweepJob job = new CounterModeSweepJob(orderRepository, orderService, 10);
        Instant now = Instant.parse("2026-09-05T10:00:00Z");
        when(orderRepository.findCounterModeHandedOver(now.minus(Duration.ofMinutes(10)))).thenReturn(List.of(7L, 8L));

        int done = job.sweep(now);

        assertThat(done).isEqualTo(2);
        verify(orderService).completeUnattended(7L);
        verify(orderService).completeUnattended(8L);
    }

    @Test
    void oneStuckOrderDoesNotHoldBackTheRest() {
        CounterModeSweepJob job = new CounterModeSweepJob(orderRepository, orderService, 10);
        when(orderRepository.findCounterModeHandedOver(any())).thenReturn(List.of(7L, 8L));
        when(orderService.completeUnattended(7L))
                .thenThrow(new BadRequestException(ErrorCode.INVALID_ORDER_STATUS_TRANSITION, "raced"));

        int done = job.sweep(Instant.now());

        assertThat(done).isEqualTo(1);
        verify(orderService).completeUnattended(8L);
    }
}
