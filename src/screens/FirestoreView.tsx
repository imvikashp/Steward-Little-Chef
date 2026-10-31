import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Database, Loader2, Search, AlertCircle } from 'lucide-react';

/** Collections this project uses, in the order they matter to the kitchen. */
const COLLECTIONS = ['orders', 'users', 'history', 'bots'] as const;
type CollectionName = (typeof COLLECTIONS)[number];

interface RawDoc {
  id: string;
  data: Record<string, unknown>;
}

/** Renders a Firestore value the way the console shows it. */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '--';
  if (typeof value === 'object') {
    // Firestore Timestamps carry toDate(); show a readable time instead of {}
    const maybeTs = value as { toDate?: () => Date };
    if (typeof maybeTs.toDate === 'function') {
      return maybeTs.toDate().toLocaleString('en-IN');
    }
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'number' && value > 1000000000000 && value < 4102444800000) {
    // Looks like an epoch millisecond timestamp
    return `${value}  (${new Date(value).toLocaleString('en-IN')})`;
  }
  return String(value);
}

export default function FirestoreView() {
  const [active, setActive] = useState<CollectionName>('orders');
  const [docs, setDocs] = useState<RawDoc[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Live document counts for every collection, so the tabs stay honest.
  useEffect(() => {
    const unsubs = COLLECTIONS.map((name) =>
      onSnapshot(
        collection(db, name),
        (snap) => setCounts((prev) => ({ ...prev, [name]: snap.size })),
        (err) => setError(err.message)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // Full contents of the selected collection.
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, active),
      (snap) => {
        setDocs(
          snap.docs.map((d) => ({
            id: d.id,
            data: d.data() as Record<string, unknown>,
          }))
        );
        setLoading(false);
        setError('');
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [active]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        JSON.stringify(d.data).toLowerCase().includes(q)
    );
  }, [docs, search]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {COLLECTIONS.map((name) => (
            <button
              key={name}
              onClick={() => setActive(name)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                active === name
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300 hover:text-stone-900'
              }`}
            >
              {name}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  active === name ? 'bg-white/20' : 'bg-stone-100'
                }`}
              >
                {counts[name] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-stone-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/15 outline-none text-sm transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
            <Database className="w-7 h-7 text-stone-400" />
          </div>
          <p className="text-stone-500 font-medium">
            {search ? 'Nothing matches that search' : `No documents in ${active}`}
          </p>
          <p className="text-stone-400 text-sm mt-1">
            This is exactly what Firestore holds right now
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((docItem) => (
            <div
              key={docItem.id}
              className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"
            >
              <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-100 bg-stone-50/60">
                <Database className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span className="font-mono text-xs text-stone-500">
                  {active}/
                </span>
                <span className="font-mono text-xs font-semibold text-stone-900 truncate">
                  {docItem.id}
                </span>
                <span className="ml-auto text-xs text-stone-400 shrink-0">
                  {Object.keys(docItem.data).length} fields
                </span>
              </div>

              <div className="divide-y divide-stone-50">
                {Object.entries(docItem.data)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => (
                    <div
                      key={key}
                      className="flex flex-col sm:flex-row gap-1 sm:gap-4 px-5 py-2.5"
                    >
                      <span className="font-mono text-xs font-semibold text-stone-500 sm:w-40 shrink-0">
                        {key}
                      </span>
                      <pre className="font-mono text-xs text-stone-800 whitespace-pre-wrap break-words min-w-0 flex-1 m-0">
                        {formatValue(value)}
                      </pre>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
