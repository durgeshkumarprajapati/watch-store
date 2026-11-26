import type { Metadata } from "next";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Request a WatchStore password reset link.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthSplitShell>
      <ForgotPasswordForm />
    </AuthSplitShell>
  );
}
