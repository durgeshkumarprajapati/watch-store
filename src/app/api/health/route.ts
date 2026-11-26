import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function checkHealthResponse(
  probeDb: () => Promise<unknown> = () => getPrisma().$queryRaw`SELECT 1`,
) {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
  };

  try {
    await probeDb();
    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers },
    );
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers },
    );
  }
}

export async function GET() {
  return checkHealthResponse();
}
