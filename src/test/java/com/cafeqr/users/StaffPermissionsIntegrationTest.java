package com.cafeqr.users;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The staff access model, exercised over real HTTP against a real database.
 *
 * <p>Adding a member is the most permission-dense thing an owner ever does — which areas the
 * member may open, which branch they belong to, and who may hand out what — and each of those
 * rules lives in a different layer: {@code @PreAuthorize} on the controller, {@code grantable()}
 * in {@link UserManagementService}, {@link com.cafeqr.auth.security.AccessGuard} on the data. A
 * unit test of any one layer passes happily while the combination still lets a cashier open the
 * till, so the checks here go through the API the dashboard actually calls.
 *
 * <p>Every assertion is phrased as a sentence about a person — "a cashier cannot open the menu
 * editor", "a branch manager cannot reach the other branch's staff" — because that is the form in
 * which these rules are wrong or right to the owner who configured them.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
class StaffPermissionsIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("cafeqr")
            .withUsername("cafeqr")
            .withPassword("cafeqr");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        // This suite signs in as a couple of dozen accounts from one address. The login throttle
        // (10/min/IP) would start answering 429 partway through, and those failures would read as
        // permission bugs.
        registry.add("app.rate-limit.enabled", () -> false);
    }

    private static final String PASSWORD = "Staff123!";

    /** Usernames are globally unique, so every account this suite creates gets its own suffix. */
    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    // The fixture is a café with two branches and a second café next door. Built once for the
    // class; the tests never mutate it — anything a test wants to deactivate, rename or delete it
    // creates for itself, so the methods can run in any order.
    private static String adminToken;
    private static String ownerToken;
    private static String neighbourToken;
    private static Number cafe;
    private static Number neighbourCafe;
    private static Number mainBranch;
    private static Number secondBranch;
    private static Number ownerUserId;

    @BeforeEach
    void fixture() throws Exception {
        if (adminToken != null) {
            return;
        }
        adminToken = accessToken(send(post("/api/auth/register-platform-admin"), null, map(
                "fullName", "Platform Admin", "email", "admin@perm.test", "password", "Admin123!")));

        // PRO, because a second branch is a Pro feature and the branch axis is half of what this
        // suite is about.
        cafe = json(send(post("/api/admin/restaurants"), adminToken, map(
                "nameEn", "Permissions Cafe", "nameAr", "مقهى الصلاحيات",
                "plan", "PRO", "defaultBranchName", "Main",
                "owner", map("fullNameEn", "Cafe Owner", "email", "owner@perm.test",
                        "password", "Owner123!")))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        ownerToken = login("owner@perm.test", "Owner123!");
        mainBranch = json(send(get("/api/restaurants/" + cafe + "/branches"), ownerToken, null)
                .andExpect(status().isOk()).andReturn(), "$.data[0].id");
        secondBranch = json(send(post("/api/restaurants/" + cafe + "/branches"), ownerToken,
                map("nameEn", "Second", "nameAr", "الفرع الثاني"))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        ownerUserId = json(send(get("/api/users"), ownerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].owner").value(true))
                .andReturn(), "$.data[0].id");

        neighbourCafe = json(send(post("/api/admin/restaurants"), adminToken, map(
                "nameEn", "Neighbour Cafe", "defaultBranchName", "Neighbour Main",
                "owner", map("fullNameEn", "Neighbour Owner", "email", "neighbour@perm.test",
                        "password", "Owner123!")))
                .andExpect(status().isOk()).andReturn(), "$.data.id");
        neighbourToken = login("neighbour@perm.test", "Owner123!");
    }

    // ============================================================ what each permission opens

    /**
     * A cashier holds ORDERS and PAYMENTS and nothing else. Every other area has to answer 403 —
     * this is the check that catches a new controller shipped without a {@code @PreAuthorize}.
     */
    @Test
    void aCashierCanWorkTheTillAndNothingElse() throws Exception {
        String cashier = staffToken(ownerToken, name("cashier"), List.of("ORDERS", "PAYMENTS"), null);

        send(get("/api/dashboard/orders"), cashier, null).andExpect(status().isOk());

        forbidden(get("/api/menu/categories"), cashier);                       // MENU
        forbidden(get("/api/users"), cashier);                                 // TEAM
        forbidden(get("/api/users/invites"), cashier);                         // TEAM
        forbidden(get("/api/dashboard/analytics/today"), cashier);             // ANALYTICS
        forbidden(get("/api/dashboard/stock/overview"), cashier);              // STOCK
        forbidden(get("/api/branches/" + mainBranch + "/tables"), cashier);    // QR_TABLES
        forbidden(patch("/api/restaurants/" + cafe), cashier);                 // PROFILE
        forbidden(post("/api/restaurants/" + cafe + "/branches"), cashier);    // BRANCHES
        forbidden(get("/api/admin/restaurants"), cashier);                     // PLATFORM_ADMIN
    }

    /**
     * The whole grid, asserted rather than described. For each permission in turn: a member who
     * holds only it can open the area it is for, and is refused every one of the other eight.
     *
     * <p>Nine tests, eighty-one answers. Written as a matrix because the failure it is here to
     * catch is never "ORDERS stopped working" — it is one cell, in the direction nobody checks,
     * on the day somebody widens a guard to unblock themselves.
     */
    @ParameterizedTest(name = "{0} opens its own area and nothing else")
    @MethodSource("areas")
    void eachPermissionOpensExactlyItsOwnArea(Area area) throws Exception {
        String token = staffToken(ownerToken, name(area.permission().toLowerCase()),
                List.of(area.permission()), null);

        // Anything but a refusal counts as opened: PAYMENTS is probed with an order id that does
        // not exist, and its 404 is the guard having let the call through to look.
        assertThat(statusFor(area, token))
                .describedAs("%s should open %s %s", area.permission(), area.method(), area.path())
                .isNotEqualTo(403);

        for (Area other : areas()) {
            if (other.permission().equals(area.permission())) {
                continue;
            }
            assertThat(statusFor(other, token))
                    .describedAs("a member with only %s must not open %s %s (needs %s)",
                            area.permission(), other.method(), other.path(), other.permission())
                    .isEqualTo(403);
        }
    }

    /** An account can hold nothing at all. It signs in, and then it is a wall in every direction. */
    @Test
    void aMemberWithNoPermissionsCanSignInAndReachNothing() throws Exception {
        String nobody = staffToken(ownerToken, name("nobody"), List.of(), null);

        send(get("/api/auth/me"), nobody, null).andExpect(status().isOk());
        for (Area area : areas()) {
            assertThat(statusFor(area, nobody))
                    .describedAs("%s %s", area.method(), area.path())
                    .isEqualTo(403);
        }
    }

    /** The mirror image: someone hired to keep the menu tidy cannot touch live orders. */
    @Test
    void aMenuEditorCannotTouchLiveOrders() throws Exception {
        String editor = staffToken(ownerToken, name("menu"), List.of("MENU"), null);

        send(get("/api/menu/categories"), editor, null).andExpect(status().isOk());

        forbidden(get("/api/dashboard/orders"), editor);
        forbidden(get("/api/dashboard/orders/live"), editor);
        forbidden(post("/api/payments/orders/1/mark-paid"), editor);
        forbidden(get("/api/users"), editor);
    }

    /** No token at all is 401, not 403 — the frontend routes the two differently. */
    @Test
    void anonymousCallersAreUnauthorisedRatherThanForbidden() throws Exception {
        send(get("/api/users"), null, null).andExpect(status().isUnauthorized());
        send(post("/api/users/invites"), null, null).andExpect(status().isUnauthorized());
        send(get("/api/dashboard/orders"), null, null).andExpect(status().isUnauthorized());
    }

    // ============================================================ who may grant what

    /** Nobody hands out access they do not hold themselves — that is what makes TEAM safe to give. */
    @Test
    void aManagerCannotGrantAccessTheyDoNotHold() throws Exception {
        String manager = staffToken(ownerToken, name("shiftlead"), List.of("ORDERS", "TEAM"), null);

        send(post("/api/users"), manager, staffPayload(name("escalated"), List.of("ORDERS", "MENU"), null))
                .andExpect(status().isForbidden());
        send(post("/api/users/invites"), manager, invitePayload(name("escalated2"), List.of("STOCK"), null))
                .andExpect(status().isForbidden());

        // What they do hold, they may pass on.
        send(post("/api/users"), manager, staffPayload(name("runner"), List.of("ORDERS"), null))
                .andExpect(status().isOk());
    }

    /** Platform access is not a café's to give, however complete the owner's own set is. */
    @Test
    void platformAdminIsNeverGrantableFromInsideACafe() throws Exception {
        send(post("/api/users"), ownerToken,
                staffPayload(name("wannabeadmin"), List.of("ORDERS", "PLATFORM_ADMIN"), null))
                .andExpect(status().isForbidden());
    }

    /** A member cannot promote themselves either — the same rule, applied to an edit. */
    @Test
    void aManagerCannotPromoteThemselves() throws Exception {
        String username = name("selfpromoter");
        Number id = createStaff(ownerToken, username, List.of("ORDERS", "TEAM"), null);
        String self = login(username, PASSWORD);

        send(patch("/api/users/" + id), self, map("permissions", List.of("ORDERS", "TEAM", "PROFILE")))
                .andExpect(status().isForbidden());

        assertThat(permissionsOf(ownerToken, id)).containsExactlyInAnyOrder("ORDERS", "TEAM");
    }

    // ============================================================ the branch axis

    /** A café user's new hires land in their own café, whatever the request asked for. */
    @Test
    void anOwnerCannotPlantStaffInAnotherCafe() throws Exception {
        MvcResult hired = send(post("/api/users"), ownerToken, map(
                "username", name("planted"), "password", PASSWORD, "permissions", List.of("ORDERS"),
                "restaurantId", neighbourCafe))
                .andExpect(status().isOk()).andReturn();

        assertThat(this.<Number>json(hired, "$.data.restaurantId")).isEqualTo(cafe);
    }

    /** A branch manager's new hires land in their own branch, whatever the request asked for. */
    @Test
    void aBranchManagerCanOnlyHireIntoTheirOwnBranch() throws Exception {
        String lead = staffToken(ownerToken, name("mainlead"), List.of("ORDERS", "TEAM"), mainBranch);

        MvcResult hired = send(post("/api/users"), lead,
                staffPayload(name("hiredelsewhere"), List.of("ORDERS"), secondBranch))
                .andExpect(status().isOk()).andReturn();

        assertThat(this.<Number>json(hired, "$.data.branchId")).isEqualTo(mainBranch);
    }

    /** ...and cannot walk themselves across to the other branch afterwards. */
    @Test
    void aBranchManagerCannotMoveThemselvesToAnotherBranch() throws Exception {
        String username = name("wanderer");
        Number id = createStaff(ownerToken, username, List.of("ORDERS", "TEAM"), mainBranch);
        String wanderer = login(username, PASSWORD);

        send(patch("/api/users/" + id + "/branch"), wanderer, map("branchId", secondBranch))
                .andExpect(status().isForbidden());
        // Nor let themselves out to every branch, which would be the same escape by the other door.
        send(patch("/api/users/" + id + "/branch"), wanderer, map())
                .andExpect(status().isForbidden());

        assertThat(branchOf(ownerToken, id)).isEqualTo(mainBranch);
    }

    /** Nor move one of their own staff there, which is the same move one step removed. */
    @Test
    void aBranchManagerCannotPushStaffIntoAnotherBranch() throws Exception {
        String lead = staffToken(ownerToken, name("pusher"), List.of("ORDERS", "TEAM"), mainBranch);
        Number junior = createStaff(ownerToken, name("junior"), List.of("ORDERS"), mainBranch);

        send(patch("/api/users/" + junior + "/branch"), lead, map("branchId", secondBranch))
                .andExpect(status().isForbidden());
        send(patch("/api/users/" + junior + "/branch"), lead, map())
                .andExpect(status().isForbidden());

        assertThat(branchOf(ownerToken, junior)).isEqualTo(mainBranch);
    }

    /**
     * The owner's own moves, both directions. "All branches" is the one the team editor could
     * never actually save: it is a null, and a null field in a PATCH body means "leave unchanged",
     * so the owner picked it, was told the account was saved, and nothing moved.
     */
    @Test
    void anOwnerCanMoveAMemberBetweenBranchesAndOutToAllOfThem() throws Exception {
        Number id = createStaff(ownerToken, name("mover"), List.of("ORDERS"), mainBranch);

        send(patch("/api/users/" + id + "/branch"), ownerToken, map("branchId", secondBranch))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.branchId").value(secondBranch));
        assertThat(branchOf(ownerToken, id)).isEqualTo(secondBranch);

        send(patch("/api/users/" + id + "/branch"), ownerToken, map())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.branchId").doesNotExist());
        assertThat(branchOf(ownerToken, id)).isNull();

        // And back again, so "all branches" is not a one-way door.
        send(patch("/api/users/" + id + "/branch"), ownerToken, map("branchId", mainBranch))
                .andExpect(status().isOk());
        assertThat(branchOf(ownerToken, id)).isEqualTo(mainBranch);
    }

    /** A branch belonging to another café is not a place anyone here can be posted to. */
    @Test
    void aMemberCannotBeMovedIntoAnotherCafesBranch() throws Exception {
        Number id = createStaff(ownerToken, name("exported"), List.of("ORDERS"), mainBranch);
        Number theirBranch = json(send(get("/api/restaurants/" + neighbourCafe + "/branches"), neighbourToken, null)
                .andExpect(status().isOk()).andReturn(), "$.data[0].id");

        send(patch("/api/users/" + id + "/branch"), ownerToken, map("branchId", theirBranch))
                .andExpect(status().isNotFound());
        assertThat(branchOf(ownerToken, id)).isEqualTo(mainBranch);
    }

    /**
     * Restaurant-wide staff answer to the owner, not to one shop. A branch manager who could
     * deactivate the café's bookkeeper would be managing people well outside their own branch.
     */
    @Test
    void aBranchManagerCannotReachRestaurantWideStaff() throws Exception {
        String lead = staffToken(ownerToken, name("branchboss"), List.of("ORDERS", "TEAM"), mainBranch);
        Number wide = createStaff(ownerToken, name("bookkeeper"), List.of("ORDERS"), null);

        send(patch("/api/users/" + wide + "/deactivate"), lead, null)
                .andExpect(status().isForbidden());
        send(patch("/api/users/" + wide), lead, map("password", "Hijacked1!"))
                .andExpect(status().isForbidden());
    }

    /** Neither may they reach into the other branch's team. */
    @Test
    void aBranchManagerCannotReachTheOtherBranchesStaff() throws Exception {
        String lead = staffToken(ownerToken, name("mainboss"), List.of("ORDERS", "TEAM"), mainBranch);
        Number theirs = createStaff(ownerToken, name("secondstaff"), List.of("ORDERS"), secondBranch);

        send(patch("/api/users/" + theirs + "/deactivate"), lead, null)
                .andExpect(status().isForbidden());

        // The team list agrees with the guard: they simply do not appear in it.
        MvcResult list = send(get("/api/users"), lead, null).andExpect(status().isOk()).andReturn();
        assertThat(this.<List<Number>>json(list, "$.data[*].id")).doesNotContain(theirs);
    }

    /** Orders are branch data too: a member of one shop never sees the other shop's board. */
    @Test
    void branchStaffSeeOnlyTheirOwnBranchesOrders() throws Exception {
        Number item = menuItem();
        Number mainOrder = staffOrder(ownerToken, mainBranch, item);
        Number secondOrder = staffOrder(ownerToken, secondBranch, item);

        String waiter = staffToken(ownerToken, name("secondwaiter"), List.of("ORDERS"), secondBranch);

        send(get("/api/dashboard/orders/" + secondOrder), waiter, null).andExpect(status().isOk());
        send(get("/api/dashboard/orders/" + mainOrder), waiter, null).andExpect(status().isForbidden());
        send(patch("/api/dashboard/orders/" + mainOrder + "/cancel"), waiter, null)
                .andExpect(status().isForbidden());

        MvcResult board = send(get("/api/dashboard/orders"), waiter, null)
                .andExpect(status().isOk()).andReturn();
        assertThat(this.<List<Number>>json(board, "$.data.content[*].id"))
                .contains(secondOrder)
                .doesNotContain(mainOrder);
    }

    /**
     * The menu list is per branch too. It was the one list that read the branch id off the query
     * string before checking whose branch the caller works in, so a member of one shop could see
     * the other shop's menu — and its per-branch daily limits — by editing a URL.
     */
    @Test
    void branchStaffAlwaysGetTheirOwnBranchesMenu() throws Exception {
        String theirCategory = name("SecondOnly");
        Number pinned = json(send(post("/api/menu/categories"), ownerToken, map(
                "nameEn", theirCategory, "nameAr", "قسم", "branchId", secondBranch))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        String mainEditor = staffToken(ownerToken, name("mainmenu"), List.of("MENU"), mainBranch);

        MvcResult asked = send(get("/api/menu/categories?branchId=" + secondBranch), mainEditor, null)
                .andExpect(status().isOk()).andReturn();
        assertThat(this.<List<Number>>json(asked, "$.data[*].id")).doesNotContain(pinned);

        // The owner, who works across the café, still sees it when they ask for that branch.
        MvcResult ownerSees = send(get("/api/menu/categories?branchId=" + secondBranch), ownerToken, null)
                .andExpect(status().isOk()).andReturn();
        assertThat(this.<List<Number>>json(ownerSees, "$.data[*].id")).contains(pinned);
    }

    /**
     * Opening a shop is a decision about the whole café. The team editor's "Manager" preset hands
     * out BRANCHES, so a branch manager can hold it — and would otherwise be able to add branches
     * they had no access to, on the café's plan allowance.
     */
    @Test
    void aBranchManagerCannotOpenAnotherShop() throws Exception {
        String lead = staffToken(ownerToken, name("expansionist"),
                List.of("ORDERS", "BRANCHES"), mainBranch);

        send(post("/api/restaurants/" + cafe + "/branches"), lead, map("nameEn", "Third"))
                .andExpect(status().isForbidden());

        // What BRANCHES does still buy them: their own shop's settings.
        send(patch("/api/branches/" + mainBranch), lead, map("phone", "96812345678"))
                .andExpect(status().isOk());
        send(patch("/api/branches/" + secondBranch), lead, map("phone", "96812345678"))
                .andExpect(status().isForbidden());
    }

    /** The branch fence holds outside the team page too — QR tables belong to one shop. */
    @Test
    void branchStaffCannotSetUpTheOtherBranchesTables() throws Exception {
        String host = staffToken(ownerToken, name("qrstaff"), List.of("QR_TABLES"), mainBranch);

        send(post("/api/branches/" + mainBranch + "/tables"), host, map("tableNumber", name("T")))
                .andExpect(status().isOk());

        send(get("/api/branches/" + secondBranch + "/tables"), host, null)
                .andExpect(status().isForbidden());
        send(post("/api/branches/" + secondBranch + "/tables"), host, map("tableNumber", name("T")))
                .andExpect(status().isForbidden());
    }

    /**
     * Stock answers for the branch the member belongs to, not the one the URL asked for. Asking
     * for the other shop is not an error here — every screen a branch member opens is implicitly
     * about their own branch — but it must never be answered with the other shop's numbers.
     */
    @Test
    void branchStaffAlwaysGetTheirOwnBranchesStock() throws Exception {
        String keeper = staffToken(ownerToken, name("keeper"), List.of("STOCK"), mainBranch);

        send(get("/api/dashboard/stock/overview?branchId=" + secondBranch), keeper, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.branchId").value(mainBranch));
    }

    // ============================================================ the owner, and the café next door

    /** Handing someone TEAM must not hand them the owner's account. */
    @Test
    void theOwnerAccountIsOutOfStaffReach() throws Exception {
        String manager = staffToken(ownerToken, name("gm"),
                List.of("ORDERS", "PAYMENTS", "MENU", "QR_TABLES", "TEAM", "ANALYTICS", "PROFILE",
                        "BRANCHES", "STOCK"), null);

        send(patch("/api/users/" + ownerUserId + "/deactivate"), manager, null)
                .andExpect(status().isForbidden());
        send(patch("/api/users/" + ownerUserId), manager, map("password", "Hijacked1!"))
                .andExpect(status().isForbidden());
    }

    /** Two cafés on one platform: neither owner can see or touch the other's people. */
    @Test
    void theCafeNextDoorIsInvisible() throws Exception {
        Number mine = createStaff(ownerToken, name("mystaff"), List.of("ORDERS"), mainBranch);

        MvcResult theirList = send(get("/api/users"), neighbourToken, null)
                .andExpect(status().isOk()).andReturn();
        assertThat(this.<List<Number>>json(theirList, "$.data[*].id")).doesNotContain(mine);

        send(patch("/api/users/" + mine), neighbourToken, map("password", "Hijacked1!"))
                .andExpect(status().isForbidden());
        send(patch("/api/users/" + mine + "/deactivate"), neighbourToken, null)
                .andExpect(status().isForbidden());
        send(get("/api/restaurants/" + cafe + "/branches"), neighbourToken, null)
                .andExpect(status().isForbidden());
        send(post("/api/restaurants/" + cafe + "/branches"), neighbourToken, map("nameEn", "Sneaky"))
                .andExpect(status().isForbidden());
    }

    /** An invite belongs to the café that issued it — the link must be unreachable from outside. */
    @Test
    void anInviteCannotBeManagedByAnotherCafe() throws Exception {
        Number inviteId = json(send(post("/api/users/invites"), ownerToken,
                invitePayload(name("guarded"), List.of("ORDERS"), mainBranch))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        send(post("/api/users/invites/" + inviteId + "/resend"), neighbourToken, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("FORBIDDEN"));
        send(delete("/api/users/invites/" + inviteId), neighbourToken, null)
                .andExpect(status().isBadRequest());

        MvcResult theirPending = send(get("/api/users/invites"), neighbourToken, null)
                .andExpect(status().isOk()).andReturn();
        assertThat(this.<List<Number>>json(theirPending, "$.data[*].id")).doesNotContain(inviteId);
    }

    /**
     * A live join link is a credential for the account it belongs to: whoever opens it chooses the
     * password and walks in with that account's permissions. So the pending list has to be scoped
     * exactly like the team list — a branch manager who cannot edit a restaurant-wide account must
     * not be handed the link that claims one.
     */
    @Test
    void aPendingInviteLinkIsNotVisibleToStaffWhoCouldNotHaveIssuedIt() throws Exception {
        String lead = staffToken(ownerToken, name("peeker"), List.of("ORDERS", "TEAM"), mainBranch);

        Number wideInvite = json(send(post("/api/users/invites"), ownerToken,
                invitePayload(name("incomingmanager"), List.of("MENU", "PROFILE"), null))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        MvcResult pending = send(get("/api/users/invites"), lead, null)
                .andExpect(status().isOk()).andReturn();
        assertThat(this.<List<Number>>json(pending, "$.data[*].id")).doesNotContain(wideInvite);
    }

    /**
     * The same rule with the branch axis taken out of it: a restaurant-wide manager still may not
     * hold the link to an account that carries access they lack. Otherwise the "you cannot grant
     * what you do not have" rule is a formality — they claim the account instead of creating it.
     */
    @Test
    void anInviteLinkIsNotHandedToStaffWhoCouldNotHaveGrantedItsAccess() throws Exception {
        String manager = staffToken(ownerToken, name("widelead"), List.of("ORDERS", "TEAM"), null);

        Number inviteId = json(send(post("/api/users/invites"), ownerToken,
                invitePayload(name("incomingchef"), List.of("STOCK"), null))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        MvcResult pending = send(get("/api/users/invites"), manager, null)
                .andExpect(status().isOk()).andReturn();
        assertThat(this.<List<Number>>json(pending, "$.data[*].id")).doesNotContain(inviteId);

        // Nor may they mint a fresh one by guessing the id.
        send(post("/api/users/invites/" + inviteId + "/resend"), manager, null)
                .andExpect(status().isForbidden());
    }

    /**
     * Setting someone's password is signing in as them. A manager with TEAM but no STOCK could
     * otherwise reset the storekeeper's password and arrive at STOCK through the back door —
     * the grant rule has to hold on that path too.
     */
    @Test
    void aManagerCannotResetThePasswordOfSomeoneWithMoreAccess() throws Exception {
        String manager = staffToken(ownerToken, name("teamonly"), List.of("ORDERS", "TEAM"), null);
        Number storekeeper = createStaff(ownerToken, name("storekeeper"), List.of("ORDERS", "STOCK"), null);

        send(patch("/api/users/" + storekeeper), manager, map("password", "Hijacked1!"))
                .andExpect(status().isForbidden());

        // Managing them in ways that cannot escalate is still allowed: they run the rota, after all.
        send(patch("/api/users/" + storekeeper), manager, map("phone", "96890000009"))
                .andExpect(status().isOk());
        send(patch("/api/users/" + storekeeper + "/deactivate"), manager, null)
                .andExpect(status().isOk());
    }

    // ============================================================ the platform admin

    /** A platform admin reaches into any café — but has to say which one. */
    @Test
    void aPlatformAdminMustNameTheCafeTheyAreHiringInto() throws Exception {
        send(post("/api/users"), adminToken, map(
                "username", name("floating"), "password", PASSWORD, "permissions", List.of("ORDERS")))
                .andExpect(status().isBadRequest());

        MvcResult hired = send(post("/api/users"), adminToken, map(
                "username", name("placed"), "password", PASSWORD, "permissions", List.of("ORDERS"),
                "restaurantId", cafe, "branchId", mainBranch))
                .andExpect(status().isOk()).andReturn();
        assertThat(this.<Number>json(hired, "$.data.restaurantId")).isEqualTo(cafe);
        assertThat(this.<Number>json(hired, "$.data.branchId")).isEqualTo(mainBranch);
    }

    /** And can switch off an account in a café they have never signed into. */
    @Test
    void aPlatformAdminCanDeactivateAnyCafesStaff() throws Exception {
        Number id = createStaff(ownerToken, name("anywhere"), List.of("ORDERS"), mainBranch);

        send(patch("/api/users/" + id + "/deactivate"), adminToken, null).andExpect(status().isOk());
        send(patch("/api/users/" + id + "/activate"), adminToken, null).andExpect(status().isOk());
    }

    /**
     * Support impersonation hands over a café session, so it is bounded on every side: only a
     * platform admin may ask, only for an account that could sign in itself, and never for
     * another admin — that would be a sideways promotion dressed up as support.
     */
    @Test
    void supportImpersonationEntersAsThatMemberAndNoFurther() throws Exception {
        String username = name("shadowed");
        Number cashierId = createStaff(ownerToken, username, List.of("ORDERS", "PAYMENTS"), mainBranch);

        String asCashier = json(send(
                post("/api/admin/restaurants/" + cafe + "/impersonate?userId=" + cashierId), adminToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.username").value(username))
                .andReturn(), "$.data.accessToken");

        // Exactly that member's access — not the admin's, and not the owner's.
        send(get("/api/dashboard/orders"), asCashier, null).andExpect(status().isOk());
        forbidden(get("/api/menu/categories"), asCashier);
        forbidden(get("/api/admin/restaurants"), asCashier);

        // The owner cannot open a support session, in their own café or anyone else's.
        send(post("/api/admin/restaurants/" + cafe + "/impersonate"), ownerToken, null)
                .andExpect(status().isForbidden());
    }

    /** Nothing a café could not sign into itself: no pending invite, no other admin. */
    @Test
    void supportImpersonationRefusesAccountsThatCannotSignIn() throws Exception {
        Number pending = json(send(post("/api/users/invites"), ownerToken,
                invitePayload(name("unclaimed"), List.of("ORDERS"), mainBranch))
                .andExpect(status().isOk()).andReturn(), "$.data.userId");

        send(post("/api/admin/restaurants/" + cafe + "/impersonate?userId=" + pending), adminToken, null)
                .andExpect(status().isBadRequest());

        Number switchedOff = createStaff(ownerToken, name("switchedoff"), List.of("ORDERS"), mainBranch);
        send(patch("/api/users/" + switchedOff + "/deactivate"), ownerToken, null).andExpect(status().isOk());
        send(post("/api/admin/restaurants/" + cafe + "/impersonate?userId=" + switchedOff), adminToken, null)
                .andExpect(status().isBadRequest());
    }

    /**
     * One platform admin does not get to become another. The support endpoints say so; so does
     * ordinary user management, which is the other door into the same room.
     */
    @Test
    void onePlatformAdminCannotTakeOverAnother() throws Exception {
        String username = name("secondadmin");
        Number otherAdmin = json(send(post("/api/users"), adminToken, map(
                "username", username, "password", PASSWORD, "email", username + "@perm.test",
                "permissions", List.of("PLATFORM_ADMIN")))
                .andExpect(status().isOk()).andReturn(), "$.data.id");

        send(patch("/api/users/" + otherAdmin), adminToken, map("password", "Hijacked1!"))
                .andExpect(status().isForbidden());
        send(post("/api/admin/users/" + otherAdmin + "/reset-password"), adminToken, null)
                .andExpect(status().isBadRequest());
        send(post("/api/admin/restaurants/" + cafe + "/impersonate?userId=" + otherAdmin), adminToken, null)
                .andExpect(status().isBadRequest());
    }

    /**
     * Switching yourself off is a lockout with nobody left inside to undo it — for an owner it
     * turns into a support call. The team page never offers it; the API should not either.
     */
    @Test
    void nobodyCanDeactivateTheirOwnAccount() throws Exception {
        String username = name("selfsaboteur");
        Number id = createStaff(ownerToken, username, List.of("ORDERS", "TEAM"), mainBranch);
        String self = login(username, PASSWORD);

        send(patch("/api/users/" + id + "/deactivate"), self, null)
                .andExpect(status().isBadRequest());
        send(patch("/api/users/" + ownerUserId + "/deactivate"), ownerToken, null)
                .andExpect(status().isBadRequest());

        send(get("/api/dashboard/orders"), self, null).andExpect(status().isOk());
    }

    // ============================================================ the invite lifecycle

    /** The happy path: link → preview → password → a session holding exactly what was granted. */
    @Test
    void anInviteCarriesExactlyTheAccessItPromised() throws Exception {
        String username = name("newbarista");
        MvcResult invited = send(post("/api/users/invites"), ownerToken,
                invitePayload(username, List.of("ORDERS"), mainBranch))
                .andExpect(status().isOk()).andReturn();
        String joinToken = joinToken(json(invited, "$.data.joinUrl"));

        // Before the member sets a password the account exists but cannot be signed into, and the
        // message has to point them at their link rather than at the billing team. Its own code,
        // because the login screen picks the wording off the code and not off the message.
        send(post("/api/auth/login"), null, map("username", username, "password", PASSWORD))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("INVITE_PENDING"));

        send(get("/api/public/invites/" + joinToken), null, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username").value(username))
                .andExpect(jsonPath("$.data.permissions", contains("ORDERS")))
                .andExpect(jsonPath("$.data.cafeNameEn").value("Permissions Cafe"));

        String session = accessToken(send(post("/api/public/invites/" + joinToken + "/accept"), null,
                map("password", PASSWORD)).andExpect(status().isOk()));

        send(get("/api/dashboard/orders"), session, null).andExpect(status().isOk());
        forbidden(get("/api/menu/categories"), session);
        send(get("/api/auth/me"), session, null)
                .andExpect(jsonPath("$.data.branchId").value(mainBranch))
                .andExpect(jsonPath("$.data.pendingInvite").value(false))
                .andExpect(jsonPath("$.data.active").value(true));

        // The link is spent. Whoever opens the URL next is told to sign in, not given a second
        // chance to choose the password.
        send(post("/api/public/invites/" + joinToken + "/accept"), null, map("password", "Someone2!"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CONFLICT"));

        // And the password the member chose is the one that works.
        login(username, PASSWORD);
    }

    /** Re-sending burns the previous link, so a leaked one stops working. */
    @Test
    void resendingAnInviteKillsTheOldLink() throws Exception {
        MvcResult first = send(post("/api/users/invites"), ownerToken,
                invitePayload(name("relinked"), List.of("ORDERS"), mainBranch))
                .andExpect(status().isOk()).andReturn();
        Number inviteId = json(first, "$.data.id");
        String oldToken = joinToken(json(first, "$.data.joinUrl"));

        MvcResult second = send(post("/api/users/invites/" + inviteId + "/resend"), ownerToken, null)
                .andExpect(status().isOk()).andReturn();
        String newToken = joinToken(json(second, "$.data.joinUrl"));
        assertThat(newToken).isNotEqualTo(oldToken);

        send(get("/api/public/invites/" + oldToken), null, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("TOKEN_INVALID"));
        send(get("/api/public/invites/" + newToken), null, null).andExpect(status().isOk());
    }

    /** Cancelling takes the shell account with it, so a mistyped username can be typed again. */
    @Test
    void cancellingAnInviteFreesTheUsernameAgain() throws Exception {
        String username = name("mistyped");
        MvcResult invited = send(post("/api/users/invites"), ownerToken,
                invitePayload(username, List.of("ORDERS"), mainBranch))
                .andExpect(status().isOk()).andReturn();
        Number inviteId = json(invited, "$.data.id");
        String joinToken = joinToken(json(invited, "$.data.joinUrl"));

        send(delete("/api/users/invites/" + inviteId), ownerToken, null).andExpect(status().isOk());

        send(get("/api/public/invites/" + joinToken), null, null).andExpect(status().isBadRequest());
        send(post("/api/users"), ownerToken,
                staffPayload(username, List.of("ORDERS"), mainBranch))
                .andExpect(status().isOk());
    }

    /** An accepted member is a real account: cancelling is no longer the right verb. */
    @Test
    void aJoinedMemberCannotBeRemovedByCancellingTheirInvite() throws Exception {
        MvcResult invited = send(post("/api/users/invites"), ownerToken,
                invitePayload(name("alreadyhere"), List.of("ORDERS"), mainBranch))
                .andExpect(status().isOk()).andReturn();
        Number inviteId = json(invited, "$.data.id");
        String joinToken = joinToken(json(invited, "$.data.joinUrl"));

        send(post("/api/public/invites/" + joinToken + "/accept"), null, map("password", PASSWORD))
                .andExpect(status().isOk());

        send(delete("/api/users/invites/" + inviteId), ownerToken, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CONFLICT"));
        send(post("/api/users/invites/" + inviteId + "/resend"), ownerToken, null)
                .andExpect(status().isBadRequest());
    }

    /** A username is how someone signs in, so the second person to want it is refused. */
    @Test
    void aUsernameAndAnEmailAreEachClaimedOnlyOnce() throws Exception {
        String username = name("taken");
        String email = username + "@perm.test";
        send(post("/api/users"), ownerToken, map(
                "username", username, "password", PASSWORD, "email", email,
                "permissions", List.of("ORDERS")))
                .andExpect(status().isOk());

        send(post("/api/users"), ownerToken, map(
                "username", username, "password", PASSWORD, "permissions", List.of("ORDERS")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("CONFLICT"));
        send(post("/api/users"), ownerToken, map(
                "username", name("other"), "password", PASSWORD, "email", email,
                "permissions", List.of("ORDERS")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_EXISTS"));

        // Including across cafés — a login name is unique platform-wide, not per café.
        send(post("/api/users"), neighbourToken, map(
                "username", username, "password", PASSWORD, "permissions", List.of("ORDERS")))
                .andExpect(status().isConflict());
    }

    /**
     * The email on a staff account is the only route to "forgot password" they have, so the team
     * editor collects it — and it has to actually be editable afterwards. It moves where resets
     * land, so it changes hands under the same rule as a password.
     */
    @Test
    void aStaffEmailCanBeSetAndChangedByWhoeverManagesTheAccount() throws Exception {
        String username = name("reachable");
        String first = username + "@perm.test";
        Number id = json(send(post("/api/users"), ownerToken, map(
                "username", username, "password", PASSWORD, "email", first,
                "permissions", List.of("ORDERS"), "branchId", mainBranch))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value(first))
                .andReturn(), "$.data.id");

        String second = name("moved") + "@perm.test";
        send(patch("/api/users/" + id), ownerToken, map("email", second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value(second));

        // "" clears it, the way it does everywhere else a string is cleared here.
        send(patch("/api/users/" + id), ownerToken, map("email", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").doesNotExist());

        // Someone else's address is not available.
        send(patch("/api/users/" + id), ownerToken, map("email", "owner@perm.test"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_EXISTS"));
    }

    /**
     * ...but not on the account you are signed into. Redirecting your own resets is exactly what
     * an unlocked dashboard would be used for, so that one goes through the flow that asks for
     * the password first.
     */
    @Test
    void yourOwnSignInEmailIsNotChangedFromTheTeamPage() throws Exception {
        String username = name("selfmailer");
        Number id = createStaff(ownerToken, username, List.of("ORDERS", "TEAM"), mainBranch);
        String self = login(username, PASSWORD);

        send(patch("/api/users/" + id), self, map("email", name("elsewhere") + "@perm.test"))
                .andExpect(status().isBadRequest());
    }

    /** A manager cannot redirect the resets of an account that outranks them either. */
    @Test
    void anEmailCannotBeMovedOnAnAccountWithMoreAccess() throws Exception {
        String manager = staffToken(ownerToken, name("mailmanager"), List.of("ORDERS", "TEAM"), null);
        Number storekeeper = createStaff(ownerToken, name("mailkeeper"), List.of("ORDERS", "STOCK"), null);

        send(patch("/api/users/" + storekeeper), manager, map("email", name("hijack") + "@perm.test"))
                .andExpect(status().isForbidden());

        // But the editor sends every field it shows on every save, so an email that hasn't
        // actually moved must not turn an ordinary edit into a refusal.
        send(patch("/api/users/" + storekeeper), manager, map("phone", "96890000123", "email", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.phone").value("96890000123"));
    }

    /** The member choosing their own password still has to choose a real one. */
    @Test
    void anInviteWillNotAcceptAWeakPassword() throws Exception {
        MvcResult invited = send(post("/api/users/invites"), ownerToken,
                invitePayload(name("picky"), List.of("ORDERS"), mainBranch))
                .andExpect(status().isOk()).andReturn();
        String joinToken = joinToken(json(invited, "$.data.joinUrl"));

        send(post("/api/public/invites/" + joinToken + "/accept"), null, map("password", "short"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_ERROR"));

        // ...and the link is still good afterwards, so a typo does not cost them the invite.
        send(post("/api/public/invites/" + joinToken + "/accept"), null, map("password", PASSWORD))
                .andExpect(status().isOk());
    }

    /** A join link that was never issued opens nothing, and says so without hinting. */
    @Test
    void aMadeUpJoinLinkOpensNothing() throws Exception {
        send(get("/api/public/invites/not-a-token-anyone-issued"), null, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("TOKEN_INVALID"));
        send(post("/api/public/invites/not-a-token-anyone-issued/accept"), null, map("password", PASSWORD))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("TOKEN_INVALID"));
    }

    // ============================================================ turning access off

    /** Deactivating a member ends their access: no new session, and no renewing the old one. */
    @Test
    void deactivatingAMemberClosesTheDoor() throws Exception {
        String username = name("leaver");
        Number id = createStaff(ownerToken, username, List.of("ORDERS"), mainBranch);
        String refresh = json(send(post("/api/auth/login"), null,
                map("username", username, "password", PASSWORD))
                .andExpect(status().isOk()).andReturn(), "$.data.refreshToken");

        send(patch("/api/users/" + id + "/deactivate"), ownerToken, null).andExpect(status().isOk());

        send(post("/api/auth/login"), null, map("username", username, "password", PASSWORD))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_DISABLED"));
        send(post("/api/auth/refresh"), null, map("refreshToken", refresh))
                .andExpect(status().isUnauthorized());

        // ...and reactivating lets them back in.
        send(patch("/api/users/" + id + "/activate"), ownerToken, null).andExpect(status().isOk());
        login(username, PASSWORD);
    }

    /**
     * Deactivating someone ends the session they are holding, not just the next one they ask for.
     *
     * <p>This is the difference between "you're off the system" and "you're off the system in a
     * quarter of an hour", and an owner who has just walked someone off the floor is entitled to
     * the first. Permissions, branch and the active flag are read from the account row on every
     * request; the token only says who is asking.
     */
    @Test
    void deactivationCutsOffTheSessionTheyAreAlreadyHolding() throws Exception {
        String username = name("walkedout");
        Number id = createStaff(ownerToken, username, List.of("ORDERS"), mainBranch);
        String theirSession = login(username, PASSWORD);
        send(get("/api/dashboard/orders"), theirSession, null).andExpect(status().isOk());

        send(patch("/api/users/" + id + "/deactivate"), ownerToken, null).andExpect(status().isOk());

        // Same token, same second.
        send(get("/api/dashboard/orders"), theirSession, null).andExpect(status().isUnauthorized());
        send(get("/api/auth/me"), theirSession, null).andExpect(status().isUnauthorized());
    }

    /** Taking an area away is just as immediate, and takes away only that area. */
    @Test
    void aRevokedPermissionIsGoneOnTheNextRequest() throws Exception {
        String username = name("demoted");
        Number id = createStaff(ownerToken, username, List.of("ORDERS", "MENU"), mainBranch);
        String theirSession = login(username, PASSWORD);
        send(get("/api/menu/categories"), theirSession, null).andExpect(status().isOk());

        send(patch("/api/users/" + id), ownerToken, map("permissions", List.of("ORDERS")))
                .andExpect(status().isOk());

        forbidden(get("/api/menu/categories"), theirSession);
        send(get("/api/dashboard/orders"), theirSession, null).andExpect(status().isOk());
    }

    /** Moving someone between branches lands the same way: on their very next request. */
    @Test
    void aBranchMoveTakesEffectOnTheSessionTheyAreHolding() throws Exception {
        Number item = menuItem();
        Number secondOrder = staffOrder(ownerToken, secondBranch, item);

        String username = name("reassigned");
        Number id = createStaff(ownerToken, username, List.of("ORDERS"), mainBranch);
        String theirSession = login(username, PASSWORD);
        send(get("/api/dashboard/orders/" + secondOrder), theirSession, null)
                .andExpect(status().isForbidden());

        send(patch("/api/users/" + id + "/branch"), ownerToken, map("branchId", secondBranch))
                .andExpect(status().isOk());

        send(get("/api/dashboard/orders/" + secondOrder), theirSession, null).andExpect(status().isOk());
    }

    /** Cancelling an invite deletes the shell — and any session it had somehow been given. */
    @Test
    void aCancelledInvitesAccountCannotBeUsedAfterwards() throws Exception {
        MvcResult invited = send(post("/api/users/invites"), ownerToken,
                invitePayload(name("recalled"), List.of("ORDERS"), mainBranch))
                .andExpect(status().isOk()).andReturn();
        Number inviteId = json(invited, "$.data.id");
        String joinToken = joinToken(json(invited, "$.data.joinUrl"));
        String theirSession = accessToken(send(post("/api/public/invites/" + joinToken + "/accept"),
                null, map("password", PASSWORD)).andExpect(status().isOk()));
        Number userId = json(invited, "$.data.userId");

        // They joined, so the invite can no longer be cancelled — the account is deactivated
        // instead, and the session they are sitting in goes with it.
        send(delete("/api/users/invites/" + inviteId), ownerToken, null).andExpect(status().isBadRequest());
        send(patch("/api/users/" + userId + "/deactivate"), ownerToken, null).andExpect(status().isOk());
        send(get("/api/dashboard/orders"), theirSession, null).andExpect(status().isUnauthorized());
    }

    // ----------------------------------------------------------------- the permission grid

    /** One permission and an endpoint that only that permission opens. */
    record Area(String permission, String method, String path) {
        @Override
        public String toString() {
            return permission;
        }
    }

    /**
     * One endpoint per permission, each gated on that authority alone — no {@code hasAnyAuthority}
     * endpoint belongs here, because it could not tell the two apart.
     */
    private static List<Area> areas() {
        return List.of(
                new Area("ORDERS", "GET", "/api/dashboard/orders"),
                new Area("PAYMENTS", "POST", "/api/payments/orders/999999/mark-paid"),
                new Area("MENU", "GET", "/api/menu/categories"),
                new Area("QR_TABLES", "GET", "/api/branches/{branch}/tables"),
                new Area("TEAM", "GET", "/api/users"),
                new Area("ANALYTICS", "GET", "/api/dashboard/analytics/today"),
                new Area("PROFILE", "GET", "/api/restaurants/{cafe}/subscription"),
                new Area("BRANCHES", "PATCH", "/api/branches/{branch}"),
                new Area("STOCK", "GET", "/api/dashboard/stock/overview?branchId={branch}"));
    }

    private int statusFor(Area area, String token) throws Exception {
        String path = area.path()
                .replace("{branch}", String.valueOf(mainBranch))
                .replace("{cafe}", String.valueOf(cafe));
        MockHttpServletRequestBuilder builder = switch (area.method()) {
            case "GET" -> get(path);
            case "POST" -> post(path);
            case "PATCH" -> patch(path);
            default -> throw new IllegalArgumentException("unmapped verb " + area.method());
        };
        return send(builder, token, Map.of()).andReturn().getResponse().getStatus();
    }

    // ----------------------------------------------------------------- helpers

    private ResultActions send(MockHttpServletRequestBuilder builder, String token, Object body)
            throws Exception {
        builder.contentType(MediaType.APPLICATION_JSON);
        if (token != null) {
            builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        if (body != null) {
            builder.content(write(body));
        }
        return mockMvc.perform(builder);
    }

    /**
     * Expects 403. The body is a valid-but-empty object rather than nothing at all: request-body
     * validation runs before the method-security interceptor, so a missing body on a POST would
     * answer 400 and the check would pass without ever reaching the permission it is testing.
     */
    private void forbidden(MockHttpServletRequestBuilder builder, String token) throws Exception {
        send(builder, token, Map.of()).andExpect(status().isForbidden());
    }

    private String login(String username, String password) throws Exception {
        return accessToken(send(post("/api/auth/login"), null,
                map("username", username, "password", password)).andExpect(status().isOk()));
    }

    private String accessToken(ResultActions actions) throws Exception {
        return json(actions.andReturn(), "$.data.accessToken");
    }

    private static String name(String base) {
        return base + SEQ.incrementAndGet();
    }

    private Map<String, Object> staffPayload(String username, List<String> permissions, Number branchId) {
        return map("username", username, "password", PASSWORD, "fullNameEn", username,
                "permissions", permissions, "branchId", branchId);
    }

    private Map<String, Object> invitePayload(String username, List<String> permissions, Number branchId) {
        return map("username", username, "fullNameEn", username,
                "permissions", permissions, "branchId", branchId);
    }

    private Number createStaff(String actor, String username, List<String> permissions, Number branchId)
            throws Exception {
        return json(send(post("/api/users"), actor, staffPayload(username, permissions, branchId))
                .andExpect(status().isOk()).andReturn(), "$.data.id");
    }

    private String staffToken(String actor, String username, List<String> permissions, Number branchId)
            throws Exception {
        createStaff(actor, username, permissions, branchId);
        return login(username, PASSWORD);
    }

    private List<String> permissionsOf(String actor, Number userId) throws Exception {
        MvcResult list = send(get("/api/users"), actor, null).andExpect(status().isOk()).andReturn();
        List<List<String>> matches = json(list, "$.data[?(@.id == " + userId + ")].permissions");
        return matches.get(0);
    }

    private Number branchOf(String actor, Number userId) throws Exception {
        MvcResult list = send(get("/api/users"), actor, null).andExpect(status().isOk()).andReturn();
        List<Number> matches = json(list, "$.data[?(@.id == " + userId + ")].branchId");
        return matches.isEmpty() ? null : matches.get(0);
    }

    /** One sellable thing, so the orders in these tests have something to contain. */
    private Number menuItem() throws Exception {
        Number categoryId = json(send(post("/api/menu/categories"), ownerToken,
                map("nameEn", name("Drinks"), "nameAr", "مشروبات"))
                .andExpect(status().isOk()).andReturn(), "$.data.id");
        return json(send(post("/api/menu/items"), ownerToken, map(
                "categoryId", categoryId, "nameEn", "Tea", "nameAr", "شاي", "price", 0.500))
                .andExpect(status().isOk()).andReturn(), "$.data.id");
    }

    private Number staffOrder(String actor, Number branchId, Number menuItemId) throws Exception {
        return json(send(post("/api/dashboard/orders"), actor, map(
                "branchId", branchId, "orderType", "DINE_IN", "customerName", "Walk-in",
                "items", List.of(map("menuItemId", menuItemId, "quantity", 1))))
                .andExpect(status().isOk()).andReturn(), "$.data.id");
    }

    private static String joinToken(String joinUrl) {
        return joinUrl.substring(joinUrl.lastIndexOf('/') + 1);
    }

    /** Like {@code Map.of}, but a null value means "leave the field out" rather than an NPE. */
    private static Map<String, Object> map(Object... keyValues) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            if (keyValues[i + 1] != null) {
                result.put(String.valueOf(keyValues[i]), keyValues[i + 1]);
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private <T> T json(MvcResult result, String path) throws Exception {
        return (T) JsonPath.read(result.getResponse().getContentAsString(), path);
    }

    private String write(Object body) {
        try {
            return objectMapper.writeValueAsString(body);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
