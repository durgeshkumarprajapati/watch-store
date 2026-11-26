import "server-only";
import { z } from "zod";
import { getServerEnv } from "@/config/env";
import { brand } from "@/config/brand";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const resendSuccessSchema = z.object({
  id: z.string().min(1),
});

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; skipped: boolean; retryable: boolean; error: string };

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<SendEmailResult> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (env.NODE_ENV === "development") {
      console.info(`[EmailService] Resend not configured; skipped "${params.subject}"`);
    }
    return {
      ok: false,
      skipped: true,
      retryable: false,
      error: "Email delivery is not configured.",
    };
  }

  const fetchFn = params.fetchImpl ?? fetch;
  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      return {
        ok: false,
        skipped: false,
        retryable,
        error: `Email provider error (HTTP ${res.status}).`,
      };
    }

    const json = await res.json();
    const parsed = resendSuccessSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        skipped: false,
        retryable: false,
        error: "Unexpected email provider response.",
      };
    }
    return { ok: true, id: parsed.data.id };
  } catch {
    return {
      ok: false,
      skipped: false,
      retryable: true,
      error: "Failed to reach email provider.",
    };
  }
}

export function buildVerificationEmail(params: { name: string; verifyUrl: string }) {
  const safeName = escapeHtml(params.name);
  const safeUrl = escapeHtml(params.verifyUrl);
  const subject = `Verify your ${brand.name} email`;
  const text = `Hello ${params.name},\n\nVerify your email address by visiting:\n${params.verifyUrl}\n\nThis link expires in 24 hours.`;
  const html = `<p>Hello ${safeName},</p><p>Verify your ${escapeHtml(brand.name)} email address by clicking below:</p><p><a href="${safeUrl}">Verify Email Address</a></p><p>This link expires in 24 hours.</p>`;
  return { subject, text, html };
}

export function buildPasswordResetEmail(params: { resetUrl: string }) {
  const safeUrl = escapeHtml(params.resetUrl);
  const subject = `Reset your ${brand.name} password`;
  const text = `Reset your ${brand.name} password by visiting:\n${params.resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`;
  const html = `<p>Reset your ${escapeHtml(brand.name)} password by clicking below:</p><p><a href="${safeUrl}">Reset Password</a></p><p>This link expires in 1 hour.</p>`;
  return { subject, text, html };
}
