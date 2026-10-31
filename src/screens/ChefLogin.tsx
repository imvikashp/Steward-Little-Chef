import { useState } from 'react';
import { loginChef } from '@/lib/chefAuth';
import {
  ChefHat,
  Lock,
  Mail,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export default function ChefLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (email.trim().length === 0) {
      setError('Please enter your email');
      return;
    }
    if (password.length === 0) {
      setError('Please enter your password');
      return;
    }

    setError('');
    setLoading(true);
    try {
      // On success the auth listener in App swaps in the dashboard.
      await loginChef(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-stone-900 shadow-lg shadow-stone-900/20 mb-4">
            <ChefHat className="w-10 h-10 text-amber-400" />
          </div>
          <h1 className="text-3xl font-bold text-stone-900">Kitchen Command</h1>
          <p className="text-stone-500 mt-1">Chef Order Dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-stone-900/5 p-8 border border-stone-200">
          <h2 className="text-xl font-semibold text-stone-900 mb-1">
            Chef Login
          </h2>
          <p className="text-sm text-stone-500 mb-6">
            Log in to see the live kitchen orders
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  placeholder="chef@admin.in"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-stone-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all text-stone-900 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••"
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-stone-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all text-stone-900 font-medium"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-stone-900/20 transition-all active:scale-[0.98] disabled:opacity-70"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Enter Kitchen
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-stone-400 text-center mt-6">
            Chef accounts are managed in Firebase Authentication
          </p>
        </div>
      </div>
    </div>
  );
}
