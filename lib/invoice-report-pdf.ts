import type { InvoiceRecord } from "@/store/types/invoices";

export type InvoiceReportMeta = {
  tenantName?: string;
  gstNumber?: string;
  contactNumber?: string;
  address?: string;
  title?: string;
  rangeLabel?: string;
  generatedAt?: string;
};

type ReportRow = {
  invoiceId:   string;
  date:        string;
  table:       string;
  customer:    string;
  items:       string;
  status:      string;
  paymentType: string;
  tax:         number;
  discount:    number;
  amount:      number;
};

type PdfPage = { content: string };

const PAGE_W = 842;
const PAGE_H = 595;
const MX     = 28;

const C = {
  amber:        "0.925 0.690 0.125",
  amberLight:   "0.996 0.953 0.871",
  pageBg:       "0.972 0.975 0.980",
  headerBg:     "0.992 0.996 1.000",
  tableHeadBg:  "0.224 0.286 0.376",
  rowEven:      "1.000 1.000 1.000",
  rowOdd:       "0.957 0.961 0.969",
  footerBg:     "0.239 0.298 0.384",
  textDark:     "0.133 0.157 0.208",
  textMid:      "0.376 0.420 0.498",
  textLight:    "0.580 0.620 0.686",
  textWhite:    "1 1 1",
  textAmber:    "0.698 0.478 0.039",
  textTableHd:  "0.780 0.820 0.890",
  statusPaidBg:  "0.882 0.965 0.918",
  statusPaidTxt: "0.086 0.502 0.278",
  statusPendBg:  "0.996 0.929 0.878",
  statusPendTxt: "0.729 0.282 0.051",
  borderLight:  "0.851 0.863 0.886",
  borderMid:    "0.753 0.773 0.812",
  borderAmber:  "0.925 0.690 0.125",
};

function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function fmtCurrency(v?: number): string {
  if (v == null || v === 0) return "Rs 0";
  return `Rs ${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function fmtDate(v?: string): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const day = d.getDate().toString().padStart(2, "0");
  const mon = d.toLocaleString("en-IN", { month: "short" });
  const h   = d.getHours();
  const m   = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${mon} ${d.getFullYear()}, ${h}:${m}`;
}
function shortId(id: string): string {
  return id ? id.slice(-6).toUpperCase() : "------";
}
function invoiceAmt(inv: InvoiceRecord): number {
  return inv.payment?.paidAmount ?? inv.balanceDue ?? inv.totalDue ?? inv.grandTotal ?? inv.subTotal ?? 0;
}
function totalItemCount(inv: InvoiceRecord): number {
  if (!inv.items?.length) return 0;
  return inv.items.reduce((s: number, it: any) => s + (it.quantity ?? it.qty ?? 1), 0);
}
function crop(v: string, max: number): string {
  const s = v.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function txt(
  cmds: string[], x: number, y: number, text: string,
  size = 10, font: "F1" | "F2" = "F1", rgb?: string,
) {
  const col = rgb ? `${rgb} rg ` : "";
  cmds.push(`BT ${col}/${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(text)}) Tj ET`);
}
function rect(
  cmds: string[], x: number, y: number, w: number, h: number,
  fill: string, stroke?: string, lw = 0.5,
) {
  cmds.push(`q ${fill} rg`);
  if (stroke) cmds.push(`${stroke} RG ${lw} w`);
  cmds.push(`${x} ${y} ${w} ${h} re ${stroke ? "B" : "f"} Q`);
}
function line(
  cmds: string[], x1: number, y1: number, x2: number, y2: number,
  stroke = C.borderLight, lw = 0.5,
) {
  cmds.push(`q ${stroke} RG ${lw} w ${x1} ${y1} m ${x2} ${y2} l S Q`);
}
function badge(
  cmds: string[], x: number, y: number,
  label: string, bgRgb: string, textRgb: string,
) {
  const W = 46, H = 13;
  rect(cmds, x, y, W, H, bgRgb);
  txt(cmds, x + 3, y + 4, label, 7, "F2", textRgb);
}

const COLS = [
  { label: "#",         x: MX + 2,   w: 22  },
  { label: "Invoice",   x: MX + 24,  w: 68  },
  { label: "Date",      x: MX + 94,  w: 94  },
  { label: "Table",     x: MX + 190, w: 62  },
  { label: "Customer",  x: MX + 254, w: 108 },
  { label: "Items/Qty", x: MX + 364, w: 52  },
  { label: "Status",    x: MX + 418, w: 56  },
  { label: "Payment",   x: MX + 476, w: 58  },
  { label: "Tax",       x: MX + 536, w: 68  },
  { label: "Discount",  x: MX + 606, w: 70  },
  { label: "Amount",    x: MX + 678, w: 108 },
] as const;

const TABLE_W  = PAGE_W - MX * 2;
const TH_H     = 26;
const ROW_H    = 24;
const FOOTER_H = 36;

function buildHeader(cmds: string[], meta: InvoiceReportMeta): number {
  const H = 88;
  rect(cmds, 0, PAGE_H - H, PAGE_W, H, C.headerBg);
  line(cmds, 0, PAGE_H - H, PAGE_W, PAGE_H - H, C.amber, 2);
  rect(cmds, MX, PAGE_H - H + 12, 3, H - 24, C.amber);
  txt(cmds, MX + 12, PAGE_H - 32, meta.tenantName || "Restaurant", 18, "F2", C.textDark);
  txt(cmds, MX + 12, PAGE_H - 52, meta.title || "Invoice Accounting Report", 10, "F1", C.textMid);
  const metaLine = [
    meta.address       || "",
    meta.contactNumber ? `Ph: ${meta.contactNumber}` : "",
    meta.gstNumber     ? `GSTIN: ${meta.gstNumber}`  : "",
  ].filter(Boolean).join("   .   ");
  txt(cmds, MX + 12, PAGE_H - 70, metaLine, 8, "F1", C.textLight);
  const RX = PAGE_W - 240;
  rect(cmds, RX, PAGE_H - H + 16, 212, 56, C.amberLight, C.borderAmber, 0.6);
  txt(cmds, RX + 10, PAGE_H - 36, "Report Range", 7.5, "F2", C.textAmber);
  txt(cmds, RX + 10, PAGE_H - 52, meta.rangeLabel || "All Time", 10, "F2", C.textDark);
  txt(cmds, RX + 10, PAGE_H - 66, `Generated: ${fmtDate(meta.generatedAt)}`, 7.5, "F1", C.textMid);
  return PAGE_H - H;
}

function buildCards(
  cmds: string[], topY: number,
  totalInv: number, paid: number, pending: number,
  tax: number, disc: number, total: number,
): number {
  const CARD_H  = 50;
  const GAP     = 10;
  const CARD_W  = (TABLE_W - GAP * 3) / 4;
  const bandH   = CARD_H + 18;
  const bandY   = topY - bandH;
  const cardY   = bandY + 10;

  rect(cmds, 0, bandY, PAGE_W, bandH, "0.984 0.988 0.996");
  line(cmds, 0, bandY + bandH, PAGE_W, bandY + bandH, C.borderLight, 0.5);
  line(cmds, 0, bandY, PAGE_W, bandY, C.borderLight, 0.5);

  const cards: Array<{ label: string; value: string; sub: string; highlight?: boolean }> = [
    { label: "TOTAL INVOICES",  value: String(totalInv),       sub: "this period"                    },
    { label: "PAID / PENDING",  value: `${paid} / ${pending}`, sub: "invoices"                       },
    { label: "TAX COLLECTED",   value: fmtCurrency(tax),        sub: `Disc: ${fmtCurrency(disc)}`    },
    { label: "GRAND TOTAL",     value: fmtCurrency(total),      sub: "revenue collected", highlight: true },
  ];

  cards.forEach(({ label, value, sub, highlight }, i) => {
    const cx = MX + i * (CARD_W + GAP);
    rect(cmds, cx, cardY, CARD_W, CARD_H, "1 1 1", C.borderLight, 0.6);
    const barColor = highlight ? C.amber : "0.376 0.502 0.753";
    rect(cmds, cx, cardY, 3, CARD_H, barColor);
    txt(cmds, cx + 10, cardY + CARD_H - 14, label, 7, "F2", C.textLight);
    txt(cmds, cx + 10, cardY + 18, value, highlight ? 13 : 12, "F2", highlight ? C.textAmber : C.textDark);
    txt(cmds, cx + 10, cardY + 7, sub, 7.5, "F1", C.textLight);
  });

  return bandY;
}

function buildTableHeader(cmds: string[], topY: number): number {
  const y = topY - TH_H;
  rect(cmds, MX, y, TABLE_W, TH_H, C.tableHeadBg);
  line(cmds, MX, y, MX + TABLE_W, y, C.amber, 1.2);
  COLS.forEach((col) => {
    txt(cmds, col.x + 3, y + 9, col.label, 7.5, "F2", C.textTableHd);
  });
  COLS.slice(1).forEach((col) => {
    line(cmds, col.x, y + 4, col.x, y + TH_H - 4, "0.314 0.388 0.494", 0.4);
  });
  return y;
}

function buildRows(
  cmds: string[],
  pageRows: ReportRow[],
  startY: number,
  globalOffset: number,
) {
  if (pageRows.length === 0) {
    rect(cmds, MX, startY - ROW_H - 4, TABLE_W, ROW_H + 8, C.rowEven, C.borderLight);
    txt(cmds, MX + 16, startY - ROW_H + 4, "No invoices found for selected filter.", 9, "F1", C.textMid);
    return;
  }

  pageRows.forEach((row, i) => {
    const ry   = startY - (i + 1) * ROW_H;
    const fill = i % 2 === 0 ? C.rowEven : C.rowOdd;
    rect(cmds, MX, ry, TABLE_W, ROW_H - 1, fill);
    line(cmds, MX, ry, MX + TABLE_W, ry, C.borderLight, 0.3);
    const ty = ry + 7;

    txt(cmds, COLS[0].x + 2, ty, String(globalOffset + i + 1), 7.5, "F1", C.textLight);
    txt(cmds, COLS[1].x + 3, ty, crop(row.invoiceId, 11), 8, "F2", C.textAmber);
    txt(cmds, COLS[2].x + 3, ty, crop(row.date, 16), 7.5, "F1", C.textMid);
    txt(cmds, COLS[3].x + 3, ty, crop(row.table, 10), 7.5, "F1", C.textDark);
    txt(cmds, COLS[4].x + 3, ty, crop(row.customer, 18), 7.5, "F1", C.textDark);
    txt(cmds, COLS[5].x + 3, ty, row.items, 7.5, "F2", C.textDark);

    const isPaid = row.status.toUpperCase() === "PAID";
    badge(
      cmds, COLS[6].x + 2, ry + 5,
      isPaid ? "PAID" : crop(row.status.toUpperCase(), 7),
      isPaid ? C.statusPaidBg : C.statusPendBg,
      isPaid ? C.statusPaidTxt : C.statusPendTxt,
    );

    txt(cmds, COLS[7].x + 3, ty, crop(row.paymentType, 8), 7.5, "F1", C.textMid);
    txt(cmds, COLS[8].x + 3, ty, fmtCurrency(row.tax), 7.5, "F1", C.textDark);

    const discTxt = row.discount > 0 ? fmtCurrency(row.discount) : "-";
    txt(cmds, COLS[9].x + 3, ty, discTxt, 7.5, "F1", row.discount > 0 ? C.statusPendTxt : C.textLight);

    txt(cmds, COLS[10].x + 3, ty, fmtCurrency(row.amount), 8, "F2", C.textAmber);
  });

  const tableBottom = startY - pageRows.length * ROW_H;
  line(cmds, MX, tableBottom, MX + TABLE_W, tableBottom, C.borderMid, 0.6);
}

function buildFooter(cmds: string[], pageIdx: number, totalPages: number) {
  rect(cmds, 0, 0, PAGE_W, FOOTER_H, C.footerBg);
  line(cmds, 0, FOOTER_H, PAGE_W, FOOTER_H, C.amber, 1.5);
  txt(cmds, MX, 14, "Powered by RestroKhata", 8, "F2", "0.620 0.680 0.760");
  rect(cmds, PAGE_W / 2 - 3, 14, 6, 6, C.amber);
  txt(cmds, PAGE_W - 130, 14, `Page ${pageIdx + 1}  /  ${totalPages}`, 8, "F1", "0.620 0.680 0.760");
}

function buildContinuationHeader(cmds: string[], meta: InvoiceReportMeta): number {
  const H = 32;
  rect(cmds, 0, PAGE_H - H, PAGE_W, H, C.headerBg);
  line(cmds, 0, PAGE_H - H, PAGE_W, PAGE_H - H, C.amber, 1.5);
  rect(cmds, MX, PAGE_H - H + 7, 3, H - 14, C.amber);
  txt(cmds, MX + 10, PAGE_H - 18, meta.tenantName || "RestroKhata", 10, "F2", C.textDark);
  txt(cmds, MX + 10, PAGE_H - 29, `${meta.title || "Invoice Report"}  --  continued`, 7.5, "F1", C.textMid);
  txt(cmds, PAGE_W - 200, PAGE_H - 18, meta.rangeLabel || "All Time", 8.5, "F1", C.textAmber);
  return PAGE_H - H;
}

function rowFromInvoice(inv: InvoiceRecord, custMap: Map<string, string>): ReportRow {
  const itemCount = totalItemCount(inv);
  const itemLabel = itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? "s" : ""}` : "-";
  return {
    invoiceId:   `INV-${shortId(inv.id)}`,
    date:        fmtDate(inv.createdAt),
    table:       inv.table?.name || `Table ${inv.table?.number ?? "-"}`,
    customer:    custMap.get(inv.id) || "-",
    items:       itemLabel,
    status:      inv.status || "-",
    paymentType: inv.payment?.method || "PENDING",
    tax:         inv.taxTotal ?? 0,
    discount:    inv.discount?.amount ?? 0,
    amount:      invoiceAmt(inv),
  };
}

function buildPages(
  invoices: InvoiceRecord[],
  custMap: Map<string, string>,
  meta: InvoiceReportMeta,
): PdfPage[] {
  const rows = invoices.map((inv) => rowFromInvoice(inv, custMap));
  const totalInv  = rows.length;
  const totalTax  = rows.reduce((s, r) => s + r.tax,     0);
  const totalDisc = rows.reduce((s, r) => s + r.discount, 0);
  const totalAmt  = rows.reduce((s, r) => s + r.amount,   0);
  const paid      = rows.filter((r) => r.status.toUpperCase() === "PAID").length;
  const pending   = totalInv - paid;

  const FOOTER_ZONE    = FOOTER_H + 8;
  const FIRST_USED     = 88 + 68 + 4 + TH_H;
  const FIRST_ROW_AREA = PAGE_H - FIRST_USED - FOOTER_ZONE;
  const ROWS_FIRST     = Math.max(1, Math.floor(FIRST_ROW_AREA / ROW_H));
  const NEXT_USED      = 32 + 6 + TH_H;
  const NEXT_ROW_AREA  = PAGE_H - NEXT_USED - FOOTER_ZONE;
  const ROWS_NEXT      = Math.max(1, Math.floor(NEXT_ROW_AREA / ROW_H));

  const pageSlices: ReportRow[][] = [];
  if (rows.length === 0) {
    pageSlices.push([]);
  } else {
    let rem = [...rows];
    let first = true;
    while (rem.length > 0) {
      const cap = first ? ROWS_FIRST : ROWS_NEXT;
      pageSlices.push(rem.slice(0, cap));
      rem   = rem.slice(cap);
      first = false;
    }
  }

  const totalPages = pageSlices.length;
  const pages: PdfPage[] = [];

  pageSlices.forEach((pageRows, pi) => {
    const cmds: string[] = [];
    const isFirst = pi === 0;
    rect(cmds, 0, FOOTER_H, PAGE_W, PAGE_H - FOOTER_H, C.pageBg);
    buildFooter(cmds, pi, totalPages);

    let contentTopY: number;
    if (isFirst) {
      const belowHeader = buildHeader(cmds, meta);
      const belowCards  = buildCards(cmds, belowHeader, totalInv, paid, pending, totalTax, totalDisc, totalAmt);
      contentTopY = belowCards - 4;
    } else {
      contentTopY = buildContinuationHeader(cmds, meta) - 6;
    }

    const belowTH = buildTableHeader(cmds, contentTopY);
    const globalOffset = pageSlices.slice(0, pi).reduce((s, p) => s + p.length, 0);
    buildRows(cmds, pageRows, belowTH, globalOffset);
    pages.push({ content: cmds.join("\n") });
  });

  return pages;
}

function buildPdf(pages: PdfPage[]): string {
  const F1id = 3 + pages.length * 2;
  const F2id = F1id + 1;

  const objects: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    [F1id]: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    [F2id]: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  };

  pages.forEach((page, i) => {
    const pid = 3 + i * 2;
    const cid = pid + 1;
    objects[pid] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${F1id} 0 R /F2 ${F2id} 0 R >> >> /Contents ${cid} 0 R >>`;
    objects[cid] = `<< /Length ${page.content.length} >>\nstream\n${page.content}\nendstream`;
  });

  const maxId = F2id;
  let pdf = "%PDF-1.4\n";
  const off: number[] = [0];
  for (let id = 1; id <= maxId; id++) {
    off[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= maxId; id++) {
    pdf += `${String(off[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

export function downloadInvoiceReportPdf(args: {
  invoices: InvoiceRecord[];
  customerNameById: Map<string, string>;
  meta?: InvoiceReportMeta;
}): void {
  if (typeof window === "undefined") return;
  const pdf = buildPdf(
    buildPages(args.invoices, args.customerNameById, {
      ...args.meta,
      generatedAt: args.meta?.generatedAt || new Date().toISOString(),
    }),
  );
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `invoice-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}