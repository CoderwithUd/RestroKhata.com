"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import { useConfirm } from "@/components/confirm-provider";
import { getErrorMessage } from "@/lib/error";
import { showError, showInfo, showSuccess } from "@/lib/feedback";
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
type QrMode = "static" | "token";

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
  baseUrl: string;
  expiresInHours: number;
  qr: string;
  qrPayload: string;
  token: string;
  labelText: string;
  bgColor: string;
  borderColor: string;
  labelColor: string;
  error: string;
};

const STATUS_OPTIONS: Array<{ value: TableStatus; label: string }> = [
  { value: "AVAILABLE", label: "Available" },
  { value: "RESERVED", label: "Reserved" },
  { value: "OCCUPIED", label: "Occupied" },
  { value: "BILLING", label: "Billing" },
];

const PRESETS = [
  { bgColor: "#fff7e9", borderColor: "#f59e0b", labelColor: "#7c2d12" },
  { bgColor: "#eef6ff", borderColor: "#2563eb", labelColor: "#1e3a8a" },
  { bgColor: "#eefcf5", borderColor: "#10b981", labelColor: "#065f46" },
  { bgColor: "#f9f0ff", borderColor: "#a855f7", labelColor: "#581c87" },
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

function rawDownload(qr: string, format: TableQrFormat, fileBase: string) {
  if (!qr.trim()) return;
  const safe = fileBase.replace(/[^a-zA-Z0-9-_]/g, "_");
  if (format === "svg" && !qr.startsWith("data:")) {
    const blob = new Blob([qr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    downloadHref(url, `${safe}.svg`);
    URL.revokeObjectURL(url);
    return;
  }
  downloadHref(
    qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`,
    `${safe}.${format === "svg" ? "svg" : "png"}`,
  );
}

async function styledDownload(args: {
  qr: string;
  format: TableQrFormat;
  fileBase: string;
  labelText: string;
  bgColor: string;
  borderColor: string;
  labelColor: string;
}) {
  const src = qrSrc(args.qr, args.format);
  console.log(src);
  if (!src) throw new Error("QR not ready");
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to load QR image"));
    i.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 980;
  canvas.height = 1220;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = args.bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = args.borderColor;
  ctx.fillRect(130, 130, 720, 720);
  ctx.fillStyle = "#fff";
  ctx.fillRect(150, 150, 680, 680);
  ctx.drawImage(img, 190, 190, 600, 600);
  ctx.fillStyle = args.labelColor;
  ctx.textAlign = "center";
  ctx.font = "700 56px ui-sans-serif, system-ui, -apple-system";
  ctx.fillText(args.labelText, 490, 955);
  ctx.font = "500 28px ui-sans-serif, system-ui, -apple-system";
  ctx.fillText("Scan to view menu", 490, 1005);
  const safe = args.fileBase.replace(/[^a-zA-Z0-9-_]/g, "_");
  downloadHref(canvas.toDataURL("image/png"), `${safe}_styled.png`);
}

// function defaultQrBaseUrl(): string {
//   if (typeof window === "undefined") return "";
//   return `${window.location.origin}/qr`;
// }
function defaultQrBaseUrl(): string {
  if (typeof window === "undefined") return "";

  // 🔥 production force
  if (window.location.hostname !== "localhost") {
    return "https://restro-khata-com.vercel.app/qr";
  }

  // local
  return "http://localhost:3000/qr";
}

function hasLegacyApiMenuPayload(payload?: string): boolean {
  if (!payload?.trim()) return false;
  return /\/api\/public\/menu(?:\?|$)/i.test(payload.trim());
}

export function TablesWorkspace({ tenantName, tenantSlug }: Props) {
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
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
  const [downloadingStyled, setDownloadingStyled] = useState(false);

  const [qr, setQr] = useState<QrState>({
    open: false,
    table: null,
    mode: "static",
    format: "dataUrl",
    baseUrl: "",
    expiresInHours: 720,
    qr: "",
    qrPayload: "",
    token: "",
    labelText: tenantName || tenantSlug || "My Restaurant",
    bgColor: "#fff7e9",
    borderColor: "#f59e0b",
    labelColor: "#7c2d12",
    error: "",
  });

  const preview = qrSrc(qr.qr, qr.format);
  const qrBusy = isQrFetching || isQrTokenLoading;

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

  // async function openQr(table: TableRecord) {
  //   const baseUrl = defaultQrBaseUrl();

  //   const shouldRefresh = !table.qrCode || hasLegacyApiMenuPayload(table.qrPayload);

  //   setQr({
  //     open: true,
  //     table,
  //     mode: "static",
  //     format: table.qrFormat || "dataUrl",
  //     baseUrl,
  //     expiresInHours: 720,
  //     qr: table.qrCode || "",
  //     qrPayload: table.qrPayload || "",
  //     token: "",
  //     labelText: tenantName || tenantSlug || "My Restaurant",
  //     bgColor: "#fff7e9",
  //     borderColor: "#f59e0b",
  //     labelColor: "#7c2d12",
  //     error: "",
  //   });
  //   if (!shouldRefresh) return;
  //   try {
  //     const r = await fetchQr({
  //       tableId: table.id,
  //       format: table.qrFormat || "dataUrl",
  //       baseUrl: baseUrl || undefined,
  //     }).unwrap();
  //     setQr((prev) => ({ ...prev, qr: r.qr, qrPayload: r.qrPayload, format: r.format }));
  //     if (hasLegacyApiMenuPayload(table.qrPayload)) {
  //       showInfo(`Table ${table.number} QR updated to frontend menu URL`);
  //     }
  //   } catch (e) {
  //     setQr((prev) => ({ ...prev, error: getErrorMessage(e) }));
  //   }
  // }
  async function openQr(table: TableRecord) {
    const baseUrl = defaultQrBaseUrl();

    const shouldRefresh =
      !table.qrCode || hasLegacyApiMenuPayload(table.qrPayload);

    setQr({
      open: true,
      table,
      mode: "static",
      format: table.qrFormat || "dataUrl",
      baseUrl,
      expiresInHours: 720,
      qr: table.qrCode || "",
      qrPayload: table.qrPayload || "",
      token: "",
      labelText: tenantName || tenantSlug || "My Restaurant",
      bgColor: "#fff7e9",
      borderColor: "#f59e0b",
      labelColor: "#7c2d12",
      error: "",
    });

    if (!shouldRefresh) return;

    try {
      const r = await fetchQr({
        tableId: table.id,
        format: table.qrFormat || "dataUrl",
        baseUrl: baseUrl, // ✅ always send correct URL
      }).unwrap();

      setQr((prev) => ({
        ...prev,
        qr: r.qr,
        qrPayload: r.qrPayload,
        format: r.format,
      }));
    } catch (e) {
      setQr((prev) => ({ ...prev, error: getErrorMessage(e) }));
    }
  }
  async function generateQr() {
    if (!qr.table) return;
    setQr((prev) => ({ ...prev, error: "" }));
    try {
      if (qr.mode === "token") {
        const r = await createQrToken({
          tableId: qr.table.id,
          format: qr.format,
          baseUrl: qr.baseUrl.trim() || defaultQrBaseUrl(),
          expiresInHours: norm(qr.expiresInHours, 720),
        }).unwrap();
        return setQr((prev) => ({
          ...prev,
          qr: r.qr,
          qrPayload: r.qrPayload,
          token: r.token,
          format: r.format,
        }));
      }
      const r = await fetchQr({
        tableId: qr.table.id,
        format: qr.format,
        baseUrl: qr.baseUrl.trim() || defaultQrBaseUrl(),
      }).unwrap();
      setQr((prev) => ({
        ...prev,
        qr: r.qr,
        qrPayload: r.qrPayload,
        token: "",
        format: r.format,
      }));
    } catch (e) {
      setQr((prev) => ({ ...prev, error: getErrorMessage(e) }));
    }
  }

  async function downloadStyled() {
    if (!qr.table || !qr.qr) return;
    setDownloadingStyled(true);
    try {
      await styledDownload({
        qr: qr.qr,
        format: qr.format,
        fileBase: `table-${qr.table.number}-${qr.mode}`,
        labelText: qr.labelText.trim() || tenantName || "My Restaurant",
        bgColor: qr.bgColor,
        borderColor: qr.borderColor,
        labelColor: qr.labelColor,
      });
    } catch (e) {
      setQr((prev) => ({ ...prev, error: getErrorMessage(e) }));
    } finally {
      setDownloadingStyled(false);
    }
  }

  return (
    <>
      <section className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_1.95fr]">
        <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
          <div className="rounded-t-2xl bg-[linear-gradient(130deg,#f9df9f_0%,#f6c36f_40%,#d8eddf_100%)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
              Quick Control
            </p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">
              Add Table Fast
            </h3>
            <p className="mt-1 text-xs text-slate-700">
              Status can be updated later from each card or edit panel.
            </p>
          </div>
          <form onSubmit={submitCreate} className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
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
                className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
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
                className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                placeholder="Capacity"
              />
            </div>
            <input
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, name: event.target.value }))
              }
              className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder={`Table ${createForm.number}`}
            />
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
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
                className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
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
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
                <p className="text-slate-500">Tables</p>
                <p className="mt-1 text-base font-semibold">{tables.length}</p>
              </div>
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
                <p className="text-slate-500">Reserved</p>
                <p className="mt-1 text-base font-semibold">{reservedCount}</p>
              </div>
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
                <p className="text-slate-500">Seats</p>
                <p className="mt-1 text-base font-semibold">{totalSeats}</p>
              </div>
            </div>
          </form>
        </article>

        <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee7d8] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Tables</h3>
              <p className="text-xs text-slate-500">
                {isLoading ? "Loading..." : `${tables.length} tables`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  filter === "all"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter("active")}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  filter === "active"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Active {activeCount}
              </button>
              <button
                type="button"
                onClick={() => setFilter("inactive")}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  filter === "inactive"
                    ? "border-slate-300 bg-slate-100 text-slate-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Inactive {tables.length - activeCount}
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {isFetching ? "..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="p-4">
            {tables.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {tables.map((table) => {
                  const reserved = nStatus(table.status) === "RESERVED";
                  return (
                    <article
                      key={table.id}
                      className="rounded-2xl border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff7e8_100%)] p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">
                            T{table.number}
                          </span>
                          <p className="mt-2 text-base font-semibold text-slate-900">
                            {table.name}
                          </p>
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
                            {table.isActive ? "Active Table" : "Inactive Table"}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 rounded-lg border border-[#e8e1d4] bg-white px-2.5 py-2 text-[11px] text-slate-600">
                        {reserved
                          ? `Reserved by customer: ${table.customerId || "Not provided"}`
                          : "Tap Set Reserved to assign customer and block table."}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <button
                          type="button"
                          onClick={() => openQr(table)}
                          className="rounded-lg border border-[#dfd2bb] bg-white px-2 py-2 text-xs font-semibold text-slate-700"
                        >
                          QR
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(table)}
                          className="rounded-lg border border-[#dfd2bb] bg-white px-2 py-2 text-xs font-semibold text-slate-700"
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
                          className={`rounded-lg border px-2 py-2 text-xs font-semibold ${reserved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700"} disabled:opacity-60`}
                        >
                          {reserved ? "Set Available" : "Set Reserved"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTable(table)}
                          disabled={isDeleting}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-4 py-10 text-center text-sm text-slate-600">
                No tables. Add your first table from Quick Control.
              </div>
            )}
          </div>
        </article>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setEditing(null)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-[#e6dfd1] bg-[#fffdf9] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-[#eee7d8] pb-3">
              <h4 className="text-base font-semibold">Edit {editing.name}</h4>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1 text-xs font-semibold"
              >
                Close
              </button>
            </div>
            <form className="space-y-3" onSubmit={submitUpdate}>
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
                className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              />
              <input
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, name: event.target.value }))
                }
                className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              />
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
                className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={nStatus(editForm.status)}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      status: nStatus(event.target.value),
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  value={editForm.customerId}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      customerId: event.target.value,
                    }))
                  }
                  placeholder="Customer id"
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      isActive: event.target.checked,
                    }))
                  }
                  className="h-4 w-4"
                />
                Active
              </label>
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
          <section className="absolute left-1/2 top-1/2 max-h-[92vh] w-[95%] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#eee7d8] bg-[#fff6e7] px-4 py-3">
              <h4 className="text-sm font-semibold">
                {qr.table.name} QR Designer
              </h4>
              <button
                type="button"
                onClick={() => setQr((prev) => ({ ...prev, open: false }))}
                className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1 text-xs font-semibold"
              >
                Close
              </button>
            </header>
            <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_1fr]">
              <div className="rounded-2xl border border-[#e8e0d0] bg-white p-4">
                <div
                  className="mx-auto w-full max-w-[340px] rounded-2xl border p-3"
                  style={{
                    backgroundColor: qr.bgColor,
                    borderColor: qr.borderColor,
                  }}
                >
                  <div className="flex aspect-square items-center justify-center rounded-xl bg-white p-3 shadow-sm">
                    {preview ? (
                      <Image
                        src={preview}
                        alt={`QR for ${qr.table.name}`}
                        width={300}
                        height={300}
                        unoptimized
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <p className="text-xs text-slate-500">Generate QR</p>
                    )}
                  </div>
                  <p
                    className="mt-3 text-center text-sm font-semibold"
                    style={{ color: qr.labelColor }}
                  >
                    {qr.labelText || tenantName || "My Restaurant"}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={generateQr}
                    disabled={qrBusy}
                    className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {qrBusy ? "Generating..." : "Generate"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      rawDownload(
                        qr.qr,
                        qr.format,
                        `table-${qr.table?.number}-${qr.mode}`,
                      )
                    }
                    disabled={!qr.qr}
                    className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Download Raw
                  </button>
                  <button
                    type="button"
                    onClick={downloadStyled}
                    disabled={!qr.qr || downloadingStyled}
                    className="col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
                  >
                    {downloadingStyled
                      ? "Preparing..."
                      : "Download Styled (Label + Colors)"}
                  </button>
                </div>
                {qr.qrPayload ? (
                  <p className="mt-3 rounded-lg border border-[#ece4d6] bg-[#fffaf3] px-2.5 py-2 text-[11px] text-slate-600">
                    {qr.qrPayload}
                  </p>
                ) : null}
              </div>
              <div className="space-y-3 rounded-2xl border border-[#e8e0d0] bg-[#fffcf6] p-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setQr((prev) => ({ ...prev, mode: "static" }))
                    }
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${qr.mode === "static" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}
                  >
                    Static
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setQr((prev) => ({ ...prev, mode: "token" }))
                    }
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
                <input
                  value={qr.baseUrl}
                  onChange={(event) =>
                    setQr((prev) => ({ ...prev, baseUrl: event.target.value }))
                  }
                  placeholder="Optional base URL"
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                />
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
                  />
                ) : null}
                <input
                  value={qr.labelText}
                  onChange={(event) =>
                    setQr((prev) => ({
                      ...prev,
                      labelText: event.target.value,
                    }))
                  }
                  placeholder="Brand/Tenant label"
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="color"
                    value={qr.bgColor}
                    onChange={(event) =>
                      setQr((prev) => ({
                        ...prev,
                        bgColor: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-1"
                  />
                  <input
                    type="color"
                    value={qr.borderColor}
                    onChange={(event) =>
                      setQr((prev) => ({
                        ...prev,
                        borderColor: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-1"
                  />
                  <input
                    type="color"
                    value={qr.labelColor}
                    onChange={(event) =>
                      setQr((prev) => ({
                        ...prev,
                        labelColor: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-1"
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((preset, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setQr((prev) => ({ ...prev, ...preset }))}
                      className="h-8 rounded-lg border border-slate-300"
                      style={{
                        background: `linear-gradient(135deg, ${preset.bgColor} 0%, ${preset.borderColor} 100%)`,
                      }}
                      aria-label={`Preset ${index + 1}`}
                    />
                  ))}
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
