const memoryStore = new Map();

export const safeStorage = {
  getItem: (key) => {
    try {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    } catch (e) {}
    return memoryStore.get(key) || null;
  },
  setItem: (key, val) => {
    try {
      window.localStorage.setItem(key, val);
    } catch (e) {}
    memoryStore.set(key, val);
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {}
    memoryStore.delete(key);
  }
};

// Purge legacy browser localStorage DB mirrors so database remains the single source of truth
(function purgeLegacyLocalStorage() {
  const obsoleteKeys = [
    'smart_rest_categories',
    'smart_rest_deleted_categories',
    'smart_rest_menu_items',
    'smart_rest_deleted_menu_items',
    'smart_rest_orders',
    'smart_rest_tables',
    'smart_rest_employees',
    'smart_rest_attendance',
    'smart_rest_reviews',
    'smart_rest_dishes_truncated_v1'
  ];
  obsoleteKeys.forEach((key) => {
    safeStorage.removeItem(key);
  });
})();

import { createClient } from '@supabase/supabase-js';

const REAL_SUPABASE_URL = 'https://thsuvmauyksxiltzutwx.supabase.co';
const REAL_SUPABASE_KEY = 'sb_publishable_9EfDMt_QKs7oaYPYCp_h-w_to0VizR6';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_URL !== 'https://sample-restaurant.supabase.co')
  ? import.meta.env.VITE_SUPABASE_URL
  : REAL_SUPABASE_URL;

const supabaseAnonKey = (typeof import.meta !== 'undefined' && (import.meta?.env?.VITE_SUPABASE_ANON_KEY || import.meta?.env?.VITE_SUPABASE_PUBLISHABLE_KEY))
  ? (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  : REAL_SUPABASE_KEY;

export const isSupabaseConfigured = () => true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage,
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});
