import { NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getServerEnv();
  const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);

  return NextResponse.json(
    {
      configured,
      publicKey: configured ? env.VAPID_PUBLIC_KEY! : null,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
