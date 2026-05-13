"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import { useGetInvoiceByIdQuery, usePayInvoiceMutation } from "@/store/api/invoicesApi";
import { useGetOrdersQuery, useGetOrderByIdQuery } from "@/store/api/ordersApi";
import { useTentantProfileQuery } from "@/store/api/authApi";
import { useUpdateTableMutation } from "@/store/api/tablesApi";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import {
   Printer,
   Share2,
   Download,
   Wallet,
   CreditCard,
   Settings2,
   ChevronLeft,
   X,
   Smartphone,
   Check,
   Zap,
   CheckCircle,
   Clock,
   User,
   Hash
} from "lucide-react";

function Spinner() {
   return (
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
   );
}

export function InvoicePreviewView({ invoiceId, onBack }: { invoiceId: string; onBack?: () => void }) {
   const router = useRouter();
   const { data: invoice, isFetching, refetch: refetchInvoice } = useGetInvoiceByIdQuery(invoiceId);
   // Align with dashboard query for cache reuse
   const { data: ordersData } = useGetOrdersQuery({
      status: ["PLACED", "IN_PROGRESS", "READY", "SERVED"],
      page: 1,
      limit: 100
   });
   // Targeted fetch for the specific order
   const { data: orderFetch } = useGetOrderByIdQuery(invoice?.orderId || "", { skip: !invoice?.orderId });
   const { data: profile } = useTentantProfileQuery();
   const [payInvoice, { isLoading: isPaying }] = usePayInvoiceMutation();
   const [updateTable] = useUpdateTableMutation();

   const [printGst, setPrintGst] = useState(true);
   const [printWidth, setPrintWidth] = useState<"80" | "58">("80");
   const [showDrawer, setShowDrawer] = useState(false);

   const order = useMemo(() => {
      if (!invoice?.orderId) return null;
      // Try to find in the list query first (cache hit)
      const inList = ordersData?.items?.find(o => o.id === invoice.orderId);
      if (inList) return inList;
      // Fallback to the targeted fetch
      return orderFetch || null;
   }, [invoice?.orderId, ordersData?.items, orderFetch]);

   if (isFetching && !invoice) {
      return (
         <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
         </div>
      );
   }

   if (!invoice) return null;

   const table = invoice.table || order?.table;
   const customerName = invoice.customer?.name || order?.customerName || "-";
   const customerPhone = invoice.customer?.phone || order?.customerPhone || "";

   const receiptProfile = {
      tenantName: profile?.tenant?.name || "RestroKhata",
      gstNumber: profile?.tenant?.gstNumber || "",
      contactNumber: profile?.tenant?.contactNumber || "",
      address: profile?.tenant?.address
         ? [profile.tenant.address.line1, profile.tenant.address.city, profile.tenant.address.state].filter(Boolean).join(", ")
         : "",
   };

   function fmtCurrency(value?: number): string {
      if (value == null) return "₹0";
      return `₹${value.toLocaleString("en-IN")}`;
   }

   function fmtDateTime(value?: string): string {
      if (!value) return "-";
      return new Intl.DateTimeFormat("en-IN", {
         dateStyle: "medium",
         timeStyle: "short",
      }).format(new Date(value));
   }

   async function handlePay(method: "CASH" | "UPI") {
      try {
         const due = Math.max((invoice?.totalDue ?? 0) - (invoice?.payment?.paidAmount ?? 0), 0);
         await payInvoice({
            invoiceId,
            payload: { method, paidAmount: due || invoice!.grandTotal || 0 }
         }).unwrap();
         showSuccess(`Paid via ${method}`);

         // Free up table if associated
         const tableId = invoice?.table?.id || order?.tableId || order?.table?.id;
         if (tableId) {
            try {
               await updateTable({ tableId, status: "AVAILABLE" }).unwrap();
            } catch (err) {
               console.error("Failed to free up table", err);
            }
         }

         if (onBack) {
            onBack();
         } else {
            router.push("/dashboard");
         }
      } catch (e) {
         showError(getErrorMessage(e));
      }
   }

   function handleShare() {
      if (!invoice) return;
      const amount = invoice.grandTotal || invoice.subTotal || 0;
      const itemLines = (invoice.items || []).map((item, index) => {
         const line = item.lineTotal ?? item.unitPrice * item.quantity;
         return `${index + 1}. ${item.name} x ${item.quantity} = ${fmtCurrency(line)}`;
      });

      const maxChars = 32;
      const center = (str: string) => {
         const s = str.slice(0, maxChars);
         const padding = Math.max(0, Math.floor((maxChars - s.length) / 2));
         return " ".repeat(padding) + s;
      };

      const separator = "-".repeat(maxChars);

      const text = [
         "```",
         center(receiptProfile.tenantName.toUpperCase()),
         center(receiptProfile.address),
         center(`PH: ${receiptProfile.contactNumber}`),
         separator,
         center(`INVOICE: INV-${invoice.id.slice(-6).toUpperCase()}`),
         center(fmtDateTime(invoice.createdAt)),
         separator,
         "ITEM            QTY      AMT",
         ...invoice.items.map(item => {
            const name = (item.name.slice(0, 14) + " ").padEnd(15, " ");
            const qty = (item.quantity.toString()).padStart(3, " ");
            const amt = (fmtCurrency(item.lineTotal || item.unitPrice * item.quantity)).padStart(10, " ");
            return `${name} ${qty} ${amt}`;
         }),
         separator,
         `SUBTOTAL:`.padEnd(20, " ") + fmtCurrency(invoice.subTotal).padStart(12, " "),
         printGst ? `TAX:`.padEnd(20, " ") + fmtCurrency(invoice.taxTotal).padStart(12, " ") : null,
         invoice.discount?.amount ? `DISCOUNT:`.padEnd(20, " ") + `-${fmtCurrency(invoice.discount.amount)}`.padStart(12, " ") : null,
         `GRAND TOTAL:`.padEnd(20, " ") + fmtCurrency(printGst ? (invoice.grandTotal || 0) : ((invoice.subTotal || 0) - (invoice.discount?.amount || 0))).padStart(12, " "),
         separator,
         center("THANK YOU FOR VISITING"),
         center("POWERED BY RESTROKHATA"),
         "```"
      ].filter(Boolean).join("\n");

      const digits = customerPhone.replace(/\D/g, "");
      const url = digits
         ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
         : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
   }

   const isPaid = invoice.status === "PAID" || (invoice.payment && (invoice.totalDue ?? 0) - (invoice.payment?.paidAmount ?? 0) <= 0);

   return (
      <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
         {/* Thermal Print Header/Footer Fix */}
         <style>{`
        @media print {
          @page { margin: 0; }
          html, body { 
             margin: 0 !important; 
             padding: 0 !important; 
             background: white !important;
          }
          /* Override all parent containers that might restrict height */
          html, body, div {
             height: auto !important;
             overflow: visible !important;
          }
          /* Hide everything by default */
          body * {
            visibility: hidden;
          }
          /* Show only print content */
          .print-content, .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${printWidth}mm !important;
            padding: 4mm !important;
            margin: 0 !important;
            background: white !important;
            font-family: 'Courier New', Courier, monospace !important;
            color: black !important;
            font-size: 11px !important;
            line-height: 1.2 !important;
            box-shadow: none !important;
            border: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .thermal-bold { font-weight: bold; font-size: 12px; }
          .thermal-center { text-align: center; }
          .thermal-right { text-align: right; }
          .thermal-dashed { border-top: 1px dashed black; margin: 2mm 0; }
        }
      `}</style>

         {/* Header - Responsive Sticky */}
         <div className="sticky top-0 z-30 flex-shrink-0 flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur px-4 py-3 shadow-sm no-print">
            <div className="flex items-center gap-3">
               <button
                  onClick={() => {
                     if (onBack) {
                        onBack();
                     } else {
                        router.push("/dashboard/invoices" + (invoice?.status === "PAID" ? "?tab=PAID" : ""));
                     }
                  }}
                  className="p-1 text-slate-500 hover:text-slate-900 transition-colors"
               >
                  <ChevronLeft size={24} />
               </button>
               <h1 className="text-sm font-bold text-slate-900 sm:text-base">Invoice Preview</h1>
            </div>
            <button
               onClick={() => setShowDrawer(true)}
               className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm active:scale-95"
            >
               <Settings2 size={16} />
               Settings
            </button>
         </div>

         {/* Main Scrollable Content */}
         <div className="flex-1 overflow-y-auto min-h-0 py-10 px-4 flex flex-col items-center">
            {/* Receipt Visual Representation */}
            <div className={`print-content bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-slate-100 p-8 transition-all ${printWidth === "58" ? 'max-w-[320px]' : 'max-w-[400px]'}`}>
               <div className="thermal-center mb-6">
                  <h2 className="text-xl font-bold uppercase tracking-tight text-slate-900 leading-tight">{receiptProfile.tenantName}</h2>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500 leading-normal">{receiptProfile.address}</p>
                  <div className="mt-2 flex items-center justify-center gap-3 text-[10px] font-bold text-slate-400">
                     {receiptProfile.contactNumber && <span>PH: {receiptProfile.contactNumber}</span>}
                     {printGst && receiptProfile.gstNumber && <span>GST: {receiptProfile.gstNumber}</span>}
                  </div>
               </div>

               <div className="space-y-1 mb-6 text-[10px] font-bold uppercase text-slate-400">
                  <div className="flex justify-between">
                     <span>Invoice No</span>
                     <span className="text-slate-900">INV-{invoice.id.slice(-6).toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                     <span>Date</span>
                     <span className="text-slate-900">{fmtDateTime(invoice.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                     <span>Service</span>
                     <span className="text-slate-900">{table ? `Table ${table.name}` : "Takeaway"}</span>
                  </div>
                  {customerName !== "-" && (
                     <div className="flex justify-between">
                        <span>Customer</span>
                        <span className="text-slate-900">{customerName}</span>
                     </div>
                  )}
               </div>

               <div className="thermal-dashed" />
               <table className="w-full mb-4 text-[11px] font-bold">
                  <thead>
                     <tr className="text-slate-400 text-left border-b border-slate-50">
                        <th className="py-2">Item</th>
                        <th className="py-2 text-center">Qty</th>
                        <th className="py-2 text-right">Amt</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                     {invoice.items.map((item, idx) => (
                        <tr key={idx} className="text-slate-700">
                           <td className="py-2 pr-2">
                              <p>{item.name}</p>
                              {item.variantName && <p className="text-[9px] text-slate-400">({item.variantName})</p>}
                           </td>
                           <td className="py-2 text-center align-top">{item.quantity}</td>
                           <td className="py-2 text-right align-top">{fmtCurrency(item.lineTotal || item.unitPrice * item.quantity)}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               <div className="thermal-dashed" />

               <div className="space-y-1.5 mb-6 text-[11px] font-bold text-slate-700">
                  <div className="flex justify-between">
                     <span className="text-slate-400 uppercase">Subtotal</span>
                     <span>{fmtCurrency(invoice.subTotal)}</span>
                  </div>
                  {printGst && (
                     <div className="flex justify-between">
                        <span className="text-slate-400 uppercase">Tax</span>
                        <span>{fmtCurrency(invoice.taxTotal)}</span>
                     </div>
                  )}
                  {invoice.discount?.amount ? (
                     <div className="flex justify-between text-emerald-600">
                        <span className="text-slate-400 uppercase">Discount</span>
                        <span>-{fmtCurrency(invoice.discount.amount)}</span>
                     </div>
                  ) : null}
                  <div className="flex justify-between pt-2 text-sm font-black border-t border-slate-900 mt-2">
                     <span>GRAND TOTAL</span>
                     <span>{fmtCurrency(printGst ? (invoice.grandTotal || 0) : ((invoice.subTotal || 0) - (invoice.discount?.amount || 0)))}</span>
                  </div>
               </div>

               <div className="thermal-center pt-4 mt-6 border-t border-dashed border-slate-200">
                  <p className="text-[10px] font-black text-slate-900 mb-1 uppercase tracking-widest">Thank you for visiting!</p>
                  <div className="flex items-center justify-center gap-1.5 text-[9px] font-bold text-indigo-400 tracking-[0.15em] mt-4">
                     <Smartphone size={10} />
                     POWERED BY RESTROKHATA
                  </div>
               </div>
            </div>
         </div>

         {/* Footer - Responsive Sticky */}
         {/* <div className="flex-shrink-0 sticky bottom-0 z-30 border-t border-slate-100 bg-white/95 backdrop-blur p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] no-print sm:px-8">
         <div className="mx-auto flex max-w-lg items-center gap-3">
            <button 
              onClick={() => window.print()}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg active:scale-95"
            >
               <Printer size={24} />
            </button>
            <button 
              onClick={handleShare}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 active:scale-95"
            >
               <Share2 size={24} />
            </button>
            <button 
              onClick={() => downloadInvoicePdf(invoice, { ...receiptProfile, customerName })}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 active:scale-95"
            >
               <Download size={24} />
            </button>
            
            {!isPaid && (
               <div className="flex flex-1 gap-2">
                  <button 
                    disabled={isPaying}
                    onClick={() => handlePay("CASH")}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-sm font-bold text-white transition hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
                  >
                     {isPaying ? <Spinner /> : "Pay Cash"}
                  </button>
                  <button 
                    disabled={isPaying}
                    onClick={() => handlePay("UPI")}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white border border-indigo-200 text-sm font-bold text-indigo-600 active:scale-95 disabled:opacity-50"
                  >
                     {isPaying ? <Spinner /> : "UPI"}
                  </button>
               </div>
            )}

            {isPaid && (
               <div className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 h-14">
                  <CheckCircle size={20} />
                  <span className="text-sm font-black uppercase tracking-widest">Paid</span>
               </div>
            )}
         </div>
      </div> */}
         <div className="flex-shrink-0 sticky bottom-0 z-30 border-t border-slate-100 bg-white/95 backdrop-blur p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] no-print sm:px-8">
            <div className="mx-auto flex max-w-lg items-center justify-between gap-3">

               {/* Print */}
               <button
                  onClick={() => window.print()}
                  className="flex flex-col items-center justify-center h-16 w-16 rounded-2xl bg-slate-900 text-white shadow-lg active:scale-95"
               >
                  <Printer size={22} />
                  <span className="text-[10px] mt-1 font-semibold">Print</span>
               </button>

               {/* Share */}
               <button
                  onClick={handleShare}
                  className="flex flex-col items-center justify-center h-16 w-16 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 active:scale-95"
               >
                  <Share2 size={22} />
                  <span className="text-[10px] mt-1 font-semibold">Share</span>
               </button>

               {/* Download */}
               <button
                  onClick={() => downloadInvoicePdf(invoice, { ...receiptProfile, customerName })}
                  className="flex flex-col items-center justify-center h-16 w-16 rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 active:scale-95"
               >
                  <Download size={22} />
                  <span className="text-[10px] mt-1 font-semibold">Download</span>
               </button>

               {/* Payment Section */}
               {!isPaid && (
                  <div className="flex gap-3">

                     {/* Cash */}
                     <button
                        disabled={isPaying}
                        onClick={() => handlePay("CASH")}
                        className="flex flex-col items-center justify-center h-16 w-16 rounded-2xl bg-indigo-600 text-white active:scale-95 disabled:opacity-50"
                     >
                        {isPaying ? <Spinner /> : <>
                           💵
                           <span className="text-[10px] mt-1 font-semibold">Cash</span>
                        </>}
                     </button>

                     {/* UPI */}
                     <button
                        disabled={isPaying}
                        onClick={() => handlePay("UPI")}
                        className="flex flex-col items-center justify-center h-16 w-16 rounded-2xl border border-indigo-200 text-indigo-600 bg-white active:scale-95 disabled:opacity-50"
                     >
                        {isPaying ? <Spinner /> : <>
                           📱
                           <span className="text-[10px] mt-1 font-semibold">UPI</span>
                        </>}
                     </button>

                  </div>
               )}

               {/* Paid State */}
               {isPaid && (
                  <div className="flex flex-col items-center justify-center h-16 w-16 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600">
                     <CheckCircle size={20} />
                     <span className="text-[10px] mt-1 font-semibold">Paid</span>
                  </div>
               )}

            </div>
         </div>

         {/* Settings Drawer Overlay */}
         {showDrawer && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center no-print backdrop-blur-sm">
               <div className="w-full max-w-sm rounded-[32px] bg-white p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-8">
                     <h3 className="text-base font-black uppercase tracking-widest text-slate-400">Bill Settings</h3>
                     <button onClick={() => setShowDrawer(false)} className="p-2 text-slate-400 hover:text-slate-900"><X size={24} /></button>
                  </div>

                  <div className="space-y-8">
                     <section>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Print Width</p>
                        <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
                           <button
                              onClick={() => setPrintWidth("80")}
                              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition ${printWidth === "80" ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                           >
                              {printWidth === "80" && <Check size={14} />} 80MM (Standard)
                           </button>
                           <button
                              onClick={() => setPrintWidth("58")}
                              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition ${printWidth === "58" ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                           >
                              {printWidth === "58" && <Check size={14} />} 58MM (Small)
                           </button>
                        </div>
                     </section>

                     <section>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Tax Configuration</p>
                        <button
                           onClick={() => setPrintGst(!printGst)}
                           className={`w-full flex items-center justify-between rounded-2xl border-2 p-5 transition-all ${printGst ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-slate-100 bg-white text-slate-400'}`}
                        >
                           <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 flex items-center justify-center rounded-xl ${printGst ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                 <Zap size={20} />
                              </div>
                              <div className="text-left">
                                 <p className="text-xs font-black uppercase tracking-widest">Include GST</p>
                                 <p className="text-[10px] font-semibold opacity-70">Tax will be shown on print</p>
                              </div>
                           </div>
                           {printGst && <CheckCircle size={24} />}
                        </button>
                     </section>
                  </div>

                  <button
                     onClick={() => setShowDrawer(false)}
                     className="mt-10 w-full rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white active:scale-95"
                  >
                     Done
                  </button>
               </div>
            </div>
         )}
      </div>
   );
}
