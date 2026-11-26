import "server-only";
import { cookies } from "next/headers";
import type { ZodType } from "zod";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Read a JSON cookie validated against a schema. Invalid/missing data => fallback (never trusted). */
export async function readJsonCookie<T>(name: string, schema: ZodType<T>, fallback: T): Promise<T> {
  const raw = (await cookies()).get(name)?.value;
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJsonCookie(name: string, value: unknown) {
  (await cookies()).set(name, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}
