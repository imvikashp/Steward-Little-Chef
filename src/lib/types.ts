// The order status values live in Firestore exactly as written here. The
// customer app renders whatever string sits in the `status` field, so the
// chef dashboard must write these same strings.
export const ORDER_STATUSES = [
  'Order Confirmed',
  'Food Preparing',
  'Food Prepared',
  'Food On The Way',
  'Delivered',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PaymentStatus = 'Pending' | 'Paid';
export type BotStatus = 'available' | 'busy';

/** One line on an order, flattened from the customer app cart shape. */
export interface OrderItem {
  name: string;
  qty: number;
  price: number;
  veg: boolean;
}

export interface Order {
  id: string;
  mobile: string;
  /** Table the customer is seated at - this is where the bot is sent. */
  tableNumber: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  botId: string | null;
  botName: string | null;
  createdAt: number;
  confirmedAt: number | null;
  preparedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
}

export interface DeliveryBot {
  id: string;
  name: string;
  status: BotStatus;
  currentOrderId: string | null;
  /** Destination table written when the bot is sent out. */
  tableNumber: string | null;
}

/** A delivered order copied into the Firestore `history` collection. */
export interface HistoryEntry extends Order {
  archivedAt: number;
}

export function normalizeStatus(raw: unknown): OrderStatus {
  if (typeof raw !== 'string') return 'Order Confirmed';
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  return ORDER_STATUSES.find((s) => s.toLowerCase() === key) ?? 'Order Confirmed';
}

/**
 * The customer app stores items as { item: FoodItem, quantity }. Older or
 * hand-entered documents may already be flat, so accept both shapes.
 */
export function normalizeItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const nested = (row.item ?? {}) as Record<string, unknown>;
    return {
      name: String(nested.name ?? row.name ?? 'Item'),
      qty: Number(row.quantity ?? row.qty ?? 1),
      price: Number(nested.price ?? row.price ?? 0),
      veg: Boolean(nested.veg ?? row.veg ?? false),
    };
  });
}

export function toOrder(id: string, data: Record<string, unknown>): Order {
  return {
    id,
    mobile: String(data.mobile ?? ''),
    tableNumber:
      data.tableNumber === undefined || data.tableNumber === null
        ? ''
        : String(data.tableNumber),
    items: normalizeItems(data.items),
    subtotal: Number(data.subtotal ?? 0),
    deliveryFee: Number(data.deliveryFee ?? 0),
    tax: Number(data.tax ?? 0),
    total: Number(data.total ?? 0),
    status: normalizeStatus(data.status),
    paymentStatus: data.paymentStatus === 'Paid' ? 'Paid' : 'Pending',
    botId: (data.botId as string) ?? null,
    botName: (data.botName as string) ?? null,
    createdAt: Number(data.createdAt ?? 0),
    confirmedAt: data.confirmedAt ? Number(data.confirmedAt) : null,
    preparedAt: data.preparedAt ? Number(data.preparedAt) : null,
    pickedUpAt: data.pickedUpAt ? Number(data.pickedUpAt) : null,
    deliveredAt: data.deliveredAt ? Number(data.deliveredAt) : null,
  };
}
