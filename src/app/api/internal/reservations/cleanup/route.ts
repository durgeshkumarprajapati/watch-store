import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/modules/operations/scheduler-auth";
import { executeScheduledReservationCleanup } from "@/modules/operations/operations-service";

async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const result = await executeScheduledReservationCleanup();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
