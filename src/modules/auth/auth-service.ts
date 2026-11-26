import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getServerEnv } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  sendTransactionalEmail,
} from "@/modules/notifications/email-service";
import {
  enqueueAdminBroadcastInTx,
  enqueueCustomerInAppAndPushInTx,
} from "@/modules/notifications/notification-outbox-service";
import { scheduleImmediatePushDispatch } from "@/modules/notifications/notification-worker-service";
import { linkVerifiedUserToCustomerInTx } from "./customer-link-service";
import { hashPassword } from "./password-service";
import { consumeAuthActionTokenInTx, createAuthActionToken } from "./token-service";

export async function registerCustomerAccount(
  input: { fullName: string; email: string; password: string },
  opts?: { prismaClient?: PrismaClient; appUrl?: string },
): Promise<
  | { ok: true; message: string; devVerificationUrl?: string }
  | { ok: false; error: string }
> {
  const email = input.email.trim().toLowerCase();
  const limit = checkRateLimit(`register:${email}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return { ok: false, error: `Too many registration attempts. Try again in ${limit.retryAfterSeconds}s.` };
  }

  const prisma = opts?.prismaClient ?? getPrisma();
  const passwordHash = await hashPassword(input.password);

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        name: input.fullName.trim(),
        email,
        passwordHash,
        emailVerified: null,
      },
    });
    userId = user.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "An account with this email already exists." };
    }
    throw err;
  }

  const { rawToken } = await createAuthActionToken(prisma, {
    userId,
    type: "EMAIL_VERIFICATION",
    ttlMinutes: 24 * 60,
  });

  const baseUrl = opts?.appUrl ?? getServerEnv().AUTH_URL ?? "http://localhost:3000";
  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const emailPayload = buildVerificationEmail({ name: input.fullName.trim(), verifyUrl });
  const emailRes = await sendTransactionalEmail({ to: email, ...emailPayload });

  try {
    await prisma.$transaction(async (tx) => {
      await enqueueAdminBroadcastInTx(tx, {
        eventType: "NEW_CUSTOMER_ADMIN",
        dedupeKey: `admin-new-customer:${userId}`,
        title: "New customer registered",
        body: `${input.fullName.trim()} (${email}) created an account.`,
        targetUrl: "/admin/customers",
      });
    });
    scheduleImmediatePushDispatch();
  } catch {
    // Best-effort admin alert; never fail registration.
  }

  return {
    ok: true,
    message: "Account created. Please verify your email address before signing in.",
    ...(process.env.NODE_ENV !== "production" && !emailRes.ok ? { devVerificationUrl: verifyUrl } : {}),
  };
}

export async function verifyCustomerEmail(
  rawToken: string,
  prismaClient?: PrismaClient,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (!rawToken || rawToken.length < 32) {
    return { ok: false, error: "Invalid verification token." };
  }

  const prisma = prismaClient ?? getPrisma();
  return prisma.$transaction(async (tx) => {
    const consumed = await consumeAuthActionTokenInTx(tx, {
      rawToken,
      type: "EMAIL_VERIFICATION",
    });

    if (!consumed.ok) {
      return {
        ok: false,
        error:
          consumed.reason === "EXPIRED"
            ? "Verification link has expired. Please request a new one."
            : "Verification link is invalid or has already been used.",
      };
    }

    const user = await tx.user.findUnique({ where: { id: consumed.userId } });
    if (!user) return { ok: false, error: "Account not found." };

    const verifiedEmail = consumed.targetEmail ?? user.email;
    await tx.user.update({
      where: { id: user.id },
      data: {
        email: verifiedEmail,
        emailVerified: new Date(),
      },
    });

    await linkVerifiedUserToCustomerInTx(tx, {
      userId: user.id,
      verifiedEmail,
      fullName: user.name,
    });

    return { ok: true, message: "Email verified successfully. You can now sign in." };
  });
}

export async function requestPasswordReset(
  rawEmail: string,
  opts?: { prismaClient?: PrismaClient; appUrl?: string },
): Promise<{ ok: true; message: string; devResetUrl?: string } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase();
  const limit = checkRateLimit(`reset:${email}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return { ok: false, error: `Too many reset requests. Try again in ${limit.retryAfterSeconds}s.` };
  }

  const genericMessage =
    "If an account exists for that email, a password reset link has been sent.";
  const prisma = opts?.prismaClient ?? getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: true, message: genericMessage };
  }

  const { rawToken } = await createAuthActionToken(prisma, {
    userId: user.id,
    type: "PASSWORD_RESET",
    ttlMinutes: 60,
  });

  const baseUrl = opts?.appUrl ?? getServerEnv().AUTH_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const emailPayload = buildPasswordResetEmail({ resetUrl });
  const emailRes = await sendTransactionalEmail({ to: email, ...emailPayload });

  return {
    ok: true,
    message: genericMessage,
    ...(process.env.NODE_ENV !== "production" && !emailRes.ok ? { devResetUrl: resetUrl } : {}),
  };
}

export async function resetPasswordWithToken(
  params: { token: string; password: string },
  prismaClient?: PrismaClient,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (!params.token || params.token.length < 32) {
    return { ok: false, error: "Invalid reset token." };
  }

  const prisma = prismaClient ?? getPrisma();
  const newHash = await hashPassword(params.password);

  return prisma.$transaction(async (tx) => {
    const consumed = await consumeAuthActionTokenInTx(tx, {
      rawToken: params.token,
      type: "PASSWORD_RESET",
    });

    if (!consumed.ok) {
      return {
        ok: false,
        error:
          consumed.reason === "EXPIRED"
            ? "Reset link has expired. Please request a new one."
            : "Reset link is invalid or has already been used.",
      };
    }

    await tx.user.update({
      where: { id: consumed.userId },
      data: {
        passwordHash: newHash,
        sessionVersion: { increment: 1 },
      },
    });

    const customer = await tx.customer.findUnique({
      where: { authUserId: consumed.userId },
      select: { id: true },
    });
    if (customer) {
      await enqueueCustomerInAppAndPushInTx(tx, {
        customerId: customer.id,
        orderId: null,
        eventType: "SECURITY_ALERT",
        dedupeKey: `security-pwd-reset:${consumed.userId}:${Date.now()}`,
        title: "Your WatchStore password was changed",
        summaryBody: "Your account password was recently reset. If this was not you, contact support immediately.",
        targetUrl: "/account/notifications",
        shippingUpdatesEnabledCheck: false,
      });
    }

    return { ok: true, message: "Password updated successfully. Please sign in with your new password." };
  });
}
