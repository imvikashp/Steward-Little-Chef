import { useEffect, useMemo, useState } from 'react';
import {
  archiveOrder,
  assignBot,
  confirmBotPickup,
  DEFAULT_BOT_ID,
  confirmOrder,
  historyNeedsSync,
  markDelivered,
  subscribeBots,
  subscribeHistory,
  subscribeOrders,
} from '@/lib/kitchen';
import type {
  DeliveryBot,
  HistoryEntry,
  Order,
  OrderStatus,
} from '@/lib/types';
import ChefLogin from '@/screens/ChefLogin';
import FirestoreView from '@/screens/FirestoreView';
import {
  logoutChef,
  watchChefSession,
  type ChefSession,
} from '@/lib/chefAuth';
import {
  ChefHat,
  Package,
  Bike,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  X,
  Send,
  Loader2,
  ShoppingBag,
  TrendingUp,
  AlertCircle,
  History,
  LayoutGrid,
  Leaf,
  LogOut,
  Database,
  Utensils,
  Armchair,
} from 'lucide-react';

const STATUS_META: Record<
  OrderStatus,
  { label: string; color: string; dot: string }
> = {
  'Order Confirmed': {
    label: 'Order Confirmed',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  'Food Preparing': {
    label: 'Food Preparing',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  'Food Prepared': {
    label: 'Food Prepared',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
  },
  'Food On The Way': {
    label: 'Food On The Way',
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    dot: 'bg-violet-500',
  },
  Delivered: {
    label: 'Delivered',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
};

function timeAgo(ms: number): string {
  if (!ms) return '--';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(ms: number | null): string {
  if (!ms) return '--';
  return new Date(ms).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(ms: number | null): string {
  if (!ms) return '--';
  return new Date(ms).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function App() {
  const [chef, setChef] = useState<ChefSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Firebase restores the signed-in chef on load, so wait for that first
  // answer before deciding between the login page and the dashboard.
  useEffect(
    () =>
      watchChefSession((session) => {
        setChef(session);
        setCheckingAuth(false);
      }),
    []
  );

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
      </div>
    );
  }

  if (!chef) return <ChefLogin />;

  return <Dashboard chef={chef} onLogout={() => logoutChef()} />;
}

function Dashboard({
  chef,
  onLogout,
}: {
  chef: ChefSession;
  onLogout: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [bots, setBots] = useState<DeliveryBot[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'orders' | 'history' | 'database'>('orders');
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>(
    'Order Confirmed'
  );
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Live Firestore feeds. Everything the chef sees is whatever sits in the
  // shared `orders` collection that the customer app writes to.
  useEffect(() => {
    const unsubOrders = subscribeOrders((list) => {
      setOrders(list);
      setLoading(false);
    }, setError);
    const unsubBots = subscribeBots(setBots, setError);
    const unsubHistory = subscribeHistory(setHistory, setError);
    return () => {
      unsubOrders();
      unsubBots();
      unsubHistory();
    };
  }, []);

  // Any order sitting at Delivered in Firestore is copied into the history
  // collection, including ones marked delivered outside this dashboard. An
  // already archived entry is rewritten when the live order moves on - paying
  // after delivery flips paymentStatus, and history has to match.
  useEffect(() => {
    const archived = new Map(history.map((h) => [h.id, h]));
    orders
      .filter((o) => o.status === 'Delivered')
      .filter((o) => historyNeedsSync(archived.get(o.id), o))
      .forEach((o) => {
        archiveOrder(o).catch((err) => setError(String(err)));
      });
  }, [orders, history]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setActionLoading(key);
    try {
      await action();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(null);
    }
  };

  const counts = useMemo(() => {
    const by = (status: OrderStatus) =>
      orders.filter((o) => o.status === status).length;
    return {
      newOrders: by('Order Confirmed'),
      preparing: by('Food Preparing'),
      prepared: by('Food Prepared'),
      onTheWay: by('Food On The Way'),
      delivered: by('Delivered'),
    };
  }, [orders]);

  const liveOrders = useMemo(
    () => orders.filter((o) => o.status !== 'Delivered'),
    [orders]
  );

  const filteredOrders =
    activeTab === 'all'
      ? liveOrders
      : orders.filter((o) => o.status === activeTab);

  const historyRevenue = history.reduce((sum, h) => sum + Number(h.total), 0);
  const availableBots = bots.filter((b) => b.status === 'available').length;

  const tabs: { key: OrderStatus | 'all'; label: string; count: number }[] = [
    { key: 'Order Confirmed', label: 'New', count: counts.newOrders },
    { key: 'Food Preparing', label: 'Preparing', count: counts.preparing },
    { key: 'Food Prepared', label: 'Prepared', count: counts.prepared },
    { key: 'Food On The Way', label: 'On The Way', count: counts.onTheWay },
    { key: 'all', label: 'All Live', count: liveOrders.length },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center shadow-sm">
                <ChefHat className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-stone-900 leading-none">
                  Kitchen Command
                </h1>
                <p className="text-xs text-stone-500 mt-0.5">
                  Chef Order Dashboard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                <div
                  className={`w-2 h-2 rounded-full ${
                    availableBots > 0
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-stone-400'
                  }`}
                />
                <span className="text-xs font-semibold text-emerald-700">
                  {availableBots} bots ready
                </span>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-full bg-stone-100">
                <button
                  onClick={() => setView('orders')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    view === 'orders'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Orders
                </button>
                <button
                  onClick={() => setView('history')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    view === 'history'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  History
                  <span className="px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-600">
                    {history.length}
                  </span>
                </button>
                {/* <button
                  onClick={() => setView('database')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    view === 'database'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  Database
                </button> */}
              </div>

              <div className="flex items-center gap-2 pl-2 ml-1 border-l border-stone-200">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-semibold text-stone-900 leading-none">
                    {chef.name}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {chef.email}
                  </p>
                </div>
                <button
                  onClick={onLogout}
                  title="Logout"
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {view === 'orders' ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatCard
                icon={<Clock className="w-4 h-4" />}
                label="New Orders"
                value={counts.newOrders}
                accent="amber"
              />
              <StatCard
                icon={<Utensils className="w-4 h-4" />}
                label="Preparing"
                value={counts.preparing}
                accent="blue"
              />
              <StatCard
                icon={<Package className="w-4 h-4" />}
                label="Prepared"
                value={counts.prepared}
                accent="indigo"
              />
              <StatCard
                icon={<Bike className="w-4 h-4" />}
                label="On The Way"
                value={counts.onTheWay}
                accent="violet"
              />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                    activeTab === tab.key
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300 hover:text-stone-900'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.key ? 'bg-white/20' : 'bg-stone-100'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <EmptyState
                title="No orders here"
                subtitle="New customer orders appear automatically"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    actionLoading={actionLoading}
                    onConfirm={() =>
                      runAction(order.id, () => confirmOrder(order.id))
                    }
                    onAssign={() => setAssigningOrder(order)}
                    onBotConfirm={() =>
                      runAction(order.id, () => confirmBotPickup(order))
                    }
                    onDelivered={() =>
                      runAction(order.id, () => markDelivered(order))
                    }
                  />
                ))}
              </div>
            )}
          </>
        ) : view === 'history' ? (
          <HistoryView entries={history} revenue={historyRevenue} />
        ) : (
          <FirestoreView />
        )}
      </main>

      {assigningOrder && (
        <BotAssignModal
          bots={bots}
          onClose={() => setAssigningOrder(null)}
          onAssign={(bot) => {
            const order = assigningOrder;
            setAssigningOrder(null);
            runAction(order.id, () => assignBot(order, bot));
          }}
          loadingId={actionLoading}
        />
      )}
    </div>
  );
}

function OrderCard({
  order,
  actionLoading,
  onConfirm,
  onAssign,
  onBotConfirm,
  onDelivered,
}: {
  order: Order;
  actionLoading: string | null;
  onConfirm: () => void;
  onAssign: () => void;
  onBotConfirm: () => void;
  onDelivered: () => void;
}) {
  const meta = STATUS_META[order.status];
  const busy = actionLoading === order.id;

  return (
    <div className="group bg-white rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-stone-900 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-stone-900 text-sm leading-tight truncate">
                +91 {order.mobile}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">
                #{order.id.slice(-6).toUpperCase()} &middot;{' '}
                {timeAgo(order.createdAt)}
              </p>
              {order.tableNumber && (
                <p className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-stone-900 text-amber-400 text-xs font-bold">
                  <Armchair className="w-3 h-3" />
                  Table {order.tableNumber}
                </p>
              )}
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ${meta.color}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>

        <div className="space-y-1.5 mb-3">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span className="text-stone-600 flex items-center gap-1.5 min-w-0">
                {item.veg && (
                  <Leaf className="w-3 h-3 text-emerald-500 shrink-0" />
                )}
                <span className="truncate">
                  <span className="font-medium text-stone-800">
                    {item.qty}&times;
                  </span>{' '}
                  {item.name}
                </span>
              </span>
              <span className="text-stone-500 font-medium shrink-0">
                &#8377;{(item.price * item.qty).toFixed(0)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2.5 border-t border-dashed border-stone-200">
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
            Total
          </span>
          <span className="text-lg font-bold text-stone-900">
            &#8377;{Number(order.total).toFixed(0)}
          </span>
        </div>
      </div>

      <div className="px-4 pb-4">
        {order.status === 'Order Confirmed' && (
          <button
            onClick={onConfirm}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Confirm Order
              </>
            )}
          </button>
        )}

        {order.status === 'Food Preparing' && (
          <button
            onClick={onAssign}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Bike className="w-4 h-4" />
                Select Delivery Bot
              </>
            )}
          </button>
        )}

        {order.status === 'Food Prepared' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200">
              <Bike className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="text-sm font-medium text-indigo-700 truncate">
                {order.botName ?? 'Bot assigned'}
              </span>
              <span className="ml-auto text-xs text-indigo-500 shrink-0">
                {order.tableNumber
                  ? `Send to table ${order.tableNumber}`
                  : 'Waiting for pickup'}
              </span>
            </div>
            <button
              onClick={onBotConfirm}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Bot Confirmed &ndash; Send Out
                </>
              )}
            </button>
          </div>
        )}

        {order.status === 'Food On The Way' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200">
              <Bike className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="text-sm font-medium text-violet-700 truncate">
                {order.botName ?? 'Bot assigned'}
              </span>
              <span className="ml-auto text-xs text-violet-500 flex items-center gap-1 shrink-0">
                <MapPin className="w-3 h-3" />
                {order.tableNumber ? `Table ${order.tableNumber}` : 'En route'}
              </span>
            </div>
            <button
              onClick={onDelivered}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Mark Delivered
                </>
              )}
            </button>
          </div>
        )}

        {order.status === 'Delivered' && (
          <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">
              Delivered {formatTime(order.deliveredAt)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryView({
  entries,
  revenue,
}: {
  entries: HistoryEntry[];
  revenue: number;
}) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Delivered Orders"
          value={entries.length}
          accent="emerald"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Total Revenue"
          value={`₹${revenue.toFixed(0)}`}
          accent="amber"
        />
        <StatCard
          icon={<ShoppingBag className="w-4 h-4" />}
          label="Items Delivered"
          value={entries.reduce(
            (sum, e) => sum + e.items.reduce((s, i) => s + i.qty, 0),
            0
          )}
          accent="blue"
        />
        <StatCard
          icon={<Phone className="w-4 h-4" />}
          label="Customers"
          value={new Set(entries.map((e) => e.mobile)).size}
          accent="violet"
        />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="No delivered orders yet"
          subtitle="Every order marked Delivered is saved here automatically"
        />
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-2">
            <History className="w-4 h-4 text-stone-400" />
            <h2 className="font-bold text-stone-900">Order History</h2>
            <span className="ml-auto text-xs text-stone-400">
              Saved in Firestore &middot; history collection
            </span>
          </div>
          <div className="divide-y divide-stone-100">
            {entries.map((entry) => (
              <div key={entry.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                  <span className="font-semibold text-stone-900 text-sm">
                    #{entry.id.slice(-6).toUpperCase()}
                  </span>
                  <span className="text-sm text-stone-500">
                    +91 {entry.mobile}
                  </span>
                  {entry.tableNumber && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-700">
                      <Armchair className="w-3 h-3" />
                      Table {entry.tableNumber}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-100 text-emerald-700 border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Delivered
                  </span>
                  {entry.botName && (
                    <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                      <Bike className="w-3 h-3" />
                      {entry.botName}
                    </span>
                  )}
                  <span className="ml-auto font-bold text-stone-900">
                    &#8377;{Number(entry.total).toFixed(0)}
                  </span>
                </div>

                <p className="text-sm text-stone-600">
                  {entry.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}
                </p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-stone-400">
                  <span>Placed {formatTime(entry.createdAt)}</span>
                  <span>Delivered {formatTime(entry.deliveredAt)}</span>
                  <span>{formatDate(entry.deliveredAt ?? entry.createdAt)}</span>
                  <span
                    className={
                      entry.paymentStatus === 'Paid'
                        ? 'text-emerald-600 font-medium'
                        : 'text-amber-600 font-medium'
                    }
                  >
                    Payment {entry.paymentStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
        <ShoppingBag className="w-7 h-7 text-stone-400" />
      </div>
      <p className="text-stone-500 font-medium">{title}</p>
      <p className="text-stone-400 text-sm mt-1">{subtitle}</p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: 'amber' | 'blue' | 'indigo' | 'violet' | 'emerald';
}) {
  const accents: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    violet: 'bg-violet-50 text-violet-600 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  };
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
      <div
        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${accents[accent]}`}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold text-stone-900 leading-none">{value}</p>
      <p className="text-xs text-stone-500 mt-1">{label}</p>
    </div>
  );
}

function BotAssignModal({
  bots,
  onClose,
  onAssign,
  loadingId,
}: {
  bots: DeliveryBot[];
  onClose: () => void;
  onAssign: (bot: DeliveryBot) => void;
  loadingId: string | null;
}) {
  const available = bots.filter((b) => b.status === 'available');
  const busy = bots.filter((b) => b.status === 'busy');
  // DeliveryBot is preselected when it is free; the chef can pick another bot
  // before pressing Proceed.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedBot =
    available.find((b) => b.id === selectedId) ??
    available.find((b) => b.id === DEFAULT_BOT_ID) ??
    available[0] ??
    null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <Bike className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-stone-900">Select Delivery Bot</h2>
              <p className="text-xs text-stone-500">
                Picking a bot marks the food as prepared
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {available.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
                <Bike className="w-6 h-6 text-stone-400" />
              </div>
              {bots.length === 0 ? (
                <>
                  <p className="text-stone-600 font-medium">
                    No delivery bots registered
                  </p>
                  <p className="text-stone-400 text-sm mt-1 max-w-xs">
                    Add your car as a document in the Firestore{' '}
                    <span className="font-mono text-stone-500">bots</span>{' '}
                    collection with a{' '}
                    <span className="font-mono text-stone-500">name</span> and{' '}
                    <span className="font-mono text-stone-500">
                      status: "available"
                    </span>
                    . It shows up here instantly.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-stone-600 font-medium">All bots are busy</p>
                  <p className="text-stone-400 text-sm mt-1">
                    Wait for a delivery to complete
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {available.map((bot) => {
                const selected = bot.id === selectedBot?.id;
                return (
                <button
                  key={bot.id}
                  onClick={() => setSelectedId(bot.id)}
                  disabled={loadingId !== null}
                  aria-pressed={selected}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all group disabled:opacity-50 ${
                    selected
                      ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                      : 'border-stone-200 hover:border-amber-300 hover:bg-amber-50'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      selected ? 'bg-amber-500' : 'bg-stone-900 group-hover:bg-amber-500'
                    }`}
                  >
                    <Bike
                      className={`w-5 h-5 transition-colors ${
                        selected ? 'text-white' : 'text-amber-400 group-hover:text-white'
                      }`}
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm truncate">
                      {bot.name}
                    </p>
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Available
                      <span className="font-mono text-stone-400 truncate">
                        &middot; {bot.id}
                      </span>
                    </p>
                  </div>
                  {selected ? (
                    <CheckCircle2 className="w-5 h-5 text-amber-500" />
                  ) : (
                    <span className="w-5 h-5 rounded-full border-2 border-stone-300 group-hover:border-amber-400 transition-colors" />
                  )}
                </button>
                );
              })}
            </div>
          )}

          {busy.length > 0 && (
            <div className="mt-4 pt-4 border-t border-stone-100">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
                Busy Bots
              </p>
              <div className="space-y-1.5">
                {busy.map((bot) => (
                  <div
                    key={bot.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-stone-50"
                  >
                    <div className="w-9 h-9 rounded-lg bg-stone-200 flex items-center justify-center">
                      <Bike className="w-4 h-4 text-stone-400" />
                    </div>
                    <p className="font-medium text-stone-500 text-sm flex-1">
                      {bot.name}
                    </p>
                    <span className="text-xs text-stone-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                      {bot.tableNumber ? `Table ${bot.tableNumber}` : 'Busy'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {available.length > 0 && (
          <div className="px-5 py-4 border-t border-stone-100 flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => selectedBot && onAssign(selectedBot)}
              disabled={!selectedBot || loadingId !== null}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
            >
              {loadingId !== null ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Proceed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
