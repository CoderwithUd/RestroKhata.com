"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/confirm-provider";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { getErrorMessage } from "@/lib/error";
import { showError, showInfo, showSuccess } from "@/lib/feedback";
import { useOrderSocket, type SocketOrderRole } from "@/lib/use-order-socket";
import {
  useCreateInvoiceMutation,
  useCreateGroupInvoiceMutation,
  useDeleteInvoiceMutation,
  useGetInvoicesQuery,
  usePayInvoiceMutation,
  useUpdateInvoiceMutation,
} from "@/store/api/invoicesApi";
import { useTentantProfileQuery } from "@/store/api/authApi";
import {
  useCancelOrderItemMutation,
  useGetOrdersQuery,
  useMoveOrderItemMutation,
  useRemoveOrderItemMutation,
} from "@/store/api/ordersApi";
import { useGetTablesQuery } from "@/store/api/tablesApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthToken } from "@/store/slices/authSlice";
import type { InvoiceRecord } from "@/store/types/invoices";
import type { OrderRecord } from "@/store/types/orders";
import type { TableRecord } from "@/store/types/tables";

type Props = {
  rawRole?: string;
};

type DiscountInput = { type: "PERCENTAGE" | "FLAT"; value: number };
type DraftBillingState = {
  table: TableRecord;
  orders: OrderRecord[];
  discount: DiscountInput;
};
type InvoiceEditorState = {
  invoiceId: string;
  note: string;
  discount: DiscountInput;
};
type MoveTargetSelection = {
  targetOrderId?: string;
  targetTableId?: string;
};
type DraftCorrectionState = {
  quantities: Record<string, number>;
  busyKey: string | null;
};
type HistoryRange = "all" | "today" | "yesterday" | "week" | "month";
type ReceiptProfile = {
  tenantName: string;
  gstNumber?: string;
  contactNumber?: string;
  address?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isWithinHistoryRange(value: string | undefined, range: HistoryRange): boolean {
  if (range === "all") return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 29);

  if (range === "today") {
    return date >= todayStart;
  }
  if (range === "yesterday") {
    return date >= yesterdayStart && date < todayStart;
  }
  if (range === "week") {
    return date >= weekStart;
  }
  return date >= monthStart;
}

function invoiceCustomerName(invoice: InvoiceRecord, order?: OrderRecord): string {
  const invoiceRaw = asRecord(invoice.raw);
  const invoiceCustomer = asRecord(invoiceRaw?.customer);
  const nestedOrder = asRecord(invoiceRaw?.order);
  const nestedOrderCustomer = asRecord(nestedOrder?.customer);
  const orderRaw = asRecord(order?.raw);
  const orderCustomer = asRecord(orderRaw?.customer);

  const candidates = [
    asString(invoiceCustomer?.name),
    asString(nestedOrderCustomer?.name),
    asString(orderCustomer?.name),
    asString(invoiceRaw?.customerName),
    asString(orderRaw?.customerName),
    asString(orderRaw?.customer_phone),
  ].filter(Boolean);

  return candidates[0] || "-";
}

function buildInvoiceShareText(invoice: InvoiceRecord, customerName: string, profile: ReceiptProfile): string {
  const tableLabel = invoice.table?.name || `Table ${invoice.table?.number ?? "-"}`;
  const amount = invoiceAmount(invoice);
  const itemLines = (invoice.items || []).map((item, index) => {
    const line = item.lineTotal ?? item.unitPrice * item.quantity;
    return `${index + 1}. ${item.name}${item.variantName ? ` (${item.variantName})` : ""} - ${item.quantity} x ${fmtCurrency(item.unitPrice)} = ${fmtCurrency(line)}`;
  });
  const subtotal = fmtCurrency(invoice.subTotal ?? amount);
  const tax = fmtCurrency(invoice.taxTotal ?? 0);
  const discount = fmtCurrency(invoice.discount?.amount ?? 0);
  const grand = fmtCurrency(invoice.grandTotal ?? amount);
  const balance = fmtCurrency(invoice.balanceDue ?? invoice.totalDue ?? amount);

  return [
    `${profile.tenantName} Invoice`,
    profile.address ? `Address: ${profile.address}` : "",
    profile.contactNumber ? `Phone: ${profile.contactNumber}` : "",
    profile.gstNumber ? `GST: ${profile.gstNumber}` : "",
    `Invoice: INV ${shortInvoiceId(invoice.id)}`,
    `Invoice ID: ${invoice.id}`,
    `Table: ${tableLabel}`,
    `Customer: ${customerName}`,
    `Created: ${fmtDateTime(invoice.createdAt)}`,
    "",
    "Items:",
    ...itemLines,
    "",
    `Subtotal: ${subtotal}`,
    `Tax: ${tax}`,
    `Discount: ${discount}`,
    `Grand Total: ${grand}`,
    `Balance: ${balance}`,
    `Amount: ${fmtCurrency(amount)}`,
    `Status: ${invoice.status}`,
    invoice.payment ? `Paid via ${invoice.payment.method} (${fmtCurrency(invoice.payment.paidAmount)})` : "Payment Pending",
  ].join("\n");
}

function normalizeRole(raw?: string): SocketOrderRole {
  const role = (raw || "").toLowerCase().trim();
  if (role.includes("owner") || role.includes("admin")) return "owner";
  if (role.includes("waiter") || role.includes("server") || role.includes("captain")) return "waiter";
  if (role.includes("kitchen") || role.includes("chef") || role.includes("cook")) return "kitchen";
  if (role.includes("manager")) return "manager";
  return "all";
}

function normalizeStatus(value?: string): string {
  return (value || "").toUpperCase();
}

function fmtCurrency(value?: number): string {
  if (value == null) return "Rs 0";
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtDateTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff} min ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function itemTotal(order: OrderRecord): number {
  const direct = order.grandTotal ?? order.subTotal;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return direct;
  const fromItems = (order.items || []).reduce((sum, item) => {
    const line = item.lineTotal ?? item.unitPrice * item.quantity;
    return sum + (Number.isFinite(line) ? line : 0);
  }, 0);
  return fromItems > 0 ? fromItems : 0;
}

function invoiceAmount(invoice: InvoiceRecord): number {
  const direct = invoice.balanceDue ?? invoice.totalDue ?? invoice.grandTotal ?? invoice.subTotal;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return direct;
  const fromItems = (invoice.items || []).reduce((sum, item) => {
    const line = item.lineTotal ?? item.unitPrice * item.quantity;
    return sum + (Number.isFinite(line) ? line : 0);
  }, 0);
  return fromItems > 0 ? fromItems : 0;
}

function draftItemsTotal(orders: OrderRecord[]): number {
  return orders.reduce((sum, order) => sum + itemTotal(order), 0);
}

function draftDiscountAmount(total: number, discount: DiscountInput): number {
  if (!(discount.value > 0)) return 0;
  if (discount.type === "PERCENTAGE") {
    return Math.min(total, (total * discount.value) / 100);
  }
  return Math.min(total, discount.value);
}

function correctionQty(quantity: number | undefined, selected?: number): number {
  const max = quantity && quantity > 0 ? Math.floor(quantity) : 1;
  if (!selected || !Number.isFinite(selected)) return 1;
  return Math.min(Math.max(1, Math.floor(selected)), max);
}

function canCorrectItemStatus(status?: string): boolean {
  return ["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(normalizeStatus(status));
}

function itemStatusPill(status?: string): string {
  const normalized = normalizeStatus(status);
  if (normalized === "SERVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "READY") return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized === "IN_PROGRESS") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "PLACED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "CANCELLED") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function createInvoiceEditorState(invoice: InvoiceRecord): InvoiceEditorState {
  return {
    invoiceId: invoice.id,
    note: invoice.note || "",
    discount: {
      type: invoice.discount?.type === "FLAT" ? "FLAT" : "PERCENTAGE",
      value: invoice.discount?.value ?? 0,
    },
  };
}

function sortByLatest<T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const a = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const b = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return b - a;
  });
}

function canGenerateInvoice(order?: OrderRecord): boolean {
  const status = normalizeStatus(order?.status);
  return status === "SERVED";
}

function isOpenOrderStatus(status?: string): boolean {
  return ["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(normalizeStatus(status));
}

function tableSearch(table?: TableRecord | InvoiceRecord["table"] | OrderRecord["table"]): string {
  return `${table?.name || ""} ${table?.number || ""}`.trim().toLowerCase();
}

function shortInvoiceId(invoiceId: string): string {
  return invoiceId ? invoiceId.slice(-6).toUpperCase() : "------";
}

function statusPill(status?: string): string {
  const normalized = normalizeStatus(status);
  if (normalized === "PAID") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "ISSUED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized === "READY") return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "SERVED") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (normalized === "IN_PROGRESS") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
        connected
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

function InvoicePreview({
  invoice,
  profile,
  customerName,
  isPaying,
  isPrivilegedBilling,
  isUpdating,
  isDeleting,
  onPay,
  onEditInvoice,
  onDelete,
  onDownloadPdf,
  onShare,
}: {
  invoice: InvoiceRecord | null;
  profile: ReceiptProfile;
  customerName: string;
  isPaying: boolean;
  isPrivilegedBilling: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  onPay: (invoice: InvoiceRecord, method: "CASH" | "UPI") => void;
  onEditInvoice: (invoice: InvoiceRecord) => void;
  onDelete: (invoice: InvoiceRecord) => void;
  onDownloadPdf: (invoice: InvoiceRecord) => void;
  onShare: (invoice: InvoiceRecord) => void;
}) {
  if (!invoice) {
    return (
      <article className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm text-slate-500">
        Select an invoice to preview, collect payment, or download PDF.
      </article>
    );
  }

  // const due = invoiceAmount(invoice);
  const due = Math.max(
  (invoice.totalDue ?? 0) -
  (invoice.payment?.paidAmount ?? 0),
  0
);
  const isIssued = normalizeStatus(invoice.status) === "ISSUED";
  const canCollectPayment = isPrivilegedBilling && isIssued && due > 0;

  return (
    <article className="rounded-[28px] border border-[#dfd2bb] bg-[linear-gradient(170deg,#fffef9_0%,#fff6e8_100%)] p-4 shadow-[0_24px_50px_-36px_rgba(53,38,18,0.5)]">
      <div className="mx-auto max-w-[420px] rounded-[24px] border border-[#e7dac2] bg-[#fffdf8] p-4 shadow-inner">
        <div className="border-b border-dashed border-[#d8ccb6] pb-3 text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-slate-900">{profile.tenantName}</p>
          {profile.address ? <p className="mt-1 text-[11px] text-slate-600">{profile.address}</p> : null}
          <p className="mt-1 text-[11px] text-slate-600">
            {profile.contactNumber ? `Phone: ${profile.contactNumber}` : ""}
            {profile.contactNumber && profile.gstNumber ? " | " : ""}
            {profile.gstNumber ? `GST: ${profile.gstNumber}` : ""}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">Thermal Invoice Preview</p>
        </div>

        <div className="space-y-1 border-b border-dashed border-[#d8ccb6] py-3 text-[11px] text-slate-700">
          <div className="flex items-center justify-between"><span>Invoice</span><span className="font-semibold">INV {shortInvoiceId(invoice.id)}</span></div>
          <div className="flex items-center justify-between"><span>Status</span><span className="font-semibold">{invoice.status}</span></div>
          <div className="flex items-center justify-between"><span>Table</span><span className="font-semibold">{invoice.table?.name || `Table ${invoice.table?.number ?? "-"}`}</span></div>
          <div className="flex items-center justify-between"><span>Customer</span><span className="font-semibold">{customerName}</span></div>
          <div className="flex items-center justify-between"><span>Date</span><span className="font-semibold">{fmtDateTime(invoice.createdAt)}</span></div>
        </div>

        <div className="space-y-2 border-b border-dashed border-[#d8ccb6] py-3">
          {invoice.items.map((item, index) => {
            const total = item.lineTotal ?? item.unitPrice * item.quantity;
            return (
              <div key={`${invoice.id}-${item.itemId}-${item.variantId || "base"}-${index}`} className="grid grid-cols-[1fr_auto] gap-2 text-[11px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {index + 1}. {item.name}
                    {item.variantName ? ` (${item.variantName})` : ""}
                  </p>
                  <p className="mt-0.5 text-slate-500">{item.quantity} x {fmtCurrency(item.unitPrice)}</p>
                </div>
                <p className="font-semibold text-slate-900">{fmtCurrency(total)}</p>
              </div>
            );
          })}
        </div>

        <div className="space-y-1 py-3 text-[11px]">
          <div className="flex items-center justify-between text-slate-600"><span>Subtotal</span><span>{fmtCurrency(invoice.subTotal)}</span></div>
          <div className="flex items-center justify-between text-slate-600"><span>Tax</span><span>{fmtCurrency(invoice.taxTotal)}</span></div>
          <div className="flex items-center justify-between text-slate-600"><span>Discount</span><span>{invoice.discount ? fmtCurrency(invoice.discount.amount) : "Rs 0"}</span></div>
          <div className="flex items-center justify-between border-t border-dashed border-[#d8ccb6] pt-2 text-slate-900">
            <span className="font-semibold">Grand Total</span>
            <span className="text-base font-semibold">{fmtCurrency(invoice.grandTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-900">
            <span className="font-semibold">Balance</span>
            <span className="text-base font-semibold">{fmtCurrency(invoice.balanceDue ?? due)}</span>
          </div>
          {invoice.payment ? (
            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
              Paid via {invoice.payment.method} | {fmtCurrency(invoice.payment.paidAmount)}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => onDownloadPdf(invoice)}
          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
        >
          Download PDF
        </button>
        <button
          type="button"
          onClick={() => onShare(invoice)}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700"
        >
          WhatsApp Share
        </button>
        {isPrivilegedBilling && isIssued ? (
          <>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onEditInvoice(invoice)}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800 disabled:opacity-50"
            >
              {isUpdating ? "Opening..." : "Edit Invoice"}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => onDelete(invoice)}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete Invoice"}
            </button>
          </>
        ) : null}
        {canCollectPayment ? (
          <>
            <button
              type="button"
              disabled={isPaying}
              onClick={() => onPay(invoice, "CASH")}
              className="rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPaying ? "Processing..." : "Cash Paid"}
            </button>
            <button
              type="button"
              disabled={isPaying}
              onClick={() => onPay(invoice, "UPI")}
              className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-700 disabled:opacity-50"
            >
              {isPaying ? "Processing..." : "UPI Paid"}
            </button>
          </>
        ) : (
          <div className="sm:col-span-2 xl:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {normalizeStatus(invoice.status) === "PAID"
              ? `Payment already collected${invoice.payment?.method ? ` via ${invoice.payment.method}` : ""}.`
              : due <= 0
                ? "No balance left to collect."
                : isPrivilegedBilling
                  ? "Only ISSUED invoices can be collected."
                  : "Final payment sirf manager ya owner kar sakta hai."}
          </div>
        )}
      </div>
    </article>
  );
}

export function InvoicesWorkspace({ rawRole }: Props) {
  const confirm = useConfirm();
  const token = useAppSelector(selectAuthToken);
  const role = normalizeRole(rawRole);
  const isPrivilegedBilling = role === "owner" || role === "manager";
  const [tableFilter, setTableFilter] = useState("");
  const [historyRange, setHistoryRange] = useState<HistoryRange>("today");
  const [customerFilter, setCustomerFilter] = useState("");
  const [selectedBillingOrderIds, setSelectedBillingOrderIds] = useState<Record<string, string[]>>({});
  const [socketConnected, setSocketConnected] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isInvoiceViewOpen, setIsInvoiceViewOpen] = useState(false);
  const [invoiceOverrides, setInvoiceOverrides] = useState<Record<string, InvoiceRecord>>({});
  const [draftBilling, setDraftBilling] = useState<DraftBillingState | null>(null);
  const [draftCorrection, setDraftCorrection] = useState<DraftCorrectionState>({ quantities: {}, busyKey: null });
  const [invoiceEditor, setInvoiceEditor] = useState<InvoiceEditorState | null>(null);
  const { data: tenantProfile } = useTentantProfileQuery();

  const {
    data: tablesData,
    isFetching: isTablesFetching,
    refetch: refetchTables,
  } = useGetTablesQuery({ isActive: true }, { pollingInterval: 30000 });
  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useGetOrdersQuery(
    { status: ["PLACED", "IN_PROGRESS", "READY", "SERVED"] },
    { pollingInterval: 30000 },
  );
  const {
    data: invoicesData,
    isFetching: isInvoicesFetching,
    refetch: refetchInvoices,
  } = useGetInvoicesQuery(undefined, { pollingInterval: 30000 });

  const [createInvoice, { isLoading: isCreating }] = useCreateInvoiceMutation();
  const [createGroupInvoice, { isLoading: isCreatingGroup }] = useCreateGroupInvoiceMutation();
  const [payInvoice, { isLoading: isPaying }] = usePayInvoiceMutation();
  const [updateInvoice, { isLoading: isUpdatingInvoice }] = useUpdateInvoiceMutation();
  const [deleteInvoice, { isLoading: isDeletingInvoice }] = useDeleteInvoiceMutation();
  const [removeOrderItem] = useRemoveOrderItemMutation();
  const [cancelOrderItem] = useCancelOrderItemMutation();
  const [moveOrderItem] = useMoveOrderItemMutation();

  useOrderSocket({
    token,
    enabled: true,
    role,
    onConnectionChange: setSocketConnected,
    onEvent: (event) => {
      if (event.type === "updated" && normalizeStatus(event.order?.status) === "READY") {
        const table = event.order?.table;
        const label = table?.name || (table?.number ? `Table ${table.number}` : "Table");
        showInfo(`${label} is ready for invoice / serve`);
      }
      refetchTables();
      refetchOrders();
      refetchInvoices();
    },
  });

  const tables = useMemo(() => {
    const items = tablesData?.items || [];
    return [...items].sort((left, right) => left.number - right.number);
  }, [tablesData]);
  const orders = useMemo(() => sortByLatest(ordersData?.items || []), [ordersData]);
  const tablesById = useMemo(
    () => new Map((tablesData?.items || []).map((table) => [table.id, table])),
    [tablesData?.items],
  );
  const ordersById = useMemo(
    () => new Map((ordersData?.items || []).map((order) => [order.id, order])),
    [ordersData?.items],
  );
  const invoices = useMemo(() => {
    const merged = new Map<string, InvoiceRecord>();

    const enrichInvoice = (invoice: InvoiceRecord): InvoiceRecord => {
      const linkedOrder = ordersById.get(invoice.orderId);
      const linkedTable = invoice.table?.id
        ? tablesById.get(invoice.table.id)
        : linkedOrder?.table?.id
          ? tablesById.get(linkedOrder.table.id)
          : undefined;

      if (invoice.table?.id || linkedOrder?.table || linkedTable) {
        return {
          ...invoice,
          table: invoice.table || linkedOrder?.table || (linkedTable
            ? {
                id: linkedTable.id,
                number: linkedTable.number,
                name: linkedTable.name,
              }
            : undefined),
        };
      }

      return invoice;
    };

    (invoicesData?.items || []).forEach((invoice) => {
      merged.set(invoice.id, enrichInvoice(invoice));
    });
    Object.values(invoiceOverrides).forEach((invoice) => {
      merged.set(invoice.id, enrichInvoice(invoice));
    });

    return sortByLatest(Array.from(merged.values()));
  }, [invoiceOverrides, invoicesData?.items, ordersById, tablesById]);

  const invoiceByOrderId = useMemo(() => {
    const map = new Map<string, InvoiceRecord>();
    invoices.forEach((invoice) => {
      const coveredIds = [...(invoice.orderIds || []), invoice.orderId].filter(Boolean);
      coveredIds.forEach((orderId) => {
        if (!map.has(orderId)) map.set(orderId, invoice);
      });
    });
    return map;
  }, [invoices]);

  const issuedInvoicesByTableId = useMemo(() => {
    const map = new Map<string, InvoiceRecord[]>();
    invoices.forEach((invoice) => {
      const tableId = invoice.table?.id;
      if (!tableId) return;
      if (normalizeStatus(invoice.status) !== "ISSUED") return;
      const existing = map.get(tableId) || [];
      existing.push(invoice);
      map.set(tableId, existing);
    });
    return map;
  }, [invoices]);

  const openOrdersByTable = useMemo(() => {
    const map = new Map<string, OrderRecord[]>();
    orders.forEach((order) => {
      const tableId = order.table?.id || order.tableId;
      if (!tableId || invoiceByOrderId.has(order.id)) return;
      if (!isOpenOrderStatus(order.status)) return;
      const existing = map.get(tableId) || [];
      existing.push(order);
      map.set(tableId, existing);
    });
    map.forEach((items, key) => {
      map.set(key, sortByLatest(items));
    });
    return map;
  }, [invoiceByOrderId, orders]);

  const filterQuery = tableFilter.trim().toLowerCase();

  const billingRows = useMemo(() => {
    return tables
      .filter((table) => {
        const tableId = table.id;
        const tableStatus = normalizeStatus(table.status);
        const isOccupied = tableStatus === "OCCUPIED" || tableStatus === "BILLING";
        const hasOpenOrder = (openOrdersByTable.get(tableId) || []).length > 0;
        const hasIssuedInvoice = (issuedInvoicesByTableId.get(tableId) || []).length > 0;
        if (!isOccupied) return false;
        if (!hasOpenOrder && !hasIssuedInvoice) return false;
        if (!filterQuery) return true;
        return tableSearch(table).includes(filterQuery);
      })
      .map((table) => {
        const rowOrders = openOrdersByTable.get(table.id) || [];
        const currentInvoices = issuedInvoicesByTableId.get(table.id) || [];
        const readyOrders = rowOrders.filter((order) => canGenerateInvoice(order));
        return { table, orders: rowOrders, currentInvoices, readyOrders };
      });
  }, [filterQuery, issuedInvoicesByTableId, openOrdersByTable, tables]);

  const pendingBillingRows = useMemo(
    () => billingRows.filter((row) => row.readyOrders.length > 0 && row.currentInvoices.length === 0),
    [billingRows],
  );
  const occupiedTablesCount = useMemo(
    () =>
      tables.filter((table) => {
        if (normalizeStatus(table.status) !== "OCCUPIED") return false;
        const tableId = table.id;
        return (openOrdersByTable.get(tableId) || []).length > 0 || (issuedInvoicesByTableId.get(tableId) || []).length > 0;
      }).length,
    [issuedInvoicesByTableId, openOrdersByTable, tables],
  );

  const issuedInvoices = useMemo(
    () => invoices.filter((invoice) => normalizeStatus(invoice.status) === "ISSUED"),
    [invoices],
  );

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => normalizeStatus(invoice.status) === "PAID"),
    [invoices],
  );

  const receiptProfile = useMemo<ReceiptProfile>(() => {
    const tenant = tenantProfile?.tenant;
    const address = tenant?.address
      ? [tenant.address.line1, tenant.address.line2, tenant.address.city, tenant.address.state, tenant.address.postalCode]
          .filter(Boolean)
          .join(", ")
      : "";

    return {
      tenantName: tenant?.name || "Restaurant",
      gstNumber: tenant?.gstNumber || "",
      contactNumber: tenant?.contactNumber || "",
      address,
    };
  }, [tenantProfile?.tenant]);

  const invoiceCustomerMap = useMemo(() => {
    const map = new Map<string, string>();
    invoices.forEach((invoice) => {
      const linkedOrder = ordersById.get(invoice.orderId);
      map.set(invoice.id, invoiceCustomerName(invoice, linkedOrder));
    });
    return map;
  }, [invoices, ordersById]);

  const historySearch = customerFilter.trim().toLowerCase();
  const historyInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (!isWithinHistoryRange(invoice.createdAt, historyRange)) return false;
      if (!historySearch) return true;

      const customer = (invoiceCustomerMap.get(invoice.id) || "").toLowerCase();
      const tableText = tableSearch(invoice.table);
      const invoiceText = `inv ${shortInvoiceId(invoice.id).toLowerCase()} ${invoice.orderId.toLowerCase()}`;

      return customer.includes(historySearch) || tableText.includes(historySearch) || invoiceText.includes(historySearch);
    });
  }, [historyRange, historySearch, invoiceCustomerMap, invoices]);

  const invoiceSelectionPool = historyInvoices.length ? historyInvoices : invoices;

  const activeInvoiceId =
    selectedInvoiceId && invoiceSelectionPool.some((invoice) => invoice.id === selectedInvoiceId)
      ? selectedInvoiceId
      : (invoiceSelectionPool.find((invoice) => normalizeStatus(invoice.status) === "ISSUED")?.id ??
        invoiceSelectionPool[0]?.id ??
        null);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === activeInvoiceId) || null,
    [activeInvoiceId, invoices],
  );
  const selectedInvoiceOrders = useMemo(() => {
    if (!selectedInvoice) return [];
    const orderIds = [...(selectedInvoice.orderIds || []), selectedInvoice.orderId].filter(Boolean);
    return orderIds
      .map((orderId) => ordersById.get(orderId))
      .filter((order): order is OrderRecord => Boolean(order));
  }, [ordersById, selectedInvoice]);
  const editingInvoice = useMemo(
    () =>
      invoiceEditor
        ? invoices.find((invoice) => invoice.id === invoiceEditor.invoiceId) || null
        : null,
    [invoiceEditor, invoices],
  );
  const draftMoveTargets = useMemo(() => {
    if (!draftBilling) return [];
    return sortByLatest(openOrdersByTable.get(draftBilling.table.id) || []).filter((order) => isOpenOrderStatus(order.status));
  }, [draftBilling, openOrdersByTable]);

  useEffect(() => {
    if (!draftBilling) return;
    const nextOrders = draftBilling.orders
      .map((draftOrder) => orders.find((order) => order.id === draftOrder.id) || draftOrder)
      .filter((order) => isOpenOrderStatus(order.status));

    const changed =
      nextOrders.length !== draftBilling.orders.length ||
      nextOrders.some((order, index) => order !== draftBilling.orders[index]);

    if (!changed) return;
    if (nextOrders.length === 0) {
      setDraftBilling(null);
      return;
    }

    setDraftBilling((current) =>
      current
        ? {
            ...current,
            orders: nextOrders,
          }
        : current,
    );
  }, [draftBilling, orders]);

  function openInvoiceView(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    setIsInvoiceViewOpen(true);
  }

  function openDraftInvoice(table: TableRecord, ordersToBill: OrderRecord[]) {
    if (!ordersToBill.length) return;
    setDraftCorrection({ quantities: {}, busyKey: null });
    setDraftBilling({
      table,
      orders: ordersToBill,
      discount: { type: "PERCENTAGE", value: 0 },
    });
  }

  async function handleCreateInvoice(order: OrderRecord, discount?: DiscountInput) {
    try {
      const response = await createInvoice({
        orderId: order.id,
        ...(discount ? { discountType: discount.type, discountValue: discount.value } : {}),
      }).unwrap();

      if (response.invoice?.id) {
        setInvoiceOverrides((prev) => ({ ...prev, [response.invoice.id]: response.invoice }));
        setSelectedInvoiceId(response.invoice.id);
        setIsInvoiceViewOpen(true);
      }

      showSuccess(response.message || `Invoice created for ${order.table?.name || `Table ${order.table?.number}`}`);
      setDraftBilling(null);
      refetchTables();
      refetchOrders();
      refetchInvoices();
    } catch (error) {
      showError(getErrorMessage(error));
    }
  }

  async function handleCreateGroupInvoice(table: TableRecord, ordersToBill: OrderRecord[], discount?: DiscountInput) {
    if (!ordersToBill.length) return;
    try {
      const response = await createGroupInvoice({
        tableId: table.id,
        ...(ordersToBill.length > 1 ? { orderIds: ordersToBill.map((order) => order.id) } : {}),
        ...(discount ? { discountType: discount.type, discountValue: discount.value } : {}),
      }).unwrap();

      if (response.invoice?.id) {
        setInvoiceOverrides((prev) => ({ ...prev, [response.invoice.id]: response.invoice }));
        setSelectedInvoiceId(response.invoice.id);
        setIsInvoiceViewOpen(true);
      }

      showSuccess(
        response.message ||
          `${ordersToBill.length > 1 ? "Group invoice" : "Invoice"} created for ${table.name || `Table ${table.number}`}`,
      );
      setDraftBilling(null);
      refetchTables();
      refetchOrders();
      refetchInvoices();
    } catch (error) {
      showError(getErrorMessage(error));
    }
  }

  function selectedReadyOrders(tableId: string, readyOrders: OrderRecord[]): OrderRecord[] {
    const selectedIds = selectedBillingOrderIds[tableId];
    if (!selectedIds?.length) return readyOrders;
    const idSet = new Set(selectedIds);
    const selected = readyOrders.filter((order) => idSet.has(order.id));
    return selected.length ? selected : readyOrders;
  }

  function toggleBillingOrder(tableId: string, orderId: string) {
    setSelectedBillingOrderIds((current) => {
      const existing = current[tableId] || [];
      return {
        ...current,
        [tableId]: existing.includes(orderId)
          ? existing.filter((id) => id !== orderId)
          : [...existing, orderId],
      };
    });
  }

  function selectAllBillingOrders(tableId: string, readyOrders: OrderRecord[]) {
    setSelectedBillingOrderIds((current) => ({
      ...current,
      [tableId]: readyOrders.map((order) => order.id),
    }));
  }

  function clearBillingSelection(tableId: string) {
    setSelectedBillingOrderIds((current) => ({
      ...current,
      [tableId]: [],
    }));
  }

  async function handlePayInvoice(invoice: InvoiceRecord, method: "CASH" | "UPI") {
    if (!isPrivilegedBilling) return;
    // const amount = invoiceAmount(invoice);
    const amount = Math.max(
  (invoice.totalDue ?? 0) -
  (invoice.payment?.paidAmount ?? 0),
  0
);
    if (!(amount > 0)) return;

    try {
      const response = await payInvoice({
        invoiceId: invoice.id,
        payload: { method, paidAmount: amount },
      }).unwrap();

      showSuccess(response.message || "Payment done");
      if (response.invoice?.id) {
        setInvoiceOverrides((prev) => ({ ...prev, [response.invoice.id]: response.invoice }));
        setSelectedInvoiceId(response.invoice.id);
        setIsInvoiceViewOpen(true);
      } else {
        setSelectedInvoiceId(invoice.id);
        setIsInvoiceViewOpen(true);
      }
      refetchTables();
      refetchOrders();
      refetchInvoices();
    } catch (error) {
      showError(getErrorMessage(error));
    }
  }

  function handleApplyInvoiceDiscount(invoice: InvoiceRecord) {
    if (!isPrivilegedBilling) return;
    setInvoiceEditor(createInvoiceEditorState(invoice));
    setSelectedInvoiceId(invoice.id);
    setIsInvoiceViewOpen(true);
  }

  async function handleSaveInvoiceEditor() {
    if (!invoiceEditor || !isPrivilegedBilling) return;

    const parsedValue = Number(invoiceEditor.discount.value);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      showError("Enter a valid discount value");
      return;
    }

    try {
      const response = await updateInvoice({
        invoiceId: invoiceEditor.invoiceId,
        payload: {
          note: invoiceEditor.note.trim() || undefined,
          discountType: invoiceEditor.discount.type,
          discountValue: parsedValue,
        },
      }).unwrap();
      showSuccess(response.message || "Invoice updated");
      if (response.invoice?.id) {
        setInvoiceOverrides((prev) => ({ ...prev, [response.invoice.id]: response.invoice }));
        setSelectedInvoiceId(response.invoice.id);
      }
      setInvoiceEditor(null);
      refetchInvoices();
      refetchOrders();
      refetchTables();
    } catch (error) {
      showError(getErrorMessage(error));
    }
  }

  async function handleDeleteInvoice(invoice: InvoiceRecord) {
    if (!isPrivilegedBilling) return;
    const approved = await confirm({
      title: "Delete Invoice",
      message: "Delete this unpaid invoice and unlock the order?",
      confirmText: "Delete Invoice",
      cancelText: "Keep Invoice",
      tone: "danger",
    });
    if (!approved) return;

    try {
      const response = await deleteInvoice(invoice.id).unwrap();
      showSuccess(response.message || "Invoice deleted");
      setInvoiceEditor(null);
      setIsInvoiceViewOpen(false);
      refetchInvoices();
      refetchOrders();
      refetchTables();
    } catch (error) {
      showError(getErrorMessage(error));
    }
  }

  async function handleShareInvoice(invoice: InvoiceRecord) {
    const customerName = invoiceCustomerMap.get(invoice.id) || "-";
    const text = buildInvoiceShareText(invoice, customerName, receiptProfile);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `INV ${shortInvoiceId(invoice.id)}`,
          text,
        });
        return;
      }
    } catch {
      // ignore and fallback to WhatsApp deep link
    }

    if (typeof window !== "undefined") {
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function handleDraftCorrectionQuantityChange(lineKey: string, quantity: number) {
    setDraftCorrection((current) => ({
      ...current,
      quantities: { ...current.quantities, [lineKey]: quantity },
    }));
  }

  async function handleDraftRemoveItem(orderId: string, lineId: string, itemName: string, quantity: number, maxQuantity: number) {
    const nextQuantity = correctionQty(maxQuantity, quantity);
    const busyKey = `${orderId}:${lineId}`;
    try {
      setDraftCorrection((current) => ({ ...current, busyKey }));
      await removeOrderItem({
        orderId,
        lineId,
        payload: nextQuantity < maxQuantity ? { quantity: nextQuantity } : undefined,
      }).unwrap();
      showSuccess(nextQuantity < maxQuantity ? `${nextQuantity} qty removed from ${itemName}` : `${itemName} removed`);
      refetchOrders();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setDraftCorrection((current) => ({ ...current, busyKey: null }));
    }
  }

  async function handleDraftCancelItem(orderId: string, lineId: string, itemName: string) {
    const busyKey = `${orderId}:${lineId}`;
    try {
      setDraftCorrection((current) => ({ ...current, busyKey }));
      await cancelOrderItem({ orderId, lineId }).unwrap();
      showSuccess(`${itemName} cancelled from bill flow`);
      refetchOrders();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setDraftCorrection((current) => ({ ...current, busyKey: null }));
    }
  }

  async function handleDraftMoveItem(
    orderId: string,
    lineId: string,
    itemName: string,
    target: MoveTargetSelection,
    quantity: number,
    maxQuantity: number,
  ) {
    const nextQuantity = correctionQty(maxQuantity, quantity);
    const busyKey = `${orderId}:${lineId}`;
    try {
      setDraftCorrection((current) => ({ ...current, busyKey }));
      await moveOrderItem({
        orderId,
        lineId,
        payload: {
          ...target,
          ...(nextQuantity < maxQuantity ? { quantity: nextQuantity } : {}),
        },
      }).unwrap();
      showSuccess(nextQuantity < maxQuantity ? `${nextQuantity} qty exchanged from ${itemName}` : `${itemName} exchanged successfully`);
      refetchOrders();
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setDraftCorrection((current) => ({ ...current, busyKey: null }));
    }
  }

  return (
    <div className="h-full">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={tableFilter}
            onChange={(event) => setTableFilter(event.target.value)}
            placeholder="Search occupied table"
            className="h-10 rounded-2xl border border-[#e1d5bf] bg-white px-4 text-sm outline-none ring-amber-200 focus:ring-2"
          />
          <LiveBadge connected={socketConnected} />
        </div>
        <button
          type="button"
          onClick={() => {
            refetchTables();
            refetchOrders();
            refetchInvoices();
          }}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
        >
          {isTablesFetching || isOrdersFetching || isInvoicesFetching ? <Spinner /> : "Refresh"}
        </button>
      </div>

      <section className="mb-5 grid gap-3 md:grid-cols-4">
        <article className="rounded-[26px] border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">Occupied Tables</p>
          <p className="mt-2 text-3xl font-semibold text-amber-950">{occupiedTablesCount}</p>
        </article>
        <article className="rounded-[26px] border border-orange-200 bg-orange-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-800">Pending Billing</p>
          <p className="mt-2 text-3xl font-semibold text-orange-950">{pendingBillingRows.length}</p>
        </article>
        <article className="rounded-[26px] border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">Issued</p>
          <p className="mt-2 text-3xl font-semibold text-blue-950">{issuedInvoices.length}</p>
        </article>
        <article className="rounded-[26px] border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">Paid History</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">{paidInvoices.length}</p>
        </article>
      </section>

      <section className="space-y-4">
          <article className="rounded-[28px] border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff6e8_100%)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Create Invoice From Occupied Table</h3>
                <p className="text-xs text-slate-500">Manager/Waiter dono yahin se invoice generate, view aur payment workflow handle kar sakte hain.</p>
              </div>
              <span className="rounded-full border border-white/80 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                {billingRows.length} actionable
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#e3d6bc] bg-white/90">
              {billingRows.length === 0 ? (
                <p className="border border-dashed border-[#d8ccb6] bg-white/70 py-10 text-center text-sm text-slate-500">
                  No actionable occupied table found.
                </p>
              ) : (
                <>
                  <div className="space-y-2 p-2 md:hidden">
                    {billingRows.map(({ table, orders: tableOrders, currentInvoices, readyOrders }) => {
                      const primaryInvoice = currentInvoices[0] || null;
                      const rowAmount = primaryInvoice
                        ? currentInvoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0)
                        : tableOrders.reduce((sum, order) => sum + itemTotal(order), 0);
                      const selectedOrders = selectedReadyOrders(table.id, readyOrders);
                      const orderHint =
                        currentInvoices.length > 0
                          ? `${currentInvoices.length} issued invoice${currentInvoices.length === 1 ? "" : "s"} pending`
                          : readyOrders.length > 0
                            ? `${readyOrders.length} order${readyOrders.length === 1 ? "" : "s"} ready to bill`
                            : tableOrders.length > 0
                              ? `${tableOrders.length} running order${tableOrders.length === 1 ? "" : "s"}`
                              : "No open order";

                      return (
                        <article key={`mobile-${table.id}`} className="rounded-xl border border-[#e6dccb] bg-white p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{table.name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">T{table.number}</p>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{fmtCurrency(rowAmount)}</p>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">{orderHint}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                            {tableOrders.map((order) => (
                              <span key={order.id} className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${statusPill(order.status)}`}>
                                {order.orderNumber ? `#${order.orderNumber}` : order.id.slice(-4)} {order.status}
                              </span>
                            ))}
                            {currentInvoices.map((invoice) => (
                              <span key={invoice.id} className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${statusPill(invoice.status)}`}>
                                INV {shortInvoiceId(invoice.id)}{invoice.isGroupInvoice ? " Group" : ""}
                              </span>
                            ))}
                          </div>
                          {readyOrders.length > 0 ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold text-slate-700">Select orders to bill</p>
                                <div className="flex gap-2 text-[10px] font-semibold">
                                  <button type="button" onClick={() => selectAllBillingOrders(table.id, readyOrders)} className="text-slate-600">
                                    All
                                  </button>
                                  <button type="button" onClick={() => clearBillingSelection(table.id)} className="text-slate-600">
                                    Clear
                                  </button>
                                </div>
                              </div>
                              <div className="mt-2 space-y-1.5">
                                {readyOrders.map((order) => {
                                  const checked = selectedOrders.some((entry) => entry.id === order.id);
                                  return (
                                    <label key={order.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[11px] text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleBillingOrder(table.id, order.id)}
                                        className="h-4 w-4 rounded border-slate-300"
                                      />
                                      <span className="min-w-0 flex-1">
                                        {order.orderNumber ? `#${order.orderNumber}` : order.id.slice(-4)}
                                        {order.customerName ? ` • ${order.customerName}` : ""}
                                      </span>
                                      <span className="font-semibold">{fmtCurrency(itemTotal(order))}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {currentInvoices.length > 0 ? (
                              <>
                                {currentInvoices.map((invoice) => (
                                  <button
                                    key={invoice.id}
                                    type="button"
                                    onClick={() => openInvoiceView(invoice.id)}
                                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                  >
                                    View INV {shortInvoiceId(invoice.id)}
                                  </button>
                                ))}
                              </>
                            ) : null}
                            {selectedOrders.length === 1 ? (
                              <button
                                type="button"
                                disabled={isCreating}
                                onClick={() => openDraftInvoice(table, selectedOrders)}
                                className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {isCreating ? "Creating..." : "Bill Selected"}
                              </button>
                            ) : null}
                            {selectedOrders.length > 1 ? (
                              <button
                                type="button"
                                disabled={isCreatingGroup}
                                onClick={() => openDraftInvoice(table, selectedOrders)}
                                className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {isCreatingGroup ? "Creating..." : `Bill Selected ${selectedOrders.length}`}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#fff5e5] text-[11px] uppercase tracking-[0.16em] text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Table</th>
                        <th className="px-3 py-2">Order</th>
                        <th className="px-3 py-2">Amount</th>
                        <th className="px-3 py-2">Invoice</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingRows.map(({ table, orders: tableOrders, currentInvoices, readyOrders }) => {
                        const primaryInvoice = currentInvoices[0] || null;
                        const rowAmount = primaryInvoice
                          ? currentInvoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0)
                          : tableOrders.reduce((sum, order) => sum + itemTotal(order), 0);
                        const selectedOrders = selectedReadyOrders(table.id, readyOrders);
                        const orderHint =
                          currentInvoices.length > 0
                            ? `${currentInvoices.length} issued invoice${currentInvoices.length === 1 ? "" : "s"} pending payment`
                            : readyOrders.length > 0
                              ? `${readyOrders.length} order${readyOrders.length === 1 ? "" : "s"} ready to bill`
                              : `${tableOrders.length} running order${tableOrders.length === 1 ? "" : "s"}`;

                        return (
                          <tr key={table.id} className="border-t border-[#eee4d1]">
                            <td className="px-3 py-3">
                              <p className="font-semibold text-slate-900">{table.name}</p>
                              <p className="mt-1 text-xs text-slate-500">T{table.number}</p>
                            </td>
                            <td className="px-3 py-3">
                              <div className="space-y-1.5">
                                {tableOrders.length === 0 ? (
                                  <span className="text-xs text-slate-500">No open order</span>
                                ) : (
                                  tableOrders.map((order) => (
                                    <div key={order.id} className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(order.status)}`}>
                                          {order.orderNumber ? `#${order.orderNumber}` : order.id.slice(-4)} {order.status}
                                        </span>
                                        <span className="text-[11px] font-semibold text-slate-800">{fmtCurrency(itemTotal(order))}</span>
                                      </div>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {order.items.length} item(s) | {timeAgo(order.updatedAt || order.createdAt)}
                                        {order.customerName ? ` | ${order.customerName}` : ""}
                                      </p>
                                      {canGenerateInvoice(order) ? (
                                        <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-700">
                                          <input
                                            type="checkbox"
                                            checked={selectedOrders.some((entry) => entry.id === order.id)}
                                            onChange={() => toggleBillingOrder(table.id, order.id)}
                                            className="h-4 w-4 rounded border-slate-300"
                                          />
                                          Select for next invoice
                                        </label>
                                      ) : null}
                                    </div>
                                  ))
                                )}
                                <p className="text-[11px] font-medium text-slate-700">{orderHint}</p>
                                {readyOrders.length > 0 ? (
                                  <div className="flex gap-3 text-[11px] font-semibold text-slate-600">
                                    <button type="button" onClick={() => selectAllBillingOrders(table.id, readyOrders)}>
                                      Select all ready
                                    </button>
                                    <button type="button" onClick={() => clearBillingSelection(table.id)}>
                                      Clear
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-sm font-semibold text-slate-900">{fmtCurrency(rowAmount)}</td>
                            <td className="px-3 py-3">
                              {currentInvoices.length === 0 ? (
                                <span className="text-xs text-slate-500">Not generated</span>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {currentInvoices.map((invoice) => (
                                    <span key={invoice.id} className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(invoice.status)}`}>
                                      INV {shortInvoiceId(invoice.id)}{invoice.isGroupInvoice ? " Group" : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-2">
                                {currentInvoices.length > 0 ? (
                                  <>
                                    {currentInvoices.map((invoice) => (
                                      <button
                                        key={invoice.id}
                                        type="button"
                                        onClick={() => openInvoiceView(invoice.id)}
                                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                      >
                                        View INV {shortInvoiceId(invoice.id)}
                                      </button>
                                    ))}
                                  </>
                                ) : null}
                                {selectedOrders.length === 1 ? (
                                  <button
                                    type="button"
                                    disabled={isCreating}
                                    onClick={() => openDraftInvoice(table, selectedOrders)}
                                    className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                  >
                                    {isCreating ? "Creating..." : "Bill Selected"}
                                  </button>
                                ) : null}
                                {selectedOrders.length > 1 ? (
                                  <button
                                    type="button"
                                    disabled={isCreatingGroup}
                                    onClick={() => openDraftInvoice(table, selectedOrders)}
                                    className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                  >
                                    {isCreatingGroup ? "Creating..." : `Bill Selected ${selectedOrders.length}`}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Invoice History</h3>
                <p className="text-xs text-slate-500">Filter by today, yesterday, week, month, customer/table.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                {historyInvoices.length} result
              </span>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              {(["today", "yesterday", "week", "month", "all"] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setHistoryRange(range)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    historyRange === range
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {range === "all" ? "All" : range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
              <input
                value={customerFilter}
                onChange={(event) => setCustomerFilter(event.target.value)}
                placeholder="Search customer / table / invoice"
                className="h-9 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none ring-amber-200 focus:ring-2"
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              {historyInvoices.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                  No invoice created yet.
                </p>
              ) : (
                <>
                  <div className="space-y-2 p-2 md:hidden">
                    {historyInvoices.map((invoice) => {
                      const customerName = invoiceCustomerMap.get(invoice.id) || "-";
                      const active = activeInvoiceId === invoice.id;
                      return (
                        <article key={`history-mobile-${invoice.id}`} className={`rounded-xl border p-3 ${active ? "border-amber-300 bg-amber-50/70" : "border-slate-200 bg-white"}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">INV {shortInvoiceId(invoice.id)}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{fmtDateTime(invoice.createdAt)}</p>
                            </div>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(invoice.status)}`}>
                              {invoice.status}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">{invoice.table?.name || `Table ${invoice.table?.number ?? "-"}`}</p>
                          <p className="mt-1 text-xs text-slate-600">Customer: {customerName}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{fmtCurrency(invoiceAmount(invoice))}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openInvoiceView(invoice.id)}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                downloadInvoicePdf(invoice, {
                                  ...receiptProfile,
                                  customerName: invoiceCustomerMap.get(invoice.id) || "-",
                                })
                              }
                              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                            >
                              Download PDF
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Invoice</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Table</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Amount</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyInvoices.map((invoice) => {
                        const customerName = invoiceCustomerMap.get(invoice.id) || "-";
                        const active = activeInvoiceId === invoice.id;

                        return (
                          <tr key={invoice.id} className={`border-t border-slate-200 ${active ? "bg-amber-50/70" : "bg-white"}`}>
                            <td className="px-3 py-3 font-semibold text-slate-900">INV {shortInvoiceId(invoice.id)}</td>
                            <td className="px-3 py-3 text-xs text-slate-600">{fmtDateTime(invoice.createdAt)}</td>
                            <td className="px-3 py-3 text-slate-700">{invoice.table?.name || `Table ${invoice.table?.number ?? "-"}`}</td>
                            <td className="px-3 py-3 text-slate-700">{customerName}</td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(invoice.status)}`}>
                                {invoice.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-900">{fmtCurrency(invoiceAmount(invoice))}</td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openInvoiceView(invoice.id)}
                                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadInvoicePdf(invoice, {
                                      ...receiptProfile,
                                      customerName: invoiceCustomerMap.get(invoice.id) || "-",
                                    })
                                  }
                                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                                >
                                  Download PDF
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </article>
      </section>

      {draftBilling ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-0 sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0" onClick={() => setDraftBilling(null)} aria-label="Close invoice draft" />
          <div className="relative z-10 h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-[#e3d6bc] bg-[#f8f4ec] p-4 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-3xl sm:p-5">
            {(() => {
              const hasUnbillableItems = draftBilling.orders.some((order) =>
                order.items.some((item) => {
                  const status = normalizeStatus(item.status);
                  return status !== "SERVED" && status !== "CANCELLED";
                }),
              );

              return (
                <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invoice Preview</p>
                <h4 className="mt-1 text-lg font-semibold text-slate-900">
                  {draftBilling.orders.length > 1 ? `Group bill for ${draftBilling.table.name}` : `Bill for ${draftBilling.table.name}`}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setDraftBilling(null)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="rounded-[28px] border border-[#dfd2bb] bg-[linear-gradient(170deg,#fffef9_0%,#fff6e8_100%)] p-4">
              <div className="space-y-3">
                {draftBilling.orders.map((order) => (
                  <article key={order.id} className="rounded-2xl border border-[#eadfc9] bg-white/85 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {order.orderNumber ? `#${order.orderNumber}` : order.id.slice(-4)} {order.customerName ? `| ${order.customerName}` : ""}
                        </p>
                        <p className="text-xs text-slate-500">{order.items.length} item(s)</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{fmtCurrency(itemTotal(order))}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {order.items.some((item) => Boolean(item.lineId) && canCorrectItemStatus(item.status)) ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                          Item correction: `Exchange` = dusre order me bhejo, `Reduce/Remove` = qty ghatao ya hatao, `Cancel Item` = line cancel karo.
                        </div>
                      ) : null}
                      {order.items.map((item, index) => {
                        const lineKey = item.lineId ? `${order.id}:${item.lineId}` : `${order.id}:${item.itemId}:${index}`;
                        const selectedQty = correctionQty(item.quantity, draftCorrection.quantities[lineKey]);
                        const busy = draftCorrection.busyKey === `${order.id}:${item.lineId || ""}`;
                        const normalizedStatus = normalizeStatus(item.status);
                        const canCorrectItem = Boolean(item.lineId) && canCorrectItemStatus(item.status);
                        const moveTargets = draftMoveTargets.filter((candidate) => candidate.id !== order.id);
                        const tableTargets = tables.filter((table) => table.id !== draftBilling.table.id);
                        const billable = normalizedStatus === "SERVED" || normalizedStatus === "CANCELLED";

                        return (
                          <div key={`${order.id}-${item.itemId}-${item.variantId || "base"}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900">
                                  {item.quantity}x {item.name}
                                  {item.variantName ? ` (${item.variantName})` : ""}
                                </p>
                                <p className="mt-1 text-[11px] font-medium text-slate-500">
                                  Status: {normalizedStatus || "PLACED"}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${itemStatusPill(item.status)}`}>
                                    {normalizedStatus || "PLACED"}
                                  </span>
                                  <span className="text-xs text-slate-500">{fmtCurrency(item.lineTotal ?? item.unitPrice * item.quantity)}</span>
                                </div>
                                {!billable ? (
                                  <p className="mt-2 text-[11px] text-rose-700">
                                    Ye item abhi bill-ready nahi hai. Pehle correct karo ya service status fix karo.
                                  </p>
                                ) : null}
                              </div>
                              <span className="font-semibold text-slate-900">{fmtCurrency(item.lineTotal ?? item.unitPrice * item.quantity)}</span>
                            </div>

                            {canCorrectItem ? (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                {item.quantity && item.quantity > 1 ? (
                                  <select
                                    value={String(selectedQty)}
                                    disabled={busy}
                                    onChange={(event) => handleDraftCorrectionQuantityChange(lineKey, Number(event.target.value) || 1)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                                  >
                                    {Array.from({ length: item.quantity }, (_, idx) => idx + 1).map((qty) => (
                                      <option key={qty} value={qty}>
                                        Qty {qty}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                                {moveTargets.length > 0 ? (
                                  <select
                                    defaultValue=""
                                    disabled={busy}
                                    onChange={(event) => {
                                      const targetOrderId = event.target.value;
                                      if (!targetOrderId || !item.lineId) return;
                                      handleDraftMoveItem(order.id, item.lineId, item.name, { targetOrderId }, selectedQty, item.quantity);
                                      event.currentTarget.value = "";
                                    }}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                                  >
                                    <option value="">Exchange order</option>
                                    {moveTargets.map((candidate) => (
                                      <option key={candidate.id} value={candidate.id}>
                                        {candidate.orderNumber ? `#${candidate.orderNumber}` : candidate.id.slice(-4)}
                                        {candidate.customerName ? ` | ${candidate.customerName}` : ""}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                                {tableTargets.length > 0 ? (
                                  <select
                                    defaultValue=""
                                    disabled={busy}
                                    onChange={(event) => {
                                      const targetTableId = event.target.value;
                                      if (!targetTableId || !item.lineId) return;
                                      handleDraftMoveItem(order.id, item.lineId, item.name, { targetTableId }, selectedQty, item.quantity);
                                      event.currentTarget.value = "";
                                    }}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                                  >
                                    <option value="">Exchange table</option>
                                    {tableTargets.map((table) => (
                                      <option key={table.id} value={table.id}>
                                        T{table.number} {table.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={busy || !item.lineId}
                                  onClick={() =>
                                    item.lineId &&
                                    handleDraftRemoveItem(order.id, item.lineId, item.name, selectedQty, item.quantity)
                                  }
                                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                                >
                                  {busy ? "Working..." : item.quantity > 1 ? `Reduce ${selectedQty}` : "Remove Item"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || !item.lineId}
                                  onClick={() => item.lineId && handleDraftCancelItem(order.id, item.lineId, item.name)}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                                >
                                  Cancel Item
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-[#eadfc9] bg-white/90 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Discount Type</span>
                    <select
                      value={draftBilling.discount.type}
                      disabled={!isPrivilegedBilling}
                      onChange={(event) =>
                        setDraftBilling((current) =>
                          current
                            ? { ...current, discount: { ...current.discount, type: event.target.value as DiscountInput["type"] } }
                            : current,
                        )
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:opacity-50"
                    >
                      <option value="PERCENTAGE">Percentage</option>
                      <option value="FLAT">Flat</option>
                    </select>
                  </label>
                  <label className="text-sm text-slate-700">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Discount Value</span>
                    <input
                      type="number"
                      min="0"
                      value={draftBilling.discount.value}
                      disabled={!isPrivilegedBilling}
                      onChange={(event) =>
                        setDraftBilling((current) =>
                          current
                            ? {
                                ...current,
                                discount: { ...current.discount, value: Math.max(0, Number(event.target.value) || 0) },
                              }
                            : current,
                        )
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:opacity-50"
                    />
                  </label>
                </div>
                {!isPrivilegedBilling ? (
                  <p className="mt-2 text-xs text-slate-500">Discount sirf manager ya owner set kar sakta hai.</p>
                ) : null}
                {(() => {
                  const total = draftItemsTotal(draftBilling.orders);
                  const discountAmount = draftDiscountAmount(total, draftBilling.discount);
                  const finalTotal = Math.max(total - discountAmount, 0);
                  return (
                    <div className="mt-4 space-y-1 text-sm">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Items total</span>
                        <span>{fmtCurrency(total)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Discount</span>
                        <span>{fmtCurrency(discountAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-dashed border-[#d8ccb6] pt-2 text-base font-semibold text-slate-900">
                        <span>Estimated total</span>
                        <span>{fmtCurrency(finalTotal)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {hasUnbillableItems ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Kuch items abhi `SERVED/CANCELLED` nahi hain. Pehle unko correct ya complete karo, fir invoice banao.
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraftBilling(null)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Back
              </button>
              <button
                type="button"
                disabled={hasUnbillableItems || (draftBilling.orders.length === 1 ? isCreating : isCreatingGroup)}
                onClick={() => {
                  if (draftBilling.orders.length === 1) {
                    handleCreateInvoice(draftBilling.orders[0], isPrivilegedBilling ? draftBilling.discount : undefined);
                    return;
                  }
                  handleCreateGroupInvoice(
                    draftBilling.table,
                    draftBilling.orders,
                    isPrivilegedBilling ? draftBilling.discount : undefined,
                  );
                }}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {draftBilling.orders.length === 1
                  ? isCreating
                    ? "Creating..."
                    : "Create Invoice"
                  : isCreatingGroup
                    ? "Creating..."
                    : "Create Group Invoice"}
              </button>
            </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {invoiceEditor && editingInvoice ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setInvoiceEditor(null)}
            aria-label="Close invoice editor"
          />
          <div className="relative z-10 h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-[#e3d6bc] bg-[#fcf7ef] p-4 shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-3xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invoice Update</p>
                <h4 className="mt-1 text-lg font-semibold text-slate-900">INV {shortInvoiceId(editingInvoice.id)}</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {editingInvoice.table?.name || `Table ${editingInvoice.table?.number ?? "-"}`} | {invoiceCustomerMap.get(editingInvoice.id) || "-"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceEditor(null)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-[28px] border border-[#dfd2bb] bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Discount Type</span>
                  <select
                    value={invoiceEditor.discount.type}
                    onChange={(event) =>
                      setInvoiceEditor((current) =>
                        current
                          ? {
                              ...current,
                              discount: { ...current.discount, type: event.target.value as DiscountInput["type"] },
                            }
                          : current,
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FLAT">Flat</option>
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Discount Value</span>
                  <input
                    type="number"
                    min="0"
                    value={invoiceEditor.discount.value}
                    onChange={(event) =>
                      setInvoiceEditor((current) =>
                        current
                          ? {
                              ...current,
                              discount: { ...current.discount, value: Math.max(0, Number(event.target.value) || 0) },
                            }
                          : current,
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  />
                </label>
              </div>

              <label className="mt-3 block text-sm text-slate-700">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Invoice Note</span>
                <textarea
                  value={invoiceEditor.note}
                  onChange={(event) =>
                    setInvoiceEditor((current) => (current ? { ...current, note: event.target.value } : current))
                  }
                  rows={3}
                  placeholder="Optional note for invoice or billing adjustment"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-amber-200 focus:ring-2"
                />
              </label>

              {(() => {
                const baseTotal = editingInvoice.subTotal ?? editingInvoice.grandTotal ?? invoiceAmount(editingInvoice);
                const discountAmount = draftDiscountAmount(baseTotal, invoiceEditor.discount);
                const estimatedTotal = Math.max(baseTotal - discountAmount, 0);
                return (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Current total</span>
                      <span>{fmtCurrency(editingInvoice.grandTotal ?? invoiceAmount(editingInvoice))}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-slate-600">
                      <span>Edited discount</span>
                      <span>{fmtCurrency(discountAmount)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-dashed border-slate-300 pt-2 font-semibold text-slate-900">
                      <span>Estimated total after save</span>
                      <span>{fmtCurrency(estimatedTotal)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <button
                type="button"
                disabled={isDeletingInvoice}
                onClick={() => handleDeleteInvoice(editingInvoice)}
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50"
              >
                {isDeletingInvoice ? "Deleting..." : "Delete Invoice"}
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setInvoiceEditor(null)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUpdatingInvoice}
                  onClick={handleSaveInvoiceEditor}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isUpdatingInvoice ? "Saving..." : "Save Invoice"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isInvoiceViewOpen && selectedInvoice ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-0 sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0" onClick={() => setIsInvoiceViewOpen(false)} aria-label="Close invoice view" />
          <div className="relative z-10 h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-[#e3d6bc] bg-[#f8f4ec] p-4 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-3xl sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invoice Detail</p>
                <h4 className="mt-1 text-lg font-semibold text-slate-900">INV {shortInvoiceId(selectedInvoice.id)}</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsInvoiceViewOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Close
              </button>
            </div>

            {normalizeStatus(selectedInvoice.status) === "ISSUED" && selectedInvoiceOrders.length > 0 ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-900">
                  Unpaid invoice hai. Related order items ko correction preview me khol kar `Exchange`, `Reduce/Remove`, `Cancel Item` use kar sakte ho.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    openDraftInvoice(
                      tablesById.get(selectedInvoice.table?.id || "") || {
                        id: selectedInvoice.table?.id || "",
                        number: selectedInvoice.table?.number ?? 0,
                        name: selectedInvoice.table?.name || "Table",
                        status: "OCCUPIED",
                        capacity: 0,
                        isActive: true,
                      },
                      selectedInvoiceOrders,
                    )
                  }
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  Open Correction Preview
                </button>
              </div>
            ) : null}

            <InvoicePreview
              invoice={selectedInvoice}
              profile={receiptProfile}
              customerName={invoiceCustomerMap.get(selectedInvoice.id) || "-"}
              isPaying={isPaying}
              isPrivilegedBilling={isPrivilegedBilling}
              isUpdating={isUpdatingInvoice}
              isDeleting={isDeletingInvoice}
              onPay={handlePayInvoice}
              onEditInvoice={handleApplyInvoiceDiscount}
              onDelete={handleDeleteInvoice}
              onShare={handleShareInvoice}
              onDownloadPdf={(invoice) =>
                downloadInvoicePdf(invoice, {
                  ...receiptProfile,
                  customerName: invoiceCustomerMap.get(invoice.id) || "-",
                })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
