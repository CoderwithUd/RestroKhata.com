"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/constants";

type PublicVariant = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type PublicItem = {
  id: string;
  name: string;
  description?: string;
  image?: string;
  isAvailable: boolean;
  variants: PublicVariant[];
};

type PublicCategory = {
  id: string;
  name: string;
  items: PublicItem[];
  children: PublicCategory[];
};

type PublicMenuPayload = {
  tenant?: {
    id?: string;
    name?: string;
    slug?: string;
  };
  table?: {
    id?: string;
    number?: number;
    name?: string;
  };
  categories: PublicCategory[];
};

type PublicCartEntry = {
  key: string;
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  image?: string;
};

type PublicOrderItem = {
  lineId?: string;
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  note?: string;
  lineTotal?: number;
  kitchenStatus?: string;
};

type PublicOrder = {
  id: string;
  status: string;
  sessionToken?: string;
  note?: string;
  items: PublicOrderItem[];
  subTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  invoiceRequest?: {
    requestedAt?: string;
  } | null;
};

type PublicInvoice = {
  id: string;
  status: string;
  items: PublicOrderItem[];
  subTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  totalDue?: number;
  balanceDue?: number;
  discountAmount?: number;
};

type PublicQrMenuProps = {
  tenantSlug?: string;
};

const CONTACT_STORAGE_KEY = "restro-public-order-contact";
const QR_SESSION_STORAGE_PREFIX = "restro-public-order-session";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "active", "available"].includes(normalized))
      return true;
    if (["false", "0", "no", "inactive", "unavailable"].includes(normalized))
      return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
}

function parseVariant(value: unknown): PublicVariant | null {
  const record = asRecord(value);
  if (!record) return null;

  const name = asString(record.name) || "Regular";
  const price = asNumber(record.price) ?? 0;
  const id =
    asString(record.id) ||
    asString(record._id) ||
    asString(record.variantId) ||
    `${name}-${price}`;
  if (!id) return null;

  return {
    id,
    name,
    price,
    isAvailable:
      asBoolean(record.isAvailable) ?? asBoolean(record.isActive) ?? true,
  };
}

function parseItem(value: unknown): PublicItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const id =
    asString(record.id) || asString(record._id) || asString(record.itemId);
  if (!id) return null;

  const variants = asArray(record.variants)
    .map(parseVariant)
    .filter((variant): variant is PublicVariant => Boolean(variant));
  const fallbackPrice = asNumber(record.price);
  const resolvedVariants =
    variants.length || fallbackPrice === undefined
      ? variants
      : [
          {
            id: `${id}-regular`,
            name: "Regular",
            price: fallbackPrice,
            isAvailable:
              asBoolean(record.isAvailable) ??
              asBoolean(record.isActive) ??
              true,
          },
        ];

  return {
    id,
    name: asString(record.name) || "Untitled Item",
    description: asString(record.description) || asString(record.desc),
    image:
      asString(record.image) ||
      asString(record.imageUrl) ||
      asString(record.thumbnail),
    isAvailable:
      asBoolean(record.isAvailable) ??
      asBoolean(record.isActive) ??
      (resolvedVariants.length
        ? resolvedVariants.some((variant) => variant.isAvailable)
        : true),
    variants: resolvedVariants,
  };
}

function parseCategory(value: unknown): PublicCategory | null {
  const record = asRecord(value);
  if (!record) return null;

  const id =
    asString(record.id) || asString(record._id) || asString(record.categoryId);
  if (!id) return null;

  return {
    id,
    name: asString(record.name) || "Category",
    items: asArray(record.items || record.menuItems)
      .map(parseItem)
      .filter((item): item is PublicItem => Boolean(item)),
    children: asArray(
      record.children || record.subCategories || record.subcategories,
    )
      .map(parseCategory)
      .filter((category): category is PublicCategory => Boolean(category)),
  };
}

function parsePayload(data: unknown): PublicMenuPayload {
  const rawRoot = asRecord(data);
  if (!rawRoot) {
    return { categories: [] };
  }

  const root = asRecord(rawRoot.data) || rawRoot;
  const menuRoot = asRecord(root.menu) || root;
  const tableRecord =
    asRecord(menuRoot.table) || asRecord(root.table) || asRecord(rawRoot.table);
  const tenantRecord =
    asRecord(menuRoot.tenant) ||
    asRecord(root.tenant) ||
    asRecord(rawRoot.tenant);
  const categoriesSource =
    asArray(menuRoot.categories).length > 0
      ? menuRoot.categories
      : asArray(root.categories).length > 0
        ? root.categories
        : rawRoot.categories;

  return {
    tenant: {
      id: asString(tenantRecord?.id) || asString(tenantRecord?._id),
      name: asString(tenantRecord?.name),
      slug: asString(tenantRecord?.slug),
    },
    table: tableRecord
      ? {
          id: asString(tableRecord.id) || asString(tableRecord._id),
          number: asNumber(tableRecord.number),
          name: asString(tableRecord.name),
        }
      : undefined,
    categories: asArray(categoriesSource)
      .map(parseCategory)
      .filter((category): category is PublicCategory => Boolean(category)),
  };
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function flattenCategoryTree(
  categories: PublicCategory[],
  depth = 0,
): Array<{ category: PublicCategory; depth: number }> {
  return categories.flatMap((category) => [
    { category, depth },
    ...flattenCategoryTree(category.children, depth + 1),
  ]);
}

function entryKey(itemId: string, variantId?: string): string {
  return `${itemId}::${variantId || "base"}`;
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function sessionStorageKey(args: {
  token?: string;
  tenantSlug?: string;
  tableId?: string;
  tableNumber?: string;
}): string {
  return [
    QR_SESSION_STORAGE_PREFIX,
    args.token || "no-token",
    args.tenantSlug || "no-tenant",
    args.tableId || "no-table",
    args.tableNumber || "no-number",
  ].join(":");
}

function buildPublicOrderLocator(args: {
  token?: string;
  tenantSlug?: string;
  tableId?: string;
  tableNumber?: string;
  sessionToken?: string;
}): Record<string, string | number> {
  const payload: Record<string, string | number> = {};

  if (args.token) {
    payload.token = args.token;
  } else {
    if (args.tenantSlug) payload.tenantSlug = args.tenantSlug;
    if (args.tableId) payload.tableId = args.tableId;
    if (!args.tableId && args.tableNumber) {
      const parsedTableNumber = Number(args.tableNumber);
      payload.tableNumber = Number.isFinite(parsedTableNumber)
        ? parsedTableNumber
        : args.tableNumber;
    }
  }

  if (args.sessionToken) payload.sessionToken = args.sessionToken;
  return payload;
}

function availableVariants(item: PublicItem): PublicVariant[] {
  const available = item.variants.filter((variant) => variant.isAvailable);
  return available.length ? available : item.variants;
}

function resolveDefaultVariant(
  item: PublicItem,
  selectedVariants: Record<string, string | undefined>,
): PublicVariant | undefined {
  const variants = availableVariants(item);
  if (!variants.length) return undefined;
  return (
    variants.find((variant) => variant.id === selectedVariants[item.id]) ||
    variants[0]
  );
}

function normalizeStatus(value: string | undefined): string {
  return (value || "").toUpperCase();
}

function parsePublicOrderItem(value: unknown): PublicOrderItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const itemId =
    asString(record.itemId) || asString(record.id) || asString(record._id);
  if (!itemId) return null;

  return {
    lineId:
      asString(record.lineId) ||
      asString(record.lineItemId) ||
      asString(record.itemLineId),
    itemId,
    variantId: asString(record.variantId),
    name: asString(record.name) || "Item",
    variantName: asString(record.variantName),
    quantity: asNumber(record.quantity) ?? 1,
    unitPrice: asNumber(record.unitPrice) ?? asNumber(record.price) ?? 0,
    note: asString(record.note),
    lineTotal: asNumber(record.lineTotal),
    kitchenStatus:
      asString(record.kitchenStatus) ||
      asString(record.status) ||
      asString(record.itemStatus),
  };
}

function parsePublicOrder(value: unknown): PublicOrder | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id);
  if (!id) return null;

  const invoiceRequest = asRecord(record.invoiceRequest);

  return {
    id,
    status: asString(record.status) || "PLACED",
    sessionToken: asString(record.sessionToken),
    note: asString(record.note),
    items: asArray(record.items)
      .map(parsePublicOrderItem)
      .filter((item): item is PublicOrderItem => Boolean(item)),
    subTotal: asNumber(record.subTotal),
    taxTotal: asNumber(record.taxTotal) ?? asNumber(record.tax),
    grandTotal: asNumber(record.grandTotal) ?? asNumber(record.total),
    invoiceRequest: invoiceRequest
      ? {
          requestedAt: asString(invoiceRequest.requestedAt),
        }
      : null,
  };
}

function parsePublicInvoice(value: unknown): PublicInvoice | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id);
  if (!id) return null;

  const discountRecord = asRecord(record.discount);

  return {
    id,
    status: asString(record.status) || "ISSUED",
    items: asArray(record.items)
      .map(parsePublicOrderItem)
      .filter((item): item is PublicOrderItem => Boolean(item)),
    subTotal: asNumber(record.subTotal),
    taxTotal: asNumber(record.taxTotal) ?? asNumber(record.tax),
    grandTotal: asNumber(record.grandTotal) ?? asNumber(record.total),
    totalDue: asNumber(record.totalDue),
    balanceDue: asNumber(record.balanceDue),
    discountAmount: asNumber(discountRecord?.amount) ?? 0,
  };
}

function lineAmount(item: PublicOrderItem): number {
  return item.lineTotal ?? item.unitPrice * item.quantity;
}

function isPlacedLine(item: PublicOrderItem): boolean {
  return normalizeStatus(item.kitchenStatus) === "PLACED";
}

function canCreatePublicInvoice(order: PublicOrder | null): boolean {
  if (!order || !order.items.length) return false;
  return order.items.every((item) => {
    const status = normalizeStatus(item.kitchenStatus);
    return status === "SERVED" || status === "CANCELLED";
  });
}

function canCancelPublicOrder(order: PublicOrder | null, invoice: PublicInvoice | null): boolean {
  if (!order || invoice || !order.items.length) return false;
  return order.items.every((item) => isPlacedLine(item));
}

function publicItemStatusLabel(status?: string): string {
  const normalized = normalizeStatus(status);
  if (normalized === "IN_PROGRESS") return "Cooking";
  if (normalized === "READY") return "Ready";
  if (normalized === "SERVED") return "Served";
  if (normalized === "CANCELLED") return "Cancelled";
  return "Placed";
}

function publicItemStatusClass(status?: string): string {
  const normalized = normalizeStatus(status);
  if (normalized === "IN_PROGRESS") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "SERVED") return "border-sky-200 bg-sky-50 text-sky-700";
  if (normalized === "CANCELLED") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function SummaryPanel({
  tableLabel,
  cart,
  customerName,
  customerPhone,
  note,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onNoteChange,
  onIncrement,
  onDecrement,
  onSubmit,
  submitting,
  canSubmit,
  orderEnabled,
  helperText,
  compact = false,
}: {
  tableLabel: string;
  cart: PublicCartEntry[];
  customerName: string;
  customerPhone: string;
  note: string;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onIncrement: (entry: PublicCartEntry) => void;
  onDecrement: (entry: PublicCartEntry) => void;
  onSubmit: () => void;
  submitting: boolean;
  canSubmit: boolean;
  orderEnabled: boolean;
  helperText?: string;
  compact?: boolean;
}) {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  return (
    <div
      className={`rounded-[28px] border border-[#ded2be] bg-white/95 shadow-[0_24px_60px_-35px_rgba(120,76,22,0.35)] backdrop-blur ${compact ? "p-4" : "p-5"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9b6a2f]">
            Your Order
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            {tableLabel}
          </h2>
        </div>
        <span className="rounded-full border border-[#ead9bf] bg-[#fff5df] px-3 py-1 text-xs font-semibold text-[#8b5b22]">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>
      </div>

      <div
        className={`mt-4 ${compact ? "max-h-48" : "max-h-72"} space-y-3 overflow-y-auto pr-1`}
      >
        {cart.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dfd1bc] bg-[#fcfaf6] px-4 py-8 text-center text-sm text-slate-500">
            Cart abhi empty hai. Menu se items add karo.
          </div>
        ) : (
          cart.map((item) => (
            <div
              key={item.key}
              className="flex items-start gap-3 rounded-2xl border border-[#efe4d3] bg-[#fffdfa] p-3"
            >
              {item.image ? (
                <div className="h-14 w-14 overflow-hidden rounded-2xl border border-[#ece2d3] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#ece2d3] bg-[#fff6e8] text-xs font-semibold text-[#9b6a2f]">
                  {item.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                  {item.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.variantName || "Regular"}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#9b6a2f]">
                  {formatMoney(item.unitPrice)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 rounded-full border border-[#ead9bf] bg-white px-1 py-1">
                  <button
                    type="button"
                    onClick={() => onDecrement(item)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[#d8c7b1] text-sm font-bold text-slate-700"
                  >
                    -
                  </button>
                  <span className="w-5 text-center text-sm font-bold text-slate-900">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onIncrement(item)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[#c97d25] text-sm font-bold text-white"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs font-semibold text-slate-700">
                  {formatMoney(item.quantity * item.unitPrice)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 space-y-3">
        <div className="grid gap-3">
          <input
            value={customerName}
            onChange={(event) => onCustomerNameChange(event.target.value)}
            placeholder="Your name"
            className="h-12 rounded-2xl border border-[#ddcfba] bg-[#fffdfa] px-4 text-sm text-slate-900 outline-none ring-[#f5d39c] transition focus:ring-2"
          />
          <input
            value={customerPhone}
            onChange={(event) => onCustomerPhoneChange(event.target.value)}
            placeholder="Mobile number"
            inputMode="tel"
            className="h-12 rounded-2xl border border-[#ddcfba] bg-[#fffdfa] px-4 text-sm text-slate-900 outline-none ring-[#f5d39c] transition focus:ring-2"
          />
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Any note for kitchen? Optional"
            rows={compact ? 3 : 4}
            className="rounded-2xl border border-[#ddcfba] bg-[#fffdfa] px-4 py-3 text-sm text-slate-900 outline-none ring-[#f5d39c] transition focus:ring-2"
          />
        </div>

        <div className="rounded-2xl border border-[#efe4d3] bg-[#fcfaf6] p-4">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Items total</span>
            <span className="font-semibold text-slate-900">
              {formatMoney(total)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-base font-semibold text-slate-900">
            <span>Grand total</span>
            <span>{formatMoney(total)}</span>
          </div>
          {helperText ? (
            <p className="mt-2 text-xs text-slate-500">{helperText}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded-[22px] bg-[linear-gradient(135deg,#d18226_0%,#b36418_100%)] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_-18px_rgba(179,100,24,0.7)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting
            ? "Placing order..."
            : orderEnabled
              ? "Place Order"
              : "Ordering unavailable"}
        </button>
      </div>
    </div>
  );
}

function CurrentOrderPanel({
  order,
  invoice,
  busyLineId,
  invoiceBusy,
  onRefresh,
  onIncrement,
  onDecrement,
  onDelete,
  onCancelOrder,
  onRequestInvoice,
  onCreateInvoice,
}: {
  order: PublicOrder | null;
  invoice: PublicInvoice | null;
  busyLineId?: string | null;
  invoiceBusy?: boolean;
  onRefresh: () => void;
  onIncrement: (item: PublicOrderItem) => void;
  onDecrement: (item: PublicOrderItem) => void;
  onDelete: (item: PublicOrderItem) => void;
  onCancelOrder: () => void;
  onRequestInvoice: () => void;
  onCreateInvoice: () => void;
}) {
  if (!order && !invoice) return null;

  const statusCounts = order?.items.reduce<Record<string, number>>((accumulator, item) => {
    const key = normalizeStatus(item.kitchenStatus) || "PLACED";
    accumulator[key] = (accumulator[key] || 0) + item.quantity;
    return accumulator;
  }, {});
  const canCancelOrder = canCancelPublicOrder(order, invoice);

  return (
    <section className="rounded-[28px] border border-[#e5d8c5] bg-white/95 p-4 shadow-[0_18px_50px_-38px_rgba(110,72,23,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9b6a2f]">
            Current Order
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {order ? (
              <span className="rounded-full border border-[#ead9bf] bg-[#fff5df] px-3 py-1 text-xs font-semibold text-[#8b5b22]">
                Order {order.status}
              </span>
            ) : null}
            {invoice ? (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Invoice {invoice.status}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
        >
          Refresh
        </button>
      </div>

      {order ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            {(["PLACED", "IN_PROGRESS", "READY", "SERVED"] as const).map((status) => (
              <div key={status} className="rounded-2xl border border-[#efe4d3] bg-[#fcfaf6] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {publicItemStatusLabel(status)}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{statusCounts?.[status] || 0}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {order.items.map((item, index) => {
              const isPlaced = isPlacedLine(item);
              const lineId = item.lineId || `${item.itemId}-${index}`;
              const isBusy = busyLineId === lineId;
              return (
                <div
                  key={lineId}
                  className="rounded-2xl border border-[#efe4d3] bg-[#fffdfa] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.quantity}x {item.name}
                        {item.variantName ? ` (${item.variantName})` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className={`rounded-full border px-2.5 py-1 font-semibold ${publicItemStatusClass(item.kitchenStatus)}`}>
                          {publicItemStatusLabel(item.kitchenStatus)}
                        </span>
                        <span>{formatMoney(lineAmount(item))}</span>
                      </div>
                      {item.note ? (
                        <p className="mt-1 text-xs italic text-amber-700">
                          {item.note}
                        </p>
                      ) : null}
                    </div>
                    {isPlaced && !invoice ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onDecrement(item)}
                          disabled={isBusy}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8c7b1] text-base font-bold text-slate-700 disabled:opacity-50"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => onIncrement(item)}
                          disabled={isBusy}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c97d25] text-base font-bold text-white disabled:opacity-50"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item)}
                          disabled={isBusy}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-[#efe4d3] bg-[#fcfaf6] p-4 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Subtotal</span>
              <span>
                {formatMoney(order.subTotal ?? order.grandTotal ?? 0)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-slate-600">
              <span>Tax</span>
              <span>{formatMoney(order.taxTotal ?? 0)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatMoney(order.grandTotal ?? 0)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {!invoice ? (
                <button
                  type="button"
                  onClick={onRequestInvoice}
                  disabled={invoiceBusy || Boolean(order.invoiceRequest)}
                  className="rounded-[18px] border border-[#ead9bf] bg-[#fff5df] px-4 py-2.5 text-sm font-semibold text-[#8b5b22] disabled:opacity-50"
                >
                  {order.invoiceRequest ? "Bill Requested" : "Request Bill"}
                </button>
              ) : null}
              {canCreatePublicInvoice(order) && !invoice ? (
                <button
                  type="button"
                  onClick={onCreateInvoice}
                  disabled={invoiceBusy}
                  className="rounded-[18px] bg-[linear-gradient(135deg,#d18226_0%,#b36418_100%)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45"
                >
                  {invoiceBusy ? "Creating..." : "Create Invoice"}
                </button>
              ) : null}
              {!invoice && order && !canCreatePublicInvoice(order) ? (
                <button
                  type="button"
                  disabled
                  className="rounded-[18px] border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-500"
                >
                  Create Invoice After Serve
                </button>
              ) : null}
              {canCancelOrder ? (
                <button
                  type="button"
                  onClick={onCancelOrder}
                  disabled={invoiceBusy}
                  className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50"
                >
                  Cancel Full Order
                </button>
              ) : null}
              {!invoice ? (
                <p className="self-center text-xs text-slate-500">
                  {canCancelOrder
                    ? "Cooking start hone se pehle aap pura order cancel bhi kar sakte ho."
                    : !canCreatePublicInvoice(order)
                      ? "Invoice tabhi banega jab sab items served ya cancelled ho jayenge."
                    : "Final payment sirf manager ya owner karega."}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {invoice ? (
        <div className="mt-4 rounded-[24px] border border-[#dfd2bb] bg-[linear-gradient(170deg,#fffef9_0%,#fff6e8_100%)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Invoice Preview
          </p>
          <div className="mt-3 space-y-2 border-t border-dashed border-[#d8ccb6] pt-3">
            {invoice.items.map((item, index) => (
              <div
                key={`${invoice.id}-${item.itemId}-${item.variantId || "base"}-${index}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {index + 1}. {item.name}
                    {item.variantName ? ` (${item.variantName})` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.quantity} x {formatMoney(item.unitPrice)}
                  </p>
                </div>
                <p className="font-semibold text-slate-900">
                  {formatMoney(lineAmount(item))}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatMoney(invoice.subTotal ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Tax</span>
              <span>{formatMoney(invoice.taxTotal ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Discount</span>
              <span>{formatMoney(invoice.discountAmount ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-[#d8ccb6] pt-2 text-base font-semibold text-slate-900">
              <span>Total Due</span>
              <span>
                {formatMoney(
                  invoice.balanceDue ??
                    invoice.totalDue ??
                    invoice.grandTotal ??
                    0,
                )}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Invoice ban chuka hai. Final pay manager ya owner counter se karega.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function PublicQrMenu({
  tenantSlug: tenantSlugFromPath,
}: PublicQrMenuProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<PublicMenuPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string | undefined>
  >({});
  const [cart, setCart] = useState<PublicCartEntry[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [currentOrder, setCurrentOrder] = useState<PublicOrder | null>(null);
  const [currentInvoice, setCurrentInvoice] = useState<PublicInvoice | null>(
    null,
  );
  const [currentOrderError, setCurrentOrderError] = useState("");
  const [isCurrentOrderLoading, setIsCurrentOrderLoading] = useState(false);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const token = searchParams.get("token")?.trim() || "";
  const tenantSlug =
    searchParams.get("tenantSlug")?.trim() || tenantSlugFromPath?.trim() || "";
  const tableId = searchParams.get("tableId")?.trim() || "";
  const tableNumber = searchParams.get("tableNumber")?.trim() || "";
  const queryKey = `${tenantSlugFromPath || ""}:${searchParams.toString()}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(CONTACT_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        customerName?: string;
        customerPhone?: string;
      };
      if (parsed.customerName) setCustomerName(parsed.customerName);
      if (parsed.customerPhone) setCustomerPhone(parsed.customerPhone);
    } catch {
      window.localStorage.removeItem(CONTACT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      CONTACT_STORAGE_KEY,
      JSON.stringify({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
      }),
    );
  }, [customerName, customerPhone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = sessionStorageKey({ token, tenantSlug, tableId, tableNumber });
    const stored = window.localStorage.getItem(key);
    if (stored) setSessionToken(stored);
    else setSessionToken("");
  }, [tableId, tableNumber, tenantSlug, token]);

  useEffect(() => {
    const controller = new AbortController();
    if (!token && !tenantSlug) {
      setData(null);
      setIsLoading(false);
      setError("QR URL invalid hai. Token ya tenantSlug missing hai.");
      return () => controller.abort();
    }

    async function fetchMenu() {
      setIsLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (token) {
        params.set("token", token);
      } else {
        if (tenantSlug) params.set("tenantSlug", tenantSlug);
        if (tableId) params.set("tableId", tableId);
        if (tableNumber) params.set("tableNumber", tableNumber);
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/public/menu?${params.toString()}`,
          {
            method: "GET",
            credentials: "omit",
            signal: controller.signal,
          },
        );

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            asString((body as Record<string, unknown>)?.message) ||
            "Public menu load failed";
          throw new Error(message);
        }

        setData(parsePayload(body));
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setData(null);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Public menu load failed",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    fetchMenu();
    return () => controller.abort();
  }, [queryKey, searchParams, tableId, tableNumber, tenantSlug, token]);

  const flatCategories = useMemo(
    () => flattenCategoryTree(data?.categories || []),
    [data?.categories],
  );
  const categoriesWithItems = useMemo(
    () => flatCategories.filter(({ category }) => category.items.length > 0),
    [flatCategories],
  );

  const visibleSections = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return categoriesWithItems
      .map(({ category, depth }) => {
        if (activeCategoryId !== "all" && category.id !== activeCategoryId)
          return null;

        const items = category.items.filter((item) => {
          if (!searchValue) return true;
          const text = [
            item.name,
            item.description,
            ...item.variants.map((variant) => variant.name),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return text.includes(searchValue);
        });

        if (!items.length) return null;
        return { category, depth, items };
      })
      .filter(
        (
          section,
        ): section is {
          category: PublicCategory;
          depth: number;
          items: PublicItem[];
        } => Boolean(section),
      );
  }, [activeCategoryId, categoriesWithItems, search]);

  const itemCount = useMemo(
    () =>
      visibleSections.reduce((sum, section) => sum + section.items.length, 0),
    [visibleSections],
  );
  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [cart],
  );
  const tenantName = data?.tenant?.name || data?.tenant?.slug || "Restaurant";
  const tableLabel =
    data?.table?.name ||
    (Number.isFinite(data?.table?.number)
      ? `Table ${data?.table?.number}`
      : "Guest order");
  const resolvedTableId = tableId || data?.table?.id || "";
  const resolvedTableNumber =
    tableNumber ||
    (typeof data?.table?.number === "number" ? String(data.table.number) : "");
  const orderEnabled = Boolean(
    token || (tenantSlug && (resolvedTableId || resolvedTableNumber)),
  );
  const publicOrderLocator = useMemo(
    () =>
      buildPublicOrderLocator({
        token,
        tenantSlug,
        tableId: resolvedTableId,
        tableNumber: resolvedTableNumber,
        sessionToken,
      }),
    [resolvedTableId, resolvedTableNumber, sessionToken, tenantSlug, token],
  );

  const publicHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(tenantSlug ? { "x-tenant-slug": tenantSlug } : {}),
    }),
    [tenantSlug],
  );

  const refreshCurrentOrder = useCallback(async () => {
    if (!sessionToken || (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))) {
      setCurrentOrder(null);
      setCurrentInvoice(null);
      setCurrentOrderError("");
      return;
    }

    setIsCurrentOrderLoading(true);
    setCurrentOrderError("");

    try {
      const params = new URLSearchParams();
      Object.entries(publicOrderLocator).forEach(([key, value]) => {
        params.set(key, String(value));
      });
      const response = await fetch(
        `${API_BASE_URL}/public/orders/current?${params.toString()}`,
        {
          method: "GET",
          headers: tenantSlug ? { "x-tenant-slug": tenantSlug } : undefined,
          credentials: "omit",
        },
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          asString((body as Record<string, unknown>)?.message) ||
          "Current order load failed";
        throw new Error(message);
      }

      const root = asRecord(body);
      setCurrentOrder(parsePublicOrder(root?.order));
      setCurrentInvoice(parsePublicInvoice(root?.invoice));
    } catch (issue) {
      setCurrentOrder(null);
      setCurrentInvoice(null);
      setCurrentOrderError(
        issue instanceof Error ? issue.message : "Current order load failed",
      );
    } finally {
      setIsCurrentOrderLoading(false);
    }
  }, [publicOrderLocator, resolvedTableId, resolvedTableNumber, sessionToken, tenantSlug, token]);

  useEffect(() => {
    refreshCurrentOrder();
  }, [refreshCurrentOrder]);

  useEffect(() => {
    if (!categoriesWithItems.length) {
      setActiveCategoryId("all");
      return;
    }
    const exists = categoriesWithItems.some(
      ({ category }) => category.id === activeCategoryId,
    );
    if (activeCategoryId !== "all" && !exists) {
      setActiveCategoryId("all");
    }
  }, [activeCategoryId, categoriesWithItems]);

  function setItemVariant(itemId: string, variantId?: string) {
    setSelectedVariants((previous) => ({ ...previous, [itemId]: variantId }));
  }

  function getQuantity(itemId: string, variantId?: string): number {
    return (
      cart.find((entry) => entry.key === entryKey(itemId, variantId))
        ?.quantity ?? 0
    );
  }

  function incrementEntry(
    item: PublicItem,
    variant: PublicVariant | undefined,
  ) {
    const key = entryKey(item.id, variant?.id);

    setCart((previous) => {
      const existing = previous.find((entry) => entry.key === key);
      if (existing) {
        return previous.map((entry) =>
          entry.key === key
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [
        ...previous,
        {
          key,
          itemId: item.id,
          variantId: variant?.id,
          name: item.name,
          variantName: variant?.name,
          quantity: 1,
          unitPrice: variant?.price ?? 0,
          image: item.image,
        },
      ];
    });
  }

  function decrementEntry(itemId: string, variantId?: string) {
    const key = entryKey(itemId, variantId);
    setCart((previous) => {
      const target = previous.find((entry) => entry.key === key);
      if (!target) return previous;
      if (target.quantity <= 1)
        return previous.filter((entry) => entry.key !== key);
      return previous.map((entry) =>
        entry.key === key ? { ...entry, quantity: entry.quantity - 1 } : entry,
      );
    });
  }

  async function handleSubmitOrder() {
    const trimmedName = customerName.trim();
    const normalizedPhone = normalizePhone(customerPhone.trim());

    if (!orderEnabled) {
      setSubmitError("Is QR link me valid static table details missing hain.");
      return;
    }
    if (!cart.length) {
      setSubmitError("Kam se kam ek item add karo.");
      return;
    }
    if (!trimmedName) {
      setSubmitError("Customer name required hai.");
      return;
    }
    if (!normalizedPhone || normalizedPhone.replace(/\D/g, "").length < 10) {
      setSubmitError("Valid mobile number enter karo.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const response = await fetch(`${API_BASE_URL}/public/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tenantSlug ? { "x-tenant-slug": tenantSlug } : {}),
        },
        credentials: "omit",
        body: JSON.stringify({
          ...(token ? { token } : {}),
          ...(sessionToken ? { sessionToken } : {}),
          ...(!token && tenantSlug ? { tenantSlug } : {}),
          ...(!token && resolvedTableId ? { tableId: resolvedTableId } : {}),
          ...(!token && !resolvedTableId && resolvedTableNumber
            ? { tableNumber: Number(resolvedTableNumber) }
            : {}),
          customerName: trimmedName,
          customerPhone: normalizedPhone,
          items: cart.map((item) => ({
            itemId: item.itemId,
            variantId: item.variantId,
            quantity: item.quantity,
            optionIds: [],
          })),
          note: note.trim() || undefined,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          asString((body as Record<string, unknown>)?.message) ||
          "Order place nahi ho saka.";
        throw new Error(message);
      }

      const orderRecord = asRecord((body as Record<string, unknown>)?.order);
      const nextSessionToken = asString(orderRecord?.sessionToken);
      const parsedOrder = parsePublicOrder(orderRecord);
      if (typeof window !== "undefined") {
        const key = sessionStorageKey({
          token,
          tenantSlug,
          tableId,
          tableNumber,
        });
        if (nextSessionToken) {
          window.localStorage.setItem(key, nextSessionToken);
          setSessionToken(nextSessionToken);
        }
      }
      if (parsedOrder) {
        setCurrentOrder(parsedOrder);
        setCurrentInvoice(null);
      }

      const message =
        asString((body as Record<string, unknown>)?.message) ||
        "Order placed successfully.";
      setSubmitSuccess(message);
      setCart([]);
      setNote("");
      setIsCartOpen(false);
      await refreshCurrentOrder();
    } catch (submitIssue) {
      setSubmitError(
        submitIssue instanceof Error
          ? submitIssue.message
          : "Order place nahi ho saka.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateCurrentLine(item: PublicOrderItem, quantity: number) {
    if (
      !item.lineId ||
      !sessionToken ||
      (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))
    )
      return;

    setBusyLineId(item.lineId);
    setCurrentOrderError("");
    setSubmitSuccess("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/public/orders/current/items/${item.lineId}`,
        {
          method: "PUT",
          headers: publicHeaders,
          credentials: "omit",
          body: JSON.stringify({
            ...publicOrderLocator,
            quantity,
          }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          asString((body as Record<string, unknown>)?.message) ||
            "Order item update failed",
        );
      }
      await refreshCurrentOrder();
    } catch (issue) {
      setCurrentOrderError(
        issue instanceof Error ? issue.message : "Order item update failed",
      );
    } finally {
      setBusyLineId(null);
    }
  }

  async function deleteCurrentLine(item: PublicOrderItem) {
    if (
      !item.lineId ||
      !sessionToken ||
      (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))
    )
      return;

    setBusyLineId(item.lineId);
    setCurrentOrderError("");
    try {
      const params = new URLSearchParams();
      Object.entries(publicOrderLocator).forEach(([key, value]) => {
        params.set(key, String(value));
      });
      const response = await fetch(
        `${API_BASE_URL}/public/orders/current/items/${item.lineId}?${params.toString()}`,
        {
          method: "DELETE",
          headers: tenantSlug ? { "x-tenant-slug": tenantSlug } : undefined,
          credentials: "omit",
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          asString((body as Record<string, unknown>)?.message) ||
            "Order item remove failed",
        );
      }
      await refreshCurrentOrder();
    } catch (issue) {
      setCurrentOrderError(
        issue instanceof Error ? issue.message : "Order item remove failed",
      );
    } finally {
      setBusyLineId(null);
    }
  }

  async function requestInvoiceForCurrentOrder() {
    if (
      !sessionToken ||
      (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))
    )
      return;

    setInvoiceBusy(true);
    setCurrentOrderError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/public/orders/current/request-invoice`,
        {
          method: "POST",
          headers: publicHeaders,
          credentials: "omit",
          body: JSON.stringify(publicOrderLocator),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          asString((body as Record<string, unknown>)?.message) ||
            "Bill request failed",
        );
      }
      setSubmitSuccess(
        asString((body as Record<string, unknown>)?.message) ||
          "Bill request sent",
      );
      await refreshCurrentOrder();
    } catch (issue) {
      setCurrentOrderError(
        issue instanceof Error ? issue.message : "Bill request failed",
      );
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function cancelCurrentOrder() {
    if (
      !sessionToken ||
      (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))
    )
      return;

    setInvoiceBusy(true);
    setCurrentOrderError("");
    setSubmitSuccess("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/public/orders/current/cancel`,
        {
          method: "POST",
          headers: publicHeaders,
          credentials: "omit",
          body: JSON.stringify(publicOrderLocator),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          asString((body as Record<string, unknown>)?.message) ||
            "Order cancel failed",
        );
      }
      setSubmitSuccess(
        asString((body as Record<string, unknown>)?.message) ||
          "Order cancelled",
      );
      await refreshCurrentOrder();
    } catch (issue) {
      setCurrentOrderError(
        issue instanceof Error ? issue.message : "Order cancel failed",
      );
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function createInvoiceForCurrentOrder() {
    if (
      !sessionToken ||
      (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))
    )
      return;

    setInvoiceBusy(true);
    setCurrentOrderError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/public/orders/current/invoice`,
        {
          method: "POST",
          headers: publicHeaders,
          credentials: "omit",
          body: JSON.stringify({
            ...publicOrderLocator,
            note: "Bill requested from QR",
          }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          asString((body as Record<string, unknown>)?.message) ||
            "Invoice create failed",
        );
      }
      setSubmitSuccess(
        asString((body as Record<string, unknown>)?.message) ||
          "Invoice created",
      );
      await refreshCurrentOrder();
    } catch (issue) {
      setCurrentOrderError(
        issue instanceof Error ? issue.message : "Invoice create failed",
      );
    } finally {
      setInvoiceBusy(false);
    }
  }

  function incrementFromSummary(entry: PublicCartEntry) {
    incrementEntry(
      {
        id: entry.itemId,
        name: entry.name,
        description: undefined,
        image: entry.image,
        isAvailable: true,
        variants: entry.variantId
          ? [
              {
                id: entry.variantId,
                name: entry.variantName || "Regular",
                price: entry.unitPrice,
                isAvailable: true,
              },
            ]
          : [],
      },
      entry.variantId
        ? {
            id: entry.variantId,
            name: entry.variantName || "Regular",
            price: entry.unitPrice,
            isAvailable: true,
          }
        : undefined,
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff1d7_0%,#f9f3ea_34%,#f4efe8_100%)] px-3 py-4 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] text-slate-900 sm:px-4 md:px-6 md:py-8 xl:pb-8">
      <div className="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <section className="min-w-0 space-y-4">
          <header className="overflow-hidden rounded-[30px] border border-[#e5d8c5] bg-[linear-gradient(145deg,#fff8ec_0%,#fffdfa_48%,#eef5ee_100%)] shadow-[0_24px_60px_-36px_rgba(95,61,15,0.35)]">
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end lg:p-7">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b6a2f]">
                  Public QR Menu
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  {tenantName}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Scan karo, items select karo, aur direct order place karo.
                  Login ki zarurat nahi hai.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#e4d5bf] bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Serving: {tableLabel}
                  </span>
                  <span className="rounded-full border border-[#e4d5bf] bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    {itemCount} dishes visible
                  </span>
                  <span className="rounded-full border border-[#e4d5bf] bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    {orderEnabled
                      ? token
                        ? "Token QR active"
                        : "Static QR active"
                      : "Preview only"}
                  </span>
                </div>
              </div>

              <div className="rounded-[26px] border border-[#eadbc6] bg-white/80 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9b6a2f]">
                  Quick Summary
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#fff7e9] p-3">
                    <p className="text-[11px] text-slate-500">Cart items</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {cartCount}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#eef6ef] p-3">
                    <p className="text-[11px] text-slate-500">Current total</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatMoney(cartTotal)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-[#ecdfcc] px-4 py-3 sm:px-5 lg:px-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search food, drink, variant..."
                    className="h-12 w-full rounded-2xl border border-[#decdb4] bg-white/95 px-4 text-sm text-slate-900 outline-none ring-[#f5d39c] transition focus:ring-2"
                  />
                </div>
                <div className="no-scrollbar flex gap-2 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setActiveCategoryId("all")}
                    className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                      activeCategoryId === "all"
                        ? "border-[#d28d38] bg-[#fff0d0] text-[#8f5e23]"
                        : "border-[#e0d4c2] bg-white text-slate-600"
                    }`}
                  >
                    All menu
                  </button>
                  {categoriesWithItems.map(({ category, depth }) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setActiveCategoryId(category.id)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                        activeCategoryId === category.id
                          ? "border-[#d28d38] bg-[#fff0d0] text-[#8f5e23]"
                          : "border-[#e0d4c2] bg-white text-slate-600"
                      }`}
                    >
                      {depth > 0 ? `${"• ".repeat(Math.min(depth, 2))}` : ""}
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </header>

          {isCurrentOrderLoading ? (
            <section className="rounded-[24px] border border-[#e5d8c5] bg-white/90 px-4 py-4 text-sm text-slate-500 shadow-sm">
              Current order loading...
            </section>
          ) : null}

          {currentOrderError ? (
            <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {currentOrderError}
            </section>
          ) : null}

          <CurrentOrderPanel
            order={currentOrder}
            invoice={currentInvoice}
            busyLineId={busyLineId}
            invoiceBusy={invoiceBusy}
            onRefresh={refreshCurrentOrder}
            onIncrement={(item) => updateCurrentLine(item, item.quantity + 1)}
            onDecrement={(item) => {
              if (item.quantity <= 1) {
                deleteCurrentLine(item);
                return;
              }
              updateCurrentLine(item, item.quantity - 1);
            }}
            onDelete={deleteCurrentLine}
            onCancelOrder={cancelCurrentOrder}
            onRequestInvoice={requestInvoiceForCurrentOrder}
            onCreateInvoice={createInvoiceForCurrentOrder}
          />

          {submitSuccess ? (
            <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {submitSuccess}
            </section>
          ) : null}

          {submitError ? (
            <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {submitError}
            </section>
          ) : null}

          {isLoading ? (
            <section className="rounded-[28px] border border-[#e5d8c5] bg-white/90 px-4 py-10 text-center text-sm text-slate-500 shadow-sm">
              Loading menu...
            </section>
          ) : null}

          {error ? (
            <section className="rounded-[28px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              {error}
            </section>
          ) : null}

          {!isLoading && !error ? (
            <section className="space-y-4">
              {visibleSections.length ? (
                visibleSections.map(({ category, depth, items }) => (
                  <article
                    key={category.id}
                    className="overflow-hidden rounded-[28px] border border-[#e5d8c5] bg-white/92 shadow-[0_18px_50px_-38px_rgba(110,72,23,0.45)]"
                  >
                    <div
                      className="border-b border-[#eee2d3] bg-[linear-gradient(145deg,#fff9ee_0%,#fffdfa_100%)] px-4 py-4 sm:px-5"
                      style={{ paddingLeft: `${16 + depth * 14}px` }}
                    >
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-900">
                            {category.name}
                          </h2>
                          <p className="mt-1 text-xs text-slate-500">
                            {items.length} item{items.length === 1 ? "" : "s"}{" "}
                            available
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-2 2xl:grid-cols-3">
                      {items.map((item) => {
                        const chosenVariant = resolveDefaultVariant(
                          item,
                          selectedVariants,
                        );
                        const quantity = getQuantity(
                          item.id,
                          chosenVariant?.id,
                        );
                        const variants = availableVariants(item);
                        const canAdd =
                          item.isAvailable &&
                          Boolean(chosenVariant || !item.variants.length);

                        return (
                          <div
                            key={item.id}
                            className="overflow-hidden rounded-[24px] border border-[#ebdfcf] bg-[linear-gradient(160deg,#fffdf8_0%,#fff6ea_100%)] p-3 shadow-sm"
                          >
                            {item.image ? (
                              <div className="overflow-hidden rounded-[20px] border border-[#eadfce] bg-white">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  loading="lazy"
                                  className="h-40 w-full object-cover sm:h-44"
                                />
                              </div>
                            ) : null}

                            <div className="mt-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="text-base font-semibold leading-6 text-slate-900">
                                  {item.name}
                                </h3>
                                {item.description ? (
                                  <p className="mt-1 text-sm leading-5 text-slate-500">
                                    {item.description}
                                  </p>
                                ) : null}
                              </div>
                              <span
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                                  item.isAvailable
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-300 bg-slate-100 text-slate-500"
                                }`}
                              >
                                {item.isAvailable ? "Available" : "Unavailable"}
                              </span>
                            </div>

                            <div className="mt-3 rounded-[20px] border border-[#efe3d2] bg-white/80 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {variants.length > 1
                                      ? "Choose variant"
                                      : "Variant"}
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-[#9b6a2f]">
                                    {formatMoney(chosenVariant?.price ?? 0)}
                                  </p>
                                </div>
                                <div className="rounded-full bg-[#fff1d4] px-3 py-1 text-[11px] font-semibold text-[#8f5e23]">
                                  {chosenVariant?.name || "Regular"}
                                </div>
                              </div>

                              {variants.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {variants.map((variant) => {
                                    const active =
                                      variant.id === chosenVariant?.id;
                                    const variantQty = getQuantity(
                                      item.id,
                                      variant.id,
                                    );
                                    return (
                                      <button
                                        key={variant.id}
                                        type="button"
                                        onClick={() =>
                                          setItemVariant(item.id, variant.id)
                                        }
                                        disabled={!variant.isAvailable}
                                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                          active
                                            ? "border-[#d28d38] bg-[#fff0d0] text-[#8f5e23]"
                                            : "border-[#e1d3c1] bg-white text-slate-600"
                                        } disabled:cursor-not-allowed disabled:opacity-45`}
                                      >
                                        {variant.name} |{" "}
                                        {formatMoney(variant.price)}
                                        {variantQty > 0
                                          ? ` (${variantQty})`
                                          : ""}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="mt-3 text-xs text-slate-500">
                                  No variants available
                                </p>
                              )}
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  Cart
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {quantity > 0
                                    ? `${quantity} added`
                                    : "Tap to add"}
                                </p>
                              </div>

                              {quantity === 0 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    incrementEntry(item, chosenVariant)
                                  }
                                  disabled={!canAdd}
                                  className="rounded-[18px] bg-[linear-gradient(135deg,#d18226_0%,#b36418_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_-22px_rgba(179,100,24,0.75)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  Add to cart
                                </button>
                              ) : (
                                <div className="flex items-center gap-2 rounded-full border border-[#ead9bf] bg-white px-1 py-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      decrementEntry(item.id, chosenVariant?.id)
                                    }
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8c7b1] text-base font-bold text-slate-700"
                                  >
                                    -
                                  </button>
                                  <span className="w-6 text-center text-base font-semibold text-slate-900">
                                    {quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      incrementEntry(item, chosenVariant)
                                    }
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c97d25] text-base font-bold text-white"
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
                  </article>
                ))
              ) : (
                <article className="rounded-[28px] border border-dashed border-[#deceb6] bg-[#fffdf8] px-4 py-10 text-center text-sm text-slate-500">
                  Search ya category filter ke hisab se koi item nahi mila.
                </article>
              )}
            </section>
          ) : null}
        </section>

        <aside className="hidden xl:sticky xl:top-6 xl:block">
          <SummaryPanel
            tableLabel={tableLabel}
            cart={cart}
            customerName={customerName}
            customerPhone={customerPhone}
            note={note}
            onCustomerNameChange={(value) => {
              setCustomerName(value);
              setSubmitError("");
            }}
            onCustomerPhoneChange={(value) => {
              setCustomerPhone(value);
              setSubmitError("");
            }}
            onNoteChange={setNote}
            onIncrement={incrementFromSummary}
            onDecrement={(entry) =>
              decrementEntry(entry.itemId, entry.variantId)
            }
            onSubmit={handleSubmitOrder}
            submitting={isSubmitting}
            canSubmit={Boolean(
              cart.length &&
              customerName.trim() &&
              customerPhone.trim() &&
              orderEnabled,
            )}
            orderEnabled={orderEnabled}
            helperText={
              orderEnabled
                ? `Customer name aur number ke saath order kitchen me direct chala jayega.${sessionToken ? " Repeat items isi guest order me add honge." : ""}`
                : "Ye link sirf preview mode me hai."
            }
          />
        </aside>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3 xl:hidden">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-[26px] border border-[#e3d6c2] bg-white/95 p-3 shadow-[0_24px_60px_-26px_rgba(79,53,18,0.42)] backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b6a2f]">
                Cart summary
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {cartCount} item{cartCount === 1 ? "" : "s"} |{" "}
                {formatMoney(cartTotal)}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {tableLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="rounded-[18px] bg-[linear-gradient(135deg,#d18226_0%,#b36418_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_-20px_rgba(179,100,24,0.75)]"
            >
              View cart
            </button>
          </div>
        </div>
      </div>

      {isCartOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/30 xl:hidden"
          onClick={() => setIsCartOpen(false)}
        >
          <div
            className="max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-[32px] bg-[#f7f2ea] p-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto max-w-3xl">
              <div className="mb-3 flex items-center justify-between px-1">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b6a2f]">
                    Complete your order
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {tableLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCartOpen(false)}
                  className="rounded-full border border-[#ddcfba] bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Close
                </button>
              </div>

              <SummaryPanel
                tableLabel={tableLabel}
                cart={cart}
                customerName={customerName}
                customerPhone={customerPhone}
                note={note}
                onCustomerNameChange={(value) => {
                  setCustomerName(value);
                  setSubmitError("");
                }}
                onCustomerPhoneChange={(value) => {
                  setCustomerPhone(value);
                  setSubmitError("");
                }}
                onNoteChange={setNote}
                onIncrement={incrementFromSummary}
                onDecrement={(entry) =>
                  decrementEntry(entry.itemId, entry.variantId)
                }
                onSubmit={handleSubmitOrder}
                submitting={isSubmitting}
                canSubmit={Boolean(
                  cart.length &&
                  customerName.trim() &&
                  customerPhone.trim() &&
                  orderEnabled,
                )}
                orderEnabled={orderEnabled}
                helperText={
                  orderEnabled
                    ? `Order place hote hi kitchen/waiter side par customer details ke saath flow me aayega.${sessionToken ? " Aapke repeat items isi order session me add honge." : ""}`
                    : "Is public menu link se sirf menu browse kiya ja sakta hai."
                }
                compact
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
