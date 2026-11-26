"use client";

import { useState, useTransition } from "react";
import { changePasswordAction } from "@/modules/customers/actions";

export function SecurityForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await changePasswordAction({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (res.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setStatus({ ok: true, message: "Password updated. Other sessions have been invalidated." });
      } else {
        setStatus({ ok: false, message: res.error });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface border border-outline rounded-md p-6 sm:p-8 flex flex-col gap-5 max-w-xl">
      <h2 className="font-headline text-headline-md text-on-surface border-b border-outline pb-4">
        Change Password
      </h2>

      {status && (
        <p role="status" className={status.ok ? "font-body text-body-md text-success" : "font-body text-body-md text-error"}>
          {status.message}
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="font-label text-label-lg text-on-surface">Current Password</span>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-label text-label-lg text-on-surface">New Password (min 8 characters)</span>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-label text-label-lg text-on-surface">Confirm New Password</span>
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update Password"}
      </button>
    </form>
  );
}
