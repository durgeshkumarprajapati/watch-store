import { z } from "zod";

export const MAX_IMPORT_ROWS = 500;
export const MAX_CELL_LENGTH = 4000;

export const CATALOGUE_SHEET_HEADERS = [
  "SKU",
  "Product Name",
  "Slug",
  "Brand",
  "Categories",
  "Gender",
  "Watch Type",
  "Strap Material",
  "Dial & Strap",
  "Description",
  "Movement",
  "Case Dimensions",
  "Crystal",
  "Water Resistance",
  "HSN Code",
  "MRP (INR)",
  "Selling Price (INR)",
  "GST (%)",
  "Badge",
  "Best Seller",
  "Warranty (Years)",
  "Status",
  "Primary Image",
  "Updated At (Read-Only)",
] as const;

export const spreadsheetConfigSchema = z.object({
  spreadsheetId: z
    .string()
    .trim()
    .min(10, "Invalid Google Spreadsheet ID.")
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/, "Spreadsheet ID contains invalid characters."),
  worksheetName: z
    .string()
    .trim()
    .min(1, "Worksheet name is required.")
    .max(80)
    .regex(/^[^!:\[\]\*\\\/\?]+$/, "Worksheet name contains invalid characters."),
});

/**
 * Prevents spreadsheet formula injection on string cells without corrupting numeric values.
 */
export function escapeFormulaInjection(value: string | number | boolean): string | number | boolean {
  if (typeof value !== "string") return value;
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function parseRupeesToPaise(raw: string): number | null {
  const cleaned = raw.trim().replace(/[₹,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupeesPart, paisePart = ""] = cleaned.split(".");
  const rupees = Number(rupeesPart);
  const paise = Number(paisePart.padEnd(2, "0"));
  if (!Number.isSafeInteger(rupees) || !Number.isSafeInteger(paise)) return null;
  const total = rupees * 100 + paise;
  return total > 0 ? total : null;
}

export function parseGstPercentToBps(raw: string): number | null {
  const cleaned = raw.trim().replace(/%$/, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isInteger(bps) || bps < 0 || bps > 2800) return null;
  return bps;
}

export function validateSheetHeaders(headerRow: string[]): { ok: true } | { ok: false; error: string } {
  const normalized = headerRow.map((h) => h.trim());
  if (normalized.length < CATALOGUE_SHEET_HEADERS.length - 1) {
    return {
      ok: false,
      error: `Invalid spreadsheet headers. Expected ${CATALOGUE_SHEET_HEADERS.length} columns starting with SKU.`,
    };
  }
  for (let i = 0; i < CATALOGUE_SHEET_HEADERS.length - 1; i++) {
    if (normalized[i] !== CATALOGUE_SHEET_HEADERS[i]) {
      return {
        ok: false,
        error: `Header mismatch at column ${i + 1}: expected "${CATALOGUE_SHEET_HEADERS[i]}", got "${normalized[i] ?? ""}".`,
      };
    }
  }
  return { ok: true };
}

export function mapProductToSheetRow(product: {
  sku: string;
  name: string;
  slug: string;
  brand: { name: string };
  categories: { category: { slug: string } }[];
  gender: string;
  watchType: string;
  strapMaterial: string;
  dialAndStrap: string;
  description: string;
  specMovement: string;
  specCaseDimensions: string;
  specCrystal: string;
  specWaterResistance: string;
  specHsn: string;
  mrpPaise: number;
  pricePaise: number;
  gstRateBps: number;
  badge: string | null;
  isBestSeller: boolean;
  warrantyYears: number | null;
  status: string;
  images: { url: string }[];
  updatedAt: Date;
}): (string | number | boolean)[] {
  return [
    escapeFormulaInjection(product.sku),
    escapeFormulaInjection(product.name),
    escapeFormulaInjection(product.slug),
    escapeFormulaInjection(product.brand.name),
    escapeFormulaInjection(product.categories.map((c) => c.category.slug).join(", ")),
    product.gender,
    product.watchType,
    product.strapMaterial,
    escapeFormulaInjection(product.dialAndStrap),
    escapeFormulaInjection(product.description),
    escapeFormulaInjection(product.specMovement),
    escapeFormulaInjection(product.specCaseDimensions),
    escapeFormulaInjection(product.specCrystal),
    escapeFormulaInjection(product.specWaterResistance),
    product.specHsn,
    Number((product.mrpPaise / 100).toFixed(2)),
    Number((product.pricePaise / 100).toFixed(2)),
    Number((product.gstRateBps / 100).toFixed(2)),
    product.badge ?? "",
    product.isBestSeller ? "TRUE" : "FALSE",
    product.warrantyYears ?? "",
    product.status,
    escapeFormulaInjection(product.images[0]?.url ?? ""),
    product.updatedAt.toISOString(),
  ];
}
