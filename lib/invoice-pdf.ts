import type { InvoiceRecord } from "@/store/types/invoices";

export type InvoicePrintMeta = {
  tenantName?: string;
  gstNumber?: string;
  contactNumber?: string;
  address?: string;
  customerName?: string;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT_MARGIN = 38;
const TOP_START = 804;
const LINE_HEIGHT = 15;
const MAX_LINES_PER_PAGE = 48;
const TEXT_WIDTH = 86;

function fmtCurrency(value?: number): string {
  if (value == null) return "Rs 0";
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function itemLineTotal(unitPrice?: number, qty?: number, lineTotal?: number): number {
  if (typeof lineTotal === "number" && Number.isFinite(lineTotal)) return lineTotal;
  const unit = typeof unitPrice === "number" && Number.isFinite(unitPrice) ? unitPrice : 0;
  const quantity = typeof qty === "number" && Number.isFinite(qty) ? qty : 0;
  return unit * quantity;
}

function wrapLine(value: string, maxChars = TEXT_WIDTH): string[] {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return [""];

  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function ruler(char = "-"): string {
  return char.repeat(TEXT_WIDTH);
}

function twoCol(left: string, right: string): string {
  const safeRight = right.length > 28 ? right.slice(0, 28) : right;
  const leftSpace = Math.max(1, TEXT_WIDTH - safeRight.length);
  const safeLeft = left.length > leftSpace ? left.slice(0, leftSpace) : left;
  return `${safeLeft}${" ".repeat(leftSpace - safeLeft.length)}${safeRight}`;
}

function buildInvoiceLines(invoice: InvoiceRecord, meta?: InvoicePrintMeta): string[] {
  const amountDue = invoice.balanceDue ?? invoice.totalDue ?? invoice.grandTotal ?? invoice.subTotal ?? 0;
  const itemsTotal = (invoice.items || []).reduce(
    (sum, item) => sum + itemLineTotal(item.unitPrice, item.quantity, item.lineTotal),
    0,
  );
  const subtotal = invoice.subTotal ?? itemsTotal;
  const tax = invoice.taxTotal ?? 0;
  const discount = invoice.discount?.amount ?? 0;
  const grand = invoice.grandTotal ?? amountDue ?? subtotal + tax - discount;
  const balance = invoice.balanceDue ?? invoice.totalDue ?? grand;
  const tableLabel = invoice.table?.name || `Table ${invoice.table?.number ?? "-"}`;
  const customerName = meta?.customerName || "-";

  const lines: string[] = [];
  const title = (meta?.tenantName || "RESTAURANT").toUpperCase();
  const centeredTitlePadding = Math.max(0, Math.floor((TEXT_WIDTH - title.length) / 2));
  lines.push(`${" ".repeat(centeredTitlePadding)}${title}`);
  lines.push("TAX INVOICE");
  if (meta?.address) lines.push(...wrapLine(`Address: ${meta.address}`));
  if (meta?.contactNumber) lines.push(`Phone: ${meta.contactNumber}`);
  if (meta?.gstNumber) lines.push(`GSTIN: ${meta.gstNumber}`);
  lines.push(ruler("="));
  lines.push(twoCol(`Invoice No: INV-${invoice.id.slice(-6).toUpperCase()}`, `Status: ${invoice.status}`));
  lines.push(twoCol(`Invoice ID: ${invoice.id}`, `Date: ${fmtDate(invoice.createdAt)}`));
  lines.push(twoCol(`Order ID: ${invoice.orderId}`, `Table: ${tableLabel}`));
  lines.push(`Customer: ${customerName}`);
  lines.push(ruler("-"));
  lines.push(twoCol("Item", "Amount"));
  lines.push(ruler("-"));

  (invoice.items || []).forEach((item, index) => {
    const lineTotal = itemLineTotal(item.unitPrice, item.quantity, item.lineTotal);
    const itemName = `${index + 1}. ${item.name}${item.variantName ? ` (${item.variantName})` : ""}`;
    lines.push(...wrapLine(itemName));
    lines.push(twoCol(`   ${item.quantity} x ${fmtCurrency(item.unitPrice)}`, fmtCurrency(lineTotal)));
    if (item.note) {
      lines.push(...wrapLine(`   Note: ${item.note}`));
    }
  });

  lines.push(ruler("-"));
  lines.push(twoCol("Subtotal", fmtCurrency(subtotal)));
  lines.push(twoCol("Tax", fmtCurrency(tax)));
  lines.push(twoCol("Discount", fmtCurrency(discount)));
  lines.push(twoCol("Grand Total", fmtCurrency(grand)));
  lines.push(twoCol("Balance Due", fmtCurrency(balance)));

  if (invoice.payment) {
    lines.push(ruler("-"));
    lines.push(twoCol("Payment Method", invoice.payment.method));
    lines.push(twoCol("Paid Amount", fmtCurrency(invoice.payment.paidAmount)));
    if (invoice.payment.reference) lines.push(...wrapLine(`Reference: ${invoice.payment.reference}`));
    if (invoice.payment.paidAt) lines.push(`Paid At: ${fmtDate(invoice.payment.paidAt)}`);
  }

  lines.push(ruler("="));
  lines.push("Thank you for visiting.");
  lines.push("Generated from Restro Khata.");
  return lines;
}

function paginate(lines: string[]): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += MAX_LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + MAX_LINES_PER_PAGE));
  }
  return pages.length ? pages : [["Invoice"]];
}

function buildContentStream(lines: string[]): string {
  const commands = ["BT", "/F1 10 Tf"];
  lines.forEach((line, idx) => {
    const y = TOP_START - idx * LINE_HEIGHT;
    commands.push(`1 0 0 1 ${LEFT_MARGIN} ${y} Tm (${escapePdfText(line)}) Tj`);
  });
  commands.push("ET");
  return commands.join("\n");
}

function buildPdf(pageLines: string[][]): string {
  const fontObjectId = 3 + pageLines.length * 2;
  const objects: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: `<< /Type /Pages /Kids [${pageLines.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pageLines.length} >>`,
    [fontObjectId]: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  };

  pageLines.forEach((lines, i) => {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const content = buildContentStream(lines);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  const maxId = fontObjectId;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

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

export function downloadInvoicePdf(invoice: InvoiceRecord, meta?: InvoicePrintMeta): void {
  if (typeof window === "undefined") return;

  const pdf = buildPdf(paginate(buildInvoiceLines(invoice, meta)));
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `invoice-${invoice.id.slice(-6).toUpperCase()}.pdf`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 1200);
}
