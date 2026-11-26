import { z } from "zod";

const ALLOWED_PUSH_HOST_PATTERNS: RegExp[] = [
  /^fcm\.googleapis\.com$/i,
  /^android\.googleapis\.com$/i,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/i,
  /^[a-z0-9-]+\.push\.apple\.com$/i,
  /^web\.push\.apple\.com$/i,
  /^[a-z0-9-]+\.notify\.windows\.com$/i,
  /^[a-z0-9-]+\.push\.samsung\.com$/i,
];

function isPrivateOrReservedIp(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) {
    return true;
  }
  if (
    lower === "::1" ||
    lower === "[::1]" ||
    (lower.includes(":") &&
      (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")))
  ) {
    return true;
  }
  const ipv4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return true; // Reject raw IPv4 addresses altogether for push endpoints
  }
  return false;
}

export function validatePushEndpoint(rawEndpoint: string): { ok: true; url: string; host: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawEndpoint.trim());
  } catch {
    return { ok: false, error: "Invalid push subscription endpoint URL." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Push subscription endpoint must use HTTPS." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Push subscription endpoint must not contain credentials." };
  }
  if (isPrivateOrReservedIp(parsed.hostname)) {
    return { ok: false, error: "Push subscription endpoint host is not permitted." };
  }

  const allowed = ALLOWED_PUSH_HOST_PATTERNS.some((re) => re.test(parsed.hostname));
  if (!allowed) {
    return { ok: false, error: "Push subscription endpoint host is not an approved Web Push provider." };
  }

  return { ok: true, url: parsed.toString(), host: parsed.hostname };
}

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().trim().min(16).max(2048),
  keys: z.object({
    p256dh: z.string().trim().min(16).max(512),
    auth: z.string().trim().min(8).max(256),
  }),
  userAgent: z.string().trim().max(300).optional(),
  portal: z.enum(["customer", "admin"]).optional(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export function isSafeRelativeTargetUrl(url?: string | null): string {
  if (!url) return "/";
  const trimmed = url.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  return "/";
}
