import { describe, expect, it } from "vitest";
import { ADMIN_ROLE_DEFINITIONS } from "@/modules/admin/rbac-catalogue";
import {
  CATALOGUE_SHEET_HEADERS,
  escapeFormulaInjection,
  mapProductToSheetRow,
  parseGstPercentToBps,
  parseRupeesToPaise,
  spreadsheetConfigSchema,
  validateSheetHeaders,
} from "@/modules/admin/catalogue-sync/sheets-mapper";

describe("Phase 14 Google Sheets Mapper & RBAC Unit Tests", () => {
  it("escapes formula injection prefixes on strings without altering numbers or booleans", () => {
    expect(escapeFormulaInjection("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(escapeFormulaInjection("+12345")).toBe("'+12345");
    expect(escapeFormulaInjection("-cmd|'/C calc'!A0")).toBe("'-cmd|'/C calc'!A0");
    expect(escapeFormulaInjection("@HYPERLINK(\"http://evil.com\")")).toBe(
      "'@HYPERLINK(\"http://evil.com\")",
    );
    expect(escapeFormulaInjection("\tleading-tab")).toBe("'\tleading-tab");
    expect(escapeFormulaInjection("Chronograph Watch")).toBe("Chronograph Watch");
    expect(escapeFormulaInjection(45000)).toBe(45000);
    expect(escapeFormulaInjection(true)).toBe(true);
  });

  it("parses INR currency strings to integer paise safely", () => {
    expect(parseRupeesToPaise("45000")).toBe(4500000);
    expect(parseRupeesToPaise("₹ 45,000.50")).toBe(4500050);
    expect(parseRupeesToPaise("1999.5")).toBe(199950);
    expect(parseRupeesToPaise("0")).toBeNull();
    expect(parseRupeesToPaise("-100")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
  });

  it("parses GST percentage strings to basis points within 0-28%", () => {
    expect(parseGstPercentToBps("18")).toBe(1800);
    expect(parseGstPercentToBps("18%")).toBe(1800);
    expect(parseGstPercentToBps("12.5")).toBe(1250);
    expect(parseGstPercentToBps("0")).toBe(0);
    expect(parseGstPercentToBps("28")).toBe(2800);
    expect(parseGstPercentToBps("29")).toBeNull();
    expect(parseGstPercentToBps("-5")).toBeNull();
  });

  it("validates exact catalogue sheet headers", () => {
    expect(validateSheetHeaders([...CATALOGUE_SHEET_HEADERS])).toEqual({ ok: true });
    // Trailing Updated At column is optional for import checks
    expect(validateSheetHeaders([...CATALOGUE_SHEET_HEADERS.slice(0, -1)])).toEqual({ ok: true });

    const broken: string[] = [...CATALOGUE_SHEET_HEADERS];
    broken[3] = "Wrong Brand Header";
    const result = validateSheetHeaders(broken);
    expect(result.ok).toBe(false);
  });

  it("validates Google Spreadsheet configuration inputs", () => {
    expect(
      spreadsheetConfigSchema.safeParse({
        spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        worksheetName: "Catalogue",
      }).success,
    ).toBe(true);

    expect(
      spreadsheetConfigSchema.safeParse({
        spreadsheetId: "short",
        worksheetName: "Catalogue",
      }).success,
    ).toBe(false);

    expect(
      spreadsheetConfigSchema.safeParse({
        spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        worksheetName: "Bad:Sheet*Name",
      }).success,
    ).toBe(false);
  });

  it("maps a product record into a 24-column formula-safe sheet row", () => {
    const now = new Date("2026-11-25T10:00:00.000Z");
    const row = mapProductToSheetRow({
      sku: "WS-001",
      name: "=Dangerous Name",
      slug: "ws-001",
      brand: { name: "Seiko" },
      categories: [{ category: { slug: "chronographs" } }, { category: { slug: "mens-watches" } }],
      gender: "MEN",
      watchType: "CHRONOGRAPH",
      strapMaterial: "STAINLESS_STEEL",
      dialAndStrap: "Sunburst Blue / Steel",
      description: "Precision chronograph.",
      specMovement: "Automatic",
      specCaseDimensions: "41mm",
      specCrystal: "Sapphire",
      specWaterResistance: "100m",
      specHsn: "91021100",
      mrpPaise: 5000000,
      pricePaise: 4500000,
      gstRateBps: 1800,
      badge: "New",
      isBestSeller: true,
      warrantyYears: 2,
      status: "ACTIVE",
      images: [{ url: "/images/watches/ws-001.jpg" }],
      updatedAt: now,
    });

    expect(row).toHaveLength(CATALOGUE_SHEET_HEADERS.length);
    expect(row[0]).toBe("WS-001");
    expect(row[1]).toBe("'=Dangerous Name");
    expect(row[4]).toBe("chronographs, mens-watches");
    expect(row[15]).toBe(50000);
    expect(row[16]).toBe(45000);
    expect(row[17]).toBe(18);
    expect(row[19]).toBe("TRUE");
    expect(row[23]).toBe(now.toISOString());
  });

  it("assigns catalogue sync permissions to authorized roles only", () => {
    expect(ADMIN_ROLE_DEFINITIONS.SUPER_ADMIN.permissions).toContain("catalogue.sync.import");
    expect(ADMIN_ROLE_DEFINITIONS.ADMIN.permissions).toContain("catalogue.sync.configure");
    expect(ADMIN_ROLE_DEFINITIONS.CATALOG_MANAGER.permissions).toContain("catalogue.sync.export");
    expect(ADMIN_ROLE_DEFINITIONS.CATALOG_MANAGER.permissions).toContain("catalogue.sync.import");
    expect(ADMIN_ROLE_DEFINITIONS.ORDER_MANAGER.permissions).not.toContain("catalogue.sync.import");
    expect(ADMIN_ROLE_DEFINITIONS.CUSTOMER_SUPPORT.permissions).not.toContain("catalogue.sync.read");
  });
});
