package com.cafeqr.otp;

import com.cafeqr.otp.repository.OtpCodeRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Against a real Postgres, because the point of moving OTPs off the heap is that they
 * survive a restart and are visible to every instance — neither of which a mock would show.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(OtpStore.class)
@ActiveProfiles("test")
@Testcontainers
class OtpStoreTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("cafeqr")
            .withUsername("cafeqr")
            .withPassword("cafeqr");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private OtpStore store;

    @Autowired
    private OtpCodeRepository repository;

    @Test
    void storesAndVerifiesACode() {
        store.put("96890000001", "123456");

        assertThat(store.peek("96890000001")).isEqualTo("123456");
        assertThat(store.verify("96890000001", "123456")).isTrue();
    }

    @Test
    void aVerifiedCodeIsConsumed() {
        store.put("96890000002", "123456");
        assertThat(store.verify("96890000002", "123456")).isTrue();

        // Replaying the same code must not work a second time.
        assertThat(store.verify("96890000002", "123456")).isFalse();
        assertThat(store.peek("96890000002")).isNull();
    }

    @Test
    void requestingANewCodeInvalidatesTheOldOne() {
        store.put("96890000003", "111111");
        store.put("96890000003", "222222");

        assertThat(store.verify("96890000003", "111111")).isFalse();
        // The failed attempt above must not have burned the live code.
        assertThat(store.verify("96890000003", "222222")).isTrue();
    }

    /**
     * A wrong guess counts against the ceiling but must not delete the entry — otherwise
     * anyone who can guess a phone number can knock out a real customer's code by typing one
     * wrong digit, turning the throttle into a denial-of-service.
     */
    @Test
    void wrongGuessesAreCountedAndCappedWithoutDroppingTheCode() {
        store.put("96890000004", "123456");

        for (int i = 0; i < 4; i++) {
            assertThat(store.verify("96890000004", "000000")).isFalse();
        }
        assertThat(store.peek("96890000004")).isEqualTo("123456");
        assertThat(store.verify("96890000004", "123456")).isTrue();
    }

    @Test
    void theCodeIsRefusedAfterTooManyWrongGuesses() {
        store.put("96890000005", "123456");

        for (int i = 0; i < 5; i++) {
            assertThat(store.verify("96890000005", "000000")).isFalse();
        }
        // Correct code, but the ceiling has been reached: still refused, and now cleared.
        assertThat(store.verify("96890000005", "123456")).isFalse();
        assertThat(store.peek("96890000005")).isNull();
    }

    @Test
    void anExpiredCodeIsNeitherReadableNorVerifiable() {
        store.put("96890000006", "123456");
        expire("96890000006");

        assertThat(store.peek("96890000006")).isNull();
        assertThat(store.verify("96890000006", "123456")).isFalse();
    }

    @Test
    void theSweepClearsOnlyExpiredCodes() {
        store.put("96890000007", "123456");
        store.put("96890000008", "654321");
        expire("96890000007");

        store.evictExpired();

        assertThat(repository.findByPhone("96890000007")).isEmpty();
        assertThat(repository.findByPhone("96890000008")).isPresent();
    }

    /** Backdates a code's expiry so expiry can be tested without sleeping for five minutes. */
    private void expire(String phone) {
        repository.findByPhone(phone).ifPresent(entry -> {
            entry.setExpiresAt(Instant.now().minusSeconds(1));
            repository.save(entry);
        });
    }
}
