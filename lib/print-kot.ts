import type { OrderRecord, OrderItem, KitchenQueueItem } from "@/store/types/orders";

/**
 * Flexible input for printing headers from either a full OrderRecord 
 * or a collection of KitchenQueueItems.
 */
export type KOTHeaderData = {
  orderNumber?: string;
  tableName?: string;
  serviceMode?: string;
  note?: string;
};

/**
 * Utility to print a Kitchen Order Ticket (KOT) directly to a thermal printer.
 */
export function printKOT(
  header: KOTHeaderData,
  items: (OrderItem | KitchenQueueItem)[],
  paperWidth: number = 80
) {
  if (typeof window === "undefined") return;

  const orderNumber = header.orderNumber || "ORDER";
  const tableName = header.tableName || "DINE-IN";
  const timestamp = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>KOT - ${orderNumber}</title>
      <style>
        @page {
          margin: 0;
          size: ${paperWidth}mm auto;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          margin: 0;
          padding: 2mm;
          font-family: 'Courier New', Courier, monospace;
          font-size: 10px;
          line-height: 1.2;
          color: #000;
          width: ${paperWidth}mm;
          background: #fff;
        }
        .container {
          padding: 1mm;
        }
        .header {
          text-align: center;
          margin-bottom: 3mm;
          border-bottom: 2px solid #000;
          padding-bottom: 2mm;
        }
        .title {
          font-size: 16px;
          font-weight: 900;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .info {
          margin-top: 1mm;
          font-size: 13px;
          font-weight: 900;
          background: #000;
          color: #fff;
          padding: 0.5mm;
          display: inline-block;
          width: 100%;
        }
        .meta {
          display: flex;
          justify-content: space-between;
          margin-top: 2mm;
          font-size: 10px;
          font-weight: bold;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4mm;
        }
        .items-table th {
          text-align: left;
          border-bottom: 2px solid #000;
          padding: 1mm 0;
          font-size: 10px;
          text-transform: uppercase;
        }
        .item-row td {
          padding: 2mm 0;
          vertical-align: top;
          border-bottom: 1px dashed #666;
        }
        .item-row:last-child td {
          border-bottom: 2px solid #000;
        }
        .qty-cell {
          width: 35px;
          text-align: left;
        }
        .qty-box {
          font-size: 18px;
          font-weight: 900;
          display: block;
        }
        .name-cell {
          padding-left: 1mm;
        }
        .item-name {
          font-weight: 900;
          font-size: 13px;
          text-transform: uppercase;
          display: block;
          margin-bottom: 0.5mm;
        }
        .variant {
          font-size: 10px;
          font-weight: bold;
          color: #333;
          display: block;
        }
        .options {
          font-size: 9px;
          font-weight: normal;
          margin-top: 1mm;
          padding-left: 1.5mm;
        }
        .item-note {
          font-size: 10px;
          background: #eee;
          padding: 1mm;
          margin-top: 1.5mm;
          border-left: 2px solid #000;
          font-weight: bold;
        }
        .order-note {
          margin-top: 4mm;
          padding: 1.5mm;
          border: 1px solid #000;
          font-size: 10px;
        }
        .order-note strong {
          display: block;
          text-decoration: underline;
          margin-bottom: 1mm;
        }
        .footer {
          margin-top: 8mm;
          text-align: center;
          font-size: 10px;
          border-top: 1px solid #000;
          padding-top: 3mm;
          font-weight: bold;
        }
        @media print {
          body { width: ${paperWidth}mm; }
          .container { border: none; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <p class="title">KOT</p>
          <div class="info">${tableName}</div>
          <div class="meta">
            <span>#${orderNumber}</span>
            <span>${timestamp}</span>
          </div>
          <div style="text-align:left; font-size: 10px; margin-top: 1mm;">
            Mode: ${header.serviceMode || "DINE-IN"}
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th class="qty-cell">QTY</th>
              <th class="name-cell">ITEM DESCRIPTION</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr class="item-row">
                <td class="qty-cell">
                  <span class="qty-box">${item.quantity}</span>
                </td>
                <td class="name-cell">
                  <span class="item-name">${item.name}</span>
                  ${item.variantName ? `<span class="variant">>> ${item.variantName}</span>` : ""}
                  
                  ${(item as any).options && (item as any).options.length > 0 ? `
                    <div class="options">
                      ${(item as any).options.map((opt: any) => `• ${opt.name}`).join("<br>")}
                    </div>
                  ` : ""}
                  
                  ${item.note ? `<div class="item-note">NOTE: ${item.note}</div>` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        ${header.note ? `
          <div class="order-note">
            <strong>ORDER NOTE:</strong>
            ${header.note}
          </div>
        ` : ""}

        <div class="footer">
          <p>*** ${header.serviceMode === 'TAKEAWAY' ? 'TAKEAWAY ORDER' : 'TABLE SERVICE'} ***</p>
          <p>Restro Khata POS</p>
        </div>
      </div>

      <script>
        window.onload = () => {
          window.print();
          setTimeout(() => {
             // In some browsers, print dialog blocks script, so we use a longer timeout or just leave it
          }, 1000);
        };
      </script>
    </body>
    </html>
  `;

  // Create hidden iframe
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "100%";
  iframe.style.bottom = "100%";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }

  // Cleanup
  setTimeout(() => {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }, 20000); // 20s to be safe
}
