package com.cafeqr.stock;

import com.cafeqr.auth.security.AccessGuard;
import com.cafeqr.stock.domain.PurchaseOrder;
import com.cafeqr.stock.domain.PurchaseOrderLine;
import com.cafeqr.stock.domain.PurchaseOrderStatus;
import com.cafeqr.stock.domain.StockItem;
import com.cafeqr.stock.domain.StockLevel;
import com.cafeqr.stock.repository.PurchaseOrderRepository;
import com.cafeqr.stock.repository.SupplierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

/**
 * An order has to stop being an order once the goods turn up.
 *
 * <p>The order list is the message the café sends its supplier, and before this it had no
 * memory: an owner copied it into WhatsApp and the same four items were still sitting there
 * that evening, and the next, until the delivery happened to lift stock back over its
 * reorder point. The fix is that logging the delivery — which the owner already does — is
 * what closes the order, rather than a second "mark it arrived" tap on another screen.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OrderSettlementTest {

    private static final long BRANCH = 7L;
    private static final long BEANS = 1L;
    private static final long MILK = 2L;

    @Mock private SupplierRepository supplierRepository;
    @Mock private PurchaseOrderRepository purchaseOrderRepository;
    @Mock private StockService stockService;
    @Mock private AccessGuard accessGuard;

    private PurchasingService service;

    @BeforeEach
    void setUp() {
        service = new PurchasingService(supplierRepository, purchaseOrderRepository,
                stockService, accessGuard);
    }

    private static PurchaseOrderLine line(long itemId, String ordered, String received) {
        PurchaseOrderLine l = new PurchaseOrderLine();
        l.setStockItemId(itemId);
        l.setQuantityBase(new BigDecimal(ordered));
        l.setQuantityReceivedBase(new BigDecimal(received));
        return l;
    }

    private static PurchaseOrder order(PurchaseOrderLine... lines) {
        PurchaseOrder po = new PurchaseOrder();
        po.setBranchId(BRANCH);
        po.setStatus(PurchaseOrderStatus.SENT);
        for (PurchaseOrderLine l : lines) {
            po.addLine(l);
        }
        return po;
    }

    private void openOrders(PurchaseOrder... orders) {
        when(purchaseOrderRepository.findByBranchIdAndStatusInOrderByCreatedAtDesc(anyLong(), org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(List.of(orders));
    }

    @Test
    void aDeliveryThatCoversTheOrderClosesIt() {
        PurchaseOrder po = order(line(BEANS, "6000", "0"));
        openOrders(po);

        service.settleFromDelivery(BRANCH, Map.of(BEANS, new BigDecimal("6000")));

        assertThat(po.getStatus()).isEqualTo(PurchaseOrderStatus.RECEIVED);
        assertThat(po.getLines().get(0).outstandingBase()).isEqualByComparingTo("0");
    }

    @Test
    void aShortDeliveryLeavesTheRestOutstanding() {
        PurchaseOrder po = order(line(BEANS, "6000", "0"));
        openOrders(po);

        service.settleFromDelivery(BRANCH, Map.of(BEANS, new BigDecimal("2000")));

        assertThat(po.getStatus()).isEqualTo(PurchaseOrderStatus.PARTIAL);
        assertThat(po.getLines().get(0).outstandingBase()).isEqualByComparingTo("4000");
    }

    /** Half an order arriving must not close the half that did not. */
    @Test
    void anOrderWithAnUntouchedLineStaysOpen() {
        PurchaseOrder po = order(line(BEANS, "6000", "0"), line(MILK, "24000", "0"));
        openOrders(po);

        service.settleFromDelivery(BRANCH, Map.of(BEANS, new BigDecimal("6000")));

        assertThat(po.getStatus()).isEqualTo(PurchaseOrderStatus.PARTIAL);
        assertThat(po.getLines().get(1).outstandingBase()).isEqualByComparingTo("24000");
    }

    /** More arrived than was ever ordered: the surplus is stock, not an overpaid order. */
    @Test
    void aSurplusDeliveryDoesNotOverpayTheLine() {
        PurchaseOrder po = order(line(BEANS, "6000", "0"));
        openOrders(po);

        service.settleFromDelivery(BRANCH, Map.of(BEANS, new BigDecimal("10000")));

        assertThat(po.getLines().get(0).getQuantityReceivedBase()).isEqualByComparingTo("6000");
        assertThat(po.getStatus()).isEqualTo(PurchaseOrderStatus.RECEIVED);
    }

    /** listOrders returns newest first, so the oldest waiting order is paid down first. */
    @Test
    void theOldestWaitingOrderIsSettledFirst() {
        PurchaseOrder newer = order(line(BEANS, "6000", "0"));
        PurchaseOrder older = order(line(BEANS, "6000", "0"));
        openOrders(newer, older);   // repository order: newest first

        service.settleFromDelivery(BRANCH, Map.of(BEANS, new BigDecimal("6000")));

        assertThat(older.getStatus()).isEqualTo(PurchaseOrderStatus.RECEIVED);
        assertThat(newer.getStatus()).isEqualTo(PurchaseOrderStatus.SENT);
    }

    @Test
    void aDeliveryOfSomethingNobodyOrderedChangesNothing() {
        PurchaseOrder po = order(line(BEANS, "6000", "0"));
        openOrders(po);

        service.settleFromDelivery(BRANCH, Map.of(MILK, new BigDecimal("24000")));

        assertThat(po.getStatus()).isEqualTo(PurchaseOrderStatus.SENT);
        assertThat(po.getLines().get(0).outstandingBase()).isEqualByComparingTo("6000");
    }

    /**
     * The order list is a message to a supplier, so it must not ask for what is already
     * coming — the complaint that started this: "I ordered these beans an hour ago."
     */
    @Test
    void suggestionsSubtractWhatIsAlreadyOnOrder() {
        StockItem beans = new StockItem();
        beans.setId(BEANS);
        beans.setNameEn("Espresso beans");

        StockLevel level = new StockLevel();
        level.setStockItemId(BEANS);
        level.setBranchId(BRANCH);
        level.setQuantityBase(new BigDecimal("800"));
        level.setReorderPointBase(new BigDecimal("2000"));
        level.setParLevelBase(new BigDecimal("6000"));

        when(stockService.listItems(anyBoolean())).thenReturn(List.of(beans));
        when(stockService.levelsByItem(BRANCH)).thenReturn(Map.of(BEANS, level));

        // nothing on order: the whole shortfall is suggested
        openOrders();
        assertThat(service.suggestions(BRANCH))
                .singleElement()
                .extracting(PurchasingService.Suggestion::suggestedBase)
                .isEqualTo(new BigDecimal("5200"));

        // part of it already coming: only the remainder is asked for
        openOrders(order(line(BEANS, "4000", "0")));
        assertThat(service.suggestions(BRANCH))
                .singleElement()
                .extracting(PurchasingService.Suggestion::suggestedBase)
                .isEqualTo(new BigDecimal("1200"));

        // the whole shortfall is on its way: the line disappears from the list
        openOrders(order(line(BEANS, "6000", "0")));
        assertThat(service.suggestions(BRANCH)).isEmpty();
    }
}
