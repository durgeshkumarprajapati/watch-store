"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import {
  createAdminProductAction,
  deleteAdminProductAction,
  setAdminProductStatusAction,
  updateAdminProductAction,
} from "@/modules/admin/catalogue/admin-catalogue-actions";
import { normalizeSku, normalizeSlug } from "@/modules/admin/catalogue/catalogue-schemas";
import type { AdminProductDetail } from "@/modules/admin/catalogue/admin-product-service";

interface BrandOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface CategoryOption {
  id: string;
  name: string;
  parentName: string | null;
  isActive: boolean;
}

interface AdminProductFormProps {
  mode: "create" | "edit";
  initialProduct?: AdminProductDetail;
  brands: BrandOption[];
  categories: CategoryOption[];
  existingImages: string[];
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
}

function paiseToRupeesString(paise: number): string {
  return (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);
}

function rupeesStringToPaise(value: string): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

export function AdminProductForm({
  mode,
  initialProduct,
  brands,
  categories,
  existingImages,
  canEdit,
  canPublish,
  canDelete,
}: AdminProductFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialProduct?.name ?? "");
  const [slug, setSlug] = useState(initialProduct?.slug ?? "");
  const [sku, setSku] = useState(initialProduct?.sku ?? "");
  const [brandId, setBrandId] = useState(initialProduct?.brandId ?? brands[0]?.id ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(initialProduct?.categoryIds ?? []);
  const [gender, setGender] = useState<"men" | "women" | "unisex">(initialProduct?.gender ?? "men");
  const [watchType, setWatchType] = useState<"chronograph" | "automatic" | "dress" | "diver">(
    initialProduct?.watchType ?? "automatic",
  );
  const [strapMaterial, setStrapMaterial] = useState<"steel" | "leather" | "mesh">(
    initialProduct?.strapMaterial ?? "steel",
  );
  const [dialAndStrap, setDialAndStrap] = useState(initialProduct?.dialAndStrap ?? "");
  const [description, setDescription] = useState(initialProduct?.description ?? "");
  const [specMovement, setSpecMovement] = useState(initialProduct?.specMovement ?? "");
  const [specCaseDimensions, setSpecCaseDimensions] = useState(
    initialProduct?.specCaseDimensions ?? "",
  );
  const [specCrystal, setSpecCrystal] = useState(initialProduct?.specCrystal ?? "Sapphire Crystal");
  const [specWaterResistance, setSpecWaterResistance] = useState(
    initialProduct?.specWaterResistance ?? "100m / 10 ATM",
  );
  const [specHsn, setSpecHsn] = useState(initialProduct?.specHsn ?? "9102");
  const [mrpRupees, setMrpRupees] = useState(
    initialProduct ? paiseToRupeesString(initialProduct.mrpPaise) : "",
  );
  const [priceRupees, setPriceRupees] = useState(
    initialProduct ? paiseToRupeesString(initialProduct.pricePaise) : "",
  );
  const [gstPercent, setGstPercent] = useState(
    initialProduct ? String(initialProduct.gstRateBps / 100) : "18",
  );
  const [badge, setBadge] = useState<"" | "best_seller" | "new_arrival" | "limited">(
    initialProduct?.badge ?? "",
  );
  const [isBestSeller, setIsBestSeller] = useState(initialProduct?.isBestSeller ?? false);
  const [warrantyYears, setWarrantyYears] = useState(
    initialProduct?.warrantyYears != null ? String(initialProduct.warrantyYears) : "5",
  );
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "ARCHIVED">(
    initialProduct?.status ?? "DRAFT",
  );
  const [images, setImages] = useState<
    { url: string; alt: string; provider?: "local" | "cloudinary" | "mock"; publicId?: string | null }[]
  >(
    initialProduct?.images.map((i) => ({
      url: i.url,
      alt: i.alt,
      provider:
        i.provider === "cloudinary" || i.provider === "local" || i.provider === "mock"
          ? i.provider
          : undefined,
      publicId: i.publicId ?? null,
    })) ?? [],
  );
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [selectedExistingImage, setSelectedExistingImage] = useState(existingImages[0] ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const mrpPaise = rupeesStringToPaise(mrpRupees);
  const pricePaise = rupeesStringToPaise(priceRupees);
  const discountPct =
    mrpPaise > 0 && pricePaise > 0 && pricePaise < mrpPaise
      ? Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100)
      : 0;

  function toggleCategory(id: string) {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function uploadImageFile(file: File): Promise<{
    url: string;
    provider?: "local" | "cloudinary" | "mock";
    publicId?: string | null;
  } | null> {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (sku.trim()) formData.append("sku", normalizeSku(sku));
      const res = await fetch("/api/admin/catalogue/upload", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as {
        url?: string;
        provider?: "local" | "cloudinary" | "mock";
        publicId?: string | null;
        error?: string;
      };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Image upload failed.");
        return null;
      }
      return { url: json.url, provider: json.provider, publicId: json.publicId ?? null };
    } catch {
      setError("Failed to upload image.");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploaded = await uploadImageFile(file);
    e.target.value = "";
    if (!uploaded) return;
    setImages((prev) => [
      ...prev,
      {
        url: uploaded.url,
        alt: name || "Watch product image",
        provider: uploaded.provider,
        publicId: uploaded.publicId,
      },
    ]);
  }

  async function handleReplaceImage(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploaded = await uploadImageFile(file);
    e.target.value = "";
    if (!uploaded) return;
    setImages((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              url: uploaded.url,
              provider: uploaded.provider,
              publicId: uploaded.publicId,
            }
          : item,
      ),
    );
  }

  function addExistingAsset() {
    if (!selectedExistingImage) return;
    setImages((prev) => [
      ...prev,
      { url: selectedExistingImage, alt: name || "Watch product image" },
    ]);
  }

  function addManualUrl() {
    const trimmed = manualImageUrl.trim();
    if (!trimmed) return;
    setImages((prev) => [...prev, { url: trimmed, alt: name || "Watch product image" }]);
    setManualImageUrl("");
  }

  function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    setImages((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      if (!item) return prev;
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  function makeMainImage(index: number) {
    if (index <= 0 || index >= images.length) return;
    setImages((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      if (!item) return prev;
      copy.unshift(item);
      return copy;
    });
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleSubmit(e: React.FormEvent, overrideStatus?: "DRAFT" | "PUBLISHED") {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    setSuccess(null);
    setSaving(true);

    const targetStatus = overrideStatus ?? status;
    const gstBps = Math.round((Number(gstPercent) || 0) * 100);
    const warranty = warrantyYears.trim() === "" ? null : Number(warrantyYears);

    const payload = {
      name,
      slug: normalizeSlug(slug || name),
      sku: normalizeSku(sku),
      brandId,
      categoryIds,
      gender,
      watchType,
      strapMaterial,
      dialAndStrap,
      description,
      specMovement,
      specCaseDimensions,
      specCrystal,
      specWaterResistance,
      specHsn,
      mrpPaise,
      pricePaise,
      gstRateBps: gstBps,
      badge: badge || null,
      isBestSeller,
      warrantyYears: warranty !== null && Number.isFinite(warranty) ? warranty : null,
      status: targetStatus,
      images,
    };

    try {
      if (mode === "create") {
        const res = await createAdminProductAction(payload);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(`/admin/products/${res.productId}`);
        router.refresh();
      } else if (initialProduct) {
        const res = await updateAdminProductAction(initialProduct.id, payload);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setStatus(targetStatus);
        setSuccess("Product saved successfully.");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!initialProduct) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await setAdminProductStatusAction(initialProduct.id, "ARCHIVED");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStatus("ARCHIVED");
      setSuccess("Product archived and removed from public storefront.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialProduct) return;
    setError(null);
    setSaving(true);
    try {
      const res = await deleteAdminProductAction(initialProduct.id);
      if (!res.ok) {
        setError(res.error);
        setConfirmDelete(false);
        return;
      }
      router.push("/admin/products");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => handleSubmit(e)} className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1.5 font-label text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-primary mb-2"
          >
            <Icon name="arrow_back" size={16} /> Back to Products
          </Link>
          <h1 className="font-headline text-headline-lg text-on-surface">
            {mode === "create" ? "New Timepiece" : initialProduct?.name}
          </h1>
          {mode === "edit" && initialProduct ? (
            <p className="font-mono text-mono-sm text-on-surface-variant mt-1">
              SKU: {initialProduct.sku} • Stock: {initialProduct.stock.available} avail /{" "}
              {initialProduct.stock.reserved} reserved (read-only) • Orders:{" "}
              {initialProduct.orderItemCount}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={(e) => handleSubmit(e, "DRAFT")}
              className="px-4 py-2 rounded-sm border border-outline font-label text-label-sm uppercase tracking-wider text-on-surface hover:border-primary disabled:opacity-50"
            >
              Save Draft
            </button>
            {canPublish ? (
              <button
                type="button"
                disabled={saving}
                onClick={(e) => handleSubmit(e, "PUBLISHED")}
                className="px-4 py-2 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase tracking-wider disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save & Publish"}
              </button>
            ) : null}
          </div>
        ) : null}
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

      {/* Core Identity & Classification */}
      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
        <h2 className="font-headline text-headline-md border-b border-outline pb-3">
          Core Identity &amp; Classification
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Product Name</span>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (mode === "create" && !slug) {
                  setSlug(normalizeSlug(e.target.value));
                }
              }}
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">URL Slug</span>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">SKU</span>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Brand</span>
            <select
              disabled={!canEdit}
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {!b.isActive ? "(Inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Gender</span>
            <select
              disabled={!canEdit}
              value={gender}
              onChange={(e) => setGender(e.target.value as "men" | "women" | "unisex")}
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="men">Men</option>
              <option value="women">Women</option>
              <option value="unisex">Unisex</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Watch Type</span>
            <select
              disabled={!canEdit}
              value={watchType}
              onChange={(e) =>
                setWatchType(e.target.value as "chronograph" | "automatic" | "dress" | "diver")
              }
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="chronograph">Chronograph</option>
              <option value="automatic">Automatic</option>
              <option value="dress">Minimal Dress</option>
              <option value="diver">Automatic Diver</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Strap Material</span>
            <select
              disabled={!canEdit}
              value={strapMaterial}
              onChange={(e) => setStrapMaterial(e.target.value as "steel" | "leather" | "mesh")}
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="steel">316L Steel</option>
              <option value="leather">Leather</option>
              <option value="mesh">Milanese Mesh</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="font-label text-label-lg">Dial &amp; Strap Summary</span>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={dialAndStrap}
              onChange={(e) => setDialAndStrap(e.target.value)}
              placeholder="e.g. Navy Sunray Dial / 316L Steel Bracelet"
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-label text-label-lg">Categories &amp; Subcategories</span>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const checked = categoryIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-body-md cursor-pointer ${
                    checked ? "border-primary bg-primary/10 text-on-surface" : "border-outline bg-background"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={checked}
                    onChange={() => toggleCategory(c.id)}
                  />
                  <span>
                    {c.parentName ? `${c.parentName} › ` : ""}
                    {c.name}
                    {!c.isActive ? " (Inactive)" : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-label text-label-lg">Editorial Description</span>
          <textarea
            rows={4}
            required
            disabled={!canEdit}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </label>
      </section>

      {/* Pricing & GST */}
      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-outline pb-3">
          <h2 className="font-headline text-headline-md">Pricing, MRP &amp; GST Configuration</h2>
          <span className="font-mono text-mono-sm text-on-surface-variant">
            Discount: {discountPct}% off MRP
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">MRP (INR)</span>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              disabled={!canEdit}
              value={mrpRupees}
              onChange={(e) => setMrpRupees(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Selling Price (INR)</span>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              disabled={!canEdit}
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">GST Rate (%)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="28"
              required
              disabled={!canEdit}
              value={gstPercent}
              onChange={(e) => setGstPercent(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">HSN Code</span>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={specHsn}
              onChange={(e) => setSpecHsn(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
        </div>
      </section>

      {/* Horological Specifications */}
      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
        <h2 className="font-headline text-headline-md border-b border-outline pb-3">
          Technical Specifications &amp; Merchandising
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Movement</span>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={specMovement}
              onChange={(e) => setSpecMovement(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Case Dimensions</span>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={specCaseDimensions}
              onChange={(e) => setSpecCaseDimensions(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Crystal</span>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={specCrystal}
              onChange={(e) => setSpecCrystal(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Water Resistance</span>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={specWaterResistance}
              onChange={(e) => setSpecWaterResistance(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Warranty (Years)</span>
            <input
              type="number"
              min="0"
              max="25"
              disabled={!canEdit}
              value={warrantyYears}
              onChange={(e) => setWarrantyYears(e.target.value)}
              className="px-3.5 py-2.5 rounded bg-background border border-outline font-mono outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label-lg">Storefront Badge</span>
            <select
              disabled={!canEdit}
              value={badge}
              onChange={(e) =>
                setBadge(e.target.value as "" | "best_seller" | "new_arrival" | "limited")
              }
              className="px-3.5 py-2.5 rounded bg-background border border-outline outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">None</option>
              <option value="best_seller">Best Seller</option>
              <option value="new_arrival">New Arrival</option>
              <option value="limited">Limited Edition</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="inline-flex items-center gap-2 font-body text-body-md">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={isBestSeller}
              onChange={(e) => setIsBestSeller(e.target.checked)}
            />
            <span>Feature in Homepage Best Sellers</span>
          </label>
          <label className="inline-flex items-center gap-2 font-body text-body-md">
            <span className="font-label text-label-lg">Publication Status:</span>
            <select
              disabled={!canEdit}
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "DRAFT" | "PUBLISHED" | "ARCHIVED")
              }
              className="px-3 py-1.5 rounded bg-background border border-outline"
            >
              <option value="DRAFT">Draft (Hidden)</option>
              <option value="PUBLISHED" disabled={!canPublish}>
                Published (Live)
              </option>
              <option value="ARCHIVED">Archived (Hidden)</option>
            </select>
          </label>
        </div>
      </section>

      {/* Product Image Gallery Manager */}
      <section className="bg-surface border border-outline rounded-md p-6 flex flex-col gap-5">
        <h2 className="font-headline text-headline-md border-b border-outline pb-3">
          Product Images &amp; Gallery Order
        </h2>

        {canEdit ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1.5 p-4 rounded border border-dashed border-outline bg-background">
              <span className="font-label text-label-sm uppercase tracking-wider">
                Upload New Image (WebP / JPEG / PNG, max 5 MB)
              </span>
              <input
                type="file"
                accept="image/webp,image/jpeg,image/png"
                disabled={uploading}
                onChange={handleFileUpload}
                className="text-body-md"
              />
              {uploading ? (
                <span className="text-body-md text-on-surface-variant">Uploading...</span>
              ) : null}
            </label>

            <div className="flex flex-col gap-2 p-4 rounded border border-outline bg-background">
              <span className="font-label text-label-sm uppercase tracking-wider">
                Select Existing Catalogue Asset
              </span>
              <div className="flex gap-2">
                <select
                  value={selectedExistingImage}
                  onChange={(e) => setSelectedExistingImage(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded bg-surface border border-outline text-body-md"
                >
                  {existingImages.map((imgPath) => (
                    <option key={imgPath} value={imgPath}>
                      {imgPath.replace("/images/products/", "")}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addExistingAsset}
                  className="px-3 py-1.5 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 p-4 rounded border border-outline bg-background">
              <span className="font-label text-label-sm uppercase tracking-wider">
                Add Image Path / HTTPS URL
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualImageUrl}
                  onChange={(e) => setManualImageUrl(e.target.value)}
                  placeholder="/images/products/..."
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded bg-surface border border-outline font-mono text-mono-sm"
                />
                <button
                  type="button"
                  onClick={addManualUrl}
                  className="px-3 py-1.5 rounded-sm bg-secondary text-on-secondary font-label text-label-sm uppercase"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {images.length === 0 ? (
          <p className="font-body text-body-md text-on-surface-variant">
            No images attached yet. Add a primary image above.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {images.map((img, index) => (
              <div
                key={`${img.url}-${index}`}
                className="border border-outline rounded-md p-3 bg-background flex flex-col gap-2"
              >
                <div className="relative aspect-[4/5] rounded overflow-hidden bg-surface-container">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
                  {index === 0 ? (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-sm bg-primary text-on-primary font-label text-label-sm uppercase">
                      Main Image
                    </span>
                  ) : null}
                </div>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={img.alt}
                  onChange={(e) => {
                    const nextAlt = e.target.value;
                    setImages((prev) =>
                      prev.map((item, idx) => (idx === index ? { ...item, alt: nextAlt } : item)),
                    );
                  }}
                  placeholder="Alternative text"
                  className="px-2.5 py-1.5 rounded bg-surface border border-outline text-body-md"
                />
                {canEdit ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {index > 0 ? (
                      <button
                        type="button"
                        onClick={() => makeMainImage(index)}
                        className="px-2 py-1 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary"
                      >
                        Set Main
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveImage(index, -1)}
                      className="px-2 py-1 rounded-sm border border-outline font-label text-label-sm disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === images.length - 1}
                      onClick={() => moveImage(index, 1)}
                      className="px-2 py-1 rounded-sm border border-outline font-label text-label-sm disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <label className="px-2 py-1 rounded-sm border border-outline font-label text-label-sm uppercase hover:border-primary cursor-pointer">
                      Replace
                      <input
                        type="file"
                        accept="image/webp,image/jpeg,image/png"
                        disabled={uploading}
                        onChange={(e) => handleReplaceImage(index, e)}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="ml-auto px-2 py-1 rounded-sm border border-error text-error font-label text-label-sm uppercase"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer Actions & Lifecycle */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        {mode === "edit" && initialProduct ? (
          <div className="flex flex-wrap items-center gap-3">
            {canEdit && status !== "ARCHIVED" ? (
              <button
                type="button"
                disabled={saving}
                onClick={handleArchive}
                className="px-4 py-2 rounded-sm border border-outline font-label text-label-sm uppercase tracking-wider hover:border-error hover:text-error"
              >
                Archive Product
              </button>
            ) : null}
            {canDelete &&
            initialProduct.orderItemCount === 0 &&
            initialProduct.reservationCount === 0 ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="font-body text-body-md text-error">Confirm permanent delete?</span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDelete}
                    className="px-3 py-1.5 rounded-sm bg-error text-on-error font-label text-label-sm uppercase"
                  >
                    Yes, Delete
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
                  className="px-4 py-2 rounded-sm border border-error text-error font-label text-label-sm uppercase tracking-wider"
                >
                  Delete Permanently
                </button>
              )
            ) : null}
          </div>
        ) : (
          <div />
        )}

        {canEdit ? (
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-sm bg-primary text-on-primary font-label text-label-lg uppercase tracking-wider disabled:opacity-50"
          >
            {saving ? "Saving..." : mode === "create" ? "Create Product" : "Save Changes"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
