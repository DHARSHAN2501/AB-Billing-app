import { safeStorage } from './supabase.js';

const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_URL) || 'https://thsuvmauyksxiltzutwx.supabase.co';
const SUPABASE_KEY = (typeof import.meta !== 'undefined' && (import.meta?.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta?.env?.VITE_SUPABASE_ANON_KEY)) || 'sb_publishable_9EfDMt_QKs7oaYPYCp_h-w_to0VizR6';

class RequestManager {
  constructor() {
    this.controllers = new Map();
    this.requestCounters = new Map();
  }

  getSignal(requestKey, externalSignal = null) {
    if (!requestKey) return { signal: externalSignal, requestId: null, isLatest: () => true, cleanup: () => {} };

    if (this.controllers.has(requestKey)) {
      try { this.controllers.get(requestKey).abort(); } catch (e) {}
    }

    const controller = new AbortController();
    this.controllers.set(requestKey, controller);
    const currentId = (this.requestCounters.get(requestKey) || 0) + 1;
    this.requestCounters.set(requestKey, currentId);

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => {
          try { controller.abort(); } catch (e) {}
        });
      }
    }

    return {
      signal: controller.signal,
      requestId: currentId,
      isLatest: () => this.requestCounters.get(requestKey) === currentId,
      cleanup: () => {
        if (this.controllers.get(requestKey) === controller) {
          this.controllers.delete(requestKey);
        }
      }
    };
  }

  isAbortError(err) {
    return err && (err.name === 'AbortError' || String(err).includes('AbortError'));
  }
}

export const requestManager = new RequestManager();

export async function supabaseRequest(endpoint, options = {}) {
  const { requestKey, signal: externalSignal, ...fetchOptions } = options;

  let requestHelper = null;
  let signalToUse = externalSignal;

  if (requestKey) {
    requestHelper = requestManager.getSignal(requestKey, externalSignal);
    signalToUse = requestHelper.signal;
  }

  let authHeader = `Bearer ${SUPABASE_KEY}`;
  try {
    const sessionStr = safeStorage.getItem('sb-thsuvmauyksxiltzutwx-auth-token') || safeStorage.getItem('smart_rest_auth_token');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      if (session?.access_token) {
        authHeader = `Bearer ${session.access_token}`;
      }
    }
  } catch (e) {}

  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: signalToUse,
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": authHeader,
        "Prefer": "return=representation",
        ...(fetchOptions.headers || {})
      }
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      console.warn("Supabase API Warning:", { status: response.status, endpoint, data });
      throw new Error(data?.message || data?.details || `Supabase request failed: ${response.status}`);
    }

    if (requestHelper && !requestHelper.isLatest()) {
      const staleError = new Error('Stale response ignored in favor of newer request');
      staleError.name = 'AbortError';
      throw staleError;
    }

    if (requestHelper) requestHelper.cleanup();
    return data;
  } catch (err) {
    if (requestHelper) requestHelper.cleanup();
    if (requestManager.isAbortError(err)) {
      return null;
    }
    throw err;
  }
}

export async function getOrders() {
  return supabaseRequest("orders?select=*&order=created_at.desc&limit=150", { requestKey: "orders_list" });
}

export async function getOrderById(orderId) {
  const data = await supabaseRequest(`orders?select=*&or=(id.eq.${orderId},order_number.eq.${orderId})`, { requestKey: `order_${orderId}` });
  return Array.isArray(data) ? data[0] : data;
}

export async function getCustomerOrders(tableNumber) {
  return supabaseRequest(`orders?select=*&table_number=eq.${tableNumber}`, { requestKey: `orders_table_${tableNumber}` });
}

export async function markBillPaid(orderId) {
  return supabaseRequest(`orders?or=(id.eq.${orderId},order_number.eq.${orderId})&bill_status=neq.PAID`, {
    method: "PATCH",
    body: JSON.stringify({ bill_status: "PAID" })
  });
}

