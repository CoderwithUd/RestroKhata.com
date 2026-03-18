"use client";

import { useMemo, useState } from "react";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { getErrorMessage } from "@/lib/error";
import { showError, showInfo, showSuccess } from "@/lib/feedback";
import { useOrderSocket, type SocketOrderRole } from "@/lib/use-order-socket";
import {
  useCreateInvoiceMutation,
  useGetInvoicesQuery,
  usePayInvoiceMutation,
} from "@/store/api/invoicesApi";
import { useTentantProfileQuery } from "@/store/api/authApi";
import { useGetOrdersQuery } from "@/store/api/ordersApi";
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

function sortByLatest<T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const a = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const b = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return b - a;
  });
}

function canGenerateInvoice(order?: OrderRecord): boolean {
  const status = normalizeStatus(order?.status);
  return status === "READY" || status === "SERVED";
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
  onPay,
  onDownloadPdf,
  onShare,
}: {
  invoice: InvoiceRecord | null;
  profile: ReceiptProfile;
  customerName: string;
  isPaying: boolean;
  onPay: (invoice: InvoiceRecord, method: "CASH" | "UPI") => void;
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

  const due = invoiceAmount(invoice);
  const isIssued = normalizeStatus(invoice.status) === "ISSUED";

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
        <button
          type="button"
          disabled={!isIssued || isPaying || due <= 0}
          onClick={() => onPay(invoice, "CASH")}
          className="rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPaying ? "Processing..." : "Cash Paid"}
        </button>
        <button
          type="button"
          disabled={!isIssued || isPaying || due <= 0}
          onClick={() => onPay(invoice, "UPI")}
          className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-700 disabled:opacity-50"
        >
          {isPaying ? "Processing..." : "UPI Paid"}
        </button>
      </div>
    </article>
  );
}

export function InvoicesWorkspace({ rawRole }: Props) {
  const token = useAppSelector(selectAuthToken);
  const role = normalizeRole(rawRole);
  const [tableFilter, setTableFilter] = useState("");
  const [historyRange, setHistoryRange] = useState<HistoryRange>("today");
  const [customerFilter, setCustomerFilter] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isInvoiceViewOpen, setIsInvoiceViewOpen] = useState(false);
  const [invoiceOverrides, setInvoiceOverrides] = useState<Record<string, InvoiceRecord>>({});
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
  const [payInvoice, { isLoading: isPaying }] = usePayInvoiceMutation();

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
      if (invoice.orderId && !map.has(invoice.orderId)) {
        map.set(invoice.orderId, invoice);
      }
    });
    return map;
  }, [invoices]);

  const issuedInvoiceByTableId = useMemo(() => {
    const map = new Map<string, InvoiceRecord>();
    invoices.forEach((invoice) => {
      const tableId = invoice.table?.id;
      if (!tableId) return;
      if (normalizeStatus(invoice.status) !== "ISSUED") return;
      if (!map.has(tableId)) map.set(tableId, invoice);
    });
    return map;
  }, [invoices]);

  const latestOpenOrderByTable = useMemo(() => {
    const map = new Map<string, OrderRecord>();
    orders.forEach((order) => {
      const tableId = order.table?.id || order.tableId;
      if (!tableId || invoiceByOrderId.has(order.id)) return;
      const status = normalizeStatus(order.status);
      if (!["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(status)) return;
      if (!map.has(tableId)) {
        map.set(tableId, order);
      }
    });
    return map;
  }, [invoiceByOrderId, orders]);

  const filterQuery = tableFilter.trim().toLowerCase();

  const billingRows = useMemo(() => {
    return tables
      .filter((table) => {
        const tableId = table.id;
        const isOccupied = normalizeStatus(table.status) === "OCCUPIED";
        const hasOpenOrder = latestOpenOrderByTable.has(tableId);
        const hasIssuedInvoice = issuedInvoiceByTableId.has(tableId);
        if (!isOccupied) return false;
        if (!hasOpenOrder && !hasIssuedInvoice) return false;
        if (!filterQuery) return true;
        return tableSearch(table).includes(filterQuery);
      })
      .map((table) => {
        const order = latestOpenOrderByTable.get(table.id);
        const currentInvoice = issuedInvoiceByTableId.get(table.id) || null;
        return { table, order, currentInvoice };
      });
  }, [filterQuery, issuedInvoiceByTableId, latestOpenOrderByTable, tables]);

  const pendingBillingRows = useMemo(
    () => billingRows.filter((row) => row.order && canGenerateInvoice(row.order) && !invoiceByOrderId.has(row.order.id)),
    [billingRows, invoiceByOrderId],
  );
  const occupiedTablesCount = useMemo(
    () => tables.filter((table) => normalizeStatus(table.status) === "OCCUPIED").length,
    [tables],
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
      : (invoiceSelectionPool[0]?.id ?? null);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === activeInvoiceId) || null,
    [activeInvoiceId, invoices],
  );

  function openInvoiceView(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    setIsInvoiceViewOpen(true);
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
      refetchTables();
      refetchOrders();
      refetchInvoices();
    } catch (error) {
      showError(getErrorMessage(error));
    }
  }

  async function handlePayInvoice(invoice: InvoiceRecord, method: "CASH" | "UPI") {
    const amount = invoiceAmount(invoice);
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
                    {billingRows.map(({ table, order, currentInvoice }) => {
                      const isReadyForInvoice = canGenerateInvoice(order);
                      const rowAmount = currentInvoice ? invoiceAmount(currentInvoice) : order ? itemTotal(order) : 0;
                      const orderStatus = normalizeStatus(order?.status);
                      const orderHint = !order
                        ? "No open order"
                        : isReadyForInvoice
                          ? "Ready to bill"
                          : `Waiting for READY/SERVED (${orderStatus || "PLACED"})`;

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
                          <div className="mt-2 flex flex-wrap gap-2">
                            {order ? (
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(order.status)}`}>
                                {order.status}
                              </span>
                            ) : null}
                            {currentInvoice ? (
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(currentInvoice.status)}`}>
                                INV {shortInvoiceId(currentInvoice.id)}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                                Not generated
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {currentInvoice ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openInvoiceView(currentInvoice.id)}
                                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadInvoicePdf(currentInvoice, {
                                      ...receiptProfile,
                                      customerName: invoiceCustomerMap.get(currentInvoice.id) || "-",
                                    })
                                  }
                                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                                >
                                  Download PDF
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={!isReadyForInvoice || !order || isCreating}
                                onClick={() => order && handleCreateInvoice(order)}
                                className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {!order ? "No Order" : !isReadyForInvoice ? "Wait READY" : isCreating ? "Creating..." : "Create Invoice"}
                              </button>
                            )}
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
                      {billingRows.map(({ table, order, currentInvoice }) => {
                        const isReadyForInvoice = canGenerateInvoice(order);
                        const rowAmount = currentInvoice ? invoiceAmount(currentInvoice) : order ? itemTotal(order) : 0;
                        const orderStatus = normalizeStatus(order?.status);
                        const orderHint = !order
                          ? "No open order"
                          : isReadyForInvoice
                            ? "Ready to bill"
                            : `Waiting for READY/SERVED (${orderStatus || "PLACED"})`;

                        return (
                          <tr key={table.id} className="border-t border-[#eee4d1]">
                            <td className="px-3 py-3">
                              <p className="font-semibold text-slate-900">{table.name}</p>
                              <p className="mt-1 text-xs text-slate-500">T{table.number}</p>
                            </td>
                            <td className="px-3 py-3">
                              {order ? (
                                <>
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(order.status)}`}>
                                    {order.status}
                                  </span>
                                  <p className="mt-1 text-xs text-slate-500">{order.items.length} item(s) | {timeAgo(order.updatedAt || order.createdAt)}</p>
                                  <p className="mt-1 text-[11px] font-medium text-slate-700">{orderHint}</p>
                                </>
                              ) : (
                                <span className="text-xs text-slate-500">No open order</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-sm font-semibold text-slate-900">{fmtCurrency(rowAmount)}</td>
                            <td className="px-3 py-3">
                              {currentInvoice ? (
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(currentInvoice.status)}`}>
                                  INV {shortInvoiceId(currentInvoice.id)}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-500">Not generated</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-2">
                                {currentInvoice ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openInvoiceView(currentInvoice.id)}
                                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                    >
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        downloadInvoicePdf(currentInvoice, {
                                          ...receiptProfile,
                                          customerName: invoiceCustomerMap.get(currentInvoice.id) || "-",
                                        })
                                      }
                                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                                    >
                                      Download PDF
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!isReadyForInvoice || !order || isCreating}
                                    onClick={() => order && handleCreateInvoice(order)}
                                    className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                  >
                                    {!order ? "No Order" : !isReadyForInvoice ? "Wait READY" : isCreating ? "Creating..." : "Create Invoice"}
                                  </button>
                                )}
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

            <InvoicePreview
              invoice={selectedInvoice}
              profile={receiptProfile}
              customerName={invoiceCustomerMap.get(selectedInvoice.id) || "-"}
              isPaying={isPaying}
              onPay={handlePayInvoice}
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
