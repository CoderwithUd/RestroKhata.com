"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/confirm-provider";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import { useOrderSocket } from "@/lib/use-order-socket";
import {
  useCancelOrderItemMutation,
  useGetOrdersQuery,
  useMoveOrderItemMutation,
  useRemoveOrderItemMutation,
  useUpdateOrderMutation,
  useDeleteOrderMutation,
} from "@/store/api/ordersApi";
import { useCreateInvoiceMutation, useGetInvoicesQuery } from "@/store/api/invoicesApi";
import { useGetTablesQuery } from "@/store/api/tablesApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthToken } from "@/store/slices/authSlice";
import type { OrderItem, OrderRecord, OrderStatus } from "@/store/types/orders";
import type { TableRecord } from "@/store/types/tables";

// ── Shared helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PLACED: "Placed",
  IN_PROGRESS: "Cooking",
  READY: "Ready",
  SERVED: "Served",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function ns(s?: string) { return (s || "").toUpperCase(); }

function fmtCurrency(n?: number): string {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

function timeAgo(v?: string | number): string {
  if (!v) return "";
  const ts = typeof v === "number" ? v : new Date(v).getTime();
  if (!Number.isFinite(ts)) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function sortByLatest(orders: OrderRecord[]): OrderRecord[] {
  return [...orders].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
}

function isActive(status?: string): boolean {
  return ["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(ns(status));
}

function canInvoice(status?: string): boolean {
  return ns(status) === "READY" || ns(status) === "SERVED";
}

function canCorrect(status?: string): boolean {
  return ["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(ns(status));
}

function nextStatus(status?: string): OrderStatus | undefined {
  const v = ns(status);
  if (v === "PLACED") return "IN_PROGRESS";
  if (v === "IN_PROGRESS") return "READY";
  if (v === "READY") return "SERVED";
  return undefined;
}

function nextStatusLabel(status?: string): string {
  const v = ns(status);
  if (v === "PLACED") return "Start Cooking";
  if (v === "IN_PROGRESS") return "Mark Ready";
  if (v === "READY") return "Serve";
  return "";
}

function activeItems(order: OrderRecord): OrderItem[] {
  return (order.items || []).filter((i) => ns(i.status) !== "CANCELLED");
}

function allItemsDone(order: OrderRecord): boolean {
  const items = activeItems(order);
  return items.length > 0 && items.every((i) => ["READY", "SERVED"].includes(ns(i.status)));
}

function orderActionKey(orderId: string, lineId: string, status?: string): string {
  return `${orderId}:${lineId}:${status || ""}`;
}

function orderHeaderActionKey(orderId: string, action: "COMPLETE" | "DELETE"): string {
  return `${orderId}:${action}`;
}

function getBulkOrderAction(order: OrderRecord): {
  label: string;
  count: number;
  targetStatus: OrderStatus | null;
  sourceStatus: OrderStatus | null;
} {
  const items = activeItems(order);
  const readyItems = items.filter((item) => ns(item.status) === "READY");
  if (readyItems.length > 0) {
    return {
      label: "Serve",
      count: readyItems.length,
      targetStatus: "SERVED",
      sourceStatus: "READY",
    };
  }

  const cookingItems = items.filter((item) => ns(item.status) === "IN_PROGRESS");
  if (cookingItems.length > 0) {
    return {
      label: "Ready",
      count: cookingItems.length,
      targetStatus: "READY",
      sourceStatus: "IN_PROGRESS",
    };
  }

  const placedItems = items.filter((item) => ns(item.status) === "PLACED");
  if (placedItems.length > 0) {
    return {
      label: "Start",
      count: placedItems.length,
      targetStatus: "IN_PROGRESS",
      sourceStatus: "PLACED",
    };
  }

  return {
    label: "Complete",
    count: 0,
    targetStatus: null,
    sourceStatus: null,
  };
}

function correctionQty(item: OrderItem, qty?: number): number {
  if (!item.quantity) return 1;
  if (!qty || !Number.isFinite(qty)) return 1;
  return Math.min(Math.max(1, Math.floor(qty)), item.quantity);
}

function itemStatusClass(s?: string): string {
  const v = ns(s);
  if (!v || v === "PLACED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (v === "IN_PROGRESS") return "border-rose-200 bg-rose-50 text-rose-700";
  if (v === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (v === "SERVED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (v === "CANCELLED") return "border-slate-200 bg-slate-100 text-slate-400";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function orderBadgeClass(s: string): string {
  const v = ns(s);
  if (v === "PLACED") return "border-amber-300 bg-amber-100 text-amber-800";
  if (v === "IN_PROGRESS") return "border-red-300 bg-red-100 text-red-800";
  if (v === "READY") return "border-emerald-300 bg-emerald-100 text-emerald-800";
  if (v === "SERVED") return "border-blue-300 bg-blue-100 text-blue-800";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl border px-4 py-2.5 min-w-[70px] ${color}`}>
      <p className="text-xl font-bold leading-none">{count}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
    </div>
  );
}

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${connected ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-400"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

// ── Order Card (shared between dine-in and takeaway sections) ─────────────────

function OrderCard({
  order,
  allOrders,
  tables,
  servingItemKey,
  correctingLineKey,
  correctionQuantities,
  creatingInvoiceOrderId,
  processingOrderKey,
  onMarkItemServed,
  onMarkReadyAll,
  onAdvanceOrder,
  onDeleteOrder,
  onRemoveItem,
  onCancelItem,
  onMoveItem,
  onCreateInvoice,
}: {
  order: OrderRecord;
  allOrders: OrderRecord[];
  tables: TableRecord[];
  servingItemKey: string | null;
  correctingLineKey: string | null;
  correctionQuantities: Record<string, number>;
  creatingInvoiceOrderId: string | null;
  processingOrderKey: string | null;
  onMarkItemServed: (order: OrderRecord, item: OrderItem) => void;
  onMarkReadyAll: (order: OrderRecord) => void;
  onAdvanceOrder: (order: OrderRecord) => void;
  onDeleteOrder: (order: OrderRecord) => void;
  onRemoveItem: (order: OrderRecord, item: OrderItem, qty: number) => void;
  onCancelItem: (order: OrderRecord, item: OrderItem) => void;
  onMoveItem: (order: OrderRecord, item: OrderItem, target: { targetOrderId?: string; targetTableId?: string }, qty: number) => void;
  onCreateInvoice: (order: OrderRecord) => void;
}) {
  const isTakeaway = !order.tableId && !order.table?.id || (order.serviceMode || "").toUpperCase() === "TAKEAWAY";
  const items = activeItems(order);
  const readyItems = items.filter((i) => ns(i.status) === "READY");
  const allDone = allItemsDone(order);
  const canBill = canInvoice(order.status) || allDone;
  const isCreatingInvoice = creatingInvoiceOrderId === order.id;

  // Possible move targets
  const moveTargets = allOrders.filter(
    (o) => o.id !== order.id && isActive(o.status) && (o.tableId || o.table?.id) === (order.tableId || order.table?.id),
  );
  const tableTargets = tables.filter(
    (t) => t.id !== (order.tableId || order.table?.id),
  );

  const tokenLabel = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-6)}`;
  const tableLabel = order.table?.name || (order.table?.number ? `Table ${order.table.number}` : null);
  const customerLabel = [order.customerName, order.customerPhone].filter(Boolean).join(" · ") || null;
  const bulkAction = getBulkOrderAction(order);
  const completeKey = orderHeaderActionKey(order.id, "COMPLETE");
  const deleteKey = orderHeaderActionKey(order.id, "DELETE");
  const canComplete = ns(order.status) !== "COMPLETED" && ns(order.status) !== "CANCELLED";
  const canDelete = ns(order.status) !== "CANCELLED";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
      {/* Order header */}
      <div className={`flex flex-wrap items-start justify-between gap-2 px-4 py-3 ${isTakeaway ? "bg-violet-50/60 border-b border-violet-100" : "bg-amber-50/60 border-b border-amber-100"}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Mode badge */}
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${isTakeaway ? "border-violet-300 bg-violet-100 text-violet-700" : "border-amber-300 bg-amber-100 text-amber-700"}`}>
              {isTakeaway ? (
                <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 2L1.5 5v8a1 1 0 001 1h11a1 1 0 001-1V5L12 2z" />
                  <line x1="1.5" y1="5" x2="14.5" y2="5" />
                  <path d="M10 7a2 2 0 01-4 0" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="5" width="12" height="6" rx="1" />
                  <path d="M5 11v2M11 11v2" />
                </svg>
              )}
              {isTakeaway ? "Takeaway" : "Dine-In"}
            </span>
            <span className="text-sm font-bold text-slate-900">
              {isTakeaway ? `Token ${tokenLabel}` : tableLabel || tokenLabel}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${orderBadgeClass(order.status)}`}>
              {STATUS_LABELS[ns(order.status)] || order.status}
            </span>
            {allDone && (
              <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                All Done ✓
              </span>
            )}
          </div>
          {customerLabel && (
            <p className="mt-1 text-xs text-slate-500">{customerLabel}</p>
          )}
          {order.note && (
            <p className="mt-0.5 text-[11px] italic text-amber-700">{order.note}</p>
          )}
          <p className="mt-0.5 text-[10px] text-slate-400">
            {items.length} item{items.length !== 1 ? "s" : ""} · {fmtCurrency(order.grandTotal ?? order.subTotal)} · {timeAgo(order.createdAt)}
          </p>
        </div>

        {/* Header actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {canComplete && (
            <button
              type="button"
              onClick={() => onAdvanceOrder(order)}
              disabled={processingOrderKey === completeKey}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              {processingOrderKey === completeKey
                ? "Updating..."
                : bulkAction.count > 0
                  ? `${bulkAction.label} ${bulkAction.count}`
                  : "Complete"}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDeleteOrder(order)}
              disabled={processingOrderKey === deleteKey}
              className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
            >
              {processingOrderKey === deleteKey ? "Deleting..." : "Delete"}
            </button>
          )}
          {readyItems.length > 0 && (
            <button
              type="button"
              onClick={() => onMarkReadyAll(order)}
              disabled={servingItemKey === `batch:${order.id}:SERVED`}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              {servingItemKey === `batch:${order.id}:SERVED` ? "Serving..." : `Serve Ready (${readyItems.length})`}
            </button>
          )}
          {canBill && (
            <button
              type="button"
              disabled={isCreatingInvoice}
              onClick={() => onCreateInvoice(order)}
              className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:opacity-50"
            >
              {isCreatingInvoice ? "Creating…" : "Invoice"}
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div className="divide-y divide-slate-100">
          {items.map((item, idx) => {
            const next = nextStatus(item.status);
            const lineKey = item.lineId ? `${order.id}:${item.lineId}` : null;
            const corrKey = item.lineId ? `${order.id}:${item.lineId}` : null;
            const corrVal = corrKey ? (correctionQuantities[corrKey] ?? 1) : 1;
            const servingKey = item.lineId ? orderActionKey(order.id, item.lineId, next) : null;
            const isServing = servingItemKey === servingKey;
            const isCorrecting = correctingLineKey === corrKey;

            return (
              <div key={`${item.lineId || idx}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                {/* Qty badge */}
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">
                  ×{item.quantity}
                </div>

                {/* Name + price */}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-900">
                    {item.name}
                    {item.variantName && (
                      <span className="ml-1 font-normal text-slate-400">({item.variantName})</span>
                    )}
                  </p>
                  {item.note && (
                    <p className="text-[10px] italic text-amber-700">{item.note}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {fmtCurrency(item.lineTotal ?? item.unitPrice * item.quantity)}
                  </p>
                </div>

                {/* Status + actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${itemStatusClass(item.status)}`}>
                    {STATUS_LABELS[ns(item.status)] || item.status || "Pending"}
                  </span>

                  {item.lineId && next && (
                    <button
                      type="button"
                      onClick={() => onMarkItemServed(order, item)}
                      disabled={isServing}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold disabled:opacity-40 transition ${
                        next === "IN_PROGRESS" ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100" :
                        next === "READY" ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" :
                        "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      {isServing ? "…" : nextStatusLabel(item.status)}
                    </button>
                  )}

                  {item.lineId && canCorrect(item.status) && (
                    <>
                      {/* Move to table */}
                      {tableTargets.length > 0 && (
                        <select
                          defaultValue=""
                          disabled={isCorrecting}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            onMoveItem(order, item, { targetTableId: e.target.value }, corrVal);
                            e.currentTarget.value = "";
                          }}
                          className="rounded-lg border border-sky-200 bg-sky-50 px-1.5 py-1 text-[10px] font-semibold text-sky-700 disabled:opacity-40"
                        >
                          <option value="">Move T</option>
                          {tableTargets.slice(0, 8).map((t) => (
                            <option key={t.id} value={t.id}>T{t.number}</option>
                          ))}
                        </select>
                      )}

                      {/* Move to order */}
                      {moveTargets.length > 0 && (
                        <select
                          defaultValue=""
                          disabled={isCorrecting}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            onMoveItem(order, item, { targetOrderId: e.target.value }, corrVal);
                            e.currentTarget.value = "";
                          }}
                          className="rounded-lg border border-sky-200 bg-sky-50 px-1.5 py-1 text-[10px] font-semibold text-sky-700 disabled:opacity-40"
                        >
                          <option value="">Move Ord</option>
                          {moveTargets.map((o) => (
                            <option key={o.id} value={o.id}>#{o.orderNumber || o.id.slice(-4)}</option>
                          ))}
                        </select>
                      )}

                      {/* Remove */}
                      <button
                        type="button"
                        disabled={isCorrecting}
                        onClick={() => onRemoveItem(order, item, corrVal)}
                        title={item.quantity > 1 ? "Reduce qty" : "Remove item"}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                      >
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M3 4h10M6 4V3h4v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" />
                        </svg>
                      </button>

                      {/* Cancel */}
                      <button
                        type="button"
                        disabled={isCorrecting}
                        onClick={() => onCancelItem(order, item)}
                        title="Cancel item"
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 hover:bg-slate-100 disabled:opacity-40"
                      >
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M3 3l10 10M13 3L3 13" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main OrdersBoardView ──────────────────────────────────────────────────────

export function OrdersBoardView() {
  const token = useAppSelector(selectAuthToken);
  const confirm = useConfirm();

  const { data: ordersData, refetch: refetchOrders } = useGetOrdersQuery({
    status: ["PLACED", "IN_PROGRESS", "READY", "SERVED"],
    limit: 100,
  });
  const { data: invoicesData, refetch: refetchInvoices } = useGetInvoicesQuery({ limit: 100 });
  const { data: tablesData } = useGetTablesQuery({ isActive: true });
  const [createInvoice] = useCreateInvoiceMutation();
  const [updateOrder] = useUpdateOrderMutation();
  const [deleteOrder] = useDeleteOrderMutation();
  const [removeOrderItem] = useRemoveOrderItemMutation();
  const [cancelOrderItem] = useCancelOrderItemMutation();
  const [moveOrderItem] = useMoveOrderItemMutation();

  const [socketConnected, setSocketConnected] = useState(false);
  const [servingItemKey, setServingItemKey] = useState<string | null>(null);
  const [correctingLineKey, setCorrectingLineKey] = useState<string | null>(null);
  const [correctionQuantities] = useState<Record<string, number>>({});
  const [creatingInvoiceOrderId, setCreatingInvoiceOrderId] = useState<string | null>(null);
  const [processingOrderKey, setProcessingOrderKey] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<"all" | "dine-in" | "takeaway">("all");

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

  const allOrders = useMemo(() => sortByLatest(ordersData?.items || []), [ordersData]);
  const invoices = useMemo(() => invoicesData?.items || [], [invoicesData]);
  const tables = useMemo(() => tablesData?.items || [], [tablesData]);

  const invoicedOrderIds = useMemo(
    () => new Set(invoices.map((inv) => inv.orderId).filter((id): id is string => Boolean(id))),
    [invoices],
  );

  const activeOrders = useMemo(() =>
    allOrders.filter((o) => !invoicedOrderIds.has(o.id) && isActive(o.status)),
    [allOrders, invoicedOrderIds],
  );

  const dineInOrders = useMemo(() =>
    activeOrders.filter((o) => {
      const hasTbl = Boolean(o.tableId || o.table?.id);
      const mode = ns(o.serviceMode);
      return hasTbl && mode !== "TAKEAWAY";
    }),
    [activeOrders],
  );

  const takeawayOrders = useMemo(() =>
    activeOrders.filter((o) => {
      const mode = ns(o.serviceMode);
      const noTbl = !o.tableId && !o.table?.id;
      return mode === "TAKEAWAY" || noTbl;
    }),
    [activeOrders],
  );

  const shownOrders = sectionFilter === "dine-in" ? dineInOrders
    : sectionFilter === "takeaway" ? takeawayOrders
    : activeOrders;

  // Stats
  const readyCount = activeOrders.filter((o) => ns(o.status) === "READY").length;
  const cookingCount = activeOrders.filter((o) => ["PLACED", "IN_PROGRESS"].includes(ns(o.status))).length;
  const billingCount = activeOrders.filter((o) => canInvoice(o.status) || allItemsDone(o)).length;

  // Handlers
  async function handleMarkItemServed(order: OrderRecord, item: OrderItem) {
    const next = nextStatus(item.status);
    if (!item.lineId || !next) return;
    const key = orderActionKey(order.id, item.lineId, next);
    try {
      setServingItemKey(key);
      await updateOrder({ orderId: order.id, payload: { itemStatusUpdates: [{ lineId: item.lineId, status: next }] } }).unwrap();
      showSuccess(`${item.name} served`);
      refetchOrders();
    } catch (e) { showError(getErrorMessage(e)); }
    finally { setServingItemKey(null); }
  }

  async function handleMarkReadyAll(order: OrderRecord) {
    const ready = activeItems(order).filter((i) => ns(i.status) === "READY" && i.lineId);
    if (!ready.length) return;
    const batchKey = `batch:${order.id}:SERVED`;
    try {
      setServingItemKey(batchKey);
      await updateOrder({
        orderId: order.id,
        payload: { itemStatusUpdates: ready.filter((i): i is OrderItem & { lineId: string } => Boolean(i.lineId)).map((i) => ({ lineId: i.lineId, status: "SERVED" as OrderStatus })) },
      }).unwrap();
      showSuccess(`${ready.length} item${ready.length > 1 ? "s" : ""} served`);
      refetchOrders();
    } catch (e) { showError(getErrorMessage(e)); }
    finally { setServingItemKey(null); }
  }

  async function handleCreateInvoice(order: OrderRecord) {
    try {
      setCreatingInvoiceOrderId(order.id);
      const r = await createInvoice({ orderId: order.id }).unwrap();
      showSuccess(r.message || "Invoice created");
      refetchOrders();
      refetchInvoices();
    } catch (e) { showError(getErrorMessage(e)); }
    finally { setCreatingInvoiceOrderId(null); }
  }

  async function handleAdvanceOrder(order: OrderRecord) {
    const key = orderHeaderActionKey(order.id, "COMPLETE");
    const bulkAction = getBulkOrderAction(order);
    const items = activeItems(order);
    const targetItems =
      bulkAction.sourceStatus && bulkAction.targetStatus
        ? items.filter((item) => ns(item.status) === bulkAction.sourceStatus)
        : [];
    const willCompleteOrder =
      bulkAction.targetStatus === "SERVED" &&
      items.length > 0 &&
      items.every((item) => ["READY", "SERVED"].includes(ns(item.status)));

    try {
      setProcessingOrderKey(key);
      if (targetItems.length > 0 && bulkAction.targetStatus) {
        await updateOrder({
          orderId: order.id,
          payload: {
            itemStatusUpdates: targetItems
              .filter((item): item is OrderItem & { lineId: string } => Boolean(item.lineId))
              .map((item) => ({ lineId: item.lineId, status: bulkAction.targetStatus as OrderStatus })),
            ...(willCompleteOrder ? { status: "COMPLETED" as OrderStatus } : {}),
          },
        }).unwrap();
        showSuccess(
          `${bulkAction.label} ${targetItems.length}${willCompleteOrder ? " and completed" : ""}`,
        );
      } else if (items.length === 0) {
        await updateOrder({ orderId: order.id, payload: { status: "COMPLETED" } }).unwrap();
        showSuccess("Order completed");
      }
      refetchOrders();
      refetchInvoices();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setProcessingOrderKey(null);
    }
  }

  async function handleDeleteOrder(order: OrderRecord) {
    const key = orderHeaderActionKey(order.id, "DELETE");
    const approved = await confirm({
      title: "Delete Order",
      message: "Delete this live order?",
      confirmText: "Delete Order",
      cancelText: "Keep Order",
      tone: "danger",
    });
    if (!approved) return;
    try {
      setProcessingOrderKey(key);
      const response = await deleteOrder(order.id).unwrap();
      showSuccess(response.message || "Order deleted");
      refetchOrders();
      refetchInvoices();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setProcessingOrderKey(null);
    }
  }

  async function handleRemoveItem(order: OrderRecord, item: OrderItem, qty: number) {
    if (!item.lineId) return;
    const q = correctionQty(item, qty);
    try {
      setCorrectingLineKey(`${order.id}:${item.lineId}`);
      await removeOrderItem({ orderId: order.id, lineId: item.lineId, payload: q < item.quantity ? { quantity: q } : undefined }).unwrap();
      showSuccess(q < item.quantity ? `Qty reduced` : `${item.name} removed`);
      refetchOrders();
    } catch (e) { showError(getErrorMessage(e)); }
    finally { setCorrectingLineKey(null); }
  }

  async function handleCancelItem(order: OrderRecord, item: OrderItem) {
    if (!item.lineId) return;
    try {
      setCorrectingLineKey(`${order.id}:${item.lineId}`);
      await cancelOrderItem({ orderId: order.id, lineId: item.lineId }).unwrap();
      showSuccess(`${item.name} cancelled`);
      refetchOrders();
    } catch (e) { showError(getErrorMessage(e)); }
    finally { setCorrectingLineKey(null); }
  }

  async function handleMoveItem(order: OrderRecord, item: OrderItem, target: { targetOrderId?: string; targetTableId?: string }, qty: number) {
    if (!item.lineId || (!target.targetOrderId && !target.targetTableId)) return;
    const q = correctionQty(item, qty);
    try {
      setCorrectingLineKey(`${order.id}:${item.lineId}`);
      await moveOrderItem({
        orderId: order.id,
        lineId: item.lineId,
        payload: {
          ...target,
          ...(q < item.quantity ? { quantity: q } : {}),
        },
      }).unwrap();
      showSuccess("Item moved");
      refetchOrders();
    } catch (e) { showError(getErrorMessage(e)); }
    finally { setCorrectingLineKey(null); }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      {/* <div className="flex  items-center justify-between gap-3 rounded-2xl border border-[#e8e0d0] bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#2563eb" strokeWidth="2">
              <circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="9" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Live Orders</p>
            <p className="text-xs text-slate-500">All active orders — update status, serve, invoice</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge connected={socketConnected} />
          <button type="button" onClick={() => { refetchOrders(); refetchInvoices(); }}
            className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
            Refresh
          </button>
        </div>
      </div> */}
      <div className="flex items-center justify-between">
         <LiveBadge connected={socketConnected} />
          <button type="button" onClick={() => { refetchOrders(); refetchInvoices(); }}
            className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
            Refresh
          </button>
      </div>

      {/* Stats bar */}
      
      {/* <div className="flex flex-wrap gap-2">
        <StatPill label="Kitchen" count={cookingCount} color="border-rose-200 bg-rose-50 text-rose-800" />
        <StatPill label="Ready" count={readyCount} color="border-emerald-200 bg-emerald-50 text-emerald-800" />
        <StatPill label="Billing" count={billingCount} color="border-sky-200 bg-sky-50 text-sky-800" />
        <StatPill label="Dine-In" count={dineInOrders.length} color="border-amber-200 bg-amber-50 text-amber-800" />
        <StatPill label="Takeaway" count={takeawayOrders.length} color="border-violet-200 bg-violet-50 text-violet-800" />
      </div> */}
      <div className="overflow-x-auto no-scrollbar sm:overflow-visible">
  <div className="flex gap-2 min-w-max sm:min-w-0 sm:flex-wrap">
    <StatPill label="Kitchen" count={cookingCount} color="border-rose-200 bg-rose-50 text-rose-800" />
    <StatPill label="Ready" count={readyCount} color="border-emerald-200 bg-emerald-50 text-emerald-800" />
    <StatPill label="Billing" count={billingCount} color="border-sky-200 bg-sky-50 text-sky-800" />
    <StatPill label="Dine-In" count={dineInOrders.length} color="border-amber-200 bg-amber-50 text-amber-800" />
    <StatPill label="Takeaway" count={takeawayOrders.length} color="border-violet-200 bg-violet-50 text-violet-800" />
  </div>
</div>

      {/* Orders list — all in one */}
      {activeOrders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 py-16 text-center">
          <svg viewBox="0 0 48 48" className="h-12 w-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="8" y="10" width="32" height="28" rx="3" />
            <path d="M16 20h16M16 26h10" />
          </svg>
          <p className="text-sm font-semibold text-slate-500">No active orders right now</p>
          <p className="text-xs text-slate-400">New orders will appear here automatically</p>
        </div>
      ) : (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3 pb-4">
            {activeOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                allOrders={allOrders}
                tables={tables}
                servingItemKey={servingItemKey}
                correctingLineKey={correctingLineKey}
                correctionQuantities={correctionQuantities}
                creatingInvoiceOrderId={creatingInvoiceOrderId}
                processingOrderKey={processingOrderKey}
                onMarkItemServed={handleMarkItemServed}
                onMarkReadyAll={handleMarkReadyAll}
                onAdvanceOrder={handleAdvanceOrder}
                onDeleteOrder={handleDeleteOrder}
                onRemoveItem={handleRemoveItem}
                onCancelItem={handleCancelItem}
                onMoveItem={handleMoveItem}
                onCreateInvoice={handleCreateInvoice}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
