"use client";

import { useMemo, useState } from "react";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { getErrorMessage } from "@/lib/error";
import { useOrderSocket, type SocketOrderRole } from "@/lib/use-order-socket";
import {
  useCreateInvoiceMutation,
  useGetInvoicesQuery,
  usePayInvoiceMutation,
} from "@/store/api/invoicesApi";
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

type ToastType = "ok" | "err" | "info";
type DiscountInput = { type: "PERCENTAGE" | "FLAT"; value: number };

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
  return order.grandTotal ?? order.subTotal ?? 0;
}

function invoiceAmount(invoice: InvoiceRecord): number {
  return invoice.balanceDue ?? invoice.totalDue ?? invoice.grandTotal ?? invoice.subTotal ?? 0;
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

function Toast({
  msg,
  type,
  onClose,
}: {
  msg: string;
  type: ToastType;
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed bottom-20 left-1/2 z-50 w-full max-w-xs -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur sm:bottom-6 ${
        type === "ok"
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : type === "info"
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-rose-300 bg-rose-50 text-rose-800"
      }`}
      role="status"
      aria-live="polite"
      onClick={onClose}
    >
      {msg}
    </div>
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
  isPaying,
  onPay,
  onDownloadPdf,
}: {
  invoice: InvoiceRecord | null;
  isPaying: boolean;
  onPay: (invoice: InvoiceRecord, method: "CASH" | "UPI") => void;
  onDownloadPdf: (invoice: InvoiceRecord) => void;
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
    <article className="rounded-[28px] border border-[#e3d6bc] bg-[linear-gradient(170deg,#fffef9_0%,#fff7e7_100%)] p-4 shadow-[0_24px_50px_-36px_rgba(53,38,18,0.5)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-white">
              INV {shortInvoiceId(invoice.id)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(invoice.status)}`}>
              {invoice.status}
            </span>
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-slate-900">
            {invoice.table?.name || `Table ${invoice.table?.number ?? "-"}`}
          </h3>
          <p className="mt-1 text-xs text-slate-500">Created {fmtDateTime(invoice.createdAt)}</p>
        </div>
        <div className="grid gap-2 text-right">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Amount Due</p>
          <p className="text-3xl font-semibold text-slate-900">{fmtCurrency(due)}</p>
          <p className="text-xs text-slate-500">Order {invoice.orderId.slice(-8).toUpperCase()}</p>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/80 bg-white/90 p-4">
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Subtotal</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{fmtCurrency(invoice.subTotal)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Tax</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{fmtCurrency(invoice.taxTotal)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Discount</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {invoice.discount ? fmtCurrency(invoice.discount.amount) : "Rs 0"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {invoice.items.map((item, index) => {
            const total = item.lineTotal ?? item.unitPrice * item.quantity;
            return (
              <div
                key={`${invoice.id}-${item.itemId}-${item.variantId || "base"}-${index}`}
                className="grid gap-2 rounded-2xl border border-[#efe7d8] bg-[#fffdfa] px-3 py-3 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.name}
                    {item.variantName ? ` (${item.variantName})` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.quantity} x {fmtCurrency(item.unitPrice)}
                    {item.note ? ` | ${item.note}` : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-900 sm:text-right">{fmtCurrency(total)}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-2 border-t border-dashed border-[#dfd2bb] pt-4 text-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span>Grand Total</span>
            <span className="font-semibold text-slate-900">{fmtCurrency(invoice.grandTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Balance</span>
            <span className="font-semibold text-slate-900">{fmtCurrency(invoice.balanceDue ?? due)}</span>
          </div>
          {invoice.payment ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Paid via {invoice.payment.method} for {fmtCurrency(invoice.payment.paidAmount)} on {fmtDateTime(invoice.payment.paidAt)}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onDownloadPdf(invoice)}
          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
        >
          Download PDF
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
  const [socketConnected, setSocketConnected] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

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
    { status: ["PLACED", "IN_PROGRESS", "READY", "SERVED"], limit: 300 },
    { pollingInterval: 30000 },
  );
  const {
    data: invoicesData,
    isFetching: isInvoicesFetching,
    refetch: refetchInvoices,
  } = useGetInvoicesQuery({ limit: 300 }, { pollingInterval: 30000 });

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
        setToast({ msg: `${label} is ready for invoice / serve`, type: "info" });
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
  const invoices = useMemo(() => sortByLatest(invoicesData?.items || []), [invoicesData]);

  const invoiceByOrderId = useMemo(() => {
    const map = new Map<string, InvoiceRecord>();
    invoices.forEach((invoice) => {
      if (invoice.orderId && !map.has(invoice.orderId)) {
        map.set(invoice.orderId, invoice);
      }
    });
    return map;
  }, [invoices]);

  const invoicesByTableId = useMemo(() => {
    const map = new Map<string, InvoiceRecord[]>();
    invoices.forEach((invoice) => {
      const tableId = invoice.table?.id;
      if (!tableId) return;
      const current = map.get(tableId) || [];
      current.push(invoice);
      map.set(tableId, current);
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
        const hasOrder = latestOpenOrderByTable.has(tableId);
        const hasHistory = (invoicesByTableId.get(tableId) || []).length > 0;
        const isOccupied = normalizeStatus(table.status) === "OCCUPIED";
        if (!isOccupied && !hasOrder && !hasHistory) return false;
        if (!filterQuery) return true;
        return tableSearch(table).includes(filterQuery);
      })
      .map((table) => {
        const order = latestOpenOrderByTable.get(table.id);
        const history = invoicesByTableId.get(table.id) || [];
        const currentInvoice = history.find((invoice) => normalizeStatus(invoice.status) === "ISSUED") || history[0] || null;
        return { table, order, history, currentInvoice };
      });
  }, [filterQuery, invoicesByTableId, latestOpenOrderByTable, tables]);

  const pendingBillingRows = useMemo(
    () => billingRows.filter((row) => row.order && canGenerateInvoice(row.order) && !invoiceByOrderId.has(row.order.id)),
    [billingRows, invoiceByOrderId],
  );

  const issuedInvoices = useMemo(
    () => invoices.filter((invoice) => normalizeStatus(invoice.status) === "ISSUED"),
    [invoices],
  );

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => normalizeStatus(invoice.status) === "PAID"),
    [invoices],
  );

  const activeInvoiceId =
    selectedInvoiceId && invoices.some((invoice) => invoice.id === selectedInvoiceId)
      ? selectedInvoiceId
      : (invoices[0]?.id ?? null);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === activeInvoiceId) || null,
    [activeInvoiceId, invoices],
  );

  async function handleCreateInvoice(order: OrderRecord, discount?: DiscountInput) {
    try {
      const response = await createInvoice({
        orderId: order.id,
        ...(discount ? { discountType: discount.type, discountValue: discount.value } : {}),
      }).unwrap();

      if (response.invoice?.id) {
        setSelectedInvoiceId(response.invoice.id);
      }

      setToast({
        msg: response.message || `Invoice created for ${order.table?.name || `Table ${order.table?.number}`}`,
        type: "ok",
      });
      refetchTables();
      refetchOrders();
      refetchInvoices();
    } catch (error) {
      setToast({ msg: getErrorMessage(error), type: "err" });
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

      setToast({ msg: response.message || "Payment done", type: "ok" });
      setSelectedInvoiceId(invoice.id);
      refetchTables();
      refetchOrders();
      refetchInvoices();
    } catch (error) {
      setToast({ msg: getErrorMessage(error), type: "err" });
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
          <p className="mt-2 text-3xl font-semibold text-amber-950">{billingRows.length}</p>
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

      <section className="grid gap-4 xl:grid-cols-[1.15fr_1.2fr]">
        <div className="space-y-4">
          <article className="rounded-[28px] border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff6e8_100%)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Occupied Table Billing</h3>
                <p className="text-xs text-slate-500">Occupied table = pending session visible here, plus old invoices.</p>
              </div>
              <span className="rounded-full border border-white/80 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                {billingRows.length} tables
              </span>
            </div>

            <div className="space-y-3">
              {billingRows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[#d8ccb6] bg-white/70 py-10 text-center text-sm text-slate-500">
                  No occupied table or invoice history found.
                </p>
              ) : (
                billingRows.map(({ table, order, history, currentInvoice }) => {
                  const isReadyForInvoice = canGenerateInvoice(order);
                  const hasIssuedInvoice = normalizeStatus(currentInvoice?.status) === "ISSUED";

                  return (
                    <div key={table.id} className="rounded-[24px] border border-[#e3d6bc] bg-white/90 p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">
                              T{table.number}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(table.status)}`}>
                              {normalizeStatus(table.status) || "AVAILABLE"}
                            </span>
                            {order ? (
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(order.status)}`}>
                                Order {order.status}
                              </span>
                            ) : null}
                          </div>
                          <h4 className="mt-3 text-base font-semibold text-slate-900">{table.name}</h4>
                          <p className="mt-1 text-xs text-slate-500">
                            {order
                              ? `${order.items.length} item(s) | ${fmtCurrency(itemTotal(order))} | ${timeAgo(order.updatedAt || order.createdAt)}`
                              : hasIssuedInvoice
                                ? "Invoice already created for this table"
                                : "Occupied table detected without open order"}
                          </p>
                        </div>

                        {currentInvoice ? (
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceId(currentInvoice.id)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            View INV {shortInvoiceId(currentInvoice.id)}
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-600">
                        {hasIssuedInvoice
                          ? `Invoice issued and waiting for payment: ${fmtCurrency(invoiceAmount(currentInvoice as InvoiceRecord))}`
                          : isReadyForInvoice && order
                            ? "Pending invoice: table is occupied and ready to bill."
                            : order
                              ? "Kitchen / waiter workflow still running. Invoice will stay pending here."
                              : "Check table session on order screen; no eligible order found yet."}
                      </div>

                      {order && !hasIssuedInvoice ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            disabled={!isReadyForInvoice || isCreating}
                            onClick={() => handleCreateInvoice(order)}
                            className="rounded-2xl bg-amber-500 px-3 py-3 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {isCreating ? "Generating..." : "Generate Invoice"}
                          </button>
                          <button
                            type="button"
                            disabled={!isReadyForInvoice || isCreating}
                            onClick={() => handleCreateInvoice(order, { type: "PERCENTAGE", value: 10 })}
                            className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs font-semibold text-blue-700 disabled:opacity-50"
                          >
                            Generate 10% Off
                          </button>
                          <button
                            type="button"
                            disabled={!isReadyForInvoice || isCreating}
                            onClick={() => handleCreateInvoice(order, { type: "FLAT", value: 50 })}
                            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                          >
                            Generate Rs 50 Off
                          </button>
                        </div>
                      ) : null}

                      {history.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {history.slice(0, 4).map((invoice) => (
                            <button
                              key={invoice.id}
                              type="button"
                              onClick={() => setSelectedInvoiceId(invoice.id)}
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusPill(invoice.status)}`}
                            >
                              INV {shortInvoiceId(invoice.id)} {invoice.status}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-[28px] border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Invoice History</h3>
                <p className="text-xs text-slate-500">Old generated invoices stay visible here.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                {invoices.length} total
              </span>
            </div>

            <div className="space-y-2">
              {invoices.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                  No invoice created yet.
                </p>
              ) : (
                invoices
                  .filter((invoice) => !filterQuery || tableSearch(invoice.table).includes(filterQuery))
                  .map((invoice) => (
                    <button
                      key={invoice.id}
                      type="button"
                      onClick={() => setSelectedInvoiceId(invoice.id)}
                      className={`grid w-full gap-2 rounded-2xl border px-4 py-3 text-left transition ${
                        activeInvoiceId === invoice.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-900"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {invoice.table?.name || `Table ${invoice.table?.number ?? "-"}`}
                          </p>
                          <p className={`text-xs ${activeInvoiceId === invoice.id ? "text-slate-300" : "text-slate-500"}`}>
                            INV {shortInvoiceId(invoice.id)} | {fmtDateTime(invoice.createdAt)}
                          </p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                          activeInvoiceId === invoice.id ? "border-white/20 bg-white/10 text-white" : statusPill(invoice.status)
                        }`}>
                          {invoice.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={activeInvoiceId === invoice.id ? "text-slate-300" : "text-slate-500"}>
                          {invoice.items.length} item(s)
                        </span>
                        <span className="font-semibold">{fmtCurrency(invoiceAmount(invoice))}</span>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </article>
        </div>

        <div className="space-y-4">
          <InvoicePreview
            invoice={selectedInvoice}
            isPaying={isPaying}
            onPay={handlePayInvoice}
            onDownloadPdf={downloadInvoicePdf}
          />
        </div>
      </section>

      {toast ? <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
