import { supabase, isSupabaseConfigured } from './supabase';
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

let cachedBillingOrders = null;

function sortOrdersDesc(list) {
  return [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function applyRealtimeOrderChange(currentList, payload) {
  if (!Array.isArray(currentList) || !payload) return null;
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'DELETE') {
    const delId = oldRow?.id;
    if (!delId) return null;
    return currentList.filter(o => o.id !== delId);
  }

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    if (!newRow || !newRow.id) return null;
    if (isCancelledOrder(newRow)) {
      return currentList.filter(o => o.id !== newRow.id);
    }
    const idx = currentList.findIndex(o => o.id === newRow.id || (o.order_number && o.order_number === newRow.order_number));
    if (idx >= 0) {
      const next = [...currentList];
      next[idx] = { ...next[idx], ...newRow };
      return next;
    }
    return sortOrdersDesc([newRow, ...currentList]);
  }

  return null;
}

export const billingService = {
  getOrders: async () => {
    try {
      const remoteData = await ajaxGetOrders();
      if (remoteData && Array.isArray(remoteData)) {
        cachedBillingOrders = sortOrdersDesc(remoteData.filter(o => !isCancelledOrder(o)));
        return cachedBillingOrders;
      }
    } catch (e) {
      console.warn('Billing API getOrders error:', e.message);
    }
    return cachedBillingOrders || [];
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
    let apiSuccess = true;
    try {
      const res = await ajaxMarkBillPaid(orderId);
      if (Array.isArray(res) && res.length === 0) {
        console.warn(`[Dual Cashier Guard] Order ${orderId} was already settled by another cashier.`);
        apiSuccess = false;
      } else if (Array.isArray(cachedBillingOrders)) {
        cachedBillingOrders = cachedBillingOrders.map(o =>
          (o.id === orderId || o.order_number === orderId) ? { ...o, bill_status: 'PAID' } : o
        );
      }
    } catch (e) {
      console.warn('REST API markBillPaid error:', e.message);
      throw e;
    }

    const updateEventPayload = {
      orderId,
      tableNumber,
      bill_status: 'PAID',
      timestamp: Date.now(),
      alreadyPaid: !apiSuccess
    };

    try {
      window.dispatchEvent(new CustomEvent('smart_rest_event_orders', { detail: updateEventPayload }));
    } catch (e) {}

    return apiSuccess;
  },

  subscribeToOrders: (callback) => {
    const cleanups = [];
    let isRealtimeSubscribed = false;
    let hasConnectedOnce = false;

    if (isSupabaseConfigured()) {
      try {
        const sub = supabase
          .channel('public:orders:billing')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
            const patched = applyRealtimeOrderChange(cachedBillingOrders, payload);
            if (patched) {
              cachedBillingOrders = patched;
              callback({ eventType: payload.eventType, new: payload.new, old: payload.old, orders: patched });
            } else {
              callback(payload);
            }
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              isRealtimeSubscribed = true;
              if (hasConnectedOnce) {
                billingService.getOrders().then(fresh => {
                  callback({ eventType: 'RECONNECT_RESYNC', orders: fresh });
                }).catch(() => {});
              }
              hasConnectedOnce = true;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              isRealtimeSubscribed = false;
            }
          });
        cleanups.push(() => supabase.removeChannel(sub));
      } catch (e) {}
    }

    // Fallback poll runs ONLY when WebSocket Realtime is not SUBSCRIBED and tab is visible
    let isPolling = false;
    const pollInterval = setInterval(async () => {
      if (isRealtimeSubscribed) return;
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
    }, 25000);
    cleanups.push(() => clearInterval(pollInterval));

    return () => {
      cleanups.forEach(fn => fn());
    };
  }
};
