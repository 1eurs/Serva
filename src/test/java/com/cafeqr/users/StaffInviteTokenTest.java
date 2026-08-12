package com.cafeqr.users;

import com.cafeqr.users.domain.StaffInvite;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The token lifecycle, which is the whole security surface of the invite flow: the link in a
 * WhatsApp thread is the only credential, so "still openable" has to be exactly right.
 *
 * <p>Spent, revoked and expired are kept distinguishable on purpose — the join page says something
 * different for each, and collapsing them would leave a member staring at "invalid link" when the
 * truthful answer is "you already joined, just sign in".
 */
class StaffInviteTokenTest {

    private StaffInvite invite(Instant expiresAt) {
        StaffInvite invite = new StaffInvite();
        invite.setUserId(1L);
        invite.setToken("t");
        invite.setExpiresAt(expiresAt);
        return invite;
    }

    private StaffInvite fresh() {
        return invite(Instant.now().plus(7, ChronoUnit.DAYS));
    }

    @Test
    void aFreshInviteIsOpenable() {
        assertThat(fresh().isUsable()).isTrue();
    }

    @Test
    void anAcceptedInviteCannotBeUsedTwice() {
        StaffInvite invite = fresh();
        invite.setAcceptedAt(Instant.now());

        assertThat(invite.isUsable()).isFalse();
        // Already spent is not the same as expired — the join page tells them to just sign in.
        assertThat(invite.isExpired()).isFalse();
    }

    @Test
    void aRevokedInviteIsDead() {
        StaffInvite invite = fresh();
        invite.setRevoked(true);

        assertThat(invite.isUsable()).isFalse();
        assertThat(invite.isExpired()).isFalse();
    }

    @Test
    void anInviteStopsWorkingOnceItsWindowPasses() {
        StaffInvite invite = invite(Instant.now().minusSeconds(1));

        assertThat(invite.isUsable()).isFalse();
        assertThat(invite.isExpired()).isTrue();
    }

    @Test
    void expiryIsExclusiveSoTheBoundaryInstantIsAlreadyPast() {
        StaffInvite invite = invite(Instant.now());

        assertThat(invite.isUsable()).isFalse();
    }

    @Test
    void anAcceptedInviteThatAlsoAgedOutStillReadsAsAccepted() {
        StaffInvite invite = invite(Instant.now().minus(30, ChronoUnit.DAYS));
        invite.setAcceptedAt(Instant.now().minus(29, ChronoUnit.DAYS));

        // Someone who joined a month ago must never be told their invite "expired".
        assertThat(invite.isExpired()).isFalse();
        assertThat(invite.isUsable()).isFalse();
    }
}
