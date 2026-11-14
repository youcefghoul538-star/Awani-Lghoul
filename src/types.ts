export type Lang = 'fr' | 'ar' | 'en'

/** Text editable per language. French is the required base. */
export interface LocalText {
  fr: string
  ar?: string
  en?: string
}

export interface Category {
  id: string
  name: LocalText
  /** key of a glyph in lib/placeholder.ts */
  icon: string
  order: number
}

export interface SpecRow {
  label: LocalText
  value: LocalText
}

export interface Product {
  id: string
  sku: string
  name: LocalText
  categoryId: string
  description?: LocalText
  /** Only real, merchant-provided specifications. Never invented. */
  specs?: SpecRow[]
  /** Public retail price in DZD */
  price: number
  /** Optional promotional retail price in DZD */
  salePrice?: number
  /**
   * DENORMALISED CACHE of the inventory ledger (Σ qtyDelta). It is written ONLY by
   * services/inventoryService (never by UI code). The ledger is the source of truth.
   */
  stock: number
  /** Uploaded image (data URL / remote URL). Falls back to a neutral placeholder. */
  image?: string
  featured?: boolean
  active: boolean
  /** true = fictional development data, not business inventory */
  demo?: boolean
  createdAt: string
}

export interface BundleItem {
  productId: string
  qty: number
}

export interface Bundle {
  id: string
  title: LocalText
  description?: LocalText
  items: BundleItem[]
  /** Public retail price of the pack in DZD */
  price: number
  promoPrice?: number
  active: boolean
  demo?: boolean
}

export interface Note {
  id: string
  at: string
  text: string
}

// ───────────────────────── Orders (retail) ─────────────────────────

/** new → confirmed → shipped → delivered ; cancelled from new/confirmed/shipped. See domain/orderStatus.ts */
export type OrderStatus = 'new' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

export interface OrderLine {
  kind: 'product' | 'bundle'
  refId: string
  sku?: string
  name: string
  qty: number
  /** Price actually charged per unit (re-priced server-side from the catalogue). */
  unitPrice: number
  /** Regular retail price per unit before any promotion (product price / bundle price). */
  listPrice: number
  /** Stock components consumed by ONE unit of this line (a product line = [{productId, qty:1}]). */
  components: BundleItem[]
}

export interface Order {
  id: string
  ref: string
  createdAt: string
  confirmedAt?: string
  shippedAt?: string
  deliveredAt?: string
  cancelledAt?: string
  status: OrderStatus
  customer: {
    fullName: string
    phone: string
    wilaya: string
    address: string
    notes?: string
  }
  lines: OrderLine[]
  /** Σ unitPrice × qty (amount due, after promotions). */
  subtotal: number
  /** Σ listPrice × qty (before promotions). */
  listTotal: number
  /** listTotal − subtotal. A promotion, NOT a cost. */
  discountTotal: number
  /** Delivery fee billed to the customer (0 until delivery pricing is agreed with the business). */
  deliveryFee: number
  /** subtotal + deliveryFee */
  total: number
  lang: Lang
  internalNotes: Note[]
  /** true while stored only in this browser (no backend connected) */
  localOnly: boolean
}

export type PaymentMethod = 'cash' | 'baridimob' | 'ccp' | 'bank' | 'other'

/** Money actually received. The ONLY source for "collected cash". */
export interface Payment {
  id: string
  orderId: string
  amount: number
  method: PaymentMethod
  paidAt: string
  note?: string
}

/** Cash returned to a customer. Also reduces net sales when the order was delivered. */
export interface Refund {
  id: string
  orderId: string
  amount: number
  refundedAt: string
  reason: string
}

// ───────────────────────── Quotes (wholesale) ─────────────────────────

export type QuoteStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost'

export interface QuoteLine {
  productId: string
  sku: string
  name: string
  qty: number
}

export interface Quote {
  id: string
  ref: string
  createdAt: string
  status: QuoteStatus
  business: {
    companyName: string
    contactName: string
    phone: string
    email?: string
    wilaya: string
    businessType: string
    address?: string
    notes?: string
  }
  lines: QuoteLine[]
  lang: Lang
  internalNotes: Note[]
  localOnly: boolean
}

/** PRIVATE. Entered manually by an administrator. Never derived from retail prices. */
export interface WholesalePrice {
  id: string // = productId
  price: number
  /** Minimum quantity for this price to apply. */
  minQty?: number
}

// ───────────────────────── CRM ─────────────────────────

export type TraderStatus = 'prospect' | 'active' | 'inactive'
export type LeadSource = 'website_quote' | 'walk_in' | 'phone' | 'referral' | 'social' | 'other'
export type ContactKind = 'call' | 'visit' | 'whatsapp' | 'email' | 'other'

export interface ContactEvent {
  id: string
  at: string
  kind: ContactKind
  summary: string
}

/** A wholesale contact. Exists independently of quotation requests. */
export interface Trader {
  id: string
  businessName: string
  contactName: string
  phone: string
  email?: string
  wilaya: string
  status: TraderStatus
  leadSource: LeadSource
  notes: string
  /** Day (YYYY-MM-DD, Africa/Algiers) of the next planned follow-up. */
  followUpDate?: string
  contacts: ContactEvent[]
  createdAt: string
}

// ───────────────────────── Inventory ledger ─────────────────────────

export type MovementType =
  | 'purchase_received'
  | 'sale_committed'
  | 'sale_cancelled'
  | 'customer_return'
  | 'supplier_return'
  | 'manual_adjustment'
  | 'damaged'
  | 'other_adjustment'

export type MovementRef = 'order' | 'purchase' | 'adjustment' | 'count' | 'return' | 'opening'

/** Immutable, append-only. One row = one stock change for one product. */
export interface InventoryMovement {
  id: string
  productId: string
  type: MovementType
  /** Signed integer. Sign is constrained by `type` (see domain/inventory.ts). */
  qtyDelta: number
  /**
   * Cost in CENTIMES (1 DZD = 100). Inbound: total landed cost of the units entering.
   * Outbound: filled in by the costing engine (value removed), never supplied by clients.
   */
  totalCostCentimes?: number
  /** Manual adjustment only: re-state the valuation of ALL units on hand at this unit cost. */
  restateCost?: boolean
  refType: MovementRef
  refId: string
  /** Order line index (sales/returns) so profit can be computed per line / bundle. */
  refLine?: number
  /** Unique. A second insert with the same key is ignored (prevents double deduction/restoration). */
  idempotencyKey: string
  note?: string
  createdAt: string
}

// ───────────────────────── Purchasing ─────────────────────────

export interface Supplier {
  id: string
  name: string
  phone?: string
  wilaya?: string
  notes?: string
  createdAt: string
}

export type CostType = 'transport' | 'customs' | 'handling' | 'packaging' | 'other'
export type AllocationMethod = 'by_value' | 'by_quantity'

export interface PurchaseItem {
  productId: string
  qty: number
  /** Supplier price per unit, DZD (decimals allowed, ≤ 2 d.p.). */
  unitCost: number
}

export interface PurchaseCost {
  type: CostType
  amount: number
  note?: string
}

export type PurchaseStatus = 'draft' | 'received' | 'cancelled'

export interface Purchase {
  id: string
  ref: string
  supplierId: string
  date: string
  status: PurchaseStatus
  items: PurchaseItem[]
  /** Transport, customs, handling, packaging… shared across the purchase lines. */
  additionalCosts: PurchaseCost[]
  allocation: AllocationMethod
  receivedAt?: string
  notes?: string
  createdAt: string
}

export type ExpenseCategory = 'rent' | 'salaries' | 'utilities' | 'transport' | 'marketing' | 'taxes' | 'other'

/** Operating expense. Required before any claim of NET profit. */
export interface Expense {
  id: string
  date: string
  category: ExpenseCategory
  amount: number
  description: string
}

export interface Settings {
  id: 'settings'
  businessName: string
  tagline: string
  phone: string
  whatsapp: string
  email: string
  address: string
  hours: string
  promoText: LocalText
  lowStockThreshold: number
}
