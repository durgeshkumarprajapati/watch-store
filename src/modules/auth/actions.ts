"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/validations/auth";
import { signIn, signOut } from "./auth";
import {
  registerCustomerAccount,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyCustomerEmail,
} from "./auth-service";

export type AuthActionResult =
  | { ok: true; message: string; devUrl?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function registerAction(raw: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check your registration details.",
      fieldErrors,
    };
  }

  const res = await registerCustomerAccount(parsed.data);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, message: res.message, devUrl: res.devVerificationUrl };
}

export async function loginAction(raw: {
  email: string;
  password: string;
}): Promise<{ ok: false; error: string } | never> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid email or password." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/account",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Invalid email or password, or email not yet verified." };
    }
    throw err;
  }
  redirect("/account");
}

export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/account" });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function verifyEmailAction(token: string) {
  return verifyCustomerEmail(token);
}

export async function forgotPasswordAction(rawEmail: string): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const res = await requestPasswordReset(parsed.data.email);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, message: res.message, devUrl: res.devResetUrl };
}

export async function resetPasswordAction(raw: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthActionResult> {
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check your new password.",
      fieldErrors,
    };
  }

  const res = await resetPasswordWithToken({
    token: parsed.data.token,
    password: parsed.data.password,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, message: res.message };
}
