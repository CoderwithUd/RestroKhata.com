"use client";

import { useCallback, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { sanitizePhone, isValidIndianPhone } from "@/lib/phone";
import { showError, showSuccess } from "@/lib/feedback";
import { useOrderSocket } from "@/lib/use-order-socket";
import {
  useCancelOrderItemMutation,
  useCreateOrderMutation,
  useGetOrdersQuery,
  useRemoveOrderItemMutation,
  useUpdateOrderMutation,
} from "@/store/api/ordersApi";
import { useGetInvoicesQuery } from "@/store/api/invoicesApi";
import {
  useGetMenuOptionGroupsQuery,
  useGetMenuAggregateQuery,
} from "@/store/api/menuApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthToken } from "@/store/slices/authSlice";
import type { MenuItemRecord } from "@/store/types/menu";

// ── Types ────────────────────────────────────────────────────────────────────

type CartEntry = {
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  unitPrice: number;
  quantity: number;
  note?: string;
  optionIds?: string[];
  options?: Array<{ id: string; name: string; price: number }>;
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

function fmtCurrency(n?: number): string {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

// normalizePhoneInput is replaced by the shared sanitizePhone helper from @/lib/phone

function availableMenuVariants(item: MenuItemRecord) {
  const available = (item.variants || []).filter((v) => v.isAvailable);
  return available.length ? available : item.variants || [];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${connected ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-400"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ── Main TakeawayView ────────────────────────────────────────────────────────

export function TakeawayView() {
  const token = useAppSelector(selectAuthToken);

  // Data hooks
  const { data: menuData, isLoading: menuLoading } = useGetMenuAggregateQuery({ isAvailable: true });
  const { data: ordersData, refetch: refetchOrders } = useGetOrdersQuery({
    status: ["PLACED", "IN_PROGRESS", "READY", "SERVED"],
    limit: 100,
  });
  const { data: invoicesData, refetch: refetchInvoices } = useGetInvoicesQuery({ limit: 100 });
  const [createOrder, { isLoading: isCreating }] = useCreateOrderMutation();

  // Cart + order state
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [packingNote, setPackingNote] = useState("");
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string | undefined>>({});
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [appendToOrderId, setAppendToOrderId] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);

  // Option Groups Data
  const { data: ogData } = useGetMenuOptionGroupsQuery();
  const optionGroups = useMemo(() => ogData?.items || [], [ogData]);

  // Options Modal State
  const [activeOptionsItem, setActiveOptionsItem] = useState<{
    item: MenuItemRecord;
    variantId?: string;
  } | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});

  // Socket
  useOrderSocket({
    token,
    enabled: true,
    role: "waiter",
    onConnectionChange: setSocketConnected,
    onEvent: () => {
      refetchOrders();
      refetchInvoices();
    },
  });

  // Derived: active takeaway orders for the "append" dropdown
  const invoices = useMemo(() => invoicesData?.items || [], [invoicesData]);
  const invoicedOrderIds = useMemo(
    () => new Set(invoices.map((inv) => inv.orderId).filter((id): id is string => Boolean(id))),
    [invoices],
  );
  const takeawayAppendOptions = useMemo(() => {
    return (ordersData?.items || []).filter((o) => {
      if (invoicedOrderIds.has(o.id)) return false;
      const s = (o.status || "").toUpperCase();
      if (!["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(s)) return false;
      const mode = (o.serviceMode || "").toUpperCase();
      const noTbl = !o.tableId && !o.table?.id;
      return mode === "TAKEAWAY" || noTbl;
    });
  }, [ordersData, invoicedOrderIds]);

  // Derived: menu
  const categories = useMemo(() => menuData?.categories || [], [menuData]);
  const allItems = useMemo(() => {
    const flat: (MenuItemRecord & { catName: string })[] = [];
    for (const cat of categories) {
      for (const item of cat.items) flat.push({ ...item, catName: cat.name });
      for (const sub of cat.children || []) {
        for (const item of sub.items) flat.push({ ...item, catName: sub.name });
      }
    }
    return flat;
  }, [categories]);

  const displayedItems = useMemo(() => {
    const bySearch = search.trim()
      ? allItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase().trim()))
      : allItems;
    if (!activeCat || search.trim()) return bySearch;
    return bySearch.filter((i) => {
      for (const cat of categories) {
        if (cat.id === activeCat)
          return cat.items.some((ci) => ci.id === i.id) || cat.children?.some((s) => s.items.some((si) => si.id === i.id));
        for (const sub of cat.children || []) {
          if (sub.id === activeCat) return sub.items.some((si) => si.id === i.id);
        }
      }
      return false;
    });
  }, [allItems, activeCat, search, categories]);

  const cartTotal = useMemo(() => cart.reduce((s, e) => {
    const optionsPrice = (e.options || []).reduce((sum, opt) => sum + opt.price, 0);
    return s + (e.unitPrice + optionsPrice) * e.quantity;
  }, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, e) => s + e.quantity, 0), [cart]);

  // Cart helpers
  function getTAQty(itemId: string, variantId?: string) {
    return cart.filter((e) => e.itemId === itemId && e.variantId === variantId).reduce((sum, e) => sum + e.quantity, 0) ?? 0;
  }

  function resolveVariant(item: MenuItemRecord) {
    const variants = availableMenuVariants(item);
    if (!variants.length) return undefined;
    return variants.find((v) => v.id === selectedVariants[item.id]) || variants[0];
  }

  function addItemTAWithOptions(itemOrId: MenuItemRecord | string, variantId?: string, opts?: Array<{ id: string; name: string; price: number }>) {
    const item = typeof itemOrId === 'string' ? allItems.find(i => i.id === itemOrId) : itemOrId;
    if (!item) return;

    const variant = availableMenuVariants(item).find(v => v.id === variantId) || availableMenuVariants(item)[0];
    const price = variant?.price ?? item.price ?? 0;
    const optionIds = opts?.map(o => o.id) || [];
    const optionsPart = [...optionIds].sort().join(",");

    setCart((prev) => {
      const idx = prev.findIndex((e) => {
        const eOptsPart = (e.optionIds || []).sort().join(",");
        return e.itemId === item.id && e.variantId === variantId && eOptsPart === optionsPart;
      });
      if (idx >= 0) return prev.map((e, i) => (i === idx ? { ...e, quantity: e.quantity + 1 } : e));
      return [...prev, { itemId: item.id, variantId, name: item.name, variantName: variant?.name, unitPrice: price, quantity: 1, optionIds, options: opts }];
    });
  }

  function addItemTA(item: MenuItemRecord, forcedVariantId?: string) {
    const variants = availableMenuVariants(item);
    const variant =
      variants.find((v) => v.id === forcedVariantId) ||
      variants.find((v) => v.id === selectedVariants[item.id]) ||
      variants[0];
    const variantId = variant?.id;

    if (item.optionGroupIds && item.optionGroupIds.length > 0) {
      setActiveOptionsItem({ item, variantId });
      setSelectedOptions({});
      return;
    }

    addItemTAWithOptions(item, variantId);
  }

  function removeItemTA(itemId: string, variantId?: string, optionIds?: string[]) {
    const optionsPart = (optionIds || []).sort().join(",");
    setCart((prev) => {
      const idx = prev.findIndex((e) => {
        const eOptsPart = (e.optionIds || []).sort().join(",");
        return e.itemId === itemId && e.variantId === variantId && eOptsPart === optionsPart;
      });
      if (idx < 0) return prev;
      if (prev[idx].quantity <= 1) return prev.filter((_, i) => i !== idx);
      return prev.map((e, i) => (i === idx ? { ...e, quantity: e.quantity - 1 } : e));
    });
  }

  function incrementCartTA(itemId: string, variantId?: string, options?: any) {
    addItemTAWithOptions(itemId, variantId, options);
  }

  // Place order
  const handleTAPlaceOrder = useCallback(async () => {
    if (cart.length === 0) return;

    const nameVal = customerName.trim();
    const phoneVal = customerPhone.trim(); // already sanitized on input

    if ((nameVal && !phoneVal) || (!nameVal && phoneVal)) {
      showError("Customer name aur phone dono saath de, ya dono blank rakhte hai.");
      return;
    }
    if (phoneVal && !isValidIndianPhone(phoneVal)) {
      showError("Valid Indian mobile number chahiye (10 digits, 6-9 se shuru).");
      return;
    }

    const payload = {
      serviceMode: "TAKEAWAY" as const,
      ...(packingNote ? { note: packingNote } : {}),
      ...(nameVal && phoneVal ? { customerName: nameVal, customerPhone: phoneVal } : {}),
      items: cart.map((e) => ({
        itemId: e.itemId,
        ...(e.variantId ? { variantId: e.variantId } : {}),
        quantity: e.quantity,
        optionIds: e.optionIds || [],
      })),
      ...(appendToOrderId ? { appendToOrderId } : { forceNew: true }),
    };

    try {
      const result = await createOrder(payload).unwrap();
      const tokenNum = result.order?.orderNumber || result.order?.id?.slice(-6);
      const msg = appendToOrderId ? `Items added to #${tokenNum}!` : `Order placed! Token: #${tokenNum}`;
      showSuccess(msg);
      setLastToken(String(tokenNum || ""));
      setCart([]);
      setPackingNote("");
      setCustomerName("");
      setCustomerPhone("");
      setAppendToOrderId(null);
      refetchOrders();
      refetchInvoices();
    } catch (error) {
      showError(getErrorMessage(error));
    }
  }, [appendToOrderId, cart, createOrder, customerName, customerPhone, packingNote, refetchInvoices, refetchOrders]);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* ── POS Header bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-purple-50 px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 shadow-md shadow-violet-200">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-violet-900">Takeaway POS</h2>
            <p className="text-xs text-violet-600">Counter · walk-in · no table needed</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {lastToken && (
            <div className="rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">Last Token</p>
              <p className="text-sm font-bold text-violet-900">#{lastToken}</p>
            </div>
          )}
          <LiveBadge connected={socketConnected} />
        </div>
      </div>

      {/* ── Customer + order setup ────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          {/* Customer name */}
          <div className="min-w-[130px] flex-1">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Customer Name
            </label>
            <input
              id="ta-customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Rahul (optional)"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100 transition"
            />
          </div>

          {/* Phone */}
          <div className="min-w-[130px] flex-1">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Phone
            </label>
            <input
              id="ta-customer-phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(sanitizePhone(e.target.value))}
              placeholder="9876543210 (optional)"
              maxLength={10}
              inputMode="tel"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100 transition"
            />
          </div>

          {/* Packing note */}
          <div className="min-w-[160px] flex-1">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Packing Note
            </label>
            <input
              id="ta-packing-note"
              value={packingNote}
              onChange={(e) => setPackingNote(e.target.value)}
              placeholder="Less spicy, extra sauce…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100 transition"
            />
          </div>

          {/* Append to existing order */}
          {takeawayAppendOptions.length > 0 && (
            <div className="min-w-[160px] flex-1">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Add to Existing Token
              </label>
              <select
                id="ta-append-order"
                value={appendToOrderId || ""}
                onChange={(e) => setAppendToOrderId(e.target.value || null)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100 transition"
              >
                <option value="">— New order —</option>
                {takeawayAppendOptions.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.orderNumber || order.id.slice(-6)}
                    {order.customerName ? ` · ${order.customerName}` : ""}
                    {` · ${order.status}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Append mode indicator */}
        {appendToOrderId && (
          <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-violet-600" fill="currentColor">
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
            <p className="text-xs font-semibold text-violet-800">
              Adding items to existing order #{takeawayAppendOptions.find((o) => o.id === appendToOrderId)?.orderNumber || appendToOrderId.slice(-6)}
            </p>
            <button type="button" onClick={() => setAppendToOrderId(null)} className="ml-auto text-xs font-bold text-violet-500 hover:text-violet-800">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Menu + cart ───────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* ── Left: Menu browser ────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Search */}
          <div className="relative">
            <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu items…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition"
            />
          </div>

          {/* Category pills */}
          {!search.trim() && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
              <button type="button" onClick={() => setActiveCat(null)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${!activeCat ? "border-violet-400 bg-violet-100 text-violet-800 shadow-sm" : "border-slate-200 bg-white text-slate-600"}`}>
                All
              </button>
              {categories.map((cat) => (
                <button key={cat.id} type="button" onClick={() => setActiveCat(cat.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${activeCat === cat.id ? "border-violet-400 bg-violet-100 text-violet-800 shadow-sm" : "border-slate-200 bg-white text-slate-600"}`}>
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Items grid */}
          {menuLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-400">
              <Spinner /> Loading menu…
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">No items found</div>
          ) : (
            <div className="no-scrollbar -mx-1 flex-1 overflow-y-auto pb-2">
              <div className="grid grid-cols-2 gap-2.5 px-1 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {displayedItems.map((item) => {
                  const variants = availableMenuVariants(item);
                  const selectedVariant = resolveVariant(item);
                  const variantId = selectedVariant?.id;
                  const price = selectedVariant?.price ?? item.price ?? 0;
                  const qty = getTAQty(item.id, variantId);

                  return (
                    <div key={item.id}
                      className={`group relative flex flex-col rounded-2xl border p-3 shadow-sm transition-all ${qty > 0 ? "border-violet-300 bg-violet-50 shadow-violet-100 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-violet-200 hover:shadow-md"}`}>
                      {/* In-cart badge */}
                      {qty > 0 && (
                        <span className="absolute right-2 top-2 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {qty}
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">{item.name}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{item.catName}</p>
                      </div>

                      {/* Variant selector */}
                      {variants.length > 1 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {variants.map((v) => (
                            <button key={v.id} type="button"
                              onClick={() => setSelectedVariants((prev) => ({ ...prev, [item.id]: v.id }))}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${v.id === variantId ? "border-violet-400 bg-violet-100 text-violet-900" : "border-slate-200 bg-white text-slate-600"}`}>
                              {v.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Price + add button */}
                      <div className="mt-2.5 flex items-center justify-between gap-1 pt-2 border-t border-slate-100">
                        <p className="text-sm font-bold text-violet-700">{fmtCurrency(price)}</p>
                        {qty === 0 ? (
                          <button type="button" onClick={() => addItemTA(item, variantId)}
                            className="rounded-xl bg-violet-600 px-3 py-1.5 text-[12px] font-bold text-white transition active:scale-95 hover:bg-violet-700">
                            Add
                          </button>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1 rounded-xl border border-violet-200 bg-white px-1 py-0.5">
                              <span className="px-1.5 text-[11px] font-bold text-violet-700">{qty} In Cart</span>
                              <button type="button" onClick={() => addItemTA(item, variantId)}
                                className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 font-bold text-white text-sm">+</button>
                            </div>
                            <p className="text-[9px] text-slate-400 italic">Options inside cart</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Cart sidebar (desktop) ─────────────────── */}
        <div className="hidden w-[260px] shrink-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm md:flex">
          {/* Cart header */}
          <div className={`border-b border-slate-100 px-4 py-3 ${appendToOrderId ? "bg-violet-50" : ""}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Cart</p>
              {cartCount > 0 && (
                <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">{cartCount} items</span>
              )}
            </div>
            {customerName && <p className="mt-0.5 text-xs font-medium text-violet-700">{customerName}</p>}
          </div>

          {/* Cart items */}
          <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-3">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-slate-200" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
<path d="M16 10a4 4 0 01-8 0" />
                </svg>
                <p className="text-xs text-slate-400">Add items from the menu</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {cart.map((entry) => {
                  const optionsPrice = (entry.options || []).reduce((sum, opt) => sum + opt.price, 0);
                  const totalLinePrice = (entry.unitPrice + optionsPrice) * entry.quantity;
                  return (
                    <div key={`${entry.itemId}-${entry.variantId}-${(entry.optionIds || []).sort().join(",")}`} 
                      className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 p-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-[12px] font-bold text-slate-800">{entry.name}</p>
                          {entry.variantName && <p className="text-[10px] font-medium text-slate-400">{entry.variantName}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                          <button onClick={() => removeItemTA(entry.itemId, entry.variantId, entry.optionIds)} 
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition active:scale-90 font-bold">−</button>
                          <span className="min-w-[18px] text-center text-xs font-black text-violet-700">{entry.quantity}</span>
                          <button onClick={() => addItemTAWithOptions(entry.itemId, entry.variantId, entry.options)} 
                            className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition active:scale-90 shadow-sm shadow-violet-200">+</button>
                        </div>
                      </div>

                      {entry.options && entry.options.length > 0 && (
                        <div className="flex flex-wrap gap-1 border-t border-slate-200/50 pt-2 mt-1">
                          {entry.options.map(opt => (
                            <span key={opt.id} className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 border border-slate-100">
                              {opt.name} {opt.price > 0 ? `(+₹${opt.price})` : ""}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-between items-center mt-1 border-t border-slate-200/50 pt-1.5">
                        <p className="text-[10px] text-slate-400">{fmtCurrency(entry.unitPrice + optionsPrice)} each</p>
                        <p className="text-[11px] font-bold text-violet-700">{fmtCurrency(totalLinePrice)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart footer */}
          <div className="border-t border-slate-100 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-600">Total</span>
              <span className="text-lg font-bold text-violet-700">{fmtCurrency(cartTotal)}</span>
            </div>
            {cart.length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-500">
                {cart.map((e) => (
                  <div key={`${e.itemId}-${e.variantId}`} className="flex justify-between">
                    <span className="truncate">{e.quantity}× {e.name}</span>
                    <span>{fmtCurrency(e.unitPrice * e.quantity)}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              id="ta-place-order-btn"
              type="button"
              disabled={cart.length === 0 || isCreating}
              onClick={handleTAPlaceOrder}
              className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white shadow-md shadow-violet-200 transition active:scale-95 hover:bg-violet-700 disabled:opacity-40"
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2"><Spinner /> Placing...</span>
              ) : appendToOrderId ? (
                "Add Items to Order"
              ) : (
                "Place Takeaway Order"
              )}
            </button>
            {cart.length > 0 && (
              <button type="button" onClick={() => setCart([])}
                className="w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition">
                Clear Cart
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile cart drawer */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col md:hidden" onClick={() => setCartDrawerOpen(false)}>
          <div className="flex-1 bg-black/40" />
          <div className="rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">Takeaway Cart</p>
                <p className="text-xs text-slate-500">Items ready to place</p>
              </div>
              <button onClick={() => setCartDrawerOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500">
                 <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                 </svg>
              </button>
            </div>
            {cart.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400 font-medium">Cart is empty</p>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto no-scrollbar pb-2">
                {cart.map((entry) => {
                  const optionsPrice = (entry.options || []).reduce((sum, opt) => sum + opt.price, 0);
                  return (
                    <div key={`mob-ta-${entry.itemId}-${entry.variantId}-${(entry.optionIds || []).sort().join(",")}`} 
                      className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold text-slate-900 leading-tight">{entry.name}</p>
                          {entry.variantName && <p className="text-xs font-medium text-slate-500">{entry.variantName}</p>}
                        </div>
                        <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-white p-1.5 shadow-sm">
                          <button onClick={() => removeItemTA(entry.itemId, entry.variantId, entry.optionIds)} 
                            className="h-8 w-8 rounded-xl border-2 border-slate-100 text-sm font-bold text-slate-600 active:scale-90 transition">−</button>
                          <span className="w-6 text-center text-base font-black text-violet-700">{entry.quantity}</span>
                          <button onClick={() => addItemTAWithOptions(entry.itemId, entry.variantId, entry.options)} 
                            className="h-8 w-8 rounded-xl bg-violet-600 text-sm font-bold text-white shadow-md shadow-violet-200 active:scale-90 transition">+</button>
                        </div>
                      </div>
                      
                      {entry.options && entry.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 border-t border-slate-200/50 pt-2">
                          {entry.options.map(opt => (
                            <span key={opt.id} className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 border border-slate-100">
                              {opt.name} {opt.price > 0 ? `(+₹${opt.price})` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between border-t border-slate-200/50 pt-2">
                         <p className="text-xs font-medium text-slate-400">{fmtCurrency(entry.unitPrice + optionsPrice)} each</p>
                         <p className="text-base font-black text-violet-700">{fmtCurrency((entry.unitPrice + optionsPrice) * entry.quantity)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
              <div className="flex justify-between font-bold text-base items-center">
                <span className="text-slate-600">Total Amount</span>
                <span className="text-2xl font-black text-violet-700">{fmtCurrency(cartTotal)}</span>
              </div>
              <button
                type="button"
                disabled={cart.length === 0 || isCreating}
                onClick={() => { setCartDrawerOpen(false); handleTAPlaceOrder(); }}
                className="w-full rounded-2xl bg-violet-600 py-4 text-base font-bold text-white shadow-xl shadow-violet-200 transition active:scale-95 disabled:opacity-40"
              >
                {isCreating ? (
                   <span className="flex items-center justify-center gap-2"><Spinner /> Processing...</span>
                ) : appendToOrderId ? "✅ Add Items to Order" : "🚀 Place Takeaway Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item Options Selection Modal ─────────────────────────────────── */}
      {activeOptionsItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setActiveOptionsItem(null)} />
          <div className="relative flex w-full max-w-lg flex-col rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-violet-50 px-6 py-5 border-b border-violet-100">
               <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-tight">
                      {activeOptionsItem.item.name}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-violet-700">
                      Customize your item
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeOptionsItem.item.optionGroupIds?.every(gid => (optionGroups.find(g => g.id === gid)?.minSelect || 0) === 0) && (
                      <button 
                        onClick={() => {
                          addItemTAWithOptions(activeOptionsItem.item, activeOptionsItem.variantId, []);
                          setActiveOptionsItem(null);
                        }}
                        className="text-[11px] font-bold text-slate-400 hover:text-violet-700 px-3 py-1.5 rounded-xl border border-slate-100 bg-slate-50 transition-colors"
                      >
                        Skip All
                      </button>
                    )}
                    <button onClick={() => setActiveOptionsItem(null)} className="rounded-xl bg-white/80 p-2 text-slate-400 hover:text-slate-600 shadow-sm border border-violet-100">
                       <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M18 6L6 18M6 6l12 12" />
                       </svg>
                    </button>
                  </div>
               </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8">
               {activeOptionsItem.item.optionGroupIds?.map(groupId => {
                  const group = optionGroups.find(g => g.id === groupId);
                  if (!group) return null;
                  
                  const selectedCount = (selectedOptions[groupId] || []).length;
                  const min = group.minSelect || 0;
                  const max = group.maxSelect || 0;
                  
                  return (
                    <div key={groupId} className="space-y-3">
                       <div className="flex items-end justify-between">
                          <div>
                             <p className="text-sm font-black text-slate-800 uppercase tracking-wide">{group.name}</p>
                             <p className="text-[11px] font-bold text-slate-400">
                                {min > 0 ? `Required: Select ${min}` : "Optional"}
                                {max > 0 ? ` (Max ${max})` : ""}
                             </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selectedCount < min ? 'bg-rose-100 text-rose-600 border border-rose-200' : 'bg-emerald-100 text-emerald-600 border border-emerald-200'}`}>
                             {selectedCount} Selected
                          </span>
                       </div>

                       <div className="grid gap-2">
                          {group.options.map((opt: { id: string; name: string; price?: number }) => {
                             const isSelected = (selectedOptions[groupId] || []).includes(opt.id);
                             return (
                                <button
                                   key={opt.id}
                                   type="button"
                                   onClick={() => {
                                      const current = selectedOptions[groupId] || [];
                                      if (isSelected) {
                                         setSelectedOptions(prev => ({ ...prev, [groupId]: current.filter(id => id !== opt.id) }));
                                      } else {
                                         if (max === 1) {
                                            setSelectedOptions(prev => ({ ...prev, [groupId]: [opt.id] }));
                                         } else if (max === 0 || current.length < max) {
                                            setSelectedOptions(prev => ({ ...prev, [groupId]: [...current, opt.id] }));
                                         }
                                      }
                                   }}
                                   className={`flex items-center justify-between rounded-2xl border-2 px-4 py-3 transition-all ${isSelected ? 'border-violet-500 bg-violet-50 shadow-md shadow-violet-100 ring-1 ring-violet-200' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}
                                >
                                   <div className="flex items-center gap-3">
                                      <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${isSelected ? 'border-violet-500 bg-violet-500' : 'border-slate-300 bg-white'}`}>
                                         {isSelected && (
                                            <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="4">
                                               <path d="M20 6L9 17l-5-5" />
                                            </svg>
                                         )}
                                      </div>
                                      <span className={`text-sm font-bold ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>{opt.name}</span>
                                   </div>
                                   {opt.price != null && opt.price > 0 && (
                                      <span className={`text-xs font-black ${isSelected ? 'text-violet-700' : 'text-slate-400'}`}>+₹{opt.price}</span>
                                   )}
                                </button>
                             );
                          })}
                       </div>
                    </div>
                  );
               })}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 bg-slate-50 p-6">
               <button
                  type="button"
                  onClick={() => {
                     // Validate selections
                     for (const groupId of activeOptionsItem.item.optionGroupIds || []) {
                        const group = optionGroups.find(g => g.id === groupId);
                        if (!group) continue;
                        const count = (selectedOptions[groupId] || []).length;
                        if (count < (group.minSelect || 0)) {
                           showError(`Please select at least ${group.minSelect} in ${group.name}`);
                           return;
                        }
                     }
                     
                     // Collect options objects
                     const finalOpts: Array<{ id: string; name: string; price: number }> = [];
                     Object.values(selectedOptions).flat().forEach(optId => {
                        for (const g of optionGroups) {
                           const o = g.options.find(x => x.id === optId);
                           if (o) {
                              finalOpts.push({ id: o.id, name: o.name, price: o.price || 0 });
                              break;
                           }
                        }
                     });
                     
                     addItemTAWithOptions(activeOptionsItem.item, activeOptionsItem.variantId, finalOpts);
                     setActiveOptionsItem(null);
                  }}
                  className="w-full rounded-2xl bg-slate-900 py-4 text-base font-bold text-white shadow-xl hover:bg-slate-800 active:scale-95 transition"
               >
                  Add Selection
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
