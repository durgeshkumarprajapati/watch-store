import { createSign } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@/config/env";

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const REQUEST_TIMEOUT_MS = 15_000;

export class GoogleSheetsApiError extends Error {
  readonly statusCode: number;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number, retryable: boolean) {
    super(message);
    this.name = "GoogleSheetsApiError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export interface GoogleSheetsClient {
  verifySpreadsheetAccess(
    spreadsheetId: string,
    worksheetName: string,
  ): Promise<{ title: string; worksheets: string[] }>;
  readRange(spreadsheetId: string, range: string): Promise<string[][]>;
  clearRange(spreadsheetId: string, range: string): Promise<void>;
  writeRange(
    spreadsheetId: string,
    range: string,
    values: (string | number | boolean)[][],
  ): Promise<{ updatedRows: number; updatedCells: number }>;
}

export function isGoogleSheetsConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getServiceAccountAccessToken(): Promise<string> {
  const env = getServerEnv();
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new GoogleSheetsApiError(
      "Google Service Account credentials are not configured on the server.",
      503,
      false,
    );
  }

  const nowMs = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > nowMs + 60_000) {
    return cachedAccessToken.token;
  }

  const nowSec = Math.floor(nowMs / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: SHEETS_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );

  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = base64UrlEncode(signer.sign(privateKey));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new GoogleSheetsApiError(
      `Google OAuth token exchange failed (HTTP ${res.status}).`,
      res.status,
      res.status >= 500 || res.status === 429,
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new GoogleSheetsApiError("Google OAuth response missing access_token.", 502, false);
  }

  cachedAccessToken = {
    token: json.access_token,
    expiresAtMs: nowMs + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

async function fetchSheetsWithBackoff<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const token = await getServiceAccountAccessToken();

  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      throw new GoogleSheetsApiError("Google Sheets network request failed.", 504, true);
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
        continue;
      }
      throw new GoogleSheetsApiError(
        `Google Sheets API temporarily unavailable (HTTP ${res.status}).`,
        res.status,
        true,
      );
    }

    if (!res.ok) {
      throw new GoogleSheetsApiError(
        `Google Sheets API rejected request (HTTP ${res.status}).`,
        res.status,
        false,
      );
    }

    const json = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new GoogleSheetsApiError("Unexpected Google Sheets API response.", 502, false);
    }
    return parsed.data;
  }

  throw new GoogleSheetsApiError("Google Sheets API retry budget exceeded.", 503, true);
}

const metadataSchema = z.object({
  properties: z.object({ title: z.string() }),
  sheets: z.array(z.object({ properties: z.object({ title: z.string() }) })),
});

const valuesGetSchema = z.object({
  values: z.array(z.array(z.string())).optional(),
});

const valuesUpdateSchema = z.object({
  updatedRows: z.number().optional(),
  updatedCells: z.number().optional(),
});

export const httpGoogleSheetsClient: GoogleSheetsClient = {
  async verifySpreadsheetAccess(spreadsheetId, worksheetName) {
    const meta = await fetchSheetsWithBackoff(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`,
      { method: "GET" },
      metadataSchema,
    );
    const worksheets = meta.sheets.map((s) => s.properties.title);
    if (!worksheets.includes(worksheetName)) {
      throw new GoogleSheetsApiError(
        `Worksheet "${worksheetName}" not found in spreadsheet "${meta.properties.title}".`,
        404,
        false,
      );
    }
    return { title: meta.properties.title, worksheets };
  },

  async readRange(spreadsheetId, range) {
    const res = await fetchSheetsWithBackoff(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
      { method: "GET" },
      valuesGetSchema,
    );
    return res.values ?? [];
  },

  async clearRange(spreadsheetId, range) {
    await fetchSheetsWithBackoff(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`,
      { method: "POST", body: "{}" },
      z.unknown(),
    );
  },

  async writeRange(spreadsheetId, range, values) {
    const res = await fetchSheetsWithBackoff(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values }) },
      valuesUpdateSchema,
    );
    return {
      updatedRows: res.updatedRows ?? values.length,
      updatedCells: res.updatedCells ?? 0,
    };
  },
};
