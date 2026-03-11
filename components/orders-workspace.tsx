"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { useOrderSocket } from "@/lib/use-order-socket";
import {
  useCreateOrderMutation,
  useDeleteOrderMutation,
  useGetOrdersQuery,
  useUpdateOrderMutation,
} from "@/store/api/ordersApi";
import { useGetTablesQuery } from "@/store/api/tablesApi";
import { useGetMenuAggregateQuery } from "@/store/api/menuApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthToken } from "@/store/slices/authSlice";
import type { OrderRecord, OrderStatus } from "@/store/types/orders";
import type { TableRecord } from "@/store/types/tables";
import type { MenuItemRecord } from "@/store/types/menu";

// ─── Role ────────────────────────────────────────────────────────────────────
type RoleKey = "owner" | "manager" | "waiter" | "kitchen";

function normalizeRole(raw?: string): RoleKey {
  const r = (raw || "").toLowerCase().trim();
  if (r.includes("owner") || r.includes("admin")) return "owner";
  if (r.includes("waiter") || r.includes("server") || r.includes("captain")) return "waiter";
  if (r.includes("kitchen") || r.includes("chef") || r.includes("cook")) return "kitchen";
  return "manager";
}

// ─── Cart entry ───────────────────────────────────────────────────────────────
type CartEntry = {
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  unitPrice: number;
  quantity: number;
  note?: string;
};

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  PLACED: "Placed",
  IN_PROGRESS: "Cooking",
  READY: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

function statusBadgeClass(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "PLACED") return "bg-amber-100 text-amber-800 border-amber-300";
  if (s === "IN_PROGRESS") return "bg-red-100 text-red-800 border-red-300";
  if (s === "READY") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (s === "SERVED") return "bg-blue-100 text-blue-800 border-blue-300";
  if (s === "CANCELLED") return "bg-slate-100 text-slate-500 border-slate-300";
  return "bg-slate-100 text-slate-600 border-slate-300";
}

function tableStatusClass(status?: string): string {
  const s = (status || "AVAILABLE").toUpperCase();
  if (s === "OCCUPIED") return "border-amber-300 bg-amber-50 text-amber-800";
  if (s === "RESERVED") return "border-blue-300 bg-blue-50 text-blue-800";
  if (s === "AVAILABLE") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function fmtCurrency(n?: number): string {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff === 1) return "1 min ago";
  if (diff < 60) return `${diff} min ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

// ─── Tiny reusable components ─────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err" | "info"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed bottom-20 left-1/2 z-50 -translate-x-1/2 max-w-xs w-full rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur sm:bottom-6 ${
        type === "ok"
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : type === "info"
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-rose-300 bg-rose-50 text-rose-800"
      }`}
    >
      {msg}
    </div>
  );
}

// ─── Live socket badge ────────────────────────────────────────────────────────
function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
      connected
        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-100 text-slate-400"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        connected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
      }`} />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

// ─── Waiter Step 1 — Table Grid ───────────────────────────────────────────────
function TableGrid({
  tables,
  orders,
  onSelectTable,
}: {
  tables: TableRecord[];
  orders: OrderRecord[];
  onSelectTable: (table: TableRecord, existingOrder?: OrderRecord) => void;
}) {
  const activeOrderByTable = useMemo(() => {
    const map: Record<string, OrderRecord> = {};
    for (const o of orders) {
      const tid = o.table?.id || o.tableId;
      if (tid && (o.status === "PLACED" || o.status === "IN_PROGRESS")) {
        map[tid] = o;
      }
    }
    return map;
  }, [orders]);

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500">Tap a table to take or add an order</p>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {tables.map((table) => {
          const existing = activeOrderByTable[table.id];
          const hasOrder = Boolean(existing);
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => onSelectTable(table, existing)}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl border-2 text-center text-xs font-semibold transition active:scale-95 hover:scale-[1.03] ${tableStatusClass(table.status)}`}
            >
              <span className="text-base font-bold">T{table.number}</span>
              <span className="text-[10px] opacity-70">{table.capacity}p</span>
              {hasOrder ? (
                <span className="mt-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  Active
                </span>
              ) : (
                <span className="mt-0.5 text-[9px] opacity-60">
                  {(table.status || "available").toLowerCase()}
                </span>
              )}
            </button>
          );
        })}
        {tables.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No tables found. Ask the manager to create tables first.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Waiter Step 2 — Menu Browser + Cart ─────────────────────────────────────
function MenuBrowser({
  table,
  existingOrder,
  onBack,
  onConfirm,
}: {
  table: TableRecord;
  existingOrder?: OrderRecord;
  onBack: () => void;
  onConfirm: (cart: CartEntry[], tableNote: string) => void;
}) {
  const { data: menuData, isLoading: menuLoading } = useGetMenuAggregateQuery({ isAvailable: true });
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [search, setSearch] = useState("");
  const [tableNote, setTableNote] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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
        if (cat.id === activeCat) return cat.items.some((ci) => ci.id === i.id) || cat.children?.some((s) => s.items.some((si) => si.id === i.id));
        for (const sub of cat.children || []) {
          if (sub.id === activeCat) return sub.items.some((si) => si.id === i.id);
        }
      }
      return false;
    });
  }, [allItems, activeCat, search, categories]);

  const cartTotal = useMemo(() => cart.reduce((s, e) => s + e.unitPrice * e.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, e) => s + e.quantity, 0), [cart]);

  function getQty(itemId: string, variantId?: string): number {
    return cart.find((e) => e.itemId === itemId && e.variantId === variantId)?.quantity ?? 0;
  }

  function addItem(item: MenuItemRecord) {
    const variant = item.variants?.[0];
    const variantId = variant?.id;
    const price = variant?.price ?? item.price ?? 0;
    setCart((prev) => {
      const idx = prev.findIndex((e) => e.itemId === item.id && e.variantId === variantId);
      if (idx >= 0) {
        return prev.map((e, i) => (i === idx ? { ...e, quantity: e.quantity + 1 } : e));
      }
      return [
        ...prev,
        {
          itemId: item.id,
          variantId,
          name: item.name,
          variantName: variant?.name,
          unitPrice: price,
          quantity: 1,
        },
      ];
    });
  }

  function removeItem(itemId: string, variantId?: string) {
    setCart((prev) => {
      const idx = prev.findIndex((e) => e.itemId === itemId && e.variantId === variantId);
      if (idx < 0) return prev;
      const entry = prev[idx];
      if (entry.quantity <= 1) return prev.filter((_, i) => i !== idx);
      return prev.map((e, i) => (i === idx ? { ...e, quantity: e.quantity - 1 } : e));
    });
  }

  const activeCatLabel =
    activeCat
      ? categories.find((c) => c.id === activeCat)?.name ||
        categories.flatMap((c) => c.children || []).find((s) => s.id === activeCat)?.name ||
        "All"
      : "All";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-1 pb-3">
        <button type="button" onClick={onBack} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold">Table {table.number} — {table.name}</p>
          {existingOrder && (
            <p className="text-xs text-amber-600">Active order exists — adding more items</p>
          )}
        </div>
        {/* Mobile cart btn */}
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="relative flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 md:hidden"
        >
          🛒 {cartCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">{cartCount}</span>}
          {fmtCurrency(cartTotal)}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 pt-3">
        {/* Left: categories + items */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Search */}
          <div className="relative mb-2">
            <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 ring-amber-200"
            />
          </div>

          {/* Category pills */}
          {!search.trim() && (
            <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveCat(null)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${!activeCat ? "border-amber-400 bg-amber-100 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCat(cat.id)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${activeCat === cat.id ? "border-amber-400 bg-amber-100 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Items grid */}
          {menuLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
              <Spinner /> Loading menu...
            </div>
          ) : (
            <div className="no-scrollbar -mx-1 flex-1 overflow-y-auto pb-2">
              {displayedItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">No items found</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 px-1 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                  {displayedItems.map((item) => {
                    const variant = item.variants?.[0];
                    const variantId = variant?.id;
                    const price = variant?.price ?? item.price ?? 0;
                    const qty = getQty(item.id, variantId);
                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-2.5 transition ${qty > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
                      >
                        <p className="mb-0.5 text-xs font-semibold leading-snug text-slate-900 line-clamp-2">{item.name}</p>
                        <p className="text-xs text-slate-500">{fmtCurrency(price)}</p>
                        {variant?.name && (
                          <p className="text-[10px] text-slate-400">{variant.name}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          {qty === 0 ? (
                            <button
                              type="button"
                              onClick={() => addItem(item)}
                              className="w-full rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-white active:scale-95"
                            >
                              + Add
                            </button>
                          ) : (
                            <div className="flex w-full items-center justify-between gap-1">
                              <button
                                type="button"
                                onClick={() => removeItem(item.id, variantId)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 font-bold"
                              >
                                −
                              </button>
                              <span className="text-sm font-bold text-amber-700">{qty}</span>
                              <button
                                type="button"
                                onClick={() => addItem(item)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white font-bold"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: cart (desktop) */}
        <div className="hidden w-64 shrink-0 flex-col rounded-2xl border border-slate-200 bg-white md:flex">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-bold">Order Cart</p>
            <p className="text-xs text-slate-500">Table {table.number}</p>
          </div>
          <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-2">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Tap items to add</p>
            ) : (
              <div className="space-y-2">
                {cart.map((entry) => (
                  <div key={`${entry.itemId}-${entry.variantId}`} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 line-clamp-1">{entry.name}</p>
                      {entry.variantName && <p className="text-[10px] text-slate-400">{entry.variantName}</p>}
                      <p className="text-xs text-slate-500">{fmtCurrency(entry.unitPrice)} × {entry.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => removeItem(entry.itemId, entry.variantId)} className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-xs text-slate-600">−</button>
                      <span className="text-xs font-bold w-4 text-center">{entry.quantity}</span>
                      <button onClick={() => setCart(prev => prev.map(e => e.itemId === entry.itemId && e.variantId === entry.variantId ? { ...e, quantity: e.quantity + 1 } : e))} className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500 text-xs text-white">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 px-3 py-2.5 space-y-2">
            <input
              value={tableNote}
              onChange={(e) => setTableNote(e.target.value)}
              placeholder="Table note (optional)"
              className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs outline-none focus:ring-2 ring-amber-200"
            />
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Total</span>
              <span className="text-amber-700">{fmtCurrency(cartTotal)}</span>
            </div>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => onConfirm(cart, tableNote)}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white shadow-md shadow-amber-200 disabled:opacity-40 active:scale-95 transition"
            >
              {existingOrder ? "Add to Order" : "Place Order"}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col md:hidden" onClick={() => setCartOpen(false)}>
          <div className="flex-1 bg-black/40" />
          <div
            className="rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-bold">Cart — Table {table.number}</p>
              <button onClick={() => setCartOpen(false)} className="text-slate-400">✕</button>
            </div>
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Nothing in cart yet</p>
            ) : (
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {cart.map((entry) => (
                  <div key={`${entry.itemId}-${entry.variantId}`} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      <p className="text-xs text-slate-500">{fmtCurrency(entry.unitPrice)} × {entry.quantity} = {fmtCurrency(entry.unitPrice * entry.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeItem(entry.itemId, entry.variantId)} className="h-7 w-7 rounded-lg border border-slate-200 text-sm font-bold">−</button>
                      <span className="w-4 text-center text-sm font-bold">{entry.quantity}</span>
                      <button onClick={() => setCart(prev => prev.map(e => e.itemId === entry.itemId && e.variantId === entry.variantId ? { ...e, quantity: e.quantity + 1 } : e))} className="h-7 w-7 rounded-lg bg-amber-500 text-sm font-bold text-white">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <input
              value={tableNote}
              onChange={(e) => setTableNote(e.target.value)}
              placeholder="Table note (optional)"
              className="mt-4 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:ring-2 ring-amber-200"
            />
            <div className="mt-3 flex items-center justify-between font-bold">
              <span>Total</span>
              <span className="text-amber-700">{fmtCurrency(cartTotal)}</span>
            </div>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => { setCartOpen(false); onConfirm(cart, tableNote); }}
              className="mt-3 w-full rounded-2xl bg-amber-500 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-200 disabled:opacity-40"
            >
              {existingOrder ? "Add to Order" : "Place Order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Waiter View ──────────────────────────────────────────────────────────────
type WaiterStep = "tables" | "menu" | "placing";

function WaiterView({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const token = useAppSelector(selectAuthToken);
  const { data: tablesData } = useGetTablesQuery({ isActive: true });
  const { data: ordersData, refetch: refetchOrders } = useGetOrdersQuery({ status: ["PLACED", "IN_PROGRESS"], limit: 100 });
  const [createOrder, { isLoading: isCreating }] = useCreateOrderMutation();
  const [updateOrder, { isLoading: isUpdating }] = useUpdateOrderMutation();
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "info" } | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [step, setStep] = useState<WaiterStep>("tables");
  const [selectedTable, setSelectedTable] = useState<TableRecord | null>(null);
  const [existingOrder, setExistingOrder] = useState<OrderRecord | undefined>(undefined);

  // ── Socket: real-time updates ──────────────────────────────────────────────
  useOrderSocket({
    token,
    enabled: true,
    onEvent: (event) => {
      if (event.type === "created") {
        const table = event.order?.table;
        const label = table?.name || (table?.number ? `Table ${table.number}` : "a table");
        setToast({ msg: `🆕 New order — ${label}`, type: "info" });
        refetchOrders();
        setSocketConnected(true);
      } else if (event.type === "updated") {
        const status = (event.order?.status || "").toUpperCase();
        if (status === "READY") {
          const table = event.order?.table;
          const label = table?.name || (table?.number ? `Table ${table.number}` : "");
          setToast({ msg: `✅ Order Ready! ${label}`, type: "ok" });
        }
        refetchOrders();
      } else if (event.type === "deleted") {
        refetchOrders();
      }
    },
  });

  const tables = useMemo(() => (tablesData?.items || []).slice().sort((a, b) => a.number - b.number), [tablesData]);
  const orders = useMemo(() => ordersData?.items || [], [ordersData]);

  function handleSelectTable(table: TableRecord, existing?: OrderRecord) {
    setSelectedTable(table);
    setExistingOrder(existing);
    setStep("menu");
  }

  const handleConfirm = useCallback(
    async (cart: CartEntry[], tableNote: string) => {
      if (!selectedTable) return;
      setStep("placing");
      try {
        const items = cart.map((e) => ({
          itemId: e.itemId,
          ...(e.variantId ? { variantId: e.variantId } : {}),
          quantity: e.quantity,
          ...(e.note ? { note: e.note } : {}),
          optionIds: [],
        }));

        if (existingOrder) {
          // Merge with existing items
          const existingItems = (existingOrder.items || []).map((ei) => ({
            itemId: ei.itemId,
            ...(ei.variantId ? { variantId: ei.variantId } : {}),
            quantity: ei.quantity,
            optionIds: [],
          }));
          const merged = [...existingItems];
          for (const ni of items) {
            const idx = merged.findIndex((m) => m.itemId === ni.itemId && m.variantId === ni.variantId);
            if (idx >= 0) merged[idx] = { ...merged[idx], quantity: merged[idx].quantity + ni.quantity };
            else merged.push(ni);
          }
          await updateOrder({ orderId: existingOrder.id, payload: { items: merged, ...(tableNote ? { note: tableNote } : {}) } }).unwrap();
          setToast({ msg: "Items added to existing order!", type: "ok" });
        } else {
          await createOrder({
            tableId: selectedTable.id,
            ...(tableNote ? { note: tableNote } : {}),
            items,
          }).unwrap();
          setToast({ msg: "Order placed successfully!", type: "ok" });
        }
        refetchOrders();
        onOrderPlaced();
        setStep("tables");
        setSelectedTable(null);
        setExistingOrder(undefined);
      } catch (e) {
        setToast({ msg: getErrorMessage(e), type: "err" });
        setStep("menu");
      }
    },
    [createOrder, existingOrder, onOrderPlaced, refetchOrders, selectedTable, updateOrder],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Step indicator */}
      <div className="mb-4 flex items-center gap-2">
        {(["tables", "menu"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step === s || (step === "placing" && s === "menu") ? "bg-amber-500 text-white" : step === "menu" && s === "tables" ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
              {step === "menu" && s === "tables" ? "✓" : i + 1}
            </div>
            <span className={`text-xs font-medium ${step === s ? "text-slate-900" : "text-slate-400"}`}>{s === "tables" ? "Pick Table" : "Select Items"}</span>
            {i < 1 && <div className="h-px w-4 bg-slate-300" />}
          </div>
        ))}
      </div>

      {step === "tables" && (
        <TableGrid tables={tables} orders={orders} onSelectTable={handleSelectTable} />
      )}

      {(step === "menu" || step === "placing") && selectedTable && (
        <div className="relative flex-1">
          {step === "placing" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur">
              <div className="flex flex-col items-center gap-3 text-slate-600">
                <Spinner />
                <p className="text-sm font-medium">{isCreating || isUpdating ? "Placing order..." : "Done!"}</p>
              </div>
            </div>
          )}
          <MenuBrowser
            table={selectedTable}
            existingOrder={existingOrder}
            onBack={() => { setStep("tables"); setSelectedTable(null); setExistingOrder(undefined); }}
            onConfirm={handleConfirm}
          />
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Waiter Live Header bar ───────────────────────────────────────────────────
function WaiterLiveHeader({ connected }: { connected: boolean }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-xs text-slate-500">Notifications &amp; sound enabled</p>
      <LiveBadge connected={connected} />
    </div>
  );
}

// ─── Order Card (shared) ──────────────────────────────────────────────────────
const NEXT_STATUS: Record<string, OrderStatus> = {
  PLACED: "IN_PROGRESS",
  IN_PROGRESS: "READY",
  READY: "SERVED",
};

function OrderCard({
  order,
  role,
  onStatusChange,
  onDelete,
  compact,
}: {
  order: OrderRecord;
  role: RoleKey;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onDelete: (orderId: string) => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const canEdit = role === "owner" || role === "manager" || role === "waiter";
  const canDelete = role === "owner" || role === "manager" || role === "waiter";
  const nextStatus = NEXT_STATUS[order.status];

  return (
    <div className={`rounded-2xl border bg-white transition ${compact ? "p-3" : "p-4"}`} style={{ borderColor: order.status === "PLACED" ? "#fcd34d" : order.status === "IN_PROGRESS" ? "#fca5a5" : order.status === "READY" ? "#6ee7b7" : "#e2e8f0" }}>
      <div className="flex items-start gap-3">
        {/* Table badge */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
          T{order.table?.number ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-slate-900">{order.table?.name || `Table ${order.table?.number}`}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(order.status)}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{order.items.length} item{order.items.length !== 1 ? "s" : ""} · {fmtCurrency(order.grandTotal ?? order.subTotal)} · {timeAgo(order.createdAt)}</p>
          {order.note && <p className="mt-0.5 text-xs italic text-slate-400">"{order.note}"</p>}
        </div>
        {/* Expand */}
        <button type="button" onClick={() => setExpanded((v) => !v)} className="shrink-0 text-slate-400 hover:text-slate-700">
          <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Expanded items */}
      {expanded && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-slate-700">{item.quantity}× {item.name}{item.variantName ? ` (${item.variantName})` : ""}</span>
              <span className="text-slate-500">{fmtCurrency(item.lineTotal ?? item.unitPrice * item.quantity)}</span>
            </div>
          ))}
          {order.grandTotal != null && (
            <div className="flex justify-between border-t border-slate-100 pt-1 text-xs font-bold">
              <span>Total</span>
              <span>{fmtCurrency(order.grandTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {(canEdit || canDelete) && order.status !== "SERVED" && order.status !== "CANCELLED" && (
        <div className="mt-3 flex gap-2">
          {nextStatus && (
            <button
              type="button"
              onClick={() => onStatusChange(order.id, nextStatus)}
              className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white shadow-sm shadow-amber-200 active:scale-95 transition"
            >
              Mark {STATUS_LABELS[nextStatus] || nextStatus}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(order.id)}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 active:scale-95 transition"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manager View ─────────────────────────────────────────────────────────────
function ManagerView({ role }: { role: RoleKey }) {
  const token = useAppSelector(selectAuthToken);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "info" } | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [updateOrder] = useUpdateOrderMutation();
  const [deleteOrder] = useDeleteOrderMutation();

  const queryStatus = useMemo(() => {
    if (statusFilter === "active") return ["PLACED", "IN_PROGRESS", "READY"];
    if (statusFilter === "done") return ["SERVED", "CANCELLED"];
    return undefined;
  }, [statusFilter]);

  const { data: ordersData, isFetching, refetch } = useGetOrdersQuery(
    queryStatus ? { status: queryStatus, limit: 100 } : { limit: 100 },
    { pollingInterval: 30000 },
  );

  // ── Socket ────────────────────────────────────────────────────────────────
  useOrderSocket({
    token,
    enabled: true,
    onEvent: (event) => {
      setSocketConnected(true);
      if (event.type === "created") {
        const table = event.order?.table;
        const label = table?.name || (table?.number ? `Table ${table.number}` : "a table");
        setToast({ msg: `🆕 New order — ${label}`, type: "info" });
        refetch();
      } else if (event.type === "updated") {
        const status = (event.order?.status || "").toUpperCase();
        if (status === "READY") {
          const table = event.order?.table;
          const label = table?.name || (table?.number ? `Table ${table.number}` : "");
          setToast({ msg: `✅ Order Ready — ${label}`, type: "ok" });
        }
        refetch();
      } else {
        refetch();
      }
    },
  });

  const orders = useMemo(() => ordersData?.items || [], [ordersData]);

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    try {
      await updateOrder({ orderId, payload: { status } }).unwrap();
      setToast({ msg: `Order marked ${STATUS_LABELS[status] || status}`, type: "ok" });
    } catch (e) {
      setToast({ msg: getErrorMessage(e), type: "err" });
    }
  }

  async function handleDelete(orderId: string) {
    if (!window.confirm("Delete this order?")) return;
    try {
      const res = await deleteOrder(orderId).unwrap();
      setToast({ msg: res.message || "Order deleted", type: "ok" });
    } catch (e) {
      setToast({ msg: getErrorMessage(e), type: "err" });
    }
  }

  const STATUS_TABS = [
    { key: "active", label: "Active" },
    { key: "done", label: "Completed" },
    { key: "all", label: "All" },
  ];

  return (
    <div>
      {/* Header bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${statusFilter === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <LiveBadge connected={socketConnected} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {isFetching ? <Spinner /> : "↻ Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setNewOrderOpen(true)}
            className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-amber-200"
          >
            + New Order
          </button>
        </div>
      </div>

      {/* Orders grid */}
      {isFetching && orders.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
          <Spinner /> Loading orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">
          No orders found for this filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              role={role}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* New order modal (reuses waiter flow) */}
      {newOrderOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setNewOrderOpen(false)}>
          <div
            className="flex h-[90vh] w-full max-w-3xl flex-col rounded-t-3xl bg-[#f6f4ef] p-4 shadow-2xl sm:rounded-2xl sm:h-auto sm:max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold">New Order</p>
              <button onClick={() => setNewOrderOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <WaiterView onOrderPlaced={() => { setNewOrderOpen(false); refetch(); }} />
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Kitchen View (KOT Kanban) ─────────────────────────────────────────────
const KOT_COLUMNS: { status: OrderStatus; label: string; color: string; bg: string; border: string }[] = [
  { status: "PLACED", label: "New Orders", color: "text-amber-800", bg: "bg-amber-50", border: "border-amber-200" },
  { status: "IN_PROGRESS", label: "Cooking", color: "text-red-800", bg: "bg-red-50", border: "border-red-200" },
  { status: "READY", label: "Ready to Serve", color: "text-emerald-800", bg: "bg-emerald-50", border: "border-emerald-200" },
];

function KitchenView() {
  const token = useAppSelector(selectAuthToken);
  const { data: ordersData, isFetching, refetch } = useGetOrdersQuery(
    { status: ["PLACED", "IN_PROGRESS", "READY"], limit: 100 },
    { pollingInterval: 30000 },
  );
  const [updateOrder] = useUpdateOrderMutation();
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "info" } | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const orders = useMemo(() => ordersData?.items || [], [ordersData]);

  // ── Socket: real-time for kitchen ────────────────────────────────────────
  useOrderSocket({
    token,
    enabled: true,
    onEvent: (event) => {
      setSocketConnected(true);
      if (event.type === "created") {
        const table = event.order?.table;
        const label = table?.name || (table?.number ? `Table ${table.number}` : "a table");
        setToast({ msg: `🆕 New order — ${label}`, type: "info" });
        refetch();
      } else if (event.type === "updated" || event.type === "deleted") {
        refetch();
      }
    },
  });

  async function bump(order: OrderRecord) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      await updateOrder({ orderId: order.id, payload: { status: next } }).unwrap();
      setToast({ msg: `Table ${order.table?.number} → ${STATUS_LABELS[next]}`, type: "ok" });
    } catch (e) {
      setToast({ msg: getErrorMessage(e), type: "err" });
    }
  }

  const byStatus = useMemo(() => {
    const map: Record<string, OrderRecord[]> = { PLACED: [], IN_PROGRESS: [], READY: [] };
    for (const o of orders) {
      if (map[o.status]) map[o.status].push(o);
    }
    return map;
  }, [orders]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-500">{orders.length} active orders</p>
          <LiveBadge connected={socketConnected} />
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        >
          {isFetching ? <Spinner /> : null}
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {KOT_COLUMNS.map((col) => (
          <div key={col.status} className={`rounded-2xl border-2 ${col.border} ${col.bg} p-3`}>
            <div className="mb-3 flex items-center justify-between">
              <p className={`text-xs font-bold uppercase tracking-wide ${col.color}`}>{col.label}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${col.color} ${col.bg}`}>{byStatus[col.status]?.length ?? 0}</span>
            </div>
            <div className="space-y-2">
              {byStatus[col.status]?.length === 0 && (
                <div className="rounded-xl border border-dashed border-current/20 py-6 text-center text-xs opacity-50">
                  {col.status === "PLACED" ? "No new orders" : col.status === "IN_PROGRESS" ? "Nothing cooking" : "Nothing ready"}
                </div>
              )}
              {(byStatus[col.status] || []).map((order) => (
                <div key={order.id} className="rounded-xl border border-white/60 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">T{order.table?.number} — {order.table?.name}</p>
                      <p className="text-[10px] text-slate-500">{timeAgo(order.createdAt)}</p>
                    </div>
                    {NEXT_STATUS[order.status] && (
                      <button
                        type="button"
                        onClick={() => bump(order)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white shadow active:scale-95 transition ${col.status === "PLACED" ? "bg-red-500" : col.status === "IN_PROGRESS" ? "bg-emerald-500" : "bg-blue-500"}`}
                      >
                        {col.status === "PLACED" ? "Start" : col.status === "IN_PROGRESS" ? "Ready" : "Served"}
                      </button>
                    )}
                  </div>
                  {order.note && <p className="mt-1 text-[10px] italic text-slate-400">"{order.note}"</p>}
                  <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2">
                    {order.items.map((item, i) => (
                      <p key={i} className="text-xs text-slate-700">
                        <span className="font-bold">{item.quantity}×</span> {item.name}
                        {item.variantName ? <span className="text-slate-400"> ({item.variantName})</span> : null}
                        {item.note ? <span className="italic text-amber-600"> — {item.note}</span> : null}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Main Workspace ──────────────────────────────────────────────────────────
type Props = {
  rawRole?: string;
};

export function OrdersWorkspace({ rawRole }: Props) {
  const role = normalizeRole(rawRole);

  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const isWaiter = role === "waiter";
  const isKitchen = role === "kitchen";

  return (
    <div className="h-full">
      {isWaiter ? (
        <>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">Take Order</h2>
            <p className="text-xs text-slate-500">Pick a table, add items, and place the order in 3 taps.</p>
          </div>
          <WaiterView onOrderPlaced={() => setToast({ msg: "Order placed!", type: "ok" })} />
        </>
      ) : isKitchen ? (
        <>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">Kitchen Display</h2>
            <p className="text-xs text-slate-500">Live KOT board — tap to update order status.</p>
          </div>
          <KitchenView />
        </>
      ) : (
        <>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">Order Management</h2>
            <p className="text-xs text-slate-500">View, update and manage all orders.</p>
          </div>
          <ManagerView role={role} />
        </>
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
