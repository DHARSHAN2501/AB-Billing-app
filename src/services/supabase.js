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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: safeStorage, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

export const localDB = {
  getOrders: () => {
    const data = safeStorage.getItem('smart_rest_orders');
    if (!data) return [];
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        const sanitized = parsed.filter(o => {
          const idStr = String(o.id || o.order_number || '').toLowerCase();
          return idStr !== 'ord-1024' && idStr !== 'ord1024';
        });
        if (sanitized.length !== parsed.length) {
          safeStorage.setItem('smart_rest_orders', JSON.stringify(sanitized));
          return sanitized;
        }
      }
      return parsed;
    } catch(e) {
      return [];
    }
  },
  saveOrders: (ordersList) => safeStorage.setItem('smart_rest_orders', JSON.stringify(ordersList || [])),
  updateOrderStatus: (id, status) => {
    const list = localDB.getOrders();
    const matchKey = String(id || '').toLowerCase();
    const order = list.find(o => {
      const idStr = String(o.id || '').toLowerCase();
      const numStr = String(o.order_number || '').toLowerCase();
      return idStr === matchKey || numStr === matchKey || matchKey.includes(numStr);
    });
    if (order) {
      order.order_status = status;
      safeStorage.setItem('smart_rest_orders', JSON.stringify(list));
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('smart_rest_bc_orders');
          bc.postMessage({ type: 'ORDER_UPDATE', detail: { id, order_status: status } });
          bc.close();
        } catch (e) {}
      }
      window.dispatchEvent(new CustomEvent('smart_rest_event_orders', { detail: { id, order_status: status } }));
    }
  },
  updateBillStatus: (id, status) => {
    const list = localDB.getOrders();
    const matchKey = String(id || '').toLowerCase();
    const order = list.find(o => {
      const idStr = String(o.id || '').toLowerCase();
      const numStr = String(o.order_number || '').toLowerCase();
      return idStr === matchKey || numStr === matchKey || matchKey.includes(numStr);
    });
    if (order) {
      order.bill_status = status;
      safeStorage.setItem('smart_rest_orders', JSON.stringify(list));
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('smart_rest_bc_orders');
          bc.postMessage({ type: 'ORDER_UPDATE', detail: { id, bill_status: status } });
          bc.close();
        } catch (e) {}
      }
      window.dispatchEvent(new CustomEvent('smart_rest_event_orders', { detail: { id, bill_status: status } }));
    }
  },
  markTablePaid: (tableNumber, orderId) => {
    const list = localDB.getOrders();
    let updated = false;
    list.forEach(o => {
      const matchTbl = tableNumber !== undefined && tableNumber !== null && Number(tableNumber) > 0 && Number(o.table_number) === Number(tableNumber);
      const matchId = (orderId && (String(o.id || '').toLowerCase() === String(orderId || '').toLowerCase() || String(o.order_number || '').toLowerCase() === String(orderId || '').toLowerCase())) ||
                      (tableNumber && (String(o.id || '').toLowerCase() === String(tableNumber || '').toLowerCase() || String(o.order_number || '').toLowerCase() === String(tableNumber || '').toLowerCase()));
      const s = String(o.order_status || o.status || '').toUpperCase().trim();
      const isCancelled = s === 'CANCELLED' || s === 'CANCEL_REQUESTED' || s.includes('CANCEL');
      if ((matchTbl || matchId) && o.bill_status !== 'PAID' && !isCancelled) {
        o.bill_status = 'PAID';
        updated = true;
      }
    });
    if (updated) {
      safeStorage.setItem('smart_rest_orders', JSON.stringify(list));
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('smart_rest_bc_orders');
          bc.postMessage({ type: 'ORDER_UPDATE', detail: { table_number: tableNumber, orderId, bill_status: 'PAID' } });
          bc.close();
        } catch (e) {}
      }
      window.dispatchEvent(new CustomEvent('smart_rest_event_orders', { detail: { table_number: tableNumber, orderId, bill_status: 'PAID' } }));
    }
  }
};
