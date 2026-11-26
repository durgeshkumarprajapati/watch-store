import { createHash, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getServerEnv } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { shiprocketWebhookPayloadSchema } from "./shipping-validation";
import { applyTrackingUpdateInTx, buildHistoryDedupeKey } from "./tracking-sync-service";

export function verifyShiprocketWebhookToken(headerToken: string | null): boolean {
  const env = getServerEnv();
  const expected = env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!expected || !headerToken) return false;
  const a = Buffer.from(headerToken.trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function computeWebhookDedupeKey(rawBody: string, parsed: {
  awb?: string;
  sr_order_id?: string | number;
  order_id?: string | number;
  current_status: string;
  current_timestamp?: string;
}): string {
  const keyMaterial = [
    parsed.awb ?? "",
    parsed.sr_order_id ?? parsed.order_id ?? "",
    parsed.current_status.trim().toUpperCase(),
    parsed.current_timestamp ?? "",
  ].join("|");
  if (parsed.current_timestamp) {
    return createHash("sha256").update(keyMaterial).digest("hex");
  }
  return createHash("sha256").update(rawBody).digest("hex");
}

export async function processShiprocketWebhook(
  params: { rawBody: string; apiKeyHeader: string | null },
  prismaClient?: PrismaClient,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!verifyShiprocketWebhookToken(params.apiKeyHeader)) {
    return { status: 401, body: { ok: false, error: "Unauthorized webhook request." } };
  }

  let json: unknown;
  try {
    json = JSON.parse(params.rawBody);
  } catch {
    return { status: 400, body: { ok: false, error: "Invalid JSON payload." } };
  }

  const parsed = shiprocketWebhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return { status: 400, body: { ok: false, error: "Invalid Shiprocket webhook payload." } };
  }

  const payload = parsed.data;
  const dedupeKey = computeWebhookDedupeKey(params.rawBody, payload);
  const prisma = prismaClient ?? getPrisma();

  // Persist webhook event durably before processing
  let eventRow: { id: string; processedAt: Date | null };
  try {
    eventRow = await prisma.shippingWebhookEvent.create({
      data: {
        dedupeKey,
        awbCode: payload.awb ?? null,
        shiprocketOrderId: payload.sr_order_id ? String(payload.sr_order_id) : null,
        eventStatus: payload.current_status,
        payload: json as Prisma.InputJsonValue,
      },
      select: { id: true, processedAt: true },
    });
  } catch {
    // Unique constraint on dedupeKey -> duplicate delivery
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  if (eventRow.processedAt) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  try {
    const shipment = await prisma.shipment.findFirst({
      where: {
        isManual: false,
        OR: [
          ...(payload.awb ? [{ awbCode: payload.awb }] : []),
          ...(payload.sr_order_id
            ? [{ shiprocketOrderId: String(payload.sr_order_id) }]
            : []),
        ],
      },
    });

    if (!shipment) {
      await prisma.shippingWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          attempts: { increment: 1 },
          lastError: "No matching Shiprocket shipment found.",
        },
      });
      return { status: 202, body: { ok: true, matched: false } };
    }

    const latestScan = payload.scans?.[0];
    const eventAt = payload.current_timestamp
      ? new Date(payload.current_timestamp)
      : latestScan?.date
        ? new Date(latestScan.date)
        : new Date();
    const safeEventAt = Number.isNaN(eventAt.getTime()) ? new Date() : eventAt;

    await prisma.$transaction(async (tx) => {
      await applyTrackingUpdateInTx(tx, shipment, {
        providerStatus: payload.current_status,
        location: latestScan?.location,
        note: latestScan?.activity ?? `Webhook status: ${payload.current_status}`,
        eventAt: safeEventAt,
        dedupeKey: buildHistoryDedupeKey(
          shipment.id,
          payload.current_status.trim().toUpperCase(),
          safeEventAt.toISOString(),
          latestScan?.location,
        ),
        courierName: payload.courier_name,
      });

      await tx.shippingWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          processedAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
        },
      });
    });

    return { status: 200, body: { ok: true, duplicate: false } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing error.";
    await prisma.shippingWebhookEvent.update({
      where: { id: eventRow.id },
      data: {
        attempts: { increment: 1 },
        lastError: message,
      },
    });
    await prisma.shippingJob.create({
      data: {
        jobType: "WEBHOOK_PROCESS",
        payload: { webhookEventId: eventRow.id },
        status: "PENDING",
        nextRunAt: new Date(Date.now() + 30_000),
        idempotencyKey: `webhook-retry-${eventRow.id}`,
      },
    });
    return { status: 500, body: { ok: false, error: "Webhook processing failed; queued for retry." } };
  }
}
