"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { adminLoginAction } from "@/modules/admin/admin-actions";

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await adminLoginAction({ email, password });
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="p-4 rounded bg-error text-on-error flex items-start gap-3">
          <Icon name="error" size={20} className="shrink-0" />
          <p className="font-body text-body-md">{error}</p>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="font-label text-label-lg text-on-surface">Administrator Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          className="px-3.5 py-2.5 rounded bg-surface border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-label text-label-lg text-on-surface">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          className="px-3.5 py-2.5 rounded bg-surface border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3.5 px-6 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 mt-2 disabled:opacity-60"
      >
        {pending ? "Verifying Access…" : "Sign In to Admin Console"}
      </button>
    </form>
  );
}
