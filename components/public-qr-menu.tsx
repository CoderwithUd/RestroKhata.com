"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/constants";
import { sanitizePhone } from "@/lib/phone";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  foodType?: string;
  prepTime?: number;
  tags?: string[];
  isFeatured?: boolean;
};

type PublicCategory = {
  id: string;
  name: string;
  items: PublicItem[];
  children: PublicCategory[];
};

type PublicMenuPayload = {
  tenant?: { id?: string; name?: string; slug?: string };
  table?: { id?: string; number?: number; name?: string };
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
  invoiceRequest?: { requestedAt?: string } | null;
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

type PublicQrMenuProps = { tenantSlug?: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTACT_STORAGE_KEY = "restro-public-order-contact";
const QR_SESSION_STORAGE_PREFIX = "restro-public-order-session";

// ─── Parsers ──────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asArray(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }
function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") { const p = Number(v.trim()); if (Number.isFinite(p)) return p; }
  return undefined;
}
function asBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const n = v.trim().toLowerCase();
    if (["true","1","yes","active","available"].includes(n)) return true;
    if (["false","0","no","inactive","unavailable"].includes(n)) return false;
  }
  if (typeof v === "number") { if (v === 1) return true; if (v === 0) return false; }
  return undefined;
}

function parseVariant(v: unknown): PublicVariant | null {
  const r = asRecord(v); if (!r) return null;
  const name = asString(r.name) || "Regular";
  const price = asNumber(r.price) ?? 0;
  const id = asString(r.id) || asString(r._id) || asString(r.variantId) || `${name}-${price}`;
  if (!id) return null;
  return { id, name, price, isAvailable: asBoolean(r.isAvailable) ?? asBoolean(r.isActive) ?? true };
}

function parseItem(v: unknown): PublicItem | null {
  const r = asRecord(v); if (!r) return null;
  const id = asString(r.id) || asString(r._id) || asString(r.itemId); if (!id) return null;
  const variants = asArray(r.variants).map(parseVariant).filter((x): x is PublicVariant => Boolean(x));
  const fallbackPrice = asNumber(r.price);
  const resolvedVariants = variants.length || fallbackPrice === undefined ? variants
    : [{ id: `${id}-regular`, name: "Regular", price: fallbackPrice, isAvailable: asBoolean(r.isAvailable) ?? asBoolean(r.isActive) ?? true }];
  return {
    id, name: asString(r.name) || "Untitled Item",
    description: asString(r.description) || asString(r.desc),
    image: asString(r.image) || asString(r.imageUrl) || asString(r.thumbnail),
    isAvailable: asBoolean(r.isAvailable) ?? asBoolean(r.isActive) ?? (resolvedVariants.length ? resolvedVariants.some(x => x.isAvailable) : true),
    variants: resolvedVariants,
    foodType: asString(r.foodType),
    prepTime: asNumber(r.prepTime),
    tags: asArray(r.tags).map(asString).filter((t): t is string => Boolean(t)),
    isFeatured: asBoolean(r.isFeatured),
  };
}

function parseCategory(v: unknown): PublicCategory | null {
  const r = asRecord(v); if (!r) return null;
  const id = asString(r.id) || asString(r._id) || asString(r.categoryId); if (!id) return null;
  return {
    id, name: asString(r.name) || "Category",
    items: asArray(r.items || r.menuItems).map(parseItem).filter((x): x is PublicItem => Boolean(x)),
    children: asArray(r.children || r.subCategories || r.subcategories).map(parseCategory).filter((x): x is PublicCategory => Boolean(x)),
  };
}

function parsePayload(data: unknown): PublicMenuPayload {
  const rawRoot = asRecord(data); if (!rawRoot) return { categories: [] };
  const root = asRecord(rawRoot.data) || rawRoot;
  const menuRoot = asRecord(root.menu) || root;
  const tableRecord = asRecord(menuRoot.table) || asRecord(root.table) || asRecord(rawRoot.table);
  const tenantRecord = asRecord(menuRoot.tenant) || asRecord(root.tenant) || asRecord(rawRoot.tenant);
  const categoriesSource = asArray(menuRoot.categories).length > 0 ? menuRoot.categories
    : asArray(root.categories).length > 0 ? root.categories : rawRoot.categories;
  return {
    tenant: { id: asString(tenantRecord?.id) || asString(tenantRecord?._id), name: asString(tenantRecord?.name), slug: asString(tenantRecord?.slug) },
    table: tableRecord ? { id: asString(tableRecord.id) || asString(tableRecord._id), number: asNumber(tableRecord.number), name: asString(tableRecord.name) } : undefined,
    categories: asArray(categoriesSource).map(parseCategory).filter((x): x is PublicCategory => Boolean(x)),
  };
}

function parsePublicOrderItem(v: unknown): PublicOrderItem | null {
  const r = asRecord(v); if (!r) return null;
  const itemId = asString(r.itemId) || asString(r.id) || asString(r._id); if (!itemId) return null;
  return {
    lineId: asString(r.lineId) || asString(r.lineItemId) || asString(r.itemLineId),
    itemId, variantId: asString(r.variantId), name: asString(r.name) || "Item",
    variantName: asString(r.variantName), quantity: asNumber(r.quantity) ?? 1,
    unitPrice: asNumber(r.unitPrice) ?? asNumber(r.price) ?? 0, note: asString(r.note),
    lineTotal: asNumber(r.lineTotal),
    kitchenStatus: asString(r.kitchenStatus) || asString(r.status) || asString(r.itemStatus),
  };
}

function parsePublicOrder(v: unknown): PublicOrder | null {
  const r = asRecord(v); if (!r) return null;
  const id = asString(r.id) || asString(r._id); if (!id) return null;
  const invoiceRequest = asRecord(r.invoiceRequest);
  return {
    id, status: asString(r.status) || "PLACED", sessionToken: asString(r.sessionToken),
    note: asString(r.note),
    items: asArray(r.items).map(parsePublicOrderItem).filter((x): x is PublicOrderItem => Boolean(x)),
    subTotal: asNumber(r.subTotal), taxTotal: asNumber(r.taxTotal) ?? asNumber(r.tax),
    grandTotal: asNumber(r.grandTotal) ?? asNumber(r.total),
    invoiceRequest: invoiceRequest ? { requestedAt: asString(invoiceRequest.requestedAt) } : null,
  };
}

function parsePublicInvoice(v: unknown): PublicInvoice | null {
  const r = asRecord(v); if (!r) return null;
  const id = asString(r.id) || asString(r._id); if (!id) return null;
  const discountRecord = asRecord(r.discount);
  return {
    id, status: asString(r.status) || "ISSUED",
    items: asArray(r.items).map(parsePublicOrderItem).filter((x): x is PublicOrderItem => Boolean(x)),
    subTotal: asNumber(r.subTotal), taxTotal: asNumber(r.taxTotal) ?? asNumber(r.tax),
    grandTotal: asNumber(r.grandTotal) ?? asNumber(r.total),
    totalDue: asNumber(r.totalDue), balanceDue: asNumber(r.balanceDue),
    discountAmount: asNumber(discountRecord?.amount) ?? 0,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}

function flattenCategoryTree(cats: PublicCategory[], depth = 0): Array<{ category: PublicCategory; depth: number }> {
  return cats.flatMap(c => [{ category: c, depth }, ...flattenCategoryTree(c.children, depth + 1)]);
}

function entryKey(itemId: string, variantId?: string): string { return `${itemId}::${variantId || "base"}`; }

function sessionStorageKey(args: { token?: string; tenantSlug?: string; tableId?: string; tableNumber?: string }): string {
  return [QR_SESSION_STORAGE_PREFIX, args.token || "no-token", args.tenantSlug || "no-tenant", args.tableId || "no-table", args.tableNumber || "no-number"].join(":");
}

function buildPublicOrderLocator(args: { token?: string; tenantSlug?: string; tableId?: string; tableNumber?: string; sessionToken?: string }): Record<string, string | number> {
  const p: Record<string, string | number> = {};
  if (args.token) { p.token = args.token; } else {
    if (args.tenantSlug) p.tenantSlug = args.tenantSlug;
    if (args.tableId) p.tableId = args.tableId;
    if (!args.tableId && args.tableNumber) { const n = Number(args.tableNumber); p.tableNumber = Number.isFinite(n) ? n : args.tableNumber; }
  }
  if (args.sessionToken) p.sessionToken = args.sessionToken;
  return p;
}

function availableVariants(item: PublicItem): PublicVariant[] {
  const a = item.variants.filter(v => v.isAvailable); return a.length ? a : item.variants;
}

function resolveDefaultVariant(item: PublicItem, selectedVariants: Record<string, string | undefined>): PublicVariant | undefined {
  const v = availableVariants(item); if (!v.length) return undefined;
  return v.find(x => x.id === selectedVariants[item.id]) || v[0];
}

function normalizeStatus(v: string | undefined): string { return (v || "").toUpperCase(); }

function lineAmount(item: PublicOrderItem): number { return item.lineTotal ?? item.unitPrice * item.quantity; }
function isPlacedLine(item: PublicOrderItem): boolean { return normalizeStatus(item.kitchenStatus) === "PLACED"; }

function canCreatePublicInvoice(order: PublicOrder | null): boolean {
  if (!order || !order.items.length) return false;
  return order.items.every(i => { const s = normalizeStatus(i.kitchenStatus); return s === "SERVED" || s === "CANCELLED"; });
}

function canCancelPublicOrder(order: PublicOrder | null, invoice: PublicInvoice | null): boolean {
  if (!order || invoice || !order.items.length) return false;
  return order.items.every(i => isPlacedLine(i));
}

function statusLabel(s?: string): string {
  const n = normalizeStatus(s);
  if (n === "IN_PROGRESS") return "Cooking";
  if (n === "READY") return "Ready";
  if (n === "SERVED") return "Served";
  if (n === "CANCELLED") return "Cancelled";
  return "Placed";
}

function statusColors(s?: string): { bg: string; text: string; dot: string } {
  const n = normalizeStatus(s);
  if (n === "IN_PROGRESS") return { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", dot: "bg-amber-400" };
  if (n === "READY") return { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-400" };
  if (n === "SERVED") return { bg: "bg-sky-50 border-sky-200", text: "text-sky-700", dot: "bg-sky-400" };
  if (n === "CANCELLED") return { bg: "bg-slate-100 border-slate-200", text: "text-slate-500", dot: "bg-slate-400" };
  return { bg: "bg-violet-50 border-violet-200", text: "text-violet-700", dot: "bg-violet-400" };
}

// ─── Icons (inline SVG, no dep) ───────────────────────────────────────────────

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}
function IconCart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
function IconReceipt() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>
    </svg>
  );
}
function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  );
}

// ─── VEG / NON-VEG indicator ──────────────────────────────────────────────────

function VegIndicator({ veg }: { veg: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${veg ? "border-emerald-300 text-emerald-700" : "border-red-300 text-red-700"}`}>
      <span className={`inline-block h-2 w-2 rounded-sm border ${veg ? "border-emerald-500 bg-emerald-500" : "border-red-500 bg-red-500"}`} />
      {veg ? "VEG" : "NON-VEG"}
    </span>
  );
}

// ─── SummaryPanel ─────────────────────────────────────────────────────────────

function SummaryPanel({
  tableLabel, cart, customerName, customerPhone, note,
  onCustomerNameChange, onCustomerPhoneChange, onNoteChange,
  onIncrement, onDecrement, onSubmit, submitting, canSubmit, orderEnabled, helperText, compact = false,
}: {
  tableLabel: string; cart: PublicCartEntry[]; customerName: string; customerPhone: string; note: string;
  onCustomerNameChange: (v: string) => void; onCustomerPhoneChange: (v: string) => void; onNoteChange: (v: string) => void;
  onIncrement: (e: PublicCartEntry) => void; onDecrement: (e: PublicCartEntry) => void;
  onSubmit: () => void; submitting: boolean; canSubmit: boolean; orderEnabled: boolean; helperText?: string; compact?: boolean;
}) {
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const total = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <div className="flex flex-col gap-0 rounded-[20px] border border-stone-200/70 bg-white shadow-[0_2px_24px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Your Order</p>
          <h2 className="mt-0.5 text-[15px] font-semibold text-stone-800">{tableLabel}</h2>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Cart items */}
      <div className={`${compact ? "max-h-52" : "max-h-80"} overflow-y-auto`}>
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-50 text-stone-300">
              <IconCart />
            </div>
            <p className="text-[13px] text-stone-400">Cart is empty — add items from menu</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-50 px-5">
            {cart.map((item) => (
              <div key={item.key} className="flex items-center gap-3 py-3.5">
                {item.image ? (
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-xs font-bold text-amber-600">
                    {item.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-stone-800">{item.name}</p>
                  <p className="text-[11px] text-stone-400">{item.variantName || "Regular"} · {formatMoney(item.unitPrice)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => onDecrement(item)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50 active:scale-95 transition-all">−</button>
                  <span className="w-5 text-center text-[13px] font-semibold text-stone-800">{item.quantity}</span>
                  <button type="button" onClick={() => onIncrement(item)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 transition-all">+</button>
                </div>
                <p className="w-14 text-right text-[13px] font-semibold text-stone-800">{formatMoney(item.quantity * item.unitPrice)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form + Total */}
      <div className="border-t border-stone-100 bg-stone-50/50 px-5 py-4 space-y-3">
        <input value={customerName} onChange={e => onCustomerNameChange(e.target.value)} placeholder="Your name"
          className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3.5 text-[13px] text-stone-800 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all" />
        <input value={customerPhone} onChange={e => onCustomerPhoneChange(sanitizePhone(e.target.value))}
          placeholder="Mobile number (10 digits)" inputMode="tel" maxLength={10}
          className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3.5 text-[13px] text-stone-800 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all" />
        <textarea value={note} onChange={e => onNoteChange(e.target.value)} placeholder="Kitchen note (optional)"
          rows={compact ? 2 : 3}
          className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[13px] text-stone-800 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all" />

        <div className="rounded-xl border border-stone-100 bg-white p-3.5">
          <div className="flex items-center justify-between text-[13px] text-stone-500">
            <span>Subtotal</span><span className="font-medium text-stone-700">{formatMoney(total)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-dashed border-stone-100 pt-1.5 text-[14px] font-semibold text-stone-800">
            <span>Total</span><span className="text-amber-600">{formatMoney(total)}</span>
          </div>
          {helperText && <p className="mt-2 text-[11px] leading-relaxed text-stone-400">{helperText}</p>}
        </div>

        <button type="button" onClick={onSubmit} disabled={!canSubmit || submitting}
          className="w-full rounded-xl bg-amber-500 py-3 text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(245,158,11,0.35)] transition-all hover:bg-amber-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">
          {submitting ? "Placing order…" : orderEnabled ? "Place Order →" : "Ordering unavailable"}
        </button>
      </div>
    </div>
  );
}

// ─── CurrentOrderPanel ────────────────────────────────────────────────────────

function CurrentOrderPanel({
  order, invoice, busyLineId, invoiceBusy, onRefresh,
  onIncrement, onDecrement, onDelete, onCancelOrder, onRequestInvoice, onCreateInvoice,
}: {
  order: PublicOrder | null; invoice: PublicInvoice | null; busyLineId?: string | null; invoiceBusy?: boolean;
  onRefresh: () => void; onIncrement: (i: PublicOrderItem) => void; onDecrement: (i: PublicOrderItem) => void;
  onDelete: (i: PublicOrderItem) => void; onCancelOrder: () => void; onRequestInvoice: () => void; onCreateInvoice: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  if (!order && !invoice) return null;

  const canCancelOrder = canCancelPublicOrder(order, invoice);
  const statusCounts = order?.items.reduce<Record<string, number>>((acc, item) => {
    const k = normalizeStatus(item.kitchenStatus) || "PLACED";
    acc[k] = (acc[k] || 0) + item.quantity;
    return acc;
  }, {});

  const statuses: Array<"PLACED" | "IN_PROGRESS" | "READY" | "SERVED"> = ["PLACED", "IN_PROGRESS", "READY", "SERVED"];

  return (
    <section className="overflow-hidden rounded-[20px] border border-stone-200/70 bg-white shadow-[0_2px_24px_rgba(0,0,0,0.06)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setExpanded(x => !x)}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-transform hover:bg-stone-50 ${expanded ? "rotate-90" : ""}`}>
            <IconChevronRight />
          </button>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Live Order</p>
            <div className="mt-0.5 flex items-center gap-2">
              {order && (
                <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 border border-violet-200">
                  {order.status}
                </span>
              )}
              {invoice && (
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200">
                  Invoice {invoice.status}
                </span>
              )}
            </div>
          </div>
        </div>
        <button type="button" onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-stone-100 transition-colors">
          <IconRefresh /> Refresh
        </button>
      </div>

      {expanded && order && (
        <div className="border-t border-stone-100">
          {/* Status counters */}
          <div className="grid grid-cols-4 divide-x divide-stone-100 border-b border-stone-100">
            {statuses.map(s => {
              const c = statusColors(s);
              return (
                <div key={s} className="flex flex-col items-center py-3 text-center">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot} mb-1.5`} />
                  <p className="text-[16px] font-semibold text-stone-800">{statusCounts?.[s] || 0}</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">{statusLabel(s)}</p>
                </div>
              );
            })}
          </div>

          {/* Items */}
          <div className="divide-y divide-stone-50 px-5">
            {order.items.map((item, idx) => {
              const placed = isPlacedLine(item);
              const lineId = item.lineId || `${item.itemId}-${idx}`;
              const busy = busyLineId === lineId;
              const sc = statusColors(item.kitchenStatus);
              return (
                <div key={lineId} className="flex items-start justify-between gap-3 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-medium text-stone-800">
                        {item.quantity}× {item.name}{item.variantName ? ` (${item.variantName})` : ""}
                      </p>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />{statusLabel(item.kitchenStatus)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[12px] text-stone-400">{formatMoney(lineAmount(item))}</span>
                      {item.note && <span className="text-[11px] italic text-amber-600">"{item.note}"</span>}
                    </div>
                  </div>
                  {placed && !invoice && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => onDecrement(item)} disabled={busy}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-all">−</button>
                      <button type="button" onClick={() => onIncrement(item)} disabled={busy}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-all">+</button>
                      <button type="button" onClick={() => onDelete(item)} disabled={busy}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 transition-all">
                        <IconX />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Totals + Actions */}
          <div className="border-t border-stone-100 bg-stone-50/60 px-5 py-4 space-y-3">
            <div className="rounded-xl border border-stone-100 bg-white p-3.5 space-y-1.5 text-[13px]">
              <div className="flex justify-between text-stone-500">
                <span>Subtotal</span><span>{formatMoney(order.subTotal ?? order.grandTotal ?? 0)}</span>
              </div>
              <div className="flex justify-between text-stone-500">
                <span>Tax</span><span>{formatMoney(order.taxTotal ?? 0)}</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-stone-100 pt-1.5 font-semibold text-stone-800">
                <span>Grand Total</span><span className="text-amber-600">{formatMoney(order.grandTotal ?? 0)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {!invoice && (
                <button type="button" onClick={onRequestInvoice} disabled={invoiceBusy || Boolean(order.invoiceRequest)}
                  className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-all">
                  <IconReceipt />{order.invoiceRequest ? "Bill Requested ✓" : "Request Bill"}
                </button>
              )}
              {canCreatePublicInvoice(order) && !invoice && (
                <button type="button" onClick={onCreateInvoice} disabled={invoiceBusy}
                  className="rounded-xl bg-amber-500 px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-all">
                  {invoiceBusy ? "Creating…" : "Create Invoice"}
                </button>
              )}
              {!invoice && !canCreatePublicInvoice(order) && (
                <span className="rounded-xl border border-stone-200 bg-stone-100 px-3.5 py-2 text-[12px] font-semibold text-stone-400">
                  Invoice after all items served
                </span>
              )}
              {canCancelOrder && (
                <button type="button" onClick={onCancelOrder} disabled={invoiceBusy}
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-[12px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40 transition-all">
                  Cancel Order
                </button>
              )}
            </div>
            {!invoice && (
              <p className="text-[11px] leading-relaxed text-stone-400">
                {canCancelOrder ? "You can cancel before kitchen starts cooking." : !canCreatePublicInvoice(order) ? "Invoice will be generated once all items are served or cancelled." : "Payment at the counter with manager."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Invoice */}
      {expanded && invoice && (
        <div className="border-t border-stone-100 px-5 py-4">
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-700 mb-3 flex items-center gap-1.5">
              <IconReceipt /> Invoice Preview
            </p>
            <div className="space-y-2 border-t border-dashed border-amber-200 pt-3">
              {invoice.items.map((item, idx) => (
                <div key={`${invoice.id}-${item.itemId}-${item.variantId || "base"}-${idx}`}
                  className="flex items-start justify-between gap-2 text-[13px]">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-800">{idx + 1}. {item.name}{item.variantName ? ` (${item.variantName})` : ""}</p>
                    <p className="text-[11px] text-stone-400">{item.quantity} × {formatMoney(item.unitPrice)}</p>
                  </div>
                  <p className="font-semibold text-stone-800 shrink-0">{formatMoney(lineAmount(item))}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1 border-t border-dashed border-amber-200 pt-3 text-[13px]">
              <div className="flex justify-between text-stone-500"><span>Subtotal</span><span>{formatMoney(invoice.subTotal ?? 0)}</span></div>
              <div className="flex justify-between text-stone-500"><span>Tax</span><span>{formatMoney(invoice.taxTotal ?? 0)}</span></div>
              <div className="flex justify-between text-stone-500"><span>Discount</span><span>−{formatMoney(invoice.discountAmount ?? 0)}</span></div>
              <div className="flex justify-between border-t border-dashed border-amber-200 pt-2 text-[15px] font-bold text-stone-900">
                <span>Total Due</span>
                <span className="text-amber-600">{formatMoney(invoice.balanceDue ?? invoice.totalDue ?? invoice.grandTotal ?? 0)}</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-stone-500">Pay at the counter — manager will finalize.</p>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── MenuItem Card ────────────────────────────────────────────────────────────

function MenuItemCard({
  item, chosenVariant, quantity, selectedVariantId,
  onVariantSelect, onIncrement, onDecrement,
}: {
  item: PublicItem; chosenVariant: PublicVariant | undefined; quantity: number; selectedVariantId: string | undefined;
  onVariantSelect: (variantId: string) => void; onIncrement: () => void; onDecrement: () => void;
}) {
  const variants = availableVariants(item);
  const canAdd = item.isAvailable && Boolean(chosenVariant || !item.variants.length);

  return (
    <div className={`group relative flex gap-3.5 rounded-[18px] border p-3.5 transition-all ${!item.isAvailable ? "border-stone-200/50 bg-stone-50/50 opacity-[0.65] grayscale-[0.8]" : "bg-white border-stone-200/70 shadow-[0_1px_6px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]"}`}>
      {/* Image or placeholder */}
      <div className="shrink-0">
        {item.image ? (
          <div className="h-[88px] w-[88px] overflow-hidden rounded-[14px] bg-stone-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          </div>
        ) : (
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[14px] bg-gradient-to-br from-amber-50 to-stone-100 text-3xl">
            🍽️
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              {item.foodType && (
                <VegIndicator veg={item.foodType === "VEG" || item.foodType === "VEGAN"} />
              )}
              {!item.isAvailable && (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">Unavailable</span>
              )}
              {item.isFeatured && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Featured</span>
              )}
            </div>
            <h3 className="text-[14px] font-semibold leading-snug text-stone-900">{item.name}</h3>
            {item.description && (
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-stone-400">{item.description}</p>
            )}
            {(item.tags?.length || item.prepTime) ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.prepTime && (
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">⏱ {item.prepTime} min</span>
                )}
                {item.tags?.slice(0, 2).map((t, i) => (
                  <span key={i} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{t}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Variants */}
        {variants.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {variants.map(v => (
              <button key={v.id} type="button" disabled={!v.isAvailable} onClick={() => onVariantSelect(v.id)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${
                  v.id === (selectedVariantId || variants[0]?.id)
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300"
                } disabled:opacity-40`}>
                {v.name} · {formatMoney(v.price)}
              </button>
            ))}
          </div>
        )}

        {/* Price + Add */}
        <div className="mt-auto flex items-center justify-between gap-2">
          <p className="text-[15px] font-bold text-stone-900">
            {formatMoney(chosenVariant?.price ?? 0)}
            {variants.length === 1 && <span className="ml-1 text-[11px] font-normal text-stone-400">{variants[0]?.name}</span>}
          </p>

          {quantity === 0 ? (
            <button type="button" onClick={onIncrement} disabled={!canAdd}
              className="flex items-center gap-1 rounded-xl bg-amber-500 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_2px_10px_rgba(245,158,11,0.4)] hover:bg-amber-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 transition-all">
              + Add
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-1 py-1">
              <button type="button" onClick={onDecrement}
                className="flex h-6 w-6 items-center justify-center rounded-lg border border-stone-200 bg-white text-sm font-semibold text-stone-700 hover:bg-stone-100 active:scale-95 transition-all">−</button>
              <span className="w-5 text-center text-[13px] font-bold text-stone-900">{quantity}</span>
              <button type="button" onClick={onIncrement}
                className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 transition-all">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PublicQrMenu({ tenantSlug: tenantSlugFromPath }: PublicQrMenuProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<PublicMenuPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string | undefined>>({});
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
  const [currentInvoice, setCurrentInvoice] = useState<PublicInvoice | null>(null);
  const [currentOrderError, setCurrentOrderError] = useState("");
  const [isCurrentOrderLoading, setIsCurrentOrderLoading] = useState(false);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const token = searchParams.get("token")?.trim() || "";
  const tenantSlug = searchParams.get("tenantSlug")?.trim() || tenantSlugFromPath?.trim() || "";
  const tableId = searchParams.get("tableId")?.trim() || "";
  const tableNumber = searchParams.get("tableNumber")?.trim() || "";
  const queryKey = `${tenantSlugFromPath || ""}:${searchParams.toString()}`;

  // Persist contact info
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(CONTACT_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { customerName?: string; customerPhone?: string };
      if (parsed.customerName) setCustomerName(parsed.customerName);
      if (parsed.customerPhone) setCustomerPhone(parsed.customerPhone);
    } catch { window.localStorage.removeItem(CONTACT_STORAGE_KEY); }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify({ customerName: customerName.trim(), customerPhone: customerPhone.trim() }));
  }, [customerName, customerPhone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = sessionStorageKey({ token, tenantSlug, tableId, tableNumber });
    const stored = window.localStorage.getItem(key);
    if (stored) setSessionToken(stored); else setSessionToken("");
  }, [tableId, tableNumber, tenantSlug, token]);

  // Fetch menu
  useEffect(() => {
    const controller = new AbortController();
    if (!token && !tenantSlug) {
      setData(null); setIsLoading(false);
      setError("QR URL invalid — token or tenantSlug missing.");
      return () => controller.abort();
    }
    async function fetchMenu() {
      setIsLoading(true); setError("");
      const params = new URLSearchParams();
      if (token) { params.set("token", token); } else {
        if (tenantSlug) params.set("tenantSlug", tenantSlug);
        if (tableId) params.set("tableId", tableId);
        if (tableNumber) params.set("tableNumber", tableNumber);
      }
      try {
        const res = await fetch(`${API_BASE_URL}/public/menu?${params.toString()}`, { method: "GET", credentials: "omit", signal: controller.signal });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(asString((body as Record<string, unknown>)?.message) || "Failed to load menu");
        setData(parsePayload(body));
      } catch (e) {
        if (controller.signal.aborted) return;
        setData(null); setError(e instanceof Error ? e.message : "Failed to load menu");
      } finally { if (!controller.signal.aborted) setIsLoading(false); }
    }
    fetchMenu();
    return () => controller.abort();
  }, [queryKey, searchParams, tableId, tableNumber, tenantSlug, token]);


  console.log(data)

  // Derived data
  const flatCategories = useMemo(() => flattenCategoryTree(data?.categories || []), [data?.categories]);
  const categoriesWithItems = useMemo(() => flatCategories.filter(({ category }) => category.items.length > 0), [flatCategories]);

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categoriesWithItems.map(({ category, depth }) => {
      if (activeCategoryId !== "all" && category.id !== activeCategoryId) return null;
      const items = category.items.filter(item => {
        if (!q) return true;
        return [item.name, item.description, ...item.variants.map(v => v.name)].filter(Boolean).join(" ").toLowerCase().includes(q);
      });
      if (!items.length) return null;
      return { category, depth, items };
    }).filter((s): s is { category: PublicCategory; depth: number; items: PublicItem[] } => Boolean(s));
  }, [activeCategoryId, categoriesWithItems, search]);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0), [cart]);
  const tenantName = data?.tenant?.name || data?.tenant?.slug || "Restaurant";
  const tableLabel = data?.table?.name || (Number.isFinite(data?.table?.number) ? `Table ${data?.table?.number}` : "Guest Order");
  const resolvedTableId = tableId || data?.table?.id || "";
  const resolvedTableNumber = tableNumber || (typeof data?.table?.number === "number" ? String(data.table.number) : "");
  const orderEnabled = Boolean(token || (tenantSlug && (resolvedTableId || resolvedTableNumber)));

  const publicOrderLocator = useMemo(() => buildPublicOrderLocator({ token, tenantSlug, tableId: resolvedTableId, tableNumber: resolvedTableNumber, sessionToken }), [resolvedTableId, resolvedTableNumber, sessionToken, tenantSlug, token]);
  const publicHeaders = useMemo(() => ({ "Content-Type": "application/json", ...(tenantSlug ? { "x-tenant-slug": tenantSlug } : {}) }), [tenantSlug]);

  // Refresh current order
  const refreshCurrentOrder = useCallback(async () => {
    if (!sessionToken || (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))) {
      setCurrentOrder(null); setCurrentInvoice(null); setCurrentOrderError(""); return;
    }
    setIsCurrentOrderLoading(true); setCurrentOrderError("");
    try {
      const params = new URLSearchParams();
      Object.entries(publicOrderLocator).forEach(([k, v]) => params.set(k, String(v)));
      const res = await fetch(`${API_BASE_URL}/public/orders/current?${params.toString()}`, { method: "GET", headers: tenantSlug ? { "x-tenant-slug": tenantSlug } : undefined, credentials: "omit" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(asString((body as Record<string, unknown>)?.message) || "Failed to load order");
      const root = asRecord(body);
      setCurrentOrder(parsePublicOrder(root?.order)); setCurrentInvoice(parsePublicInvoice(root?.invoice));
    } catch (e) {
      setCurrentOrder(null); setCurrentInvoice(null);
      setCurrentOrderError(e instanceof Error ? e.message : "Failed to load order");
    } finally { setIsCurrentOrderLoading(false); }
  }, [publicOrderLocator, resolvedTableId, resolvedTableNumber, sessionToken, tenantSlug, token]);

  useEffect(() => { refreshCurrentOrder(); }, [refreshCurrentOrder]);

  useEffect(() => {
    if (!categoriesWithItems.length) { setActiveCategoryId("all"); return; }
    const exists = categoriesWithItems.some(({ category }) => category.id === activeCategoryId);
    if (activeCategoryId !== "all" && !exists) setActiveCategoryId("all");
  }, [activeCategoryId, categoriesWithItems]);

  // Cart helpers
  function getQuantity(itemId: string, variantId?: string): number {
    return cart.find(e => e.key === entryKey(itemId, variantId))?.quantity ?? 0;
  }

  function incrementEntry(item: PublicItem, variant: PublicVariant | undefined) {
    const key = entryKey(item.id, variant?.id);
    setCart(prev => {
      const ex = prev.find(e => e.key === key);
      if (ex) return prev.map(e => e.key === key ? { ...e, quantity: e.quantity + 1 } : e);
      return [...prev, { key, itemId: item.id, variantId: variant?.id, name: item.name, variantName: variant?.name, quantity: 1, unitPrice: variant?.price ?? 0, image: item.image }];
    });
  }

  function decrementEntry(itemId: string, variantId?: string) {
    const key = entryKey(itemId, variantId);
    setCart(prev => {
      const t = prev.find(e => e.key === key); if (!t) return prev;
      if (t.quantity <= 1) return prev.filter(e => e.key !== key);
      return prev.map(e => e.key === key ? { ...e, quantity: e.quantity - 1 } : e);
    });
  }

  function incrementFromSummary(entry: PublicCartEntry) {
    incrementEntry(
      { id: entry.itemId, name: entry.name, description: undefined, image: entry.image, isAvailable: true, variants: entry.variantId ? [{ id: entry.variantId, name: entry.variantName || "Regular", price: entry.unitPrice, isAvailable: true }] : [] },
      entry.variantId ? { id: entry.variantId, name: entry.variantName || "Regular", price: entry.unitPrice, isAvailable: true } : undefined
    );
  }

  // Submit order
  async function handleSubmitOrder() {
    const trimmedName = customerName.trim();
    const normalizedPhone = sanitizePhone(customerPhone.trim());
    if (!orderEnabled) { setSubmitError("QR link missing valid table details."); return; }
    if (!cart.length) { setSubmitError("Add at least one item."); return; }
    if (!trimmedName) { setSubmitError("Name is required."); return; }
    if (!normalizedPhone || normalizedPhone.replace(/\D/g, "").length < 10) { setSubmitError("Enter a valid 10-digit mobile number."); return; }

    setIsSubmitting(true); setSubmitError(""); setSubmitSuccess("");
    try {
      const res = await fetch(`${API_BASE_URL}/public/orders`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(tenantSlug ? { "x-tenant-slug": tenantSlug } : {}) }, credentials: "omit",
        body: JSON.stringify({
          ...(token ? { token } : {}), ...(sessionToken ? { sessionToken } : {}),
          ...(!token && tenantSlug ? { tenantSlug } : {}), ...(!token && resolvedTableId ? { tableId: resolvedTableId } : {}),
          ...(!token && !resolvedTableId && resolvedTableNumber ? { tableNumber: Number(resolvedTableNumber) } : {}),
          customerName: trimmedName, customerPhone: normalizedPhone,
          items: cart.map(i => ({ itemId: i.itemId, variantId: i.variantId, quantity: i.quantity, optionIds: [] })),
          note: note.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(asString((body as Record<string, unknown>)?.message) || "Could not place order.");
      const orderRecord = asRecord((body as Record<string, unknown>)?.order);
      const nextSessionToken = asString(orderRecord?.sessionToken);
      const parsedOrder = parsePublicOrder(orderRecord);
      if (typeof window !== "undefined") {
        const key = sessionStorageKey({ token, tenantSlug, tableId, tableNumber });
        if (nextSessionToken) { window.localStorage.setItem(key, nextSessionToken); setSessionToken(nextSessionToken); }
      }
      if (parsedOrder) { setCurrentOrder(parsedOrder); setCurrentInvoice(null); }
      setSubmitSuccess(asString((body as Record<string, unknown>)?.message) || "Order placed successfully!");
      setCart([]); setNote(""); setIsCartOpen(false);
      await refreshCurrentOrder();
    } catch (e) { setSubmitError(e instanceof Error ? e.message : "Could not place order."); }
    finally { setIsSubmitting(false); }
  }

  // Line update/delete
  async function updateCurrentLine(item: PublicOrderItem, quantity: number) {
    if (!item.lineId || !sessionToken || (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))) return;
    setBusyLineId(item.lineId); setCurrentOrderError(""); setSubmitSuccess("");
    try {
      const res = await fetch(`${API_BASE_URL}/public/orders/current/items/${item.lineId}`, { method: "PUT", headers: publicHeaders, credentials: "omit", body: JSON.stringify({ ...publicOrderLocator, quantity }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(asString((body as Record<string, unknown>)?.message) || "Update failed");
      await refreshCurrentOrder();
    } catch (e) { setCurrentOrderError(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusyLineId(null); }
  }

  async function deleteCurrentLine(item: PublicOrderItem) {
    if (!item.lineId || !sessionToken || (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))) return;
    setBusyLineId(item.lineId); setCurrentOrderError("");
    try {
      const params = new URLSearchParams();
      Object.entries(publicOrderLocator).forEach(([k, v]) => params.set(k, String(v)));
      const res = await fetch(`${API_BASE_URL}/public/orders/current/items/${item.lineId}?${params.toString()}`, { method: "DELETE", headers: tenantSlug ? { "x-tenant-slug": tenantSlug } : undefined, credentials: "omit" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(asString((body as Record<string, unknown>)?.message) || "Remove failed");
      await refreshCurrentOrder();
    } catch (e) { setCurrentOrderError(e instanceof Error ? e.message : "Remove failed"); }
    finally { setBusyLineId(null); }
  }

  async function requestInvoiceForCurrentOrder() {
    if (!sessionToken || (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))) return;
    setInvoiceBusy(true); setCurrentOrderError("");
    try {
      const res = await fetch(`${API_BASE_URL}/public/orders/current/request-invoice`, { method: "POST", headers: publicHeaders, credentials: "omit", body: JSON.stringify(publicOrderLocator) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(asString((body as Record<string, unknown>)?.message) || "Bill request failed");
      setSubmitSuccess(asString((body as Record<string, unknown>)?.message) || "Bill requested");
      await refreshCurrentOrder();
    } catch (e) { setCurrentOrderError(e instanceof Error ? e.message : "Bill request failed"); }
    finally { setInvoiceBusy(false); }
  }

  async function cancelCurrentOrder() {
    if (!sessionToken || (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))) return;
    setInvoiceBusy(true); setCurrentOrderError(""); setSubmitSuccess("");
    try {
      const res = await fetch(`${API_BASE_URL}/public/orders/current/cancel`, { method: "POST", headers: publicHeaders, credentials: "omit", body: JSON.stringify(publicOrderLocator) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(asString((body as Record<string, unknown>)?.message) || "Cancel failed");
      setSubmitSuccess(asString((body as Record<string, unknown>)?.message) || "Order cancelled");
      await refreshCurrentOrder();
    } catch (e) { setCurrentOrderError(e instanceof Error ? e.message : "Cancel failed"); }
    finally { setInvoiceBusy(false); }
  }

  async function createInvoiceForCurrentOrder() {
    if (!sessionToken || (!token && !(tenantSlug && (resolvedTableId || resolvedTableNumber)))) return;
    setInvoiceBusy(true); setCurrentOrderError("");
    try {
      const res = await fetch(`${API_BASE_URL}/public/orders/current/invoice`, { method: "POST", headers: publicHeaders, credentials: "omit", body: JSON.stringify({ ...publicOrderLocator, note: "Bill requested from QR" }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(asString((body as Record<string, unknown>)?.message) || "Invoice failed");
      setSubmitSuccess(asString((body as Record<string, unknown>)?.message) || "Invoice created");
      await refreshCurrentOrder();
    } catch (e) { setCurrentOrderError(e instanceof Error ? e.message : "Invoice failed"); }
    finally { setInvoiceBusy(false); }
  }

  // Summary panel shared props
  const summaryProps = {
    tableLabel, cart, customerName, customerPhone, note,
    onCustomerNameChange: (v: string) => { setCustomerName(v); setSubmitError(""); },
    onCustomerPhoneChange: (v: string) => { setCustomerPhone(v); setSubmitError(""); },
    onNoteChange: setNote,
    onIncrement: incrementFromSummary,
    onDecrement: (entry: PublicCartEntry) => decrementEntry(entry.itemId, entry.variantId),
    onSubmit: handleSubmitOrder, submitting: isSubmitting,
    canSubmit: Boolean(cart.length && customerName.trim() && customerPhone.trim() && orderEnabled),
    orderEnabled,
    helperText: orderEnabled
      ? `Order will go directly to kitchen with your details.${sessionToken ? " Additional items will be added to your current session." : ""}`
      : "This link is in preview mode — ordering not available.",
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      {/* ── Top Header Bar ── */}
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">QR Menu</p>
            <h1 className="text-[16px] font-bold tracking-tight text-stone-900 leading-tight truncate">{tenantName}</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="hidden rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-[11px] font-medium text-stone-600 sm:block">
              {tableLabel}
            </span>
            <button type="button" onClick={() => setIsCartOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-[0_2px_12px_rgba(245,158,11,0.4)] hover:bg-amber-600 active:scale-95 transition-all">
              <IconCart />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white border-2 border-white">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search + Category tabs */}
        <div className="border-t border-stone-100">
          <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6">
            <div className="relative mb-2.5">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"><IconSearch /></span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search dishes, drinks…"
                className="h-10 w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-4 text-[13px] text-stone-800 placeholder:text-stone-400 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100 transition-all" />
            </div>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 pb-0.5">
              <button type="button" onClick={() => setActiveCategoryId("all")}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all whitespace-nowrap ${activeCategoryId === "all" ? "border-amber-400 bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.35)]" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
                All Menu
              </button>
              {categoriesWithItems.map(({ category, depth }) => (
                <button key={category.id} type="button" onClick={() => setActiveCategoryId(category.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all whitespace-nowrap ${activeCategoryId === category.id ? "border-amber-400 bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.35)]" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
                  {depth > 0 ? "↳ " : ""}{category.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">

        {/* LEFT — Menu + Order status */}
        <div className="space-y-5">
          {/* Loading / error / success banners */}
          {isCurrentOrderLoading && (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-stone-200 bg-white px-4 py-3 text-[13px] text-stone-500 shadow-sm">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-amber-500" /> Loading current order…
            </div>
          )}
          {currentOrderError && (
            <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{currentOrderError}</div>
          )}
          {submitSuccess && (
            <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">{submitSuccess}</div>
          )}
          {submitError && (
            <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{submitError}</div>
          )}

          {/* Current Order Panel */}
          <CurrentOrderPanel
            order={currentOrder} invoice={currentInvoice} busyLineId={busyLineId} invoiceBusy={invoiceBusy}
            onRefresh={refreshCurrentOrder}
            onIncrement={item => updateCurrentLine(item, item.quantity + 1)}
            onDecrement={item => { if (item.quantity <= 1) { deleteCurrentLine(item); return; } updateCurrentLine(item, item.quantity - 1); }}
            onDelete={deleteCurrentLine} onCancelOrder={cancelCurrentOrder}
            onRequestInvoice={requestInvoiceForCurrentOrder} onCreateInvoice={createInvoiceForCurrentOrder}
          />

          {/* Menu loading */}
          {isLoading && (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-28 animate-pulse rounded-[18px] bg-stone-100" />
              ))}
            </div>
          )}
          {error && (
            <div className="rounded-[18px] border border-red-200 bg-red-50 px-5 py-6 text-center">
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          {/* Menu Sections */}
          {!isLoading && !error && (
            <div className="space-y-6">
              {visibleSections.length ? visibleSections.map(({ category, depth, items }) => (
                <section key={category.id}>
                  {/* Category heading */}
                  <div className="mb-3 flex items-baseline justify-between gap-2" style={{ paddingLeft: `${depth * 10}px` }}>
                    <div>
                      <h2 className="text-[17px] font-bold text-stone-900">{category.name}</h2>
                      <p className="text-[12px] text-stone-400 mt-0.5">{items.length} {items.length === 1 ? "item" : "items"}</p>
                    </div>
                  </div>
                  {/* Items grid */}
                  <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                    {items.map(item => {
                      const chosenVariant = resolveDefaultVariant(item, selectedVariants);
                      const quantity = getQuantity(item.id, chosenVariant?.id);
                      return (
                        <MenuItemCard
                          key={item.id} item={item} chosenVariant={chosenVariant} quantity={quantity}
                          selectedVariantId={selectedVariants[item.id]}
                          onVariantSelect={vId => setSelectedVariants(p => ({ ...p, [item.id]: vId }))}
                          onIncrement={() => incrementEntry(item, chosenVariant)}
                          onDecrement={() => decrementEntry(item.id, chosenVariant?.id)}
                        />
                      );
                    })}
                  </div>
                </section>
              )) : (
                <div className="rounded-[18px] border border-dashed border-stone-200 bg-white py-12 text-center">
                  <p className="text-[14px] text-stone-400">No items match your search or filter.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — Summary Panel (desktop) */}
        <aside className="hidden xl:sticky xl:top-[130px] xl:block">
          <SummaryPanel {...summaryProps} />
        </aside>
      </div>

      {/* ── Mobile: sticky cart bar ── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-4 xl:hidden">
        <div className="pointer-events-auto mx-auto max-w-lg rounded-[18px] border border-stone-200/80 bg-white/95 p-3 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">Cart</p>
              <p className="text-[14px] font-bold text-stone-900 leading-tight">
                {cartCount > 0 ? `${cartCount} ${cartCount === 1 ? "item" : "items"} · ${formatMoney(cartTotal)}` : "Empty cart"}
              </p>
            </div>
            <button type="button" onClick={() => setIsCartOpen(true)} disabled={cartCount === 0}
              className="shrink-0 rounded-[14px] bg-amber-500 px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_12px_rgba(245,158,11,0.4)] hover:bg-amber-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-default transition-all">
              {cartCount > 0 ? "View Cart →" : "Add items"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile: cart drawer ── */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 xl:hidden" onClick={() => setIsCartOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-[24px] bg-stone-50 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            onClick={e => e.stopPropagation()}>
            {/* Drawer handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-stone-300" />
            </div>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Your Order</p>
                <p className="text-[16px] font-bold text-stone-900">{tableLabel}</p>
              </div>
              <button type="button" onClick={() => setIsCartOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 transition-colors">
                <IconX />
              </button>
            </div>

            {/* Error / success inside drawer */}
            {submitError && (
              <div className="mx-4 mt-3 rounded-[12px] border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">{submitError}</div>
            )}

            <div className="p-4">
              <SummaryPanel {...summaryProps} compact />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
