import { safeStorage } from './supabase.js';

export const STAFF_ROLES = {
  ADMIN: 'ADMIN',
  KITCHEN: 'KITCHEN',
  CASHIER: 'CASHIER',
  MANAGER: 'MANAGER'
};

const SESSION_KEY = 'smart_rest_staff_session';
const SESSION_DURATION_HOURS = 12;

const DEFAULT_PINS = {
  [STAFF_ROLES.ADMIN]: (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_ADMIN_PIN) || '8899',
  [STAFF_ROLES.KITCHEN]: (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_KITCHEN_PIN) || '4455',
  [STAFF_ROLES.CASHIER]: (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_CASHIER_PIN) || '2233'
};

export const authService = {
  getStaffSession: () => {
    try {
      const raw = safeStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !session.expiresAt) {
        authService.logout();
        return null;
      }
      if (Date.now() > session.expiresAt) {
        authService.logout();
        return null;
      }
      return session;
    } catch (e) {
      authService.logout();
      return null;
    }
  },

  isAuthenticated: (requiredRole = null) => {
    const session = authService.getStaffSession();
    if (!session) return false;
    if (!requiredRole) return true;
    if (session.role === STAFF_ROLES.ADMIN) return true;
    return session.role === requiredRole;
  },

  loginWithPin: async (pin, expectedRole = STAFF_ROLES.ADMIN) => {
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) {
      throw new Error('Please enter your staff PIN.');
    }

    const targetPin = DEFAULT_PINS[expectedRole];
    const adminPin = DEFAULT_PINS[STAFF_ROLES.ADMIN];

    const isValid = cleanPin === targetPin || cleanPin === adminPin;
    if (!isValid) {
      throw new Error('Invalid PIN. Please check and try again.');
    }

    const actualRole = cleanPin === adminPin ? STAFF_ROLES.ADMIN : expectedRole;
    const expiresAt = Date.now() + (SESSION_DURATION_HOURS * 60 * 60 * 1000);
    const session = {
      role: actualRole,
      username: `${actualRole.toLowerCase()}_operator`,
      expiresAt,
      loginAt: Date.now()
    };

    safeStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  },

  logout: () => {
    safeStorage.removeItem(SESSION_KEY);
  }
};
