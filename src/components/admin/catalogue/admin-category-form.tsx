"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import {
  createAdminCategoryAction,
  deleteAdminCategoryAction,
  updateAdminCategoryAction,
} from "@/modules/admin/catalogue/admin-catalogue-actions";
import { normalizeSlug } from "@/modules/admin/catalogue/catalogue-schemas";
import type { AdminCategoryRow } from "@/modules/admin/catalogue/admin-category-service";

export function AdminCategoryForm({
  mode,
  initialCategory,
  allCategories,
  canManage,
}: {
  mode: "create" | "edit";
  initialCategory?: AdminCategoryRow;
  allCategories: AdminCategoryRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialCategory?.name ?? "");
  const [slug, setSlug] = useState(initialCategory?.slug ?? "");
  const [parentId, setParentId] = useState(initialCategory?.parentId ?? "");
  const [image, setImage] = useState(initialCategory?.image ?? "");
  const [imageProvider, setImageProvider] = useState<"local" | "cloudinary" | "mock" | undefined>(
    initialCategory?.imageProvider === "cloudinary" ||
      initialCategory?.imageProvider === "local" ||
      initialCategory?.imageProvider === "mock"
      ? initialCategory.imageProvider
      : undefined,
  );
  const [imagePublicId, setImagePublicId] = useState<string | null>(
    initialCategory?.imagePublicId ?? null,
  );
  const [isActive, setIsActive] = useState(initialCategory?.isActive ?? true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const parentChoices = allCategories.filter((c) => c.id !== initialCategory?.id);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", "category");
      const res = await fetch("/api/admin/catalogue/upload", { method: "POST", body: fd });
      const json = (await res.json()) as {
        url?: string;
        provider?: "local" | "cloudinary" | "mock";
        publicId?: string | null;
        error?: string;
      };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Image upload failed.");
        return;
      }
      setImage(json.url);
      setImageProvider(json.provider);
      setImagePublicId(json.publicId ?? null);
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
      const trimmedImage = image.trim() || null;
      const payload = {
        name,
        slug: normalizeSlug(slug || name),
        parentId: parentId || null,
        image: trimmedImage,
        imageProvider: trimmedImage ? imageProvider : undefined,
        imagePublicId: trimmedImage ? imagePublicId : null,
        isActive,
      };
      if (mode === "create") {
        const res = await createAdminCategoryAction(payload);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(`/admin/categories/${res.categoryId}`);
        router.refresh();
      } else if (initialCategory) {
        const res = await updateAdminCategoryAction(initialCategory.id, payload);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSuccess("Category updated.");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialCategory) return;
    setError(null);
    setSaving(true);
    try {
      const res = await deleteAdminCategoryAction(initialCategory.id);
      if (!res.ok) {
        setError(res.error);
        setConfirmDelete(false);
        return;
      }
      router.push("/admin/categories");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const canDeleteCategory =
    mode === "edit" &&
    initialCategory &&
    canManage &&
    initialCategory.productCount === 0 &&
    initialCategory.childCount === 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl">
      <div>
        <Link
          href="/admin/categories"
          className="inline-flex items-center gap-1.5 font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-primary mb-2"
        >
          <Icon name="arrow_back" size={16} /> Back to Categories
        </Link>
        <h1 className="font-headline text-headline-lg text-on-surface">
          {mode === "create" ? "New Category" : initialCategory?.name}
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
          <span className="font-label text-label-lg">Display Name</span>
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
          <span className="font-label text-label-lg">Parent Category (Optional)</span>
          <select
            disabled={!canManage}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="px-3.5 py-2.5 rounded bg-background border border-outline"
          >
            <option value="">None (Top-level category)</option>
            {parentChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentName ? `${c.parentName} › ` : ""}
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-2">
          <span className="font-label text-label-lg">Category Image Path / URL</span>
          <input
            type="text"
            disabled={!canManage}
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="/images/categories/..."
            className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono"
          />
          {canManage ? (
            <input
              type="file"
              accept="image/webp,image/jpeg,image/png"
              disabled={uploading}
              onChange={handleImageUpload}
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
          <span>Category is active on public storefront</span>
        </label>
      </section>

      <div className="flex items-center justify-between gap-4">
        {canDeleteCategory ? (
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
              Delete Category
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
            {saving ? "Saving..." : mode === "create" ? "Create Category" : "Save Category"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
