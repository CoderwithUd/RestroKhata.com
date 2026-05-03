"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import { useGetInvoiceByIdQuery, useUpdateInvoiceMutation } from "@/store/api/invoicesApi";
import { useGetOrdersQuery, useRemoveOrderItemMutation, useCancelOrderItemMutation } from "@/store/api/ordersApi";
import type { InvoiceRecord } from "@/store/types/invoices";
import {
  ArrowLeft,
  User,
  Phone,
  Tag,
  Trash2,
  XCircle,
  ChevronRight,
  ClipboardList,
  MinusCircle,
  PlusCircle,
  Clock,
  ChevronLeft
} from "lucide-react";

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
  );
}

export function InvoiceEditView({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { data: invoice, isFetching, refetch: refetchInvoice } = useGetInvoiceByIdQuery(invoiceId);
  const { data: ordersData, refetch: refetchOrders } = useGetOrdersQuery({ status: ["PLACED", "IN_PROGRESS", "READY", "SERVED", "COMPLETED"] });
  const [removeOrderItem] = useRemoveOrderItemMutation();
  const [cancelOrderItem] = useCancelOrderItemMutation();
  const [updateInvoice, { isLoading: isUpdating }] = useUpdateInvoiceMutation();

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountType, setDiscountType] = useState<"FLAT" | "PERCENTAGE">("FLAT");
  const [discountValue, setDiscountValue] = useState("");

  useEffect(() => {
    if (invoice) {
      setCustomerName(invoice.customer?.name || "");
      setCustomerPhone(invoice.customer?.phone || "");
      setDiscountType((invoice.discount?.type === "PERCENTAGE" || invoice.discount?.type === "FLAT") ? invoice.discount.type : "FLAT");
      setDiscountValue(invoice.discount?.value ? String(invoice.discount.value) : "");
    }
  }, [invoice]);

  const order = useMemo(() => {
    if (!invoice?.orderId || !ordersData?.items) return null;
    return ordersData.items.find(o => o.id === invoice.orderId) || null;
  }, [invoice?.orderId, ordersData?.items]);

  if (isFetching && !invoice) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-500">
        <p>Invoice not found</p>
        <button onClick={() => router.back()} className="text-sm font-bold text-indigo-600">Go Back</button>
      </div>
    );
  }

  const items = order?.items || invoice.items;
  const table = invoice.table || order?.table;

  function fmtCurrency(value?: number): string {
    if (value == null) return "₹0";
    return `₹${value.toLocaleString("en-IN")}`;
  }

  async function handleRemove(lineId: string, itemName: string, selectedQty: number, maxQty: number) {
    if (!invoice?.orderId) return;
    const nextQty = Math.min(Math.max(1, selectedQty), maxQty);
    try {
      setBusyKey(lineId);
      await removeOrderItem({
        orderId: invoice.orderId,
        lineId,
        payload: nextQty < maxQty ? { quantity: nextQty } : undefined,
      }).unwrap();
      showSuccess(nextQty < maxQty ? `${nextQty} qty removed` : `${itemName} removed`);
      refetchOrders();
      refetchInvoice();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCancel(lineId: string, itemName: string) {
    if (!invoice?.orderId) return;
    try {
      setBusyKey(lineId);
      await cancelOrderItem({ orderId: invoice.orderId, lineId }).unwrap();
      showSuccess(`${itemName} cancelled`);
      refetchOrders();
      refetchInvoice();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleProceed() {
    // Check if anything actually changed
    const initialDiscountType = (invoice?.discount?.type === "PERCENTAGE" || invoice?.discount?.type === "FLAT") ? invoice.discount.type : "FLAT";
    const initialDiscountValue = invoice?.discount?.value || 0;

    const hasChanged =
      customerName !== (invoice?.customer?.name || "") ||
      customerPhone !== (invoice?.customer?.phone || "") ||
      discountType !== initialDiscountType ||
      Number(discountValue) !== initialDiscountValue;

    if (!hasChanged) {
      router.push(`/dashboard/invoices/${invoiceId}/preview`);
      return;
    }

    // Backend expects "FIXED" not "FLAT"
    const backendDiscountType = discountType === "FLAT" ? "FIXED" : "PERCENTAGE";
    const parsedDiscountValue = Number(discountValue);

    try {
      await updateInvoice({
        invoiceId,
        payload: {
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          discountType: backendDiscountType,
          // Always send as number; omit only if zero/empty
          discountValue: parsedDiscountValue > 0 ? parsedDiscountValue : undefined,
        }
      }).unwrap();
      router.push(`/dashboard/invoices/${invoiceId}/preview`);
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header - Responsive Sticky */}
      <div className="sticky top-0 z-30 flex-shrink-0 flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1 text-slate-500 hover:text-slate-900 transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-900 sm:text-base">Prepare Bill</h1>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              INV-{invoice.id.slice(-6).toUpperCase()} • {table ? `Table ${table.name}` : "Takeaway"}
            </p>
          </div>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Items Section */}
            <div className="lg:col-span-7 space-y-6">
              <section>
                <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Order Items</h3>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {items.map((item, idx) => {
                    const lineId = item.lineId || `temp-${idx}`;
                    const selectedQty = quantities[lineId] || 1;
                    const isBusy = busyKey === lineId;
                    const canCorrect = item.status !== "CANCELLED";

                    return (
                      <div key={lineId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{item.quantity}x</span>
                            <span className="text-sm font-semibold text-slate-700">{item.name}</span>
                          </div>
                          <p className="mt-0.5 text-[10px] font-bold text-slate-400 uppercase">
                            {fmtCurrency(item.unitPrice)} / unit • {item.status}
                          </p>
                        </div>

                        {canCorrect && item.lineId && (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 p-1">
                              {item.quantity > 1 && (
                                <div className="flex items-center gap-1.5 px-2 border-r border-slate-200">
                                  <button onClick={() => setQuantities(p => ({ ...p, [lineId]: Math.max(1, (p[lineId] || 1) - 1) }))} className="text-slate-400 hover:text-indigo-600"><MinusCircle size={14} /></button>
                                  <span className="w-4 text-center text-[10px] font-bold">{selectedQty}</span>
                                  <button onClick={() => setQuantities(p => ({ ...p, [lineId]: Math.min(item.quantity, (p[lineId] || 1) + 1) }))} className="text-slate-400 hover:text-indigo-600"><PlusCircle size={14} /></button>
                                </div>
                              )}
                              <button
                                onClick={() => handleRemove(item.lineId!, item.name, selectedQty, item.quantity)}
                                className="px-2 py-1 text-[10px] font-black text-rose-600 hover:bg-rose-50 rounded"
                              >
                                {item.quantity > 1 ? "REMOVE" : "DELETE"}
                              </button>
                              <button
                                onClick={() => handleCancel(item.lineId!, item.name)}
                                className="px-2 py-1 text-[10px] font-black text-slate-500 hover:bg-slate-100 rounded"
                              >
                                CANCEL
                              </button>
                            </div>
                            <span className="min-w-[60px] text-right text-sm font-bold text-slate-900">
                              {fmtCurrency(item.lineTotal || item.unitPrice * item.quantity)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Settings Section */}
            <div className="lg:col-span-5 space-y-8">
              {/* Customer */}
              <section>
                <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Customer Details</h3>
                <div className="space-y-4 rounded-2xl border border-slate-200 p-5">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Full Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Enter guest name"
                      className="mt-1 w-full border-b border-slate-100 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Contact Number</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="mt-1 w-full border-b border-slate-100 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </section>

              {/* Discount */}
              <section>
                <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Discount & Bill Settings</h3>
                <div className="space-y-5 rounded-2xl border border-slate-200 p-5">
                  <div className="flex gap-2 rounded-xl bg-slate-50 p-1">
                    <button
                      onClick={() => setDiscountType("FLAT")}
                      className={`flex-1 rounded-lg py-2 text-[10px] font-bold uppercase transition ${discountType === "FLAT" ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                    >
                      Fixed (₹)
                    </button>
                    <button
                      onClick={() => setDiscountType("PERCENTAGE")}
                      className={`flex-1 rounded-lg py-2 text-[10px] font-bold uppercase transition ${discountType === "PERCENTAGE" ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                    >
                      Percent (%)
                    </button>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Discount Value</label>
                    <input
                      type="number"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder="0"
                      className="mt-1 w-full border-b border-slate-100 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs font-semibold text-slate-500">
                      <span>Subtotal</span>
                      <span>{fmtCurrency(invoice.subTotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-slate-500">
                      <span>Tax</span>
                      <span>{fmtCurrency(invoice.taxTotal)}</span>
                    </div>
                    {discountValue && Number(discountValue) > 0 && (
                      <div className="flex justify-between text-xs font-bold text-emerald-600">
                        <span>Discount</span>
                        <span>- {discountType === "FLAT" ? fmtCurrency(Number(discountValue)) : `${discountValue}%`}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-4 text-base font-black text-slate-900">
                      <span>Grand Total</span>
                      <span>{fmtCurrency(
                        discountType === "FLAT"
                          ? Math.max(0, (invoice.grandTotal || 0) - Number(discountValue))
                          : (invoice.grandTotal || 0) * (1 - Number(discountValue) / 100)
                      )}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Responsive Sticky */}
      <div className="flex-shrink-0 sticky bottom-0 z-30 border-t border-slate-100 bg-white/95 backdrop-blur p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="hidden sm:block">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ready to print?</p>
            <p className="text-xs font-semibold text-slate-600">Ensure items and details are correct.</p>
          </div>
          <button
            onClick={handleProceed}
            disabled={isUpdating}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 sm:flex-none sm:px-12"
          >
            {isUpdating ? <Spinner /> : (
              <>
                Next: Invoice Preview
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
