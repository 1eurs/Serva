// TypeScript mirrors of the backend DTOs (only the fields the UI uses).

export type Lang = 'ar' | 'en';

export type Permission =
  | 'PLATFORM_ADMIN' | 'ORDERS' | 'PAYMENTS' | 'MENU'
  | 'QR_TABLES' | 'TEAM' | 'ANALYTICS' | 'PROFILE' | 'BRANCHES' | 'STOCK' | 'BILLING';
export type OrderType = 'DINE_IN' | 'CAR';
export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'DECLINED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
/** 'SPLIT' is an order-level answer only — the bill was settled by several people who did not
 *  all pay the same way, so no one label fits. Each person's own method lives in the ledger. */
export type PaymentMethod = 'CASH' | 'CARD' | 'ONLINE' | 'OTHER' | 'SPLIT';
/** One person's share of a split bill — mirrors PaymentTender.java. */
export interface PaymentTender { method: 'CASH' | 'CARD'; amount: number }
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
  /** Legacy single name — display via personName(); it is only the last-resort fallback. */
  fullName: string;
  fullNameEn?: string | null;
  fullNameAr?: string | null;
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
  id: number; name: string; nameEn?: string | null; nameAr?: string | null; slug: string; logoUrl?: string | null; phone?: string | null;
  instagramUrl?: string | null; currency: string; vatEnabled: boolean; vatRate: number; // percent (5 = 5%)
  theme?: string | null; // menu look chosen by the café owner (see menuThemes.ts); optional
  themeCustomJson?: string | null;
  /** House card shown above the categories in every layout (see menuInfo.ts); optional. */
  menuInfoJson?: string | null;
}
export interface PublicBranch {
  id: number; name: string; nameEn?: string | null; nameAr?: string | null; address?: string | null; phone?: string | null;
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
  /** The shelf's verdict at this branch right now — a linked tin at zero with the café's switch
   *  on, or a daily cap reached. Independent of `available`, which stays the owner's own. */
  soldOut?: boolean;
  /** How many can still go out today, when the owner has capped it. Null/absent = no cap. */
  remainingToday?: number | null;
  preparationTimeMinutes?: number | null; displayOrder: number; optionGroups?: PublicOptionGroup[];
}

/** Can a customer order this right now? The café's own switch, and then the shelf's say. */
export const sellable = (i: { available: boolean; soldOut?: boolean } | undefined | null): boolean =>
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
  id: number; restaurantId: number; name: string; nameEn?: string | null; nameAr?: string | null;
  address?: string | null; phone?: string | null;
  openingHours?: string | null; active: boolean; acceptingOrders: boolean; printerEnabled: boolean; counterMode: boolean; createdAt?: string;
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
  /** Counter flow: paid while ordering — recorded in the same request as the order. */
  paid?: boolean; paymentMethod?: PaymentMethod | null;
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
  restaurantSlug: string; restaurantName: string;
  restaurantNameEn?: string | null; restaurantNameAr?: string | null; logoUrl?: string | null;
  stampsRequired: number; rewardLabel: string; rewardItems: { nameEn?: string | null; nameAr?: string | null }[];
  stamps: number; availableRewards: number; updatedAt: string;
  cardColor?: string | null; cardBg?: string | null; stampIcon?: string | null; cardMotif?: string | null;
}

/* ---- platform admin: per-restaurant stats ---- */
export interface AdminRestaurantStats {
  restaurantId: number; ordersToday: number; orders30d: number; revenue30d: number;
  ordersTotal: number; lastOrderAt?: string | null; branches: number; menuItems: number;
  /** Activation checklist: a café isn't live because it exists, it's live because these are done. */
  owners: number; tables: number;
  /** Churn radar: this week against the one before it. */
  orders7d: number; ordersPrev7d: number;
}

/* ---- blocked phones (dashboard) ---- */
export interface BlockedPhone { id: number; phone: string; reason?: string | null; blockedBy?: string | null; createdAt: string; }

/* ---- admin ---- */
export type Plan = 'STANDARD' | 'PRO' | 'ENTERPRISE';

/**
 * Everything the platform can gate. Mirrors the backend Feature enum.
 *
 * The list is the value and the type is derived from it, so a screen that walks every
 * feature (the owner's "What's included", the admin Plans grid) cannot fall behind the
 * union — adding a feature in one place adds it to both.
 */
export const FEATURES = [
  'PRO_ANALYTICS', 'FULL_HISTORY', 'LOYALTY',
  'MULTI_BRANCH', 'QR_CUSTOMIZATION',
] as const;
export type Feature = (typeof FEATURES)[number];

/** The tier/feature grid: which features each tier includes. */
export interface PlanFeatureMatrix {
  features: Feature[];
  included: Record<Plan, Feature[]>;
}

/** Pricing for one café tier (admin Plans page). monthlyPrice null = "custom". */
export interface PricingPlan {
  id: number; tier: Plan; name: string; monthlyPrice: number | null; setupFee: number;
  active: boolean; displayOrder: number; createdAt?: string; updatedAt?: string;
}
/** One receipt the branch's print station still owes the physical printer. */
export interface PrintJobResponse {
  id: number;
  orderId: number;
  createdAt: string;
  order: OrderResponse;
}
/** What a device with no printer gets back after handing a job to the station. The job is
 *  durable either way; `stationCollecting` is whether anyone has polled for it lately. */
export interface EnqueueResponse {
  jobId: number;
  stationSeenAt: string | null;
  stationCollecting: boolean;
}
/** Is some device collecting this branch's print jobs, and how many are waiting. */
export interface StationStatus {
  stationSeenAt: string | null;
  collecting: boolean;
  /** Devices seen collecting lately. More than one is worth a word, not a duplicate. */
  stations: number;
  pending: number;
  /** Seconds the longest-waiting ticket has waited. The real health signal — see the DTO. */
  oldestPendingSeconds: number;
  /** Serva Station app (or the Node process) is collecting — browsers should step aside. */
  appCollecting?: boolean;
}

export interface Restaurant {
  /** `name` is the legacy single name — read it only as a fallback; display via nameOf(). */
  id: number; name: string; nameEn?: string | null; nameAr?: string | null; slug: string; logoUrl?: string | null; phone?: string | null; email?: string | null; instagramUrl?: string | null;
  currency: string; vatEnabled: boolean; vatRate: number; theme?: string | null; themeCustomJson?: string | null;
  receiptSettingsJson?: string | null;
  /** House card above the menu categories — see menuInfo.ts. */
  menuInfoJson?: string | null;
  paymentMethodSelectionEnabled: boolean;
  /** Hide a menu item from customers when the shelf row backing it reads zero. */
  hideWhenOutOfStock?: boolean;
  active: boolean; plan?: Plan; createdAt?: string;
}
export type BillingCycle = 'ONE_TIME' | 'MONTHLY' | 'YEARLY';
export interface Subscription {
  id: number; restaurantId: number;
  /** The tier this subscription buys — the single source of truth for what the café can open.
   *  Orthogonal to billingCycle: "Pro" is a tier, "Annual"/"Lifetime" are cycles. */
  tier: Plan;
  billingCycle: BillingCycle; price: number;
  status: SubscriptionStatus; startDate?: string | null; endDate?: string | null; currentlyActive?: boolean;
  paymentMethod?: SubscriptionPaymentMethod | null; paymentReference?: string | null; paymentConfirmedAt?: string | null;
}

/* ---- admin: lead pipeline ---- */
export type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'ARCHIVED';
export interface Lead {
  id: number; cafeName: string; contactName: string;
  phone?: string | null; email?: string | null; city?: string | null;
  /** What the café itself wrote when it asked for access. */
  note?: string | null;
  status: LeadStatus;
  /** What the admin learned on the call — ours, not theirs. */
  adminNote?: string | null;
  contactedAt?: string | null;
  /** Set once the lead became a café; the link between pipeline and platform. */
  restaurantId?: number | null;
  createdAt: string;
}

/* ---- admin: billing board ---- */
export interface BillingRow {
  subscriptionId: number; restaurantId: number;
  name: string; nameEn?: string | null; nameAr?: string | null; slug: string;
  restaurantActive: boolean; tier: Plan;
  billingCycle: BillingCycle; price: number;
  /** Price normalised to a month so yearly and monthly cafés add up. */
  monthlyValue: number;
  status: SubscriptionStatus;
  startDate?: string | null; endDate?: string | null;
  /** Negative = overdue; null = lifetime access. */
  daysLeft?: number | null;
  paymentReference?: string | null; paymentConfirmedAt?: string | null;
  lastPaidOn?: string | null; paidTotal: number;
}
export interface BillingOverview {
  mrr: number; arr: number; collectedThisMonth: number; collectedLastMonth: number; outstanding: number;
  activeCount: number; trialCount: number; pastDueCount: number; expiredCount: number;
  cancelledCount: number; expiringSoonCount: number;
  rows: BillingRow[];
}
export interface SubscriptionPayment {
  id: number; subscriptionId: number; restaurantId: number; amount: number;
  method: SubscriptionPaymentMethod; reference?: string | null;
  paidOn: string; coversUntil?: string | null; note?: string | null;
  recordedBy?: number | null; createdAt: string;
}

/* ---- admin: audit log ---- */
export interface AuditEntry {
  id: number; actorId?: number | null; actorName?: string | null;
  action: string; targetType?: string | null; targetId?: number | null;
  targetLabel?: string | null; detail?: string | null; at: string;
}

/* ---- admin: support ---- */
export interface Impersonation {
  accessToken: string; tokenType: string; expiresInSeconds: number;
  user: UserResponse; restaurantId: number; restaurantName: string;
}
export interface PasswordReset {
  userId: number; username: string; temporaryPassword: string; emailed: boolean;
}
export interface BroadcastResult {
  recipients: number; sent: number; failed: number; dryRun: boolean; unreachable: string[];
}

/* ---- admin: platform trends ---- */
export interface PlatformTrendPoint {
  day: string; orders: number; revenue: number; newRestaurants: number;
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
  id: number; restaurantId: number; name: string; nameEn?: string | null; nameAr?: string | null;
  address?: string | null; phone?: string | null;
  openingHours?: string | null; active: boolean; acceptingOrders: boolean; printerEnabled: boolean; counterMode: boolean; createdAt?: string;
}



/* ---- staff invitations ---- */

/** What an invitee sees on /join/:token before setting a password. Deliberately minimal. */
export interface InvitePreview {
  username: string;
  fullName: string;
  fullNameEn?: string | null;
  fullNameAr?: string | null;
  cafeName: string | null;
  cafeNameEn?: string | null;
  cafeNameAr?: string | null;
  permissions: Permission[];
  expiresAt: string;
}

/** A pending invitation as the owner sees it — `joinUrl` is the link they share. */
export interface StaffInvite {
  id: number;
  userId: number;
  username: string;
  fullName: string;
  fullNameEn?: string | null;
  fullNameAr?: string | null;
  permissions: Permission[];
  branchId?: number | null;
  joinUrl: string;
  expiresAt: string;
  createdAt: string;
}

/* ---- stock ---- */

/** What the number beside an item counts. Stored and shown as typed — nothing converts. */
export type StockUnit = 'KG' | 'G' | 'L' | 'ML' | 'PIECE';

/** One thing on the shelf. Mirrors StockDtos.StockItemResponse. */
export interface StockItemRow {
  id: number;
  branchId: number;
  nameEn?: string | null;
  nameAr?: string | null;
  unit: StockUnit;
  quantity: number;
  /** Buy more at or below this. Null means nobody has said — not "zero". */
  reorderPoint?: number | null;
  /** What one unit costs, in OMR. Optional everywhere it appears. */
  unitPrice?: number | null;
  /** When a person last said what was there — a delivery or a count. */
  lastMovedAt?: string | null;
  /** What one piece holds, for a thing counted in pieces: a bottle is 1 L. Both absent when
   *  nobody has said, and always absent for a shelf not counted in pieces. */
  packSize?: number | null;
  packUnit?: StockUnit | null;
  createdAt: string;
}

/** What the add / edit form sends. Quantity is absent on edit: only a count or a delivery moves it. */
export interface StockItemPayload {
  /** One of the pair carries the name and the other is empty — an item named once, in its
   *  own script. Both are filled only for a starter item, which knows it in both. */
  nameEn: string;
  nameAr: string;
  unit: StockUnit;
  quantity?: number;
  reorderPoint?: number | null;
  unitPrice?: number | null;
  packSize?: number | null;
  packUnit?: StockUnit | null;
}

/** A cap on one menu item at one branch. Mirrors MenuStockDtos.RuleResponse. */
export interface MenuStockRule {
  menuItemId: number;
  branchId: number;
  /** At most this many a café day. Null = no cap. */
  dailyLimit?: number | null;
}

/** One ingredient of one menu item at one branch. Mirrors MenuStockDtos.RecipeLineResponse. */
export interface RecipeLineRow {
  id: number;
  menuItemId: number;
  stockItemId: number;
  quantity: number;
  unit: StockUnit;
}

/** What a shelf row is being used at. Mirrors MenuStockDtos.UsageRow. */
export interface StockUsageRow {
  stockItemId: number;
  used: number;
  perDay: number;
  /** Null when nothing has been sold against it in the window. */
  daysLeft?: number | null;
  /** What sales have drawn out of it since somebody last counted. Null when nobody ever has. */
  usedSinceCount?: number | null;
}
