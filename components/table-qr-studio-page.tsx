"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTentantProfileQuery } from "@/store/api/authApi";
import { useGetTablesQuery, useLazyGetTableQrQuery } from "@/store/api/tablesApi";
import type { TableQrFormat, TableStatus } from "@/store/types/tables";

type Props = {
  tableId: string;
};

type QrTemplateId =
  | "template1"
  | "template2"
  | "template3"
  | "template4"
  | "template5";

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

const FRONTEND_PUBLIC_URL = "https://restro-khata-com.vercel.app";
const FRONTEND_QR_BASE_URL = `${FRONTEND_PUBLIC_URL}/qr`;

const QR_TEMPLATES: QrTemplate[] = [
  {
    id: "template1",
    name: "Template 1",
    description: "Classic table placard",
    imagePath: "/QR/QRSCANTEMPLATE1.jpg",
    qrSlot: {
      x: 0.18,
      y: 0.46,
      size: 0.64,
      padding: 0.055,
    },
  },
  {
    id: "template2",
    name: "Template 2",
    description: "Modern menu standee",
    imagePath: "/QR/QRSCANTEMPLATE2.jpg",
    qrSlot: {
      x: 0.18,
      y: 0.395,
      size: 0.64,
      padding: 0.055,
    },
  },
  {
    id: "template3",
    name: "Template 3",
    description: "Warm dine card",
    imagePath: "/QR/QRSCANTEMPLATE3.jpg",
    qrSlot: {
      x: 0.23,
      y: 0.405,
      size: 0.53,
      padding: 0.03,
    },
  },
  {
    id: "template4",
    name: "Template 4",
    description: "Premium counter card",
    imagePath: "/QR/QRSCANTEMPLATE4.jpg",
    qrSlot: {
      x: 0.245,
      y: 0.405,
      size: 0.49,
      padding: 0.04,
    },
  },
  {
    id: "template5",
    name: "Template 5",
    description: "Signature table stand",
    imagePath: "/QR/QRSCANTEMPLATE5.jpg",
    qrSlot: {
      x: 0.255,
      y: 0.49,
      size: 0.35,
      padding: 0.02,
    },
  },
];

function qrSrc(qr: string, format: TableQrFormat): string | null {
  if (!qr.trim()) return null;
  if (qr.startsWith("data:image/")) return qr;
  if (format === "svg" && qr.includes("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
  }
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
  return QR_TEMPLATES.find((template) => template.id === id) || QR_TEMPLATES[0];
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
          return query ? `${FRONTEND_QR_BASE_URL}?${query}` : FRONTEND_QR_BASE_URL;
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
      if (hasLegacyStaticParams && !hasToken) return true;
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

function statusBadgeClass(status?: TableStatus): string {
  const normalized = (status || "AVAILABLE").toUpperCase();
  if (normalized === "OCCUPIED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (normalized === "RESERVED") return "border-blue-200 bg-blue-50 text-blue-800";
  if (normalized === "BILLING") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export function TableQrStudioPage({ tableId }: Props) {
  const router = useRouter();
  const { data: tenantProfile } = useTentantProfileQuery();
  const {
    data: tablesData,
    isLoading: isTablesLoading,
    isFetching: isTablesFetching,
    refetch,
  } = useGetTablesQuery();
  const [fetchQr, { isFetching: isQrFetching }] = useLazyGetTableQrQuery();

  const [format, setFormat] = useState<TableQrFormat>("dataUrl");
  const [templateId, setTemplateId] = useState<QrTemplateId>("template1");
  const [baseUrl, setBaseUrl] = useState(defaultQrBaseUrl());
  const [qr, setQr] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [error, setError] = useState("");
  const [sharingQrLink, setSharingQrLink] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [initializedTableId, setInitializedTableId] = useState<string | null>(null);

  const table = useMemo(
    () => (tablesData?.items || []).find((entry) => entry.id === tableId) || null,
    [tableId, tablesData?.items],
  );
  const tenantName = tenantProfile?.tenant?.name || "Restro Khata";
  const selectedTemplate = getTemplateById(templateId);
  const preview = qrSrc(qr, format);
  const qrPayloadUrl = normalizePayloadUrl(qrPayload, baseUrl);

  useEffect(() => {
    if (!table || initializedTableId === table.id) return;

    const nextBaseUrl = defaultQrBaseUrl();
    const nextFormat = table.qrFormat || "dataUrl";
    setInitializedTableId(table.id);
    setFormat(nextFormat);
    setTemplateId("template1");
    setBaseUrl(nextBaseUrl);
    setQr(table.qrCode || "");
    setQrPayload(table.qrPayload || "");
    setError("");

    if (!table.qrCode || shouldRefreshQrPayload(table.qrPayload)) {
      void (async () => {
        try {
          const response = await fetchQr({
            tableId: table.id,
            format: nextFormat,
            baseUrl: nextBaseUrl,
          }).unwrap();
          setQr(response.qr);
          setQrPayload(response.qrPayload);
          setFormat(response.format);
        } catch (issue) {
          setError(issue instanceof Error ? issue.message : "Unable to load QR");
        }
      })();
    }
  }, [fetchQr, initializedTableId, table]);

  async function generateQr() {
    if (!table) return;
    const resolvedBaseUrl = resolveQrBaseUrl(baseUrl);
    setBaseUrl(resolvedBaseUrl);
    setError("");

    try {
      const response = await fetchQr({
        tableId: table.id,
        format,
        baseUrl: resolvedBaseUrl,
      }).unwrap();
      setQr(response.qr);
      setQrPayload(response.qrPayload);
      setFormat(response.format);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to generate QR");
    }
  }

  async function downloadActiveTemplate() {
    if (!table || !qr) return;
    setDownloadingTemplate(true);
    try {
      await downloadTemplateCard({
        qr,
        format,
        fileBase: `table-${table.number}-static`,
        template: selectedTemplate,
      });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to download template");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  function openQrLink() {
    if (!qrPayloadUrl) return;
    window.open(qrPayloadUrl, "_blank", "noopener,noreferrer");
  }

  async function shareQrLink() {
    if (!qrPayloadUrl) return;
    setSharingQrLink(true);
    try {
      const title = `${table?.name || "Table"} Menu QR`;
      const text = `Scan this QR to open menu for ${table?.name || "table"}`;
      if (navigator.share) {
        await navigator.share({ title, text, url: qrPayloadUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(qrPayloadUrl);
      } else {
        throw new Error("Share not supported on this browser");
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to share QR");
    } finally {
      setSharingQrLink(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff1d7_0%,#fff7ea_28%,#f3efe8_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <header className="rounded-[30px] border border-[#e5d8c5] bg-[linear-gradient(145deg,#fff8ec_0%,#fffdfa_48%,#eef5ee_100%)] p-4 shadow-[0_24px_60px_-36px_rgba(95,61,15,0.35)] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => router.push("/dashboard/tables")}
                className="inline-flex items-center gap-2 rounded-full border border-[#e1d3bc] bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <span aria-hidden="true">{"<"}</span>
                Back To Tables
              </button>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9b6a2f]">
                Table QR Studio
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {table ? `${table.name} · T${table.number}` : "Loading table QR"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Full-screen responsive QR preview for mobile and desktop. Template image aur QR dono bina side-scroll ke fit honge.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#e4d5bf] bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700">
                {tenantName}
              </span>
              {table ? (
                <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusBadgeClass(table.status)}`}>
                  {(table.status || "AVAILABLE").toUpperCase()}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-full border border-[#e4d5bf] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {isTablesFetching ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </header>

        {isTablesLoading ? (
          <section className="mt-4 rounded-[28px] border border-[#e5d8c5] bg-white/90 px-4 py-12 text-center text-sm text-slate-500">
            Loading table QR studio...
          </section>
        ) : null}

        {!isTablesLoading && !table ? (
          <section className="mt-4 rounded-[28px] border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
            Table not found. Table list refresh karke dubara open karo.
          </section>
        ) : null}

        {!isTablesLoading && table ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
            <section className="min-w-0 space-y-4">
              <article className="rounded-[32px] border border-[#e6dccd] bg-white/90 p-3 shadow-[0_26px_60px_-40px_rgba(95,61,15,0.35)] sm:p-4 lg:p-5">
                <div className="rounded-[28px] border border-[#eadfcf] bg-[linear-gradient(180deg,#fffaf1_0%,#fffdf9_100%)] p-3 sm:p-4 lg:p-5">
                  <div className="mx-auto w-full max-w-[840px]">
                    <div className="relative overflow-hidden rounded-[24px] border border-[#eadfce] bg-[radial-gradient(circle_at_top,#fff9ee_0%,#fff4df_36%,#fffdfa_100%)] p-2 sm:p-3">
                      <div className="relative mx-auto aspect-[1684/2528] w-full max-w-[760px]">
                        <Image
                          src={selectedTemplate.imagePath}
                          alt={`${selectedTemplate.name} preview`}
                          fill
                          unoptimized
                          className="object-contain"
                        />
                        <div
                          className="absolute rounded-[8px] border border-slate-200/90 bg-white/90 shadow-sm"
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
                                alt={`QR for ${table.name}`}
                                fill
                                unoptimized
                                className="object-contain"
                              />
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center px-2 text-center text-[10px] font-medium text-slate-500 sm:text-xs">
                              {isQrFetching ? "Generating preview..." : "Generate QR to preview"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-[28px] border border-[#e5d8c5] bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b6a2f]">
                      Quick Actions
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Generate, download, open ya share QR link directly from this page.
                    </p>
                  </div>
                  <span className="rounded-full border border-[#ead9bf] bg-[#fff5df] px-3 py-1 text-xs font-semibold text-[#8b5b22]">
                    {selectedTemplate.name}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={generateQr}
                    disabled={isQrFetching}
                    className="rounded-2xl border border-[#e0d8c9] bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    {isQrFetching ? "Generating..." : "Generate QR"}
                  </button>
                  <button
                    type="button"
                    onClick={downloadActiveTemplate}
                    disabled={!qr || downloadingTemplate}
                    className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {downloadingTemplate ? "Preparing..." : "Download Card"}
                  </button>
                  <button
                    type="button"
                    onClick={openQrLink}
                    disabled={!qrPayloadUrl}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 disabled:opacity-50"
                  >
                    Open Public Link
                  </button>
                  <button
                    type="button"
                    onClick={shareQrLink}
                    disabled={!qrPayloadUrl || sharingQrLink}
                    className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 disabled:opacity-50"
                  >
                    {sharingQrLink ? "Sharing..." : "Share Link"}
                  </button>
                </div>
              </article>
            </section>

            <aside className="min-w-0 space-y-4 xl:sticky xl:top-6">
              <article className="rounded-[28px] border border-[#e5d8c5] bg-white/90 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b6a2f]">
                  Output Settings
                </p>

                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-semibold text-slate-500">
                    QR Format
                    <select
                      value={format}
                      onChange={(event) => setFormat(event.target.value as TableQrFormat)}
                      className="mt-1.5 h-11 w-full rounded-2xl border border-[#ddd4c1] bg-white px-3 text-sm text-slate-800"
                    >
                      <option value="dataUrl">PNG</option>
                      <option value="svg">SVG</option>
                    </select>
                  </label>

                  <div className="rounded-2xl border border-[#e5d7c0] bg-[#fff8ea] px-3 py-3 text-xs leading-5 text-slate-600">
                    QR link always starts with <span className="font-semibold text-slate-800">{FRONTEND_PUBLIC_URL}</span>
                  </div>

                  {qrPayloadUrl ? (
                    <div className="rounded-2xl border border-[#ece4d6] bg-[#fffaf3] px-3 py-3 text-[11px] leading-5 text-slate-600">
                      <p className="mb-1 font-semibold text-slate-800">Public Link</p>
                      <p className="break-all">{qrPayloadUrl}</p>
                    </div>
                  ) : null}

                  {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-700">
                      {error}
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="rounded-[28px] border border-[#e5d8c5] bg-white/90 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b6a2f]">
                      Templates
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tap any card to preview it instantly.
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                    {QR_TEMPLATES.length} styles
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-2">
                  {QR_TEMPLATES.map((template) => {
                    const active = template.id === templateId;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setTemplateId(template.id)}
                        className={`min-w-0 rounded-[22px] border p-2 text-left transition ${
                          active
                            ? "border-slate-700 bg-white shadow-sm"
                            : "border-[#e4dccf] bg-[#fffaf2]"
                        }`}
                      >
                        <div className="relative mb-2 aspect-[1684/2528] w-full overflow-hidden rounded-[16px] border border-[#e9e0d2] bg-white">
                          <Image
                            src={template.imagePath}
                            alt={`${template.name} thumbnail`}
                            fill
                            unoptimized
                            className="object-contain"
                          />
                        </div>
                        <p className="truncate text-[11px] font-semibold text-slate-800">
                          {template.name}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-500">
                          {template.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </article>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}
