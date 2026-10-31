import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  BOTS_COLLECTION,
  db,
  HISTORY_COLLECTION,
  ORDERS_COLLECTION,
} from './firebase';
import type { DeliveryBot, HistoryEntry, Order } from './types';
import { toOrder } from './types';

export function subscribeOrders(
  next: (orders: Order[]) => void,
  onError: (message: string) => void
) {
  return onSnapshot(
    collection(db, ORDERS_COLLECTION),
    (snap) => {
      const list = snap.docs
        .map((d) => toOrder(d.id, d.data()))
        .sort((a, b) => b.createdAt - a.createdAt);
      next(list);
    },
    (err) => onError(err.message)
  );
}

/**
 * The default car. It is always offered in the bot picker (and preselected),
 * even before its document exists in the `bots` collection - the first
 * assignment creates it.
 */
export const DEFAULT_BOT_ID = 'DeliveryBot';

export function subscribeBots(
  next: (bots: DeliveryBot[]) => void,
  onError: (message: string) => void
) {
  return onSnapshot(
    collection(db, BOTS_COLLECTION),
    (snap) => {
      const list = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name ?? d.id),
            status: data.status === 'busy' ? 'busy' : 'available',
            currentOrderId: (data.currentOrderId as string) ?? null,
            tableNumber:
              data.tableNumber === undefined || data.tableNumber === null
                ? null
                : String(data.tableNumber),
          } as DeliveryBot;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!list.some((b) => b.id === DEFAULT_BOT_ID)) {
        list.unshift({
          id: DEFAULT_BOT_ID,
          name: DEFAULT_BOT_ID,
          status: 'available',
          currentOrderId: null,
          tableNumber: null,
        });
      }
      next(list);
    },
    (err) => onError(err.message)
  );
}

export function subscribeHistory(
  next: (entries: HistoryEntry[]) => void,
  onError: (message: string) => void
) {
  return onSnapshot(
    collection(db, HISTORY_COLLECTION),
    (snap) => {
      const list = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            ...toOrder(d.id, data),
            archivedAt: Number(data.archivedAt ?? 0),
          } as HistoryEntry;
        })
        .sort(
          (a, b) =>
            (b.deliveredAt ?? b.archivedAt) - (a.deliveredAt ?? a.archivedAt)
        );
      next(list);
    },
    (err) => onError(err.message)
  );
}

/** Chef accepts the order: the customer now sees "Food Preparing". */
export async function confirmOrder(orderId: string): Promise<void> {
  await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
    status: 'Food Preparing',
    confirmedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/** A delivery bot is picked: the customer now sees "Food Prepared". */
export async function assignBot(order: Order, bot: DeliveryBot): Promise<void> {
  await updateDoc(doc(db, ORDERS_COLLECTION, order.id), {
    status: 'Food Prepared',
    botId: bot.id,
    botName: bot.name,
    preparedAt: Date.now(),
    updatedAt: Date.now(),
  });
  await setDoc(
    doc(db, BOTS_COLLECTION, bot.id),
    {
      name: bot.name,
      status: 'busy',
      currentOrderId: order.id,
    },
    { merge: true }
  );
}

/**
 * The bot confirms pickup: the customer now sees "Food On The Way" and the
 * bot document gets the destination table, so the machine knows where to go.
 */
export async function confirmBotPickup(order: Order): Promise<void> {
  const now = Date.now();
  await updateDoc(doc(db, ORDERS_COLLECTION, order.id), {
    status: 'Food On The Way',
    pickedUpAt: now,
    updatedAt: now,
  });
  if (order.botId) {
    await updateDoc(doc(db, BOTS_COLLECTION, order.botId), {
      status: 'busy',
      command: 'deliver',
      currentOrderId: order.id,
      tableNumber: order.tableNumber,
      mobile: order.mobile,
      dispatchedAt: now,
    });
  }
}

/** Order handed over: status becomes "Delivered" and the bot is freed. */
export async function markDelivered(order: Order): Promise<void> {
  await updateDoc(doc(db, ORDERS_COLLECTION, order.id), {
    status: 'Delivered',
    deliveredAt: Date.now(),
    updatedAt: Date.now(),
  });
  if (order.botId) {
    await updateDoc(doc(db, BOTS_COLLECTION, order.botId), {
      status: 'available',
      command: 'idle',
      currentOrderId: null,
      tableNumber: null,
      deliveredAt: Date.now(),
    });
  }
}

/**
 * Copies a delivered order into the Firestore `history` collection, and keeps
 * that copy in sync afterwards - a customer paying after delivery flips
 * paymentStatus on the order, and the history entry has to follow.
 *
 * `deliveredAt` is only stamped by this function when the order itself has no
 * delivery time (someone set the status by hand in the console). On later
 * syncs the field is left alone so the archived time never drifts.
 */
export async function archiveOrder(order: Order): Promise<void> {
  const payload: Record<string, unknown> = {
    orderId: order.id,
    mobile: order.mobile,
    tableNumber: order.tableNumber,
    items: order.items,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    tax: order.tax,
    total: order.total,
    status: 'Delivered',
    paymentStatus: order.paymentStatus,
    botId: order.botId,
    botName: order.botName,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    preparedAt: order.preparedAt,
    pickedUpAt: order.pickedUpAt,
    archivedAt: Date.now(),
  };
  if (order.deliveredAt) payload.deliveredAt = order.deliveredAt;

  await setDoc(doc(db, HISTORY_COLLECTION, order.id), payload, { merge: true });
}

/**
 * Fields the history entry mirrors from the live order. When any of them drift
 * apart the entry is rewritten. `deliveredAt` is compared only when the order
 * carries one, otherwise the stamped fallback would never match.
 */
export function historyNeedsSync(
  archived: HistoryEntry | undefined,
  order: Order
): boolean {
  if (!archived) return true;
  if (archived.paymentStatus !== order.paymentStatus) return true;
  if (archived.total !== order.total) return true;
  if (archived.botId !== order.botId) return true;
  if (archived.botName !== order.botName) return true;
  if (order.deliveredAt && archived.deliveredAt !== order.deliveredAt) {
    return true;
  }
  return false;
}
