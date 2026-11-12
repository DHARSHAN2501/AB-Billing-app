import { safeStorage } from './supabase.js';

const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_URL) || 'https://thsuvmauyksxiltzutwx.supabase.co';
const SUPABASE_KEY = (typeof import.meta !== 'undefined' && (import.meta?.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta?.env?.VITE_SUPABASE_ANON_KEY)) || 'sb_publishable_9EfDMt_QKs7oaYPYCp_h-w_to0VizR6';

class RequestManager {
  constructor() {
    this.inflightGets = new Map();
  }

  dedupeGet(requestKey, factory) {
    if (!requestKey) return factory();
    if (this.inflightGets.has(requestKey)) {
      return this.inflightGets.get(requestKey);
    }
    const promise = (async () => {
      try {
        return await factory();
      } finally {
        if (this.inflightGets.get(requestKey) === promise) {
          this.inflightGets.delete(requestKey);
        }
      }
    })();
    this.inflightGets.set(requestKey, promise);
    return promise;
  }

  isAbortError(err) {
    return Boolean(err && (err.name === 'AbortError' || String(err).includes('AbortError')));
  }
}

export const requestManager = new RequestManager();

export async function supabaseRequest(endpoint, options = {}) {
  const { requestKey, signal: externalSignal, ...fetchOptions } = options;
  const method = String(fetchOptions.method || 'GET').toUpperCase();

  const runFetch = async () => {
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
        signal: externalSignal,
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

      return data;
    } catch (err) {
      if (externalSignal?.aborted && requestManager.isAbortError(err)) {
        return null;
      }
      throw err;
    }
  };

  if (method === 'GET' && requestKey && !externalSignal) {
    return requestManager.dedupeGet(requestKey, runFetch);
  }

  return runFetch();
}

export async function getOrders() {
  return supabaseRequest("orders?select=*&order=created_at.desc&limit=100", { requestKey: "orders_list" });
}

export async function markBillPaid(orderId) {
  return supabaseRequest(`orders?or=(id.eq.${orderId},order_number.eq.${orderId})&bill_status=neq.PAID`, {
    method: "PATCH",
    body: JSON.stringify({ bill_status: "PAID" })
  });
}

