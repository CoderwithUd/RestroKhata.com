"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/confirm-provider";
import { getErrorMessage } from "@/lib/error";
import { showError, showInfo, showSuccess } from "@/lib/feedback";
import { useOrderSocket } from "@/lib/use-order-socket";
import {
  useCancelOrderItemMutation,
  useCreateOrderMutation,
  useDeleteOrderMutation,
  useGetKitchenOrderItemsQuery,
  useGetOrdersQuery,
  useMoveOrderItemMutation,
  useRemoveOrderItemMutation,
  useUpdateOrderMutation,
} from "@/store/api/ordersApi";
import {
  useCreateInvoiceMutation,
  useGetInvoicesQuery,
} from "@/store/api/invoicesApi";
import { useGetTablesQuery } from "@/store/api/tablesApi";
import { useGetMenuAggregateQuery } from "@/store/api/menuApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthToken } from "@/store/slices/authSlice";
import type {
  KitchenQueueItem,
  OrderItem,
  OrderRecord,
  OrderStatus,
} from "@/store/types/orders";
import type { TableRecord } from "@/store/types/tables";
import type { MenuItemRecord, MenuVariantRecord } from "@/store/types/menu";

// ─── Role ────────────────────────────────────────────────────────────────────
type RoleKey = "owner" | "manager" | "waiter" | "kitchen";

function normalizeRole(raw?: string): RoleKey {
  const r = (raw || "").toLowerCase().trim();
  if (r.includes("owner") || r.includes("admin")) return "owner";
  if (r.includes("waiter") || r.includes("server") || r.includes("captain"))
    return "waiter";
  if (r.includes("kitchen") || r.includes("chef") || r.includes("cook"))
    return "kitchen";
  return "manager";
}

function normalizeStatus(status?: string): string {
  return (status || "").toUpperCase();
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

type OrderCartSummaryEntry = {
  key: string;
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  unitPrice: number;
  existingQuantity: number;
  addedQuantity: number;
  note?: string;
};

type OptionalCustomerDetails = {
  customerName: string;
  customerPhone: string;
};

type PendingOrderDraft = {
  cart: CartEntry[];
  tableNote: string;
};

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  PLACED: "Placed",
  IN_PROGRESS: "Cooking",
  READY: "Ready",
  SERVED: "Served",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function statusBadgeClass(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "PLACED") return "bg-amber-100 text-amber-800 border-amber-300";
  if (s === "IN_PROGRESS") return "bg-red-100 text-red-800 border-red-300";
  if (s === "READY")
    return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (s === "SERVED") return "bg-blue-100 text-blue-800 border-blue-300";
  if (s === "CANCELLED") return "bg-slate-100 text-slate-500 border-slate-300";
  return "bg-slate-100 text-slate-600 border-slate-300";
}

function tableStatusClass(status?: string): string {
  const s = (status || "AVAILABLE").toUpperCase();
  if (s === "OCCUPIED") return "border-amber-300 bg-amber-50 text-amber-800";
  if (s === "RESERVED") return "border-blue-300 bg-blue-50 text-blue-800";
  if (s === "AVAILABLE")
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function fmtCurrency(n?: number): string {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function timeAgo(value?: string | number): string {
  if (value == null) return "";
  const timestamp =
    typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diff = Math.floor((Date.now() - timestamp) / 60000);
  if (diff < 1) return "just now";
  if (diff === 1) return "1 min ago";
  if (diff < 60) return `${diff} min ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

function sortOrdersByLatest(orders: OrderRecord[]): OrderRecord[] {
  return [...orders].sort((left, right) => {
    const a = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const b = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return b - a;
  });
}

function canGenerateInvoiceForStatus(status?: string): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "READY" || normalized === "SERVED";
}

function isOrderActiveForTable(status?: string): boolean {
  return ["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(
    normalizeStatus(status),
  );
}

type OrderItemDelta = {
  key: string;
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  quantityAdded: number;
};

type OrderAppendSignal = {
  detectedAt: number;
  totalAddedQty: number;
  items: OrderItemDelta[];
  byItemKey: Record<string, OrderItemDelta>;
};

function orderItemKey(
  item: Pick<OrderItem, "itemId" | "variantId" | "lineId">,
): string {
  if (item.lineId) return `line::${item.lineId}`;
  return `${item.itemId}::${item.variantId || "base"}`;
}

function itemStatusLabel(status?: string): string {
  const normalized = normalizeStatus(status);
  if (!normalized) return "Pending";
  return STATUS_LABELS[normalized] || normalized.replace(/_/g, " ");
}

function itemStatusClass(status?: string): string {
  const normalized = normalizeStatus(status);
  if (!normalized || normalized === "PLACED")
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "IN_PROGRESS")
    return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "READY")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "SERVED")
    return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized === "CANCELLED")
    return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function nextKitchenItemStatus(status?: string): OrderStatus | undefined {
  const normalized = normalizeStatus(status);
  if (normalized === "PLACED") return "IN_PROGRESS";
  if (normalized === "IN_PROGRESS") return "READY";
  return undefined;
}

function kitchenItemActionLabel(nextStatus?: OrderStatus): string {
  if (nextStatus === "IN_PROGRESS") return "Start";
  if (nextStatus === "READY") return "Ready";
  return "Done";
}

function nextServiceItemStatus(status?: string): OrderStatus | undefined {
  return normalizeStatus(status) === "READY" ? "SERVED" : undefined;
}

function nextOrderItemStatus(
  status?: string,
  role?: RoleKey,
): OrderStatus | undefined {
  if (role === "waiter") return nextServiceItemStatus(status);

  const normalized = normalizeStatus(status);
  if (normalized === "PLACED") return "IN_PROGRESS";
  if (normalized === "IN_PROGRESS") return "READY";
  if (normalized === "READY") return "SERVED";
  return undefined;
}

function orderItemActionLabel(nextStatus?: OrderStatus): string {
  if (nextStatus === "IN_PROGRESS") return "Start";
  if (nextStatus === "READY") return "Ready";
  if (nextStatus === "SERVED") return "Serve";
  return "Update";
}

function orderItemActionKey(
  orderId: string,
  lineId?: string,
  nextStatus?: OrderStatus,
): string {
  return `${orderId}:${lineId || "missing"}:${nextStatus || "none"}`;
}

function orderBatchActionKey(orderId: string, nextStatus: OrderStatus): string {
  return `${orderId}:batch:${nextStatus}`;
}

function activeOrderItems(order: OrderRecord): OrderItem[] {
  return (order.items || []).filter(
    (item) => normalizeStatus(item.status) !== "CANCELLED",
  );
}

function correctionQty(item: OrderItem, value?: number): number {
  if (!(item.quantity > 0)) return 1;
  if (!value || !Number.isFinite(value)) return 1;
  return Math.min(Math.max(1, Math.floor(value)), item.quantity);
}

function canCorrectOrderItemStatus(status?: string): boolean {
  return ["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(
    normalizeStatus(status),
  );
}

function getServeableReadyItems(order: OrderRecord): OrderItem[] {
  return activeOrderItems(order).filter(
    (item) => Boolean(item.lineId) && normalizeStatus(item.status) === "READY",
  );
}

function availableMenuVariants(item: MenuItemRecord): MenuVariantRecord[] {
  const available = (item.variants || []).filter(
    (variant) => variant.isAvailable,
  );
  return available.length ? available : item.variants || [];
}

function orderCustomerLabel(
  order: Pick<OrderRecord, "customerName" | "customerPhone">,
): string | null {
  if (!order.customerName && !order.customerPhone) return null;
  if (order.customerName && order.customerPhone)
    return `${order.customerName} | ${order.customerPhone}`;
  return order.customerName || order.customerPhone || null;
}

function kitchenCustomerLabel(
  item: Pick<KitchenQueueItem, "customerName" | "customerPhone">,
): string | null {
  if (!item.customerName && !item.customerPhone) return null;
  if (item.customerName && item.customerPhone)
    return `${item.customerName} | ${item.customerPhone}`;
  return item.customerName || item.customerPhone || null;
}

function kitchenDisplayNote(item: Pick<KitchenQueueItem, "note" | "orderNote">): string | null {
  return item.note || item.orderNote || null;
}

function normalizePhoneInput(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function validateOptionalCustomer(details: OptionalCustomerDetails): string | null {
  const customerName = details.customerName.trim();
  const customerPhone = normalizePhoneInput(details.customerPhone.trim());

  if (!customerName && !customerPhone) return null;
  if (!customerName || !customerPhone)
    return "Customer name and phone dono saath me do, ya dono blank chhodo.";

  const digitCount = customerPhone.replace(/\D/g, "").length;
  if (digitCount < 7 || digitCount > 15)
    return "Customer phone me 7 se 15 digits hone chahiye.";

  return null;
}

function mergeOrdersById(
  current: OrderRecord[],
  incoming: OrderRecord[],
): OrderRecord[] {
  const map = new Map<string, OrderRecord>();
  current.forEach((order) => map.set(order.id, order));
  incoming.forEach((order) => map.set(order.id, order));
  return Array.from(map.values()).sort((left, right) => {
    const a = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const b = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return b - a;
  });
}

function toTimestamp(value?: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildAppendSignals(
  orders: OrderRecord[],
): Record<string, OrderAppendSignal> {
  const signals: Record<string, OrderAppendSignal> = {};

  for (const order of orders) {
    const orderCreatedAt = toTimestamp(order.createdAt);
    const orderUpdatedAt = toTimestamp(order.updatedAt) || orderCreatedAt;
    const orderStatus = normalizeStatus(order.status);
    const appendItems: OrderItemDelta[] = [];
    let latestItemTimestamp = orderUpdatedAt || 0;

    for (const item of order.items || []) {
      const key = orderItemKey(item);
      const itemTimestamp = toTimestamp(item.createdAt || item.updatedAt);
      if (itemTimestamp && itemTimestamp > latestItemTimestamp)
        latestItemTimestamp = itemTimestamp;

      const isLikelyLaterItem =
        orderCreatedAt != null &&
        itemTimestamp != null &&
        itemTimestamp - orderCreatedAt >= 60 * 1000;
      const isPendingInRunningOrder =
        ["IN_PROGRESS", "READY", "SERVED"].includes(orderStatus) &&
        normalizeStatus(item.status) === "PLACED";

      if (!isLikelyLaterItem && !isPendingInRunningOrder) continue;

      appendItems.push({
        key,
        itemId: item.itemId,
        variantId: item.variantId,
        name: item.name,
        variantName: item.variantName,
        quantityAdded: item.quantity || 0,
      });
    }

    if (!appendItems.length) continue;

    const byItemKey = appendItems.reduce<Record<string, OrderItemDelta>>(
      (accumulator, item) => {
        accumulator[item.key] = item;
        return accumulator;
      },
      {},
    );

    signals[order.id] = {
      detectedAt: latestItemTimestamp || orderUpdatedAt || 0,
      totalAddedQty: appendItems.reduce(
        (sum, item) => sum + item.quantityAdded,
        0,
      ),
      items: appendItems,
      byItemKey,
    };
  }

  return signals;
}

// ─── Tiny reusable components ─────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ─── Live socket badge ────────────────────────────────────────────────────────
function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
        connected
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
        }`}
      />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

// ─── Waiter Step 1 — Table Grid ───────────────────────────────────────────────
function TableGrid({
  tables,
  orders,
  invoicedOrderIds,
  issuedInvoiceTableIds,
  appendSignals,
  onSelectTable,
}: {
  tables: TableRecord[];
  orders: OrderRecord[];
  invoicedOrderIds: Set<string>;
  issuedInvoiceTableIds: Set<string>;
  appendSignals: Record<string, OrderAppendSignal>;
  onSelectTable: (table: TableRecord) => void;
}) {
  const activeOrdersByTable = useMemo(() => {
    const map: Record<string, OrderRecord[]> = {};
    for (const order of sortOrdersByLatest(orders)) {
      const tableId = order.table?.id || order.tableId;
      if (
        !tableId ||
        invoicedOrderIds.has(order.id) ||
        !isOrderActiveForTable(order.status)
      )
        continue;
      if (!map[tableId]) map[tableId] = [];
      map[tableId].push(order);
    }
    return map;
  }, [invoicedOrderIds, orders]);

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500">
        Tap a table to create a new order or continue any running order
      </p>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {tables.map((table) => {
          const tableOrders = activeOrdersByTable[table.id] || [];
          const latestOrder = tableOrders[0];
          const hasOrder = tableOrders.length > 0;
          const billingLocked = issuedInvoiceTableIds.has(table.id);
          const readyCount = tableOrders.filter((order) =>
            canGenerateInvoiceForStatus(order.status),
          ).length;
          const qrCount = tableOrders.filter(
            (order) => normalizeStatus(order.source) === "QR",
          ).length;
          const appendSignal = latestOrder
            ? appendSignals[latestOrder.id]
            : undefined;
          const visualStatus = hasOrder ? "OCCUPIED" : table.status;
          return (
            <div
              key={table.id}
              className={`flex aspect-square flex-col rounded-2xl border-2 text-center text-xs font-semibold ${tableStatusClass(visualStatus)}`}
            >
              <button
                type="button"
                onClick={() => {
                  if (!billingLocked) onSelectTable(table);
                }}
                disabled={billingLocked}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-t-[calc(1rem-2px)] px-1 transition active:scale-95 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="text-base font-bold">T{table.number}</span>
                <span className="text-[10px] opacity-70">
                  {table.capacity}p
                </span>
                {billingLocked ? (
                  <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    Billing
                  </span>
                ) : hasOrder ? (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {tableOrders.length} active
                  </span>
                ) : (
                  <span className="mt-0.5 text-[9px] opacity-60">
                    {(table.status || "available").toLowerCase()}
                  </span>
                )}
              </button>
              {billingLocked ? (
                <div className="px-1 pb-1">
                  <span className="block w-full rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                    Invoice Issued
                  </span>
                </div>
              ) : appendSignal ? (
                <div className="px-1 pb-1">
                  <span className="block w-full rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">
                    +{appendSignal.totalAddedQty} new
                  </span>
                </div>
              ) : hasOrder ? (
                <div className="px-1 pb-1">
                  <span className="block w-full rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                    {readyCount > 0
                      ? `${readyCount} ready`
                      : STATUS_LABELS[latestOrder?.status || ""] || "Running"}
                    {qrCount > 0 ? ` | ${qrCount} QR` : ""}
                  </span>
                </div>
              ) : null}
            </div>
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
  tableOrders,
  existingOrder,
  composeMode,
  selectedOrderId,
  onComposeModeChange,
  onSelectedOrderIdChange,
  servingItemKey,
  onServeExistingOrderItem,
  onServeReadyItems,
  onBack,
  onConfirm,
}: {
  table: TableRecord;
  tableOrders: OrderRecord[];
  existingOrder?: OrderRecord;
  composeMode: "append-latest" | "append-specific" | "force-new";
  selectedOrderId?: string | null;
  onComposeModeChange: (
    mode: "append-latest" | "append-specific" | "force-new",
  ) => void;
  onSelectedOrderIdChange: (orderId: string) => void;
  servingItemKey?: string | null;
  onServeExistingOrderItem: (order: OrderRecord, item: OrderItem) => void;
  onServeReadyItems: (order: OrderRecord) => void;
  onBack: () => void;
  onConfirm: (cart: CartEntry[], tableNote: string) => void;
}) {
  const { data: menuData, isLoading: menuLoading } = useGetMenuAggregateQuery({
    isAvailable: true,
  });
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [search, setSearch] = useState("");
  const [tableNote, setTableNote] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string | undefined>
  >({});
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
      ? allItems.filter((i) =>
          i.name.toLowerCase().includes(search.toLowerCase().trim()),
        )
      : allItems;

    if (!activeCat || search.trim()) return bySearch;
    return bySearch.filter((i) => {
      for (const cat of categories) {
        if (cat.id === activeCat)
          return (
            cat.items.some((ci) => ci.id === i.id) ||
            cat.children?.some((s) => s.items.some((si) => si.id === i.id))
          );
        for (const sub of cat.children || []) {
          if (sub.id === activeCat)
            return sub.items.some((si) => si.id === i.id);
        }
      }
      return false;
    });
  }, [allItems, activeCat, search, categories]);

  const cartTotal = useMemo(
    () => cart.reduce((s, e) => s + e.unitPrice * e.quantity, 0),
    [cart],
  );
  const readyExistingItems = useMemo(
    () => (existingOrder ? getServeableReadyItems(existingOrder) : []),
    [existingOrder],
  );
  const existingOrderTotal = useMemo(() => {
    if (!existingOrder) return 0;
    if (typeof existingOrder.grandTotal === "number")
      return existingOrder.grandTotal;
    return activeOrderItems(existingOrder).reduce(
      (sum, item) => sum + (item.lineTotal ?? item.unitPrice * item.quantity),
      0,
    );
  }, [existingOrder]);
  const summaryEntries = useMemo(() => {
    const map = new Map<string, OrderCartSummaryEntry>();

    for (const item of existingOrder?.items || []) {
      if (normalizeStatus(item.status) === "CANCELLED") continue;
      const key = `${item.itemId}::${item.variantId || "base"}`;
      const existing = map.get(key);
      if (existing) {
        existing.existingQuantity += item.quantity;
        if (!existing.note && item.note) existing.note = item.note;
      } else {
        map.set(key, {
          key,
          itemId: item.itemId,
          variantId: item.variantId,
          name: item.name,
          variantName: item.variantName,
          unitPrice: item.unitPrice,
          existingQuantity: item.quantity,
          addedQuantity: 0,
          note: item.note,
        });
      }
    }

    for (const item of cart) {
      const key = `${item.itemId}::${item.variantId || "base"}`;
      const existing = map.get(key);
      if (existing) {
        existing.addedQuantity += item.quantity;
        if (!existing.note && item.note) existing.note = item.note;
      } else {
        map.set(key, {
          key,
          itemId: item.itemId,
          variantId: item.variantId,
          name: item.name,
          variantName: item.variantName,
          unitPrice: item.unitPrice,
          existingQuantity: 0,
          addedQuantity: item.quantity,
          note: item.note,
        });
      }
    }

    return Array.from(map.values());
  }, [cart, existingOrder]);
  const summaryTotal = existingOrderTotal + cartTotal;
  const summaryCount = useMemo(
    () =>
      summaryEntries.reduce(
        (sum, entry) => sum + entry.existingQuantity + entry.addedQuantity,
        0,
      ),
    [summaryEntries],
  );

  function getQty(itemId: string, variantId?: string): number {
    return (
      cart.find((e) => e.itemId === itemId && e.variantId === variantId)
        ?.quantity ?? 0
    );
  }

  function resolveSelectedVariant(
    item: MenuItemRecord,
  ): MenuVariantRecord | undefined {
    const variants = availableMenuVariants(item);
    if (!variants.length) return undefined;
    return (
      variants.find((variant) => variant.id === selectedVariants[item.id]) ||
      variants[0]
    );
  }

  function setItemVariant(itemId: string, variantId?: string) {
    setSelectedVariants((prev) => ({ ...prev, [itemId]: variantId }));
  }

  function addItem(item: MenuItemRecord, forcedVariantId?: string) {
    const variants = availableMenuVariants(item);
    const variant =
      variants.find((entry) => entry.id === forcedVariantId) ||
      variants.find((entry) => entry.id === selectedVariants[item.id]) ||
      variants[0];
    const variantId = variant?.id;
    const price = variant?.price ?? item.price ?? 0;
    setCart((prev) => {
      const idx = prev.findIndex(
        (e) => e.itemId === item.id && e.variantId === variantId,
      );
      if (idx >= 0) {
        return prev.map((e, i) =>
          i === idx ? { ...e, quantity: e.quantity + 1 } : e,
        );
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

  function incrementCartEntry(itemId: string, variantId?: string) {
    setCart((prev) =>
      prev.map((entry) =>
        entry.itemId === itemId && entry.variantId === variantId
          ? { ...entry, quantity: entry.quantity + 1 }
          : entry,
      ),
    );
  }

  function removeItem(itemId: string, variantId?: string) {
    setCart((prev) => {
      const idx = prev.findIndex(
        (e) => e.itemId === itemId && e.variantId === variantId,
      );
      if (idx < 0) return prev;
      const entry = prev[idx];
      if (entry.quantity <= 1) return prev.filter((_, i) => i !== idx);
      return prev.map((e, i) =>
        i === idx ? { ...e, quantity: e.quantity - 1 } : e,
      );
    });
  }

  function addFromExisting(orderItem: OrderRecord["items"][number]) {
    setCart((prev) => {
      const idx = prev.findIndex(
        (entry) =>
          entry.itemId === orderItem.itemId &&
          entry.variantId === orderItem.variantId,
      );
      if (idx >= 0) {
        return prev.map((entry, i) =>
          i === idx ? { ...entry, quantity: entry.quantity + 1 } : entry,
        );
      }
      return [
        ...prev,
        {
          itemId: orderItem.itemId,
          variantId: orderItem.variantId,
          name: orderItem.name,
          variantName: orderItem.variantName,
          unitPrice: orderItem.unitPrice,
          quantity: 1,
        },
      ];
    });
  }

  function extraQtyForExisting(
    orderItem: OrderRecord["items"][number],
  ): number {
    return (
      cart.find(
        (entry) =>
          entry.itemId === orderItem.itemId &&
          entry.variantId === orderItem.variantId,
      )?.quantity ?? 0
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-1 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold">
            Table {table.number} — {table.name}
          </p>
          <p className="text-xs text-slate-500">
            {tableOrders.length === 0
              ? "No running order on this table"
              : `${tableOrders.length} running order${tableOrders.length === 1 ? "" : "s"} on this table`}
          </p>
        </div>
        {/* Mobile cart btn */}
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="relative flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 md:hidden"
        >
          🛒{" "}
          {summaryCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {summaryCount}
            </span>
          )}
          {fmtCurrency(summaryTotal)}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 pt-3">
        {/* Left: categories + items */}
        <div className="flex min-w-0 flex-1 flex-col">
          {tableOrders.length > 0 ? (
            <div className="mb-2 rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Order target
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Choose where new items should go
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onComposeModeChange("append-latest")}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      composeMode === "append-latest"
                        ? "border-amber-300 bg-amber-100 text-amber-900"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    Add to latest
                  </button>
                  <button
                    type="button"
                    onClick={() => onComposeModeChange("append-specific")}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      composeMode === "append-specific"
                        ? "border-amber-300 bg-amber-100 text-amber-900"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    Pick order
                  </button>
                  <button
                    type="button"
                    onClick={() => onComposeModeChange("force-new")}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      composeMode === "force-new"
                        ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    Start new
                  </button>
                </div>
              </div>
              {composeMode === "append-specific" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tableOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => onSelectedOrderIdChange(order.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-[11px] font-semibold ${
                        selectedOrderId === order.id
                          ? "border-amber-300 bg-amber-50 text-amber-900"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {order.orderNumber
                        ? `#${order.orderNumber}`
                        : `Order ${order.id.slice(-4)}`}
                      {` • ${STATUS_LABELS[normalizeStatus(order.status)] || order.status}`}
                      {order.customerName ? ` • ${order.customerName}` : ""}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {existingOrder && existingOrder.items.length > 0 ? (
            <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-amber-800">
                  Target order items (tap +1 to add quickly)
                </p>
                {existingOrder && readyExistingItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onServeReadyItems(existingOrder)}
                    disabled={
                      servingItemKey ===
                      orderBatchActionKey(existingOrder.id, "SERVED")
                    }
                    className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-900 disabled:opacity-50"
                  >
                    {servingItemKey ===
                    orderBatchActionKey(existingOrder.id, "SERVED")
                      ? "Serving..."
                      : readyExistingItems.length === 1
                        ? "Serve Ready Item"
                        : `Serve Ready (${readyExistingItems.length})`}
                  </button>
                ) : null}
              </div>
              <div className="space-y-1.5">
                {existingOrder.items.map((orderItem, index) => {
                  const extra = extraQtyForExisting(orderItem);
                  const itemNextStatus = nextServiceItemStatus(
                    orderItem.status,
                  );
                  const itemActionKey = orderItem.lineId
                    ? orderItemActionKey(
                        existingOrder.id,
                        orderItem.lineId,
                        itemNextStatus,
                      )
                    : null;
                  return (
                    <div
                      key={`${orderItem.itemId}-${orderItem.variantId || "base"}-${index}`}
                      className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">
                          {orderItem.name}
                          {orderItem.variantName
                            ? ` (${orderItem.variantName})`
                            : ""}
                        </p>
                        <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                          <span>
                            Current: {orderItem.quantity}
                            {extra > 0 ? `  |  Adding: +${extra}` : ""}
                          </span>
                          <span
                            className={`rounded-full border px-1.5 py-0.5 font-semibold ${itemStatusClass(orderItem.status)}`}
                          >
                            {itemStatusLabel(orderItem.status)}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {existingOrder && orderItem.lineId && itemNextStatus ? (
                          <button
                            type="button"
                            onClick={() =>
                              onServeExistingOrderItem(existingOrder, orderItem)
                            }
                            disabled={servingItemKey === itemActionKey}
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 disabled:opacity-50"
                          >
                            {servingItemKey === itemActionKey ? "..." : "Serve"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => addFromExisting(orderItem)}
                          className="rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold text-white"
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Search */}
          <div className="relative mb-2">
            <svg
              viewBox="0 0 24 24"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" />
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
                <div className="py-12 text-center text-sm text-slate-500">
                  No items found
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 px-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {displayedItems.map((item) => {
                    const variants = availableMenuVariants(item);
                    const selectedVariant = resolveSelectedVariant(item);
                    const variantId = selectedVariant?.id;
                    const price = selectedVariant?.price ?? item.price ?? 0;
                    const qty = getQty(item.id, variantId);
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-3 shadow-sm transition ${qty > 0 ? "border-amber-300 bg-amber-50/70 shadow-amber-100" : "border-slate-200 bg-white"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug text-slate-900 line-clamp-2">
                              {item.name}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-amber-700">
                              {fmtCurrency(price)}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {item.catName}
                            </p>
                          </div>
                          {qty > 0 ? (
                            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                              {qty} in cart
                            </span>
                          ) : null}
                        </div>
                        {variants.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              {variants.length > 1
                                ? "Choose variant"
                                : "Variant"}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {variants.map((variant) => {
                                const active = variant.id === variantId;
                                const variantQty = getQty(item.id, variant.id);
                                return (
                                  <button
                                    key={variant.id}
                                    type="button"
                                    onClick={() =>
                                      setItemVariant(item.id, variant.id)
                                    }
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                      active
                                        ? "border-amber-400 bg-amber-100 text-amber-900"
                                        : "border-slate-200 bg-white text-slate-600"
                                    }`}
                                  >
                                    {variant.name} |{" "}
                                    {fmtCurrency(variant.price)}
                                    {variantQty > 0 ? ` (${variantQty})` : ""}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-slate-500">
                              Selected
                            </p>
                            <p className="truncate text-xs text-slate-700">
                              {selectedVariant?.name || "Regular"}
                            </p>
                          </div>
                          {qty === 0 ? (
                            <button
                              type="button"
                              onClick={() => addItem(item, variantId)}
                              className="min-w-[112px] rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white active:scale-95"
                            >
                              Add to Cart
                            </button>
                          ) : (
                            <div className="flex min-w-[112px] items-center justify-between gap-1 rounded-xl border border-amber-200 bg-white px-1 py-1">
                              <button
                                type="button"
                                onClick={() => removeItem(item.id, variantId)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 font-bold"
                              >
                                −
                              </button>
                              <span className="text-sm font-bold text-amber-700">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => addItem(item, variantId)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white font-bold"
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
            {existingOrder && existingOrder.items.length > 0 ? (
              <div className="mb-3 space-y-2 border-b border-slate-100 pb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Current order
                </p>
                {summaryEntries
                  .filter((entry) => entry.existingQuantity > 0)
                  .map((entry) => (
                    <div
                      key={`existing-${entry.key}`}
                      className="flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-xs font-medium text-slate-800">
                          {entry.name}
                        </p>
                        {entry.variantName ? (
                          <p className="text-[10px] text-slate-400">
                            {entry.variantName}
                          </p>
                        ) : null}
                        <p className="text-[10px] text-slate-500">
                          {fmtCurrency(entry.unitPrice)} x{" "}
                          {entry.existingQuantity}
                          {entry.addedQuantity > 0
                            ? ` | Adding +${entry.addedQuantity}`
                            : ""}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">
                        {fmtCurrency(
                          entry.unitPrice *
                            (entry.existingQuantity + entry.addedQuantity),
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            ) : null}
            {existingOrder && existingOrder.items.length > 0 ? (
              <div className="mb-4 max-h-48 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Current order
                </p>
                {summaryEntries
                  .filter((entry) => entry.existingQuantity > 0)
                  .map((entry) => (
                    <div
                      key={`mobile-existing-${entry.key}`}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {entry.name}
                        </p>
                        {entry.variantName ? (
                          <p className="text-[11px] text-slate-400">
                            {entry.variantName}
                          </p>
                        ) : null}
                        <p className="text-xs text-slate-500">
                          {fmtCurrency(entry.unitPrice)} x{" "}
                          {entry.existingQuantity}
                          {entry.addedQuantity > 0
                            ? ` | Adding +${entry.addedQuantity}`
                            : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-slate-700">
                        {fmtCurrency(
                          entry.unitPrice *
                            (entry.existingQuantity + entry.addedQuantity),
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            ) : null}
            {cart.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                {existingOrder ? "No new items added yet" : "Tap items to add"}
              </p>
            ) : (
              <div className="space-y-2">
                {cart.map((entry) => (
                  <div
                    key={`${entry.itemId}-${entry.variantId}`}
                    className="flex items-start gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 line-clamp-1">
                        {entry.name}
                      </p>
                      {entry.variantName && (
                        <p className="text-[10px] text-slate-400">
                          {entry.variantName}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        {fmtCurrency(entry.unitPrice)} × {entry.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          removeItem(entry.itemId, entry.variantId)
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-xs text-slate-600"
                      >
                        −
                      </button>
                      <span className="text-xs font-bold w-4 text-center">
                        {entry.quantity}
                      </span>
                      <button
                        onClick={() =>
                          incrementCartEntry(entry.itemId, entry.variantId)
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500 text-xs text-white"
                      >
                        +
                      </button>
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
              <span className="text-amber-700">
                {fmtCurrency(summaryTotal)}
              </span>
            </div>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => onConfirm(cart, tableNote)}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white shadow-md shadow-amber-200 disabled:opacity-40 active:scale-95 transition"
            >
              {composeMode === "force-new" ? "Create New Order" : "Add Items"}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile cart drawer */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col md:hidden"
          onClick={() => setCartOpen(false)}
        >
          <div className="flex-1 bg-black/40" />
          <div
            className="rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-bold">Cart — Table {table.number}</p>
              <button
                onClick={() => setCartOpen(false)}
                className="text-slate-400"
              >
                ✕
              </button>
            </div>
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {existingOrder
                  ? "No new items added yet"
                  : "Nothing in cart yet"}
              </p>
            ) : (
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {cart.map((entry) => (
                  <div
                    key={`${entry.itemId}-${entry.variantId}`}
                    className="flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {fmtCurrency(entry.unitPrice)} × {entry.quantity} ={" "}
                        {fmtCurrency(entry.unitPrice * entry.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          removeItem(entry.itemId, entry.variantId)
                        }
                        className="h-7 w-7 rounded-lg border border-slate-200 text-sm font-bold"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-sm font-bold">
                        {entry.quantity}
                      </span>
                      <button
                        onClick={() =>
                          incrementCartEntry(entry.itemId, entry.variantId)
                        }
                        className="h-7 w-7 rounded-lg bg-amber-500 text-sm font-bold text-white"
                      >
                        +
                      </button>
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
              <span className="text-amber-700">
                {fmtCurrency(summaryTotal)}
              </span>
            </div>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => {
                setCartOpen(false);
                onConfirm(cart, tableNote);
              }}
              className="mt-3 w-full rounded-2xl bg-amber-500 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-200 disabled:opacity-40"
            >
              {composeMode === "force-new" ? "Create New Order" : "Add Items"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Waiter View ──────────────────────────────────────────────────────────────
type WaiterStep = "tables" | "menu" | "placing";
type WaiterComposerMode = "append-latest" | "append-specific" | "force-new";
type MoveTargetSelection = {
  targetOrderId?: string;
  targetTableId?: string;
};

function WaiterActionBoard({
  orders,
  allOrders,
  tables,
  appendSignals,
  servingOrderId,
  servingItemKey,
  creatingInvoiceOrderId,
  onMarkServed,
  onMarkItemServed,
  onMarkReadyItemsServed,
  onCreateInvoice,
  correctingLineKey,
  correctionQuantities,
  onCorrectionQuantityChange,
  onRemovePlacedItem,
  onCancelPlacedItem,
  onMovePlacedItem,
  className,
}: {
  orders: OrderRecord[];
  allOrders: OrderRecord[];
  tables: TableRecord[];
  appendSignals: Record<string, OrderAppendSignal>;
  servingOrderId?: string | null;
  servingItemKey?: string | null;
  creatingInvoiceOrderId?: string | null;
  onMarkServed: (order: OrderRecord) => void;
  onMarkItemServed: (order: OrderRecord, item: OrderItem) => void;
  onMarkReadyItemsServed: (order: OrderRecord) => void;
  onCreateInvoice: (order: OrderRecord) => void;
  correctingLineKey?: string | null;
  correctionQuantities: Record<string, number>;
  onCorrectionQuantityChange: (lineKey: string, quantity: number) => void;
  onRemovePlacedItem: (
    order: OrderRecord,
    item: OrderItem,
    quantity: number,
  ) => void;
  onCancelPlacedItem: (order: OrderRecord, item: OrderItem) => void;
  onMovePlacedItem: (
    order: OrderRecord,
    item: OrderItem,
    target: MoveTargetSelection,
    quantity: number,
  ) => void;
  className?: string;
}) {
  const readyCount = orders.filter(
    (order) => normalizeStatus(order.status) === "READY",
  ).length;
  const billingCount = orders.filter((order) =>
    canGenerateInvoiceForStatus(order.status),
  ).length;
  const kitchenCount = orders.filter((order) =>
    ["PLACED", "IN_PROGRESS"].includes(normalizeStatus(order.status)),
  ).length;

  return (
    <div className={`${className || "mt-4"} space-y-2.5`}>
     <div className="flex gap-1.5">

  {/* Ready to Serve */}
  <div className="flex flex-1 flex-col gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5 min-w-0">
    <div className="flex items-center gap-1.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="#16a34a" strokeWidth="2.5">
          <polyline points="2,9 6,13 14,3" />
        </svg>
      </div>
      <p className="truncate text-[clamp(9px,2.2vw,11px)] font-medium text-emerald-700">
        Ready
      </p>
    </div>
    <p className="text-[clamp(20px,5vw,26px)] font-bold leading-none text-emerald-950 text-center">
      {readyCount}
    </p>
  </div>

  {/* Pending Invoice */}
  <div className="flex flex-1 flex-col gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 p-2.5 min-w-0">
    <div className="flex items-center gap-1.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100">
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="#d97706" strokeWidth="2">
          <rect x="2" y="4" width="12" height="9" rx="1.5" />
          <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
          <path d="M6 8h4M8 8v2" />
        </svg>
      </div>
      <p className="truncate text-[clamp(9px,2.2vw,11px)] font-medium text-amber-700">
        Invoice
      </p>
    </div>
    <p className="text-[clamp(20px,5vw,26px)] font-bold leading-none text-amber-950   text-center">
      {billingCount}
    </p>
  </div>

  {/* Kitchen Running */}
  <div className="flex flex-1 flex-col gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 p-2.5 min-w-0">
    <div className="flex items-center gap-1.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-100">
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="#e11d48" strokeWidth="2">
          <path d="M8 2C6 2 4 3.5 4 5.5c0 1.5 1 2.5 2 3v1h4v-1c1-.5 2-1.5 2-3C12 3.5 10 2 8 2z" />
          <path d="M6 12h4M7 14h2" />
        </svg>
      </div>
      <p className="truncate text-[clamp(9px,2.2vw,11px)] font-medium text-rose-700">
        Kitchen
      </p>
    </div>
    <p className="text-[clamp(20px,5vw,26px)] font-bold leading-none text-rose-950  text-center">
      {kitchenCount}
    </p>
  </div>

</div>

      <div className="rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50/60 to-white p-3 shadow-[0_12px_34px_rgba(15,23,42,0.06)] sm:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Live Service Queue
            </p>
            <p className="text-base font-bold text-slate-900">
              Waiter Action Board
            </p>
            {/* <p className="text-xs text-slate-500">
              Kitchen READY ko waiter yahin se SERVED karega, aur invoice bhi
              yahin se nikal sakta hai.
            </p> */}
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
            {orders.length} orders
          </span>
        </div>

        <div className="space-y-2">
          {orders.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/80 py-8 text-center text-sm text-slate-500">
              No waiter actions pending.
            </div>
          ) : (
            orders.map((order) => {
              const status = normalizeStatus(order.status);
              const readyItems = getServeableReadyItems(order);
              const openItemCount = activeOrderItems(order).length;
              const canServe = status === "READY";
              const canInvoice = canGenerateInvoiceForStatus(status);
              const appendSignal = appendSignals[order.id];
              const batchServeKey = orderBatchActionKey(order.id, "SERVED");
              const customerLabel = orderCustomerLabel(order);

              return (
                <div
                  key={order.id}
                  className="rounded-[22px] border border-slate-200/80 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm">
                          T{order.table?.number ?? "?"}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusBadgeClass(order.status)}`}
                        >
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-slate-900">
                        {order.table?.name ||
                          `Table ${order.table?.number ?? "-"}`}
                      </p>
                      {customerLabel ? (
                        <p className="mt-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                          Customer order: {customerLabel}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-slate-500">
                        {order.items.length} item(s) |{" "}
                        {fmtCurrency(order.grandTotal ?? order.subTotal)} |{" "}
                        {timeAgo(order.updatedAt || order.createdAt)}
                      </p>
                      {appendSignal ? (
                        <p className="mt-1 inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          +{appendSignal.totalAddedQty} newly added item qty
                        </p>
                      ) : null}
                    </div>
                    <div className="grid w-full gap-2 sm:w-[190px]">
                      {readyItems.length > 0 ? (
                        <button
                          type="button"
                          disabled={servingItemKey === batchServeKey}
                          onClick={() => onMarkReadyItemsServed(order)}
                          className="rounded-2xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {servingItemKey === batchServeKey
                            ? "Serving..."
                            : readyItems.length === openItemCount &&
                                openItemCount > 1
                              ? `Serve All (${readyItems.length})`
                              : readyItems.length === 1
                                ? "Serve Ready Item"
                                : `Serve Ready (${readyItems.length})`}
                        </button>
                      ) : canServe ? (
                        <button
                          type="button"
                          disabled={servingOrderId === order.id}
                          onClick={() => onMarkServed(order)}
                          className="rounded-2xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {servingOrderId === order.id
                            ? "Serving..."
                            : "Mark Served"}
                        </button>
                      ) : null}
                      {canInvoice ? (
                        <button
                          type="button"
                          disabled={creatingInvoiceOrderId === order.id}
                          onClick={() => onCreateInvoice(order)}
                          className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          {creatingInvoiceOrderId === order.id
                            ? "Generating..."
                            : "Generate Invoice"}
                        </button>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                          {status === "PLACED"
                            ? "Waiting for kitchen to start"
                            : "Kitchen cooking in progress"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2.5 space-y-1.5 rounded-2xl bg-slate-50/90 p-1.5">
                    {order.items.map((item, index) => {
                      const delta =
                        appendSignal?.byItemKey[orderItemKey(item)]
                          ?.quantityAdded ?? 0;
                      const itemNextStatus = nextServiceItemStatus(item.status);
                      const itemActionKey = item.lineId
                        ? orderItemActionKey(
                            order.id,
                            item.lineId,
                            itemNextStatus,
                          )
                        : null;
                      const correctionKey = item.lineId
                        ? `${order.id}:${item.lineId}`
                        : null;
                      const correctionValue = correctionQty(
                        item,
                        correctionKey
                          ? correctionQuantities[correctionKey]
                          : undefined,
                      );
                      const canCorrectItem =
                        Boolean(item.lineId) &&
                        canCorrectOrderItemStatus(item.status);
                      const moveTargets = allOrders.filter(
                        (candidate) =>
                          candidate.id !== order.id &&
                          (candidate.table?.id || candidate.tableId) ===
                            (order.table?.id || order.tableId) &&
                          ["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(
                            normalizeStatus(candidate.status),
                          ),
                      );
                      const tableTargets = tables.filter(
                        (table) =>
                          table.id !== (order.table?.id || order.tableId),
                      );
                      return (
                        
                        // <div
                        //   key={`${item.itemId}-${item.variantId || "base"}-${index}`}
                        //   className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs"
                        // >
                        //   <div className="flex flex-wrap items-start justify-between gap-2">
                        //     <div className="min-w-0">
                        //       <p className="font-medium text-slate-800">
                        //         {item.quantity}x {item.name}
                        //         {item.variantName
                        //           ? ` (${item.variantName})`
                        //           : ""}
                        //       </p>

                        //       {item.note ? (
                        //         <p className="text-[11px] italic text-amber-700">
                        //           {item.note}
                        //         </p>
                        //       ) : null}
                        //     </div>
                        //     <div className="flex shrink-0 items-center gap-1">
                        //       {delta > 0 ? (
                        //         <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                        //           +{delta} new
                        //         </span>
                        //       ) : null}
                        //       <span
                        //         className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${itemStatusClass(item.status)}`}
                        //       >
                        //         {itemStatusLabel(item.status)}
                        //       </span>
                        //       {canCorrectItem ? (
                        //         <>
                        //           {moveTargets.length > 0 ? (
                        //             <select
                        //               defaultValue=""
                        //               disabled={
                        //                 correctingLineKey === correctionKey
                        //               }
                        //               onChange={(event) => {
                        //                 const targetOrderId =
                        //                   event.target.value;
                        //                 if (!targetOrderId) return;
                        //                 onMovePlacedItem(
                        //                   order,
                        //                   item,
                        //                   { targetOrderId },
                        //                   correctionValue,
                        //                 );
                        //                 event.currentTarget.value = "";
                        //               }}
                        //               className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 disabled:opacity-50"
                        //             >
                        //               <option value="">Exchange</option>
                        //               {moveTargets.map((candidate) => (
                        //                 <option
                        //                   key={candidate.id}
                        //                   value={candidate.id}
                        //                 >
                        //                   #
                        //                   {candidate.orderNumber ||
                        //                     candidate.id.slice(-4)}
                        //                 </option>
                        //               ))}
                        //             </select>
                        //           ) : null}
                        //           {tableTargets.length > 0 ? (
                        //             <select
                        //               defaultValue=""
                        //               disabled={
                        //                 correctingLineKey === correctionKey
                        //               }
                        //               onChange={(event) => {
                        //                 const targetTableId =
                        //                   event.target.value;
                        //                 if (!targetTableId) return;
                        //                 onMovePlacedItem(
                        //                   order,
                        //                   item,
                        //                   { targetTableId },
                        //                   correctionValue,
                        //                 );
                        //                 event.currentTarget.value = "";
                        //               }}
                        //               className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 disabled:opacity-50"
                        //             >
                        //               <option value="">Exchange Table</option>
                        //               {tableTargets.map((table) => (
                        //                 <option key={table.id} value={table.id}>
                        //                   T{table.number}
                        //                 </option>
                        //               ))}
                        //             </select>
                        //           ) : null}
                        //           <button
                        //             type="button"
                        //             onClick={() =>
                        //               onRemovePlacedItem(
                        //                 order,
                        //                 item,
                        //                 correctionValue,
                        //               )
                        //             }
                        //             disabled={
                        //               correctingLineKey === correctionKey
                        //             }
                        //             className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 disabled:opacity-50"
                        //           >
                        //             {item.quantity > 1
                        //               ? `Reduce ${correctionValue}`
                        //               : "Remove Item"}
                              
                        //           </button>
                        //           <button
                        //             type="button"
                        //             title="Cancel Item"
                        //             onClick={() =>
                        //               onCancelPlacedItem(order, item)
                        //             }
                        //             disabled={
                        //               correctingLineKey === correctionKey
                        //             }
                        //             className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 disabled:opacity-50"
                        //           >
                        //             {/* Cancel Item */}
                        //             <svg
                        //               viewBox="0 0 16 16"
                        //               className="h-3 w-3"
                        //               fill="none"
                        //               stroke="currentColor"
                        //               strokeWidth="2.5"
                        //             >
                        //               <path d="M3 3l10 10M13 3L3 13" />
                        //             </svg>
                        //           </button>
                        //         </>
                        //       ) : null}
                        //       {item.lineId && itemNextStatus ? (
                        //         <button
                        //           type="button"
                        //           onClick={() => onMarkItemServed(order, item)}
                        //           disabled={servingItemKey === itemActionKey}
                        //           className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 disabled:opacity-50"
                        //         >
                        //           {servingItemKey === itemActionKey
                        //             ? "..."
                        //             : "Serve"}
                        //         </button>
                        //       ) : null}
                        //     </div>
                        //   </div>
                        // </div>
                        <div
  key={`${item.itemId}-${item.variantId || "base"}-${index}`}
  className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
>
  {/* Main row */}
  <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 sm:flex-nowrap">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[12px] font-semibold text-slate-700">
      ×{item.quantity}
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-semibold text-slate-800">
        {item.name}
        {item.variantName ? (
          <span className="ml-1 font-normal text-slate-400">({item.variantName})</span>
        ) : null}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-400">
        {fmtCurrency(item.lineTotal ?? item.unitPrice * item.quantity)}
      </p>
    </div>
    <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:justify-end">
      {delta > 0 ? (
        <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          +{delta} new
        </span>
      ) : null}
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${itemStatusClass(item.status)}`}>
        {itemStatusLabel(item.status)}
      </span>
    </div>
  </div>

  {/* Note */}
  {item.note ? (
    <p className="border-t border-amber-100 bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-800">
      {item.note}
    </p>
  ) : null}

  {/* Actions */}
  {(canCorrectItem || (item.lineId && itemNextStatus)) ? (
    <div className="grid border-t border-slate-100 bg-slate-50/70 sm:flex">

      {item.lineId && itemNextStatus ? (
        <button
          type="button"
          onClick={() => onMarkItemServed(order, item)}
          disabled={servingItemKey === itemActionKey}
          className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="2,9 6,13 14,3" />
          </svg>
          {servingItemKey === itemActionKey ? "..." : "Serve"}
        </button>
      ) : null}

      {canCorrectItem ? (
        <>
          {tableTargets.length > 0 ? (
            <select
              defaultValue=""
              disabled={correctingLineKey === correctionKey}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                onMovePlacedItem(order, item, { targetTableId: v }, correctionValue);
                e.currentTarget.value = "";
              }}
              className="min-h-10 min-w-0 border-t border-slate-100 bg-sky-50 px-3 py-2 text-center text-[11px] font-semibold text-sky-700 disabled:opacity-40 sm:flex-1 sm:border-l sm:border-t-0"
            >
              <option value="">Move table</option>
              {tableTargets.map((t) => (
                <option key={t.id} value={t.id}>T{t.number}</option>
              ))}
            </select>
          ) : null}

          {moveTargets.length > 0 ? (
            <select
              defaultValue=""
              disabled={correctingLineKey === correctionKey}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                onMovePlacedItem(order, item, { targetOrderId: v }, correctionValue);
                e.currentTarget.value = "";
              }}
              className="min-h-10 min-w-0 border-t border-slate-100 bg-sky-50 px-3 py-2 text-center text-[11px] font-semibold text-sky-700 disabled:opacity-40 sm:flex-1 sm:border-l sm:border-t-0"
            >
              <option value="">Move order</option>
              {moveTargets.map((c) => (
                <option key={c.id} value={c.id}>#{c.orderNumber || c.id.slice(-4)}</option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            onClick={() => onRemovePlacedItem(order, item, correctionValue)}
            disabled={correctingLineKey === correctionKey}
            className="flex min-h-10 min-w-0 items-center justify-center gap-1 border-t border-slate-100 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 disabled:opacity-40 sm:flex-1 sm:border-l sm:border-t-0"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 8h8" />
            </svg>
            {item.quantity > 1 ? "Reduce" : "Remove"}
          </button>

          <button
            type="button"
            title="Cancel item"
            onClick={() => onCancelPlacedItem(order, item)}
            disabled={correctingLineKey === correctionKey}
            className="flex min-h-10 items-center justify-center border-t border-slate-100 bg-slate-50 px-3 py-2 text-slate-400 disabled:opacity-40 sm:border-l sm:border-t-0"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 4l8 8M12 4L4 12" />
            </svg>
          </button>
        </>
      ) : null}

    </div>
  ) : null}
</div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

type WaiterViewProps = {
  onOrderPlaced: () => void;
  initialTableId?: string;
  mode?: "board" | "live-board" | "select-table" | "select-items";
};

function WaiterView({
  onOrderPlaced,
  initialTableId,
  mode = "board",
}: WaiterViewProps) {
  const router = useRouter();
  const token = useAppSelector(selectAuthToken);
  const { data: tablesData, refetch: refetchTables } = useGetTablesQuery({
    isActive: true,
  });
  const { data: ordersData, refetch: refetchOrders } = useGetOrdersQuery({
    status: ["PLACED", "IN_PROGRESS", "READY", "SERVED"],
    limit: 100,
  });
  console.log("Waiter orders data:", ordersData);
  const { data: invoicesData, refetch: refetchInvoices } =
    useGetInvoicesQuery({ limit: 100 });
  const [createOrder, { isLoading: isCreating }] = useCreateOrderMutation();
  const [updateOrder] = useUpdateOrderMutation();
  const [removeOrderItem] = useRemoveOrderItemMutation();
  const [cancelOrderItem] = useCancelOrderItemMutation();
  const [moveOrderItem] = useMoveOrderItemMutation();
  const [createInvoice, { isLoading: isCreatingInvoice }] =
    useCreateInvoiceMutation();
  const [socketConnected, setSocketConnected] = useState(false);
  const [creatingInvoiceOrderId, setCreatingInvoiceOrderId] = useState<
    string | null
  >(null);
  const [servingOrderId, setServingOrderId] = useState<string | null>(null);
  const [servingItemKey, setServingItemKey] = useState<string | null>(null);
  const [correctingLineKey, setCorrectingLineKey] = useState<string | null>(
    null,
  );
  const [correctionQuantities, setCorrectionQuantities] = useState<
    Record<string, number>
  >({});
  const [step, setStep] = useState<WaiterStep>("tables");
  const [selectedTable, setSelectedTable] = useState<TableRecord | null>(null);
  const [, setExistingOrder] = useState<OrderRecord | undefined>(undefined);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [pendingOrderDraft, setPendingOrderDraft] =
    useState<PendingOrderDraft | null>(null);
  const [showCustomerCapture, setShowCustomerCapture] = useState(false);
  const [orderCustomerDetails, setOrderCustomerDetails] =
    useState<OptionalCustomerDetails>({
      customerName: "",
      customerPhone: "",
    });
  const [composeMode, setComposeMode] =
    useState<WaiterComposerMode>("force-new");
  const autoSelectedTableRef = useRef<string | null>(null);
  const routeDrivenMenu = mode === "select-items";
  const routeDrivenTableSelection = mode === "select-table";
  const waiterLiveOnly = mode === "live-board";

  // ── Socket: real-time updates ──────────────────────────────────────────────
  useOrderSocket({
    token,
    enabled: true,
    role: "waiter",
    onConnectionChange: setSocketConnected,
    onEvent: (event) => {
      if (event.type === "created") {
        const table = event.order?.table;
        const label =
          table?.name || (table?.number ? `Table ${table.number}` : "a table");
        showInfo(`New order - ${label}`);
        refetchOrders();
        refetchInvoices();
        refetchTables();
      } else if (event.type === "updated") {
        const status = (event.order?.status || "").toUpperCase();
        const table = event.order?.table;
        const label =
          table?.name || (table?.number ? `Table ${table.number}` : "a table");
        if (status === "READY") showSuccess(`${label} ready for serve`);
        else if (status === "SERVED") showSuccess(`${label} served by waiter`);
        else if (status === "IN_PROGRESS") showInfo(`${label} cooking started`);
        else showInfo(`${label} order updated`);
        refetchOrders();
        refetchInvoices();
        refetchTables();
      } else if (event.type === "deleted") {
        showInfo("An order was deleted");
        refetchOrders();
        refetchInvoices();
        refetchTables();
      }
    },
  });

  const tables = useMemo(
    () => (tablesData?.items || []).slice().sort((a, b) => a.number - b.number),
    [tablesData],
  );
  const orders = useMemo(
    () => sortOrdersByLatest(ordersData?.items || []),
    [ordersData],
  );
  const invoices = useMemo(() => invoicesData?.items || [], [invoicesData]);
  const invoicedOrderIds = useMemo(
    () => new Set(invoices.map((invoice) => invoice.orderId).filter(Boolean)),
    [invoices],
  );
  const issuedInvoiceTableIds = useMemo(
    () =>
      new Set(
        invoices
          .filter((invoice) => normalizeStatus(invoice.status) === "ISSUED")
          .map((invoice) => invoice.table?.id)
          .filter((value): value is string => Boolean(value)),
      ),
    [invoices],
  );
  const waiterActionOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (invoicedOrderIds.has(order.id)) return false;
        return ["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(
          normalizeStatus(order.status),
        );
      }),
    [invoicedOrderIds, orders],
  );
  const appendSignals = useMemo(
    () => buildAppendSignals(waiterActionOrders),
    [waiterActionOrders],
  );
  const selectedTableOrders = useMemo(() => {
    if (!selectedTable) return undefined;
    return sortOrdersByLatest(orders).filter((order) => {
      const orderTableId = order.table?.id || order.tableId;
      if (orderTableId !== selectedTable.id) return false;
      if (invoicedOrderIds.has(order.id)) return false;
      return isOrderActiveForTable(order.status);
    });
  }, [invoicedOrderIds, orders, selectedTable]);

  const currentExistingOrder = useMemo(() => {
    const tableOrders = selectedTableOrders || [];
    if (!tableOrders.length || composeMode === "force-new") return undefined;
    if (composeMode === "append-specific") {
      return (
        tableOrders.find((order) => order.id === selectedOrderId) ||
        tableOrders[0]
      );
    }
    return tableOrders[0];
  }, [composeMode, selectedOrderId, selectedTableOrders]);

  useEffect(() => {
    const targetTableId = initialTableId?.trim();
    if (!targetTableId) {
      autoSelectedTableRef.current = null;
      return;
    }
    if (autoSelectedTableRef.current === targetTableId) return;

    const table = tables.find((row) => row.id === targetTableId);
    if (!table) return;

    setSelectedTable(table);
    setStep("menu");
    autoSelectedTableRef.current = targetTableId;
  }, [initialTableId, orders, tables]);

  useEffect(() => {
    const tableOrders = selectedTableOrders || [];
    if (!selectedTable) return;
    if (tableOrders.length === 0) {
      setComposeMode("force-new");
      setSelectedOrderId(null);
      return;
    }
    if (
      !selectedOrderId ||
      !tableOrders.some((order) => order.id === selectedOrderId)
    ) {
      setSelectedOrderId(tableOrders[0].id);
    }
    if (tableOrders.length === 1) {
      setComposeMode("append-specific");
    }
  }, [selectedOrderId, selectedTable, selectedTableOrders]);

  function handleSelectTable(table: TableRecord) {
    if (routeDrivenTableSelection) {
      router.push(
        `/dashboard/orders/items?tableId=${encodeURIComponent(table.id)}`,
      );
      return;
    }
    setSelectedTable(table);
    setStep("menu");
  }

  async function handleCreateInvoice(order: OrderRecord) {
    if (!order.id) return;
    try {
      setCreatingInvoiceOrderId(order.id);
      const response = await createInvoice({ orderId: order.id }).unwrap();
      showSuccess(
        response.message ||
          `Invoice created for Table ${order.table?.number || ""}`,
      );
      refetchOrders();
      refetchInvoices();
      refetchTables();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setCreatingInvoiceOrderId(null);
    }
  }

  async function handleMarkServed(order: OrderRecord) {
    try {
      setServingOrderId(order.id);
      await updateOrder({
        orderId: order.id,
        payload: { status: "SERVED" },
      }).unwrap();
      showSuccess(
        `${order.table?.name || `Table ${order.table?.number}`} served`,
      );
      refetchOrders();
      refetchTables();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setServingOrderId(null);
    }
  }

  async function handleMarkItemServed(order: OrderRecord, item: OrderItem) {
    const nextStatus = nextServiceItemStatus(item.status);
    if (!item.lineId || !nextStatus) return;

    const actionKey = orderItemActionKey(order.id, item.lineId, nextStatus);

    try {
      setServingItemKey(actionKey);
      await updateOrder({
        orderId: order.id,
        payload: {
          itemStatusUpdates: [{ lineId: item.lineId, status: nextStatus }],
        },
      }).unwrap();
      showSuccess(`${item.name} served`);
      refetchOrders();
      refetchTables();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setServingItemKey(null);
    }
  }

  async function handleMarkReadyItemsServed(order: OrderRecord) {
    const readyItems = getServeableReadyItems(order);
    if (readyItems.length === 0) return;

    try {
      setServingItemKey(orderBatchActionKey(order.id, "SERVED"));
      await updateOrder({
        orderId: order.id,
        payload: {
          itemStatusUpdates: readyItems
            .filter((item): item is OrderItem & { lineId: string } =>
              Boolean(item.lineId),
            )
            .map((item) => ({
              lineId: item.lineId,
              status: "SERVED" as OrderStatus,
            })),
        },
      }).unwrap();
      showSuccess(
        readyItems.length === 1
          ? `${readyItems[0].name} served`
          : `${readyItems.length} ready items served`,
      );
      refetchOrders();
      refetchTables();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setServingItemKey(null);
    }
  }

  function handleCorrectionQuantityChange(lineKey: string, quantity: number) {
    setCorrectionQuantities((current) => ({ ...current, [lineKey]: quantity }));
  }

  async function handleRemovePlacedItem(
    order: OrderRecord,
    item: OrderItem,
    quantity: number,
  ) {
    if (!item.lineId) return;
    const nextQuantity = correctionQty(item, quantity);
    try {
      setCorrectingLineKey(`${order.id}:${item.lineId}`);
      await removeOrderItem({
        orderId: order.id,
        lineId: item.lineId,
        payload:
          nextQuantity < item.quantity ? { quantity: nextQuantity } : undefined,
      }).unwrap();
      showSuccess(
        nextQuantity < item.quantity
          ? `${nextQuantity} qty removed from ${item.name}`
          : `${item.name} removed`,
      );
      refetchOrders();
      refetchTables();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setCorrectingLineKey(null);
    }
  }

  async function handleCancelPlacedItem(order: OrderRecord, item: OrderItem) {
    if (!item.lineId) return;
    try {
      setCorrectingLineKey(`${order.id}:${item.lineId}`);
      await cancelOrderItem({
        orderId: order.id,
        lineId: item.lineId,
      }).unwrap();
      showSuccess(`${item.name} cancelled`);
      refetchOrders();
      refetchTables();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setCorrectingLineKey(null);
    }
  }

  async function handleMovePlacedItem(
    order: OrderRecord,
    item: OrderItem,
    target: MoveTargetSelection,
    quantity: number,
  ) {
    if (!item.lineId || (!target.targetOrderId && !target.targetTableId))
      return;
    const nextQuantity = correctionQty(item, quantity);
    try {
      setCorrectingLineKey(`${order.id}:${item.lineId}`);
      await moveOrderItem({
        orderId: order.id,
        lineId: item.lineId,
        payload: {
          ...target,
          ...(nextQuantity < item.quantity ? { quantity: nextQuantity } : {}),
        },
      }).unwrap();
      showSuccess(
        nextQuantity < item.quantity
          ? `${nextQuantity} qty exchanged`
          : `${item.name} exchanged successfully`,
      );
      refetchOrders();
      refetchTables();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setCorrectingLineKey(null);
    }
  }

  const placeOrderDraft = useCallback(
    async (
      draft: PendingOrderDraft,
      skipCustomer: boolean,
      customerDetails: OptionalCustomerDetails,
    ) => {
      if (!selectedTable) return;

      const nextCustomer = skipCustomer
        ? { customerName: "", customerPhone: "" }
        : {
            customerName: customerDetails.customerName.trim(),
            customerPhone: normalizePhoneInput(
              customerDetails.customerPhone.trim(),
            ),
          };

      const validationError = validateOptionalCustomer(nextCustomer);
      if (validationError) {
        showError(validationError);
        return;
      }

      setStep("placing");
      try {
        const items = draft.cart.map((entry) => ({
          itemId: entry.itemId,
          ...(entry.variantId ? { variantId: entry.variantId } : {}),
          quantity: entry.quantity,
          ...(entry.note ? { note: entry.note } : {}),
          optionIds: [],
        }));

        const payload = {
          tableId: selectedTable.id,
          ...(draft.tableNote ? { note: draft.tableNote } : {}),
          ...(nextCustomer.customerName && nextCustomer.customerPhone
            ? nextCustomer
            : {}),
          items,
          ...(composeMode === "force-new"
            ? { forceNew: true }
            : composeMode === "append-specific" && currentExistingOrder?.id
              ? { appendToOrderId: currentExistingOrder.id }
              : {}),
        };

        await createOrder(payload).unwrap();
        setShowCustomerCapture(false);
        setPendingOrderDraft(null);
        showSuccess(
          composeMode === "force-new"
            ? "New order created successfully!"
            : currentExistingOrder
              ? "Items added to selected order!"
              : "Order placed successfully!",
        );
        refetchOrders();
        refetchInvoices();
        refetchTables();
        onOrderPlaced();
        setStep("tables");
        setSelectedTable(null);
        setExistingOrder(undefined);
        setSelectedOrderId(null);
        setComposeMode("force-new");
      } catch (error) {
      showError(getErrorMessage(error));
      setStep("menu");
      }
    },
    [
      composeMode,
      createOrder,
      currentExistingOrder,
      onOrderPlaced,
      refetchInvoices,
      refetchOrders,
      refetchTables,
      selectedTable,
    ],
  );

  const handlePlacePendingOrder = useCallback(
    async (skipCustomer: boolean) => {
      if (!pendingOrderDraft) return;
      await placeOrderDraft(
        pendingOrderDraft,
        skipCustomer,
        orderCustomerDetails,
      );
    },
    [orderCustomerDetails, pendingOrderDraft, placeOrderDraft],
  );

  const handleConfirm = useCallback(
    async (cart: CartEntry[], tableNote: string) => {
      const isAppendingToExistingOrder =
        composeMode !== "force-new" && Boolean(currentExistingOrder?.id);
      const draft = { cart, tableNote };
      const customerDetails = {
        customerName: currentExistingOrder?.customerName || "",
        customerPhone: currentExistingOrder?.customerPhone || "",
      };

      if (isAppendingToExistingOrder) {
        void placeOrderDraft(draft, false, customerDetails);
        return;
      }

      setPendingOrderDraft(draft);
      setOrderCustomerDetails(customerDetails);
      setShowCustomerCapture(true);
    },
    [composeMode, currentExistingOrder, placeOrderDraft],
  );

  return (
    <div className="flex h-full flex-col">
      <WaiterLiveHeader connected={socketConnected} />
      {/* Step indicator */}
      {mode === "board" ? (
        <div className="mb-4 flex items-center gap-2">
          {(["tables", "menu"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step === s || (step === "placing" && s === "menu") ? "bg-amber-500 text-white" : step === "menu" && s === "tables" ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}
              >
                {step === "menu" && s === "tables" ? "✓" : i + 1}
              </div>
              <span
                className={`text-xs font-medium ${step === s ? "text-slate-900" : "text-slate-400"}`}
              >
                {s === "tables" ? "Pick Table" : "Select Items"}
              </span>
              {i < 1 && <div className="h-px w-4 bg-slate-300" />}
            </div>
          ))}
        </div>
      ) : null}

      {step === "tables" && !routeDrivenMenu && (
        <div
          className={`grid gap-4 ${mode === "board" ? "xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:items-start" : ""}`}
        >
          {!waiterLiveOnly ? (
            <TableGrid
              tables={tables}
              orders={orders}
              invoicedOrderIds={invoicedOrderIds}
              issuedInvoiceTableIds={issuedInvoiceTableIds}
              appendSignals={appendSignals}
              onSelectTable={handleSelectTable}
            />
          ) : null}
          {mode === "board" || waiterLiveOnly ? (
            <div className={waiterLiveOnly ? "space-y-4" : undefined}>
              {waiterLiveOnly ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Waiter Live Orders
                    </p>
                    <p className="text-xs text-slate-500">
                      Serve ready items yahin se karo. New order ke liye table
                      selection alag page me hai.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard/orders/new")}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white"
                  >
                    Take New Order
                  </button>
                </div>
              ) : null}
              <WaiterActionBoard
                orders={waiterActionOrders}
                allOrders={orders}
                tables={tables}
                appendSignals={appendSignals}
                servingOrderId={servingOrderId}
                servingItemKey={servingItemKey}
                creatingInvoiceOrderId={creatingInvoiceOrderId}
                onMarkServed={handleMarkServed}
                onMarkItemServed={handleMarkItemServed}
                onMarkReadyItemsServed={handleMarkReadyItemsServed}
                onCreateInvoice={handleCreateInvoice}
                correctingLineKey={correctingLineKey}
                correctionQuantities={correctionQuantities}
                onCorrectionQuantityChange={handleCorrectionQuantityChange}
                onRemovePlacedItem={handleRemovePlacedItem}
                onCancelPlacedItem={handleCancelPlacedItem}
                onMovePlacedItem={handleMovePlacedItem}
                className="mt-0"
              />
            </div>
          ) : null}
        </div>
      )}

      {(step === "menu" || step === "placing") && selectedTable && (
        <div className="relative flex-1">
          {step === "placing" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur">
              <div className="flex flex-col items-center gap-3 text-slate-600">
                <Spinner />
                <p className="text-sm font-medium">
                  {isCreating || isCreatingInvoice
                    ? "Placing order..."
                    : "Done!"}
                </p>
              </div>
            </div>
          )}
          <MenuBrowser
            key={`${selectedTable.id}:${currentExistingOrder?.id || "fresh"}`}
            table={selectedTable}
            tableOrders={selectedTableOrders || []}
            existingOrder={currentExistingOrder}
            composeMode={composeMode}
            selectedOrderId={selectedOrderId}
            onComposeModeChange={setComposeMode}
            onSelectedOrderIdChange={setSelectedOrderId}
            servingItemKey={servingItemKey}
            onServeExistingOrderItem={handleMarkItemServed}
            onServeReadyItems={handleMarkReadyItemsServed}
            onBack={() => {
              if (routeDrivenMenu) {
                router.push("/dashboard/orders/new");
                return;
              }
              setStep("tables");
              setSelectedTable(null);
              setExistingOrder(undefined);
              setSelectedOrderId(null);
              setComposeMode("force-new");
            }}
            onConfirm={handleConfirm}
          />
        </div>
      )}
      {routeDrivenMenu && !selectedTable ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-900">
            Table not selected
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Pehle table choose karo, phir items add karo.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard/orders/new")}
            className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white"
          >
            Go To Table Selection
          </button>
        </div>
      ) : null}

      {showCustomerCapture ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/55 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => {
              setShowCustomerCapture(false);
              setPendingOrderDraft(null);
            }}
            aria-label="Close customer details"
          />
          <div className="relative z-10 w-full rounded-t-3xl border border-[#e4d6bf] bg-[#fffaf2] p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Optional Customer
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              Add customer details before placing order
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Name aur phone optional hain. `Skip` se bina customer ke order place
              hoga, `Proceed` se customer info ke saath.
            </p>

            <div className="mt-4 grid gap-3">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Customer Name
                </span>
                <input
                  value={orderCustomerDetails.customerName}
                  onChange={(event) =>
                    setOrderCustomerDetails((current) => ({
                      ...current,
                      customerName: event.target.value,
                    }))
                  }
                  placeholder="Optional guest name"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Customer Phone
                </span>
                <input
                  value={orderCustomerDetails.customerPhone}
                  onChange={(event) =>
                    setOrderCustomerDetails((current) => ({
                      ...current,
                      customerPhone: normalizePhoneInput(event.target.value),
                    }))
                  }
                  placeholder="Optional WhatsApp / phone number"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => handlePlacePendingOrder(true)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => handlePlacePendingOrder(false)}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
              >
                Proceed And Place Order
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Waiter Live Header bar ───────────────────────────────────────────────────
function WaiterLiveHeader({ connected }: { connected: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-500">
        Notifications &amp; sound enabled
      </p>
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

/* eslint-disable @typescript-eslint/no-unused-vars */
function OrderCard({
  order,
  role,
  onStatusChange,
  onItemStatusChange,
  onBatchServeReady,
  onDelete,
  updatingItemKey,
  compact,
}: {
  order: OrderRecord;
  role: RoleKey;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onItemStatusChange: (
    order: OrderRecord,
    item: OrderItem,
    status: OrderStatus,
  ) => void;
  onBatchServeReady: (order: OrderRecord) => void;
  onDelete: (orderId: string) => void;
  updatingItemKey?: string | null;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const canEdit = role === "owner" || role === "manager" || role === "waiter";
  const canDelete = role === "owner" || role === "manager";
  const nextStatus = NEXT_STATUS[order.status];
  const activeItemsList = activeOrderItems(order);
  const itemStatuses = activeItemsList
    .map((item) => normalizeStatus(item.status) || "PLACED")
    .filter(Boolean);
  const hasMixedItemStatuses = new Set(itemStatuses).size > 1;
  const readyItems = getServeableReadyItems(order);
  const batchServeKey = orderBatchActionKey(order.id, "SERVED");
  const showExpanded = expanded || hasMixedItemStatuses;

  return (
    <div
      className={`rounded-2xl border bg-white transition ${compact ? "p-3" : "p-4"}`}
      style={{
        borderColor:
          order.status === "PLACED"
            ? "#fcd34d"
            : order.status === "IN_PROGRESS"
              ? "#fca5a5"
              : order.status === "READY"
                ? "#6ee7b7"
                : "#e2e8f0",
      }}
    >
      <div className="flex items-start gap-3">
        {/* Table badge */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
          T{order.table?.number ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-slate-900">
              {order.table?.name || `Table ${order.table?.number}`}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(order.status)}`}
            >
              {STATUS_LABELS[order.status] || order.status}
            </span>
            {hasMixedItemStatuses ? (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                Mixed items
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {order.items.length} item{order.items.length !== 1 ? "s" : ""} ·{" "}
            {fmtCurrency(order.grandTotal ?? order.subTotal)} ·{" "}
            {timeAgo(order.createdAt)}
          </p>
          {order.note && (
            <p className="mt-0.5 text-xs italic text-slate-400">{`"${order.note}"`}</p>
          )}
        </div>
        {/* Expand */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-slate-400 hover:text-slate-700"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition-transform ${showExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Expanded items */}
      {showExpanded && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-slate-700">
                {item.quantity}× {item.name}
                {item.variantName ? ` (${item.variantName})` : ""}
              </span>
              <span className="text-slate-500">
                {fmtCurrency(item.lineTotal ?? item.unitPrice * item.quantity)}
              </span>
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
      {(canEdit || canDelete) &&
        order.status !== "SERVED" &&
        order.status !== "CANCELLED" && (
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
/* eslint-enable @typescript-eslint/no-unused-vars */
function SmartOrderCard({
  order,
  allOrders,
  tables,
  role,
  onStatusChange,
  onItemStatusChange,
  onBatchServeReady,
  onDelete,
  correctionQuantities,
  correctingLineKey,
  onCorrectionQuantityChange,
  onRemovePlacedItem,
  onCancelPlacedItem,
  onMovePlacedItem,
  updatingItemKey,
  compact,
}: {
  order: OrderRecord;
  allOrders: OrderRecord[];
  tables: TableRecord[];
  role: RoleKey;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onItemStatusChange: (
    order: OrderRecord,
    item: OrderItem,
    status: OrderStatus,
  ) => void;
  onBatchServeReady: (order: OrderRecord) => void;
  onDelete: (orderId: string) => void;
  correctionQuantities: Record<string, number>;
  correctingLineKey?: string | null;
  onCorrectionQuantityChange: (lineKey: string, quantity: number) => void;
  onRemovePlacedItem: (
    order: OrderRecord,
    item: OrderItem,
    quantity: number,
  ) => void;
  onCancelPlacedItem: (order: OrderRecord, item: OrderItem) => void;
  onMovePlacedItem: (
    order: OrderRecord,
    item: OrderItem,
    target: MoveTargetSelection,
    quantity: number,
  ) => void;
  updatingItemKey?: string | null;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const canEdit = role === "owner" || role === "manager" || role === "waiter";
  const canDelete = role === "owner" || role === "manager" || role === "waiter";
  const nextStatus = NEXT_STATUS[order.status];
  const itemStatuses = activeOrderItems(order)
    .map((item) => normalizeStatus(item.status) || "PLACED")
    .filter(Boolean);
  const hasMixedItemStatuses = new Set(itemStatuses).size > 1;
  const hasEditableItems = activeOrderItems(order).some(
    (item) =>
      Boolean(item.lineId) &&
      canCorrectOrderItemStatus(item.status) &&
      order.status !== "CANCELLED" &&
      order.status !== "COMPLETED",
  );
  const readyItems = getServeableReadyItems(order);
  const batchServeKey = orderBatchActionKey(order.id, "SERVED");
  const showExpanded = expanded || hasMixedItemStatuses || hasEditableItems;
  const customerLabel = orderCustomerLabel(order);

  return (
    <div
      className={`rounded-2xl border bg-white transition ${compact ? "p-3" : "p-4"}`}
      style={{
        borderColor:
          order.status === "PLACED"
            ? "#fcd34d"
            : order.status === "IN_PROGRESS"
              ? "#fca5a5"
              : order.status === "READY"
                ? "#6ee7b7"
                : "#e2e8f0",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
          T{order.table?.number ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-slate-900">
              {order.table?.name || `Table ${order.table?.number}`}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(order.status)}`}
            >
              {STATUS_LABELS[order.status] || order.status}
            </span>
            {hasMixedItemStatuses ? (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                Mixed items
              </span>
            ) : null}
            {hasEditableItems ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                Move / Remove Available
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {order.items.length} item{order.items.length !== 1 ? "s" : ""} |{" "}
            {fmtCurrency(order.grandTotal ?? order.subTotal)} |{" "}
            {timeAgo(order.createdAt)}
          </p>
          {customerLabel ? (
            <p className="mt-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
              Customer order: {customerLabel}
            </p>
          ) : null}
          {order.note && (
            <p className="mt-0.5 text-xs italic text-slate-400">{`\"${order.note}\"`}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="shrink-0 text-slate-400 hover:text-slate-700"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition-transform ${showExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {showExpanded && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {order.items.map((item, index) => {
            const itemNextStatus = canEdit
              ? nextOrderItemStatus(item.status, role)
              : undefined;
            const itemActionKey = item.lineId
              ? orderItemActionKey(order.id, item.lineId, itemNextStatus)
              : null;
            const correctionKey = item.lineId
              ? `${order.id}:${item.lineId}`
              : null;
            const correctionValue = correctionQty(
              item,
              correctionKey ? correctionQuantities[correctionKey] : undefined,
            );
            const canCorrectItem =
              Boolean(item.lineId) &&
              canCorrectOrderItemStatus(item.status) &&
              order.status !== "COMPLETED";
            const moveTargets = allOrders.filter(
              (candidate) =>
                candidate.id !== order.id &&
                (candidate.table?.id || candidate.tableId) ===
                  (order.table?.id || order.tableId) &&
                ["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(
                  normalizeStatus(candidate.status),
                ),
            );
            const tableTargets = tables.filter(
              (table) => table.id !== (order.table?.id || order.tableId),
            );

            return (
              <div
                key={`${item.itemId}-${item.variantId || "base"}-${index}`}
                className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-700">
                        {item.quantity}x {item.name}
                        {item.variantName ? ` (${item.variantName})` : ""}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${itemStatusClass(item.status)}`}
                      >
                        {itemStatusLabel(item.status)}
                      </span>
                    </div>

                    {item.note ? (
                      <p className="mt-0.5 italic text-amber-700">
                        {item.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-slate-500">
                      {fmtCurrency(
                        item.lineTotal ?? item.unitPrice * item.quantity,
                      )}
                    </span>
                    {canEdit && item.lineId && itemNextStatus ? (
                      <button
                        type="button"
                        onClick={() =>
                          onItemStatusChange(order, item, itemNextStatus)
                        }
                        disabled={updatingItemKey === itemActionKey}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${
                          itemNextStatus === "SERVED"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-slate-300 bg-slate-100 text-slate-700"
                        }`}
                      >
                        {updatingItemKey === itemActionKey
                          ? "Updating..."
                          : orderItemActionLabel(itemNextStatus)}
                      </button>
                    ) : null}
                  </div>
                </div>
                {canCorrectItem ? (
                  <div className="flex items-center gap-1.5">
                    {/* Exchange order */}
                    {moveTargets.length > 0 && (
                      <select
                        defaultValue=""
                        disabled={correctingLineKey === correctionKey}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          onMovePlacedItem(
                            order,
                            item,
                            { targetOrderId: e.target.value },
                            correctionValue,
                          );
                          e.currentTarget.value = "";
                        }}
                        title="Move to another order"
                        className="h-6 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-600 disabled:opacity-40"
                      >
                        <option value="">↔ Order</option>
                        {moveTargets.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.orderNumber || c.id.slice(-4)}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Exchange table */}
                    {tableTargets.length > 0 && (
                      <select
                        defaultValue=""
                        disabled={correctingLineKey === correctionKey}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          onMovePlacedItem(
                            order,
                            item,
                            { targetTableId: e.target.value },
                            correctionValue,
                          );
                          e.currentTarget.value = "";
                        }}
                        title="Move to another table"
                        className="h-6 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-600 disabled:opacity-40"
                      >
                        <option value="">⇄ Table</option>
                        {tableTargets.map((t) => (
                          <option key={t.id} value={t.id}>
                            T{t.number}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Divider */}
                    <div className="h-4 w-px bg-slate-200" />

                    {/* Reduce / Remove */}
                    <button
                      type="button"
                      title={
                        item.quantity > 1
                          ? `Reduce by ${correctionValue}`
                          : "Remove item"
                      }
                      onClick={() =>
                        onRemovePlacedItem(order, item, correctionValue)
                      }
                      disabled={correctingLineKey === correctionKey}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                    >
                      {item.quantity > 1 ? (
                        <svg
                          viewBox="0 0 16 16"
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M3 8h10" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 16 16"
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M3 4h10M6 4V3h4v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" />
                        </svg>
                      )}
                    </button>

                    {/* Cancel */}
                    <button
                      type="button"
                      title="Cancel item"
                      onClick={() => onCancelPlacedItem(order, item)}
                      disabled={correctingLineKey === correctionKey}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M3 3l10 10M13 3L3 13" />
                      </svg>
                    </button>
                  </div>
                ) : // <div className="flex flex-wrap items-center gap-2">
                //   {moveTargets.length > 0 ? (
                //     <select
                //       defaultValue=""
                //       disabled={correctingLineKey === correctionKey}
                //       onChange={(event) => {
                //         const targetOrderId = event.target.value;
                //         if (!targetOrderId) return;
                //         onMovePlacedItem(
                //           order,
                //           item,
                //           { targetOrderId },
                //           correctionValue,
                //         );
                //         event.currentTarget.value = "";
                //       }}
                //       className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                //     >
                //       <option value="">Exchange</option>
                //       {moveTargets.map((candidate) => (
                //         <option key={candidate.id} value={candidate.id}>
                //           {candidate.orderNumber
                //             ? `#${candidate.orderNumber}`
                //             : candidate.id.slice(-4)}
                //         </option>
                //       ))}
                //     </select>
                //   ) : null}
                //   {tableTargets.length > 0 ? (
                //     <select
                //       defaultValue=""
                //       disabled={correctingLineKey === correctionKey}
                //       onChange={(event) => {
                //         const targetTableId = event.target.value;
                //         if (!targetTableId) return;
                //         onMovePlacedItem(
                //           order,
                //           item,
                //           { targetTableId },
                //           correctionValue,
                //         );
                //         event.currentTarget.value = "";
                //       }}
                //       className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                //     >
                //       <option value="">Exchange Table</option>
                //       {tableTargets.map((table) => (
                //         <option key={table.id} value={table.id}>
                //           T{table.number}
                //         </option>
                //       ))}
                //     </select>
                //   ) : null}
                //   <button
                //     type="button"
                //     title={
                //       item.quantity > 1
                //         ? `Reduce qty (${correctionValue})`
                //         : "Remove item"
                //     }
                //     onClick={() =>
                //       onRemovePlacedItem(order, item, correctionValue)
                //     }
                //     disabled={correctingLineKey === correctionKey}
                //     className="flex h-6 w-6 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                //   >
                //     {item.quantity > 1 ? (
                //       <svg
                //         viewBox="0 0 16 16"
                //         className="h-3 w-3"
                //         fill="none"
                //         stroke="currentColor"
                //         strokeWidth="2.5"
                //       >
                //         <path d="M3 8h10" />
                //       </svg>
                //     ) : (
                //       <svg
                //         viewBox="0 0 16 16"
                //         className="h-3 w-3"
                //         fill="none"
                //         stroke="currentColor"
                //         strokeWidth="1.8"
                //       >
                //         <path d="M3 4h10M6 4V3h4v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" />
                //       </svg>
                //     )}
                //   </button>

                //   {/* Cancel */}
                //   <button
                //     type="button"
                //     title="Cancel item"
                //     onClick={() => onCancelPlacedItem(order, item)}
                //     disabled={correctingLineKey === correctionKey}
                //     className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                //   >
                //     <svg
                //       viewBox="0 0 16 16"
                //       className="h-3 w-3"
                //       fill="none"
                //       stroke="currentColor"
                //       strokeWidth="2.5"
                //     >
                //       <path d="M3 3l10 10M13 3L3 13" />
                //     </svg>
                //   </button>
                // </div>
                null}
              </div>
            );
          })}
          {order.grandTotal != null && (
            <div className="flex justify-between border-t border-slate-100 pt-1 text-xs font-bold">
              <span>Total</span>
              <span>{fmtCurrency(order.grandTotal)}</span>
            </div>
          )}
        </div>
      )}

      {(canEdit || canDelete) &&
        order.status !== "COMPLETED" &&
        order.status !== "CANCELLED" && (
          <div className="mt-3 flex gap-2">
            {readyItems.length > 0 ? (
              <button
                type="button"
                onClick={() => onBatchServeReady(order)}
                disabled={updatingItemKey === batchServeKey}
                className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-200 transition active:scale-95 disabled:opacity-50"
              >
                {updatingItemKey === batchServeKey
                  ? "Serving..."
                  : readyItems.length === 1
                    ? "Serve Ready Item"
                    : `Serve Ready (${readyItems.length})`}
              </button>
            ) : null}
            {!hasMixedItemStatuses && nextStatus ? (
              <button
                type="button"
                onClick={() => onStatusChange(order.id, nextStatus)}
                className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white shadow-sm shadow-amber-200 transition active:scale-95"
              >
                Mark {STATUS_LABELS[nextStatus] || nextStatus}
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={() => onDelete(order.id)}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition active:scale-95"
              >
                Delete
              </button>
            ) : null}
          </div>
        )}
    </div>
  );
}

function ManagerView({ role }: { role: RoleKey }) {
  const router = useRouter();
  const confirm = useConfirm();
  const token = useAppSelector(selectAuthToken);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersFeed, setOrdersFeed] = useState<OrderRecord[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const [updatingItemKey, setUpdatingItemKey] = useState<string | null>(null);
  const [correctingLineKey, setCorrectingLineKey] = useState<string | null>(
    null,
  );
  const [correctionQuantities, setCorrectionQuantities] = useState<
    Record<string, number>
  >({});
  const [updateOrder] = useUpdateOrderMutation();
  const [deleteOrder] = useDeleteOrderMutation();
  const [removeOrderItem] = useRemoveOrderItemMutation();
  const [cancelOrderItem] = useCancelOrderItemMutation();
  const [moveOrderItem] = useMoveOrderItemMutation();
  const { data: tablesData } = useGetTablesQuery({ isActive: true });

  const queryStatus = useMemo(() => {
    if (statusFilter === "active") return ["PLACED", "IN_PROGRESS", "READY"];
    if (statusFilter === "done") return ["SERVED", "CANCELLED"];
    return undefined;
  }, [statusFilter]);

  const {
    data: ordersData,
    isFetching,
    refetch,
  } = useGetOrdersQuery(
    queryStatus
      ? { status: queryStatus, page: ordersPage, limit: 100 }
      : { page: ordersPage, limit: 100 },
    {
    pollingInterval: 30000,
    },
  );

  // ── Socket ────────────────────────────────────────────────────────────────
  useOrderSocket({
    token,
    enabled: true,
    role,
    onConnectionChange: setSocketConnected,
    onEvent: (event) => {
      if (event.type === "created") {
        const table = event.order?.table;
        const label =
          table?.name || (table?.number ? `Table ${table.number}` : "a table");
        showInfo(`New order - ${label}`);
        setOrdersPage(1);
        setOrdersFeed([]);
        refetch();
      } else if (event.type === "updated") {
        const status = (event.order?.status || "").toUpperCase();
        const table = event.order?.table;
        const label =
          table?.name || (table?.number ? `Table ${table.number}` : "a table");
        if (status === "READY") showSuccess(`${label} ready for serve`);
        else if (status === "IN_PROGRESS") showInfo(`${label} cooking started`);
        else showInfo(`${label} order updated`);
        setOrdersPage(1);
        setOrdersFeed([]);
        refetch();
      } else {
        setOrdersPage(1);
        setOrdersFeed([]);
        refetch();
      }
    },
  });

  useEffect(() => {
    setOrdersPage(1);
    setOrdersFeed([]);
  }, [statusFilter]);

  useEffect(() => {
    if (!ordersData?.items) return;
    setOrdersFeed((current) =>
      ordersPage === 1
        ? sortOrdersByLatest(ordersData.items)
        : mergeOrdersById(current, ordersData.items),
    );
  }, [ordersData, ordersPage]);

  const hasMoreOrders =
    (ordersData?.pagination.totalPages ?? 1) > ordersPage;

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMoreOrders) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || isFetching) return;
        setOrdersPage((current) => current + 1);
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreOrders, isFetching]);

  const orders = useMemo(() => ordersFeed, [ordersFeed]);

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    try {
      await updateOrder({ orderId, payload: { status } }).unwrap();
      showSuccess(`Order marked ${STATUS_LABELS[status] || status}`);
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function handleItemStatusChange(
    order: OrderRecord,
    item: OrderItem,
    status: OrderStatus,
  ) {
    if (!item.lineId) return;
    const actionKey = orderItemActionKey(order.id, item.lineId, status);

    try {
      setUpdatingItemKey(actionKey);
      await updateOrder({
        orderId: order.id,
        payload: {
          itemStatusUpdates: [{ lineId: item.lineId, status }],
        },
      }).unwrap();
      showSuccess(`${item.name} marked ${STATUS_LABELS[status] || status}`);
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setUpdatingItemKey(null);
    }
  }

  async function handleBatchServeReady(order: OrderRecord) {
    const readyItems = getServeableReadyItems(order);
    if (readyItems.length === 0) return;

    try {
      setUpdatingItemKey(orderBatchActionKey(order.id, "SERVED"));
      await updateOrder({
        orderId: order.id,
        payload: {
          itemStatusUpdates: readyItems
            .filter((item): item is OrderItem & { lineId: string } =>
              Boolean(item.lineId),
            )
            .map((item) => ({
              lineId: item.lineId,
              status: "SERVED" as OrderStatus,
            })),
        },
      }).unwrap();
      showSuccess(
        readyItems.length === 1
          ? `${readyItems[0].name} marked served`
          : `${readyItems.length} ready items served`,
      );
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setUpdatingItemKey(null);
    }
  }

  function handleCorrectionQuantityChange(lineKey: string, quantity: number) {
    setCorrectionQuantities((current) => ({ ...current, [lineKey]: quantity }));
  }

  async function handleRemovePlacedItem(
    order: OrderRecord,
    item: OrderItem,
    quantity: number,
  ) {
    if (!item.lineId) return;
    const nextQuantity = correctionQty(item, quantity);
    try {
      setCorrectingLineKey(`${order.id}:${item.lineId}`);
      await removeOrderItem({
        orderId: order.id,
        lineId: item.lineId,
        payload:
          nextQuantity < item.quantity ? { quantity: nextQuantity } : undefined,
      }).unwrap();
      showSuccess(
        nextQuantity < item.quantity
          ? `${nextQuantity} qty removed from ${item.name}`
          : `${item.name} removed`,
      );
      refetch();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setCorrectingLineKey(null);
    }
  }

  async function handleCancelPlacedItem(order: OrderRecord, item: OrderItem) {
    if (!item.lineId) return;
    try {
      setCorrectingLineKey(`${order.id}:${item.lineId}`);
      await cancelOrderItem({
        orderId: order.id,
        lineId: item.lineId,
      }).unwrap();
      showSuccess(`${item.name} cancelled`);
      refetch();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setCorrectingLineKey(null);
    }
  }

  async function handleMovePlacedItem(
    order: OrderRecord,
    item: OrderItem,
    target: MoveTargetSelection,
    quantity: number,
  ) {
    if (!item.lineId || (!target.targetOrderId && !target.targetTableId))
      return;
    const nextQuantity = correctionQty(item, quantity);
    try {
      setCorrectingLineKey(`${order.id}:${item.lineId}`);
      await moveOrderItem({
        orderId: order.id,
        lineId: item.lineId,
        payload: {
          ...target,
          ...(nextQuantity < item.quantity ? { quantity: nextQuantity } : {}),
        },
      }).unwrap();
      showSuccess(
        nextQuantity < item.quantity
          ? `${nextQuantity} qty exchanged`
          : `${item.name} exchanged`,
      );
      refetch();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setCorrectingLineKey(null);
    }
  }

  async function handleDelete(orderId: string) {
    const approved = await confirm({
      title: "Delete Order",
      message: "Delete this order? This action cannot be undone.",
      confirmText: "Delete Order",
      cancelText: "Keep Order",
      tone: "danger",
    });
    if (!approved) return;
    try {
      const res = await deleteOrder(orderId).unwrap();
      showSuccess(res.message || "Order deleted");
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  const STATUS_TABS = [
    { key: "active", label: "Active" },
    { key: "done", label: "In Process" },
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
            onClick={() => {
              setOrdersPage(1);
              setOrdersFeed([]);
              refetch();
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {isFetching ? <Spinner /> : "↻ Refresh"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/orders/new")}
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
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => (
              <SmartOrderCard
                key={order.id}
                order={order}
                allOrders={orders}
                tables={tablesData?.items || []}
                role={role}
                onStatusChange={handleStatusChange}
                onItemStatusChange={handleItemStatusChange}
                onBatchServeReady={handleBatchServeReady}
                onDelete={handleDelete}
                correctionQuantities={correctionQuantities}
                correctingLineKey={correctingLineKey}
                onCorrectionQuantityChange={handleCorrectionQuantityChange}
                onRemovePlacedItem={handleRemovePlacedItem}
                onCancelPlacedItem={handleCancelPlacedItem}
                onMovePlacedItem={handleMovePlacedItem}
                updatingItemKey={updatingItemKey}
              />
            ))}
          </div>
          <div ref={loadMoreRef} className="flex justify-center py-4 text-xs text-slate-500">
            {hasMoreOrders
              ? isFetching
                ? "Loading more orders..."
                : "Scroll for more orders"
              : orders.length > 0
                ? "All orders loaded"
                : ""}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Kitchen View (KOT Kanban) ─────────────────────────────────────────────
const KOT_COLUMNS: {
  status: OrderStatus;
  label: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    status: "PLACED",
    label: "New Orders",
    color: "text-amber-800",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  {
    status: "IN_PROGRESS",
    label: "Cooking",
    color: "text-red-800",
    bg: "bg-red-50",
    border: "border-red-200",
  },
  {
    status: "READY",
    label: "Ready to Serve",
    color: "text-emerald-800",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
];

function KitchenView() {
  const token = useAppSelector(selectAuthToken);
  const {
    data: kitchenData,
    isFetching,
    refetch,
  } = useGetKitchenOrderItemsQuery(
    {
      status: ["PLACED", "IN_PROGRESS", "READY"],
      includeDone: false,
      limit: 200,
    },
    { pollingInterval: 30000 },
  );
  console.log("Kitchen data:", kitchenData);
  const [updateOrder] = useUpdateOrderMutation();
  const [toast, setToast] = useState<{
    msg: string;
    type: "ok" | "err" | "info";
  } | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "PLACED" | "IN_PROGRESS" | "READY"
  >("all");
  const [updatingItemKey, setUpdatingItemKey] = useState<string | null>(null);

  const queueItems = useMemo(() => kitchenData?.items || [], [kitchenData]);

 
  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return queueItems.filter((item) => {
      const status = normalizeStatus(item.kitchenStatus);
      if (statusFilter !== "all" && status !== statusFilter) return false;

      if (!query) return true;

      const tableLabel =
        item.tableName ||
        item.table?.name ||
        (item.table?.number ? `Table ${item.table.number}` : "");
      const content = [
        tableLabel,
        item.table?.number,
        item.orderNumber,
        item.source,
        item.orderStatus,
        item.itemId,
        item.name,
        item.variantName,
        item.note,
        item.orderNote,
        item.customerName,
        item.customerPhone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return content.includes(query);
    });
  }, [queueItems, searchText, statusFilter]);

  const groupedByStatus = useMemo(() => {
    const map: Record<string, KitchenQueueItem[]> = {
      PLACED: [],
      IN_PROGRESS: [],
      READY: [],
    };
    for (const item of filteredItems) {
      const status = normalizeStatus(item.kitchenStatus);
      if (map[status]) map[status].push(item);
    }
    return map;
  }, [filteredItems]);
  const tableRows = useMemo(
    () =>
      [...filteredItems].sort((left, right) => {
        const a = new Date(left.addedAt || 0).getTime();
        const b = new Date(right.addedAt || 0).getTime();
        return a - b;
      }),
    [filteredItems],
  );

  const uniqueOrderCount = useMemo(
    () =>
      new Set(filteredItems.map((item) => item.orderId).filter(Boolean)).size,
    [filteredItems],
  );

  const statusCounts = useMemo(() => {
    const counts = { PLACED: 0, IN_PROGRESS: 0, READY: 0 };
    for (const item of queueItems) {
      const status = normalizeStatus(item.kitchenStatus);
      if (status === "PLACED") counts.PLACED += 1;
      if (status === "IN_PROGRESS") counts.IN_PROGRESS += 1;
      if (status === "READY") counts.READY += 1;
    }
    return counts;
  }, [queueItems]);

  useEffect(() => {
    if (!toast) return;
    if (toast.type === "ok") showSuccess(toast.msg);
    else if (toast.type === "info") showInfo(toast.msg);
    else showError(toast.msg);
    const timer = window.setTimeout(() => setToast(null), 0);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useOrderSocket({
    token,
    enabled: true,
    role: "kitchen",
    onConnectionChange: setSocketConnected,
    onEvent: (event) => {
      if (event.type === "created") {
        const table = event.order?.table;
        const label =
          table?.name || (table?.number ? `Table ${table.number}` : "a table");
        setToast({ msg: `New order - ${label}`, type: "info" });
      } else if (event.type === "updated") {
        const status = (event.order?.status || "").toUpperCase();
        const table = event.order?.table;
        const label =
          table?.name || (table?.number ? `Table ${table.number}` : "a table");
        if (status === "IN_PROGRESS")
          setToast({ msg: `${label} cooking started`, type: "ok" });
        else if (status === "READY")
          setToast({ msg: `${label} ready for serve`, type: "ok" });
        else setToast({ msg: `${label} order updated`, type: "info" });
      }
      refetch();
    },
  });

  async function bumpItem(item: KitchenQueueItem, next: OrderStatus) {
    const actionKey = `${item.orderId}:${item.lineId}:${next}`;

    try {
      setUpdatingItemKey(actionKey);
      await updateOrder({
        orderId: item.orderId,
        payload: {
          itemStatusUpdates: [{ lineId: item.lineId, status: next }],
        },
      }).unwrap();
      setToast({
        msg: `${item.name} -> ${STATUS_LABELS[next] || next}`,
        type: "ok",
      });
      refetch();
    } catch (error) {
      setToast({ msg: getErrorMessage(error), type: "err" });
    } finally {
      setUpdatingItemKey(null);
    }
  }

  function tableLabel(item: KitchenQueueItem): string {
    if (item.tableName) return item.tableName;
    if (item.table?.name) return item.table.name;
    if (item.table?.number) return `Table ${item.table.number}`;
    return "Table";
  }

  function ageLabel(item: KitchenQueueItem): string {
    if (typeof item.ageMinutes === "number") return `${item.ageMinutes} min`;
    return timeAgo(item.addedAt);
  }

  return (
    <div>
      <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
        <div className="border-b border-[#eee7d8] px-2.5 py-2.5 sm:px-4 sm:py-3">
          <div className="mt-2.5 rounded-xl border border-[#eadfc9] bg-[#fffaf1] p-2.5 sm:mt-3 sm:p-3">
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col items-center leading-none">
                <span className="text-lg font-bold text-slate-700">
                  {filteredItems.length}
                </span>
                <span className="text-[10px] font-medium text-slate-700">
                  items
                </span>
              </div>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search table or item..."
                className="h-10 min-w-0 flex-1 rounded-xl border border-[#dcccaf] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              />
              <div className="flex shrink-0 items-center rounded-lg border border-[#dccfb8] bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${viewMode === "cards" ? "bg-[#f6ead4] text-[#7a5a34]" : "text-slate-600"}`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${viewMode === "table" ? "bg-[#f6ead4] text-[#7a5a34]" : "text-slate-600"}`}
                >
                  Table
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-10 md:items-center">
              <div className="md:col-span-7">
                <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar">
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusFilter === "all" ? "border-amber-300 bg-amber-100 text-amber-800" : "border-[#ddcfb7] bg-white text-slate-700"}`}
                  >
                    All {queueItems.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("PLACED")}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusFilter === "PLACED" ? "border-amber-300 bg-amber-100 text-amber-800" : "border-[#ddcfb7] bg-white text-slate-700"}`}
                  >
                    New {statusCounts.PLACED}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("IN_PROGRESS")}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusFilter === "IN_PROGRESS" ? "border-rose-300 bg-rose-100 text-rose-800" : "border-[#ddcfb7] bg-white text-slate-700"}`}
                  >
                    Cooking {statusCounts.IN_PROGRESS}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("READY")}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusFilter === "READY" ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-[#ddcfb7] bg-white text-slate-700"}`}
                  >
                    Ready {statusCounts.READY}
                  </button>
                  <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                    Orders {uniqueOrderCount}
                  </span>
                </div>
              </div>
              <div className="md:col-span-3">
                <div className="flex items-center justify-start gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    {isFetching ? "Refreshing..." : "Refresh"}
                  </button>
                  <LiveBadge connected={socketConnected} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-2.5 sm:p-4">
          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
              No kitchen items found.
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
              {KOT_COLUMNS.map((col) => (
                <article
                  key={col.status}
                  className={`rounded-2xl border ${col.border} ${col.bg} p-2 shadow-sm sm:p-2.5`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wide ${col.color}`}
                    >
                      {col.label}
                    </p>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${col.color} ${col.bg}`}
                    >
                      {groupedByStatus[col.status]?.length ?? 0}
                    </span>
                  </div>
                  <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                    {groupedByStatus[col.status]?.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-current/20 py-6 text-center text-xs opacity-60">
                        No items
                      </div>
                    ) : (
                      groupedByStatus[col.status].map((item) => {
                        const status = normalizeStatus(item.kitchenStatus);
                        const nextStatus = nextKitchenItemStatus(status);
                        const actionKey = `${item.orderId}:${item.lineId}:${nextStatus || "none"}`;
                        const customerLabel = kitchenCustomerLabel(item);
                        const displayNote = kitchenDisplayNote(item);

                        return (
                          <div
                            key={`${item.orderId}-${item.lineId}`}
                            className="rounded-xl border border-white/70 bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-900">
                                  {tableLabel(item)}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {item.orderNumber
                                    ? `Order ${item.orderNumber}`
                                    : item.orderId.slice(-6)}
                                </p>
                              </div>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${itemStatusClass(status)}`}
                              >
                                {itemStatusLabel(status)}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.source ? (
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                  {item.source}
                                </span>
                              ) : null}
                              {item.orderStatus ? (
                                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  Order {itemStatusLabel(item.orderStatus)}
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {item.quantity}x {item.name}
                              {item.variantName ? ` (${item.variantName})` : ""}
                            </p>
                            {customerLabel ? (
                              <p className="mt-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                                Customer: {customerLabel}
                              </p>
                            ) : null}
                            {displayNote ? (
                              <p className="mt-0.5 text-[11px] italic text-amber-700">
                                {displayNote}
                              </p>
                            ) : null}

                            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                              <span>Age: {ageLabel(item)}</span>
                              {item.priorityLabel ? (
                                <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                                  {item.priorityLabel}
                                </span>
                              ) : null}
                            </div>

                            {nextStatus ? (
                              <button
                                type="button"
                                onClick={() => bumpItem(item, nextStatus)}
                                disabled={updatingItemKey === actionKey}
                                className={`mt-2 w-full rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white shadow transition active:scale-95 disabled:opacity-50 ${status === "PLACED" ? "bg-red-500" : "bg-emerald-500"}`}
                              >
                                {updatingItemKey === actionKey
                                  ? "Updating..."
                                  : kitchenItemActionLabel(nextStatus)}
                              </button>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="max-h-[68vh] overflow-auto">
                <table className="min-w-[940px] w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Table</th>
                      <th className="px-3 py-2 font-semibold">Order</th>
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold">Qty</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Age</th>
                      <th className="px-3 py-2 font-semibold">Priority</th>
                      <th className="px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((item) => {
                      const status = normalizeStatus(item.kitchenStatus);
                      const nextStatus = nextKitchenItemStatus(status);
                      const actionKey = `${item.orderId}:${item.lineId}:${nextStatus || "none"}`;
                      const customerLabel = kitchenCustomerLabel(item);
                      const displayNote = kitchenDisplayNote(item);

                      return (
                        <tr
                          key={`${item.orderId}-${item.lineId}`}
                          className="border-t border-slate-100 align-top"
                        >
                          <td className="px-3 py-2">
                            <p className="font-semibold text-slate-900">
                              {tableLabel(item)}
                            </p>
                            <p className="text-slate-500">
                              {item.table?.number
                                ? `T${item.table.number}`
                                : "-"}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            <p>{item.orderNumber || item.orderId.slice(-6)}</p>
                            <p className="text-[11px] text-slate-500">
                              {item.source || "-"}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">
                              {item.name}
                              {item.variantName ? ` (${item.variantName})` : ""}
                            </p>
                            {customerLabel ? (
                              <p className="text-[11px] font-medium text-sky-700">
                                Customer: {customerLabel}
                              </p>
                            ) : null}
                            {displayNote ? (
                              <p className="text-[11px] italic text-amber-700">
                                {displayNote}
                              </p>
                            ) : null}
                            {item.orderStatus ? (
                              <p className="text-[11px] font-medium text-indigo-700">
                                Order: {itemStatusLabel(item.orderStatus)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-700">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${itemStatusClass(status)}`}
                            >
                              {itemStatusLabel(status)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {ageLabel(item)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {item.priorityLabel || "-"}
                          </td>
                          <td className="px-3 py-2">
                            {nextStatus ? (
                              <button
                                type="button"
                                onClick={() => bumpItem(item, nextStatus)}
                                disabled={updatingItemKey === actionKey}
                                className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                              >
                                {updatingItemKey === actionKey
                                  ? "Updating..."
                                  : kitchenItemActionLabel(nextStatus)}
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                -
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
// Main Workspace

type Props = {
  rawRole?: string;
};

export function OrdersWorkspace({ rawRole }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = normalizeRole(rawRole);
  const routeTableId = searchParams.get("tableId")?.trim() || undefined;
  const routeNewOrder = searchParams.get("new") === "1";
  const routeSelectTablePage = pathname === "/dashboard/orders/new";
  const routeSelectItemsPage = pathname === "/dashboard/orders/items";
  const [toast, setToast] = useState<{
    msg: string;
    type: "ok" | "err";
  } | null>(null);
  const isWaiter = role === "waiter";
  const isKitchen = role === "kitchen";
  const splitComposerMode = routeSelectTablePage
    ? "select-table"
    : routeSelectItemsPage
      ? "select-items"
      : isWaiter
        ? "live-board"
        : "board";
  const forceOrderComposer =
    !isKitchen &&
    (routeNewOrder ||
      Boolean(routeTableId) ||
      routeSelectTablePage ||
      routeSelectItemsPage);
  const showWaiterView = isWaiter || forceOrderComposer;

  const handleOrderPlaced = useCallback(() => {
    setToast({ msg: "Order placed!", type: "ok" });
    if (
      routeNewOrder ||
      routeTableId ||
      routeSelectTablePage ||
      routeSelectItemsPage
    ) {
      router.push("/dashboard/orders");
    }
  }, [
    routeNewOrder,
    routeSelectItemsPage,
    routeSelectTablePage,
    routeTableId,
    router,
  ]);

  useEffect(() => {
    if (!toast) return;
    if (toast.type === "ok") showSuccess(toast.msg);
    else showError(toast.msg);
    const timer = window.setTimeout(() => setToast(null), 0);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div className="h-full">
      {showWaiterView ? (
        <>
          {/* <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">
              {routeSelectTablePage
                ? "Select Table"
                : routeSelectItemsPage
                  ? "Select Items"
                  : isWaiter
                    ? "Waiter Orders"
                    : forceOrderComposer && !isWaiter
                      ? "Create / Update Order"
                      : "Take Order"}
            </h2>
            <p className="text-xs text-slate-500">
              {routeSelectTablePage
                ? "Open table picker on its own page, then continue to menu selection."
                : routeSelectItemsPage
                  ? "Choose item variants, add them quickly, and place the order."
                  : isWaiter
                    ? "Ready, cooking, aur billing-wale waiter orders ko is page se handle karo."
                    : routeTableId
                      ? "Selected table opened. Add items to append in the same active order."
                      : "Pick a table, add items, and place the order in 3 taps."}
            </p>
          </div> */}
          <WaiterView
            onOrderPlaced={handleOrderPlaced}
            initialTableId={routeTableId}
            mode={splitComposerMode}
          />
        </>
      ) : isKitchen ? (
        <>
        
          <KitchenView />
        </>
      ) : (
        <>
         
          <ManagerView role={role} />
        </>
      )}
    </div>
  );
}
