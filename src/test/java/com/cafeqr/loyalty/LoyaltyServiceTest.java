package com.cafeqr.loyalty;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.dto.BranchResponse;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.loyalty.domain.LoyaltyMember;
import com.cafeqr.loyalty.domain.LoyaltyProgram;
import com.cafeqr.loyalty.domain.LoyaltyTransaction;
import com.cafeqr.loyalty.dto.LoyaltyProgramRequest;
import com.cafeqr.loyalty.repository.LoyaltyMemberRepository;
import com.cafeqr.loyalty.repository.LoyaltyProgramRepository;
import com.cafeqr.loyalty.repository.LoyaltyTransactionRepository;
import com.cafeqr.menus.domain.MenuItem;
import com.cafeqr.menus.repository.MenuItemRepository;
import com.cafeqr.orders.domain.Order;
import com.cafeqr.orders.domain.OrderItem;
import com.cafeqr.restaurants.RestaurantService;
import com.cafeqr.restaurants.domain.Restaurant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LoyaltyServiceTest {

    private static final Long RESTAURANT_ID = 1L;
    private static final Long BRANCH_ID = 7L;
    private static final Long LATTE_ID = 100L;   // 1.500
    private static final Long MUFFIN_ID = 101L;  // 0.800
    private static final Long TEA_ID = 102L;     // not a reward item

    @Mock private LoyaltyProgramRepository programRepository;
    @Mock private LoyaltyMemberRepository memberRepository;
    @Mock private LoyaltyTransactionRepository txnRepository;
    @Mock private MenuItemRepository menuItemRepository;
    @Mock private RestaurantService restaurantService;
    @Mock private BranchService branchService;
    @Mock private AccessGuard accessGuard;

    private LoyaltyService loyaltyService;

    @BeforeEach
    void setUp() {
        loyaltyService = new LoyaltyService(programRepository, memberRepository, txnRepository,
                menuItemRepository, restaurantService, branchService, accessGuard);
    }

    private Restaurant restaurant() {
        Restaurant r = new Restaurant();
        r.setId(RESTAURANT_ID);
        r.setVatEnabled(true);
        r.setVatRate(new BigDecimal("5"));
        return r;
    }

    private LoyaltyProgram program(Long... rewardItemIds) {
        LoyaltyProgram p = new LoyaltyProgram();
        p.setRestaurantId(RESTAURANT_ID);
        p.setEnabled(true);
        p.setStampsRequired(8);
        p.setRewardLabel("Free item of your choice");
        p.setRewardItemIds(new LinkedHashSet<>(List.of(rewardItemIds)));
        return p;
    }

    private LoyaltyMember memberWithReward() {
        LoyaltyMember m = new LoyaltyMember();
        m.setRestaurantId(RESTAURANT_ID);
        m.setPhone("99990000");
        m.setAvailableRewards(1);
        return m;
    }

    private static OrderItem line(Long menuItemId, String price) {
        OrderItem i = new OrderItem();
        i.setMenuItemId(menuItemId);
        i.setPriceSnapshot(new BigDecimal(price));
        return i;
    }

    /** Latte 1.500 + muffin 0.800 + tea 0.500 = 2.800 net, 5% VAT. */
    private Order order() {
        Order o = new Order();
        o.setId(50L);
        o.setRestaurantId(RESTAURANT_ID);
        o.setBranchId(BRANCH_ID);
        o.setCustomerPhone("99990000");
        o.setItems(new java.util.ArrayList<>(List.of(
                line(LATTE_ID, "1.500"), line(MUFFIN_ID, "0.800"), line(TEA_ID, "0.500"))));
        o.setSubtotal(new BigDecimal("2.800"));
        o.setVatAmount(new BigDecimal("0.140"));
        o.setTotal(new BigDecimal("2.940"));
        return o;
    }

    private void stubRedemption(LoyaltyProgram program, LoyaltyMember member) {
        when(programRepository.findByRestaurantId(RESTAURANT_ID)).thenReturn(Optional.of(program));
        lenient().when(memberRepository.lockByRestaurantIdAndPhone(RESTAURANT_ID, "99990000"))
                .thenReturn(Optional.ofNullable(member));
        lenient().when(restaurantService.getEntity(RESTAURANT_ID)).thenReturn(restaurant());
    }

    // ============================================================ applyRedemption

    @Test
    void redeemsTheItemTheCustomerPicked() {
        LoyaltyMember member = memberWithReward();
        stubRedemption(program(LATTE_ID, MUFFIN_ID), member);
        Order order = order();

        loyaltyService.applyRedemption(order, true, LATTE_ID);

        // latte (1.500) free, not the cheaper muffin; VAT on it (0.075) waived too
        assertThat(order.getLoyaltyRewardDiscount()).isEqualByComparingTo("1.500");
        assertThat(order.getVatAmount()).isEqualByComparingTo("0.065");
        assertThat(order.getTotal()).isEqualByComparingTo("1.365");
        assertThat(member.getAvailableRewards()).isZero();
        verify(txnRepository).save(any(LoyaltyTransaction.class));
    }

    @Test
    void legacyRequestWithoutPickRedeemsTheCheapestEligibleLine() {
        stubRedemption(program(LATTE_ID, MUFFIN_ID), memberWithReward());
        Order order = order();

        loyaltyService.applyRedemption(order, true, null);

        assertThat(order.getLoyaltyRewardDiscount()).isEqualByComparingTo("0.800");
        assertThat(order.getTotal()).isEqualByComparingTo("2.100"); // 2.940 - 0.800 - 0.040
    }

    @Test
    void rejectsPickThatIsNotARewardItem() {
        stubRedemption(program(LATTE_ID, MUFFIN_ID), memberWithReward());

        assertThatThrownBy(() -> loyaltyService.applyRedemption(order(), true, TEA_ID))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("not part of this café's loyalty reward");
    }

    @Test
    void rejectsRedemptionWhenNoEligibleItemIsInTheCart() {
        stubRedemption(program(999L), memberWithReward());

        assertThatThrownBy(() -> loyaltyService.applyRedemption(order(), true, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Add one of the reward items");
    }

    @Test
    void rejectsRedemptionWithoutAnAvailableReward() {
        LoyaltyMember member = memberWithReward();
        member.setAvailableRewards(0);
        stubRedemption(program(LATTE_ID), member);

        assertThatThrownBy(() -> loyaltyService.applyRedemption(order(), true, LATTE_ID))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("don't have a reward");
    }

    // ============================================================ updateProgram

    @Test
    void cannotEnableWithoutRewardItems() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);

        LoyaltyProgramRequest req = new LoyaltyProgramRequest(
                true, 8, "Free coffee", List.of(), null, null, null, null, null);

        assertThatThrownBy(() -> loyaltyService.updateProgram(req))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("at least one");
        verify(programRepository, never()).save(any());
    }

    @Test
    void rejectsRewardItemsFromAnotherRestaurant() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);
        MenuItem foreign = new MenuItem();
        foreign.setId(LATTE_ID);
        foreign.setRestaurantId(2L);
        when(menuItemRepository.findAllById(Set.of(LATTE_ID))).thenReturn(List.of(foreign));

        LoyaltyProgramRequest req = new LoyaltyProgramRequest(
                true, 8, "Free coffee", List.of(LATTE_ID), null, null, null, null, null);

        assertThatThrownBy(() -> loyaltyService.updateProgram(req))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("your own menu");
        verify(programRepository, never()).save(any());
    }

    @Test
    void savesTheRewardItemList() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);
        MenuItem latte = new MenuItem();
        latte.setId(LATTE_ID);
        latte.setRestaurantId(RESTAURANT_ID);
        MenuItem muffin = new MenuItem();
        muffin.setId(MUFFIN_ID);
        muffin.setRestaurantId(RESTAURANT_ID);
        when(menuItemRepository.findAllById(any())).thenReturn(List.of(latte, muffin));
        when(programRepository.findByRestaurantId(RESTAURANT_ID)).thenReturn(Optional.empty());
        when(programRepository.save(any(LoyaltyProgram.class))).thenAnswer(inv -> inv.getArgument(0));

        LoyaltyProgramRequest req = new LoyaltyProgramRequest(
                true, 8, "Free drink", List.of(LATTE_ID, MUFFIN_ID), null, null, null, null, null);

        var saved = loyaltyService.updateProgram(req);

        assertThat(saved.rewardItemIds()).containsExactly(LATTE_ID, MUFFIN_ID);
        assertThat(saved.enabled()).isTrue();
    }

    // ============================================================ card style

    private LoyaltyProgramRequest styledRequest(String color, String icon, String motif) {
        return styledRequest(color, null, icon, motif);
    }

    private LoyaltyProgramRequest styledRequest(String color, String bg, String icon, String motif) {
        return new LoyaltyProgramRequest(false, 8, "Free coffee", List.of(), null, color, bg, icon, motif);
    }

    private void stubSaveThrough() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);
        when(programRepository.findByRestaurantId(RESTAURANT_ID)).thenReturn(Optional.empty());
        when(programRepository.save(any(LoyaltyProgram.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void savesCardStyle() {
        stubSaveThrough();

        var saved = loyaltyService.updateProgram(styledRequest("#FF7AA2", "#221A14", "🥐", "cup"));

        assertThat(saved.cardColor()).isEqualTo("#FF7AA2");
        assertThat(saved.cardBg()).isEqualTo("#221A14");
        assertThat(saved.stampIcon()).isEqualTo("🥐");
        assertThat(saved.cardMotif()).isEqualTo("cup");
    }

    @Test
    void rejectsBadCardBackground() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);

        assertThatThrownBy(() -> loyaltyService.updateProgram(styledRequest(null, "black", null, null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("background");
        verify(programRepository, never()).save(any());
    }

    @Test
    void blankStyleFallsBackToDefaults() {
        stubSaveThrough();

        var saved = loyaltyService.updateProgram(styledRequest("  ", " ", ""));

        assertThat(saved.cardColor()).isNull();
        assertThat(saved.stampIcon()).isEqualTo("★");
        assertThat(saved.cardMotif()).isNull();
    }

    @Test
    void rejectsBadCardColor() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);

        assertThatThrownBy(() -> loyaltyService.updateProgram(styledRequest("red", null, null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("#RRGGBB");
        verify(programRepository, never()).save(any());
    }

    @Test
    void rejectsUnknownCardMotif() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);

        assertThatThrownBy(() -> loyaltyService.updateProgram(styledRequest(null, null, "sparkles")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("pattern");
        verify(programRepository, never()).save(any());
    }

    // ============================================================ branch attribution

    /**
     * The card is restaurant-wide on purpose, but every stamp and every reward happens
     * somewhere. Without the branch on the ledger row a two-shop café cannot tell which of
     * them is giving the rewards away.
     */
    @Test
    void aRedemptionRecordsTheBranchItHappenedAt() {
        LoyaltyProgram program = program(LATTE_ID);
        stubRedemption(program, memberWithReward());

        loyaltyService.applyRedemption(order(), true, LATTE_ID);

        ArgumentCaptor<LoyaltyTransaction> saved = ArgumentCaptor.forClass(LoyaltyTransaction.class);
        verify(txnRepository).save(saved.capture());
        assertThat(saved.getValue().getBranchId()).isEqualTo(BRANCH_ID);
    }

    @Test
    void activityIsGroupedByBranchAndNamed() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);
        when(accessGuard.scopedBranchId()).thenReturn(null);
        when(branchService.listByRestaurant(RESTAURANT_ID)).thenReturn(List.of(
                branchResponse(BRANCH_ID, "Mutrah", "مطرح"),
                branchResponse(8L, "Qurum", "القرم")));
        when(txnRepository.activityByBranch(eq(RESTAURANT_ID), isNull(), any(), any()))
                .thenReturn(List.<Object[]>of(
                        new Object[]{BRANCH_ID, 40L, 2L},
                        new Object[]{8L, 5L, 9L}));

        var rows = loyaltyService.branchActivity(null, Instant.EPOCH, Instant.now());

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).branchNameEn()).isEqualTo("Mutrah");
        assertThat(rows.get(0).stampsEarned()).isEqualTo(40L);
        assertThat(rows.get(0).rewardsRedeemed()).isEqualTo(2L);
        /* The point of the report: Qurum hands over far more than it issues, so it is
           carrying the cost of collecting done elsewhere. */
        assertThat(rows.get(1).rewardsRedeemed()).isGreaterThan(rows.get(1).stampsEarned());
    }

    /** Rows written before attribution existed have no branch; they are reported, not dropped. */
    @Test
    void activityKeepsUnattributedRowsInTheirOwnBucket() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);
        when(accessGuard.scopedBranchId()).thenReturn(null);
        when(branchService.listByRestaurant(RESTAURANT_ID)).thenReturn(List.of());
        when(txnRepository.activityByBranch(eq(RESTAURANT_ID), isNull(), any(), any()))
                .thenReturn(List.<Object[]>of(new Object[]{null, 12L, 3L}));

        var rows = loyaltyService.branchActivity(null, Instant.EPOCH, Instant.now());

        assertThat(rows).singleElement().satisfies(r -> {
            assertThat(r.branchId()).isNull();
            assertThat(r.branchNameEn()).isNull();
            assertThat(r.stampsEarned()).isEqualTo(12L);
        });
    }

    /** A branch-scoped user sees their own branch, whatever they ask for. */
    @Test
    void branchScopedStaffCannotWidenTheReport() {
        when(accessGuard.scopedRestaurantId()).thenReturn(RESTAURANT_ID);
        when(accessGuard.scopedBranchId()).thenReturn(BRANCH_ID);
        when(branchService.listByRestaurant(RESTAURANT_ID)).thenReturn(List.of());
        when(txnRepository.activityByBranch(eq(RESTAURANT_ID), eq(BRANCH_ID), any(), any()))
                .thenReturn(List.of());

        loyaltyService.branchActivity(8L, Instant.EPOCH, Instant.now());

        verify(txnRepository).activityByBranch(eq(RESTAURANT_ID), eq(BRANCH_ID), any(), any());
    }

    private static BranchResponse branchResponse(Long id, String nameEn, String nameAr) {
        return new BranchResponse(id, RESTAURANT_ID, nameEn, nameEn, nameAr, null, null, null,
                true, true, false, false, null, null);
    }
}
