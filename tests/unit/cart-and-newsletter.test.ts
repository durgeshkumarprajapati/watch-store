import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory cookie jar standing in for next/headers.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/env")>();
  return { ...actual, hasDatabaseUrl: () => false };
});

import { addToCartAction } from "@/modules/cart/actions";
import { getCartCount, getCartLines } from "@/modules/cart/cart-store";
import { toggleWishlistAction } from "@/modules/wishlist/actions";
import { getWishlistIds } from "@/modules/wishlist/wishlist-store";
import { subscribeNewsletterAction } from "@/modules/newsletter/actions";
import { newsletterSchema } from "@/validations/newsletter";

beforeEach(() => jar.clear());

describe("cart (server-side)", () => {
  it("adds a product and counts quantity", async () => {
    expect(await addToCartAction("p-001")).toEqual({ ok: true, count: 1 });
    expect(await addToCartAction("p-001")).toEqual({ ok: true, count: 2 });
    expect(await getCartCount()).toBe(2);
  });
  it("rejects unknown products and never stores prices", async () => {
    expect((await addToCartAction("nope")).ok).toBe(false);
    await addToCartAction("p-001");
    expect(Object.keys((await getCartLines())[0]!).sort()).toEqual(["productId", "quantity"]);
  });
  it("rejects out-of-stock products", async () => {
    const res = await addToCartAction("p-010");
    expect(res).toEqual({ ok: false, error: "Currently out of stock." });
  });
  it("caps quantity at available stock (p-004 has 3)", async () => {
    await addToCartAction("p-004");
    await addToCartAction("p-004");
    await addToCartAction("p-004");
    expect((await addToCartAction("p-004")).ok).toBe(false);
    expect(await getCartCount()).toBe(3);
  });
  it("ignores a tampered cart cookie", async () => {
    jar.set("cart", JSON.stringify([{ productId: "p-001", quantity: 9999, price: 1 }]));
    expect(await getCartLines()).toEqual([]);
    jar.set("cart", "not-json");
    expect(await getCartCount()).toBe(0);
  });
});

describe("wishlist", () => {
  it("toggles and validates product existence", async () => {
    expect(await toggleWishlistAction("p-002")).toEqual({ ok: true, saved: true });
    expect(await getWishlistIds()).toEqual(["p-002"]);
    expect(await toggleWishlistAction("p-002")).toEqual({ ok: true, saved: false });
    expect((await toggleWishlistAction("nope")).ok).toBe(false);
  });
});

describe("newsletter", () => {
  it("validates and normalises email", () => {
    expect(newsletterSchema.parse({ email: "  A@Example.COM " }).email).toBe("a@example.com");
    expect(newsletterSchema.safeParse({ email: "bad" }).success).toBe(false);
  });
  it("returns an error for invalid input without touching storage", async () => {
    const fd = new FormData();
    fd.set("email", "nope");
    const res = await subscribeNewsletterAction({ status: "idle", message: "" }, fd);
    expect(res.status).toBe("error");
  });
});
