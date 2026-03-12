"use client";

import { useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { useOrderSocket, type SocketOrderRole } from "@/lib/use-order-socket";
import {
  useCreateInvoiceMutation,
  useGetInvoicesQuery,
  usePayInvoiceMutation,
} from "@/store/api/invoicesApi";
import { useGetOrdersQuery } from "@/store/api/ordersApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthToken } from "@/store/slices/authSlice";
import type { OrderRecord } from "@/store/types/orders";

type Props = {
  rawRole?: string;
};

type ToastType = "ok" | "err" | "info";

function normalizeRole(raw?: string): SocketOrderRole {
  const role = (raw || "").toLowerCase().trim();
  if (role.includes("owner") || role.includes("admin")) return "owner";
  if (role.includes("waiter") || role.includes("server") || role.includes("captain")) return "waiter";
  if (role.includes("kitchen") || role.includes("chef") || role.includes("cook")) return "kitchen";
  if (role.includes("manager")) return "manager";
  return "all";
}

function fmtCurrency(value?: number): string {
  if (value == null) return "-";
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff} min ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
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

function orderTotal(order: OrderRecord): number {
  return order.grandTotal ?? order.subTotal ?? 0;
}

export function InvoicesWorkspace({ rawRole }: Props) {
  const token = useAppSelector(selectAuthToken);
  const role = normalizeRole(rawRole);
  const [tableFilter, setTableFilter] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useGetOrdersQuery(
    { status: ["READY", "SERVED"], limit: 200 },
    { pollingInterval: 30000 },
  );
  const {
    data: invoicesData,
    isFetching: isInvoicesFetching,
    refetch: refetchInvoices,
  } = useGetInvoicesQuery(
    { status: ["ISSUED", "PAID"], limit: 200 },
    { pollingInterval: 30000 },
  );
  const [createInvoice, { isLoading: isCreating }] = useCreateInvoiceMutation();
  const [payInvoice, { isLoading: isPaying }] = usePayInvoiceMutation();

  useOrderSocket({
    token,
    enabled: true,
    role,
    onConnectionChange: setSocketConnected,
    onEvent: (event) => {
      if (event.type === "updated" && (event.order?.status || "").toUpperCase() === "READY") {
        const table = event.order?.table;
        const label = table?.name || (table?.number ? `Table ${table.number}` : "Table");
        setToast({ msg: `${label} order ready for billing`, type: "info" });
      }
      refetchOrders();
      refetchInvoices();
    },
  });

  const invoices = useMemo(() => invoicesData?.items || [], [invoicesData]);
  const orders = useMemo(() => ordersData?.items || [], [ordersData]);

  const invoiceByOrderId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const invoice of invoices) {
      if (invoice.orderId) map[invoice.orderId] = invoice.id;
    }
    return map;
  }, [invoices]);

  const pendingOrders = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    return orders.filter((order) => {
      if (invoiceByOrderId[order.id]) return false;
      const label = `${order.table?.name || ""} ${order.table?.number || ""}`.toLowerCase();
      if (!q) return true;
      return label.includes(q);
    });
  }, [invoiceByOrderId, orders, tableFilter]);

  const issuedInvoices = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if ((invoice.status || "").toUpperCase() !== "ISSUED") return false;
      const label = `${invoice.table?.name || ""} ${invoice.table?.number || ""}`.toLowerCase();
      if (!q) return true;
      return label.includes(q);
    });
  }, [invoices, tableFilter]);

  const paidCount = useMemo(
    () => invoices.filter((invoice) => (invoice.status || "").toUpperCase() === "PAID").length,
    [invoices],
  );

  async function handleCreateInvoice(orderId: string, discount?: { type: "PERCENTAGE" | "FLAT"; value: number }) {
    try {
      const payload = {
        orderId,
        ...(discount ? { discountType: discount.type, discountValue: discount.value } : {}),
      };
      const response = await createInvoice(payload).unwrap();
      setToast({ msg: response.message || "Invoice created", type: "ok" });
      refetchInvoices();
    } catch (error) {
      setToast({ msg: getErrorMessage(error), type: "err" });
    }
  }

  async function handlePayInvoice(invoiceId: string, amount: number, method: "CASH" | "UPI") {
    if (!(amount > 0)) return;

    try {
      const response = await payInvoice({
        invoiceId,
        payload: { method, paidAmount: amount },
      }).unwrap();
      setToast({ msg: response.message || "Payment done", type: "ok" });
      refetchInvoices();
      refetchOrders();
    } catch (error) {
      setToast({ msg: getErrorMessage(error), type: "err" });
    }
  }

  return (
    <div className="h-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            value={tableFilter}
            onChange={(event) => setTableFilter(event.target.value)}
            placeholder="Filter table (name/number)"
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none ring-amber-200 focus:ring-2"
          />
          <LiveBadge connected={socketConnected} />
        </div>
        <button
          type="button"
          onClick={() => {
            refetchOrders();
            refetchInvoices();
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        >
          {isOrdersFetching || isInvoicesFetching ? <Spinner /> : "Refresh"}
        </button>
      </div>

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800">Pending Invoice</p>
          <p className="mt-1 text-xl font-bold text-amber-900">{pendingOrders.length}</p>
        </article>
        <article className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-800">Issued</p>
          <p className="mt-1 text-xl font-bold text-blue-900">{issuedInvoices.length}</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-800">Paid</p>
          <p className="mt-1 text-xl font-bold text-emerald-900">{paidCount}</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Create Invoice</h3>
            <span className="text-xs text-slate-500">{pendingOrders.length} orders</span>
          </div>
          <div className="space-y-2">
            {pendingOrders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-xs text-slate-500">
                No ready/served order pending for invoice
              </p>
            ) : (
              pendingOrders.map((order) => (
                <div key={order.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        T{order.table?.number} - {order.table?.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {order.items.length} item(s) - {fmtCurrency(orderTotal(order))} - {timeAgo(order.updatedAt || order.createdAt)}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {(order.status || "").toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={isCreating}
                      onClick={() => handleCreateInvoice(order.id)}
                      className="rounded-lg bg-amber-500 px-2 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      Issue
                    </button>
                    <button
                      type="button"
                      disabled={isCreating}
                      onClick={() => handleCreateInvoice(order.id, { type: "PERCENTAGE", value: 10 })}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-[11px] font-bold text-blue-700 disabled:opacity-60"
                    >
                      Issue 10%
                    </button>
                    <button
                      type="button"
                      disabled={isCreating}
                      onClick={() => handleCreateInvoice(order.id, { type: "FLAT", value: 50 })}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] font-bold text-emerald-700 disabled:opacity-60"
                    >
                      Issue Rs 50
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Take Payment</h3>
            <span className="text-xs text-slate-500">{issuedInvoices.length} invoices</span>
          </div>
          <div className="space-y-2">
            {issuedInvoices.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-xs text-slate-500">
                No issued invoices waiting for payment
              </p>
            ) : (
              issuedInvoices.map((invoice) => {
                const amount = invoice.totalDue ?? invoice.balanceDue ?? invoice.grandTotal ?? 0;
                return (
                  <div key={invoice.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          T{invoice.table?.number} - {invoice.table?.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Due: {fmtCurrency(amount)} - Created {timeAgo(invoice.createdAt)}
                        </p>
                      </div>
                      <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {invoice.status}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isPaying || amount <= 0}
                        onClick={() => handlePayInvoice(invoice.id, amount, "CASH")}
                        className="rounded-lg bg-emerald-500 px-2 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        Cash Paid
                      </button>
                      <button
                        type="button"
                        disabled={isPaying || amount <= 0}
                        onClick={() => handlePayInvoice(invoice.id, amount, "UPI")}
                        className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-2 text-[11px] font-bold text-violet-700 disabled:opacity-60"
                      >
                        UPI Paid
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </section>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
