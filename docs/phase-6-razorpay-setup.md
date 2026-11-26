# Phase 6 — Razorpay Test Mode & Webhook Setup Guide

## 1. Obtaining Razorpay Test Credentials
1. Sign in to the [Razorpay Dashboard](https://dashboard.razorpay.com/) and switch the top toggle to **Test Mode**.
2. Go to **Account & Settings → API Keys → Generate Test Key**.
3. Copy the **Key ID** (`rzp_test_...`) and **Key Secret**.

## 2. Environment Variables
Add these to `.env` / `.env.local` (never commit real secrets):
```env
RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="your_test_key_secret"
RAZORPAY_WEBHOOK_SECRET="your_webhook_secret"
```

## 3. Local Webhook Tunnel & Events
1. Expose local port `3000` using a tunnel (e.g., `ngrok http 3000` or Cloudflare Tunnel).
2. In Razorpay Dashboard (**Test Mode → Webhooks → Add New Webhook**):
   - **Webhook URL**: `https://<your-tunnel-domain>/api/webhooks/razorpay`
   - **Secret**: Set a strong secret matching `RAZORPAY_WEBHOOK_SECRET`.
   - **Active Events**:
     - `payment.authorized`
     - `payment.captured`
     - `payment.failed`
     - `order.paid`

## 4. Capture Mode
WatchStore expects **automatic capture** on the Razorpay account (or capture via Razorpay Dashboard). `payment.authorized` records `AUTHORIZED` without confirming the order or committing stock until `payment.captured` or `order.paid` is received.

## 5. Testing Scenarios
- **Successful payment**: Select **Razorpay Online Payment** at `/checkout`, use Razorpay Test UPI (`success@razorpay`) or Test Card, and verify redirect to `/checkout/confirmation` with `CONFIRMED` / `PAID`.
- **Failed payment**: Use Test UPI (`failure@razorpay`) or decline in test modal; verify `PaymentAttempt` records `FAILED` and the **Pay / Retry with Razorpay** button reuses the same `Order`.
- **Cancelled Checkout**: Close the Razorpay modal; verify the order stays `PENDING` / `REQUIRES_GATEWAY` and retry works without creating a duplicate order.
- **Webhook retries**: Re-deliver an event from Razorpay Dashboard Webhooks log; verify `RazorpayWebhookEvent.eventId` deduplicates it (`200 OK`, `duplicate: true`) with no double inventory commitment.

## 6. Switching to Production
1. Replace `rzp_test_*` keys with live `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. Create a **Live Mode** webhook pointing to your production domain with a separate `RAZORPAY_WEBHOOK_SECRET`.
3. Ensure `CATALOGUE_SOURCE` and `ALLOW_UNPROTECTED_ADMIN_PREVIEW` are **unset** in production.
