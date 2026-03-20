"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/confirm-provider";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import {
  useCreateTableMutation,
  useCreateTableQrTokenMutation,
  useDeleteTableMutation,
  useGetTablesQuery,
  useLazyGetTableQrQuery,
  useUpdateTableMutation,
} from "@/store/api/tablesApi";
import type {
  TableQrFormat,
  TableRecord,
  TableStatus,
} from "@/store/types/tables";

type Props = { tenantName?: string; tenantSlug?: string };
type Filter = "all" | "active" | "inactive";
type TableListViewMode = "grid" | "table";
type QrMode = "static" | "token";
type QrTemplateId = "template1" | "template2";

type FormState = {
  number: number;
  name: string;
  capacity: number;
  isActive: boolean;
  status: TableStatus;
  customerId: string;
};

type QrState = {
  open: boolean;
  table: TableRecord | null;
  mode: QrMode;
  format: TableQrFormat;
  templateId: QrTemplateId;
  baseUrl: string;
  expiresInHours: number;
  qr: string;
  qrPayload: string;
  token: string;
  error: string;
};

type QrTemplate = {
  id: QrTemplateId;
  name: string;
  description: string;
  imagePath: string;
  qrSlot: {
    x: number;
    y: number;
    size: number;
    padding: number;
  };
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
  {
    id: "template1",
    name: "Template 1",
    description: "Classic table placard",
    imagePath: "/QR/Template1.png",
    qrSlot: {
      x: 0.361,
      y: 0.361,
      size: 0.276,
      padding: 0.05,
    },
  },
  {
    id: "template2",
    name: "Template 2",
    description: "Modern menu standee",
    imagePath: "/QR/Template2.png",
    qrSlot: {
      x: 0.361,
      y: 0.405,
      size: 0.276,
      padding: 0.05,
    },
  },
];

const norm = (n: number, fallback: number) =>
  Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;
const nStatus = (s?: string) =>
  (s || "AVAILABLE").trim().toUpperCase() || "AVAILABLE";
const sLabel = (s?: string) =>
  nStatus(s) === "RESERVED"
    ? "Reserved"
    : nStatus(s) === "OCCUPIED"
      ? "Occupied"
      : nStatus(s) === "BILLING"
        ? "Billing"
        : nStatus(s) === "AVAILABLE"
          ? "Available"
          : nStatus(s);
const sClass = (s?: string) =>
  nStatus(s) === "RESERVED"
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : nStatus(s) === "OCCUPIED"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : nStatus(s) === "BILLING"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : nStatus(s) === "AVAILABLE"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-300 bg-slate-100 text-slate-700";

function qrSrc(qr: string, format: TableQrFormat): string | null {
  if (!qr.trim()) return null;
  if (qr.startsWith("data:image/")) return qr;
  if (format === "svg" && qr.includes("<svg"))
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
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
  return (
    QR_TEMPLATES.find((template) => template.id === id) || QR_TEMPLATES[0]
  );
}

function defaultQrBaseUrl(): string {
  return FRONTEND_QR_BASE_URL;
}

function resolveQrBaseUrl(baseUrl: string): string {
  const candidate = baseUrl.trim();
  const fallback = defaultQrBaseUrl();
  if (!candidate) return fallback;
  if (candidate.startsWith(FRONTEND_PUBLIC_URL)) return candidate;
  return fallback;
}

function normalizePayloadUrl(payload: string, baseUrl: string): string {
  const raw = payload.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.origin === FRONTEND_PUBLIC_URL) {
        const hasQrParams =
          url.searchParams.has("token") ||
          url.searchParams.has("tenantSlug") ||
          url.searchParams.has("tableId") ||
          url.searchParams.has("tableNumber");
        const isQrPublicPath =
          url.pathname === "/qr" ||
          (url.pathname !== "/" &&
            url.pathname !== "/login" &&
            url.pathname !== "/dashboard" &&
            url.pathname !== "/register" &&
            url.pathname !== "/plan");
        if (hasQrParams && !isQrPublicPath) {
          const query = url.searchParams.toString();
          return query
            ? `${FRONTEND_QR_BASE_URL}?${query}`
            : FRONTEND_QR_BASE_URL;
        }
      }
      return url.toString();
    } catch {
      return raw;
    }
  }
  const resolvedBase = resolveQrBaseUrl(baseUrl);
  if (raw.startsWith("?")) return `${resolvedBase}${raw}`;
  if (raw.includes("=") && !raw.includes(" ")) {
    return `${resolvedBase}?${raw.replace(/^\?/, "")}`;
  }
  try {
    return new URL(raw, FRONTEND_PUBLIC_URL).toString();
  } catch {
    return raw;
  }
}

async function loadImageBySrc(src: string, errorMessage: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(errorMessage));
    image.src = src;
  });
}

async function loadQrImage(qr: string, format: TableQrFormat) {
  const src = qrSrc(qr, format);
  if (!src) throw new Error("QR not ready");
  return loadImageBySrc(src, "Failed to load QR image");
}

async function loadTemplateImage(imagePath: string) {
  return loadImageBySrc(imagePath, "Failed to load template image");
}

function getQrSlotRect(template: QrTemplate, width: number, height: number) {
  const slotSize = Math.min(width, height) * template.qrSlot.size;
  const x = width * template.qrSlot.x;
  const y = height * template.qrSlot.y;
  const padding = slotSize * template.qrSlot.padding;
  return { x, y, slotSize, padding };
}

async function downloadTemplateCard(args: {
  qr: string;
  format: TableQrFormat;
  fileBase: string;
  template: QrTemplate;
}) {
  const [qrImage, templateImage] = await Promise.all([
    loadQrImage(args.qr, args.format),
    loadTemplateImage(args.template.imagePath),
  ]);
  const canvas = document.createElement("canvas");
  const width = templateImage.naturalWidth || templateImage.width;
  const height = templateImage.naturalHeight || templateImage.height;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(templateImage, 0, 0, width, height);
  const slot = getQrSlotRect(args.template, width, height);
  const qrSize = slot.slotSize - slot.padding * 2;
  ctx.drawImage(
    qrImage,
    slot.x + slot.padding,
    slot.y + slot.padding,
    qrSize,
    qrSize,
  );

  const safe = args.fileBase.replace(/[^a-zA-Z0-9-_]/g, "_");
  downloadHref(canvas.toDataURL("image/png"), `${safe}_${args.template.id}.png`);
}
function shouldRefreshQrPayload(payload?: string): boolean {
  if (!payload?.trim()) return false;
  const raw = payload.trim();
  if (/\/api\/public\/menu(?:\?|$)/i.test(raw)) return true;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.origin !== FRONTEND_PUBLIC_URL) return true;
      const hasQrParams =
        url.searchParams.has("token") ||
        url.searchParams.has("tenantSlug") ||
        url.searchParams.has("tableId") ||
        url.searchParams.has("tableNumber");
      const hasToken = url.searchParams.has("token");
      const hasLegacyStaticParams =
        url.searchParams.has("tenantSlug") ||
        url.searchParams.has("tableId") ||
        url.searchParams.has("tableNumber");
      if (hasLegacyStaticParams && !hasToken) {
        return true;
      }
      if (
        hasQrParams &&
        (url.pathname === "/" ||
          url.pathname === "/login" ||
          url.pathname === "/dashboard" ||
          url.pathname === "/register" ||
          url.pathname === "/plan")
      ) {
        return true;
      }
      return false;
    } catch {
      return true;
    }
  }
  return false;
}

export function TablesWorkspace({ tenantName, tenantSlug }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false);
  const [tableListViewMode, setTableListViewMode] =
    useState<TableListViewMode>("grid");
  const [searchText, setSearchText] = useState("");
  const queryArg =
    filter === "all" ? undefined : { isActive: filter === "active" };
  const { data, isLoading, isFetching, refetch } = useGetTablesQuery(queryArg);
  const [createTable, { isLoading: isCreating }] = useCreateTableMutation();
  const [updateTable, { isLoading: isUpdating }] = useUpdateTableMutation();
  const [deleteTable, { isLoading: isDeleting }] = useDeleteTableMutation();
  const [fetchQr, { isFetching: isQrFetching }] = useLazyGetTableQrQuery();
  const [createQrToken, { isLoading: isQrTokenLoading }] =
    useCreateTableQrTokenMutation();

  const tables = useMemo(
    () => [...(data?.items || [])].sort((a, b) => a.number - b.number),
    [data?.items],
  );
  const maxNumber = useMemo(
    () => tables.reduce((m, t) => Math.max(m, t.number), 0),
    [tables],
  );
  const activeCount = tables.filter((t) => t.isActive).length;
  const reservedCount = tables.filter(
    (t) => nStatus(t.status) === "RESERVED",
  ).length;
  const totalSeats = tables.reduce((sum, t) => sum + (t.capacity || 0), 0);
  const filteredTables = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((table) => {
      const content = [
        table.number,
        table.name,
        table.customerId,
        table.capacity,
        nStatus(table.status),
      ]
        .filter((value) => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase();
      return content.includes(q);
    });
  }, [searchText, tables]);

  function canOpenOrder(table: TableRecord): boolean {
    const status = nStatus(table.status);
    return status === "OCCUPIED" || status === "BILLING";
  }

  function openTableOrder(table: TableRecord) {
    router.push(`/dashboard/orders?tableId=${encodeURIComponent(table.id)}`);
  }

  const [createForm, setCreateForm] = useState<FormState>({
    number: 1,
    name: "",
    capacity: 4,
    isActive: true,
    status: "AVAILABLE",
    customerId: "",
  });
  const [editing, setEditing] = useState<TableRecord | null>(null);
  const [editForm, setEditForm] = useState<FormState>({
    number: 1,
    name: "",
    capacity: 4,
    isActive: true,
    status: "AVAILABLE",
    customerId: "",
  });
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [sharingQrLink, setSharingQrLink] = useState(false);
  const defaultTemplate = QR_TEMPLATES[0];

  const [qr, setQr] = useState<QrState>({
    open: false,
    table: null,
    mode: "token",
    format: "dataUrl",
    templateId: defaultTemplate.id,
    baseUrl: defaultQrBaseUrl(),
    expiresInHours: 720,
    qr: "",
    qrPayload: "",
    token: "",
    error: "",
  });

  const preview = qrSrc(qr.qr, qr.format);
  const qrBusy = isQrFetching || isQrTokenLoading;
  const selectedTemplate = getTemplateById(qr.templateId);
  const qrPayloadUrl = normalizePayloadUrl(qr.qrPayload, qr.baseUrl);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const number = norm(createForm.number, maxNumber + 1);
      await createTable({
        number,
        name: createForm.name.trim() || `Table ${number}`,
        capacity: norm(createForm.capacity, 4),
        isActive: createForm.isActive,
      }).unwrap();
      setCreateForm((prev) => ({
        ...prev,
        number: number + 1,
        name: `Table ${number + 1}`,
      }));
      setIsCreateTableOpen(false);
      showSuccess(`Table ${number} created`);
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  function openEdit(table: TableRecord) {
    setEditing(table);
    setEditForm({
      number: table.number,
      name: table.name,
      capacity: table.capacity,
      isActive: table.isActive,
      status: nStatus(table.status),
      customerId: table.customerId || "",
    });
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    try {
      const status = nStatus(editForm.status);
      await updateTable({
        tableId: editing.id,
        number: norm(editForm.number, editing.number),
        name: editForm.name.trim() || `Table ${editForm.number}`,
        capacity: norm(editForm.capacity, editing.capacity),
        isActive: editForm.isActive,
        status,
        customerId: status === "RESERVED" ? editForm.customerId.trim() : "",
      }).unwrap();
      showSuccess(`Table ${editForm.number} updated`);
      setEditing(null);
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function quickStatus(table: TableRecord, nextStatus: TableStatus) {
    let customerId = table.customerId || "";
    if (nStatus(nextStatus) === "RESERVED" && !customerId.trim()) {
      const value = window.prompt("Enter customer id for reservation");
      if (value === null) return;
      customerId = value.trim();
      if (!customerId) {
        showError("Customer id is required for RESERVED status");
        return;
      }
    }
    try {
      await updateTable({
        tableId: table.id,
        status: nStatus(nextStatus),
        customerId: nStatus(nextStatus) === "RESERVED" ? customerId : "",
      }).unwrap();
      showSuccess(`Table ${table.number} marked ${sLabel(nextStatus)}`);
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function removeTable(table: TableRecord) {
    const approved = await confirm({
      title: "Delete Table",
      message: `Delete ${table.name}? This action removes the table record from your restaurant setup.`,
      confirmText: "Delete Table",
      cancelText: "Keep Table",
      tone: "danger",
    });
    if (!approved) return;
    try {
      await deleteTable({ tableId: table.id }).unwrap();
      showSuccess(`Table ${table.number} deleted`);
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function openQr(table: TableRecord) {
    const baseUrl = defaultQrBaseUrl();
    const template = QR_TEMPLATES[0];
    const shouldRefresh =
      !table.qrCode || shouldRefreshQrPayload(table.qrPayload);

    setQr({
      open: true,
      table,
      mode: "token",
      format: table.qrFormat || "dataUrl",
      templateId: template.id,
      baseUrl,
      expiresInHours: 720,
      qr: table.qrCode || "",
      qrPayload: table.qrPayload || "",
      token: "",
      error: "",
    });

    if (!shouldRefresh) return;

    try {
      const r = await createQrToken({
        tableId: table.id,
        format: table.qrFormat || "dataUrl",
        baseUrl,
        expiresInHours: 720,
      }).unwrap();

      setQr((prev) => ({
        ...prev,
        qr: r.qr,
        qrPayload: r.qrPayload,
        token: r.token,
        format: r.format,
      }));
    } catch (e) {
      setQr((prev) => ({ ...prev, error: getErrorMessage(e) }));
    }
  }

  async function generateQr() {
    if (!qr.table) return;
    const baseUrl = resolveQrBaseUrl(qr.baseUrl);
    setQr((prev) => ({ ...prev, error: "", baseUrl }));
    try {
      if (qr.mode === "token") {
        const r = await createQrToken({
          tableId: qr.table.id,
          format: qr.format,
          baseUrl,
          expiresInHours: norm(qr.expiresInHours, 720),
        }).unwrap();
        return setQr((prev) => ({
          ...prev,
          qr: r.qr,
          qrPayload: r.qrPayload,
          token: r.token,
          format: r.format,
          baseUrl,
        }));
      }
      const r = await fetchQr({
        tableId: qr.table.id,
        format: qr.format,
        baseUrl,
      }).unwrap();
      setQr((prev) => ({
        ...prev,
        qr: r.qr,
        qrPayload: r.qrPayload,
        token: "",
        format: r.format,
        baseUrl,
      }));
    } catch (e) {
      setQr((prev) => ({ ...prev, error: getErrorMessage(e) }));
    }
  }

  function applyTemplate(templateId: QrTemplateId) {
    setQr((prev) => ({
      ...prev,
      templateId,
    }));
  }

  async function downloadActiveTemplate() {
    if (!qr.table || !qr.qr) return;
    setDownloadingTemplate(true);
    try {
      await downloadTemplateCard({
        qr: qr.qr,
        format: qr.format,
        fileBase: `table-${qr.table.number}-${qr.mode}`,
        template: selectedTemplate,
      });
    } catch (e) {
      setQr((prev) => ({ ...prev, error: getErrorMessage(e) }));
    } finally {
      setDownloadingTemplate(false);
    }
  }

  function openQrLink() {
    if (!qrPayloadUrl) {
      showError("Generate QR first");
      return;
    }
    window.open(qrPayloadUrl, "_blank", "noopener,noreferrer");
  }

  async function shareQrLink() {
    if (!qrPayloadUrl) {
      showError("Generate QR first");
      return;
    }
    setSharingQrLink(true);
    try {
      const title = `${qr.table?.name || "Table"} Menu QR`;
      const text = `Scan this QR to open menu for ${qr.table?.name || "table"}`;
      if (navigator.share) {
        await navigator.share({ title, text, url: qrPayloadUrl });
        showSuccess("QR link shared");
        return;
      }
      if (!navigator.clipboard) {
        throw new Error("Share not supported on this browser");
      }
      await navigator.clipboard.writeText(qrPayloadUrl);
      showSuccess("QR link copied");
    } catch (e) {
      setQr((prev) => ({ ...prev, error: getErrorMessage(e) }));
    } finally {
      setSharingQrLink(false);
    }
  }
  return (
    <>
      <section className="mt-1 grid gap-3 sm:mt-2 sm:gap-4">
        {isCreateTableOpen ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6">
            <button
              type="button"
              aria-label="Close create table panel"
              className="absolute inset-0 bg-slate-900/35"
              onClick={() => setIsCreateTableOpen(false)}
            />
            <article className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#e6dfd1] bg-[#fffdf9] p-3 shadow-2xl sm:p-5">
              <div className="mb-3 flex items-center justify-between sm:mb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Quick Add
                  </p>
                  <h4 className="text-lg font-semibold text-slate-900">
                    Add Table
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateTableOpen(false)}
                  className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-lg leading-none text-slate-700"
                  aria-label="Close popup"
                >
                  x
                </button>
              </div>
              <form onSubmit={submitCreate} className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="number"
                    min={1}
                    value={createForm.number}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        number: norm(Number(event.target.value), 1),
                      }))
                    }
                    className="h-11 rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                    placeholder="Number"
                  />
                  <input
                    type="number"
                    min={1}
                    value={createForm.capacity}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        capacity: norm(Number(event.target.value), 4),
                      }))
                    }
                    className="h-11 rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                    placeholder="Capacity"
                  />
                </div>
                <input
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  placeholder={`Table ${createForm.number}`}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={createForm.isActive}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          isActive: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-amber-500"
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setCreateForm((prev) => ({
                        ...prev,
                        number: maxNumber + 1,
                        name: `Table ${maxNumber + 1}`,
                      }))
                    }
                    className="h-11 rounded-xl border border-[#e0d8c9] bg-white px-3 text-xs font-semibold text-slate-700"
                  >
                    Use Next
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 disabled:opacity-60"
                >
                  {isCreating ? "Adding..." : "Add Table"}
                </button>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl border border-[#ebdfc8] bg-white p-2">
                    <p className="text-slate-500">Tables</p>
                    <p className="mt-1 text-base font-semibold">
                      {tables.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#ebdfc8] bg-white p-2">
                    <p className="text-slate-500">Reserved</p>
                    <p className="mt-1 text-base font-semibold">
                      {reservedCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#ebdfc8] bg-white p-2">
                    <p className="text-slate-500">Seats</p>
                    <p className="mt-1 text-base font-semibold">{totalSeats}</p>
                  </div>
                </div>
              </form>
            </article>
          </div>
        ) : null}

        <article className="min-w-0 rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
          <div className="border-b border-[#eee7d8] px-2.5 py-2.5 sm:px-4 sm:py-3">
            <div className="mt-2.5 rounded-xl border border-[#eadfc9] bg-[#fffaf1] p-2.5 sm:mt-3 sm:p-3">
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 flex-col items-center leading-none">
                  <span className="text-lg font-bold text-slate-700">
                    {isLoading ? "..." : filteredTables.length}
                  </span>
                  <span className="text-[10px] font-medium text-slate-700">
                    tables
                  </span>
                </div>
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search..."
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[#dcccaf] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                />
                <div className="flex shrink-0 items-center rounded-lg border border-[#dccfb8] bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setTableListViewMode("grid")}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                      tableListViewMode === "grid"
                        ? "bg-[#f6ead4] text-[#7a5a34]"
                        : "text-slate-600"
                    }`}
                  >
                    ⊞
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableListViewMode("table")}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                      tableListViewMode === "table"
                        ? "bg-[#f6ead4] text-[#7a5a34]"
                        : "text-slate-600"
                    }`}
                  >
                    ☰
                  </button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-10 md:items-center">
                <div className="md:col-span-7">
                  <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar">
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                        filter === "all"
                          ? "border-amber-300 bg-amber-100 text-amber-800"
                          : "border-[#ddcfb7] bg-white text-slate-700"
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("active")}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                        filter === "active"
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                          : "border-[#ddcfb7] bg-white text-slate-700"
                      }`}
                    >
                      Active {activeCount}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("inactive")}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                        filter === "inactive"
                          ? "border-slate-300 bg-slate-100 text-slate-700"
                          : "border-[#ddcfb7] bg-white text-slate-700"
                      }`}
                    >
                      Inactive {tables.length - activeCount}
                    </button>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <div className="flex items-center justify-start gap-2 md:justify-end">
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {isFetching ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateTableOpen(true)}
                className="mt-3 w-full rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 shadow-sm transition-all hover:border-amber-400 hover:bg-amber-100 hover:shadow-md active:scale-[0.98]"
              >
                + Add Table
              </button>
            </div>
          </div>

          <div className="p-2.5 sm:p-4">
            {filteredTables.length ? (
              tableListViewMode === "grid" ? (
                <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                  {filteredTables.map((table) => {
                    const reserved = nStatus(table.status) === "RESERVED";
                    return (
                      <article
                        key={table.id}
                        className="rounded-2xl border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff7e8_100%)] p-2 shadow-sm sm:p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">
                              T{table.number}
                            </span>
                            {canOpenOrder(table) ? (
                              <button
                                type="button"
                                onClick={() => openTableOrder(table)}
                                className="mt-2 text-left text-base font-semibold text-amber-900 underline decoration-amber-300 underline-offset-2"
                              >
                                {table.name}
                              </button>
                            ) : (
                              <p className="mt-2 text-base font-semibold text-slate-900">
                                {table.name}
                              </p>
                            )}
                            <p className="text-xs text-slate-500">
                              {table.capacity} seats
                            </p>
                          </div>
                          <div className="space-y-1 text-right">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${sClass(table.status)}`}
                            >
                              {sLabel(table.status)}
                            </span>
                            <p className="text-[10px] text-slate-500">
                              {table.isActive
                                ? "Active Table"
                                : "Inactive Table"}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 rounded-lg border border-[#e8e1d4] bg-white px-2.5 py-2 text-[11px] text-slate-600">
                          {reserved
                            ? `Reserved by customer: ${table.customerId || "Not provided"}`
                            : "Tap Set Reserved to assign customer and block table."}
                        </p>
                        {canOpenOrder(table) ? (
                          <button
                            type="button"
                            onClick={() => openTableOrder(table)}
                            className="mt-2 w-full rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-200"
                          >
                            Open Order
                          </button>
                        ) : null}
                        <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-[#ece3d3] pt-2">
                          <button
                            type="button"
                            onClick={() => openQr(table)}
                            title="Open QR"
                            aria-label="Open QR"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d8ccb6] bg-white text-slate-700 transition-colors hover:bg-[#faf3e7]"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 3h7v7H3z" />
                              <path d="M14 3h7v7h-7z" />
                              <path d="M3 14h7v7H3z" />
                              <path d="M14 14h3v3h-3z" />
                              <path d="M21 14h-2v2h2v5h-5v-2" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(table)}
                            title="Edit table"
                            aria-label="Edit table"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d8ccb6] bg-white text-slate-700 transition-colors hover:bg-[#faf3e7]"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 20h9" />
                              <path d="m16.5 3.5 4 4L8 20H4v-4z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              quickStatus(
                                table,
                                reserved ? "AVAILABLE" : "RESERVED",
                              )
                            }
                            title={
                              reserved ? "Mark available" : "Mark reserved"
                            }
                            aria-label={
                              reserved ? "Mark available" : "Mark reserved"
                            }
                            disabled={isUpdating}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-60 ${
                              reserved
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border-slate-700 bg-slate-700 text-white hover:bg-slate-800"
                            }`}
                          >
                            {reserved ? (
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            ) : (
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                                <rect
                                  x="6"
                                  y="11"
                                  width="12"
                                  height="9"
                                  rx="2"
                                />
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTable(table)}
                            title="Remove table"
                            aria-label="Remove table"
                            disabled={isDeleting}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="m19 6-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                // <div className="no-scrollbar -mx-1 overflow-x-auto overscroll-x-contain px-1 sm:mx-0 sm:px-0">
                //   <table className="w-full min-w-[780px] divide-y divide-[#efe4d3] rounded-xl border border-[#eadfc9] bg-white text-left text-xs whitespace-nowrap sm:min-w-full">
                //     <thead className="bg-[#fff8ec]">
                //       <tr className="text-slate-700">
                //         <th className="px-2.5 py-2 font-semibold sm:px-3">Table</th>
                //         <th className="px-2.5 py-2 font-semibold sm:px-3">Capacity</th>
                //         <th className="px-2.5 py-2 font-semibold sm:px-3">Status</th>
                //         {/* <th className="px-2.5 py-2 font-semibold sm:px-3">Customer</th> */}
                //         <th className="px-2.5 py-2 font-semibold text-right sm:px-3">
                //           Actions
                //         </th>
                //       </tr>
                //     </thead>
                //     <tbody className="divide-y divide-[#f1e7d9] bg-white">
                //       {filteredTables.map((table) => {
                //         const reserved = nStatus(table.status) === "RESERVED";
                //         return (
                //           <tr key={`table-row-${table.id}`}>
                //             <td className="px-2.5 py-2 font-semibold text-slate-900 sm:px-3">
                //               {canOpenOrder(table) ? (
                //                 <button
                //                   type="button"
                //                   onClick={() => openTableOrder(table)}
                //                   className="text-left text-amber-900 underline decoration-amber-300 underline-offset-2"
                //                 >
                //                   T{table.number} - {table.name}
                //                 </button>
                //               ) : (
                //                 <span>T{table.number} - {table.name}</span>
                //               )}
                //             </td>
                //             <td className="px-2.5 py-2 text-slate-700 sm:px-3">
                //               {table.capacity}
                //             </td>
                //             <td className="px-2.5 py-2 sm:px-3">
                //               <span
                //                 className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sClass(table.status)}`}
                //               >
                //                 {sLabel(table.status)}
                //               </span>
                //             </td>
                //             {/* <td className="px-2.5 py-2 text-slate-700 sm:px-3">
                //               {table.customerId || "-"}
                //             </td> */}
                //             <td className="px-2.5 py-2 sm:px-3">
                //               <div className="flex justify-end gap-1.5">
                //                 {canOpenOrder(table) ? (
                //                   <button
                //                     type="button"
                //                     onClick={() => openTableOrder(table)}
                //                     className="rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-200"
                //                   >
                //                     Open Order
                //                   </button>
                //                 ) : null}
                //                 <button
                //                   type="button"
                //                   onClick={() => openQr(table)}
                //                   className="rounded-lg border border-[#d8ccb6] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-[#faf3e7]"
                //                 >
                //                   Open QR
                //                 </button>
                //                 <button
                //                   type="button"
                //                   onClick={() => openEdit(table)}
                //                   className="rounded-lg border border-[#d8ccb6] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-[#faf3e7]"
                //                 >
                //                   Edit
                //                 </button>
                //                 <button
                //                   type="button"
                //                   onClick={() =>
                //                     quickStatus(
                //                       table,
                //                       reserved ? "AVAILABLE" : "RESERVED",
                //                     )
                //                   }
                //                   disabled={isUpdating}
                //                   className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                //                     reserved
                //                       ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                //                       : "border-slate-700 bg-slate-700 text-white hover:bg-slate-800"
                //                   }`}
                //                 >
                //                   {reserved ? "Available" : "Reserve"}
                //                 </button>
                //                 <button
                //                   type="button"
                //                   onClick={() => removeTable(table)}
                //                   disabled={isDeleting}
                //                   className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
                //                 >
                //                   Remove
                //                 </button>
                //               </div>
                //             </td>
                //           </tr>
                //         );
                //       })}
                //     </tbody>
                //   </table>
                // </div>
                <div className="w-full overflow-x-auto no-scrollbar">
                  <table className="w-full min-w-[780px] sm:min-w-full border border-[#eadfc9] bg-white text-left text-xs">
                    <thead className="bg-[#fff8ec]">
                      <tr className="text-slate-700">
                        {/* 👇 auto width */}
                        <th className="px-2.5 py-2 font-semibold whitespace-nowrap sm:px-3">
                          Table
                        </th>

                        <th className="px-2.5 py-2 font-semibold whitespace-nowrap sm:px-3">
                          Capacity
                        </th>

                        <th className="px-2.5 py-2 font-semibold whitespace-nowrap sm:px-3">
                          Status
                        </th>

                        {/* 👇 auto shrink */}
                        <th className="px-2.5 py-2 font-semibold text-right whitespace-nowrap sm:px-3">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#f1e7d9]">
                      {filteredTables.map((table) => {
                        const reserved = nStatus(table.status) === "RESERVED";

                        return (
                          <tr key={`table-row-${table.id}`}>
                            {/* 👇 allow natural width */}
                            <td className="px-2.5 py-2 font-semibold text-slate-900 sm:px-3">
                              {canOpenOrder(table) ? (
                                <button
                                  type="button"
                                  onClick={() => openTableOrder(table)}
                                  className="text-left text-amber-900 underline decoration-amber-300 underline-offset-2"
                                >
                                  T{table.number} - {table.name}
                                </button>
                              ) : (
                                <span>
                                  T{table.number} - {table.name}
                                </span>
                              )}
                            </td>

                            <td className="px-2.5 py-2 text-slate-700 sm:px-3">
                              {table.capacity}
                            </td>

                            <td className="px-2.5 py-2 sm:px-3">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sClass(table.status)}`}
                              >
                                {sLabel(table.status)}
                              </span>
                            </td>

                            {/* 👇 important fix */}
                            <td className="px-2.5 py-2 sm:px-3">
                              <div className="flex justify-end gap-1.5 flex-nowrap">
                                {canOpenOrder(table) && (
                                  <button
                                    type="button"
                                    onClick={() => openTableOrder(table)}
                                    className="shrink-0 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-200"
                                  >
                                    Open Order
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => openQr(table)}
                                  className="shrink-0 rounded-lg border border-[#d8ccb6] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-[#faf3e7]"
                                >
                                  Open QR
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openEdit(table)}
                                  className="shrink-0 rounded-lg border border-[#d8ccb6] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-[#faf3e7]"
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    quickStatus(
                                      table,
                                      reserved ? "AVAILABLE" : "RESERVED",
                                    )
                                  }
                                  disabled={isUpdating}
                                  className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-60 ${
                                    reserved
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                      : "border-slate-700 bg-slate-700 text-white hover:bg-slate-800"
                                  }`}
                                >
                                  {reserved ? "Available" : "Reserve"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => removeTable(table)}
                                  disabled={isDeleting}
                                  className="shrink-0 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-4 py-10 text-center text-sm text-slate-600">
                No tables found for selected filters/search.
              </div>
            )}
          </div>
        </article>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setEditing(null)}
          />
          <aside className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#e6dfd1] bg-[#fffdf9] p-3 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between sm:mb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Quick Edit
                </p>
                <h4 className="text-lg font-semibold text-slate-900">
                  Update Table
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-lg leading-none text-slate-700"
                aria-label="Close popup"
              >
                x
              </button>
            </div>
            <form className="space-y-3" onSubmit={submitUpdate}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="number"
                  min={1}
                  value={editForm.number}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      number: norm(Number(event.target.value), prev.number),
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                />
                <input
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="number"
                  min={1}
                  value={editForm.capacity}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      capacity: norm(Number(event.target.value), prev.capacity),
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                />
                <select
                  value={nStatus(editForm.status)}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      status: nStatus(event.target.value),
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={editForm.customerId}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    customerId: event.target.value,
                  }))
                }
                placeholder="Customer id"
                className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        isActive: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-amber-500"
                  />
                  {editForm.isActive ? "Active" : "Inactive"}
                </label>
              </div>
              <button
                type="submit"
                disabled={isUpdating}
                className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isUpdating ? "Saving..." : "Save"}
              </button>
            </form>
          </aside>
        </div>
      ) : null}

      {qr.open && qr.table ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setQr((prev) => ({ ...prev, open: false }))}
          />
          <section className="absolute left-1/2 top-1/2 max-h-[94vh] w-[96%] max-w-6xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee7d8] bg-[#fff6e7] px-4 py-3">
              <div>
                <h4 className="text-sm font-semibold">{qr.table.name} QR Studio</h4>
                <p className="text-xs text-slate-600">
                  QR URL base fixed: {FRONTEND_QR_BASE_URL}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQr((prev) => ({ ...prev, open: false }))}
                className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1 text-xs font-semibold"
              >
                Close
              </button>
            </header>

            <div className="grid gap-4 p-4 xl:grid-cols-[1.08fr_1fr]">
              <div className="space-y-3 rounded-2xl border border-[#e8e0d0] bg-white p-4">
                <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-[#ece4d6] bg-white shadow-sm">
                  <div className="relative aspect-[1684/2528] w-full">
                    <Image
                      src={selectedTemplate.imagePath}
                      alt={`${selectedTemplate.name} preview`}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <div
                      className="absolute rounded-[6px] border border-slate-200/80 bg-white/85"
                      style={{
                        left: `${selectedTemplate.qrSlot.x * 100}%`,
                        top: `${selectedTemplate.qrSlot.y * 100}%`,
                        width: `${selectedTemplate.qrSlot.size * 100}%`,
                        height: `${selectedTemplate.qrSlot.size * 100}%`,
                      }}
                    >
                      {preview ? (
                        <div
                          className="absolute"
                          style={{
                            inset: `${selectedTemplate.qrSlot.padding * 100}%`,
                          }}
                        >
                          <Image
                            src={preview}
                            alt={`QR for ${qr.table.name}`}
                            fill
                            unoptimized
                            className="object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center px-1 text-center text-[10px] font-medium text-slate-500">
                          Generate QR
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={generateQr}
                    disabled={qrBusy}
                    className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {qrBusy ? "Generating..." : "Generate QR"}
                  </button>
                  <button
                    type="button"
                    onClick={downloadActiveTemplate}
                    disabled={!qr.qr || downloadingTemplate}
                    className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {downloadingTemplate
                      ? "Preparing..."
                      : `Download ${selectedTemplate.name}`}
                  </button>
                  <button
                    type="button"
                    onClick={openQrLink}
                    disabled={!qrPayloadUrl}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                  >
                    Open Link
                  </button>
                  <button
                    type="button"
                    onClick={shareQrLink}
                    disabled={!qrPayloadUrl || sharingQrLink}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-50"
                  >
                    {sharingQrLink ? "Sharing..." : "Share Link"}
                  </button>
                </div>

                {qrPayloadUrl ? (
                  <p className="rounded-lg border border-[#ece4d6] bg-[#fffaf3] px-2.5 py-2 text-[11px] text-slate-600">
                    {qrPayloadUrl}
                  </p>
                ) : null}
                <p className="text-[11px] text-slate-500">
                  {tenantName || tenantSlug || "Restaurant"} | Template:{" "}
                  {selectedTemplate.name}
                </p>
              </div>

              <div className="space-y-3 rounded-2xl border border-[#e8e0d0] bg-[#fffcf6] p-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQr((prev) => ({ ...prev, mode: "static" }))}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${qr.mode === "static" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}
                  >
                    Static
                  </button>
                  <button
                    type="button"
                    onClick={() => setQr((prev) => ({ ...prev, mode: "token" }))}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${qr.mode === "token" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600"}`}
                  >
                    Token
                  </button>
                </div>

                <select
                  value={qr.format}
                  onChange={(event) =>
                    setQr((prev) => ({
                      ...prev,
                      format: event.target.value as TableQrFormat,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                >
                  <option value="dataUrl">PNG</option>
                  <option value="svg">SVG</option>
                </select>

                <div className="rounded-lg border border-[#e5d7c0] bg-[#fff8ea] px-3 py-2 text-[11px] text-slate-600">
                  QR link always starts with {FRONTEND_PUBLIC_URL}
                </div>

                {qr.mode === "token" ? (
                  <input
                    type="number"
                    min={1}
                    value={qr.expiresInHours}
                    onChange={(event) =>
                      setQr((prev) => ({
                        ...prev,
                        expiresInHours: norm(Number(event.target.value), 720),
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                    placeholder="Token expiry in hours"
                  />
                ) : null}

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Templates
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {QR_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyTemplate(template.id)}
                        className={`rounded-xl border px-2.5 py-2 text-left ${qr.templateId === template.id ? "border-slate-700 bg-white" : "border-[#e4dccf] bg-[#fffaf2]"}`}
                      >
                        <div className="relative mb-2 aspect-[1684/2528] w-full overflow-hidden rounded-lg border border-[#e9e0d2] bg-white">
                          <Image
                            src={template.imagePath}
                            alt={`${template.name} thumbnail`}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                        </div>
                        <p className="text-xs font-semibold text-slate-800">
                          {template.name}
                        </p>
                        <p className="text-[11px] text-slate-500">{template.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {qr.token ? (
                  <p className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] text-blue-800">
                    Token: {qr.token}
                  </p>
                ) : null}
                {qr.error ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
                    {qr.error}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
