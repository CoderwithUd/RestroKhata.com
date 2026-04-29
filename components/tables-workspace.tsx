"use client";

import { useCallback, FormEvent, useMemo, useState } from "react";
import { sanitizePhone } from "@/lib/phone";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/confirm-provider";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import {
  useCreateTableMutation,
  useDeleteTableMutation,
  useGetTablesQuery,
  useLazyGetTableQrQuery,
  useUpdateTableMutation,
} from "@/store/api/tablesApi";
import { useGetOrdersQuery } from "@/store/api/ordersApi";
import { useGetInvoicesQuery } from "@/store/api/invoicesApi";
import { useGetCustomersQuery } from "@/store/api/customersApi";
import type {
  TableQrFormat,
  TableReservation,
  TableRecord,
  TableStatus,
} from "@/store/types/tables";
import type { CustomerRecord } from "@/store/types/customers";

type Props = { tenantName?: string; tenantSlug?: string };
type Filter = "all" | "active" | "inactive";
type TableListViewMode = "grid" | "list";
type QrTemplateId = "template1" | "template2" | "template3" | "template4" | "template5";

type ReservationFormState = {
  customerName: string;
  customerPhone: string;
  partySize: number;
  reservedFor: string;
  note: string;
  advanceRequired: boolean;
  advanceAmount: number;
  advancePaidAmount: number;
  advanceMethod: string;
  advanceReference: string;
};

type QrState = {
  open: boolean;
  table: TableRecord | null;
  format: TableQrFormat;
  templateId: QrTemplateId;
  baseUrl: string;
  qr: string;
  qrPayload: string;
  error: string;
};

type QrTemplate = {
  id: QrTemplateId;
  name: string;
  description: string;
  imagePath: string;
  qrSlot: { x: number; y: number; size: number; padding: number };
};

const STATUS_OPTIONS: Array<{ value: TableStatus; label: string }> = [
  { value: "AVAILABLE", label: "Available" },
  { value: "RESERVED", label: "Reserved" },
  { value: "OCCUPIED", label: "Occupied" },
  { value: "BILLING", label: "Billing" },
];

const FRONTEND_PUBLIC_URL = "https://restro-khata-com.vercel.app";
const FRONTEND_QR_BASE_URL = `${FRONTEND_PUBLIC_URL}/qr`;

const QR_TEMPLATES: QrTemplate[] = [
  { id: "template1", name: "Classic", description: "Traditional placard", imagePath: "/QR/QRSCANTEMPLATE1.jpg", qrSlot: { x: 0.18, y: 0.46, size: 0.64, padding: 0.055 } },
  { id: "template2", name: "Modern", description: "Clean standee", imagePath: "/QR/QRSCANTEMPLATE2.jpg", qrSlot: { x: 0.18, y: 0.395, size: 0.64, padding: 0.055 } },
  { id: "template3", name: "Warm", description: "Cozy card", imagePath: "/QR/QRSCANTEMPLATE3.jpg", qrSlot: { x: 0.23, y: 0.405, size: 0.53, padding: 0.03 } },
  { id: "template4", name: "Premium", description: "Elegant card", imagePath: "/QR/QRSCANTEMPLATE4.jpg", qrSlot: { x: 0.245, y: 0.405, size: 0.49, padding: 0.04 } },
  { id: "template5", name: "Signature", description: "Distinctive stand", imagePath: "/QR/QRSCANTEMPLATE5.jpg", qrSlot: { x: 0.255, y: 0.49, size: 0.35, padding: 0.02 } },
];

const norm = (n: number, fallback: number) => Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;
const nStatus = (s?: string) => (s || "AVAILABLE").trim().toUpperCase() || "AVAILABLE";
const sLabel = (s?: string) => ({ RESERVED: "Reserved", OCCUPIED: "Occupied", BILLING: "Billing", AVAILABLE: "Available" }[nStatus(s)] ?? "Available");

function statusChipClass(s?: string) {
  const map: Record<string, string> = {
    RESERVED: "bg-violet-100 text-violet-700 border-violet-200",
    OCCUPIED: "bg-orange-100 text-orange-700 border-orange-200",
    BILLING: "bg-rose-100 text-rose-700 border-rose-200",
    AVAILABLE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  return map[nStatus(s)] ?? map.AVAILABLE;
}

function statusDotClass(s?: string) {
  const map: Record<string, string> = {
    RESERVED: "bg-violet-500",
    OCCUPIED: "bg-orange-500",
    BILLING: "bg-rose-500",
    AVAILABLE: "bg-emerald-500",
  };
  return map[nStatus(s)] ?? map.AVAILABLE;
}

function toDateTimeLocal(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function buildReservationPayload(form: ReservationFormState, customerId?: string) {
  const customerName = form.customerName.trim();
  const customerPhone = form.customerPhone.trim();
  const note = form.note.trim();
  const reservedFor = form.reservedFor ? new Date(form.reservedFor).toISOString() : undefined;
  if (!customerName && !customerPhone && !note && !reservedFor) return undefined;
  const payload: any = {
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    partySize: norm(form.partySize, 1),
    reservedFor,
    note: note || undefined,
  };
  if (customerId) payload.customerId = customerId;
  if (form.advanceRequired) {
    payload.advancePayment = {
      required: true,
      amount: form.advanceAmount || 0,
      paidAmount: form.advancePaidAmount || 0,
      method: form.advanceMethod || undefined,
      reference: form.advanceReference || undefined,
    };
  }
  return payload;
}

function qrSrc(qr: string, format: TableQrFormat): string | null {
  if (!qr.trim()) return null;
  if (qr.startsWith("data:image/")) return qr;
  if (format === "svg" && qr.includes("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
  if (format === "dataUrl") return `data:image/png;base64,${qr}`;
  return null;
}

function downloadHref(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.click();
}

function getTemplateById(id: QrTemplateId): QrTemplate {
  return QR_TEMPLATES.find((t) => t.id === id) || QR_TEMPLATES[0];
}

async function loadImageBySrc(src: string, errorMessage: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(errorMessage));
    image.src = src;
  });
}

async function downloadTemplateCard(args: { qr: string; format: TableQrFormat; fileBase: string; template: QrTemplate }) {
  const [qrImage, templateImage] = await Promise.all([
    loadImageBySrc(qrSrc(args.qr, args.format)!, "QR load failed"),
    loadImageBySrc(args.template.imagePath, "Template load failed"),
  ]);
  const canvas = document.createElement("canvas");
  const w = templateImage.naturalWidth || templateImage.width;
  const h = templateImage.naturalHeight || templateImage.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(templateImage, 0, 0, w, h);
  const slotSize = Math.min(w, h) * args.template.qrSlot.size;
  const x = w * args.template.qrSlot.x;
  const y = h * args.template.qrSlot.y;
  const pad = slotSize * args.template.qrSlot.padding;
  ctx.drawImage(qrImage, x + pad, y + pad, slotSize - pad * 2, slotSize - pad * 2);
  downloadHref(canvas.toDataURL("image/png"), `${args.fileBase.replace(/[^a-zA-Z0-9-_]/g, "_")}_${args.template.id}.png`);
}

// ─── Icon Components ────────────────────────────────────────────────────────
const QrIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>;
const EditIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
const TrashIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const ClockIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const CartIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M18 13l1.5 6M9 21h6" /></svg>;
const GridIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>;
const ListIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>;
const SearchIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const PlusIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
const XIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const ChairIcon = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;
const RefreshIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
const UserIcon = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;

// ─── Modal Wrapper ───────────────────────────────────────────────────────────
function Modal({ onClose, children, size = "md" }: { onClose: () => void; children: React.ReactNode; size?: "md" | "lg" | "xl" }) {
  const sizeClass = { md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 w-full ${sizeClass} max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl`}>
        {children}
      </div>
    </div>
  );
}

// ─── Field Components ────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all";
const selectCls = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all appearance-none";

// ─── Status Chip ─────────────────────────────────────────────────────────────
function StatusChip({ status, size = "sm" }: { status?: string; size?: "sm" | "xs" }) {
  const base = size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${base} ${statusChipClass(status)}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(status)}`} />
      {sLabel(status)}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function TablesWorkspace({ tenantName, tenantSlug }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [viewMode, setViewMode] = useState<TableListViewMode>("grid");
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reservationTable, setReservationTable] = useState<TableRecord | null>(null);
  const [editing, setEditing] = useState<TableRecord | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const queryArg = filter === "all" ? undefined : { isActive: filter === "active" };
  const { data, isLoading, isFetching, refetch } = useGetTablesQuery(queryArg);
  const { data: ordersData } = useGetOrdersQuery({ status: ["PLACED", "IN_PROGRESS", "READY", "SERVED"], limit: 200 });
  const { data: invoicesData } = useGetInvoicesQuery({ status: "ISSUED", limit: 200 });
  const { data: customersData } = useGetCustomersQuery({ limit: 50 });

  const [createTable, { isLoading: isCreating }] = useCreateTableMutation();
  const [updateTable, { isLoading: isUpdating }] = useUpdateTableMutation();
  const [deleteTable, { isLoading: isDeleting }] = useDeleteTableMutation();
  const [fetchQr, { isFetching: isQrFetching }] = useLazyGetTableQrQuery();

  const [createForm, setCreateForm] = useState({ number: 1, name: "", capacity: 4, isActive: true });
  const [editForm, setEditForm] = useState({ number: 1, name: "", capacity: 4, isActive: true, status: "AVAILABLE" as TableStatus });
  const [reservationForm, setReservationForm] = useState<ReservationFormState>({
    customerName: "", customerPhone: "", partySize: 2, reservedFor: "", note: "",
    advanceRequired: false, advanceAmount: 0, advancePaidAmount: 0, advanceMethod: "CASH", advanceReference: "",
  });
  const [qr, setQr] = useState<QrState>({
    open: false, table: null, format: "dataUrl", templateId: "template1",
    baseUrl: FRONTEND_QR_BASE_URL, qr: "", qrPayload: "", error: "",
  });

  const tables = useMemo(() => [...(data?.items || [])].sort((a, b) => a.number - b.number), [data?.items]);
  const maxNumber = useMemo(() => tables.reduce((m, t) => Math.max(m, t.number), 0), [tables]);
  const activeCount = tables.filter((t) => t.isActive).length;
  const reservedCount = tables.filter((t) => nStatus(t.status) === "RESERVED").length;
  const occupiedCount = tables.filter((t) => nStatus(t.status) === "OCCUPIED").length;
  const totalSeats = tables.reduce((sum, t) => sum + (t.capacity || 0), 0);

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => [t.number, t.name, t.capacity, nStatus(t.status)].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [search, tables]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customersData?.items || [];
    const s = customerSearch.toLowerCase();
    return (customersData?.items || []).filter((c) => c.name?.toLowerCase().includes(s) || c.phone?.toLowerCase().includes(s));
  }, [customerSearch, customersData?.items]);

  const invoiceCoveredOrderIds = useMemo(() => {
    const ids = new Set<string>();
    (invoicesData?.items || []).forEach((inv) => {
      if (inv.orderId) ids.add(inv.orderId);
      (inv.orderIds || []).forEach((id) => ids.add(id));
    });
    return ids;
  }, [invoicesData?.items]);

  const activeOrderCountByTable = useMemo(() => {
    const counts = new Map<string, number>();
    (ordersData?.items || []).forEach((order) => {
      const tableId = order.table?.id || order.tableId;
      if (!tableId || invoiceCoveredOrderIds.has(order.id)) return;
      if (!["PLACED", "IN_PROGRESS", "READY", "SERVED"].includes(nStatus(order.status))) return;
      counts.set(tableId, (counts.get(tableId) || 0) + 1);
    });
    return counts;
  }, [invoiceCoveredOrderIds, ordersData?.items]);

  const canOpenOrder = (t: TableRecord) => ["OCCUPIED", "BILLING"].includes(nStatus(t.status));
  const openOrder = (t: TableRecord) => router.push(`/dashboard/orders/items?tableId=${encodeURIComponent(t.id)}`);

  async function submitCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const number = norm(createForm.number, maxNumber + 1);
      await createTable({ number, name: createForm.name.trim() || `Table ${number}`, capacity: norm(createForm.capacity, 4), isActive: createForm.isActive }).unwrap();
      setCreateForm({ number: number + 1, name: "", capacity: 4, isActive: true });
      setCreateOpen(false);
      showSuccess(`Table ${number} created`);
    } catch (e) { showError(getErrorMessage(e)); }
  }

  function openEdit(t: TableRecord) {
    setEditing(t);
    setEditForm({ number: t.number, name: t.name, capacity: t.capacity, isActive: t.isActive, status: nStatus(t.status) as TableStatus });
  }

  async function submitUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    try {
      await updateTable({ tableId: editing.id, number: norm(editForm.number, editing.number), name: editForm.name.trim() || `Table ${editForm.number}`, capacity: norm(editForm.capacity, editing.capacity), isActive: editForm.isActive, status: nStatus(editForm.status) }).unwrap();
      showSuccess(`Table ${editForm.number} updated`);
      setEditing(null);
    } catch (e) { showError(getErrorMessage(e)); }
  }

  function openReservation(t: TableRecord) {
    setReservationTable(t);
    setReservationForm({ customerName: "", customerPhone: "", partySize: t.capacity || 2, reservedFor: "", note: "", advanceRequired: false, advanceAmount: 0, advancePaidAmount: 0, advanceMethod: "CASH", advanceReference: "" });
    setCustomerSearch("");
  }

  async function submitReservation() {
    if (!reservationTable) return;
    try {
      const payload = buildReservationPayload(reservationForm);
      await updateTable({ tableId: reservationTable.id, status: "RESERVED", reservation: payload }).unwrap();
      showSuccess(`Table ${reservationTable.number} reserved`);
      setReservationTable(null);
    } catch (e) { showError(getErrorMessage(e)); }
  }

  async function changeStatus(t: TableRecord, status: TableStatus) {
    try {
      await updateTable({ tableId: t.id, status, reservation: status !== "RESERVED" ? undefined : t.reservation }).unwrap();
      showSuccess(`Table ${t.number} → ${sLabel(status)}`);
    } catch (e) { showError(getErrorMessage(e)); }
  }

  async function removeTable(t: TableRecord) {
    const ok = await confirm({ title: "Delete Table", message: `Delete ${t.name}?`, confirmText: "Delete", cancelText: "Cancel", tone: "danger" });
    if (!ok) return;
    try {
      await deleteTable({ tableId: t.id }).unwrap();
      showSuccess(`Table ${t.number} deleted`);
    } catch (e) { showError(getErrorMessage(e)); }
  }

  const openQr = (t: TableRecord) => router.push(`/dashboard/tables/qr/${encodeURIComponent(t.id)}`);

  async function generateQr() {
    if (!qr.table) return;
    setQr((p) => ({ ...p, error: "" }));
    try {
      const r = await fetchQr({ tableId: qr.table.id, format: qr.format, baseUrl: FRONTEND_QR_BASE_URL }).unwrap();
      setQr((p) => ({ ...p, qr: r.qr, qrPayload: r.qrPayload, format: r.format }));
    } catch (e) { setQr((p) => ({ ...p, error: getErrorMessage(e) })); }
  }

  async function downloadQrTemplate() {
    if (!qr.table || !qr.qr) return;
    setDownloadingTemplate(true);
    try {
      await downloadTemplateCard({ qr: qr.qr, format: qr.format, fileBase: `table-${qr.table.number}`, template: getTemplateById(qr.templateId) });
    } catch (e) { setQr((p) => ({ ...p, error: getErrorMessage(e) })); }
    finally { setDownloadingTemplate(false); }
  }

  const qrPreview = qrSrc(qr.qr, qr.format);
  const selectedTemplate = getTemplateById(qr.templateId);

  // ─── Stats Bar ─────────────────────────────────────────────────────────────
  const stats = [
    { label: "Total", value: tables.length, color: "text-gray-900" },
    { label: "Active", value: activeCount, color: "text-emerald-600" },
    { label: "Reserved", value: reservedCount, color: "text-violet-600" },
    { label: "Occupied", value: occupiedCount, color: "text-orange-600" },
    { label: "Seats", value: totalSeats, color: "text-amber-600" },
  ];

  return (
    <>
      {/* ─── Page ─────────────────────────────────────────────────────────── */}
      <div className="min-h-screen bg-gray-50/80">
        {/* ─── Header ───────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div className="px-4 pt-4 pb-3 space-y-3">
            {/* Title row */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">Tables</h1>
                <p className="text-xs text-gray-400 mt-0.5">{tables.length} tables · {totalSeats} seats</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => refetch()} disabled={isFetching} className="h-9 w-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-all">
                  <RefreshIcon />
                </button>
                <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-sm font-semibold shadow-sm shadow-amber-200 transition-all">
                  <PlusIcon />
                  <span>Add Table</span>
                </button>
              </div>
            </div>

            {/* Stats scroll */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-0.5">
              {stats.map((s) => (
                <div key={s.label} className="flex-shrink-0 bg-gray-50 rounded-xl px-3.5 py-2 text-center min-w-[64px]">
                  <p className={`text-lg font-bold leading-tight ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Search + View toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tables…" className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all" />
              </div>
              <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
                <button onClick={() => setViewMode("grid")} className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all ${viewMode === "grid" ? "bg-white shadow text-amber-600" : "text-gray-400"}`}><GridIcon /></button>
                <button onClick={() => setViewMode("list")} className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all ${viewMode === "list" ? "bg-white shadow text-amber-600" : "text-gray-400"}`}><ListIcon /></button>
              </div>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {(["all", "active", "inactive"] as Filter[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`flex-shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold border transition-all capitalize ${filter === f ? "bg-amber-500 text-white border-amber-500 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                  {f === "all" ? `All (${tables.length})` : f === "active" ? `Active (${activeCount})` : `Inactive (${tables.length - activeCount})`}
                </button>
              ))}
              {/* Status filter chips */}
              {(["AVAILABLE", "RESERVED", "OCCUPIED", "BILLING"] as TableStatus[]).map((s) => {
                const cnt = tables.filter((t) => nStatus(t.status) === s).length;
                if (cnt === 0) return null;
                return (
                  <button key={s} onClick={() => setSearch(s.toLowerCase())} className="flex-shrink-0 h-8 px-3 rounded-full text-xs font-semibold border bg-white text-gray-600 border-gray-200 hover:border-gray-300 transition-all flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(s)}`} />
                    {sLabel(s)} ({cnt})
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── Content ─────────────────────────────────────────────────────── */}
        <div className="p-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <GridIcon />
              </div>
              <p className="text-gray-500 font-medium">No tables found</p>
              <p className="text-gray-400 text-sm mt-1">Try a different search or filter</p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredTables.map((table) => {
                const status = nStatus(table.status);
                const orderCount = activeOrderCountByTable.get(table.id) || 0;
                const isReserved = status === "RESERVED";
                const canOrder = canOpenOrder(table);

                return (
                  <div key={table.id} className={`relative bg-white rounded-2xl border transition-all hover:shadow-md group overflow-hidden ${!table.isActive ? "opacity-60" : ""} ${canOrder ? "border-amber-200 shadow-sm shadow-amber-50" : "border-gray-100"}`}>
                    {/* Top color strip */}
                    <div className={`h-1 w-full ${statusDotClass(status)}`} />

                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400">T{table.number}</span>
                            {canOrder ? (
                              <button onClick={() => openOrder(table)} className="text-sm font-bold text-gray-900 hover:text-amber-600 transition-colors truncate text-left">{table.name}</button>
                            ) : (
                              <span className="text-sm font-bold text-gray-900 truncate">{table.name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="flex items-center gap-1 text-xs text-gray-400"><ChairIcon />{table.capacity} seats</span>
                            {orderCount > 0 && <span className="text-xs font-semibold text-amber-600">{orderCount} order{orderCount > 1 ? "s" : ""}</span>}
                          </div>
                        </div>
                        <StatusChip status={status} />
                      </div>

                      {/* Reservation info */}
                      {isReserved && table.reservation?.customerName && (
                        <div className="mb-3 flex items-center gap-1.5 bg-violet-50 rounded-xl px-3 py-2">
                          <UserIcon />
                          <span className="text-xs font-medium text-violet-700 truncate">{table.reservation.customerName}</span>
                          {table.reservation.customerPhone && <span className="text-xs text-violet-500 ml-auto shrink-0">{table.reservation.customerPhone}</span>}
                        </div>
                      )}

                      {/* Action Chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {canOrder && (
                          <button onClick={() => openOrder(table)} className="flex items-center gap-1 h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-all active:scale-95">
                            <CartIcon /><span>Order</span>
                          </button>
                        )}

                        {/* Status action chip */}
                        {(status === "AVAILABLE" || status === "RESERVED") && (
                          <button onClick={() => changeStatus(table, "OCCUPIED")} disabled={isUpdating} className="h-8 px-3 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-semibold transition-all disabled:opacity-50">
                            Seat
                          </button>
                        )}
                        {(status === "OCCUPIED" || status === "BILLING") && (
                          <button onClick={() => changeStatus(table, "AVAILABLE")} disabled={isUpdating} className="h-8 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-semibold transition-all disabled:opacity-50">
                            Free
                          </button>
                        )}
                        {!isReserved && status !== "OCCUPIED" && status !== "BILLING" && (
                          <button onClick={() => openReservation(table)} className="flex items-center gap-1 h-8 px-3 rounded-xl bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-semibold transition-all">
                            <ClockIcon /><span>Reserve</span>
                          </button>
                        )}
                        {isReserved && (
                          <button onClick={() => changeStatus(table, "AVAILABLE")} disabled={isUpdating} className="h-8 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold transition-all disabled:opacity-50">
                            Cancel
                          </button>
                        )}

                        {/* Icon actions */}
                        <div className="ml-auto flex gap-1">
                          <button onClick={() => openQr(table)} className="h-8 w-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all" title="QR Code"><QrIcon /></button>
                          <button onClick={() => openEdit(table)} className="h-8 w-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all" title="Edit"><EditIcon /></button>
                          <button onClick={() => removeTable(table)} disabled={isDeleting} className="h-8 w-8 rounded-xl border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-50" title="Delete"><TrashIcon /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── List View ─────────────────────────────────────────────────── */
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Table</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Seats</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Orders</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredTables.map((table) => {
                      const status = nStatus(table.status);
                      const orderCount = activeOrderCountByTable.get(table.id) || 0;
                      const canOrder = canOpenOrder(table);
                      return (
                        <tr key={table.id} className={`hover:bg-gray-50/50 transition-colors ${!table.isActive ? "opacity-60" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass(status)}`} />
                              <div>
                                <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                                  <span className="text-gray-400 text-xs">T{table.number}</span>
                                  {canOrder ? (
                                    <button onClick={() => openOrder(table)} className="hover:text-amber-600 transition-colors">{table.name}</button>
                                  ) : <span>{table.name}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><StatusChip status={status} size="xs" /></td>
                          <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{table.capacity}</td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {orderCount > 0 ? <span className="text-xs font-semibold text-amber-600">{orderCount} active</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {canOrder && <button onClick={() => openOrder(table)} className="h-7 px-2.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-semibold transition-all">Order</button>}
                              {(status === "AVAILABLE" || status === "RESERVED") && <button onClick={() => changeStatus(table, "OCCUPIED")} disabled={isUpdating} className="h-7 px-2.5 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-semibold transition-all disabled:opacity-50">Seat</button>}
                              {(status === "OCCUPIED" || status === "BILLING") && <button onClick={() => changeStatus(table, "AVAILABLE")} disabled={isUpdating} className="h-7 px-2.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-semibold transition-all disabled:opacity-50">Free</button>}
                              {status === "AVAILABLE" && <button onClick={() => openReservation(table)} className="h-7 px-2.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-semibold transition-all">Reserve</button>}
                              <button onClick={() => openEdit(table)} className="h-7 w-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-all"><EditIcon /></button>
                              <button onClick={() => openQr(table)} className="h-7 w-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-all"><QrIcon /></button>
                              <button onClick={() => removeTable(table)} disabled={isDeleting} className="h-7 w-7 rounded-lg border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50 transition-all disabled:opacity-50"><TrashIcon /></button>
                            </div>
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
      </div>

      {/* ─── Create Table Modal ─────────────────────────────────────────────── */}
      {createOpen && (
        <Modal onClose={() => setCreateOpen(false)}>
          <div className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest">New Table</p>
                <h2 className="text-xl font-bold text-gray-900 mt-0.5">Add Table</h2>
              </div>
              <button onClick={() => setCreateOpen(false)} className="h-9 w-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-all"><XIcon /></button>
            </div>
            <form onSubmit={submitCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Table Number">
                  <input type="number" min={1} value={createForm.number} onChange={(e) => setCreateForm((p) => ({ ...p, number: norm(Number(e.target.value), 1) }))} className={inputCls} required />
                </Field>
                <Field label="Capacity (seats)">
                  <input type="number" min={1} value={createForm.capacity} onChange={(e) => setCreateForm((p) => ({ ...p, capacity: norm(Number(e.target.value), 4) }))} className={inputCls} required />
                </Field>
              </div>
              <Field label="Name (optional)">
                <input type="text" value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} placeholder={`Table ${createForm.number}`} className={inputCls} />
              </Field>
              <label className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors">
                <input type="checkbox" checked={createForm.isActive} onChange={(e) => setCreateForm((p) => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Active Table</p>
                  <p className="text-xs text-gray-400">Visible and usable in operations</p>
                </div>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">Cancel</button>
                <button type="submit" disabled={isCreating} className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-sm font-semibold shadow-sm shadow-amber-200 transition-all disabled:opacity-50">
                  {isCreating ? "Creating…" : "Create Table"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ─── Edit Table Modal ───────────────────────────────────────────────── */}
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <div className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest">Editing</p>
                <h2 className="text-xl font-bold text-gray-900 mt-0.5">{editing.name}</h2>
              </div>
              <button onClick={() => setEditing(null)} className="h-9 w-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-all"><XIcon /></button>
            </div>
            <form onSubmit={submitUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Table Number">
                  <input type="number" min={1} value={editForm.number} onChange={(e) => setEditForm((p) => ({ ...p, number: norm(Number(e.target.value), p.number) }))} className={inputCls} />
                </Field>
                <Field label="Capacity">
                  <input type="number" min={1} value={editForm.capacity} onChange={(e) => setEditForm((p) => ({ ...p, capacity: norm(Number(e.target.value), p.capacity) }))} className={inputCls} />
                </Field>
              </div>
              <Field label="Name">
                <input type="text" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Status">
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setEditForm((p) => ({ ...p, status: opt.value }))}
                      className={`h-8 px-3.5 rounded-xl text-xs font-semibold border transition-all ${editForm.status === opt.value ? `${statusChipClass(opt.value)} ring-2 ring-offset-1 ring-current` : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors">
                <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Active Table</p>
                  <p className="text-xs text-gray-400">{editForm.isActive ? "Table is live" : "Table is hidden"}</p>
                </div>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">Cancel</button>
                <button type="submit" disabled={isUpdating} className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-sm font-semibold shadow-sm shadow-amber-200 transition-all disabled:opacity-50">
                  {isUpdating ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ─── Reservation Modal ──────────────────────────────────────────────── */}
      {reservationTable && (
        <Modal onClose={() => setReservationTable(null)} size="lg">
          <div className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest">Reservation</p>
                <h2 className="text-xl font-bold text-gray-900 mt-0.5">Table {reservationTable.number} · {reservationTable.name}</h2>
              </div>
              <button onClick={() => setReservationTable(null)} className="h-9 w-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-all"><XIcon /></button>
            </div>

            <div className="space-y-4">
              {/* Customer search */}
              <Field label="Customer">
                <div className="relative">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); setReservationForm((p) => ({ ...p, customerName: e.target.value })); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                    placeholder="Search or enter customer name…"
                    className={inputCls}
                  />
                  {showCustomerDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-44 overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-xl">
                      {filteredCustomers.map((c) => (
                        <button key={c.id} type="button" onMouseDown={() => { setReservationForm((p) => ({ ...p, customerName: c.name || "", customerPhone: c.phone || "" })); setCustomerSearch(c.name || ""); setShowCustomerDropdown(false); }} className="w-full px-4 py-2.5 text-left hover:bg-amber-50 transition-colors flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-gray-900">{c.name}</span>
                          <span className="text-xs text-gray-400">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input type="tel" value={reservationForm.customerPhone} onChange={(e) => setReservationForm((p) => ({ ...p, customerPhone: sanitizePhone(e.target.value) }))} placeholder="9876543210" maxLength={10} className={inputCls} />
                </Field>
                <Field label="Party Size">
                  <input type="number" min={1} value={reservationForm.partySize} onChange={(e) => setReservationForm((p) => ({ ...p, partySize: norm(Number(e.target.value), 1) }))} className={inputCls} />
                </Field>
              </div>

              <Field label="Reservation Time">
                <input type="datetime-local" value={reservationForm.reservedFor} onChange={(e) => setReservationForm((p) => ({ ...p, reservedFor: e.target.value }))} className={inputCls} />
              </Field>

              <Field label="Notes">
                <textarea value={reservationForm.note} onChange={(e) => setReservationForm((p) => ({ ...p, note: e.target.value }))} rows={2} placeholder="Special requests, preferences…" className={`${inputCls} resize-none`} />
              </Field>

              {/* Advance payment */}
              <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={reservationForm.advanceRequired} onChange={(e) => setReservationForm((p) => ({ ...p, advanceRequired: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-400" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Advance Payment</p>
                    <p className="text-xs text-gray-400">Collect deposit for this reservation</p>
                  </div>
                </label>
                {reservationForm.advanceRequired && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Total Amount">
                        <input type="number" min={0} value={reservationForm.advanceAmount || ""} onFocus={(e) => e.target.select()} onChange={(e) => setReservationForm((p) => ({ ...p, advanceAmount: Math.max(0, Number(e.target.value)) }))} placeholder="0" className={inputCls} />
                      </Field>
                      <Field label="Paid Amount">
                        <input type="number" min={0} value={reservationForm.advancePaidAmount || ""} onFocus={(e) => e.target.select()} onChange={(e) => setReservationForm((p) => ({ ...p, advancePaidAmount: Math.max(0, Number(e.target.value)) }))} placeholder="0" className={inputCls} />
                      </Field>
                    </div>
                    <Field label="Payment Method">
                      <div className="flex gap-2">
                        {["CASH", "UPI", "CARD"].map((m) => (
                          <button key={m} type="button" onClick={() => setReservationForm((p) => ({ ...p, advanceMethod: m }))}
                            className={`flex-1 h-9 rounded-xl text-xs font-semibold border transition-all ${reservationForm.advanceMethod === m ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Reference / Transaction ID">
                      <input type="text" value={reservationForm.advanceReference} onChange={(e) => setReservationForm((p) => ({ ...p, advanceReference: e.target.value }))} placeholder="UPI ref, transaction ID…" className={inputCls} />
                    </Field>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setReservationTable(null)} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all">Cancel</button>
                <button type="button" onClick={submitReservation} disabled={isUpdating} className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-95 text-white text-sm font-semibold shadow-sm shadow-violet-200 transition-all disabled:opacity-50">
                  {isUpdating ? "Saving…" : "Confirm Reservation"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}