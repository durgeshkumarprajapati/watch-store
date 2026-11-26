"use client";

import { useState, useTransition } from "react";
import type { AdminRoleCode } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  createAdminUserAction,
  toggleAdminActiveAction,
} from "@/modules/admin/admin-actions";

interface AdminListItem {
  id: string;
  isActive: boolean;
  name: string;
  email: string;
  roles: AdminRoleCode[];
}

const ALL_ROLES: AdminRoleCode[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "CATALOG_MANAGER",
  "ORDER_MANAGER",
  "INVENTORY_MANAGER",
  "CUSTOMER_SUPPORT",
];

export function AdminUsersManager({
  admins,
  currentAdminId,
  canCreate,
  canDeactivate,
  isSuperAdmin,
}: {
  admins: AdminListItem[];
  currentAdminId: string;
  canCreate: boolean;
  canDeactivate: boolean;
  isSuperAdmin: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState<AdminRoleCode>("ADMIN");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const assignableRoles = isSuperAdmin
    ? ALL_ROLES
    : ALL_ROLES.filter((r) => r !== "SUPER_ADMIN");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await createAdminUserAction({
        name,
        email,
        password,
        roleCodes: [roleCode],
      });
      if (res.ok) {
        setName("");
        setEmail("");
        setPassword("");
        setFeedback({ ok: true, message: "Administrator created." });
      } else {
        setFeedback({ ok: false, message: res.error });
      }
    });
  }

  function handleToggle(targetId: string, nextActive: boolean) {
    setFeedback(null);
    startTransition(async () => {
      const res = await toggleAdminActiveAction(targetId, nextActive);
      setFeedback(
        res.ok
          ? { ok: true, message: nextActive ? "Administrator activated." : "Administrator deactivated." }
          : { ok: false, message: res.error },
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <p role="status" className={feedback.ok ? "font-body text-body-md text-success" : "font-body text-body-md text-error"}>
          {feedback.message}
        </p>
      )}

      <section className="bg-surface border border-outline rounded-md overflow-hidden">
        <div className="px-6 py-4 border-b border-outline">
          <h2 className="font-headline text-headline-md text-on-surface">Administrators ({admins.length})</h2>
        </div>
        <div className="divide-y divide-outline">
          {admins.map((a) => (
            <div key={a.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-title text-title-md text-on-surface">{a.name}</span>
                  <Badge tone={a.isActive ? "success" : "error"}>
                    {a.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {a.roles.map((r) => (
                    <Badge key={r} tone="secondary">{r}</Badge>
                  ))}
                </div>
                <p className="font-mono text-mono-sm text-on-surface-variant mt-1">{a.email}</p>
              </div>
              {canDeactivate && a.id !== currentAdminId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleToggle(a.id, !a.isActive)}
                  className="self-start sm:self-auto px-4 py-2 rounded border border-outline font-label text-label-sm uppercase tracking-wider hover:border-primary"
                >
                  {a.isActive ? "Deactivate" : "Activate"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {canCreate && (
        <form onSubmit={handleCreate} className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-4 max-w-2xl">
          <h3 className="font-headline text-headline-md text-on-surface">Provision Administrator</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
            />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Initial password (min 8 chars)"
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
            />
            <select
              aria-label="Role"
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value as AdminRoleCode)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-body text-body-md text-on-surface outline-none focus:border-primary"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="self-start px-6 py-3 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Provisioning…" : "Create Administrator"}
          </button>
        </form>
      )}
    </div>
  );
}
