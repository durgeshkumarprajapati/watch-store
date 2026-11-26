import { NextResponse } from "next/server";
import { processShiprocketWebhook } from "@/modules/shipping/application/shipping-webhook-service";

const MAX_WEBHOOK_BYTES = 256 * 1024; // 256 KB

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large." }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to read request body." }, { status: 400 });
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large." }, { status: 413 });
  }

  const apiKeyHeader = request.headers.get("x-api-key");
  const result = await processShiprocketWebhook({ rawBody, apiKeyHeader });
  return NextResponse.json(result.body, { status: result.status });
}
