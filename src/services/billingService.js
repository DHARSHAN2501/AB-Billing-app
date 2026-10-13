import { supabase, isSupabaseConfigured, localDB } from './supabase';
import { getOrders as ajaxGetOrders, markBillPaid as ajaxMarkBillPaid } from './api';

// Helper to identify cancelled or cancel-requested orders
export const isCancelledOrder = (order) => {
  if (!order) return false;
  const s = String(order.order_status || order.status || '').toUpperCase().trim();
  const b = String(order.bill_status || '').toUpperCase().trim();
  return (
    s === 'CANCELLED' || 
    s === 'CANCEL_REQUESTED' || 
    s.includes('CANCEL') ||
    b === 'CANCELLED' || 
    b === 'VOID'
  );
};

export const billingService = {
  getOrders: async () => {
    try {
      const remoteData = await ajaxGetOrders();
      if (remoteData && Array.isArray(remoteData)) {
        try {
          localDB.saveOrders(remoteData);
        } catch (e) {}
        return remoteData
          .filter(o => !isCancelledOrder(o))
          .sort((a, b) => {
            return new Date(b.created_at || Date.now()) - new Date(a.created_at || Date.now());
          });
      }
    } catch (e) {
      console.warn('Billing API getOrders fallback to localDB:', e.message);
    }
    return (localDB.getOrders() || []).filter(o => !isCancelledOrder(o));
  },

  searchOrders: (orders, query) => {
    const validOrders = (orders || []).filter(o => !isCancelledOrder(o));
    if (!query || !query.trim()) return validOrders;
    const q = query.trim().toLowerCase().replace(/^#/, '');

    return validOrders.filter(o => {
      const orderNum = String(o.order_number || o.id || '').toLowerCase();
      const tableNum = String(o.table_number || '').toLowerCase();
      const orderType = String(o.order_type || '').toLowerCase();
      const customer = String(o.customer_name || o.phone || '').toLowerCase();

      return (
        orderNum.includes(q) ||
        tableNum.includes(q) ||
        `t-${tableNum}`.includes(q) ||
        `table ${tableNum}`.includes(q) ||
        `ord-${q}`.includes(orderNum) ||
        orderType.includes(q) ||
        customer.includes(q)
      );
    });
  },

  markPaid: async (orderId, tableNumber) => {
    // 1. Update local DB
    localDB.markTablePaid(tableNumber, orderId);

    // 2. Send API request with atomic race condition check
    let apiSuccess = true;
    try {
      const res = await ajaxMarkBillPaid(orderId);
      if (Array.isArray(res) && res.length === 0) {
        console.warn(`[Dual Cashier Guard] Order ${orderId} was already settled by another cashier.`);
        apiSuccess = false;
      }
    } catch (e) {
      console.warn('REST API markBillPaid warning:', e.message);
    }

    // 3. Broadcast Event across tabs & windows
    const updateEventPayload = { 
      orderId, 
      tableNumber, 
      bill_status: 'PAID', 
      timestamp: Date.now(),
      alreadyPaid: !apiSuccess 
    };

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('smart_rest_bc_orders');
        bc.postMessage({ type: 'ORDER_BILL_PAID', detail: updateEventPayload });
        bc.close();
      } catch (e) {}
    }

    try {
      window.dispatchEvent(new CustomEvent('smart_rest_event_orders', { detail: updateEventPayload }));
    } catch (e) {}

    return apiSuccess;
  },

  subscribeToOrders: (callback) => {
    const cleanups = [];

    // 1. Supabase Realtime Channel with Reconnect Reconciliation
    if (isSupabaseConfigured()) {
      try {
        let channelConnected = false;
        const sub = supabase
          .channel('public:orders:billing')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
            callback(payload);
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              if (channelConnected) {
                // Reconnected after disconnect — reconcile missed orders
                billingService.getOrders().then(fresh => {
                  callback({ eventType: 'RECONNECT_RESYNC', orders: fresh });
                }).catch(() => {});
              }
              channelConnected = true;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              channelConnected = false;
            }
          });
        cleanups.push(() => supabase.removeChannel(sub));
      } catch (e) {}
    }

    // 2. BroadcastChannel for instant cross-tab real-time sync
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('smart_rest_bc_orders');
        bc.onmessage = (event) => {
          callback({ eventType: 'UPDATE', detail: event.data?.detail });
        };
        cleanups.push(() => bc.close());
      } catch (e) {}
    }

    // 3. CustomEvent Listener
    const customListener = (e) => callback({ eventType: 'UPDATE', detail: e.detail });
    window.addEventListener('smart_rest_event_orders', customListener);
    cleanups.push(() => window.removeEventListener('smart_rest_event_orders', customListener));

    // 4. Storage Event Listener
    const storageListener = (e) => {
      if (e.key === 'smart_rest_orders') {
        callback({ eventType: 'UPDATE' });
      }
    };
    window.addEventListener('storage', storageListener);
    cleanups.push(() => window.removeEventListener('storage', storageListener));

    // 5. Adaptive Ajax Auto-Refresh Interval (Fallback polling when tab is visible, passing data directly)
    let isPolling = false;
    const pollInterval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isPolling) return;
      isPolling = true;
      try {
        const fresh = await billingService.getOrders();
        callback({ eventType: 'POLL_REFRESH', orders: fresh });
      } catch (e) {
      } finally {
        isPolling = false;
      }
    }, 8000);
    cleanups.push(() => clearInterval(pollInterval));

    return () => {
      cleanups.forEach(fn => fn());
    };
  }
};
