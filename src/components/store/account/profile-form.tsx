"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "@/modules/customers/actions";

export function ProfileForm({
  initialName,
  email,
  initialPhone,
}: {
  initialName: string;
  email: string;
  initialPhone: string;
}) {
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await updateProfileAction({ fullName, phone });
      setStatus(
        res.ok
          ? { ok: true, message: "Profile updated." }
          : { ok: false, message: res.error },
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface border border-outline rounded-md p-6 sm:p-8 flex flex-col gap-5">
      <h2 className="font-headline text-headline-md text-on-surface border-b border-outline pb-4">
        Profile Details
      </h2>

      {status && (
        <p
          role="status"
          className={status.ok ? "font-body text-body-md text-success" : "font-body text-body-md text-error"}
        >
          {status.message}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg text-on-surface">Full Name</span>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg text-on-surface">Mobile Number (India)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9820144510"
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono text-mono-md text-on-surface outline-none focus:border-primary"
          />
        </label>

        <label className="sm:col-span-2 flex flex-col gap-1.5">
          <span className="font-label text-label-lg text-on-surface">Verified Email</span>
          <input
            type="email"
            readOnly
            value={email}
            className="px-3.5 py-2.5 rounded bg-surface-container border border-outline font-body text-body-md text-on-surface-variant"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="self-start px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save Profile"}
      </button>
    </form>
  );
}
