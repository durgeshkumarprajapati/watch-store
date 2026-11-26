import "server-only";
import { sendNotification } from "web-push";
import { getServerEnv } from "@/config/env";
import { isSafeRelativeTargetUrl, validatePushEndpoint } from "./push-validation";

export interface PushPayloadData {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type SendPushResult =
  | { ok: true; statusCode: number }
  | { ok: false; skipped: boolean; expired: boolean; retryable: boolean; statusCode?: number; error: string };

export type WebPushSendFn = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: { vapidDetails: { subject: string; publicKey: string; privateKey: string }; timeout: number },
) => Promise<{ statusCode: number }>;

export function isVapidConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export async function sendWebPushNotification(params: {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: PushPayloadData;
  sendImpl?: WebPushSendFn;
}): Promise<SendPushResult> {
  const env = getServerEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return {
      ok: false,
      skipped: true,
      expired: false,
      retryable: false,
      error: "VAPID push notifications are not configured.",
    };
  }

  const endpointCheck = validatePushEndpoint(params.endpoint);
  if (!endpointCheck.ok) {
    return {
      ok: false,
      skipped: false,
      expired: true,
      retryable: false,
      error: endpointCheck.error,
    };
  }

  const minimalPayload = JSON.stringify({
    title: params.payload.title.slice(0, 120),
    body: params.payload.body.slice(0, 240),
    url: isSafeRelativeTargetUrl(params.payload.url),
    tag: params.payload.tag?.slice(0, 80) ?? "watchstore-notification",
    icon: "/favicon.ico",
  });

  const sendFn: WebPushSendFn =
    params.sendImpl ??
    ((sub, body, opts) => sendNotification(sub, body, opts));

  try {
    const res = await sendFn(
      {
        endpoint: endpointCheck.url,
        keys: { p256dh: params.p256dh, auth: params.auth },
      },
      minimalPayload,
      {
        vapidDetails: {
          subject: env.VAPID_SUBJECT,
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
        timeout: 5_000,
      },
    );
    return { ok: true, statusCode: res.statusCode };
  } catch (err) {
    const statusCode =
      typeof err === "object" && err !== null && "statusCode" in err && typeof err.statusCode === "number"
        ? err.statusCode
        : undefined;

    if (statusCode === 404 || statusCode === 410) {
      return {
        ok: false,
        skipped: false,
        expired: true,
        retryable: false,
        statusCode,
        error: `Push subscription expired (HTTP ${statusCode}).`,
      };
    }

    const retryable = statusCode === undefined || statusCode === 429 || statusCode >= 500;
    return {
      ok: false,
      skipped: false,
      expired: false,
      retryable,
      statusCode,
      error: statusCode ? `Push provider error (HTTP ${statusCode}).` : "Push delivery request failed.",
    };
  }
}
