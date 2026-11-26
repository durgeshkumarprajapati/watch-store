import { NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAuthenticatedCustomer } from "@/modules/auth/session-service";
import { renderInvoicePdf } from "@/modules/invoices/invoice-pdf";
import { generateOrGetOrderInvoice } from "@/modules/invoices/invoice-service";
import { InvoiceConfigurationError } from "@/modules/invoices/seller-config";
import { verifyOrderAccessToken } from "@/modules/payments/infrastructure/razorpay-signature";

export const dynamic = "force-dynamic";

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await context.params;
    if (!SAFE_ID_RE.test(orderId)) {
      return NextResponse.json({ error: "Invalid order reference." }, { status: 400 });
    }

    const url = new URL(request.url);
    const guestToken = url.searchParams.get("token")?.trim() ?? "";

    const customer = await getAuthenticatedCustomer();
    const prisma = getPrisma();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        guestEmail: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    let authorized = false;
    let rateKey = "";

    if (customer && order.customerId === customer.id) {
      authorized = true;
      rateKey = `invoice:cust:${customer.id}`;
    } else if (guestToken) {
      const secret = getServerEnv().RAZORPAY_KEY_SECRET;
      if (
        secret &&
        verifyOrderAccessToken({
          token: guestToken,
          orderNumber: order.orderNumber,
          guestEmail: order.guestEmail,
          secret,
        })
      ) {
        authorized = true;
        rateKey = `invoice:guest:${order.id}`;
      }
    }

    if (!authorized) {
      return NextResponse.json(
        { error: customer ? "You do not have access to this invoice." : "Authentication required." },
        { status: customer ? 403 : 401 },
      );
    }

    const limit = checkRateLimit(rateKey, 20, 10 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many invoice requests. Try again in ${limit.retryAfterSeconds}s.` },
        { status: 429 },
      );
    }

    const res = await generateOrGetOrderInvoice({ orderId: order.id }, prisma);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    const pdfBuffer = renderInvoicePdf(res.snapshot);
    const safeFilename = res.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "");

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="WatchStore-Invoice-${safeFilename}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof InvoiceConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Unable to generate invoice right now. Please try again." },
      { status: 500 },
    );
  }
}
