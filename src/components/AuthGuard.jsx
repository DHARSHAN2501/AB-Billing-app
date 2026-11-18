import React, { useState } from 'react';
import { authService, STAFF_ROLES } from '../services/authService.js';
import { Lock, KeyRound, ArrowRight, ShieldCheck } from 'lucide-react';

export const StaffLoginScreen = ({ requiredRole = STAFF_ROLES.ADMIN, appTitle = 'Staff Portal', onLoginSuccess }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.loginWithPin(pin, requiredRole);
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err) {
      setError(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const roleName = requiredRole === STAFF_ROLES.ADMIN
    ? 'Administrator'
    : requiredRole === STAFF_ROLES.KITCHEN
    ? 'Kitchen Chef'
    : 'Cashier';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">{appTitle}</h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">Authorized {roleName} Access Required</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Enter Staff PIN
            </label>
            <div className="relative">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                placeholder="••••"
                autoFocus
                className="w-full text-center tracking-[0.5em] text-2xl font-mono px-4 py-3 bg-slate-900/80 border border-slate-700 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <KeyRound className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
            {error && (
              <p className="text-xs text-rose-400 mt-2 text-center font-medium">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !pin.trim()}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Unlock Terminal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Encrypted Session • Session Auto-Expires</span>
        </div>
      </div>
    </div>
  );
};

export const AuthGuard = ({ children, requiredRole = STAFF_ROLES.ADMIN, appTitle }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => authService.isAuthenticated(requiredRole));

  if (!isAuthenticated) {
    return (
      <StaffLoginScreen
        requiredRole={requiredRole}
        appTitle={appTitle}
        onLoginSuccess={() => setIsAuthenticated(true)}
      />
    );
  }

  return children;
};
