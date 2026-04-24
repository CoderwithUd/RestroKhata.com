"use client";

import { useCallback, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
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
import { useGetMenuAggregateQuery } from "@/store/api/menuApi";
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
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

function fmtCurrency(n?: number): string {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

function normalizePhoneInput(v: string): string {
  return v.replace(/[^\d+]/g, "");
}

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

  const cartTotal = useMemo(() => cart.reduce((s, e) => s + e.unitPrice * e.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, e) => s + e.quantity, 0), [cart]);

  // Cart helpers
  function getTAQty(itemId: string, variantId?: string) {
    return cart.find((e) => e.itemId === itemId && e.variantId === variantId)?.quantity ?? 0;
  }

  function resolveVariant(item: MenuItemRecord) {
    const variants = availableMenuVariants(item);
    if (!variants.length) return undefined;
    return variants.find((v) => v.id === selectedVariants[item.id]) || variants[0];
  }

  function addItemTA(item: MenuItemRecord, forcedVariantId?: string) {
    const variants = availableMenuVariants(item);
    const variant =
      variants.find((v) => v.id === forcedVariantId) ||
      variants.find((v) => v.id === selectedVariants[item.id]) ||
      variants[0];
    const variantId = variant?.id;
    const price = variant?.price ?? item.price ?? 0;
    setCart((prev) => {
      const idx = prev.findIndex((e) => e.itemId === item.id && e.variantId === variantId);
      if (idx >= 0) return prev.map((e, i) => (i === idx ? { ...e, quantity: e.quantity + 1 } : e));
      return [...prev, { itemId: item.id, variantId, name: item.name, variantName: variant?.name, unitPrice: price, quantity: 1 }];
    });
  }

  function removeItemTA(itemId: string, variantId?: string) {
    setCart((prev) => {
      const idx = prev.findIndex((e) => e.itemId === itemId && e.variantId === variantId);
      if (idx < 0) return prev;
      if (prev[idx].quantity <= 1) return prev.filter((_, i) => i !== idx);
      return prev.map((e, i) => (i === idx ? { ...e, quantity: e.quantity - 1 } : e));
    });
  }

  function incrementCartTA(itemId: string, variantId?: string) {
    setCart((prev) => prev.map((e) => (e.itemId === itemId && e.variantId === variantId ? { ...e, quantity: e.quantity + 1 } : e)));
  }

  // Place order
  const handleTAPlaceOrder = useCallback(async () => {
    if (cart.length === 0) return;

    const nameVal = customerName.trim();
    const phoneVal = normalizePhoneInput(customerPhone.trim());

    if ((nameVal && !phoneVal) || (!nameVal && phoneVal)) {
      showError("Customer name aur phone dono saath de, ya dono blank rakhte hai.");
      return;
    }
    if (phoneVal) {
      const digits = phoneVal.replace(/\D/g, "").length;
      if (digits < 7 || digits > 15) {
        showError("Phone number me 7 se 15 digits hone chahiye.");
        return;
      }
    }

    const payload = {
      serviceMode: "TAKEAWAY" as const,
      ...(packingNote ? { note: packingNote } : {}),
      ...(nameVal && phoneVal ? { customerName: nameVal, customerPhone: phoneVal } : {}),
      items: cart.map((e) => ({
        itemId: e.itemId,
        ...(e.variantId ? { variantId: e.variantId } : {}),
        quantity: e.quantity,
        optionIds: [],
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
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="9876543210 (optional)"
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
                          <div className="flex items-center gap-1 rounded-xl border border-violet-200 bg-white px-1 py-0.5">
                            <button type="button" onClick={() => removeItemTA(item.id, variantId)}
                              className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 font-bold text-slate-600 text-sm">−</button>
                            <span className="min-w-[14px] text-center text-sm font-bold text-violet-700">{qty}</span>
                            <button type="button" onClick={() => addItemTA(item, variantId)}
                              className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 font-bold text-white text-sm">+</button>
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
              <div className="space-y-2">
                {cart.map((entry) => (
                  <div key={`${entry.itemId}-${entry.variantId}`} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[12px] font-semibold text-slate-800">{entry.name}</p>
                      {entry.variantName && <p className="text-[10px] text-slate-400">{entry.variantName}</p>}
                      <p className="text-[11px] text-slate-500">{fmtCurrency(entry.unitPrice)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-0.5 py-0.5">
                      <button onClick={() => removeItemTA(entry.itemId, entry.variantId)} className="flex h-5 w-5 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">−</button>
                      <span className="min-w-[16px] text-center text-xs font-bold text-slate-800">{entry.quantity}</span>
                      <button onClick={() => incrementCartTA(entry.itemId, entry.variantId)} className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-600 text-white hover:bg-violet-700">+</button>
                    </div>
                  </div>
                ))}
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

      {/* ── Mobile cart FAB ───────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setCartDrawerOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-xl shadow-violet-300 md:hidden"
      >
        🛒
        {cartCount > 0 && <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-violet-700">{cartCount}</span>}
        <span>{fmtCurrency(cartTotal)}</span>
      </button>

      {/* Mobile cart drawer */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col md:hidden" onClick={() => setCartDrawerOpen(false)}>
          <div className="flex-1 bg-black/40" />
          <div className="rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold">Takeaway Cart</p>
              <button onClick={() => setCartDrawerOpen(false)} className="text-xl text-slate-400">✕</button>
            </div>
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Cart is empty</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {cart.map((entry) => (
                  <div key={`${entry.itemId}-${entry.variantId}`} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{entry.name}</p>
                      <p className="text-xs text-slate-500">{fmtCurrency(entry.unitPrice)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => removeItemTA(entry.itemId, entry.variantId)} className="h-7 w-7 rounded-lg border text-sm font-bold">−</button>
                      <span className="w-5 text-center text-sm font-bold">{entry.quantity}</span>
                      <button onClick={() => incrementCartTA(entry.itemId, entry.variantId)} className="h-7 w-7 rounded-lg bg-violet-600 text-sm font-bold text-white">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-between font-bold text-base">
              <span>Total</span>
              <span className="text-violet-700">{fmtCurrency(cartTotal)}</span>
            </div>
            <button
              type="button"
              disabled={cart.length === 0 || isCreating}
              onClick={() => { setCartDrawerOpen(false); handleTAPlaceOrder(); }}
              className="mt-3 w-full rounded-2xl bg-violet-600 py-3.5 text-base font-bold text-white shadow-lg disabled:opacity-40"
            >
              {appendToOrderId ? "Add Items to Order" : "Place Takeaway Order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
