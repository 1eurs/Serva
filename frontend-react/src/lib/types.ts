// TypeScript mirrors of the backend DTOs (only the fields the UI uses).

export type Lang = 'ar' | 'en';

export type Permission =
  | 'PLATFORM_ADMIN' | 'ORDERS' | 'PAYMENTS' | 'MENU'
  | 'QR_TABLES' | 'TEAM' | 'ANALYTICS' | 'PROFILE' | 'BRANCHES' | 'BILLING' | 'STOCK';
export type OrderType = 'DINE_IN' | 'CAR';
export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'DECLINED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'CARD' | 'ONLINE' | 'OTHER';
export type SubscriptionStatus = 'PENDING_PAYMENT' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export type SubscriptionPaymentMethod = 'BANK_TRANSFER';

export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errorCode?: string;
}

export interface UserResponse {
  id: number;
  fullName: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  permissions: Permission[];
  owner: boolean;
  restaurantId?: number | null;
  branchId?: number | null;
  active: boolean;
  /** Invited but not yet claimed — shows as pending, not as a disabled account. */
  pendingInvite?: boolean;
}
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresInSeconds: number;
  user: UserResponse;
}

/* ---- public menu (App A) ---- */
export interface PublicRestaurant {
  id: number; name: string; slug: string; logoUrl?: string | null; phone?: string | null;
  instagramUrl?: string | null; currency: string; vatEnabled: boolean; vatRate: number; // percent (5 = 5%)
  theme?: string | null; // menu look chosen by the café owner (see menuThemes.ts); optional
  themeCustomJson?: string | null;
}
export interface PublicBranch {
  id: number; name: string; address?: string | null; phone?: string | null;
  openingHours?: string | null; acceptingOrders: boolean;
}
export interface PublicTable { id: number; tableNumber: string; qrCodeToken: string; }
export interface PublicOption {
  id: number; nameEn: string; nameAr: string; priceDelta: number; displayOrder: number;
}
export interface PublicOptionGroup {
  id: number; nameEn: string; nameAr: string; selectionType: 'SINGLE' | 'MULTI';
  required: boolean; displayOrder: number; options: PublicOption[];
}
export interface PublicItem {
  id: number; nameEn: string; nameAr: string; descriptionEn?: string | null; descriptionAr?: string | null;
  price: number; salePrice?: number | null; // discounted base price when a discount is currently active
  imageUrl?: string | null; images?: string[] | null; available: boolean;
  /**
   * Ran out rather than switched off — ingredients missing, or today's limit used up.
   * Deliberately a flag and not a "2 left!" counter: a stale scarcity number costs more
   * trust than it wins orders. Use {@link sellable} rather than reading this directly.
   */
  soldOut?: boolean;
  /** Rolled up from the recipe, so the badge stays right without anyone maintaining it. */
  allergens?: Allergen[] | null;
  preparationTimeMinutes?: number | null; displayOrder: number; optionGroups?: PublicOptionGroup[];
}

/** Can a customer order this right now? Switched off by the café, or out of stock — same answer. */
export const sellable = (i: Pick<PublicItem, 'available' | 'soldOut'> | undefined | null): boolean =>
  !!i && i.available && !i.soldOut;
export interface PublicCategory {
  id: number; nameEn: string; nameAr: string; descriptionEn?: string | null; descriptionAr?: string | null;
  displayOrder: number; items: PublicItem[];
}
export interface PublicMenu {
  restaurant: PublicRestaurant; branch?: PublicBranch | null; table?: PublicTable | null; categories: PublicCategory[];
}

/* ---- orders ---- */
export interface OrderItem {
  id?: number; menuItemId?: number; nameEn: string; nameAr: string; quantity: number;
  price: number; lineTotal: number; note?: string | null;
}
export interface OrderTracking {
  orderNumber: string; dailyNumber: number; trackingToken: string; orderType: OrderType; status: OrderStatus; paymentStatus: PaymentStatus;
  subtotal: number; vatAmount: number; total: number; prepTimeMinutes?: number | null; declineReason?: string | null;
  customerName?: string | null; carPlate?: string | null; carColor?: string | null; customerNote?: string | null;
  loyaltyRewardLabel?: string | null; loyaltyRewardDiscount?: number | null; loyalty?: LoyaltySummary | null; stampEarned?: boolean | null; items: OrderItem[];
  createdAt: string; acceptedAt?: string | null; preparingAt?: string | null; readyAt?: string | null;
  completedAt?: string | null; cancelledAt?: string | null; declinedAt?: string | null;
}
// full dashboard order (live board / detail) — mirrors OrderResponse.java
export interface OrderResponse {
  id: number; orderNumber: string; dailyNumber: number; trackingToken: string; restaurantId: number; branchId: number; tableId?: number | null;
  customerName?: string | null; customerPhone?: string | null; carPlate?: string | null; carColor?: string | null; orderType: OrderType; status: OrderStatus; paymentStatus: PaymentStatus;
  subtotal: number; vatAmount: number; total: number; prepTimeMinutes?: number | null; declineReason?: string | null;
  customerNote?: string | null; internalNote?: string | null; loyaltyRewardLabel?: string | null; loyaltyRewardDiscount?: number | null;
  paymentMethod?: PaymentMethod | null; items: OrderItem[];
  createdAt: string; acceptedAt?: string | null; declinedAt?: string | null; preparingAt?: string | null;
  readyAt?: string | null; completedAt?: string | null; cancelledAt?: string | null;
}

export interface BranchResponse {
  id: number; restaurantId: number; name: string; address?: string | null; phone?: string | null;
  openingHours?: string | null; active: boolean; acceptingOrders: boolean; printerEnabled: boolean; createdAt?: string;
}
export interface TableResponse {
  id: number; restaurantId: number; branchId: number; tableNumber: string; qrCodeToken: string;
  qrCodeUrl?: string | null; active: boolean;
}

export interface OrderSummaryResponse {
  id: number; orderNumber: string; dailyNumber: number; branchId?: number | null; tableId?: number | null; customerName?: string | null;
  carPlate?: string | null; carColor?: string | null; orderType: OrderType; status: OrderStatus; paymentStatus: PaymentStatus; total: number; prepTimeMinutes?: number | null; createdAt: string;
}
export interface PageResponse<T> { content: T[]; page: number; size: number; totalElements: number; totalPages: number; last: boolean; }

/* ---- menu management ---- */
export interface CategoryResponse {
  id: number; restaurantId: number; branchId?: number | null; nameEn: string; nameAr: string;
  descriptionEn?: string | null; descriptionAr?: string | null; displayOrder: number; active: boolean;
}
export interface MenuItemOptionRow { id?: number; nameEn: string; nameAr: string; priceDelta: number; displayOrder: number; }
export interface MenuItemOptionGroupRow {
  id?: number; nameEn: string; nameAr: string; selectionType: 'SINGLE' | 'MULTI'; required: boolean;
  displayOrder: number; options: MenuItemOptionRow[];
}
export type DiscountType = 'PERCENT' | 'FIXED';
export interface MenuItemResponse {
  id: number; restaurantId: number; branchId?: number | null; categoryId: number; nameEn: string; nameAr: string;
  descriptionEn?: string | null; descriptionAr?: string | null; price: number; imageUrl?: string | null;
  // Optional discount: PERCENT (value = % off) or FIXED (value = sale price); window optional.
  discountType?: DiscountType | null; discountValue?: number | null;
  discountStartsAt?: string | null; discountEndsAt?: string | null;
  images?: string[] | null; available: boolean; preparationTimeMinutes?: number | null; displayOrder: number;
  optionGroups?: MenuItemOptionGroupRow[] | null;
  // Stock (read-only here — configured through the stock API, not the menu editor).
  stockMode?: StockMode | null; stockItemId?: number | null;
  dailyLimit?: number | null; remainingToday?: number | null;
  autoUnavailable?: boolean; packagingRuleId?: number | null;
}

export interface SelectedOption { optionGroupId: number; optionId: number; }
export interface CreateOrderItem {
  menuItemId: number; quantity: number; note?: string | null;
  selectedOptions?: SelectedOption[] | null;
}
export interface CreateOrderPayload {
  restaurantSlug: string; branchId: number; tableToken?: string | null; orderType: OrderType;
  customerName?: string | null; customerPhone?: string | null; carPlate?: string | null; carColor?: string | null; customerNote?: string | null;
  deviceToken?: string | null; phoneToken?: string | null; redeemReward?: boolean; redeemItemId?: number | null; items: CreateOrderItem[];
}
// Manual order taken by staff from the dashboard order pad — mirrors CreateStaffOrderRequest.java.
export interface CreateStaffOrderPayload {
  branchId: number; orderType: OrderType; tableId?: number | null;
  customerName?: string | null; customerPhone?: string | null;
  carPlate?: string | null; carColor?: string | null; customerNote?: string | null;
  items: CreateOrderItem[];
}

/* ---- returning customer (public) ---- */
export interface FavoriteItem { menuItemId: number; nameEn: string; nameAr: string; totalQuantity: number; ordersContaining: number; }
export interface LastOrderItem { menuItemId: number; nameEn: string; nameAr: string; quantity: number; }
export interface ReturningCustomer {
  customerName?: string | null; customerPhone?: string | null; carPlate?: string | null; carColor?: string | null;
  orderCount: number; favorites: FavoriteItem[];
  lastOrder?: { createdAt: string; items: LastOrderItem[] } | null;
  loyalty?: LoyaltySummary | null;
}

/* ---- loyalty (stamp card) ---- */
// Café configuration (dashboard) — mirrors LoyaltyProgramResponse.java.
export interface LoyaltyProgram {
  enabled: boolean; stampsRequired: number; rewardLabel: string;
  rewardItemIds: number[]; minOrderAmount?: number | null;
  cardColor?: string | null; cardBg?: string | null; stampIcon?: string | null; cardMotif?: string | null;
}
// One café's stamp progress for a phone (menu/checkout) — mirrors LoyaltySummaryResponse.java.
export interface LoyaltySummary {
  enabled: boolean; stampsRequired: number; rewardLabel?: string | null;
  rewardItemIds: number[]; stamps: number; availableRewards: number; minOrderAmount?: number | null;
  cardColor?: string | null; cardBg?: string | null; stampIcon?: string | null; cardMotif?: string | null;
}
// A café's member row (dashboard) — mirrors LoyaltyMemberResponse.java.
export interface LoyaltyMemberRow {
  phone: string; name?: string | null; stamps: number; availableRewards: number;
  lifetimeStamps: number; rewardsRedeemed: number; updatedAt: string;
}
// One café's stamp card in the cross-café portal — mirrors LoyaltyPortalEntryResponse.java.
export interface LoyaltyPortalEntry {
  restaurantSlug: string; restaurantName: string; logoUrl?: string | null;
  stampsRequired: number; rewardLabel: string; rewardItems: { nameEn?: string | null; nameAr?: string | null }[];
  stamps: number; availableRewards: number; updatedAt: string;
  cardColor?: string | null; cardBg?: string | null; stampIcon?: string | null; cardMotif?: string | null;
}

/* ---- platform admin: per-restaurant stats ---- */
export interface AdminRestaurantStats {
  restaurantId: number; ordersToday: number; orders30d: number; revenue30d: number;
  ordersTotal: number; lastOrderAt?: string | null; branches: number; menuItems: number;
}

/* ---- blocked phones (dashboard) ---- */
export interface BlockedPhone { id: number; phone: string; reason?: string | null; blockedBy?: string | null; createdAt: string; }

/* ---- admin ---- */
export type Plan = 'STANDARD' | 'PRO' | 'ENTERPRISE';

/** Pricing for one café tier (admin Plans page). monthlyPrice null = "custom". */
export interface PricingPlan {
  id: number; tier: Plan; name: string; monthlyPrice: number | null; setupFee: number;
  active: boolean; displayOrder: number; createdAt?: string; updatedAt?: string;
}
export interface Restaurant {
  id: number; name: string; slug: string; logoUrl?: string | null; phone?: string | null; email?: string | null; instagramUrl?: string | null;
  currency: string; vatEnabled: boolean; vatRate: number; theme?: string | null; themeCustomJson?: string | null;
  receiptSettingsJson?: string | null;
  paymentMethodSelectionEnabled: boolean;
  /** Whether dine-in orders consume cups/lids — ceramic cafés leave this off. */
  disposablesForDineIn?: boolean;
  /** False means stock still tracks and warns, but never takes an item off sale by itself. */
  autoHideOutOfStock?: boolean;
  active: boolean; premiumLook?: boolean; plan?: Plan; createdAt?: string;
}
export type BillingCycle = 'ONE_TIME' | 'MONTHLY' | 'YEARLY';
export interface Subscription {
  id: number; restaurantId: number; planName: string; billingCycle: BillingCycle; price: number;
  status: SubscriptionStatus; startDate?: string | null; endDate?: string | null; currentlyActive?: boolean;
  paymentMethod?: SubscriptionPaymentMethod | null; paymentReference?: string | null; paymentConfirmedAt?: string | null;
}

/* ---- live QR activity (dashboard Tables tab) ---- */
export interface QrLive { present: number; ordering: number; } // present includes ordering
export interface QrDayStat { orders: number; revenue: number; }
export interface QrCartItem { menuItemId: number; nameEn: string; nameAr: string; quantity: number; }
export interface QrActivity {
  totalPresent: number;
  totalOrdering: number;
  liveByKey: Record<string, QrLive>;        // keyed by table qrCodeToken / "car"
  cartsByKey?: Record<string, QrCartItem[]>; // live cart contents (same keys) — soft signal
  todayByKey: Record<string, QrDayStat>;    // keyed by table id (string) / "car"
}

/* ---- branch management (admin drawer) ---- */
export interface BranchResponse {
  id: number; restaurantId: number; name: string; address?: string | null; phone?: string | null;
  openingHours?: string | null; active: boolean; acceptingOrders: boolean; printerEnabled: boolean; createdAt?: string;
}


/* ---- stock & inventory ---- */

/**
 * The effort ladder a menu item opts into. Each rung is useful on its own, so a café can stop
 * climbing wherever it likes:
 *   NONE        nothing tracked
 *   DAILY_LIMIT "only 12 cheesecakes today", auto-resets — no counting, no recipes
 *   SIMPLE      counted good: one sale draws 1
 *   RECIPE      made from ingredients: 18 g beans + 200 ml milk + a cup
 */
export type StockMode = 'NONE' | 'DAILY_LIMIT' | 'SIMPLE' | 'RECIPE';
export type BaseUnit = 'G' | 'ML' | 'PIECE';
export type StockKind = 'INGREDIENT' | 'GOOD' | 'PREP';
export type CountFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type WasteReason = 'SPILLED' | 'EXPIRED' | 'STAFF_MEAL' | 'COMP' | 'TRAINING' | 'DAMAGED' | 'OTHER';
export type MovementReason =
  | 'RECEIVE' | 'SALE' | 'WASTE' | 'COUNT' | 'TRANSFER_IN' | 'TRANSFER_OUT'
  | 'MANUAL' | 'ORDER_RESTORE' | 'PREP_PRODUCE' | 'PREP_CONSUME';
export type OrderTypeScope = 'ALL' | 'DINE_IN' | 'CAR';
export type Allergen =
  | 'DAIRY' | 'GLUTEN' | 'NUTS' | 'PEANUTS' | 'SOY' | 'EGG' | 'SESAME' | 'FISH' | 'SHELLFISH';

export interface StockItemRow {
  id: number; nameEn: string; nameAr: string; kind: StockKind; baseUnit: BaseUnit;
  purchaseUnitLabel?: string | null; purchaseUnitSize: number;
  costPerBaseUnit: number; wastePct: number; batchYieldBase?: number | null;
  /** "A kilo of beans is 55 drinks" — the authoring shortcut for recipe lines. */
  servingsPerPack?: number | null;
  /** Base units one serving draws: purchaseUnitSize / servingsPerPack. Null without a yield. */
  servingQuantityBase?: number | null;
  /** What one serving of this item costs at the running average. Null without a yield. */
  servingCost?: number | null;
  category?: string | null; countFrequency?: CountFrequency | null;
  allergens: Allergen[]; nutritionJson?: string | null; supplierId?: number | null; archived: boolean;
  // per-branch position
  onHand: number; parLevel?: number | null; reorderPoint?: number | null;
  low: boolean; out: boolean;
}
export interface StockItemPayload {
  nameEn: string; nameAr: string; kind: StockKind; baseUnit: BaseUnit;
  purchaseUnitLabel?: string | null; purchaseUnitSize?: number | null;
  costPerBaseUnit?: number | null; wastePct?: number | null; batchYieldBase?: number | null;
  servingsPerPack?: number | null;
  category?: string | null; countFrequency?: CountFrequency | null;
  allergens?: Allergen[]; nutritionJson?: string | null; supplierId?: number | null;
}
export interface CoverRow {
  stockItemId: number; nameEn: string; nameAr: string; baseUnit: BaseUnit;
  onHand: number; dailyUsage: number; daysLeft?: number | null;
}
export interface StockOverview {
  branchId: number; lowCount: number; outCount: number; endingTodayCount: number;
  inventoryValue: number;
  low: StockItemRow[]; out: StockItemRow[]; endingToday: CoverRow[];
  soldOut: {
    menuItemId: number; nameEn: string | null; nameAr: string | null;
    /** OUT_OF_STOCK | DAILY_LIMIT_REACHED */
    reason: string;
    /** The one ingredient that did it; null when a daily limit is the cause. */
    blockerId?: number | null; blockerName?: string | null;
  }[];
}
export interface MovementRow {
  id: number; stockItemId: number; itemNameEn?: string | null; itemNameAr?: string | null;
  baseUnit?: BaseUnit | null; deltaBase: number; balanceAfter: number;
  reason: MovementReason; wasteReason?: WasteReason | null;
  orderId?: number | null; userId?: number | null; unitCost?: number | null;
  note?: string | null; createdAt: string;
}
export interface RecipeLineRow { stockItemId: number; quantityBase: number; orderTypeScope?: OrderTypeScope | null; }
export interface OptionRecipeRow { optionId: number; lines: RecipeLineRow[]; packagingRuleId?: number | null; }
export interface RecipeResponse {
  menuItemId: number; stockMode: StockMode; stockItemId?: number | null;
  dailyLimit?: number | null; remainingToday?: number | null; packagingRuleId?: number | null;
  lines: RecipeLineRow[]; optionRecipes: OptionRecipeRow[];
  plateCost: number; packagingCost: number; price: number;
  foodCostPercent?: number | null; margin?: number | null; allergens: Allergen[];
}
export interface RecipeSavePayload {
  stockMode: StockMode; stockItemId?: number | null; dailyLimit?: number | null;
  lines: RecipeLineRow[]; optionRecipes: OptionRecipeRow[]; packagingRuleId?: number | null;
}
export interface PackagingRule {
  id: number; nameEn: string; nameAr: string; displayOrder: number;
  lines: RecipeLineRow[]; cost: number;
}
export interface StocktakeLineRow {
  stockItemId: number; nameEn?: string | null; nameAr?: string | null; baseUnit?: BaseUnit | null;
  /**
   * Absent while a blind count is open — the server omits the field rather than nulling it,
   * so a curious member of staff can't read the expectation out of the payload. Compare with
   * `== null`, never `=== null`.
   */
  expectedBase?: number | null; countedBase?: number | null;
  variance?: number | null; varianceValue?: number | null;
}
export interface Stocktake {
  id: number; branchId: number; status: 'OPEN' | 'CLOSED' | 'CANCELLED'; scope: 'FULL' | 'CYCLE';
  blind: boolean; notes?: string | null; createdAt: string; closedAt?: string | null;
  remainingLines: number; varianceValue?: number | null; lines: StocktakeLineRow[];
}
export interface SupplierRow {
  id: number; name: string; phone?: string | null; email?: string | null;
  notes?: string | null; active: boolean;
}
export interface ReorderSuggestion {
  stockItemId: number; nameEn: string; nameAr: string; baseUnit: BaseUnit;
  purchaseUnitLabel?: string | null; purchaseUnitSize: number;
  onHand: number; reorderPoint: number; parLevel?: number | null;
  suggestedBase: number; suggestedPurchaseUnits?: number | null; supplierId?: number | null;
}
export interface PurchaseOrderLineRow {
  id: number; stockItemId: number; nameEn?: string | null; nameAr?: string | null; baseUnit?: BaseUnit | null;
  quantityBase: number; quantityReceivedBase: number; outstandingBase: number; unitCost?: number | null;
}
export interface PurchaseOrderRow {
  id: number; branchId: number; supplierId?: number | null; supplierName?: string | null;
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  reference?: string | null; notes?: string | null; expectedAt?: string | null;
  createdAt: string; totalCost: number; lines: PurchaseOrderLineRow[];
}
export interface WasteRow {
  stockItemId: number; nameEn: string; nameAr: string; baseUnit: BaseUnit;
  quantityBase: number; value: number;
}
export interface CostDriftRow {
  stockItemId: number; nameEn: string; nameAr: string;
  averageCost: number; latestCost: number; changePercent: number;
}
/** One dish on the popularity-vs-margin map. */
export interface MenuEconomicsRow {
  menuItemId: number; nameEn: string; nameAr: string; quantitySold: number; revenue: number;
  unitCost?: number | null; unitMargin?: number | null; foodCostPercent?: number | null;
  quadrant?: 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG' | null;
}


/* ---- staff invitations ---- */

/** What an invitee sees on /join/:token before setting a password. Deliberately minimal. */
export interface InvitePreview {
  username: string;
  fullName: string;
  cafeName: string | null;
  permissions: Permission[];
  expiresAt: string;
}

/** A pending invitation as the owner sees it — `joinUrl` is the link they share. */
export interface StaffInvite {
  id: number;
  userId: number;
  username: string;
  fullName: string;
  permissions: Permission[];
  branchId?: number | null;
  joinUrl: string;
  expiresAt: string;
  createdAt: string;
}
