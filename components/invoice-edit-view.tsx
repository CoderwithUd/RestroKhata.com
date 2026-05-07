"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess, showInfo } from "@/lib/feedback";
import {
  useGetInvoiceByIdQuery,
  useUpdateInvoiceMutation,
  useCreateInvoiceMutation,
  useDeleteInvoiceMutation,
} from "@/store/api/invoicesApi";
import {
  useGetOrdersQuery,
  useRemoveOrderItemMutation,
  useCancelOrderItemMutation,
  useMoveOrderItemMutation,
} from "@/store/api/ordersApi";
import { useGetMenuItemsQuery } from "@/store/api/menuApi";
import { useGetTablesQuery } from "@/store/api/tablesApi";
import {
  ChevronRight,
  ChevronLeft,
  MinusCircle,
  PlusCircle,
  Search,
  Trash2,
  Plus,
  User,
  Phone,
  Tag,
  XCircle,
  ArrowRightLeft,
  Settings2,
  Loader2,
  Layers
} from "lucide-react";
import type { OrderItem } from "@/store/types/orders";
import type { MenuItemRecord, MenuVariantRecord } from "@/store/types/menu";

function Spinner() {
  return (
    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
  );
}

type Props = {
  invoiceId?: string;
  orderIds?: string[];
  onBack?: () => void;
};

export function InvoiceEditView({ invoiceId, orderIds, onBack }: Props) {
  const router = useRouter();

  // Queries
  const { data: invoice, isFetching: isInvoiceFetching, refetch: refetchInvoice } = useGetInvoiceByIdQuery(invoiceId || "", { skip: !invoiceId });
  const { data: ordersData, refetch: refetchOrders } = useGetOrdersQuery({ status: ["PLACED", "IN_PROGRESS", "READY", "SERVED", "COMPLETED"] });
  const { data: tablesData } = useGetTablesQuery({ isActive: true });
  
  // State for search
  const [searchQuery, setSearchQuery] = useState("");
  const { data: menuData, isFetching: isMenuFetching } = useGetMenuItemsQuery(
    searchQuery.trim().length > 1 ? { q: searchQuery, limit: 10 } : { page: 1, limit: 20 },
    { skip: searchQuery.trim().length === 1 }
  );

  // Mutations
  const [createInvoice, { isLoading: isCreating }] = useCreateInvoiceMutation();
  const [updateInvoice, { isLoading: isUpdating }] = useUpdateInvoiceMutation();
  const [deleteInvoice, { isLoading: isDeletingInvoice }] = useDeleteInvoiceMutation();
  const [removeOrderItem] = useRemoveOrderItemMutation();
  const [cancelOrderItem] = useCancelOrderItemMutation();
  const [moveOrderItem] = useMoveOrderItemMutation();

  // State
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountType, setDiscountType] = useState<"FLAT" | "PERCENTAGE">("FLAT");
  const [discountValue, setDiscountValue] = useState("");
  const [extraItems, setExtraItems] = useState<OrderItem[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [movingItem, setMovingItem] = useState<{ orderId: string; lineId: string; itemName: string; maxQty: number } | null>(null);
  const [variantSelectionItem, setVariantSelectionItem] = useState<MenuItemRecord | null>(null);

  // Sync initial state
  useEffect(() => {
    if (invoice) {
      setCustomerName(invoice.customer?.name || "");
      setCustomerPhone(invoice.customer?.phone || "");
      setDiscountType(invoice.discount?.type === "PERCENTAGE" ? "PERCENTAGE" : "FLAT");
      setDiscountValue(invoice.discount?.value ? String(invoice.discount.value) : "");
    }
  }, [invoice]);

  const relevantOrders = useMemo(() => {
    if (!ordersData?.items) return [];
    if (invoiceId && invoice?.orderId) {
      const ids = [invoice.orderId, ...(invoice.orderIds || [])];
      return ordersData.items.filter(o => ids.includes(o.id));
    }
    if (orderIds) {
      return ordersData.items.filter(o => orderIds.includes(o.id));
    }
    return [];
  }, [invoice, invoiceId, orderIds, ordersData?.items]);

  const baseItems = useMemo(() => {
    const items: (OrderItem & { orderId: string })[] = [];
    relevantOrders.forEach(order => {
      order.items.forEach(item => {
        if (item.status !== "CANCELLED") {
          items.push({ ...item, orderId: order.id });
        }
      });
    });
    return items;
  }, [relevantOrders]);

  const allItems = [...baseItems, ...extraItems];

  // Totals
  const totals = useMemo(() => {
    let subTotal = 0;
    let taxTotal = 0;
    allItems.forEach(item => {
      const qty = quantities[item.lineId!] || item.quantity;
      const unitPrice = item.unitPrice || 0;
      const taxRate = item.taxPercentage || 0;
      const lineSub = unitPrice * qty;
      const lineTax = lineSub * (taxRate / 100);
      subTotal += lineSub;
      taxTotal += lineTax;
    });
    const grandTotalBeforeDiscount = subTotal + taxTotal;
    let discountAmount = 0;
    const dv = Number(discountValue) || 0;
    if (discountType === "PERCENTAGE") {
      discountAmount = grandTotalBeforeDiscount * (dv / 100);
    } else {
      discountAmount = dv;
    }
    const grandTotal = Math.max(0, grandTotalBeforeDiscount - discountAmount);
    return { subTotal, taxTotal, grandTotal, discountAmount };
  }, [allItems, quantities, discountValue, discountType]);

  const fmtCurrency = (v?: number) => `₹${(v || 0).toLocaleString("en-IN")}`;

  const handleBack = () => onBack ? onBack() : router.back();

  const handleDelete = async () => {
    if (!invoiceId || !window.confirm("Are you sure you want to delete this invoice?")) return;
    try {
      await deleteInvoice(invoiceId).unwrap();
      showSuccess("Invoice deleted");
      router.push("/dashboard/invoices");
    } catch (e) {
      showError(getErrorMessage(e));
    }
  };

  // Item Handlers
  const handleReduce = async (orderId: string, lineId: string, itemName: string, qty: number, maxQty: number) => {
    try {
      setBusyKey(lineId);
      await removeOrderItem({
        orderId,
        lineId,
        payload: qty < maxQty ? { quantity: qty } : undefined,
      }).unwrap();
      showSuccess(qty < maxQty ? `${qty} qty removed` : `${itemName} removed`);
      refetchOrders();
      if (invoiceId) refetchInvoice();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  const handleCancel = async (orderId: string, lineId: string, itemName: string) => {
    try {
      setBusyKey(lineId);
      await cancelOrderItem({ orderId, lineId }).unwrap();
      showSuccess(`${itemName} cancelled`);
      refetchOrders();
      if (invoiceId) refetchInvoice();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  const handleMove = async (targetTableId: string) => {
    if (!movingItem) return;
    try {
      setBusyKey(movingItem.lineId);
      await moveOrderItem({
        orderId: movingItem.orderId,
        lineId: movingItem.lineId,
        payload: { targetTableId, quantity: quantities[movingItem.lineId] || movingItem.maxQty }
      }).unwrap();
      showSuccess(`${movingItem.itemName} moved successfully`);
      setMovingItem(null);
      refetchOrders();
      if (invoiceId) refetchInvoice();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  // Extra Items
  const handleItemClick = (menuItem: MenuItemRecord) => {
    if (menuItem.variants && menuItem.variants.length > 0) {
      setVariantSelectionItem(menuItem);
    } else {
      addMenuItem(menuItem);
    }
  };

  const addMenuItem = (menuItem: MenuItemRecord, variant?: MenuVariantRecord) => {
    const tempLineId = `new-${Date.now()}`;
    setExtraItems(prev => [...prev, {
      lineId: tempLineId,
      itemId: menuItem.id,
      variantId: variant?.id,
      name: menuItem.name,
      variantName: variant?.name,
      quantity: 1,
      unitPrice: variant ? variant.price : (menuItem.price || 0),
      taxPercentage: menuItem.taxPercentage || 0,
      status: "SERVED",
    }]);
    setSearchQuery("");
    setIsSearchOpen(false);
    setVariantSelectionItem(null);
    showInfo(`${menuItem.name}${variant ? ` (${variant.name})` : ""} added`);
  };

  const handleProceed = async () => {
    // Check if anything changed
    const initialCustomerName = invoice?.customer?.name || "";
    const initialCustomerPhone = invoice?.customer?.phone || "";
    const initialDiscountType = (invoice?.discount?.type === "PERCENTAGE" || invoice?.discount?.type === "FLAT") ? invoice.discount.type : "FLAT";
    const initialDiscountValue = invoice?.discount?.value || 0;

    const hasMetadataChanges = 
      customerName !== initialCustomerName ||
      customerPhone !== initialCustomerPhone ||
      discountType !== initialDiscountType ||
      Number(discountValue) !== initialDiscountValue;

    const hasNewItems = extraItems.length > 0;
    const hasQtyChanges = baseItems.some(item => quantities[item.lineId!] !== undefined && quantities[item.lineId!] !== item.quantity);

    if (invoiceId && !hasMetadataChanges && !hasNewItems && !hasQtyChanges) {
      router.push(`/dashboard/invoices/${invoiceId}/preview`);
      return;
    }

    const payload = {
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      ...(Number(discountValue) > 0 ? {
        discountType: discountType === "FLAT" ? "FLAT" : "PERCENTAGE",
        discountValue: Number(discountValue),
      } : {}),
      items: allItems.map(item => ({
        itemId: item.itemId,
        variantId: item.variantId,
        quantity: quantities[item.lineId!] || item.quantity,
        optionIds: item.options?.map(o => o.optionId),
        note: item.note,
      })),
    };

    try {
      if (invoiceId) {
        await updateInvoice({ invoiceId, payload }).unwrap();
        router.replace(`/dashboard/invoices/${invoiceId}/preview`);
      } else if (orderIds?.length) {
        const res = await createInvoice({ orderId: orderIds[0], ...payload }).unwrap();
        router.replace(`/dashboard/invoices/${res.invoice.id}/preview`);
      }
      showSuccess("Done");
    } catch (e) {
      showError(getErrorMessage(e));
    }
  };

  if (isInvoiceFetching && !invoice) return <div className="flex h-64 items-center justify-center"><Spinner /></div>;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 flex-shrink-0 flex items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-1 text-slate-500 hover:text-slate-900"><ChevronLeft size={24} /></button>
          <div>
            <h1 className="text-sm font-bold text-slate-900">{invoiceId ? "Edit Invoice" : "Prepare Bill"}</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {relevantOrders[0]?.table?.name || "No Table"} • {allItems.length} Items
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {invoiceId && (
            <button onClick={handleDelete} disabled={isDeletingInvoice} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
              <Trash2 size={20} />
            </button>
          )}
          <button onClick={() => setIsSearchOpen(true)} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-indigo-700 transition-all active:scale-95">
            <Plus size={16} />
            ADD ITEM
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-4 sm:p-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          
          {/* LEFT: Items */}
          <div className="lg:col-span-7 space-y-4">
            {allItems.map((item) => {
              const lineId = item.lineId!;
              const isNew = lineId.startsWith("new-");
              const isBusy = busyKey === lineId;
              const currentQty = quantities[lineId] || item.quantity;
              const orderId = (item as any).orderId;

              return (
                <div key={lineId} className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {isNew && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700 uppercase">Extra</span>}
                        <p className="text-sm font-bold text-slate-900 uppercase break-words">
                          {item.name}
                          {item.variantName && <span className="ml-2 text-[10px] text-indigo-500 font-black">({item.variantName})</span>}
                        </p>
                      </div>
                      <p className="mt-0.5 text-[10px] font-black text-slate-400 uppercase tracking-tight">{fmtCurrency(item.unitPrice)} / unit</p>
                    </div>
                    <p className="text-sm font-black text-slate-900">{fmtCurrency(item.unitPrice * currentQty)}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-50 pt-3">
                    <div className="flex items-center gap-1 rounded-xl bg-slate-50 p-1">
                      <button onClick={() => setQuantities(p => ({ ...p, [lineId]: Math.max(1, (p[lineId] || item.quantity) - 1) }))} className="p-1 text-slate-400 hover:text-indigo-600"><MinusCircle size={20} /></button>
                      <span className="w-8 text-center text-sm font-black text-slate-900">{currentQty}</span>
                      <button onClick={() => setQuantities(p => ({ ...p, [lineId]: (p[lineId] || item.quantity) + 1 }))} className="p-1 text-slate-400 hover:text-indigo-600"><PlusCircle size={20} /></button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isNew && orderId && (
                        <>
                          <button 
                            onClick={() => handleReduce(orderId, lineId, item.name, currentQty, item.quantity)}
                            disabled={isBusy}
                            className="rounded-lg px-2 py-1.5 text-[10px] font-black text-indigo-600 hover:bg-indigo-50 uppercase tracking-widest"
                          >
                            {isBusy ? "..." : (currentQty < item.quantity ? "REDUCE QTY" : "REMOVE")}
                          </button>
                          <button 
                            onClick={() => handleCancel(orderId, lineId, item.name)}
                            disabled={isBusy}
                            className="rounded-lg px-2 py-1.5 text-[10px] font-black text-rose-600 hover:bg-rose-50 uppercase tracking-widest"
                          >
                            CANCEL
                          </button>
                          <button 
                            onClick={() => setMovingItem({ orderId, lineId, itemName: item.name, maxQty: item.quantity })}
                            className="rounded-lg px-2 py-1.5 text-[10px] font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest flex items-center gap-1"
                          >
                            <ArrowRightLeft size={12} />
                            MOVE
                          </button>
                        </>
                      )}
                      {isNew && (
                        <button onClick={() => setExtraItems(p => p.filter(i => i.lineId !== lineId))} className="rounded-lg px-2 py-1.5 text-[10px] font-black text-rose-600 hover:bg-rose-50 uppercase">DELETE</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* RIGHT: Bill Summary */}
          <div className="lg:col-span-5 space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400"><User size={14} />Customer Info</h3>
              <div className="space-y-4">
                <input type="text" placeholder="Guest Name" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full rounded-xl border border-slate-100 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-400" />
                <input type="tel" placeholder="Phone Number" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full rounded-xl border border-slate-100 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-400" />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400"><Tag size={14} />Discount</h3>
              <div className="space-y-4">
                <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                  {["FLAT", "PERCENTAGE"].map(type => (
                    <button key={type} onClick={() => setDiscountType(type as any)} className={`flex-1 rounded-lg py-2 text-[10px] font-black uppercase transition-all ${discountType === type ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>{type === "FLAT" ? "₹ Fixed" : "% Percent"}</button>
                  ))}
                </div>
                <input type="number" placeholder="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="w-full rounded-xl border border-slate-100 bg-slate-50 py-3 px-4 text-sm font-black text-slate-900 outline-none focus:bg-white focus:border-indigo-400" />
              </div>
            </section>

            <section className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-6 shadow-sm">
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold text-slate-500"><span>Subtotal</span><span>{fmtCurrency(totals.subTotal)}</span></div>
                <div className="flex justify-between text-xs font-bold text-slate-500"><span>Tax</span><span>{fmtCurrency(totals.taxTotal)}</span></div>
                {totals.discountAmount > 0 && <div className="flex justify-between text-xs font-black text-emerald-600 uppercase"><span>Discount</span><span>-{fmtCurrency(totals.discountAmount)}</span></div>}
                <div className="flex justify-between border-t border-indigo-100 pt-4 text-xl font-black text-slate-900"><span>Grand Total</span><span className="text-indigo-600">{fmtCurrency(totals.grandTotal)}</span></div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="sticky bottom-0 z-40 border-t border-slate-200 bg-white p-4 sm:px-6 shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
          <div className="hidden sm:block">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Final Step</p>
            <p className="text-xs font-semibold text-slate-500">Click to {invoiceId ? 'save changes' : 'generate bill'}.</p>
          </div>
          <button onClick={handleProceed} disabled={isCreating || isUpdating || allItems.length === 0} className="flex-1 sm:flex-none sm:px-16 flex items-center justify-center gap-3 rounded-2xl bg-slate-900 py-4 text-sm font-black text-white hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50">
            {isCreating || isUpdating ? <Loader2 size={20} className="animate-spin" /> : <>{invoiceId ? "Update & Preview" : "Generate Invoice"}<ChevronRight size={18} /></>}
          </button>
        </div>
      </footer>

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:p-8">
          <div className="w-full max-w-2xl animate-in zoom-in-95 duration-200">
            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                <Search className="text-slate-400" size={20} />
                <input autoFocus type="text" placeholder="Search menu item..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 text-sm font-bold text-slate-900 outline-none" />
                <button onClick={() => setIsSearchOpen(false)} className="p-2 text-slate-400 hover:text-slate-900"><XCircle size={24} /></button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {isMenuFetching && <div className="flex py-10 justify-center"><Spinner /></div>}
                {menuData?.items.map(item => (
                  <button key={item.id} onClick={() => handleItemClick(item)} className="flex w-full items-center justify-between rounded-2xl px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-slate-100 p-2 text-slate-500"><Layers size={18} /></div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-900 uppercase">{item.name}</p>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">{item.category?.name} • {item.variants.length > 0 ? `${item.variants.length} Variants` : 'Base'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-slate-900">{fmtCurrency(item.price)}</span>
                      <div className="rounded-full bg-indigo-50 p-2 text-indigo-600"><Plus size={18} /></div>
                    </div>
                  </button>
                ))}
                {!isMenuFetching && !menuData?.items.length && <div className="py-10 text-center text-xs font-bold text-slate-400 uppercase">No items found</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Variant Selection Modal */}
      {variantSelectionItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-[32px] bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-lg font-black text-slate-900 uppercase">{variantSelectionItem.name}</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Variant</p>
              </div>
              <button onClick={() => setVariantSelectionItem(null)} className="p-2 text-slate-400"><XCircle size={24} /></button>
            </div>
            <div className="space-y-2">
              {variantSelectionItem.variants.map(v => (
                <button key={v.id} onClick={() => addMenuItem(variantSelectionItem, v)} className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                  <span className="text-sm font-bold text-slate-900 uppercase">{v.name}</span>
                  <span className="text-sm font-black text-indigo-600">{fmtCurrency(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Move/Exchange Table Modal */}
      {movingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[32px] bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <h4 className="text-lg font-black text-slate-900">Move Item</h4>
            <p className="mt-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">Select target table for {movingItem.itemName}</p>
            <div className="mt-6 grid grid-cols-3 gap-3 max-h-[40vh] overflow-y-auto p-1">
              {tablesData?.items.filter(t => t.id !== relevantOrders[0]?.table?.id).map(table => (
                <button key={table.id} onClick={() => handleMove(table.id)} className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-100 bg-slate-50 py-4 hover:border-indigo-400 hover:bg-indigo-50 transition-all active:scale-95">
                  <span className="text-xs font-black text-slate-900 uppercase">{table.name}</span>
                  <span className="text-[10px] font-bold text-slate-400">T{table.number}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setMovingItem(null)} className="mt-6 w-full rounded-2xl border border-slate-200 py-4 text-sm font-bold text-slate-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
