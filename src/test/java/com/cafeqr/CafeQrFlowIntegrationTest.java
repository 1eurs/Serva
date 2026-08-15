package com.cafeqr;

import com.cafeqr.otp.OtpService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end MVP flow against a real PostgreSQL (Testcontainers). Also acts as the schema
 * contract test: the context only starts if Flyway migrations and Hibernate {@code validate} agree.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
class CafeQrFlowIntegrationTest {

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
    private MockMvc mockMvc;

    @Autowired
    private OtpService otpService;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * Registered once for the whole class rather than per test.
     * {@code /api/auth/register-platform-admin} only succeeds while no admin exists, and both
     * tests share a single Testcontainers database, so registering per test made whichever
     * test ran second fail with 409.
     */
    private static String adminToken;

    @BeforeEach
    void ensurePlatformAdmin() throws Exception {
        if (adminToken != null) {
            return;
        }
        adminToken = read(post("/api/auth/register-platform-admin", Map.of(
                "fullName", "Admin", "email", "admin@cafeqr.test", "password", "Admin123!")),
                "$.data.accessToken");
    }

    @Test
    void fullOrderingFlowWithTenantIsolation() throws Exception {
        // 1. Platform admin is registered by ensurePlatformAdmin().

        // 2. Admin creates a restaurant.
        MvcResult restaurantResult = perform(authed(post("/api/admin/restaurants", Map.of(
                "name", "Demo Cafe", "vatEnabled", true, "vatRate", 5)), adminToken))
                .andExpect(status().isOk())
                .andReturn();
        Number restaurantId = json(restaurantResult, "$.data.id");
        String slug = json(restaurantResult, "$.data.slug");

        // 3. Admin creates the restaurant owner. There are no fixed roles any more — the
        //    creator picks a username and toggles exactly which permissions the account gets
        //    (Permission.ownerSet() is the equivalent of the old RESTAURANT_OWNER role).
        perform(authed(post("/api/users", Map.of(
                "username", "owner@cafeqr.test", "password", "Owner123!",
                "fullName", "Owner", "email", "owner@cafeqr.test",
                "permissions", List.of("ORDERS", "PAYMENTS", "MENU", "QR_TABLES", "TEAM",
                        "ANALYTICS", "PROFILE", "BRANCHES", "STOCK"),
                "restaurantId", restaurantId)), adminToken))
                .andExpect(status().isOk());

        // 4. Owner logs in. Login identifies by username, not email.
        String ownerToken = read(post("/api/auth/login", Map.of(
                "username", "owner@cafeqr.test", "password", "Owner123!")), "$.data.accessToken");

        // 5. Owner creates a branch.
        Number branchId = json(perform(authed(post(
                "/api/restaurants/" + restaurantId + "/branches", Map.of("name", "Main Branch")), ownerToken))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        // 6. Owner creates a table (QR).
        MvcResult tableResult = perform(authed(post(
                "/api/branches/" + branchId + "/tables", Map.of("tableNumber", "T1")), ownerToken))
                .andExpect(status().isOk()).andReturn();
        Number tableId = json(tableResult, "$.data.id");
        String tableToken = json(tableResult, "$.data.qrCodeToken");

        // 7. Owner creates a category.
        Number categoryId = json(perform(authed(post("/api/menu/categories", Map.of(
                "nameEn", "Coffee", "nameAr", "قهوة")), ownerToken))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        // 8. Owner creates a menu item priced 1.500 OMR.
        Number itemId = json(perform(authed(post("/api/menu/items", Map.of(
                "categoryId", categoryId, "nameEn", "Latte", "nameAr", "لاتيه", "price", 1.500)), ownerToken))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        // 9. Customer loads the public menu by scanning the QR token.
        perform(get("/api/public/qr/" + tableToken + "/menu"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.categories[0].items[0].nameEn").value("Latte"));

        // 10. Customer verifies phone, then places a dine-in order.
        String customerPhone = "96890000001";
        otpService.send(customerPhone);
        String otpCode = otpService.pendingCode(customerPhone);
        assertThat(otpCode).isNotBlank();
        String phoneToken = otpService.verifyAndIssueToken(customerPhone, otpCode);

        MvcResult orderResult = perform(post("/api/public/orders", Map.of(
                "restaurantSlug", slug, "branchId", branchId, "tableToken", tableToken,
                "orderType", "DINE_IN", "customerName", "Sara", "customerPhone", customerPhone,
                "phoneToken", phoneToken,
                "items", new Object[]{Map.of("menuItemId", itemId, "quantity", 1)})))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andReturn();
        String trackingToken = json(orderResult, "$.data.trackingToken");
        assertThat(new BigDecimal(String.valueOf((Object) json(orderResult, "$.data.total"))))
                .isEqualByComparingTo("1.575"); // 1.500 + 5% VAT

        // 11. Dashboard sees the order; grab its id.
        Number orderId = json(perform(authed(get("/api/dashboard/orders"), ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].status").value("PENDING"))
                .andReturn(), "$.data.content[0].id");

        // 12-14. Owner walks the order through the lifecycle.
        perform(authed(patch("/api/dashboard/orders/" + orderId + "/accept", Map.of("prepTimeMinutes", 10)), ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"));
        perform(authed(patch("/api/dashboard/orders/" + orderId + "/ready", null), ownerToken))
                .andExpect(jsonPath("$.data.status").value("READY"));
        perform(authed(patch("/api/dashboard/orders/" + orderId + "/complete", null), ownerToken))
                .andExpect(jsonPath("$.data.status").value("COMPLETED"));

        // 15. Customer tracking shows the final status.
        perform(get("/api/public/orders/" + trackingToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"));

        // 16. The table can be deleted without deleting historical orders.
        perform(authed(delete("/api/tables/" + tableId), ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
        perform(authed(get("/api/dashboard/orders/" + orderId), ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tableId").doesNotExist());

        // --- Tenant isolation: a second restaurant's owner cannot read the first order ---
        Number restaurantId2 = json(perform(authed(post("/api/admin/restaurants",
                Map.of("name", "Other Cafe")), adminToken)).andReturn(), "$.data.id");
        perform(authed(post("/api/users", Map.of(
                "username", "owner2@cafeqr.test", "password", "Owner123!",
                "fullName", "Owner2", "email", "owner2@cafeqr.test",
                "permissions", List.of("ORDERS", "PAYMENTS", "MENU", "QR_TABLES", "TEAM",
                        "ANALYTICS", "PROFILE", "BRANCHES", "STOCK"),
                "restaurantId", restaurantId2)), adminToken))
                .andExpect(status().isOk());
        String owner2Token = read(post("/api/auth/login", Map.of(
                "username", "owner2@cafeqr.test", "password", "Owner123!")), "$.data.accessToken");

        perform(authed(get("/api/dashboard/orders/" + orderId), owner2Token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false));

        // --- JWT auth: protected endpoints reject anonymous access ---
        perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        perform(get("/api/dashboard/orders")).andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsInvalidStatusTransitionViaApi() throws Exception {
        // Platform admin comes from ensurePlatformAdmin() — registering a second one here
        // always returned 409, since only the first registration can ever succeed.
        // No order exists with id 999999 -> 404 (sanity that the dashboard is wired & secured).
        perform(authed(patch("/api/dashboard/orders/999999/accept", null), adminToken))
                .andExpect(status().isNotFound());
    }

    // ----------------------------------------------------------------- helpers

    private org.springframework.test.web.servlet.ResultActions perform(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder) throws Exception {
        return mockMvc.perform(builder);
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder post(String url, Object body) {
        var builder = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url)
                .contentType(MediaType.APPLICATION_JSON);
        return body != null ? builder.content(writeJson(body)) : builder;
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder patch(String url, Object body) {
        var builder = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(url)
                .contentType(MediaType.APPLICATION_JSON);
        return body != null ? builder.content(writeJson(body)) : builder;
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder delete(String url) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(url);
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder authed(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder, String token) {
        return builder.header("Authorization", "Bearer " + token);
    }

    private String read(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder,
                        String path) throws Exception {
        return json(mockMvc.perform(builder).andExpect(status().isOk()).andReturn(), path);
    }

    @SuppressWarnings("unchecked")
    private <T> T json(MvcResult result, String path) throws Exception {
        return (T) JsonPath.read(result.getResponse().getContentAsString(), path);
    }

    private String writeJson(Object body) {
        try {
            return objectMapper.writeValueAsString(body);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
