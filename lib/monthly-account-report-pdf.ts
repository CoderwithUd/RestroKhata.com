export type MonthlyAccountReportRow = {
  month: string;
  label: string;
  orders: number;
  invoices: number;
  paidInvoices: number;
  sales: number;
  expenses: number;
  profit: number;
};

export type MonthlyAccountReportTotals = {
  orders: number;
  invoices: number;
  paidInvoices: number;
  sales: number;
  expenses: number;
  profit: number;
};

export type MonthlyAccountReportMeta = {
  tenantName?: string;
  title?: string;
  rangeLabel?: string;
  generatedAt?: string;
};

type PdfPage = { content: string };

const PAGE_W = 842;
const PAGE_H = 595;
const MX = 28;
const FOOTER_H = 36;
const HEADER_H = 82;
const SUMMARY_H = 62;
const TABLE_HEAD_H = 26;
const ROW_H = 26;
const TABLE_W = PAGE_W - MX * 2;

const C = {
  pageBg: "0.975 0.978 0.984",
  headerBg: "0.996 0.992 0.980",
  accent: "0.871 0.580 0.086",
  accentLight: "0.992 0.949 0.859",
  slate: "0.224 0.286 0.376",
  slateSoft: "0.929 0.941 0.961",
  rowEven: "1 1 1",
  rowOdd: "0.964 0.969 0.976",
  textDark: "0.133 0.157 0.208",
  textMid: "0.380 0.424 0.502",
  textSoft: "0.576 0.620 0.686",
  textWhite: "1 1 1",
  green: "0.071 0.525 0.278",
  red: "0.741 0.204 0.247",
  border: "0.843 0.863 0.894",
};

const COLS = [
  { label: "Month", x: MX + 8, w: 152 },
  { label: "Orders", x: MX + 164, w: 74 },
  { label: "Invoices", x: MX + 240, w: 78 },
  { label: "Paid", x: MX + 320, w: 70 },
  { label: "Sales", x: MX + 392, w: 120 },
  { label: "Expenses", x: MX + 514, w: 120 },
  { label: "Profit", x: MX + 636, w: 150 },
] as const;

function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function txt(
  cmds: string[],
  x: number,
  y: number,
  text: string,
  size = 10,
  font: "F1" | "F2" = "F1",
  rgb?: string,
) {
  const fill = rgb ? `${rgb} rg ` : "";
  cmds.push(`BT ${fill}/${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(text)}) Tj ET`);
}

function rect(
  cmds: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
  lineWidth = 0.5,
) {
  cmds.push(`q ${fill} rg`);
  if (stroke) cmds.push(`${stroke} RG ${lineWidth} w`);
  cmds.push(`${x} ${y} ${w} ${h} re ${stroke ? "B" : "f"} Q`);
}

function line(
  cmds: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke = C.border,
  lineWidth = 0.5,
) {
  cmds.push(`q ${stroke} RG ${lineWidth} w ${x1} ${y1} m ${x2} ${y2} l S Q`);
}

function fmtCurrency(value?: number): string {
  if (!value) return "Rs 0";
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtDate(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = parsed.toLocaleString("en-IN", { month: "short" });
  return `${day} ${month} ${parsed.getFullYear()}`;
}

function crop(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}...`;
}

function drawHeader(cmds: string[], meta: MonthlyAccountReportMeta): number {
  rect(cmds, 0, PAGE_H - HEADER_H, PAGE_W, HEADER_H, C.headerBg);
  line(cmds, 0, PAGE_H - HEADER_H, PAGE_W, PAGE_H - HEADER_H, C.accent, 2);
  rect(cmds, MX, PAGE_H - HEADER_H + 14, 4, HEADER_H - 28, C.accent);

  txt(cmds, MX + 14, PAGE_H - 31, meta.tenantName || "Restaurant", 18, "F2", C.textDark);
  txt(cmds, MX + 14, PAGE_H - 51, meta.title || "Monthly Account Report", 10, "F1", C.textMid);

  rect(cmds, PAGE_W - 246, PAGE_H - HEADER_H + 14, 218, 52, C.accentLight, C.accent, 0.6);
  txt(cmds, PAGE_W - 234, PAGE_H - 34, "Range", 8, "F2", C.accent);
  txt(cmds, PAGE_W - 234, PAGE_H - 49, meta.rangeLabel || "All months", 9.5, "F2", C.textDark);
  txt(cmds, PAGE_W - 234, PAGE_H - 63, `Generated: ${fmtDate(meta.generatedAt)}`, 7.5, "F1", C.textMid);

  return PAGE_H - HEADER_H;
}

function drawSummary(cmds: string[], topY: number, totals: MonthlyAccountReportTotals): number {
  const cards = [
    { label: "TOTAL SALES", value: fmtCurrency(totals.sales), sub: `${totals.paidInvoices} paid bills`, accent: C.accent },
    { label: "TOTAL ORDERS", value: String(totals.orders), sub: `${totals.invoices} invoices`, accent: "0.251 0.525 0.792" },
    { label: "TOTAL EXPENSES", value: fmtCurrency(totals.expenses), sub: "All recorded expenses", accent: "0.420 0.475 0.561" },
    {
      label: "NET PROFIT",
      value: fmtCurrency(totals.profit),
      sub: "After expense deduction",
      accent: totals.profit >= 0 ? C.green : C.red,
    },
  ];

  const gap = 10;
  const cardW = (TABLE_W - gap * 3) / 4;
  const cardY = topY - SUMMARY_H + 8;

  cards.forEach((card, index) => {
    const x = MX + index * (cardW + gap);
    rect(cmds, x, cardY, cardW, 44, C.rowEven, C.border, 0.6);
    rect(cmds, x, cardY, 3, 44, card.accent);
    txt(cmds, x + 10, cardY + 29, card.label, 7.5, "F2", C.textSoft);
    txt(cmds, x + 10, cardY + 14, card.value, 12, "F2", card.accent);
    txt(cmds, x + 10, cardY + 5, card.sub, 7.5, "F1", C.textSoft);
  });

  return topY - SUMMARY_H;
}

function drawTableHeader(cmds: string[], topY: number): number {
  const y = topY - TABLE_HEAD_H;
  rect(cmds, MX, y, TABLE_W, TABLE_HEAD_H, C.slate);
  COLS.forEach((col) => txt(cmds, col.x + 4, y + 9, col.label, 7.5, "F2", C.textWhite));
  return y;
}

function drawRows(
  cmds: string[],
  rows: MonthlyAccountReportRow[],
  startY: number,
  pageIndex: number,
  pageRows: number,
) {
  if (!rows.length) {
    rect(cmds, MX, startY - ROW_H, TABLE_W, ROW_H, C.rowEven, C.border);
    txt(cmds, MX + 12, startY - 17, "No monthly rows available.", 9, "F1", C.textMid);
    return;
  }

  rows.forEach((row, index) => {
    const y = startY - (index + 1) * ROW_H;
    rect(cmds, MX, y, TABLE_W, ROW_H - 1, index % 2 === 0 ? C.rowEven : C.rowOdd);
    line(cmds, MX, y, MX + TABLE_W, y, C.border, 0.4);

    txt(cmds, COLS[0].x + 4, y + 9, crop(`${row.label} (${row.month})`, 24), 8, "F2", C.textDark);
    txt(cmds, COLS[1].x + 20, y + 9, String(row.orders), 8, "F1", C.textDark);
    txt(cmds, COLS[2].x + 20, y + 9, String(row.invoices), 8, "F1", C.textDark);
    txt(cmds, COLS[3].x + 20, y + 9, String(row.paidInvoices), 8, "F1", C.green);
    txt(cmds, COLS[4].x + 4, y + 9, fmtCurrency(row.sales), 8, "F2", C.textDark);
    txt(cmds, COLS[5].x + 4, y + 9, fmtCurrency(row.expenses), 8, "F1", C.textDark);
    txt(cmds, COLS[6].x + 4, y + 9, fmtCurrency(row.profit), 8, "F2", row.profit >= 0 ? C.green : C.red);
  });

  const footerY = startY - rows.length * ROW_H;
  if (pageIndex === pageRows - 1) {
    line(cmds, MX, footerY, MX + TABLE_W, footerY, C.border, 0.6);
  }
}

function drawGrandTotal(cmds: string[], y: number, totals: MonthlyAccountReportTotals) {
  rect(cmds, MX, y - ROW_H, TABLE_W, ROW_H, C.accentLight, C.accent, 0.6);
  txt(cmds, COLS[0].x + 4, y - 17, "All Time Total", 8.5, "F2", C.textDark);
  txt(cmds, COLS[1].x + 20, y - 17, String(totals.orders), 8, "F2", C.textDark);
  txt(cmds, COLS[2].x + 20, y - 17, String(totals.invoices), 8, "F2", C.textDark);
  txt(cmds, COLS[3].x + 20, y - 17, String(totals.paidInvoices), 8, "F2", C.green);
  txt(cmds, COLS[4].x + 4, y - 17, fmtCurrency(totals.sales), 8.5, "F2", C.textDark);
  txt(cmds, COLS[5].x + 4, y - 17, fmtCurrency(totals.expenses), 8.5, "F2", C.textDark);
  txt(cmds, COLS[6].x + 4, y - 17, fmtCurrency(totals.profit), 8.5, "F2", totals.profit >= 0 ? C.green : C.red);
}

function drawFooter(cmds: string[], index: number, total: number) {
  rect(cmds, 0, 0, PAGE_W, FOOTER_H, C.slate);
  line(cmds, 0, FOOTER_H, PAGE_W, FOOTER_H, C.accent, 1.4);
  txt(cmds, MX, 14, "Powered by RestroKhata", 8, "F2", "0.770 0.816 0.882");
  txt(cmds, PAGE_W - 108, 14, `Page ${index + 1}/${total}`, 8, "F1", "0.770 0.816 0.882");
}

function buildPages(
  months: MonthlyAccountReportRow[],
  totals: MonthlyAccountReportTotals,
  meta: MonthlyAccountReportMeta,
): PdfPage[] {
  const usableHeightFirst = PAGE_H - HEADER_H - SUMMARY_H - TABLE_HEAD_H - FOOTER_H - 22;
  const usableHeightNext = PAGE_H - HEADER_H - TABLE_HEAD_H - FOOTER_H - 18;
  const firstPageRows = Math.max(1, Math.floor(usableHeightFirst / ROW_H) - 1);
  const nextPageRows = Math.max(1, Math.floor(usableHeightNext / ROW_H) - 1);

  const pages: MonthlyAccountReportRow[][] = [];
  let remaining = [...months];
  let first = true;

  while (remaining.length > 0) {
    const pageSize = first ? firstPageRows : nextPageRows;
    pages.push(remaining.slice(0, pageSize));
    remaining = remaining.slice(pageSize);
    first = false;
  }

  if (!pages.length) pages.push([]);

  return pages.map((rows, index) => {
    const cmds: string[] = [];
    rect(cmds, 0, FOOTER_H, PAGE_W, PAGE_H - FOOTER_H, C.pageBg);
    drawFooter(cmds, index, pages.length);

    let topY = drawHeader(cmds, meta);
    if (index === 0) topY = drawSummary(cmds, topY - 8, totals) - 6;
    else topY -= 12;

    const tableTop = drawTableHeader(cmds, topY);
    drawRows(cmds, rows, tableTop, index, pages.length);

    if (index === pages.length - 1) {
      const totalY = tableTop - Math.max(rows.length, 1) * ROW_H - 8;
      drawGrandTotal(cmds, totalY, totals);
    }

    return { content: cmds.join("\n") };
  });
}

function buildPdf(pages: PdfPage[]): string {
  const regularFontId = 3 + pages.length * 2;
  const boldFontId = regularFontId + 1;

  const objects: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    [regularFontId]: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    [boldFontId]: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  };

  pages.forEach((page, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${page.content.length} >>\nstream\n${page.content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  const maxId = boldFontId;

  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= maxId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

export function downloadMonthlyAccountReportPdf(args: {
  months: MonthlyAccountReportRow[];
  totals: MonthlyAccountReportTotals;
  meta?: MonthlyAccountReportMeta;
}): void {
  if (typeof window === "undefined") return;

  const pages = buildPages(
    [...args.months].reverse(),
    args.totals,
    {
      ...args.meta,
      generatedAt: args.meta?.generatedAt || new Date().toISOString(),
    },
  );

  const pdf = buildPdf(pages);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `monthly-account-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
