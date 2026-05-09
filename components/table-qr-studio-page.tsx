"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTentantProfileQuery } from "@/store/api/authApi";
import { useGetTablesQuery, useLazyGetTableQrQuery } from "@/store/api/tablesApi";
import type { TableQrFormat, TableStatus } from "@/store/types/tables";

/* ═══════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════ */
type Props = { tableId: string };
type QrTemplateId = "spice" | "desi" | "chai" | "biryani" | "mithai";

interface QrTemplate {
  id: QrTemplateId;
  name: string;
  tagline: string;
  headline: string;
  subline: string;
  cta: string;
  hint: string;
  icons: string;
  accent: string;
  accentLight: string;
  bg: string;
  isDark: boolean;
}

/* ═══════════════════════════════════════════════════════════
   INDIAN CAFE TEMPLATES
═══════════════════════════════════════════════════════════ */
const TEMPLATES: QrTemplate[] = [
  {
    id: "spice",
    name: "Spice Route",
    tagline: "🌶️  FLAVOURS OF INDIA",
    headline: "Scan Karo,\nKhana Mangao!",
    subline: "Seedha Table Pe Order",
    cta: "📱 Scan Here For Menu",
    hint: "🍽️  Fresh · Tasty · Quick",
    icons: "🍛  🥘  🌶️  🍚  🥗",
    accent: "#c0392b",
    accentLight: "#e74c3c",
    bg: "linear-gradient(145deg,#2d0a00 0%,#4a1500 50%,#3d1000 100%)",
    isDark: true,
  },
  {
    id: "desi",
    name: "Desi Dhaba",
    tagline: "🍽️  GHAR JAISA KHANA",
    headline: "Delicious Menu\nScan Karke Dekho!",
    subline: "Asli Desi Swad, Table Pe",
    cta: "📲 Scan & View Our Menu",
    hint: "🫓  Dal · Roti · Sabzi · Chai",
    icons: "🫓  🥙  🍲  🥛  🌿",
    accent: "#d4830a",
    accentLight: "#f0a030",
    bg: "linear-gradient(145deg,#1a0e00 0%,#2e1a00 50%,#241200 100%)",
    isDark: true,
  },
  {
    id: "chai",
    name: "Chai Corner",
    tagline: "☕  CHAI & NASHTA",
    headline: "View Our Menu\nScan Here!",
    subline: "Hot Chai · Fresh Nashta",
    cta: "☕ Scan For Full Menu",
    hint: "🧆  Samosa · Pakoda · Chai",
    icons: "☕  🧆  🥐  🍵  🫖",
    accent: "#6d4c41",
    accentLight: "#8d6e63",
    bg: "linear-gradient(145deg,#fdf6ec 0%,#f5e6c8 50%,#ecdab8 100%)",
    isDark: false,
  },
  {
    id: "biryani",
    name: "Biryani House",
    tagline: "🍚  DUM BIRYANI SPECIAL",
    headline: "Scan Karo\nAur Order Karo!",
    subline: "Dum Pukht · Awadhi Style",
    cta: "🍚 Scan Here For Menu",
    hint: "🥩  Chicken · Mutton · Veg",
    icons: "🍚  🥩  🫕  🧅  🌿",
    accent: "#1a7a40",
    accentLight: "#27ae60",
    bg: "linear-gradient(145deg,#001a0a 0%,#002e12 50%,#00200d 100%)",
    isDark: true,
  },
  {
    id: "mithai",
    name: "Mithai & More",
    tagline: "🪔  SWEETS & THALI",
    headline: "Yahan Scan Karo\nMenu Dekho!",
    subline: "Meetha · Namkeen · Thali",
    cta: "🪔 Scan & Enjoy Our Menu",
    hint: "🍮  Gulab Jamun · Lassi · Thali",
    icons: "🍮  🥛  🪔  🫙  🍯",
    accent: "#7b2d8b",
    accentLight: "#9b59b6",
    bg: "linear-gradient(145deg,#f9f0ff 0%,#ecdcf5 50%,#e4d0f0 100%)",
    isDark: false,
  },
];

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const FRONTEND_PUBLIC_URL = "https://restro-khata-com.vercel.app";
const FRONTEND_QR_BASE_URL = `${FRONTEND_PUBLIC_URL}/qr`;

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
function qrSrc(qr: string, format: TableQrFormat): string | null {
  if (!qr.trim()) return null;
  if (qr.startsWith("data:image/")) return qr;
  if (format === "svg" && qr.includes("<svg"))
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
  if (format === "dataUrl") return `data:image/png;base64,${qr}`;
  return null;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function normalizePayloadUrl(payload: string, baseUrl: string): string {
  const raw = payload.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.origin === FRONTEND_PUBLIC_URL) {
        const hasQrParams = url.searchParams.has("token") || url.searchParams.has("tenantSlug") ||
          url.searchParams.has("tableId") || url.searchParams.has("tableNumber");
        const badPath = ["/", "/login", "/dashboard", "/register", "/plan","register-digital-menu"].includes(url.pathname);
        if (hasQrParams && badPath) {
          const q = url.searchParams.toString();
          return q ? `${FRONTEND_QR_BASE_URL}?${q}` : FRONTEND_QR_BASE_URL;
        }
      }
      return url.toString();
    } catch { return raw; }
  }
  const base = baseUrl.trim() || FRONTEND_QR_BASE_URL;
  if (raw.startsWith("?")) return `${base}${raw}`;
  if (raw.includes("=") && !raw.includes(" ")) return `${base}?${raw.replace(/^\?/, "")}`;
  try { return new URL(raw, FRONTEND_PUBLIC_URL).toString(); } catch { return raw; }
}

function shouldRefreshQrPayload(payload?: string): boolean {
  if (!payload?.trim()) return false;
  const raw = payload.trim();
  if (/\/api\/public\/menu(?:\?|$)/i.test(raw)) return true;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.origin !== FRONTEND_PUBLIC_URL) return true;
      const hasLegacy = url.searchParams.has("tenantSlug") || url.searchParams.has("tableId") || url.searchParams.has("tableNumber");
      if (hasLegacy && !url.searchParams.has("token")) return true;
      if (["/", "/login", "/dashboard", "/register", "/plan" , "register-digital-menu"].includes(url.pathname) &&
        (url.searchParams.has("token") || hasLegacy)) return true;
      return false;
    } catch { return true; }
  }
  return false;
}

function statusBadgeClass(status?: TableStatus): string {
  const s = (status || "AVAILABLE").toUpperCase();
  if (s === "OCCUPIED") return "badge-amber";
  if (s === "RESERVED") return "badge-blue";
  if (s === "BILLING")  return "badge-rose";
  return "badge-green";
}

/* ═══════════════════════════════════════════════════════════
   CANVAS DOWNLOAD
   Layout is calculated top-to-bottom so nothing ever clips.
   W=900, all sections fixed height, H = sum of all sections.
═══════════════════════════════════════════════════════════ */
async function buildCardCanvas(args: {
  t: QrTemplate;
  qrDataUrl: string | null;
  tableName: string;
  tableNumber: string | number;
  tenantName: string;
}): Promise<Blob> {
  const { t, qrDataUrl, tableName, tableNumber, tenantName } = args;

  const W = 900;
  const HPAD = 70; // horizontal padding

  // Section heights
  const TOP_BAND    = 120;
  const SEC_TENANT  = 52;
  const SEC_NAME    = 110;
  const SEC_TNUM    = 52;
  const DIV_GAP     = 28;
  const SEC_HL_1    = 60;
  const SEC_HL_2    = 60;
  const SEC_ICONS   = 70;
  const QR_SIZE     = W - HPAD * 2; // 760
  const QR_PAD_TOP  = 30;
  const QR_PAD_BOT  = 30;
  const SEC_CTA     = 70;
  const SEC_HINT    = 56;
  const BOT_SPACE   = 30;
  const BOT_BAR     = 14;

  const H = TOP_BAND + SEC_TENANT + SEC_NAME + SEC_TNUM + DIV_GAP + SEC_HL_1 + SEC_HL_2 + SEC_ICONS
          + QR_PAD_TOP + QR_SIZE + QR_PAD_BOT + SEC_CTA + SEC_HINT + BOT_SPACE + BOT_BAR;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── BG ──
  const bgMap: Record<QrTemplateId, string[]> = {
    spice:   ["#2d0a00","#4a1500","#3d1000"],
    desi:    ["#1a0e00","#2e1a00","#241200"],
    chai:    ["#fdf6ec","#f5e6c8","#ecdab8"],
    biryani: ["#001a0a","#002e12","#00200d"],
    mithai:  ["#f9f0ff","#ecdcf5","#e4d0f0"],
  };
  const [b0, b1, b2] = bgMap[t.id];
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, b0); bg.addColorStop(0.5, b1); bg.addColorStop(1, b2);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 52); ctx.fill();

  // outer border
  ctx.strokeStyle = t.accent + "60"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(3, 3, W - 6, H - 6, 50); ctx.stroke();

  const tc   = t.isDark ? "#ffffff" : "#1a0800";
  const sc   = t.isDark ? "rgba(255,255,255,0.44)" : "rgba(0,0,0,0.40)";

  const drawDiv = (yPos: number) => {
    const dg = ctx.createLinearGradient(HPAD, 0, W - HPAD, 0);
    dg.addColorStop(0, "transparent");
    dg.addColorStop(0.5, t.accent + "70");
    dg.addColorStop(1, "transparent");
    ctx.strokeStyle = dg; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(HPAD, yPos); ctx.lineTo(W - HPAD, yPos); ctx.stroke();
  };

  ctx.textAlign = "center";

  // ── TOP BAND ──
  ctx.save();
  ctx.beginPath(); ctx.roundRect(0, 0, W, TOP_BAND, [52, 52, 0, 0]); ctx.clip();
  ctx.fillStyle = t.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)";
  ctx.fillRect(0, 0, W, TOP_BAND);
  ctx.restore();
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.fillStyle = t.accent;
  ctx.fillText(t.tagline, W / 2, TOP_BAND / 2 + 11);

  let y = TOP_BAND;
  drawDiv(y);

  // ── TENANT NAME ──
  y += 16;
  ctx.font = "500 26px Arial, sans-serif";
  ctx.fillStyle = sc;
  ctx.fillText(tenantName.toUpperCase(), W / 2, y + 30);
  y += SEC_TENANT;

  // ── TABLE NAME ──
  ctx.font = "bold 90px Georgia, serif";
  ctx.fillStyle = tc;
  ctx.fillText(tableName, W / 2, y + 82);
  y += SEC_NAME;

  // ── TABLE NUMBER ──
  ctx.font = "500 28px Arial, sans-serif";
  ctx.fillStyle = sc;
  ctx.fillText(`Table No. ${tableNumber}`, W / 2, y + 30);
  y += SEC_TNUM;

  drawDiv(y); y += DIV_GAP;

  // ── HEADLINE ──
  const headLines = t.headline.split("\n");
  ctx.font = "italic bold 46px Georgia, serif";
  ctx.fillStyle = t.isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.62)";
  ctx.fillText(headLines[0] || "", W / 2, y + 46);
  y += SEC_HL_1;
  if (headLines[1]) {
    ctx.fillText(headLines[1], W / 2, y + 44);
  }
  y += SEC_HL_2;

  // ── FOOD ICONS ──
  ctx.font = "44px serif";
  ctx.fillText(t.icons, W / 2, y + 50);
  y += SEC_ICONS;

  // ── QR BOX ──
  y += QR_PAD_TOP;
  const qx = HPAD, qy = y, qw = QR_SIZE;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(qx, qy, qw, qw, 36);
  ctx.fillStyle = t.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)";
  ctx.fill();
  ctx.strokeStyle = t.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.10)";
  ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();

  if (qrDataUrl) {
    await new Promise<void>((res) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const p = 48;
        ctx.save();
        ctx.beginPath(); ctx.roundRect(qx + p, qy + p, qw - p * 2, qw - p * 2, 18);
        ctx.clip();
        ctx.drawImage(img, qx + p, qy + p, qw - p * 2, qw - p * 2);
        ctx.restore(); res();
      };
      img.onerror = () => res();
      img.src = qrDataUrl;
    });
  } else {
    ctx.font = "80px serif";
    ctx.fillStyle = t.isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
    ctx.fillText("⬛", W / 2, qy + qw / 2 + 30);
  }

  y += qw + QR_PAD_BOT;

  // ── CTA ──
  ctx.font = "bold 48px Georgia, serif";
  ctx.fillStyle = t.accent;
  ctx.fillText(t.cta, W / 2, y + 52);
  y += SEC_CTA;

  ctx.font = "500 28px Arial, sans-serif";
  ctx.fillStyle = sc;
  ctx.fillText(t.hint, W / 2, y + 36);
  y += SEC_HINT + BOT_SPACE;

  // ── BOTTOM BAR ──
  const barG = ctx.createLinearGradient(0, 0, W, 0);
  barG.addColorStop(0, "transparent");
  barG.addColorStop(0.3, t.accent);
  barG.addColorStop(0.7, t.accentLight);
  barG.addColorStop(1, "transparent");
  ctx.fillStyle = barG;
  ctx.fillRect(0, H - BOT_BAR, W, BOT_BAR);

  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Canvas export failed"))), "image/png", 1.0)
  );
}

/* ═══════════════════════════════════════════════════════════
   QR CARD — screen preview
═══════════════════════════════════════════════════════════ */
function QrCard({ t, qrSrcUrl, tableName, tableNumber, tenantName, isGenerating }: {
  t: QrTemplate; qrSrcUrl: string | null;
  tableName: string; tableNumber: string | number;
  tenantName: string; isGenerating: boolean;
}) {
  const tc = t.isDark ? "#ffffff" : "#1a0800";
  const sc = t.isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.44)";

  return (
    <div style={{
      background: t.bg, borderRadius: 22, overflow: "hidden",
      width: "100%", maxWidth: 270, margin: "0 auto",
      boxShadow: `0 26px 56px -14px ${t.accent}55, 0 5px 16px -5px rgba(0,0,0,0.28)`,
      border: `2px solid ${t.accent}44`, userSelect: "none", transition: "box-shadow 0.3s",
    }}>
      {/* Top band */}
      <div style={{
        padding: "9px 12px", textAlign: "center",
        background: t.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
        borderBottom: `1px solid ${t.accent}28`,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.20em", color: t.accent, textTransform: "uppercase" }}>
          {t.tagline}
        </span>
      </div>

      {/* Info */}
      <div style={{ padding: "12px 14px 0", textAlign: "center" }}>
        <p style={{ fontSize: 7.5, letterSpacing: "0.16em", textTransform: "uppercase", color: sc, margin: 0 }}>{tenantName}</p>
        <p style={{ fontSize: 26, fontWeight: 800, color: tc, margin: "4px 0 1px", lineHeight: 1.05, fontFamily: "Georgia,serif" }}>{tableName}</p>
        <p style={{ fontSize: 8.5, color: sc, margin: 0, letterSpacing: "0.08em" }}>Table No. {tableNumber}</p>
        <div style={{ height: 1, margin: "9px 0", background: `linear-gradient(90deg,transparent,${t.accent}44,transparent)` }} />
        {/* Headline */}
        <p style={{ fontSize: 12, fontWeight: 700, fontStyle: "italic", color: t.isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.64)", margin: "0 0 7px", lineHeight: 1.4, whiteSpace: "pre-line", fontFamily: "Georgia,serif" }}>
          {t.headline}
        </p>
        {/* Icons */}
        <p style={{ fontSize: 17, margin: "0 0 10px", letterSpacing: "0.08em" }}>{t.icons}</p>
      </div>

      {/* QR */}
      <div style={{
        margin: "0 11px 10px",
        background: t.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
        border: `1.5px solid ${t.isDark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.09)"}`,
        borderRadius: 14, padding: 8,
        display: "flex", alignItems: "center", justifyContent: "center", minHeight: 152,
      }}>
        {qrSrcUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={qrSrcUrl} alt="QR" style={{ width: "100%", maxWidth: 144, height: "auto", borderRadius: 7, display: "block" }} />
          : (
            <div style={{ textAlign: "center", padding: "14px 0" }}>
              <div style={{ fontSize: 28, opacity: 0.2, marginBottom: 5 }}>⬛</div>
              <p style={{ fontSize: 8, color: sc, margin: 0 }}>{isGenerating ? "Generating…" : "Generate QR to preview"}</p>
            </div>
          )
        }
      </div>

      {/* CTA */}
      <div style={{ padding: "0 12px 12px", textAlign: "center" }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: t.accent, margin: 0 }}>{t.cta}</p>
        <p style={{ fontSize: 8.5, color: sc, margin: "3px 0 0" }}>{t.hint}</p>
      </div>

      {/* Bottom bar */}
      <div style={{ height: 4, background: `linear-gradient(90deg,transparent,${t.accent},${t.accentLight},transparent)` }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATE SWIPER
═══════════════════════════════════════════════════════════ */
function TemplateSwiper({ activeId, onChange }: { activeId: QrTemplateId; onChange: (id: QrTemplateId) => void }) {
  const activeIdx = TEMPLATES.findIndex((t) => t.id === activeId);
  const tpl = TEMPLATES[activeIdx];

  return (
    <div style={{ padding: "10px 10px 4px" }}>
      {/* Pills */}
      <div style={{ display: "flex", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
        {TEMPLATES.map((t) => {
          const active = t.id === activeId;
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={{
              border: `2px solid ${active ? t.accent : "rgba(0,0,0,0.10)"}`,
              borderRadius: 99, padding: "5px 11px",
              background: active ? "#fff" : "rgba(255,255,255,0.55)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              boxShadow: active ? `0 4px 12px -4px ${t.accent}55` : "none",
              transform: active ? "translateY(-2px)" : "none",
              transition: "all 0.18s",
            }}>
              <span style={{ fontSize: 14 }}>{t.icons.split("  ")[0]}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: active ? t.accent : "#5a4030" }}>{t.name}</span>
            </button>
          );
        })}
      </div>

      {/* Prev / label / Next */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 10 }}>
        <button onClick={() => activeIdx > 0 && onChange(TEMPLATES[activeIdx - 1].id)} disabled={activeIdx === 0}
          style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px solid #e0d4c0", background: "#fff", fontSize: 18, color: "#5a3e20", cursor: activeIdx === 0 ? "not-allowed" : "pointer", opacity: activeIdx === 0 ? 0.28 : 1, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.07)", transition: "all 0.15s" }}>
          ‹
        </button>
        <div style={{ textAlign: "center", minWidth: 86 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: tpl.accent, margin: 0 }}>{tpl.name}</p>
          <p style={{ fontSize: 9, color: "#9a7a55", margin: 0 }}>{activeIdx + 1} / {TEMPLATES.length}</p>
        </div>
        <button onClick={() => activeIdx < TEMPLATES.length - 1 && onChange(TEMPLATES[activeIdx + 1].id)} disabled={activeIdx === TEMPLATES.length - 1}
          style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px solid #e0d4c0", background: "#fff", fontSize: 18, color: "#5a3e20", cursor: activeIdx === TEMPLATES.length - 1 ? "not-allowed" : "pointer", opacity: activeIdx === TEMPLATES.length - 1 ? 0.28 : 1, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.07)", transition: "all 0.15s" }}>
          ›
        </button>
      </div>

      {/* Dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 8 }}>
        {TEMPLATES.map((t, i) => (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{ width: i === activeIdx ? 20 : 5, height: 5, borderRadius: 99, background: i === activeIdx ? tpl.accent : "#d4c8b8", border: "none", cursor: "pointer", padding: 0, transition: "all 0.2s" }} />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ACTION BUTTON — icon on top, label below
═══════════════════════════════════════════════════════════ */
function ActionBtn({ icon, label, onClick, disabled, variant = "ghost" }: {
  icon: string; label: string; onClick: () => void;
  disabled?: boolean; variant?: "ghost" | "amber" | "green" | "blue";
}) {
  const styles: Record<string, React.CSSProperties> = {
    ghost:  { background: "#fff", color: "#3d2c1a", border: "1.5px solid #e0d8c9" },
    amber:  { background: "#e07c20", color: "#fff", border: "none", boxShadow: "0 4px 14px -4px rgba(224,124,32,0.42)" },
    green:  { background: "#edf7f0", color: "#1e6b40", border: "1.5px solid #b8e0c8" },
    blue:   { background: "#edf2ff", color: "#2d4fc4", border: "1.5px solid #bad0f8" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant], borderRadius: 14, padding: "10px 5px",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 4, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
      flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", transition: "all 0.17s",
    }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 9.5, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{label}</span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export function TableQrStudioPage({ tableId }: Props) {
  const router = useRouter();
  const { data: tenantProfile } = useTentantProfileQuery();
  const { data: tablesData, isLoading: isTablesLoading, isFetching: isTablesFetching, refetch } = useGetTablesQuery();
  const [fetchQr, { isFetching: isQrFetching }] = useLazyGetTableQrQuery();

  const [format, setFormat]           = useState<TableQrFormat>("dataUrl");
  const [templateId, setTemplateId]   = useState<QrTemplateId>("spice");
  const [qr, setQr]                   = useState("");
  const [qrPayload, setQrPayload]     = useState("");
  const [error, setError]             = useState("");
  const [sharing, setSharing]         = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [initId, setInitId]           = useState<string | null>(null);

  const table      = useMemo(() => (tablesData?.items || []).find((e) => e.id === tableId) || null, [tableId, tablesData?.items]);
  const tenantName = tenantProfile?.tenant?.name || "Mera Dhaba";
  const tpl        = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
  const preview    = qrSrc(qr, format);
  const payloadUrl = normalizePayloadUrl(qrPayload, FRONTEND_QR_BASE_URL);

  const touchX = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const diff = touchX.current - e.changedTouches[0].clientX;
    const idx = TEMPLATES.findIndex((t) => t.id === templateId);
    if (diff > 50 && idx < TEMPLATES.length - 1) setTemplateId(TEMPLATES[idx + 1].id);
    if (diff < -50 && idx > 0) setTemplateId(TEMPLATES[idx - 1].id);
    touchX.current = null;
  }, [templateId]);

  useEffect(() => {
    if (!table || initId === table.id) return;
    const nf = (table.qrFormat as TableQrFormat) || "dataUrl";
    setInitId(table.id); setFormat(nf);
    setQr(table.qrCode || ""); setQrPayload(table.qrPayload || ""); setError("");
    if (!table.qrCode || shouldRefreshQrPayload(table.qrPayload)) {
      void (async () => {
        try {
          const r = await fetchQr({ tableId: table.id, format: nf, baseUrl: FRONTEND_QR_BASE_URL }).unwrap();
          setQr(r.qr); setQrPayload(r.qrPayload); setFormat(r.format);
        } catch (e) { setError(e instanceof Error ? e.message : "Unable to load QR"); }
      })();
    }
  }, [fetchQr, initId, table]);

  async function generateQr() {
    if (!table) return; setError("");
    try {
      const r = await fetchQr({ tableId: table.id, format, baseUrl: FRONTEND_QR_BASE_URL }).unwrap();
      setQr(r.qr); setQrPayload(r.qrPayload); setFormat(r.format);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to generate QR"); }
  }

  async function downloadCard() {
    if (!table) return;
    setDownloading(true); setError("");
    try {
      const blob = await buildCardCanvas({ t: tpl, qrDataUrl: preview, tableName: table.name, tableNumber: table.number, tenantName });
      downloadBlob(blob, `table-${table.number}-${tpl.id}.png`);
    } catch (e) { setError(e instanceof Error ? e.message : "Download failed"); }
    finally { setDownloading(false); }
  }

  async function copyLink() {
    if (!payloadUrl) return;
    try { await navigator.clipboard.writeText(payloadUrl); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch { setError("Clipboard access denied"); }
  }

  async function shareLink() {
    if (!payloadUrl) return; setSharing(true);
    try {
      if (navigator.share) await navigator.share({ title: `${table?.name || "Table"} Menu`, url: payloadUrl });
      else await copyLink();
    } catch (e) { setError(e instanceof Error ? e.message : "Share failed"); }
    finally { setSharing(false); }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        .qrs *, .qrs *::before, .qrs *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .qrs {
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
          background: radial-gradient(ellipse at 20% 6%, #fff5e0 0%, #fdf6ec 35%, #ede8df 100%);
          color: #1a1008;
          -webkit-tap-highlight-color: transparent;
        }
        .qrs-wrap { max-width: 900px; margin: 0 auto; padding: 10px 10px 60px; }

        /* ── Header ── */
        .qrs-hdr {
          border-radius: 16px; border: 1px solid #e6d9c3;
          background: linear-gradient(145deg,#fff8ec,#fffdfa 50%,#eef5ee);
          padding: 11px 13px;
          box-shadow: 0 8px 28px -16px rgba(95,61,15,.24);
          margin-bottom: 10px;
        }
        .hdr-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
        .back-btn {
          display: inline-flex; align-items: center; gap: 5px;
          border-radius: 99px; border: 1px solid #e1d3bc;
          background: rgba(255,255,255,.88); padding: 6px 13px;
          font-size: 12px; font-weight: 600; color: #4a3520;
          cursor: pointer; font-family: 'DM Sans', sans-serif;
          white-space: nowrap; transition: background .15s;
        }
        .back-btn:hover { background: #f5ece0; }
        .refresh-btn {
          border-radius: 99px; border: 1px solid #e0d8c9;
          background: rgba(255,255,255,.88); padding: 6px 12px;
          font-size: 11px; font-weight: 600; color: #4a3520;
          cursor: pointer; font-family: 'DM Sans', sans-serif; white-space: nowrap;
        }
        .hdr-info { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
        .hdr-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(15px, 3.8vw, 21px); font-weight: 700;
          letter-spacing: -0.01em; flex: 1; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .tenant-tag {
          border-radius: 99px; border: 1px solid #e4d5bf;
          background: rgba(255,255,255,.7); padding: 4px 10px;
          font-size: 10px; font-weight: 600; color: #4a3520;
          max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .status-pill { border-radius:99px; border:1px solid; padding:4px 10px; font-size:10px; font-weight:700; white-space:nowrap; flex-shrink:0; }
        .badge-amber { background:#fef3c7; color:#92400e; border-color:#fde68a; }
        .badge-blue  { background:#eff6ff; color:#1e40af; border-color:#bfdbfe; }
        .badge-rose  { background:#fff1f2; color:#9f1239; border-color:#fecdd3; }
        .badge-green { background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }

        /* ── Layout ── */
        .qrs-layout { display: grid; grid-template-columns: 1fr; gap: 10px; }
        @media (min-width: 760px) { .qrs-layout { grid-template-columns: 1fr 290px; } }

        /* ── Cards ── */
        .qrs-card { border-radius: 16px; border: 1px solid #e6dccf; background: rgba(255,255,255,.94); padding: 13px; box-shadow: 0 3px 12px -5px rgba(95,61,15,.08); }

        /* ── Preview ── */
        .preview-wrap { display:flex; justify-content:center; padding:16px 10px 6px; touch-action:pan-y; cursor:grab; }
        .preview-wrap:active { cursor:grabbing; }
        .swipe-hint { text-align:center; font-size:10px; color:#9a7a55; margin:2px 0 4px; }
        @media (min-width:560px) { .swipe-hint { display:none; } }

        /* ── Actions ── */
        .act-row { display:flex; gap:7px; margin-top:11px; }

        /* ── Sidebar ── */
        .sec-label { font-size:9px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:#9b6a2f; display:block; margin-bottom:9px; }
        .qrs-select { width:100%; height:40px; border-radius:12px; border:1.5px solid #ddd4c1; background:#fff; padding:0 11px; font-size:12px; color:#3d2c1a; font-family:'DM Sans',sans-serif; margin-top:4px; -webkit-appearance:none; cursor:pointer; }
        .info-pill { border-radius:11px; border:1px solid #e5d7c0; background:#fff8ea; padding:8px 10px; font-size:9.5px; line-height:1.65; color:#5a4025; margin-top:8px; }
        .payload-box { border-radius:11px; border:1px solid #ece4d6; background:#fffaf3; padding:8px 10px; font-size:9.5px; line-height:1.6; color:#5a4025; word-break:break-all; margin-top:6px; cursor:pointer; transition:background .15s; }
        .payload-box:hover { background:#fff5e6; }
        .error-box { border-radius:11px; border:1px solid #fecaca; background:#fef2f2; padding:8px 10px; font-size:11px; color:#b91c1c; margin-top:6px; }
        .tpl-card { border-radius:16px; border:1.5px solid; padding:13px; transition:all .3s; }
      `}</style>

      <div className="qrs">
        <div className="qrs-wrap">

          {/* Header */}
          <header className="qrs-hdr">
            <div className="hdr-top">
              <button className="back-btn" onClick={() => router.push("/dashboard/tables")}>← Tables</button>
              <button className="refresh-btn" onClick={() => refetch()}>{isTablesFetching ? "…" : "↺ Refresh"}</button>
            </div>
            <div className="hdr-info">
              <h1 className="hdr-title">{table ? `${table.name} · T${table.number}` : "Loading…"}</h1>
              <span className="tenant-tag">{tenantName}</span>
              {table && <span className={`status-pill ${statusBadgeClass(table.status)}`}>{(table.status || "AVAILABLE").toUpperCase()}</span>}
            </div>
          </header>

          {isTablesLoading && (
            <div className="qrs-card" style={{ textAlign: "center", padding: 40, color: "#8a7060", fontSize: 13 }}>Loading…</div>
          )}
          {!isTablesLoading && !table && (
            <div className="error-box">Table not found. Please refresh and try again.</div>
          )}

          {!isTablesLoading && table && (
            <div className="qrs-layout">

              {/* LEFT */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                {/* Card preview */}
                <div className="qrs-card" style={{ padding: 0, overflow: "hidden" }}>
                  <div className="preview-wrap" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                    <QrCard t={tpl} qrSrcUrl={preview} tableName={table.name} tableNumber={table.number} tenantName={tenantName} isGenerating={isQrFetching} />
                  </div>
                  <p className="swipe-hint">← swipe to change template →</p>
                  <TemplateSwiper activeId={templateId} onChange={setTemplateId} />
                  <div style={{ height: 10 }} />
                </div>

                {/* Actions */}
                <div className="qrs-card">
                  <span className="sec-label">Quick Actions</span>
                  <div className="act-row">
                    <ActionBtn icon="🔄" label={isQrFetching ? "Wait…" : "Generate"} onClick={generateQr} disabled={isQrFetching} variant="ghost" />
                    <ActionBtn icon="⬇️" label={downloading ? "Wait…" : "Download"} onClick={downloadCard} disabled={!qr || downloading} variant="amber" />
                    <ActionBtn icon={copied ? "✅" : "📋"} label={copied ? "Copied!" : "Copy Link"} onClick={copyLink} disabled={!payloadUrl} variant="green" />
                    <ActionBtn icon="📤" label={sharing ? "Wait…" : "Share"} onClick={shareLink} disabled={!payloadUrl || sharing} variant="blue" />
                  </div>
                  {error && <div className="error-box">{error}</div>}
                </div>
              </div>

              {/* RIGHT SIDEBAR */}
              <aside style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                {/* Template info */}
                <div className="tpl-card" style={{ background: tpl.bg, borderColor: `${tpl.accent}44`, boxShadow: `0 6px 20px -8px ${tpl.accent}44` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: tpl.isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                      {tpl.icons.split("  ")[0]}
                    </div>
                    <div>
                      <p style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: tpl.isDark ? "#fff" : "#1a0800" }}>{tpl.name}</p>
                      <p style={{ fontSize: 9, color: tpl.isDark ? "rgba(255,255,255,0.44)" : "rgba(0,0,0,0.40)", marginTop: 1 }}>{tpl.tagline}</p>
                    </div>
                  </div>
                  <div style={{ height: 1, margin: "10px 0", background: `linear-gradient(90deg,transparent,${tpl.accent}44,transparent)` }} />
                  <p style={{ fontSize: 12, fontStyle: "italic", fontWeight: 700, color: tpl.isDark ? "rgba(255,255,255,0.76)" : "rgba(0,0,0,0.60)", lineHeight: 1.5, whiteSpace: "pre-line", fontFamily: "Georgia,serif" }}>"{tpl.headline}"</p>
                  <p style={{ fontSize: 10, color: tpl.accent, fontWeight: 700, marginTop: 6 }}>{tpl.cta}</p>
                  <p style={{ fontSize: 9.5, color: tpl.isDark ? "rgba(255,255,255,0.36)" : "rgba(0,0,0,0.34)", marginTop: 2 }}>{tpl.hint}</p>
                </div>

                {/* Settings */}
                <div className="qrs-card">
                  <span className="sec-label">Output Settings</span>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#6a5035", display: "block" }}>
                    QR Format
                    <select className="qrs-select" value={format} onChange={(e) => setFormat(e.target.value as TableQrFormat)}>
                      <option value="dataUrl">PNG — best for printing</option>
                      <option value="svg">SVG — scales to any size</option>
                    </select>
                  </label>
                  <div className="info-pill">🔗 Links to <strong style={{ color: "#3d2010" }}>{FRONTEND_PUBLIC_URL}</strong></div>
                  {payloadUrl && (
                    <div className="payload-box" onClick={copyLink} title="Click to copy">
                      <p style={{ fontWeight: 700, color: "#3d2010", marginBottom: 2, fontSize: 9.5 }}>
                        Public URL {copied ? "✅ copied" : "· tap to copy"}
                      </p>
                      {payloadUrl}
                    </div>
                  )}
                </div>

              </aside>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
