"use server";

import type { ProductStatus } from "@prisma/client";
import { requireAdminActionPermission } from "../admin-auth-service";
import {
  createAdminBrand,
  deleteAdminBrand,
  updateAdminBrand,
} from "./admin-brand-service";
import {
  createAdminCategory,
  deleteAdminCategory,
  updateAdminCategory,
} from "./admin-category-service";
import {
  createAdminProduct,
  deleteAdminProduct,
  setAdminProductStatus,
  updateAdminProduct,
} from "./admin-product-service";
import type {
  AdminBrandInput,
  AdminCategoryInput,
  AdminProductInput,
} from "./catalogue-schemas";

export async function createAdminProductAction(input: AdminProductInput) {
  const actor = await requireAdminActionPermission("products.create");
  return createAdminProduct(actor, input);
}

export async function updateAdminProductAction(productId: string, input: AdminProductInput) {
  const actor = await requireAdminActionPermission("products.update");
  return updateAdminProduct(actor, productId, input);
}

export async function setAdminProductStatusAction(productId: string, status: ProductStatus) {
  const actor = await requireAdminActionPermission(
    status === "ARCHIVED" ? "products.delete" : "products.update",
  );
  return setAdminProductStatus(actor, productId, status);
}

export async function deleteAdminProductAction(productId: string) {
  const actor = await requireAdminActionPermission("products.delete");
  return deleteAdminProduct(actor, productId);
}

export async function createAdminBrandAction(input: AdminBrandInput) {
  const actor = await requireAdminActionPermission("brands.manage");
  return createAdminBrand(actor, input);
}

export async function updateAdminBrandAction(brandId: string, input: AdminBrandInput) {
  const actor = await requireAdminActionPermission("brands.manage");
  return updateAdminBrand(actor, brandId, input);
}

export async function deleteAdminBrandAction(brandId: string) {
  const actor = await requireAdminActionPermission("brands.manage");
  return deleteAdminBrand(actor, brandId);
}

export async function createAdminCategoryAction(input: AdminCategoryInput) {
  const actor = await requireAdminActionPermission("categories.manage");
  return createAdminCategory(actor, input);
}

export async function updateAdminCategoryAction(categoryId: string, input: AdminCategoryInput) {
  const actor = await requireAdminActionPermission("categories.manage");
  return updateAdminCategory(actor, categoryId, input);
}

export async function deleteAdminCategoryAction(categoryId: string) {
  const actor = await requireAdminActionPermission("categories.manage");
  return deleteAdminCategory(actor, categoryId);
}
