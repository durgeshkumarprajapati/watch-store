import { deflateSync } from "node:zlib";
import { brand } from "@/config/brand";
import type { InvoiceSnapshot } from "./invoice-service";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 42;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2;

function toAsciiMoney(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(rupees)}`;
}

function pdfEscape(input: string): string {
  // Normalize common Unicode punctuation to WinAnsi-safe ASCII
  const safe = input
    .replace(/\u20B9/g, "Rs. ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, " ");
  return safe.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

class PdfPageBuilder {
  private pages: string[][] = [[]];
  private y = A4_HEIGHT - 44;

  private get ops(): string[] {
    return this.pages[this.pages.length - 1]!;
  }

  newPage(): void {
    this.pages.push([]);
    this.y = A4_HEIGHT - 44;
  }

  ensureSpace(neededHeight: number, onNewPage?: () => void): void {
    if (this.y - neededHeight < 64) {
      this.newPage();
      onNewPage?.();
    }
  }

  getY(): number {
    return this.y;
  }

  setY(nextY: number): void {
    this.y = nextY;
  }

  drawRect(x: number, y: number, w: number, h: number, fillRgb?: [number, number, number], strokeRgb?: [number, number, number]): void {
    if (fillRgb) {
      this.ops.push(`${fillRgb[0].toFixed(3)} ${fillRgb[1].toFixed(3)} ${fillRgb[2].toFixed(3)} rg`);
    }
    if (strokeRgb) {
      this.ops.push(`${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG`);
    }
    const op = fillRgb && strokeRgb ? "B" : fillRgb ? "f" : "S";
    this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${op}`);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, rgb: [number, number, number] = [0.88, 0.85, 0.8]): void {
    this.ops.push(`${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} RG 0.6 w`);
    this.ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  drawText(
    text: string,
    x: number,
    y: number,
    opts?: { font?: "F1" | "F2" | "F3"; size?: number; rgb?: [number, number, number]; alignRight?: boolean },
  ): void {
    const font = opts?.font ?? "F1";
    const size = opts?.size ?? 9.5;
    const rgb = opts?.rgb ?? [0.1, 0.1, 0.1];
    const escaped = pdfEscape(text);
    let drawX = x;
    if (opts?.alignRight) {
      const charFactor = font === "F3" ? 0.605 : font === "F2" ? 0.55 : 0.52;
      const approxWidth = escaped.length * size * charFactor;
      drawX = Math.max(MARGIN_X, x - approxWidth);
    }
    this.ops.push(`${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg`);
    this.ops.push(`BT /${font} ${size} Tf ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${escaped}) Tj ET`);
  }

  buildPdfBuffer(footerSupportLine: string): Buffer {
    const totalPages = this.pages.length;
    const pageStreams = this.pages.map((ops, idx) => {
      const pageOps = [...ops];
      const yLine = 42;
      pageOps.push("0.880 0.850 0.800 RG 0.6 w");
      pageOps.push(`${MARGIN_X.toFixed(2)} ${yLine.toFixed(2)} m ${(A4_WIDTH - MARGIN_X).toFixed(2)} ${yLine.toFixed(2)} l S`);
      pageOps.push("0.400 0.390 0.360 rg");
      pageOps.push(`BT /F1 8 Tf ${MARGIN_X.toFixed(2)} 28.00 Td (${pdfEscape(footerSupportLine)}) Tj ET`);
      const pageLabel = `Page ${idx + 1} of ${totalPages}`;
      const rightX = A4_WIDTH - MARGIN_X - pageLabel.length * 8 * 0.52;
      pageOps.push(`BT /F1 8 Tf ${rightX.toFixed(2)} 28.00 Td (${pdfEscape(pageLabel)}) Tj ET`);
      return pageOps.join("\n");
    });

    // Object numbering:
    // 1: Catalog, 2: Pages, 3: F1 Helvetica, 4: F2 Helvetica-Bold, 5: F3 Courier
    // Then for each page i: (6 + i*2) Page, (7 + i*2) Content stream
    const objects: string[] = [];
    const pageIds: number[] = [];
    for (let i = 0; i < pageStreams.length; i++) {
      pageIds.push(6 + i * 2);
    }

    objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj\n`);
    objects.push("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
    objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n");
    objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n");

    const binaryChunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "binary")];
    const offsets: number[] = [0];
    let currentOffset = binaryChunks[0]!.length;

    const pushObj = (buf: Buffer) => {
      offsets.push(currentOffset);
      binaryChunks.push(buf);
      currentOffset += buf.length;
    };

    for (const obj of objects) {
      pushObj(Buffer.from(obj, "utf8"));
    }

    for (let i = 0; i < pageStreams.length; i++) {
      const pageObjId = 6 + i * 2;
      const contentObjId = 7 + i * 2;
      const pageObj = `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`;
      pushObj(Buffer.from(pageObj, "utf8"));

      const compressed = deflateSync(Buffer.from(pageStreams[i]!, "utf8"));
      const header = Buffer.from(`${contentObjId} 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, "utf8");
      const footer = Buffer.from("\nendstream\nendobj\n", "utf8");
      pushObj(Buffer.concat([header, compressed, footer]));
    }

    const xrefStart = currentOffset;
    const xrefLines = [`xref\n0 ${offsets.length}\n0000000000 65535 f \n`];
    for (let i = 1; i < offsets.length; i++) {
      xrefLines.push(`${String(offsets[i]!).padStart(10, "0")} 00000 n \n`);
    }
    const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    binaryChunks.push(Buffer.from(xrefLines.join("") + trailer, "utf8"));

    return Buffer.concat(binaryChunks);
  }
}

export function renderInvoicePdf(snapshot: InvoiceSnapshot): Buffer {
  const doc = new PdfPageBuilder();
  const titleLabel = snapshot.seller.gstin ? "TAX INVOICE" : "INVOICE";

  // Header Banner
  doc.drawRect(MARGIN_X, A4_HEIGHT - 92, CONTENT_WIDTH, 52, [0.09, 0.09, 0.09]);
  doc.drawText(brand.wordmark, MARGIN_X + 16, A4_HEIGHT - 64, { font: "F2", size: 16, rgb: [0.97, 0.96, 0.94] });
  doc.drawText(titleLabel, A4_WIDTH - MARGIN_X - 16, A4_HEIGHT - 64, {
    font: "F2",
    size: 13,
    rgb: [0.78, 0.62, 0.35],
    alignRight: true,
  });
  doc.drawText(`Invoice #: ${snapshot.invoiceNumber}`, A4_WIDTH - MARGIN_X - 16, A4_HEIGHT - 80, {
    font: "F3",
    size: 8.5,
    rgb: [0.9, 0.88, 0.84],
    alignRight: true,
  });

  doc.setY(A4_HEIGHT - 114);

  // Seller & Invoice Metadata Columns
  const topY = doc.getY();
  doc.drawText("SOLD BY", MARGIN_X, topY, { font: "F2", size: 8, rgb: [0.45, 0.43, 0.4] });
  let leftY = topY - 14;
  doc.drawText(snapshot.seller.legalName, MARGIN_X, leftY, { font: "F2", size: 10 });
  leftY -= 13;
  for (const line of wrapText(snapshot.seller.address, 44)) {
    doc.drawText(line, MARGIN_X, leftY, { size: 8.5, rgb: [0.3, 0.3, 0.3] });
    leftY -= 11;
  }
  if (snapshot.seller.gstin) {
    doc.drawText(`GSTIN: ${snapshot.seller.gstin}`, MARGIN_X, leftY, { font: "F3", size: 8.5 });
    leftY -= 11;
  }
  doc.drawText(`Email: ${snapshot.seller.email} | Tel: ${snapshot.seller.phone}`, MARGIN_X, leftY, {
    size: 8,
    rgb: [0.35, 0.35, 0.35],
  });

  const rightColX = MARGIN_X + 310;
  let rightY = topY;
  doc.drawText("INVOICE & ORDER DETAILS", rightColX, rightY, { font: "F2", size: 8, rgb: [0.45, 0.43, 0.4] });
  rightY -= 14;
  const metaRows: [string, string][] = [
    ["Invoice Date:", new Date(snapshot.issuedAtIso).toLocaleDateString("en-IN")],
    ["Order Number:", snapshot.orderNumber],
    ["Order Date:", new Date(snapshot.orderDateIso).toLocaleDateString("en-IN")],
    ["Order Status:", snapshot.orderStatus],
    ["Payment:", `${snapshot.paymentMethod} (${snapshot.paymentStatus})`],
    ...(snapshot.paymentReference ? [["Payment Ref:", snapshot.paymentReference] as [string, string]] : []),
  ];
  for (const [k, v] of metaRows) {
    doc.drawText(k, rightColX, rightY, { font: "F2", size: 8.5, rgb: [0.35, 0.35, 0.35] });
    doc.drawText(v, A4_WIDTH - MARGIN_X, rightY, { font: "F3", size: 8.5, alignRight: true });
    rightY -= 12;
  }

  doc.setY(Math.min(leftY, rightY) - 16);
  doc.drawLine(MARGIN_X, doc.getY(), A4_WIDTH - MARGIN_X, doc.getY());
  doc.setY(doc.getY() - 16);

  // Customer Billing & Shipping
  const custY = doc.getY();
  doc.drawText("BILLED TO", MARGIN_X, custY, { font: "F2", size: 8, rgb: [0.45, 0.43, 0.4] });
  let cLeftY = custY - 13;
  for (const line of snapshot.customer.billingAddressLines.length > 0 ? snapshot.customer.billingAddressLines : [snapshot.customer.name]) {
    for (const wrapped of wrapText(line, 44)) {
      doc.drawText(wrapped, MARGIN_X, cLeftY, { size: 8.5 });
      cLeftY -= 11;
    }
  }
  doc.drawText(`Email: ${snapshot.customer.email} | Tel: ${snapshot.customer.phone}`, MARGIN_X, cLeftY, {
    size: 8,
    rgb: [0.35, 0.35, 0.35],
  });
  cLeftY -= 11;
  if (snapshot.customer.gstin) {
    doc.drawText(`Customer GSTIN: ${snapshot.customer.gstin}`, MARGIN_X, cLeftY, { font: "F3", size: 8.5 });
    cLeftY -= 11;
  }

  doc.drawText("SHIPPED TO", rightColX, custY, { font: "F2", size: 8, rgb: [0.45, 0.43, 0.4] });
  let cRightY = custY - 13;
  for (const line of snapshot.customer.shippingAddressLines.length > 0 ? snapshot.customer.shippingAddressLines : [snapshot.customer.name]) {
    for (const wrapped of wrapText(line, 34)) {
      doc.drawText(wrapped, rightColX, cRightY, { size: 8.5 });
      cRightY -= 11;
    }
  }

  doc.setY(Math.min(cLeftY, cRightY) - 16);

  // Table Header helper
  const drawTableHeader = () => {
    const y = doc.getY();
    doc.drawRect(MARGIN_X, y - 6, CONTENT_WIDTH, 20, [0.94, 0.92, 0.88]);
    doc.drawText("ITEM / SKU", MARGIN_X + 6, y, { font: "F2", size: 8 });
    doc.drawText("QTY", MARGIN_X + 240, y, { font: "F2", size: 8, alignRight: true });
    doc.drawText("TAXABLE", MARGIN_X + 320, y, { font: "F2", size: 8, alignRight: true });
    doc.drawText("GST", MARGIN_X + 415, y, { font: "F2", size: 8, alignRight: true });
    doc.drawText("TOTAL", A4_WIDTH - MARGIN_X - 6, y, { font: "F2", size: 8, alignRight: true });
    doc.setY(y - 20);
  };

  drawTableHeader();

  for (const item of snapshot.items) {
    const nameLines = wrapText(`${item.brandName} - ${item.productName}`, 36);
    const rowHeight = Math.max(24, nameLines.length * 11 + 14);
    doc.ensureSpace(rowHeight + 10, drawTableHeader);

    const rowTop = doc.getY();
    let ly = rowTop;
    for (const nl of nameLines) {
      doc.drawText(nl, MARGIN_X + 6, ly, { font: "F2", size: 8.5 });
      ly -= 11;
    }
    doc.drawText(`SKU: ${item.sku} | ${item.dialAndStrap}`, MARGIN_X + 6, ly, {
      font: "F3",
      size: 7.5,
      rgb: [0.42, 0.4, 0.37],
    });

    const gstPct = (item.gstRateBps / 100).toFixed(item.gstRateBps % 100 === 0 ? 0 : 2);
    doc.drawText(String(item.quantity), MARGIN_X + 240, rowTop, { font: "F3", size: 8.5, alignRight: true });
    doc.drawText(toAsciiMoney(item.taxableValuePaise), MARGIN_X + 320, rowTop, { font: "F3", size: 8.5, alignRight: true });
    doc.drawText(`${toAsciiMoney(item.lineGstPaise)} (${gstPct}%)`, MARGIN_X + 415, rowTop, {
      font: "F3",
      size: 8,
      alignRight: true,
    });
    doc.drawText(toAsciiMoney(item.lineTotalPaise), A4_WIDTH - MARGIN_X - 6, rowTop, {
      font: "F2",
      size: 8.5,
      alignRight: true,
    });

    const nextY = rowTop - rowHeight;
    doc.drawLine(MARGIN_X, nextY + 6, A4_WIDTH - MARGIN_X, nextY + 6, [0.92, 0.9, 0.86]);
    doc.setY(nextY);
  }

  // Totals Summary Block
  doc.ensureSpace(165);
  doc.setY(doc.getY() - 8);
  const sumX = MARGIN_X + 270;
  const valX = A4_WIDTH - MARGIN_X - 6;
  let sy = doc.getY();

  const summaryRows: [string, string, boolean?][] = [
    ["Taxable Value (Excl. GST):", toAsciiMoney(snapshot.totals.taxableAmountPaise)],
    ...(snapshot.taxMode === "CGST_SGST"
      ? [
          ["CGST (Included):", toAsciiMoney(snapshot.totals.cgstTotalPaise)] as [string, string],
          ["SGST (Included):", toAsciiMoney(snapshot.totals.sgstTotalPaise)] as [string, string],
        ]
      : snapshot.taxMode === "IGST"
        ? [["IGST (Included):", toAsciiMoney(snapshot.totals.igstTotalPaise)] as [string, string]]
        : [["Included GST:", toAsciiMoney(snapshot.totals.includedGstPaise)] as [string, string]]),
    ["Items Subtotal (Incl. GST):", toAsciiMoney(snapshot.totals.subtotalPaise)],
    ...(snapshot.totals.productSavingsPaise > 0
      ? [["Product Savings (vs MRP):", `-${toAsciiMoney(snapshot.totals.productSavingsPaise)}`] as [string, string]]
      : []),
    ...(snapshot.totals.promoDiscountPaise > 0
      ? [[`Promo Discount${snapshot.totals.promoCode ? ` (${snapshot.totals.promoCode})` : ""}:`, `-${toAsciiMoney(snapshot.totals.promoDiscountPaise)}`] as [string, string]]
      : []),
    ["Shipping Charges:", snapshot.totals.shippingPaise === 0 ? "Complimentary" : toAsciiMoney(snapshot.totals.shippingPaise)],
    ["Grand Total:", toAsciiMoney(snapshot.totals.grandTotalPaise), true],
    ["Amount Paid:", toAsciiMoney(snapshot.totals.amountPaidPaise)],
    ...(snapshot.totals.outstandingPaise > 0
      ? [["Outstanding Balance:", toAsciiMoney(snapshot.totals.outstandingPaise)] as [string, string]]
      : []),
  ];

  for (const [label, value, highlight] of summaryRows) {
    if (highlight) {
      sy -= 4;
      doc.drawRect(sumX - 6, sy - 5, A4_WIDTH - MARGIN_X - sumX + 6, 18, [0.95, 0.93, 0.89]);
    }
    doc.drawText(label, sumX, sy, { font: highlight ? "F2" : "F1", size: highlight ? 10 : 8.5 });
    doc.drawText(value, valX, sy, { font: highlight ? "F2" : "F3", size: highlight ? 10 : 8.5, alignRight: true });
    sy -= highlight ? 22 : 14;
  }

  return doc.buildPdfBuffer(`${snapshot.seller.legalName} | Support: ${snapshot.seller.email}`);
}
