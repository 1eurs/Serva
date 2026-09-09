package com.cafeqr.orders.realtime;

import com.cafeqr.users.event.StaffAccessChangedEvent;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A stream is the one thing in the app that is authorised once and then keeps talking.
 *
 * <p>Every ordinary request re-reads the account row, so switching someone off takes effect on
 * their next click. An open order stream had no next click: it was checked when it opened and
 * then fed live orders for up to six hours, which meant a tablet held by someone who had just
 * been walked off the floor kept showing the board. So the stream has to be closable by account,
 * and closing one must not disturb anybody else's.
 */
class OrderStreamServiceTest {

    private static final String BOARD = OrderStreamService.branchChannel(1L);
    private static final String OTHER_BOARD = OrderStreamService.branchChannel(2L);

    private final OrderStreamService streams = new OrderStreamService();

    @Test
    void switchingAMemberOffClosesTheStreamTheyLeftOpen() {
        streams.subscribe(BOARD, 42L);
        assertThat(streams.hasSubscribers(BOARD)).isTrue();

        streams.onStaffAccessChanged(new StaffAccessChangedEvent(42L));

        assertThat(streams.hasSubscribers(BOARD)).isFalse();
    }

    /** The rest of the shift keeps working — one account's streams, not the channel's. */
    @Test
    void everybodyElseKeepsWatching() {
        streams.subscribe(BOARD, 42L);
        streams.subscribe(BOARD, 43L);
        streams.subscribe(OTHER_BOARD, 44L);

        streams.onStaffAccessChanged(new StaffAccessChangedEvent(42L));

        assertThat(streams.hasSubscribers(BOARD)).isTrue();
        assertThat(streams.hasSubscribers(OTHER_BOARD)).isTrue();
    }

    /** A member watching two boards at once — a phone and the counter tablet — loses both. */
    @Test
    void everyStreamThatAccountHasOpenGoes() {
        streams.subscribe(BOARD, 42L);
        streams.subscribe(OTHER_BOARD, 42L);

        streams.onStaffAccessChanged(new StaffAccessChangedEvent(42L));

        assertThat(streams.hasSubscribers(BOARD)).isFalse();
        assertThat(streams.hasSubscribers(OTHER_BOARD)).isFalse();
    }

    /**
     * A customer watching their own order signs in to nothing, so there is no account behind
     * their stream and no id that could ever match one.
     */
    @Test
    void aCustomersOrderStreamBelongsToNobodyAndSurvives() {
        streams.subscribe(OrderStreamService.orderChannel("tracking-token"));

        streams.onStaffAccessChanged(new StaffAccessChangedEvent(42L));
        streams.disconnectStaff(null);

        assertThat(streams.hasSubscribers(OrderStreamService.orderChannel("tracking-token"))).isTrue();
    }
}
