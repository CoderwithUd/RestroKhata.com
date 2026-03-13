import type { InvoiceRecord } from "@/store/types/invoices";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT_MARGIN = 40;
const TOP_START = 802;
const LINE_HEIGHT = 16;
const MAX_LINES_PER_PAGE = 44;

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

function wrapLine(value: string, maxChars = 82): string[] {
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

function buildInvoiceLines(invoice: InvoiceRecord): string[] {
  const due = invoice.balanceDue ?? invoice.totalDue ?? invoice.grandTotal ?? invoice.subTotal ?? 0;
  const tableLabel = invoice.table?.name || `Table ${invoice.table?.number ?? "-"}`;
  const paymentMethod = invoice.payment?.method || "-";
  const paymentAmount = invoice.payment?.paidAmount ?? 0;

  const lines: string[] = [
    "RESTRO KHATA",
    "Customer Invoice",
    "",
    `Invoice ID: ${invoice.id}`,
    `Order ID: ${invoice.orderId}`,
    `Table: ${tableLabel}`,
    `Status: ${invoice.status || "ISSUED"}`,
    `Created: ${fmtDate(invoice.createdAt)}`,
    `Updated: ${fmtDate(invoice.updatedAt)}`,
    "",
    "Items",
    "----------------------------------------------------------------",
  ];

  invoice.items.forEach((item, index) => {
    const itemTotal = item.lineTotal ?? item.unitPrice * item.quantity;
    const itemLabel = `${index + 1}. ${item.name}${item.variantName ? ` (${item.variantName})` : ""}`;
    const detail = `${item.quantity} x ${fmtCurrency(item.unitPrice)} = ${fmtCurrency(itemTotal)}`;
    lines.push(...wrapLine(itemLabel));
    lines.push(...wrapLine(`   ${detail}`));
    if (item.note) {
      lines.push(...wrapLine(`   Note: ${item.note}`));
    }
  });

  lines.push("----------------------------------------------------------------");
  lines.push(`Subtotal: ${fmtCurrency(invoice.subTotal)}`);
  lines.push(`Tax: ${fmtCurrency(invoice.taxTotal)}`);
  if (invoice.discount) {
    lines.push(
      `Discount: ${invoice.discount.type || "FLAT"} ${invoice.discount.value || 0} (${fmtCurrency(invoice.discount.amount)})`,
    );
  }
  lines.push(`Grand Total: ${fmtCurrency(invoice.grandTotal)}`);
  lines.push(`Amount Due: ${fmtCurrency(due)}`);
  if (invoice.payment) {
    lines.push(`Payment: ${paymentMethod} ${fmtCurrency(paymentAmount)}`);
    if (invoice.payment.reference) {
      lines.push(...wrapLine(`Reference: ${invoice.payment.reference}`));
    }
    lines.push(`Paid At: ${fmtDate(invoice.payment.paidAt)}`);
  }
  if (invoice.note) {
    lines.push("");
    lines.push("Note");
    lines.push(...wrapLine(invoice.note));
  }

  lines.push("");
  lines.push("Generated from Restro Khata dashboard.");
  return lines;
}

function paginate(lines: string[]): string[][] {
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += MAX_LINES_PER_PAGE) {
    pages.push(lines.slice(index, index + MAX_LINES_PER_PAGE));
  }

  return pages.length ? pages : [["Invoice"]];
}

function buildContentStream(lines: string[]): string {
  const commands = ["BT", "/F1 11 Tf"];

  lines.forEach((line, index) => {
    const y = TOP_START - index * LINE_HEIGHT;
    commands.push(`1 0 0 1 ${LEFT_MARGIN} ${y} Tm (${escapePdfText(line)}) Tj`);
  });

  commands.push("ET");
  return commands.join("\n");
}

function buildPdfDocument(pageLines: string[][]): string {
  const fontObjectId = 3 + pageLines.length * 2;
  const objects: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: `<< /Type /Pages /Kids [${pageLines
      .map((_, index) => `${3 + index * 2} 0 R`)
      .join(" ")}] /Count ${pageLines.length} >>`,
    [fontObjectId]: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  };

  pageLines.forEach((lines, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const content = buildContentStream(lines);

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  const maxObjectId = fontObjectId;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    offsets[objectId] = pdf.length;
    pdf += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${maxObjectId + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    pdf += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

export function downloadInvoicePdf(invoice: InvoiceRecord): void {
  if (typeof window === "undefined") return;

  const pdf = buildPdfDocument(paginate(buildInvoiceLines(invoice)));
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  const tableNumber = invoice.table?.number ?? "table";

  link.href = url;
  link.download = `invoice-table-${tableNumber}-${invoice.id.slice(0, 8)}.pdf`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 1000);
}
