import { z } from "zod";
import { getServerEnv } from "@/config/env";

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";
const REQUEST_TIMEOUT_MS = 12_000;

export class ShiprocketApiError extends Error {
  readonly statusCode: number;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number, retryable: boolean) {
    super(message);
    this.name = "ShiprocketApiError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export const shiprocketLoginResponseSchema = z.object({
  token: z.string().min(10),
});

export const shiprocketCourierOptionSchema = z.object({
  courier_company_id: z.number().int(),
  courier_name: z.string(),
  rate: z.number(),
  etd: z.string().optional(),
  estimated_delivery_days: z.union([z.string(), z.number()]).optional(),
  cod: z.union([z.number(), z.boolean()]).optional(),
});

export const shiprocketServiceabilityResponseSchema = z.object({
  data: z.object({
    available_courier_companies: z.array(shiprocketCourierOptionSchema).default([]),
  }),
});

export const shiprocketCreateOrderResponseSchema = z.object({
  order_id: z.union([z.number(), z.string()]),
  shipment_id: z.union([z.number(), z.string()]),
  status: z.string().optional(),
});

export const shiprocketAssignAwbResponseSchema = z.object({
  awb_assign_status: z.number().optional(),
  response: z
    .object({
      data: z
        .object({
          awb_code: z.string().min(1),
          courier_company_id: z.number().optional(),
          courier_name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const shiprocketLabelResponseSchema = z.object({
  label_created: z.number().optional(),
  label_url: z.string().url().optional(),
  response: z.string().optional(),
});

export const shiprocketPickupResponseSchema = z.object({
  pickup_status: z.number().optional(),
  response: z
    .object({
      pickup_scheduled_date: z.string().optional(),
      pickup_token_number: z.string().optional(),
      data: z.string().optional(),
    })
    .optional(),
});

export const shiprocketTrackResponseSchema = z.object({
  tracking_data: z
    .object({
      track_status: z.number().optional(),
      shipment_status: z.number().optional(),
      shipment_track: z
        .array(
          z.object({
            current_status: z.string().optional(),
            awb_code: z.string().optional(),
            courier_name: z.string().optional(),
            delivered_date: z.string().nullable().optional(),
            pickup_date: z.string().nullable().optional(),
            etd: z.string().nullable().optional(),
          }),
        )
        .optional(),
      shipment_track_activities: z
        .array(
          z.object({
            date: z.string().optional(),
            status: z.string().optional(),
            activity: z.string().optional(),
            location: z.string().optional(),
            sr_status_label: z.string().optional(),
          }),
        )
        .optional(),
      track_url: z.string().optional(),
    })
    .optional(),
});

export const shiprocketOrderShowResponseSchema = z.object({
  data: z
    .object({
      id: z.union([z.number(), z.string()]),
      status: z.string().optional(),
      shipments: z
        .object({
          id: z.union([z.number(), z.string()]).optional(),
          awb: z.string().nullable().optional(),
          courier: z.string().nullable().optional(),
        })
        .optional(),
    })
    .optional(),
});

export interface ShiprocketAdhocOrderPayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  billing_customer_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  order_items: {
    name: string;
    sku: string;
    units: number;
    selling_price: number;
    discount: number;
    tax: number;
  }[];
  payment_method: "Prepaid" | "COD";
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

export interface ShiprocketClient {
  login(email: string, password: string): Promise<{ token: string }>;
  checkServiceability(
    token: string,
    params: { pickupPostcode: string; deliveryPostcode: string; weightKg: number; cod: 0 | 1 },
  ): Promise<z.infer<typeof shiprocketServiceabilityResponseSchema>>;
  createAdhocOrder(
    token: string,
    payload: ShiprocketAdhocOrderPayload,
  ): Promise<z.infer<typeof shiprocketCreateOrderResponseSchema>>;
  assignAwb(
    token: string,
    params: { shipmentId: string; courierId?: number },
  ): Promise<z.infer<typeof shiprocketAssignAwbResponseSchema>>;
  generateLabel(
    token: string,
    params: { shipmentId: string },
  ): Promise<z.infer<typeof shiprocketLabelResponseSchema>>;
  schedulePickup(
    token: string,
    params: { shipmentId: string },
  ): Promise<z.infer<typeof shiprocketPickupResponseSchema>>;
  trackByAwb(
    token: string,
    awbCode: string,
  ): Promise<z.infer<typeof shiprocketTrackResponseSchema>>;
  getOrderDetails(
    token: string,
    shiprocketOrderId: string,
  ): Promise<z.infer<typeof shiprocketOrderShowResponseSchema>>;
  cancelOrder(token: string, shiprocketOrderIds: string[]): Promise<void>;
}

export function isShiprocketConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.SHIPROCKET_API_EMAIL && env.SHIPROCKET_API_PASSWORD);
}

async function requestJson<T>(
  path: string,
  opts: { method: "GET" | "POST"; token?: string; body?: unknown },
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SHIPROCKET_BASE_URL}${path}`, {
      method: opts.method,
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new ShiprocketApiError(
      isTimeout ? "Shiprocket request timed out." : "Shiprocket network request failed.",
      504,
      true,
    );
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    throw new ShiprocketApiError("Malformed response from Shiprocket.", response.status, response.status >= 500);
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const msg =
      typeof json === "object" && json && "message" in json && typeof json.message === "string"
        ? json.message
        : `Shiprocket API error (${response.status}).`;
    throw new ShiprocketApiError(msg, response.status, retryable);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ShiprocketApiError("Unexpected Shiprocket response structure.", 502, false);
  }
  return parsed.data;
}

export const httpShiprocketClient: ShiprocketClient = {
  login(email, password) {
    return requestJson(
      "/auth/login",
      { method: "POST", body: { email, password } },
      shiprocketLoginResponseSchema,
    );
  },

  checkServiceability(token, params) {
    const qs = new URLSearchParams({
      pickup_postcode: params.pickupPostcode,
      delivery_postcode: params.deliveryPostcode,
      weight: String(params.weightKg),
      cod: String(params.cod),
    });
    return requestJson(
      `/courier/serviceability/?${qs.toString()}`,
      { method: "GET", token },
      shiprocketServiceabilityResponseSchema,
    );
  },

  createAdhocOrder(token, payload) {
    return requestJson(
      "/orders/create/adhoc",
      { method: "POST", token, body: payload },
      shiprocketCreateOrderResponseSchema,
    );
  },

  assignAwb(token, params) {
    return requestJson(
      "/courier/assign/awb",
      {
        method: "POST",
        token,
        body: {
          shipment_id: Number(params.shipmentId) || params.shipmentId,
          ...(params.courierId ? { courier_id: params.courierId } : {}),
        },
      },
      shiprocketAssignAwbResponseSchema,
    );
  },

  generateLabel(token, params) {
    return requestJson(
      "/courier/generate/label",
      {
        method: "POST",
        token,
        body: { shipment_id: [Number(params.shipmentId) || params.shipmentId] },
      },
      shiprocketLabelResponseSchema,
    );
  },

  schedulePickup(token, params) {
    return requestJson(
      "/courier/generate/pickup",
      {
        method: "POST",
        token,
        body: { shipment_id: [Number(params.shipmentId) || params.shipmentId] },
      },
      shiprocketPickupResponseSchema,
    );
  },

  trackByAwb(token, awbCode) {
    return requestJson(
      `/courier/track/awb/${encodeURIComponent(awbCode)}`,
      { method: "GET", token },
      shiprocketTrackResponseSchema,
    );
  },

  getOrderDetails(token, shiprocketOrderId) {
    return requestJson(
      `/orders/show/${encodeURIComponent(shiprocketOrderId)}`,
      { method: "GET", token },
      shiprocketOrderShowResponseSchema,
    );
  },

  async cancelOrder(token, shiprocketOrderIds) {
    await requestJson(
      "/orders/cancel",
      {
        method: "POST",
        token,
        body: { ids: shiprocketOrderIds.map((id) => Number(id) || id) },
      },
      z.unknown(),
    );
  },
};
