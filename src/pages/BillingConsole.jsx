import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Receipt, 
  CheckCircle2, 
  Clock, 
  Utensils, 
  Printer, 
  Bell, 
  RefreshCw,
  Hash,
  ShoppingBag,
  DollarSign,
  AlertCircle,
  X,
  ShieldCheck,
  Truck,
  MapPin,
  Phone,
  User,
  XCircle
} from 'lucide-react';
import { billingService } from '../services/billingService';

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

// Helper to determine if an order is Home Delivery
export const isDeliveryOrder = (order) => {
  if (!order) return false;
  return (
    order.order_type === 'HOME_DELIVERY' || 
    Number(order.table_number) === 0 || 
    Boolean(order.delivery_address && String(order.delivery_address).trim().length > 0)
  );
};

export const BillingConsole = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('UNPAID'); // Default to 'UNPAID' so paid orders don't clutter active screen!
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [processingPaid, setProcessingPaid] = useState(false);
  const [successBanner, setSuccessBanner] = useState(null);

  // Load orders from API + localDB
  const fetchOrders = async (providedOrders = null) => {
    try {
      const data = providedOrders || await billingService.getOrders();
      const list = (data || []).filter(o => !isCancelledOrder(o));
      setOrders(list);

      // Auto-select first unpaid non-cancelled order if none selected or keep current selection updated
      setSelectedOrder(prev => {
        const unpaidList = list.filter(o => o.bill_status !== 'PAID' && !isCancelledOrder(o));
        if (!prev) return unpaidList.length > 0 ? unpaidList[0] : null;
        if (prev) {
          if ((prev.bill_status === 'PAID' && activeTab !== 'PAID') || isCancelledOrder(prev)) {
            return unpaidList.length > 0 ? unpaidList[0] : null;
          }
          const updated = list.find(o => String(o.id || o.order_number) === String(prev.id || prev.order_number));
          return updated || (unpaidList.length > 0 ? unpaidList[0] : null);
        }
        return null;
      });
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // Subscribe to real-time order updates
    const unsubscribe = billingService.subscribeToOrders((event) => {
      fetchOrders(event?.orders || null);
    });

    return () => unsubscribe();
  }, [activeTab]);

  // Filter orders based on active tab and search query
  const filteredOrders = useMemo(() => {
    let result = billingService.searchOrders(orders, searchQuery)
      .filter(o => !isCancelledOrder(o));

    if (activeTab === 'REQUESTED') {
      result = result.filter(o => o.bill_status === 'REQUESTED');
    } else if (activeTab === 'UNPAID') {
      result = result.filter(o => o.bill_status !== 'PAID');
    } else if (activeTab === 'PAID') {
      result = result.filter(o => o.bill_status === 'PAID');
    } else if (activeTab === 'ALL') {
      // Show unpaid orders by default in active workspace
      result = result.filter(o => o.bill_status !== 'PAID');
    }

    return result.filter(o => !isCancelledOrder(o));
  }, [orders, searchQuery, activeTab]);

  // Counts for tabs
  const billRequestedCount = useMemo(() => {
    return orders.filter(o => o.bill_status === 'REQUESTED' && !isCancelledOrder(o)).length;
  }, [orders]);

  const unpaidCount = useMemo(() => {
    return orders.filter(o => o.bill_status !== 'PAID' && !isCancelledOrder(o)).length;
  }, [orders]);

  // Handle Mark Paid
  const handleMarkPaid = async (order) => {
    if (!order || isCancelledOrder(order)) {
      alert('This order has been cancelled. Payment cannot be collected.');
      return;
    }
    setProcessingPaid(true);
    try {
      const isNewlySettled = await billingService.markPaid(order.id || order.order_number, order.table_number, order);
      
      const orderNum = order.order_number || order.id;
      const isDeliv = isDeliveryOrder(order);
      if (isNewlySettled === false) {
        setSuccessBanner(`Bill for #${orderNum} was already settled by another cashier or session.`);
      } else {
        const orderTypeLabel = isDeliv 
          ? `Home Delivery (Customer: ${order.customer_name || 'Guest'})` 
          : `Dine-In (Table ${order.table_number || 'N/A'})`;
        setSuccessBanner(`✓ ${orderTypeLabel} Bill for Order #${orderNum} marked as PAID successfully!`);
      }
      
      const latestOrders = await billingService.getOrders();
      const updatedList = (latestOrders || []).filter(o => !isCancelledOrder(o));
      setOrders(updatedList);

      // Auto-advance to next remaining unpaid order
      const remainingUnpaid = updatedList.filter(o => o.bill_status !== 'PAID' && !isCancelledOrder(o));
      if (remainingUnpaid.length > 0) {
        setSelectedOrder(remainingUnpaid[0]);
      } else {
        setSelectedOrder(null);
      }

      // Clear success banner after 4s
      setTimeout(() => {
        setSuccessBanner(null);
      }, 4000);
    } catch (err) {
      alert('Failed to update bill status: ' + err.message);
    } finally {
      setProcessingPaid(false);
    }
  };

  // Handle Print Receipt
  const handlePrint = () => {
    window.print();
  };

  // Calculate bill totals safely
  const calculateBillDetails = (order) => {
    if (!order) return { items: [], subtotal: 0, tax: 0, total: 0, isCancelled: false };

    // Void out cancelled orders so payable amount is 0 and cannot be paid
    if (isCancelledOrder(order)) {
      return {
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        isCancelled: true
      };
    }

    const rawItems = Array.isArray(order.items) 
      ? order.items 
      : (typeof order.items === 'string' ? JSON.parse(order.items || '[]') : []);

    let items = rawItems.map(i => {
      const price = Number(i.price || i.unit_price || 0);
      const qty = Number(i.quantity || i.qty || 1);
      return {
        name: i.name || i.item_name || 'Menu Dish',
        price: price,
        quantity: qty,
        total: price * qty,
        instructions: i.special_instructions || i.instructions || ''
      };
    });

    let total = Number(order.total_amount || 0);
    let subtotal = Number(order.subtotal || 0);

    if (total > 0 && subtotal === 0) {
      subtotal = total / 1.05; // Back-calculate subtotal assuming 5% GST
    } else if (subtotal > 0 && total === 0) {
      total = subtotal * 1.05;
    } else if (subtotal === 0 && total === 0 && items.length > 0) {
      subtotal = items.reduce((sum, item) => sum + item.total, 0);
      total = subtotal * 1.05;
    }

    const tax = total - subtotal;

    return {
      items,
      subtotal: Math.max(0, subtotal),
      tax: Math.max(0, tax),
      total: Math.max(0, total),
      isCancelled: false
    };
  };

  const currentBill = useMemo(() => calculateBillDetails(selectedOrder), [selectedOrder]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-amber-500 selection:text-slate-950 pb-12">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl overflow-hidden shadow-lg shadow-amber-500/20 border border-amber-500/30 shrink-0 bg-slate-900">
              <img src="/billing-app-icon.png" alt="Arunachala Bhavan Billing" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white leading-tight">Arunachala Bhavan</h1>
              <p className="text-xs text-amber-400 font-bold flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Billing
              </p>
            </div>
          </div>

          {/* Quick Stats & Refresh */}
          <div className="flex items-center gap-3">
            {billRequestedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold animate-pulse">
                <Bell className="w-4 h-4 text-rose-400" />
                <span>{billRequestedCount} Bill Request{billRequestedCount > 1 ? 's' : ''} Pending!</span>
              </div>
            )}

            <button
              onClick={fetchOrders}
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition border border-slate-700 flex items-center gap-2 text-xs font-semibold"
              title="Sync Orders Now"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
              <span>Refresh</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Success Banner */}
        {successBanner && (
          <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-2xl p-4 flex items-center justify-between gap-3 text-emerald-300 text-sm font-semibold shadow-lg shadow-emerald-950/40">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
              <span>{successBanner}</span>
            </div>
            <button onClick={() => setSuccessBanner(null)} className="text-emerald-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Order Search & Barcode / Order Number Entry */}
        <div className="bg-slate-900 rounded-3xl p-4 sm:p-6 border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-amber-500">
                <Hash className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter Order Number (e.g. ORD5650) or Table Number (e.g. T-12)..."
                className="w-full pl-11 pr-10 py-3.5 bg-slate-950 text-white placeholder-slate-500 rounded-2xl border border-slate-700/80 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-sm font-bold transition outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 w-full md:w-auto overflow-x-auto">

              <button
                onClick={() => setActiveTab('REQUESTED')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'REQUESTED'
                    ? 'bg-rose-500 text-white shadow-md font-black'
                    : 'text-slate-400 hover:text-rose-300'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                Bill Requested ({billRequestedCount})
              </button>

              <button
                onClick={() => setActiveTab('UNPAID')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'UNPAID'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Unpaid ({unpaidCount})
              </button>

              <button
                onClick={() => setActiveTab('PAID')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'PAID'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Paid
              </button>
            </div>
          </div>
        </div>

        {/* Console Workspace: Left Grid of Orders + Right Receipt View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Orders Queue List */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-500" />
                Active Orders ({filteredOrders.length})
              </h2>
              <span className="text-[11px] text-slate-500 font-semibold">Click order to cross-check</span>
            </div>

            {loading ? (
              <div className="bg-slate-900 rounded-3xl p-12 text-center border border-slate-800 space-y-3">
                <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-400">Loading Orders...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-slate-900 rounded-3xl p-10 text-center border border-slate-800 space-y-3">
                <AlertCircle className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-sm font-bold text-slate-300">No matching orders found</p>
                <p className="text-xs text-slate-500">Try entering a different Order # or Table # above.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {filteredOrders.map((order) => {
                  const isSelected = selectedOrder && (String(selectedOrder.id || selectedOrder.order_number) === String(order.id || order.order_number));
                  const isRequested = order.bill_status === 'REQUESTED';
                  const isPaid = order.bill_status === 'PAID';
                  const details = calculateBillDetails(order);

                  return (
                    <div
                      key={order.id || order.order_number}
                      onClick={() => setSelectedOrder(order)}
                      className={`p-4 rounded-2xl border transition cursor-pointer relative overflow-hidden ${
                        isSelected
                          ? 'bg-slate-900 border-amber-500 ring-2 ring-amber-500/20 shadow-xl'
                          : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                      }`}
                    >
                      {/* Status indicator bar */}
                      <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                        isPaid ? 'bg-emerald-500' : (isRequested ? 'bg-rose-500' : 'bg-amber-500')
                      }`} />

                      <div className="pl-2 space-y-2">
                        {/* Order Type & Status Row */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isDeliveryOrder(order) ? (
                              <span className="px-2.5 py-1 rounded-xl bg-fuchsia-500/20 border border-fuchsia-500/40 font-black text-xs text-fuchsia-300 inline-flex items-center gap-1.5 shadow-xs">
                                <Truck className="w-3.5 h-3.5 text-fuchsia-400" />
                                Home Delivery
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-xl bg-blue-500/20 border border-blue-500/40 font-black text-xs text-cyan-300 inline-flex items-center gap-1.5 shadow-xs">
                                <Utensils className="w-3.5 h-3.5 text-cyan-400" />
                                Table {order.table_number || '1'} (Dine-In)
                              </span>
                            )}
                            <span className="font-extrabold text-sm text-white font-mono">
                              #{order.order_number || order.id}
                            </span>
                          </div>

                          <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md whitespace-nowrap ${
                            isPaid
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : (isRequested
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30')
                          }`}>
                            {isPaid ? 'PAID ✓' : (isRequested ? 'BILL REQUESTED' : 'UNPAID')}
                          </span>
                        </div>

                        {/* Customer & Amount Row */}
                        <div className="flex items-center justify-between text-xs text-slate-400 pt-0.5">
                          <div className="flex items-center gap-1.5 text-slate-300 font-semibold truncate max-w-[200px]">
                            <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="truncate">{order.customer_name || 'Guest'}</span>
                            {isDeliveryOrder(order) && order.phone_number && (
                              <span className="text-slate-400 text-[11px] truncate shrink-0">
                                • {order.phone_number}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-slate-500 font-medium">
                              {details.items.length} {details.items.length === 1 ? 'dish' : 'dishes'}
                            </span>
                            <span className="text-amber-400 font-black text-sm">
                              ₹{details.total.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Detailed Itemized Bill Cross-Check & Payment Receipt */}
          <div className="lg:col-span-7">
            {selectedOrder ? (
              <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl space-y-0">
                
                {/* Receipt Card Header */}
                <div className="p-6 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-xl font-black text-white">Itemized Bill Breakdown</h2>
                      {isCancelledOrder(selectedOrder) ? (
                        <span className="text-xs font-black text-rose-200 bg-rose-500/25 border border-rose-400/50 px-3 py-1 rounded-full inline-flex items-center gap-1.5 shadow-sm">
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          ORDER CANCELLED (VOID)
                        </span>
                      ) : isDeliveryOrder(selectedOrder) ? (
                        <span className="text-xs font-black text-fuchsia-200 bg-fuchsia-500/25 border border-fuchsia-400/50 px-3 py-1 rounded-full inline-flex items-center gap-1.5 shadow-sm">
                          <Truck className="w-3.5 h-3.5 text-fuchsia-400" />
                          HOME DELIVERY BILL
                        </span>
                      ) : (
                        <span className="text-xs font-black text-cyan-200 bg-cyan-500/25 border border-cyan-400/50 px-3 py-1 rounded-full inline-flex items-center gap-1.5 shadow-sm">
                          <Utensils className="w-3.5 h-3.5 text-cyan-400" />
                          DINE-IN BILL • TABLE #{selectedOrder.table_number || '1'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-slate-300 font-bold">Order #{selectedOrder.order_number || selectedOrder.id}</span>
                      <span>•</span>
                      <span>Customer: <strong className="text-white">{selectedOrder.customer_name || 'Guest'}</strong></span>
                      <span>•</span>
                      <span>{selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just Now'}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrint}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 transition border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-amber-400" />
                      <span>Print Bill</span>
                    </button>
                  </div>
                </div>

                {/* Cancelled Order Notice Banner */}
                {isCancelledOrder(selectedOrder) && (
                  <div className="bg-rose-500/20 border-b border-rose-500/30 px-6 py-3.5 flex items-center gap-3 text-rose-300 text-xs font-bold">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    <div>
                      <p className="font-extrabold text-sm text-rose-200">Order Cancelled — Voided</p>
                      <p className="text-rose-400/90 font-normal">This order has been cancelled. Bill payment is disabled and payable amount is ₹0.00.</p>
                    </div>
                  </div>
                )}

                {/* Delivery Destination or Dining Spot Banner */}
                {isDeliveryOrder(selectedOrder) ? (
                  <div className="bg-gradient-to-r from-fuchsia-950/80 via-purple-950/50 to-slate-900 border-b border-fuchsia-500/30 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-fuchsia-300 inline-flex items-center gap-1.5 bg-fuchsia-500/20 border border-fuchsia-500/30 px-2.5 py-1 rounded-lg">
                        <Truck className="w-4 h-4 text-fuchsia-400" /> Home Delivery
                      </span>
                      <span className="text-white font-bold flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" /> {selectedOrder.customer_name || 'Customer'}
                      </span>
                      {selectedOrder.phone_number && (
                        <span className="text-fuchsia-300 font-bold flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-fuchsia-400" /> {selectedOrder.phone_number}
                        </span>
                      )}
                    </div>

                    {selectedOrder.delivery_address && (
                      <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                        <MapPin className="w-4 h-4 text-fuchsia-400 shrink-0" />
                        <span className="truncate max-w-sm">{selectedOrder.delivery_address} {selectedOrder.postal_code ? `(${selectedOrder.postal_code})` : ''}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-cyan-950/50 via-slate-900 to-slate-900 border-b border-cyan-500/20 px-6 py-3.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-cyan-300 inline-flex items-center gap-1.5 bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 rounded-lg">
                        <Utensils className="w-4 h-4 text-cyan-400" /> Dine-In Order
                      </span>
                      <span className="text-white font-bold flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" /> {selectedOrder.customer_name || 'Guest Customer'}
                      </span>
                    </div>

                    <span className="text-cyan-300 font-extrabold bg-slate-800 border border-slate-700 px-3 py-1 rounded-xl">
                      Table Spot: T - {String(selectedOrder.table_number || '1').padStart(2, '0')}
                    </span>
                  </div>
                )}

                {/* Bill Cross-Check Notice */}
                {selectedOrder.bill_status === 'REQUESTED' && !isCancelledOrder(selectedOrder) && (
                  <div className="bg-rose-500/10 border-b border-rose-500/20 px-6 py-3 flex items-center gap-3 text-rose-300 text-xs font-bold">
                    <Bell className="w-4 h-4 text-rose-400 animate-bounce" />
                    <span>
                      {isDeliveryOrder(selectedOrder)
                        ? `Customer (${selectedOrder.customer_name || 'Delivery'}) requested bill payment settlement! Verify items below.`
                        : `Customer on Table ${selectedOrder.table_number} requested the bill! Verify items below before settling payment.`}
                    </span>
                  </div>
                )}

                {/* Itemized Items Table */}
                <div className="p-6 space-y-6">
                  <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 font-extrabold uppercase tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Item & Description</th>
                          <th className="py-3 px-3 text-center">Qty</th>
                          <th className="py-3 px-3 text-right">Price</th>
                          <th className="py-3 px-4 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {currentBill.items.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-500 font-medium">
                              {isCancelledOrder(selectedOrder) ? 'Order is cancelled. No payable items.' : 'No item details recorded for this order.'}
                            </td>
                          </tr>
                        ) : (
                          currentBill.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/40">
                              <td className="py-3 px-4 font-bold text-slate-200">
                                <div>{item.name}</div>
                                {item.instructions && (
                                  <div className="text-[11px] text-amber-400/90 font-normal italic">
                                    Note: {item.instructions}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-slate-300 bg-slate-900/30">
                                {item.quantity}
                              </td>
                              <td className="py-3 px-3 text-right font-medium text-slate-400">
                                ₹{item.price.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-right font-extrabold text-white">
                                ₹{item.total.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Calculations Summary */}
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between text-slate-400 font-medium">
                      <span>Subtotal (Items Total)</span>
                      <span>₹{currentBill.subtotal.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400 font-medium">
                      <span>GST Tax (5%)</span>
                      <span>₹{currentBill.tax.toFixed(2)}</span>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-base font-black text-white">
                      <span className={`${isCancelledOrder(selectedOrder) ? 'text-rose-400' : 'text-amber-400'} flex items-center gap-2`}>
                        <img src="/billing-coin-icon.png" alt="S$" className="w-5 h-5 object-contain" />
                        {isCancelledOrder(selectedOrder) ? 'Order Voided (Amount Payable)' : 'Grand Total Payable'}
                      </span>
                      <span className={`text-xl ${isCancelledOrder(selectedOrder) ? 'text-rose-400' : 'text-amber-400'} font-black`}>
                        ₹{currentBill.total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Settle Action Button */}
                  <div className="pt-2">
                    {isCancelledOrder(selectedOrder) ? (
                      <div className="w-full py-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-black text-sm text-center flex items-center justify-center gap-2">
                        <XCircle className="w-5 h-5 text-rose-400" />
                        <span>Order Cancelled — Payment Disabled (Unable to Pay)</span>
                      </div>
                    ) : selectedOrder.bill_status === 'PAID' ? (
                      <div className="w-full py-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-sm text-center flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span>
                          {isDeliveryOrder(selectedOrder)
                            ? 'Home Delivery Bill Settled & Paid ✓'
                            : `Table #${selectedOrder.table_number || '1'} Bill Settled & Paid ✓`}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {/* Order Mode Indicator Badge */}
                        <div className="flex items-center justify-between text-xs font-black px-1">
                          {isDeliveryOrder(selectedOrder) ? (
                            <span className="text-fuchsia-300 flex items-center gap-1.5">
                              <Truck className="w-4 h-4 text-fuchsia-400" />
                              Settling: Home Delivery Bill
                            </span>
                          ) : (
                            <span className="text-cyan-300 flex items-center gap-1.5">
                              <Utensils className="w-4 h-4 text-cyan-400" />
                              Settling: Dine-In Table #{selectedOrder.table_number || '1'} Bill
                            </span>
                          )}
                          <span className="text-slate-400 font-medium">
                            Customer: <strong className="text-white">{selectedOrder.customer_name || 'Guest'}</strong>
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={processingPaid}
                          onClick={() => handleMarkPaid(selectedOrder)}
                          className={`w-full py-4 rounded-2xl text-white font-black text-sm shadow-xl flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer ${
                            isDeliveryOrder(selectedOrder)
                              ? 'bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 shadow-fuchsia-950/50'
                              : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-emerald-950/50'
                          }`}
                        >
                          {processingPaid ? (
                            <>
                              <RefreshCw className="w-5 h-5 animate-spin" />
                              <span>Updating Bill Payment...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-5 h-5" />
                              <span>
                                {isDeliveryOrder(selectedOrder)
                                  ? `Mark Home Delivery Paid (₹${currentBill.total.toFixed(2)})`
                                  : `Mark Table #${selectedOrder.table_number || '1'} Paid (₹${currentBill.total.toFixed(2)})`}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            ) : (
              <div className="bg-slate-900 rounded-3xl p-12 border border-slate-800 text-center space-y-4">
                <img src="/billing-app-icon.png" alt="Billing POS" className="w-20 h-20 mx-auto rounded-3xl object-cover shadow-2xl border border-amber-500/30 opacity-90" />
                <h3 className="text-base font-bold text-slate-300">No Order Selected</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Select an active order from the left list or search by order number above to view receipt details.
                </p>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Printable Receipt styling hidden on screen, displayed when printed */}
      <div className="hidden print:block fixed inset-0 bg-white text-black p-8 font-mono text-sm z-[9999]">
        {selectedOrder && (
          <div className="max-w-xs mx-auto space-y-4 text-center">
            <img src="/billing-app-icon.png" alt="Arunachala Bhavan" className="w-14 h-14 mx-auto rounded-full object-cover mb-2 border border-black/20" />
            <h2 className="text-xl font-bold uppercase">ARUNACHALA BHAVAN</h2>
            <p className="text-xs">Authentic South & North Indian Restaurant</p>
            <div className="border-b border-dashed border-black my-2" />
            <div className="text-left text-xs space-y-1">
              <p><strong>Order #:</strong> {selectedOrder.order_number || selectedOrder.id}</p>
              <p><strong>Type:</strong> {isDeliveryOrder(selectedOrder) ? 'HOME DELIVERY 🚚' : `DINE-IN (Table #${selectedOrder.table_number || '1'}) 🍽️`}</p>
              <p><strong>Customer:</strong> {selectedOrder.customer_name || 'Guest Customer'}</p>
              {isDeliveryOrder(selectedOrder) && selectedOrder.phone_number && (
                <p><strong>Phone:</strong> {selectedOrder.phone_number}</p>
              )}
              {isDeliveryOrder(selectedOrder) && selectedOrder.delivery_address && (
                <p><strong>Address:</strong> {selectedOrder.delivery_address} {selectedOrder.postal_code ? `(${selectedOrder.postal_code})` : ''}</p>
              )}
              <p><strong>Date:</strong> {new Date().toLocaleString()}</p>
            </div>
            <div className="border-b border-dashed border-black my-2" />
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black">
                  <th>Item</th>
                  <th className="text-center">Qty</th>
                  <th className="text-right">Amt</th>
                </tr>
              </thead>
              <tbody>
                {currentBill.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td className="text-center">{item.quantity}</td>
                    <td className="text-right">₹{item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-b border-dashed border-black my-2" />
            <div className="text-right text-xs space-y-1">
              <p>Subtotal: ₹{currentBill.subtotal.toFixed(2)}</p>
              <p>GST (5%): ₹{currentBill.tax.toFixed(2)}</p>
              <p className="font-bold text-sm">TOTAL: ₹{currentBill.total.toFixed(2)}</p>
            </div>
            <div className="border-b border-dashed border-black my-2" />
            <p className="text-xs font-bold">Thank You For Dining With Us!</p>
          </div>
        )}
      </div>

    </div>
  );
};
