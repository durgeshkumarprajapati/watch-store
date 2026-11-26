import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/auth/session-service", () => ({
  getAuthenticatedCustomer: async () => null,
}));

import {
  addToCartAction,
  applyPromoCodeAction,
  clearCartAction,
  removeFromCartAction,
  updateCartQuantityAction,
} from "@/modules/cart/actions";
import {
  calculateIncludedGstPaise,
  computeCartSummary,
  getCartSummary,
} from "@/modules/cart/cart-service";
import { devProducts } from "@/modules/catalogue/seed/dev-catalogue";
import { submitCheckoutAction } from "@/modules/checkout/actions";

beforeEach(() => {
  jar.clear();
  process.env.CATALOGUE_SOURCE = "seed";
});

describe("cart summary & mutations", () => {
  it("handles empty cart cleanly", async () => {
    const summary = await getCartSummary();
    expect(summary.items).toEqual([]);
    expect(summary.itemCount).toBe(0);
    expect(summary.grandTotalPaise).toBe(0);
    expect(summary.canCheckout).toBe(false);
  });

  it("computes single-item and multi-item totals, GST, and shipping", async () => {
    await addToCartAction("p-001", 1); // ₹1,45,000
    let summary = await getCartSummary();
    expect(summary.itemCount).toBe(1);
    expect(summary.subtotalPaise).toBe(14500000);
    expect(summary.shippingPaise).toBe(0);
    expect(summary.canCheckout).toBe(true);

    await addToCartAction("p-002", 1); // ₹88,500
    summary = await getCartSummary();
    expect(summary.itemCount).toBe(2);
    expect(summary.subtotalPaise).toBe(23350000);

    // Apply promo WATCH10 (-₹10,000) -> ₹2,23,500, included GST = ₹34,093
    const promo = await applyPromoCodeAction("watch10");
    expect(promo).toEqual({ ok: true, code: "WATCH10" });
    summary = await getCartSummary();
    expect(summary.promoDiscountPaise).toBe(1000000);
    expect(summary.grandTotalPaise).toBe(22350000);
    expect(calculateIncludedGstPaise(22350000, 1800)).toBe(3409322);
    expect(Math.round(summary.includedGstPaise / 100)).toBe(34093);
  });

  it("validates quantity updates (min, max, invalid, stock)", async () => {
    await addToCartAction("p-004", 1); // stock: 3
    expect((await updateCartQuantityAction("p-004", 0)).ok).toBe(false);
    expect((await updateCartQuantityAction("p-004", 1.5)).ok).toBe(false);
    expect((await updateCartQuantityAction("p-004", 11)).ok).toBe(false);
    expect(await updateCartQuantityAction("p-004", 4)).toEqual({ ok: false, error: "Only 3 available." });
    expect(await updateCartQuantityAction("p-004", 3)).toEqual({ ok: true });
    expect((await getCartSummary()).itemCount).toBe(3);
  });

  it("removes items and clears cart", async () => {
    await addToCartAction("p-001", 1);
    await addToCartAction("p-002", 1);
    await removeFromCartAction("p-001");
    expect((await getCartSummary()).items.map((i) => i.productId)).toEqual(["p-002"]);

    await clearCartAction();
    const cleared = await getCartSummary();
    expect(cleared.items).toEqual([]);
    expect(cleared.promoCode).toBeNull();
  });

  it("detects stock drops and unavailable products", () => {
    const outOfStock = devProducts.find((p) => p.id === "p-010")!;
    const summary = computeCartSummary(
      [
        { productId: "p-010", quantity: 1 },
        { productId: "missing-id", quantity: 1 },
      ],
      [outOfStock],
      null,
    );
    expect(summary.canCheckout).toBe(false);
    expect(summary.issues.map((i) => i.reason)).toEqual(["out_of_stock", "unavailable"]);
  });
});

describe("checkout validation & order boundary", () => {
  const validForm = {
    idempotencyKey: "chk-test-001",
    fullName: "Aarav Mehta",
    email: "aarav@example.com",
    phone: "+91 98201 44510",
    addressLine1: "1402 Sea Breeze Towers, Worli",
    addressLine2: "",
    city: "Mumbai",
    state: "Maharashtra",
    pinCode: "400018",
    country: "India" as const,
    shippingMethod: "standard" as const,
    paymentMethod: "razorpay" as const,
  };

  it("rejects invalid PIN code and invalid checkout details", async () => {
    await addToCartAction("p-001", 1);
    const badPin = await submitCheckoutAction({ ...validForm, pinCode: "4000" });
    expect(badPin.ok).toBe(false);
    if (!badPin.ok) expect(badPin.fieldErrors?.pinCode).toBeTruthy();

    const badPhone = await submitCheckoutAction({ ...validForm, phone: "12345" });
    expect(badPhone.ok).toBe(false);
    if (!badPhone.ok) expect(badPhone.fieldErrors?.phone).toBeTruthy();
  });

  it("rejects COD for orders exceeding ₹50,000", async () => {
    await addToCartAction("p-001", 1); // ₹1,45,000
    const res = await submitCheckoutAction({ ...validForm, paymentMethod: "cod" });
    expect(res).toEqual({
      ok: false,
      error: "Cash on Delivery is unavailable for orders exceeding ₹50,000.",
      duplicate: undefined,
    });
  });

  it("allows COD for orders <= ₹50,000 and prevents duplicate submissions", async () => {
    await addToCartAction("p-011", 1); // ₹48,500
    const first = await submitCheckoutAction({
      ...validForm,
      idempotencyKey: "chk-cod-unique-1",
      paymentMethod: "cod",
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.snapshot.paymentStatus).toBe("pending");
      expect(first.snapshot.orderStatus).toBe("awaiting_persistence");
      expect(first.snapshot.totals.grandTotalPaise).toBe(4850000);
    }

    const dup = await submitCheckoutAction({
      ...validForm,
      idempotencyKey: "chk-cod-unique-1",
      paymentMethod: "cod",
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.duplicate).toBe(true);
  });
});
