import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { hashPassword, verifyPassword } from "@/modules/auth/password-service";
import { generateRawToken, hashAuthToken } from "@/modules/auth/token-service";
import { sendTransactionalEmail } from "@/modules/notifications/email-service";
import {
  addressSchema,
  changePasswordSchema,
  profileUpdateSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/validations/auth";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
  resetRateLimit();
});

describe("password & token security", () => {
  it("hashes and verifies passwords with Argon2id", async () => {
    const hash = await hashPassword("Horology#2026");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain("Horology#2026");
    expect(await verifyPassword(hash, "Horology#2026")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("hashes auth tokens with SHA-256 and never stores raw tokens", () => {
    const raw = generateRawToken();
    const hashed = hashAuthToken(raw);
    expect(raw.length).toBe(64);
    expect(hashed.length).toBe(64);
    expect(hashed).not.toBe(raw);
  });
});

describe("auth & account Zod validation", () => {
  it("normalizes email and validates registration", () => {
    const valid = registerSchema.parse({
      fullName: "  Aarav Mehta ",
      email: "  Aarav@Example.COM ",
      password: "Password123",
      confirmPassword: "Password123",
      acceptTerms: true,
    });
    expect(valid.email).toBe("aarav@example.com");
    expect(valid.fullName).toBe("Aarav Mehta");

    expect(
      registerSchema.safeParse({
        fullName: "Aarav",
        email: "aarav@example.com",
        password: "Password123",
        confirmPassword: "DifferentPassword",
        acceptTerms: true,
      }).success,
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        fullName: "Aarav",
        email: "aarav@example.com",
        password: "short",
        confirmPassword: "short",
        acceptTerms: true,
      }).success,
    ).toBe(false);
  });

  it("validates profile, address, reset, and change-password schemas", () => {
    expect(profileUpdateSchema.parse({ fullName: "Aarav", phone: "+91 98201 44510" }).phone).toBe(
      "9820144510",
    );
    expect(addressSchema.safeParse({ addressLine1: "123 Street", city: "Mumbai", state: "MH", pinCode: "4000" }).success).toBe(
      false,
    );
    expect(resetPasswordSchema.safeParse({ token: "a".repeat(32), password: "Password123", confirmPassword: "Password123" }).success).toBe(
      true,
    );
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "NewPassword1", confirmPassword: "NewPassword1" }).success).toBe(
      true,
    );
  });
});

describe("rate limiting & email service", () => {
  it("enforces sliding window rate limits", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("login:a@b.com", 2, 60_000, t0).allowed).toBe(true);
    expect(checkRateLimit("login:a@b.com", 2, 60_000, t0 + 1000).allowed).toBe(true);
    const blocked = checkRateLimit("login:a@b.com", 2, 60_000, t0 + 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reports skipped when Resend is unconfigured and posts to Resend when configured", async () => {
    delete process.env.RESEND_API_KEY;
    const skipped = await sendTransactionalEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(skipped).toMatchObject({ ok: false, skipped: true });

    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "WatchStore <no-reply@example.com>";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    const sent = await sendTransactionalEmail({
      to: "user@example.com",
      subject: "Verify",
      html: "<p>Verify</p>",
      text: "Verify",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(sent).toEqual({ ok: true, id: "email_123" });
  });
});
