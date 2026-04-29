/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import { useGetOrdersQuery } from "@/store/api/ordersApi";
import { useGetInvoicesQuery } from "@/store/api/invoicesApi";
import type { OrderRecord } from "@/store/types/orders";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PLACED: "Placed",
  IN_PROGRESS: "Cooking",
  READY: "Ready",
  SERVED: "Served",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const SERVICE_LABELS: Record<string, string> = {
  DINE_IN: "Dine-In",
  TAKEAWAY: "Takeaway",
  WALK_IN: "Walk-In",
};

function ns(s?: string) { return (s || "").toUpperCase(); }

function fmtCurrency(n?: number) {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

function fmtDate(v?: string | number) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function todayRange() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { from: s.toISOString(), to: e.toISOString() };
}

function yesterdayRange() {
  const s = new Date(); s.setDate(s.getDate() - 1); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setDate(e.getDate() - 1); e.setHours(23, 59, 59, 999);
  return { from: s.toISOString(), to: e.toISOString() };
}

function thisWeekRange() {
  const s = new Date(); s.setDate(s.getDate() - s.getDay()); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { from: s.toISOString(), to: e.toISOString() };
}

function thisMonthRange() {
  const s = new Date(); s.setDate(1); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { from: s.toISOString(), to: e.toISOString() };
}

function statusClass(s?: string) {
  const v = ns(s);
  if (v === "PLACED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (v === "IN_PROGRESS") return "border-rose-200 bg-rose-50 text-rose-700";
  if (v === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (v === "SERVED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (v === "COMPLETED") return "border-teal-200 bg-teal-50 text-teal-700";
  if (v === "CANCELLED") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function modeClass(s?: string) {
  const v = ns(s);
  if (v === "TAKEAWAY") return "border-violet-200 bg-violet-50 text-violet-700";
  if (v === "WALK_IN") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-700"; // DINE_IN default
}

type QuickFilter = "today" | "yesterday" | "week" | "month" | "all";

interface FilterState {
  status: string[];
  serviceMode: string[];
  from: string;
  to: string;
}

const DEFAULT_FILTER: FilterState = { status: [], serviceMode: [], from: "", to: "" };

// ── Stat Card ────────────────────────────────────────────────────────────────


function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  // 👉 format large numbers (1Cr, 1L, etc.)
  const formatValue = (val: string | number) => {
    if (typeof val === "number") {
      if (val >= 10000000) return (val / 10000000).toFixed(1) + "Cr";
      if (val >= 100000) return (val / 100000).toFixed(1) + "L";
      if (val >= 1000) return (val / 1000).toFixed(1) + "K";
    }
    return val;
  };

  return (
    <div
      className={`flex min-w-[120px] sm:min-w-[140px] flex-1 flex-col gap-1 rounded-xl sm:rounded-2xl border p-2 sm:p-3 md:p-2 ${color}`}
    >
      {/* Label */}
      <p className="text-[10px] sm:text-xs md:text-sm font-semibold uppercase tracking-wide opacity-60 truncate">
        {label}
      </p>

      {/* Value (AUTO RESPONSIVE + NO OVERFLOW) */}
      <p className="font-bold leading-tight truncate text-[clamp(14px,4vw,24px)]">
        {formatValue(value)}
      </p>

      {/* Sub */}
      {sub && (
        <p className="text-[10px] sm:text-xs md:text-sm opacity-70 truncate">
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Filter Drawer ─────────────────────────────────────────────────────────────

function FilterDrawer({
  open,
  onClose,
  filter,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  filter: FilterState;
  onChange: (f: FilterState) => void;
}) {
  const [local, setLocal] = useState<FilterState>(filter);

  useEffect(() => { setLocal(filter); }, [filter]);

  const statuses = ["PLACED", "IN_PROGRESS", "READY", "SERVED", "COMPLETED", "CANCELLED"];
  const modes = ["DINE_IN", "TAKEAWAY", "WALK_IN"];

  function toggle<K extends keyof FilterState>(key: K, val: string) {
    setLocal((prev) => {
      const arr = prev[key] as string[];
      return { ...prev, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      )}

      {/* Drawer */}
      <div className={`fixed inset-y-0 right-0 z-50 flex w-80 flex-col bg-white shadow-2xl transition-transform duration-300 max-w-[90vw] ${open ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <p className="text-base font-bold text-slate-900">Filter Orders</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Status */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Order Status</p>
            <div className="flex flex-wrap gap-2">
              {statuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle("status", s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${local.status.includes(s) ? "border-blue-400 bg-blue-100 text-blue-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {STATUS_LABELS[s] || s}
                </button>
              ))}
            </div>
          </div>

          {/* Service Mode */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Service Mode</p>
            <div className="flex flex-wrap gap-2">
              {modes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggle("serviceMode", m)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${local.serviceMode.includes(m) ? "border-blue-400 bg-blue-100 text-blue-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {SERVICE_LABELS[m] || m}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Date Range</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">From</label>
                <input
                  type="date"
                  value={local.from ? local.from.slice(0, 10) : ""}
                  onChange={(e) => setLocal((prev) => ({ ...prev, from: e.target.value ? new Date(e.target.value).toISOString() : "" }))}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">To</label>
                <input
                  type="date"
                  value={local.to ? local.to.slice(0, 10) : ""}
                  onChange={(e) => setLocal((prev) => ({ ...prev, to: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : "" }))}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-4 flex gap-3">
          <button
            type="button"
            onClick={() => { setLocal(DEFAULT_FILTER); onChange(DEFAULT_FILTER); onClose(); }}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={() => { onChange(local); onClose(); }}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition"
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

// ── Order Row ─────────────────────────────────────────────────────────────────
function OrderRow({ order, invoiced ,index}: { order: OrderRecord; invoiced: boolean ,index:number}) {
  const [expanded, setExpanded] = useState(false);
  const tableLabel = order.table?.name || (order.table?.number ? `Table ${order.table.number}` : null);
  const tokenLabel = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-6)}`;
  const hasTbl = Boolean(order.tableId || order.table?.id);
  const mode = ns(order.serviceMode);
  const displayMode = hasTbl && mode !== "TAKEAWAY" ? "DINE_IN" : mode || "DINE_IN";
  const activeItems = (order.items || []).filter((i) => ns(i.status) !== "CANCELLED");

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      {/* Row header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 transition"
      >
        {/* Order number */}
        {/* <span className="text-[10px] font-bold text-slate-500 min-w-[60px]">{tokenLabel}</span> */}

  <span className="text-xs font-bold text-slate-500 min-w-[60px]">{index + 1}</span>
        {/* Table / customer */}
        <span className="text-sm text-slate-900 flex-1 truncate min-w-[80px]">
          {tableLabel || order.customerName || "—"}
        </span>

        {/* Service mode badge */}
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${modeClass(displayMode)}`}>
          {SERVICE_LABELS[displayMode] || displayMode}
        </span>

        {/* Status badge */}
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(order.status)}`}>
          {STATUS_LABELS[ns(order.status)] || order.status}
        </span>

        {/* Invoice badge */}
        {invoiced && (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
            Invoiced
          </span>
        )}

        {/* Amount */}
        <span className="text-sm font-bold text-slate-800">
          {fmtCurrency(order.grandTotal ?? order.subTotal)}
        </span>

        {/* Date */}
        <span className="text-[10px] text-slate-400 hidden sm:block">{fmtDate(order.createdAt)}</span>

        {/* Expand icon */}
        <svg
          viewBox="0 0 16 16"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {/* Expanded items */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-3 pt-2 space-y-1.5">
          {activeItems.length === 0 ? (
            <p className="text-xs text-slate-400">No items</p>
          ) : (
            activeItems.map((item, idx) => (
              <div key={item.lineId || idx} className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-600">
                  {item.quantity}
                </span>
                <span className="flex-1 text-xs text-slate-700">
                  {item.name}
                  {item.variantName && <span className="text-slate-400"> ({item.variantName})</span>}
                </span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${statusClass(item.status)}`}>
                  {STATUS_LABELS[ns(item.status)] || item.status || "—"}
                </span>
                <span className="text-[11px] font-semibold text-slate-600">
                  {fmtCurrency(item.lineTotal ?? item.unitPrice * item.quantity)}
                </span>
              </div>
            ))
          )}
          {order.note && (
            <p className="mt-1 text-[11px] italic text-amber-700">📝 {order.note}</p>
          )}
          <p className="mt-1 text-[10px] text-slate-400">
            {fmtDate(order.createdAt)} · {activeItems.length} item{activeItems.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main OrdersHistoryView ────────────────────────────────────────────────────

export function OrdersHistoryView() {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("today");
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [feed, setFeed] = useState<OrderRecord[]>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  console.log(feed)

  // Derive API params from quickFilter + custom filter
  const queryParams = useMemo(() => {
    const dateRange = (() => {
      if (filter.from || filter.to) return { from: filter.from, to: filter.to };
      if (quickFilter === "today") return todayRange();
      if (quickFilter === "yesterday") return yesterdayRange();
      if (quickFilter === "week") return thisWeekRange();
      if (quickFilter === "month") return thisMonthRange();
      return {};
    })();

    return {
      ...(filter.status.length ? { status: filter.status } : {}),
      ...(filter.serviceMode.length ? { serviceMode: filter.serviceMode } : {}),
      ...dateRange,
      page,
      limit: 50,
    };
  }, [quickFilter, filter, page]);

  const { data: ordersData, isFetching } = useGetOrdersQuery(queryParams, {
    pollingInterval: quickFilter === "today" ? 30000 : 0,
  });

  const { data: invoicesData } = useGetInvoicesQuery({ limit: 200 });

  const invoicedOrderIds = useMemo(
    () => new Set((invoicesData?.items || []).map((inv) => inv.orderId).filter(Boolean) as string[]),
    [invoicesData],
  );

  // Reset feed on filter change
  useEffect(() => {
    setPage(1);
    setFeed([]);
  }, [quickFilter, filter]);

  // Accumulate pages
  useEffect(() => {
    if (!ordersData?.items) return;
    setFeed((prev) => page === 1 ? ordersData.items : [...prev, ...ordersData.items]);
  }, [ordersData, page]);

  // Infinite scroll
  const hasMore = (ordersData?.pagination?.totalPages ?? 1) > page;
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !isFetching) setPage((p) => p + 1);
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, isFetching]);

  // Stats for shown feed
  const totalAmount = feed.reduce((s, o) => s + (o.grandTotal ?? o.subTotal ?? 0), 0);
  const dineInCount = feed.filter((o) => Boolean(o.tableId || o.table?.id) && ns(o.serviceMode) !== "TAKEAWAY").length;
  const takeawayCount = feed.filter((o) => ns(o.serviceMode) === "TAKEAWAY" || (!o.tableId && !o.table?.id)).length;
  const completedCount = feed.filter((o) => ["SERVED", "COMPLETED"].includes(ns(o.status))).length;

  const activeFilterCount = filter.status.length + filter.serviceMode.length + (filter.from ? 1 : 0) + (filter.to ? 1 : 0);

  const quickFilters: { key: QuickFilter; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All Time" },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Quick filters + filter button */}
      <div className="flex items-center gap-2">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {quickFilters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setQuickFilter(key); setFilter(DEFAULT_FILTER); }}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${quickFilter === key && !activeFilterCount ? "border-blue-400 bg-blue-100 text-blue-900 shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filter drawer button */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`ml-auto flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${activeFilterCount > 0 ? "border-blue-400 bg-blue-100 text-blue-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 4h12M4 8h8M6 12h4" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Stats row */}
    

<div className="flex gap-2 overflow-x-auto no-scrollbar sm:flex-wrap">
  <div className="flex gap-2 min-w-max sm:min-w-0 w-full">
    <StatCard
      label="Orders"
      value={ordersData?.pagination?.total ?? feed.length}
      color="border-slate-200 bg-white text-slate-800"
    />
    <StatCard
      label="Revenue"
      value={fmtCurrency(totalAmount)}
      sub={`${completedCount} completed`}
      color="border-emerald-200 bg-emerald-50 text-emerald-800"
    />
    <StatCard
      label="Dine-In"
      value={dineInCount}
      color="border-amber-200 bg-amber-50 text-amber-800"
    />
    <StatCard
      label="Takeaway"
      value={takeawayCount}
      color="border-violet-200 bg-violet-50 text-violet-800"
    />
  </div>
</div>
      {/* Orders list */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {isFetching && feed.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Loading orders…
          </div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <svg viewBox="0 0 48 48" className="h-12 w-12 text-slate-200" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="8" y="10" width="32" height="28" rx="3" />
              <path d="M16 20h16M16 26h10" />
            </svg>
            <p className="text-sm font-semibold text-slate-500">No orders found</p>
            <p className="text-xs text-slate-400">Try changing the time filter or adjust filters</p>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {feed.map((order,index) => (
              <OrderRow  index={index} key={order.id} order={order} invoiced={invoicedOrderIds.has(order.id)} />
            ))}
            {/* Load more sentinel */}
            <div ref={loadMoreRef} className="h-4" />
            {isFetching && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Loading more…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter Drawer */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filter={filter}
        onChange={(f) => { setFilter(f); setPage(1); setFeed([]); }}
      />
    </div>
  );
}
