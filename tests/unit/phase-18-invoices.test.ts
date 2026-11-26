import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInvoicePdf } from "@/modules/invoices/invoice-pdf";
import {
  isOrderEligibleForInvoice,
  type InvoiceSnapshot,
} from "@/modules/invoices/invoice-service";
import {
  InvoiceConfigurationError,
  resolveSellerInvoiceConfig,
} from "@/modules/invoices/seller-config";
import { createOrderAccessToken } from "@/modules/payments/infrastructure/razorpay-signature";

const mockAuthCustomer = vi.fn();
const mockFindOrder = vi.fn();
const mockGenerateInvoice = vi.fn();

vi.mock("@/modules/auth/session-service", () => ({
  getAuthenticatedCustomer: () => mockAuthCustomer(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    order: { findUnique: (...args: unknown[]) => mockFindOrder(...args) },
  }),
}));

vi.mock("@/modules/invoices/invoice-service", async () => {
  const actual = await vi.importActual<typeof import("@/modules/invoices/invoice-service")>(
    "@/modules/invoices/invoice-service",
  );
  return {
    ...actual,
    generateOrGetOrderInvoice: (...args: unknown[]) => mockGenerateInvoice(...args),
  };
});

import { GET } from "@/app/api/orders/[orderId]/invoice/route";

function makeSnapshot(itemCount = 1): InvoiceSnapshot {
  return {
    invoiceNumber: "INV-WS-202611-00001",
    issuedAtIso: "2026-11-26T09:00:00.000Z",
    orderId: "ord_123",
    orderNumber: "WS-202611-0001",
    orderDateIso: "2026-11-24T09:00:00.000Z",
    deliveredAtIso: "2026-11-26T08:30:00.000Z",
    orderStatus: "DELIVERED",
    paymentMethod: "RAZORPAY",
    paymentStatus: "PAID",
    paymentReference: "pay_test_123",
    taxMode: "CGST_SGST",
    seller: {
      legalName: "WatchStore Horology Pvt Ltd",
      address: "101 Heritage Tower, Mumbai, Maharashtra 400001",
      state: "Maharashtra",
      gstin: "27ABCDE1234F1Z5",
      email: "concierge@watchstore.example",
      phone: "+91 22 4000 1000",
    },
    customer: {
      name: "Aarav Mehta",
      email: "aarav@example.com",
      phone: "9876543210",
      gstin: null,
      billingAddressLines: ["Aarav Mehta", "12 Marine Drive", "Mumbai, Maharashtra 400002", "India"],
      shippingAddressLines: ["Aarav Mehta", "12 Marine Drive", "Mumbai, Maharashtra 400002", "India"],
    },
    items: Array.from({ length: itemCount }, (_, i) => ({
      productName:
        i === 0
          ? "Tempora Heritage Automatic Chronograph Limited Collector Edition 40mm Stainless Steel"
          : `Atelier Classic Watch ${i + 1}`,
      sku: `VRN-CHR-${400 + i}`,
      brandName: "Virenza",
      dialAndStrap: "Obsidian Dial • Brushed Steel",
      quantity: 1,
      unitMrpPaise: 16500000,
      unitPricePaise: 14500000,
      unitDiscountPaise: 2000000,
      taxableValuePaise: 12288136,
      gstRateBps: 1800,
      cgstPaise: 1105932,
      sgstPaise: 1105932,
      igstPaise: 0,
      lineGstPaise: 2211864,
      lineTotalPaise: 14500000,
    })),
    totals: {
      mrpTotalPaise: 16500000,
      productSavingsPaise: 2000000,
      promoCode: null,
      promoDiscountPaise: 0,
      subtotalPaise: 14500000,
      shippingPaise: 0,
      taxableAmountPaise: 12288136,
      cgstTotalPaise: 1105932,
      sgstTotalPaise: 1105932,
      igstTotalPaise: 0,
      includedGstPaise: 2211864,
      grandTotalPaise: 14500000,
      amountPaidPaise: 14500000,
      outstandingPaise: 0,
    },
  };
}

describe("Phase 18 — Customer Invoices, PDF Generation & API Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_for_unit_tests";
  });

  it("enforces DELIVERED eligibility and fails closed on placeholder seller config", () => {
    expect(isOrderEligibleForInvoice("PENDING")).toBe(false);
    expect(isOrderEligibleForInvoice("CONFIRMED")).toBe(false);
    expect(isOrderEligibleForInvoice("PROCESSING")).toBe(false);
    expect(isOrderEligibleForInvoice("SHIPPED")).toBe(false);
    expect(isOrderEligibleForInvoice("CANCELLED")).toBe(false);
    expect(isOrderEligibleForInvoice("DELIVERED")).toBe(true);

    expect(() =>
      resolveSellerInvoiceConfig({
        legalName: "[LEGAL_NAME]",
        address: "Address line, City, State PIN",
      }),
    ).toThrow(InvoiceConfigurationError);

    const valid = resolveSellerInvoiceConfig({
      legalName: "WatchStore Horology Pvt Ltd",
      address: "101 Heritage Tower, Mumbai",
      state: "Maharashtra",
      gstin: "27ABCDE1234F1Z5",
    });
    expect(valid.gstin).toBe("27ABCDE1234F1Z5");
  });

  it("renders valid single-page and multi-page A4 PDFs with long product names", () => {
    const single = renderInvoicePdf(makeSnapshot(1));
    expect(single.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(single.toString("ascii")).toContain("%%EOF");
    expect(single.toString("ascii")).toContain("/Count 1");

    const multi = renderInvoicePdf(makeSnapshot(28));
    expect(multi.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(multi.toString("ascii")).toContain("%%EOF");
    expect(multi.toString("ascii")).not.toContain("/Count 1 ");
  });

  it("blocks invalid IDs, unauthenticated users, and cross-customer access; allows owner and guest token", async () => {
    // 1. Path traversal / malformed ID
    const badId = await GET(new Request("http://localhost/api/orders/..%2Fetc/invoice"), {
      params: Promise.resolve({ orderId: "../etc" }),
    });
    expect(badId.status).toBe(400);

    // 2. Unauthenticated without token
    mockAuthCustomer.mockResolvedValueOnce(null);
    mockFindOrder.mockResolvedValueOnce({
      id: "ord_123",
      orderNumber: "WS-202611-0001",
      customerId: "cust_1",
      guestEmail: "aarav@example.com",
    });
    const unauth = await GET(new Request("http://localhost/api/orders/ord_123/invoice"), {
      params: Promise.resolve({ orderId: "ord_123" }),
    });
    expect(unauth.status).toBe(401);

    // 3. Cross-customer access denied (403)
    mockAuthCustomer.mockResolvedValueOnce({ id: "cust_other" });
    mockFindOrder.mockResolvedValueOnce({
      id: "ord_123",
      orderNumber: "WS-202611-0001",
      customerId: "cust_1",
      guestEmail: "aarav@example.com",
    });
    const forbidden = await GET(new Request("http://localhost/api/orders/ord_123/invoice"), {
      params: Promise.resolve({ orderId: "ord_123" }),
    });
    expect(forbidden.status).toBe(403);

    // 4. Owner customer succeeds with PDF headers
    const snap = makeSnapshot(1);
    mockAuthCustomer.mockResolvedValueOnce({ id: "cust_1" });
    mockFindOrder.mockResolvedValueOnce({
      id: "ord_123",
      orderNumber: "WS-202611-0001",
      customerId: "cust_1",
      guestEmail: "aarav@example.com",
    });
    mockGenerateInvoice.mockResolvedValueOnce({
      ok: true,
      invoiceId: "inv_1",
      invoiceNumber: snap.invoiceNumber,
      issuedAt: new Date(snap.issuedAtIso),
      snapshot: snap,
      created: true,
    });
    const okCust = await GET(new Request("http://localhost/api/orders/ord_123/invoice"), {
      params: Promise.resolve({ orderId: "ord_123" }),
    });
    expect(okCust.status).toBe(200);
    expect(okCust.headers.get("content-type")).toBe("application/pdf");
    expect(okCust.headers.get("content-disposition")).toBe(
      'attachment; filename="WatchStore-Invoice-INV-WS-202611-00001.pdf"',
    );
    expect(okCust.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    const bytes = Buffer.from(await okCust.arrayBuffer());
    expect(bytes.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");

    // 5. Guest order with valid HMAC token succeeds; invalid token rejected
    const validToken = createOrderAccessToken({
      orderNumber: "WS-202611-0001",
      guestEmail: "guest@example.com",
      secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    mockAuthCustomer.mockResolvedValueOnce(null);
    mockFindOrder.mockResolvedValueOnce({
      id: "ord_guest",
      orderNumber: "WS-202611-0001",
      customerId: null,
      guestEmail: "guest@example.com",
    });
    const badGuest = await GET(
      new Request("http://localhost/api/orders/ord_guest/invoice?token=badtoken"),
      { params: Promise.resolve({ orderId: "ord_guest" }) },
    );
    expect(badGuest.status).toBe(401);

    mockAuthCustomer.mockResolvedValueOnce(null);
    mockFindOrder.mockResolvedValueOnce({
      id: "ord_guest",
      orderNumber: "WS-202611-0001",
      customerId: null,
      guestEmail: "guest@example.com",
    });
    mockGenerateInvoice.mockResolvedValueOnce({
      ok: true,
      invoiceId: "inv_1",
      invoiceNumber: snap.invoiceNumber,
      issuedAt: new Date(snap.issuedAtIso),
      snapshot: snap,
      created: false,
    });
    const okGuest = await GET(
      new Request(`http://localhost/api/orders/ord_guest/invoice?token=${validToken}`),
      { params: Promise.resolve({ orderId: "ord_guest" }) },
    );
    expect(okGuest.status).toBe(200);
  });
});
