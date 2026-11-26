import "server-only";
import { z } from "zod";
import { requireRazorpayConfig } from "@/config/env";

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

export const razorpayOrderSchema = z.object({
  id: z.string().min(1),
  entity: z.literal("order").optional(),
  amount: z.number().int().nonnegative(),
  amount_paid: z.number().int().nonnegative().optional(),
  amount_due: z.number().int().nonnegative().optional(),
  currency: z.string().min(3),
  receipt: z.string().nullable().optional(),
  status: z.string().min(1),
});

export const razorpayPaymentSchema = z.object({
  id: z.string().min(1),
  entity: z.literal("payment").optional(),
  amount: z.number().int().nonnegative(),
  currency: z.string().min(3),
  status: z.string().min(1),
  order_id: z.string().nullable().optional(),
  method: z.string().optional(),
  captured: z.boolean().optional(),
  error_code: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
});

const razorpayOrderPaymentsSchema = z.object({
  items: z.array(razorpayPaymentSchema),
});

export type RazorpayOrderDto = z.infer<typeof razorpayOrderSchema>;
export type RazorpayPaymentDto = z.infer<typeof razorpayPaymentSchema>;

export class RazorpayApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly isTimeout: boolean;
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    opts: { status?: number; code?: string; isTimeout?: boolean; isNetworkError?: boolean } = {},
  ) {
    super(message);
    this.name = "RazorpayApiError";
    this.status = opts.status ?? 0;
    this.code = opts.code ?? "RAZORPAY_ERROR";
    this.isTimeout = Boolean(opts.isTimeout);
    this.isNetworkError = Boolean(opts.isNetworkError);
  }
}

export interface RazorpayClient {
  createOrder(params: {
    amountPaise: number;
    currency?: "INR";
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrderDto>;
  fetchOrder(razorpayOrderId: string): Promise<RazorpayOrderDto>;
  fetchPayment(razorpayPaymentId: string): Promise<RazorpayPaymentDto>;
  fetchOrderPayments(razorpayOrderId: string): Promise<RazorpayPaymentDto[]>;
}

export function createRazorpayClient(opts?: {
  keyId?: string;
  keySecret?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): RazorpayClient {
  const fetchFn = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function getAuthHeader(): string {
    const cfg =
      opts?.keyId && opts?.keySecret
        ? { keyId: opts.keyId, keySecret: opts.keySecret }
        : requireRazorpayConfig();
    return `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`;
  }

  async function request<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: Record<string, unknown> },
    schema: z.ZodType<T>,
  ): Promise<T> {
    const auth = getAuthHeader();
    let res: Response;
    try {
      res = await fetchFn(`${RAZORPAY_BASE_URL}${path}`, {
        method: init.method,
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const isTimeout =
        err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new RazorpayApiError(
        isTimeout ? "Razorpay request timed out." : "Network error communicating with Razorpay.",
        { isTimeout, isNetworkError: !isTimeout, code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR" },
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new RazorpayApiError(`Invalid JSON response from Razorpay (HTTP ${res.status}).`, {
        status: res.status,
        code: "INVALID_RESPONSE",
      });
    }

    if (!res.ok) {
      const errObj =
        typeof json === "object" && json !== null && "error" in json
          ? (json as { error?: { code?: string; description?: string } }).error
          : undefined;
      throw new RazorpayApiError(
        errObj?.description ?? `Razorpay API error (HTTP ${res.status}).`,
        {
          status: res.status,
          code: errObj?.code ?? `HTTP_${res.status}`,
        },
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new RazorpayApiError("Unexpected response structure from Razorpay.", {
        status: res.status,
        code: "INVALID_SCHEMA",
      });
    }

    return parsed.data;
  }

  return {
    createOrder({ amountPaise, currency = "INR", receipt, notes }) {
      if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
        return Promise.reject(new RazorpayApiError("Invalid order amount.", { code: "INVALID_AMOUNT" }));
      }
      return request(
        "/orders",
        {
          method: "POST",
          body: {
            amount: amountPaise,
            currency,
            receipt,
            ...(notes ? { notes } : {}),
          },
        },
        razorpayOrderSchema,
      );
    },
    fetchOrder(razorpayOrderId) {
      return request(`/orders/${encodeURIComponent(razorpayOrderId)}`, { method: "GET" }, razorpayOrderSchema);
    },
    fetchPayment(razorpayPaymentId) {
      return request(`/payments/${encodeURIComponent(razorpayPaymentId)}`, { method: "GET" }, razorpayPaymentSchema);
    },
    async fetchOrderPayments(razorpayOrderId) {
      const data = await request(
        `/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
        { method: "GET" },
        razorpayOrderPaymentsSchema,
      );
      return data.items;
    },
  };
}
