"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { MediaImage } from "@/components/ui/media-image";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import type { CartSummary } from "@/modules/cart/cart-service";
import { submitCheckoutAction, type SubmitCheckoutResult } from "@/modules/checkout/actions";
import {
  initiatePaymentAction,
  verifyPaymentAction,
} from "@/modules/payments/presentation/payment-actions";

const COD_MAX_PAISE = 50_000_00;

interface RazorpayCheckoutInstance {
  open(): void;
  on(event: string, cb: (res: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      amount: number;
      currency: string;
      name: string;
      description: string;
      order_id: string;
      prefill: { name: string; email: string; contact: string };
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => void;
      modal?: { ondismiss?: () => void };
    }) => RazorpayCheckoutInstance;
  }
}

export interface CheckoutPrefill {
  fullName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateName?: string;
  pinCode?: string;
}

let razorpayScriptPromise: Promise<boolean> | null = null;

function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
  );
  if (existing) {
    razorpayScriptPromise = new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => {
        razorpayScriptPromise = null;
        resolve(false);
      }, { once: true });
    });
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      razorpayScriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

export function CheckoutView({
  summary,
  prefill,
}: {
  summary: CartSummary;
  prefill?: CheckoutPrefill;
}) {
  const router = useRouter();
  const sessionSeed = useId();
  const [idempotencyKey] = useState(() => `chk-${sessionSeed.replace(/[^a-zA-Z0-9]/g, "")}-${Date.now()}`);
  const [pending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(prefill?.fullName ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [addressLine1, setAddressLine1] = useState(prefill?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(prefill?.addressLine2 ?? "");
  const [city, setCity] = useState(prefill?.city ?? "");
  const [stateName, setStateName] = useState(prefill?.stateName ?? "");
  const [pinCode, setPinCode] = useState(prefill?.pinCode ?? "");
  const [paymentMethod, setPaymentMethod] = useState<"razorpay" | "cod">("razorpay");

  useEffect(() => {
    if (paymentMethod === "razorpay" && summary.items.length > 0 && summary.canCheckout) {
      void loadRazorpayScript();
    }
  }, [paymentMethod, summary.items.length, summary.canCheckout]);

  const [result, setResult] = useState<SubmitCheckoutResult | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);

  const codEligible = summary.grandTotalPaise <= COD_MAX_PAISE;
  const fieldErrors = result && !result.ok ? result.fieldErrors ?? {} : {};

  if (summary.items.length === 0 || !summary.canCheckout) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-16">
        <div className="bg-surface border border-outline rounded-md p-10 text-center flex flex-col items-center gap-4">
          <Icon name="shopping_bag" size={40} className="text-primary" />
          <h1 className="font-headline text-headline-lg text-on-surface">
            {summary.items.length === 0 ? "Your Shopping Bag is Empty" : "Cart Requires Attention"}
          </h1>
          <p className="font-body text-body-md text-on-surface-variant max-w-md">
            {summary.items.length === 0
              ? "Add a timepiece to your bag before proceeding to checkout."
              : summary.issues[0]?.message ?? "Please review your bag before checking out."}
          </p>
          <Link
            href={summary.items.length === 0 ? "/products" : "/cart"}
            className="px-7 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90"
          >
            {summary.items.length === 0 ? "Browse Catalogue" : "Return to Bag"}
          </Link>
        </div>
      </div>
    );
  }

  async function launchRazorpayCheckout(orderNumber: string, accessToken: string) {
    setPaymentBusy(true);
    setPaymentFeedback(null);
    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      setPaymentBusy(false);
      setPaymentFeedback("Unable to load Razorpay Checkout. Please check your connection and retry.");
      return;
    }

    const init = await initiatePaymentAction(orderNumber, accessToken);
    if (!init.ok) {
      setPaymentBusy(false);
      setPaymentFeedback(init.error);
      return;
    }

    if (init.alreadyPaid) {
      setPaymentBusy(false);
      router.push(
        `/checkout/confirmation?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(accessToken)}`,
      );
      return;
    }

    const rzp = new window.Razorpay({
      key: init.keyId,
      amount: init.amountPaise,
      currency: init.currency,
      name: brand.name,
      description: `Order ${init.orderNumber}`,
      order_id: init.razorpayOrderId,
      prefill: init.prefill,
      modal: {
        ondismiss: () => {
          setPaymentBusy(false);
          setPaymentFeedback("Checkout closed before completion. Your order is saved—you can retry payment below.");
        },
      },
      handler: async (response) => {
        const verified = await verifyPaymentAction({
          orderNumber,
          accessToken,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        setPaymentBusy(false);
        if (verified.ok) {
          router.push(
            `/checkout/confirmation?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(accessToken)}`,
          );
        } else {
          setPaymentFeedback(verified.error);
        }
      },
    });

    rzp.on("payment.failed", (evt) => {
      setPaymentBusy(false);
      setPaymentFeedback(
        evt.error?.description ?? "Payment failed. Your order is saved—you can retry payment below.",
      );
    });

    rzp.open();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || paymentBusy) return;
    startTransition(async () => {
      const res = await submitCheckoutAction({
        idempotencyKey,
        fullName,
        email,
        phone,
        addressLine1,
        addressLine2,
        city,
        state: stateName,
        pinCode,
        country: "India",
        shippingMethod: "standard",
        paymentMethod,
      });
      setResult(res);
      if (
        res.ok &&
        res.persisted &&
        res.orderNumber &&
        res.orderAccessToken &&
        res.snapshot.paymentMethod === "razorpay"
      ) {
        await launchRazorpayCheckout(res.orderNumber, res.orderAccessToken);
      }
    });
  }

  if (result?.ok) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-12">
        <div className="bg-surface border border-outline rounded-md p-8 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Icon name="verified_user" size={28} className="text-primary shrink-0" />
            <div>
              <span className="font-label text-label-sm uppercase tracking-wider text-secondary dark:text-primary">
                {result.persisted && result.orderNumber
                  ? `Order Reference: ${result.orderNumber}`
                  : "Server-Verified Order Snapshot"}
              </span>
              <h1 className="font-headline text-headline-lg text-on-surface">
                {result.persisted
                  ? result.snapshot.paymentMethod === "cod"
                    ? "Order Placed (Cash on Delivery)"
                    : "Order Created — Awaiting Payment"
                  : "Ready for Payment & Persistence"}
              </h1>
            </div>
          </div>

          <p className="font-body text-body-md text-on-surface-variant bg-surface-container rounded p-4">
            {result.notice}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-outline pt-4 font-body text-body-md">
            <div>
              <p className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">Customer</p>
              <p className="text-on-surface font-semibold mt-1">{result.snapshot.customer.fullName}</p>
              <p className="text-on-surface-variant">{result.snapshot.customer.email}</p>
              <p className="font-mono text-mono-sm text-on-surface-variant">+91 {result.snapshot.customer.phone}</p>
            </div>
            <div>
              <p className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant">Delivery Address</p>
              <p className="text-on-surface mt-1">{result.snapshot.shippingAddress.addressLine1}</p>
              {result.snapshot.shippingAddress.addressLine2 && (
                <p className="text-on-surface-variant">{result.snapshot.shippingAddress.addressLine2}</p>
              )}
              <p className="text-on-surface-variant">
                {result.snapshot.shippingAddress.city}, {result.snapshot.shippingAddress.state} —{" "}
                <span className="font-mono">{result.snapshot.shippingAddress.pinCode}</span>
              </p>
            </div>
          </div>

          <div className="border-t border-outline pt-4 flex items-center justify-between">
            <span className="font-title text-title-md text-on-surface">
              Verified Total ({result.snapshot.paymentMethod.toUpperCase()})
            </span>
            <span className="font-headline text-headline-md text-on-surface tabular-nums">
              {formatINR(result.snapshot.totals.grandTotalPaise)}
            </span>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            {result.persisted &&
              result.orderNumber &&
              result.orderAccessToken &&
              result.snapshot.paymentMethod === "razorpay" && (
                <button
                  type="button"
                  disabled={paymentBusy}
                  onClick={() => launchRazorpayCheckout(result.orderNumber!, result.orderAccessToken!)}
                  className="px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 disabled:opacity-60"
                >
                  {paymentBusy ? "Processing Payment…" : "Pay / Retry with Razorpay"}
                </button>
              )}
            {result.persisted && result.orderNumber && result.orderAccessToken && (
              <Link
                href={`/checkout/confirmation?order=${encodeURIComponent(result.orderNumber)}&token=${encodeURIComponent(result.orderAccessToken)}`}
                className="px-6 py-3 rounded-sm border border-outline font-label text-label-lg uppercase tracking-wider text-on-surface hover:border-primary"
              >
                View Order Status
              </Link>
            )}
            <Link
              href="/products"
              className="px-6 py-3 rounded-sm border border-outline font-label text-label-lg uppercase tracking-wider text-on-surface hover:border-primary"
            >
              Continue Shopping
            </Link>
          </div>
          {paymentFeedback && (
            <p role="alert" className="font-body text-body-md text-error">
              {paymentFeedback}
            </p>
          )}
        </div>
      </div>
    );
  }

  const inputClass =
    "px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="max-w-7xl w-full mx-auto px-4 lg:px-6 py-8 lg:py-10">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-3 md:gap-8 mb-10 pb-6 border-b border-outline overflow-x-auto">
        {[
          { num: 1, label: "Information", active: true },
          { num: 2, label: "Address & Shipping", active: true },
          { num: 3, label: "Payment", active: false },
          { num: 4, label: "Review", active: false },
        ].map((step, idx) => (
          <div key={step.num} className="flex items-center gap-3 md:gap-8 shrink-0">
            {idx > 0 && <span className="w-6 md:w-8 h-px bg-outline" />}
            <div
              className={cn(
                "flex items-center gap-2",
                step.active ? "text-secondary dark:text-primary" : "text-on-surface-variant",
              )}
            >
              <span
                className={cn(
                  "w-7 h-7 rounded-full font-mono text-mono-sm flex items-center justify-center",
                  step.active ? "bg-primary text-on-primary" : "border border-outline",
                )}
              >
                {step.num}
              </span>
              <span className="font-label text-label-sm uppercase tracking-wider">{step.label}</span>
            </div>
          </div>
        ))}
      </div>

      {result && !result.ok && (
        <div role="alert" className="mb-6 rounded border border-error bg-surface p-4 text-error font-body text-body-md">
          {result.error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Left: Checkout Form */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          {/* 1. Customer Information */}
          <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
            <h2 className="font-headline text-headline-md text-on-surface">1. Customer Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="sm:col-span-2 flex flex-col gap-1.5">
                <span className="font-label text-label-lg text-on-surface">Full Name</span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aarav Mehta"
                  className={inputClass}
                />
                {fieldErrors.fullName && <span className="font-body text-body-md text-error">{fieldErrors.fullName}</span>}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-label-lg text-on-surface">Email Address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={inputClass}
                />
                {fieldErrors.email && <span className="font-body text-body-md text-error">{fieldErrors.email}</span>}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-label-lg text-on-surface">Mobile Number (India)</span>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9820144510"
                  className={cn(inputClass, "font-mono text-mono-md")}
                />
                {fieldErrors.phone && <span className="font-body text-body-md text-error">{fieldErrors.phone}</span>}
              </label>
            </div>
          </section>

          {/* 2. Delivery Address */}
          <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
            <h2 className="font-headline text-headline-md text-on-surface">2. Delivery Address</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="sm:col-span-2 flex flex-col gap-1.5">
                <span className="font-label text-label-lg text-on-surface">Address Line</span>
                <input
                  type="text"
                  required
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Street address, house or building name"
                  className={inputClass}
                />
                {fieldErrors.addressLine1 && <span className="font-body text-body-md text-error">{fieldErrors.addressLine1}</span>}
              </label>

              <label className="sm:col-span-2 flex flex-col gap-1.5">
                <span className="font-label text-label-lg text-on-surface">Apartment, Suite, Landmark (Optional)</span>
                <input
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Apartment, floor, or landmark"
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-label-lg text-on-surface">City</span>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Mumbai"
                  className={inputClass}
                />
                {fieldErrors.city && <span className="font-body text-body-md text-error">{fieldErrors.city}</span>}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-label-lg text-on-surface">State</span>
                <input
                  type="text"
                  required
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  placeholder="Maharashtra"
                  className={inputClass}
                />
                {fieldErrors.state && <span className="font-body text-body-md text-error">{fieldErrors.state}</span>}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-label-lg text-on-surface">PIN Code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  placeholder="400001"
                  className={cn(inputClass, "font-mono text-mono-md")}
                />
                {fieldErrors.pinCode && <span className="font-body text-body-md text-error">{fieldErrors.pinCode}</span>}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-label-lg text-on-surface">Country</span>
                <input type="text" readOnly value="India" className={cn(inputClass, "opacity-80")} />
              </label>
            </div>

            <div className="pt-2 flex flex-col gap-3">
              <h3 className="font-label text-label-lg uppercase tracking-wider text-on-surface-variant">
                Delivery Method
              </h3>
              <div className="flex items-center justify-between p-4 rounded border border-primary bg-surface-container/40">
                <div>
                  <p className="font-title text-title-md text-on-surface">Standard Insured Delivery</p>
                  <p className="font-body text-body-md text-on-surface-variant">
                    Signature required upon delivery
                  </p>
                </div>
                <span className="font-label text-label-sm uppercase text-success">
                  {summary.shippingPaise === 0 ? "Complimentary" : formatINR(summary.shippingPaise)}
                </span>
              </div>
            </div>
          </section>

          {/* 3. Payment Method */}
          <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="font-headline text-headline-md text-on-surface">3. Payment Method</h2>
              <span className="inline-flex items-center gap-1 font-label text-label-sm uppercase tracking-wider text-success">
                <Icon name="verified_user" size={16} /> Server-Verified Totals
              </span>
            </div>

            <label
              className={cn(
                "flex items-center justify-between p-4 rounded border cursor-pointer transition-colors duration-state-change",
                paymentMethod === "razorpay"
                  ? "border-2 border-primary bg-surface-container/40"
                  : "border-outline hover:border-primary",
              )}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="razorpay"
                  checked={paymentMethod === "razorpay"}
                  onChange={() => setPaymentMethod("razorpay")}
                  className="text-primary accent-primary focus:ring-0"
                />
                <div>
                  <p className="font-title text-title-md text-on-surface">Razorpay Online Payment (UPI, Cards, NetBanking)</p>
                  <p className="font-body text-body-md text-on-surface-variant">
                    Gateway integration completes in the payment phase
                  </p>
                </div>
              </div>
              <Icon name="credit_card" size={22} className="text-primary shrink-0" />
            </label>

            <label
              className={cn(
                "flex items-center justify-between p-4 rounded border transition-colors duration-state-change",
                !codEligible
                  ? "border-outline opacity-50 cursor-not-allowed"
                  : paymentMethod === "cod"
                    ? "border-2 border-primary bg-surface-container/40 cursor-pointer"
                    : "border-outline hover:border-primary cursor-pointer",
              )}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cod"
                  disabled={!codEligible}
                  checked={paymentMethod === "cod"}
                  onChange={() => setPaymentMethod("cod")}
                  className="text-primary accent-primary focus:ring-0"
                />
                <div>
                  <p className="font-title text-title-md text-on-surface">Cash on Delivery (Up to ₹50,000)</p>
                  <p className="font-body text-body-md text-on-surface-variant">
                    {codEligible
                      ? "Pay upon delivery"
                      : "Unavailable for orders exceeding ₹50,000"}
                  </p>
                </div>
              </div>
              <Icon name="payments" size={22} className="text-on-surface-variant shrink-0" />
            </label>
          </section>
        </div>

        {/* Right: Order Review */}
        <aside className="lg:col-span-5 bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
          <h2 className="font-headline text-headline-md text-on-surface border-b border-outline pb-4">
            Order Review
          </h2>

          <div className="flex flex-col gap-4">
            {summary.items.map((item) => (
              <div key={item.productId} className="flex items-center gap-4">
                <MediaImage
                  src={item.image?.src ?? null}
                  alt={item.image?.alt ?? item.name}
                  sizes="64px"
                  className="w-16 h-16 rounded shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-title text-title-md text-on-surface truncate">{item.name}</p>
                  <p className="font-mono text-mono-sm text-on-surface-variant">Qty: {item.quantity}</p>
                </div>
                <span className="font-mono text-mono-md text-on-surface tabular-nums">
                  {formatINR(item.lineTotalPaise)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 border-t border-outline pt-4 font-body text-body-md">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="font-mono text-on-surface tabular-nums">{formatINR(summary.subtotalPaise)}</span>
            </div>
            {summary.promoDiscountPaise > 0 && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Promo ({summary.promoCode})</span>
                <span className="font-mono tabular-nums text-success">-{formatINR(summary.promoDiscountPaise)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Included GST</span>
              <span className="font-mono text-on-surface tabular-nums">{formatINR(summary.includedGstPaise)} (Incl.)</span>
            </div>
          </div>

          <div className="flex justify-between items-baseline border-t border-outline pt-4">
            <span className="font-title text-title-lg text-on-surface">Total Payable</span>
            <span className="font-headline text-headline-lg text-on-surface tabular-nums">
              {formatINR(summary.grandTotalPaise)}
            </span>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-4 px-6 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 disabled:opacity-60 transition-opacity duration-state-change"
          >
            {pending ? "Verifying Order…" : `Place Order • ${formatINR(summary.grandTotalPaise)}`}
          </button>
        </aside>
      </form>
    </div>
  );
}
