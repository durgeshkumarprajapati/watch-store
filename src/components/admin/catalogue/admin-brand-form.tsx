"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import {
  createAdminBrandAction,
  deleteAdminBrandAction,
  updateAdminBrandAction,
} from "@/modules/admin/catalogue/admin-catalogue-actions";
import { normalizeSlug } from "@/modules/admin/catalogue/catalogue-schemas";
import type { AdminBrandRow } from "@/modules/admin/catalogue/admin-brand-service";

export function AdminBrandForm({
  mode,
  initialBrand,
  canManage,
}: {
  mode: "create" | "edit";
  initialBrand?: AdminBrandRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialBrand?.name ?? "");
  const [slug, setSlug] = useState(initialBrand?.slug ?? "");
  const [description, setDescription] = useState(initialBrand?.description ?? "");
  const [logoUrl, setLogoUrl] = useState(initialBrand?.logoUrl ?? "");
  const [logoProvider, setLogoProvider] = useState<"local" | "cloudinary" | "mock" | undefined>(
    initialBrand?.logoProvider === "cloudinary" ||
      initialBrand?.logoProvider === "local" ||
      initialBrand?.logoProvider === "mock"
      ? initialBrand.logoProvider
      : undefined,
  );
  const [logoPublicId, setLogoPublicId] = useState<string | null>(
    initialBrand?.logoPublicId ?? null,
  );
  const [isActive, setIsActive] = useState(initialBrand?.isActive ?? true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", "brand");
      const res = await fetch("/api/admin/catalogue/upload", { method: "POST", body: fd });
      const json = (await res.json()) as {
        url?: string;
        provider?: "local" | "cloudinary" | "mock";
        publicId?: string | null;
        error?: string;
      };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Logo upload failed.");
        return;
      }
      setLogoUrl(json.url);
      setLogoProvider(json.provider);
      setLogoPublicId(json.publicId ?? null);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const trimmedLogo = logoUrl.trim() || null;
      const payload = {
        name,
        slug: normalizeSlug(slug || name),
        description: description.trim() || null,
        logoUrl: trimmedLogo,
        logoProvider: trimmedLogo ? logoProvider : undefined,
        logoPublicId: trimmedLogo ? logoPublicId : null,
        isActive,
      };
      if (mode === "create") {
        const res = await createAdminBrandAction(payload);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(`/admin/brands/${res.brandId}`);
        router.refresh();
      } else if (initialBrand) {
        const res = await updateAdminBrandAction(initialBrand.id, payload);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSuccess("Brand updated.");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialBrand) return;
    setError(null);
    setSaving(true);
    try {
      const res = await deleteAdminBrandAction(initialBrand.id);
      if (!res.ok) {
        setError(res.error);
        setConfirmDelete(false);
        return;
      }
      router.push("/admin/brands");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl">
      <div>
        <Link
          href="/admin/brands"
          className="inline-flex items-center gap-1.5 font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-primary mb-2"
        >
          <Icon name="arrow_back" size={16} /> Back to Brands
        </Link>
        <h1 className="font-headline text-headline-lg text-on-surface">
          {mode === "create" ? "New Watchmaker Brand" : initialBrand?.name}
        </h1>
      </div>

      {error ? (
        <div className="p-4 rounded border border-error bg-error/10 text-error font-body text-body-md">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="p-4 rounded border border-success bg-success/10 text-success font-body text-body-md">
          {success}
        </div>
      ) : null}

      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg">Brand Name</span>
          <input
            type="text"
            required
            disabled={!canManage}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (mode === "create" && !slug) setSlug(normalizeSlug(e.target.value));
            }}
            className="px-3.5 py-2.5 rounded bg-background border border-outline"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg">Slug</span>
          <input
            type="text"
            required
            disabled={!canManage}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg">Description</span>
          <textarea
            rows={3}
            disabled={!canManage}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="px-3.5 py-2.5 rounded bg-background border border-outline"
          />
        </label>
        <div className="flex flex-col gap-2">
          <span className="font-label text-label-lg">Brand Logo Path / URL</span>
          <input
            type="text"
            disabled={!canManage}
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="/images/uploads/products/..."
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono"
          />
          {canManage ? (
            <input
              type="file"
              accept="image/webp,image/jpeg,image/png"
              disabled={uploading}
              onChange={handleLogoUpload}
              className="text-body-md"
            />
          ) : null}
        </div>
        <label className="inline-flex items-center gap-2 font-body text-body-md pt-1">
          <input
            type="checkbox"
            disabled={!canManage}
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Brand is active on public storefront</span>
        </label>
      </section>

      <div className="flex items-center justify-between gap-4">
        {mode === "edit" && initialBrand && canManage && initialBrand.productCount === 0 ? (
          confirmDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleDelete}
                className="px-3 py-1.5 rounded-sm bg-error text-on-error font-label text-label-sm uppercase"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-sm border border-outline font-label text-label-sm uppercase"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-sm border border-error text-error font-label text-label-sm uppercase"
            >
              Delete Brand
            </button>
          )
        ) : (
          <div />
        )}
        {canManage ? (
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider disabled:opacity-50"
          >
            {saving ? "Saving..." : mode === "create" ? "Create Brand" : "Save Brand"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
