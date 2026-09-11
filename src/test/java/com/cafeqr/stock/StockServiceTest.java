package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.branches.BranchService;
import com.cafeqr.branches.domain.Branch;
import com.cafeqr.common.exception.BadRequestException;
import com.cafeqr.common.exception.ConflictException;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockUnit;
import com.cafeqr.stock.dto.StockDtos.CountRequest;
import com.cafeqr.stock.dto.StockDtos.CreateStockItemRequest;
import com.cafeqr.stock.dto.StockDtos.ReceiveRequest;
import com.cafeqr.stock.dto.StockDtos.StockItemResponse;
import com.cafeqr.stock.dto.StockDtos.UpdateStockItemRequest;
import com.cafeqr.stock.repository.StockItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The shelf's arithmetic, and the distinction the whole feature rests on: a delivery adds to
 * the figure, a count replaces it, and an edit touches neither.
 */
@ExtendWith(MockitoExtension.class)
class StockServiceTest {

    @Mock private StockItemRepository stockItemRepository;
    @Mock private BranchService branchService;
    @Mock private AccessGuard accessGuard;

    private StockService stockService;
    private StockItem milk;

    @BeforeEach
    void setUp() {
        stockService = new StockService(stockItemRepository, branchService, accessGuard);

        Branch branch = new Branch();
        branch.setId(2L);
        branch.setRestaurantId(1L);
        lenient().when(branchService.getEntity(2L)).thenReturn(branch);

        milk = new StockItem();
        milk.setId(5L);
        milk.setRestaurantId(1L);
        milk.setBranchId(2L);
        milk.setNameEn("Milk");
        milk.setUnit(StockUnit.L);
        milk.setQuantity(new BigDecimal("12.000"));
        milk.setReorderPoint(new BigDecimal("4.000"));
        lenient().when(stockItemRepository.findById(5L)).thenReturn(Optional.of(milk));
        lenient().when(stockItemRepository.findByBranchIdOrderByIdAsc(2L)).thenReturn(List.of(milk));
        lenient().when(stockItemRepository.save(any(StockItem.class)))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void receiveAddsToWhatIsThere() {
        StockItemResponse after = stockService.receive(5L, new ReceiveRequest(new BigDecimal("6"), null));

        assertThat(after.quantity()).isEqualByComparingTo("18.000");
        // Nobody handed over a price, so the one already on the item stands.
        assertThat(after.unitPrice()).isNull();
        assertThat(after.lastMovedAt()).isNotNull();
    }

    @Test
    void receiveCarriesThePriceOffTheInvoiceWhenItIsToHand() {
        stockService.receive(5L, new ReceiveRequest(new BigDecimal("2"), new BigDecimal("0.4505")));

        // Three decimals, like every other figure in the app — OMR has no fourth.
        assertThat(milk.getUnitPrice()).isEqualByComparingTo("0.451");
    }

    @Test
    void countReplacesTheFigureRatherThanAddingToIt() {
        StockItemResponse after = stockService.count(5L, new CountRequest(new BigDecimal("3.5")));

        assertThat(after.quantity()).isEqualByComparingTo("3.500");
    }

    @Test
    void editingAnItemLeavesTheQuantityAlone() {
        stockService.update(5L, new UpdateStockItemRequest(null, "Whole milk", null, StockUnit.L, new BigDecimal("6"), null, null, null));

        assertThat(milk.getNameEn()).isEqualTo("Whole milk");
        assertThat(milk.getReorderPoint()).isEqualByComparingTo("6.000");
        assertThat(milk.getQuantity()).isEqualByComparingTo("12.000");
    }

    @Test
    void emptyingTheOrderLineClearsIt() {
        // PATCH semantics would read the absent value as "leave it", which would make an order
        // line impossible to remove once set. Here the form shows the field, so empty means empty.
        stockService.update(5L, new UpdateStockItemRequest(null, "Milk", null, StockUnit.L, null, null, null, null));

        assertThat(milk.getReorderPoint()).isNull();
    }

    @Test
    void anArabicNameIsFiledAsArabic() {
        StockItemResponse added = stockService.create(2L, new CreateStockItemRequest(
                "حليب طازج", null, null, StockUnit.L, new BigDecimal("9"), new BigDecimal("3"), null, null, null));

        assertThat(added.nameAr()).isEqualTo("حليب طازج");
        assertThat(added.nameEn()).isNull();
        assertThat(added.quantity()).isEqualByComparingTo("9.000");
        // An opening figure is somebody saying what is on the shelf, so it is dated.
        assertThat(added.lastMovedAt()).isNotNull();
    }

    @Test
    void anItemSetUpEmptyHasNoCountDate() {
        StockItemResponse added = stockService.create(2L, new CreateStockItemRequest(
                "Cups", null, null, StockUnit.PIECE, null, null, null, null, null));

        assertThat(added.quantity()).isEqualByComparingTo("0.000");
        assertThat(added.lastMovedAt()).isNull();
    }

    @Test
    void theSameNameTwiceInOneBranchIsRefused() {
        // Two rows of milk in one fridge: both half right, both topped up by whoever opened the
        // page, neither of them the shelf.
        assertThatThrownBy(() -> stockService.create(2L, new CreateStockItemRequest(
                "  milk ", null, null, StockUnit.L, null, null, null, null, null)))
                .isInstanceOf(ConflictException.class);

        verify(stockItemRepository, org.mockito.Mockito.never()).save(any(StockItem.class));
    }

    @Test
    void renamingIntoTheOtherScriptLeavesTheItemWithOneName() {
        // The dashboard shows one name field over two columns, so a real rename sends the new
        // word in its own script and an empty string for the other side. Without the empty
        // string an item that carried both names would keep the one it was not renamed to.
        milk.setNameAr("حليب");

        stockService.update(5L, new UpdateStockItemRequest(null, "", "حليب طازج", StockUnit.L, null, null, null, null));

        assertThat(milk.getNameEn()).isNull();
        assertThat(milk.getNameAr()).isEqualTo("حليب طازج");
    }

    @Test
    void renamingAnItemDoesNotClashWithItself() {
        stockService.update(5L, new UpdateStockItemRequest("Milk", null, null, StockUnit.L, null, null, null, null));

        assertThat(milk.getNameEn()).isEqualTo("Milk");
    }

    @Test
    void aPieceMaySayWhatItHolds() {
        StockItemResponse bottles = stockService.create(2L, new CreateStockItemRequest(
                "Milk bottles", null, null, StockUnit.PIECE, new BigDecimal("12"), null, null,
                new BigDecimal("1"), StockUnit.L));

        assertThat(bottles.packSize()).isEqualByComparingTo("1.000");
        assertThat(bottles.packUnit()).isEqualTo(StockUnit.L);
    }

    @Test
    void onlyAPieceHasContentsAndOnlyInAWeightOrVolume() {
        // A shelf in litres already speaks millilitres; contents would be a second answer.
        assertThatThrownBy(() -> stockService.create(2L, new CreateStockItemRequest(
                "Bulk milk", null, null, StockUnit.L, null, null, null, new BigDecimal("1"), StockUnit.L)))
                .isInstanceOf(BadRequestException.class);
        // "A sleeve of 50 cups" would make a recipe line reading "1" ambiguous.
        assertThatThrownBy(() -> stockService.create(2L, new CreateStockItemRequest(
                "Cups", null, null, StockUnit.PIECE, null, null, null, new BigDecimal("50"), StockUnit.PIECE)))
                .isInstanceOf(BadRequestException.class);
        // Half an answer is refused rather than guessed.
        assertThatThrownBy(() -> stockService.create(2L, new CreateStockItemRequest(
                "Syrup", null, null, StockUnit.PIECE, null, null, null, new BigDecimal("750"), null)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void aShelfThatStopsBeingCountedInPiecesLosesItsContents() {
        milk.setUnit(StockUnit.PIECE);
        milk.setPackSize(BigDecimal.ONE);
        milk.setPackUnit(StockUnit.L);

        stockService.update(5L, new UpdateStockItemRequest(
                null, "Milk", null, StockUnit.L, null, null, null, null));

        assertThat(milk.getPackSize()).isNull();
        assertThat(milk.getPackUnit()).isNull();
    }

    @Test
    void theFactorReadsARecipeInTheContentsUnit() {
        milk.setUnit(StockUnit.PIECE);
        milk.setPackSize(BigDecimal.ONE);
        milk.setPackUnit(StockUnit.L);

        // 200 ml of a 1 L bottle is a fifth of a piece; a litre is one piece; grams are nonsense.
        assertThat(milk.factorFrom(StockUnit.ML).multiply(new BigDecimal("200"))).isEqualByComparingTo("0.2");
        assertThat(milk.factorFrom(StockUnit.L)).isEqualByComparingTo("1");
        assertThat(milk.factorFrom(StockUnit.PIECE)).isEqualByComparingTo("1");
        assertThat(milk.factorFrom(StockUnit.G)).isNull();
    }

    @Test
    void everyWayInChecksTheBranchItBelongsTo() {
        stockService.list(2L);
        stockService.receive(5L, new ReceiveRequest(BigDecimal.ONE, null));
        stockService.count(5L, new CountRequest(BigDecimal.ONE));
        stockService.delete(5L);

        verify(accessGuard, org.mockito.Mockito.times(4)).requireBranchAccess(1L, 2L);
    }
}
