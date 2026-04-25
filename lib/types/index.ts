export type ID = string;

export type PaymentMethod = "cash" | "qris" | "card" | "transfer";

export type OrderStatus = "draft" | "open" | "paid" | "void";

export type OrderItemStatus = "pending" | "ongoing" | "serve" | "done";

export type OrderType = "dine-in" | "takeaway" | "delivery";

export interface Cashier {
  id: ID;
  name: string;
  pin: string;
  role: "cashier" | "supervisor";
}

export interface Station {
  id: ID;
  name: string;
}

export interface Category {
  id: ID;
  name: string;
  order: number;
}

export interface Product {
  id: ID;
  name: string;
  price: number;
  categoryId: ID;
  stationId: ID;
  imageEmoji?: string;
  active: boolean;
}

export interface OrderItem {
  id: ID;
  productId: ID;
  productName: string;
  unitPrice: number;
  qty: number;
  note?: string;
  stationId: ID;
  status: OrderItemStatus;
  /** ISO timestamp ketika item ini di-void. null/undefined = item aktif. */
  voidedAt?: string;
  /** User ID yang melakukan void. */
  voidedBy?: string;
  /** Nama kasir/supervisor yang melakukan void (cached untuk display). */
  voidedByName?: string;
  /** Alasan void, untuk audit. */
  voidReason?: string;
}

export interface OrderPayment {
  method: PaymentMethod;
  amount: number;
  tendered?: number;
  change?: number;
  paidAt: string;
}

export interface Order {
  id: ID;
  shiftId: ID;
  cashierId: ID;
  cashierName: string;
  orderType: OrderType;
  tableNumber?: string;
  customerName?: string;
  deliveryProvider?: string;
  isOpenBill: boolean;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  service: number;
  discount: number;
  total: number;
  status: OrderStatus;
  payment?: OrderPayment;
  createdAt: string;
  paidAt?: string;
  note?: string;
}

export interface Shift {
  id: ID;
  cashierId: ID;
  cashierName: string;
  openingCash: number;
  openedAt: string;
  closedAt?: string;
  actualCash?: number;
  note?: string;
}

export interface ShiftSummary {
  shift: Shift;
  totalRevenue: number;
  orderCount: number;
  breakdown: Record<PaymentMethod, number>;
  cashSales: number;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
}

export interface OpenShiftInput {
  cashierId: ID;
  openingCash: number;
  note?: string;
}

export interface CloseShiftInput {
  shiftId: ID;
  actualCash: number;
}

export interface CreateOrderInput {
  shiftId: ID;
  cashierId: ID;
  orderType: OrderType;
  tableNumber?: string;
  customerName?: string;
  deliveryProvider?: string;
  isOpenBill?: boolean;
  items: Array<{
    productId: ID;
    qty: number;
    note?: string;
  }>;
  discount?: number;
  note?: string;
}

export interface PayOrderInput {
  orderId: ID;
  method: PaymentMethod;
  tendered?: number;
}
