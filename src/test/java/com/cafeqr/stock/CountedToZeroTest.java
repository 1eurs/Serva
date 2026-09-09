package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.stock.domain.MovementReason;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.domain.StockMovement;
import com.cafeqr.stock.repository.RecipeLineRepository;
import com.cafeqr.stock.repository.StockItemRepository;
import com.cafeqr.stock.repository.StockLevelRepository;
import com.cafeqr.stock.repository.StockMovementRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Counting an empty shelf has to leave a mark.
 *
 * <p>Never counted and counted-to-zero are different facts, and the whole stock feature leans
 * on the difference: an ingredient nobody has ever counted must not take a menu item off sale
 * (see {@code StockConsumptionService.neverCounted}), because a figure nobody supplied is not
 * a shortage. That rule turned the most ordinary first action an owner takes — walk the shelf,
 * find nothing there, record nothing there — into a no-op: zero minus zero is no movement, so
 * neither the ledger line nor the level row was written, the good stayed "never counted", the
 * item stayed on sale, and the customer heard about it at checkout.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CountedToZeroTest {

    private static final long RESTAURANT = 1L;
    private static final long BRANCH = 7L;
    private static final long CROISSANTS = 42L;

    @Mock private StockItemRepository itemRepository;
    @Mock private StockLevelRepository levelRepository;
    @Mock private StockMovementRepository movementRepository;
    @Mock private RecipeLineRepository recipeLineRepository;
    @Mock private BranchService branchService;
    @Mock private AccessGuard accessGuard;

    private StockService stockService;

    @BeforeEach
    void setUp() {
        stockService = new StockService(itemRepository, levelRepository, movementRepository,
                recipeLineRepository, branchService, accessGuard);

        StockItem croissants = new StockItem();
        croissants.setId(CROISSANTS);
        croissants.setRestaurantId(RESTAURANT);
        croissants.setNameEn("Croissants");
        when(itemRepository.findById(CROISSANTS)).thenReturn(Optional.of(croissants));
    }

    /** No level row yet — the shelf has never been spoken about. */
    private void neverCounted() {
        when(levelRepository.findByStockItemIdAndBranchId(CROISSANTS, BRANCH))
                .thenReturn(Optional.empty());
        StockLevel created = new StockLevel();
        created.setStockItemId(CROISSANTS);
        created.setBranchId(BRANCH);
        created.setQuantityBase(BigDecimal.ZERO);
        when(levelRepository.lock(CROISSANTS, BRANCH))
                .thenReturn(Optional.empty(), Optional.of(created));
    }

    @Test
    void countingAnEmptyShelfIsRecordedEvenThoughNothingMoved() {
        neverCounted();

        stockService.adjustTo(BRANCH, CROISSANTS, BigDecimal.ZERO, "opening count", true);

        // The row's existence is what tells the rest of the system somebody has looked here.
        verify(levelRepository).insertIfAbsent(CROISSANTS, BRANCH);
        ArgumentCaptor<StockMovement> written = ArgumentCaptor.forClass(StockMovement.class);
        verify(movementRepository).save(written.capture());
        assertThat(written.getValue().getReason()).isEqualTo(MovementReason.COUNT);
        assertThat(written.getValue().getDeltaBase()).isEqualByComparingTo("0");
        assertThat(written.getValue().getBalanceAfter()).isEqualByComparingTo("0");
    }

    /**
     * A correction is not a count. Typing the same figure over itself says nothing new about
     * the shelf, so it stays out of the ledger — only walking it counts as looking.
     */
    @Test
    void aCorrectionThatChangesNothingStillWritesNothing() {
        neverCounted();

        stockService.adjustTo(BRANCH, CROISSANTS, BigDecimal.ZERO, "typo", false);

        verify(levelRepository, never()).insertIfAbsent(any(), any());
        verify(movementRepository, never()).save(any());
    }

    /** The ordinary case must keep working: a real difference posts a real movement. */
    @Test
    void aCountThatFindsADifferencePostsIt() {
        StockLevel level = new StockLevel();
        level.setStockItemId(CROISSANTS);
        level.setBranchId(BRANCH);
        level.setQuantityBase(new BigDecimal("6"));
        when(levelRepository.findByStockItemIdAndBranchId(CROISSANTS, BRANCH))
                .thenReturn(Optional.of(level));
        when(levelRepository.lock(CROISSANTS, BRANCH)).thenReturn(Optional.of(level));

        stockService.adjustTo(BRANCH, CROISSANTS, BigDecimal.ZERO, "sold the lot", true);

        ArgumentCaptor<StockMovement> written = ArgumentCaptor.forClass(StockMovement.class);
        verify(movementRepository).save(written.capture());
        assertThat(written.getValue().getDeltaBase()).isEqualByComparingTo("-6");
        assertThat(level.getQuantityBase()).isEqualByComparingTo("0");
    }
}
