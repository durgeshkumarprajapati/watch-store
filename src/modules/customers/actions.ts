"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedCustomerAction } from "@/modules/auth/session-service";
import {
  addressSchema,
  changePasswordSchema,
  profileUpdateSchema,
} from "@/validations/auth";
import {
  changeCustomerPassword,
  createCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
  updateCustomerAddress,
  updateCustomerProfile,
} from "./customer-service";

export async function updateProfileAction(raw: {
  fullName: string;
  phone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const customer = await requireAuthenticatedCustomerAction();
  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid profile details." };
  }

  await updateCustomerProfile(customer.id, parsed.data);
  revalidatePath("/account");
  revalidatePath("/account/profile");
  return { ok: true };
}

export async function changePasswordAction(raw: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const customer = await requireAuthenticatedCustomerAction();
  if (!customer.authUserId) {
    return { ok: false, error: "Authentication record not linked." };
  }
  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid password details." };
  }

  return changeCustomerPassword(customer.authUserId, parsed.data);
}

export async function addAddressAction(raw: {
  label?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pinCode: string;
  isDefault?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const customer = await requireAuthenticatedCustomerAction();
  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid address." };
  }

  await createCustomerAddress(customer.id, parsed.data);
  revalidatePath("/account/addresses");
  revalidatePath("/account");
  return { ok: true };
}

export async function editAddressAction(
  addressId: string,
  raw: {
    label?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pinCode: string;
    isDefault?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const customer = await requireAuthenticatedCustomerAction();
  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid address." };
  }

  const updated = await updateCustomerAddress(customer.id, addressId, parsed.data);
  if (!updated) return { ok: false, error: "Address not found." };
  revalidatePath("/account/addresses");
  revalidatePath("/account");
  return { ok: true };
}

export async function removeAddressAction(
  addressId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const customer = await requireAuthenticatedCustomerAction();
  const deleted = await deleteCustomerAddress(customer.id, addressId);
  if (!deleted) return { ok: false, error: "Address not found." };
  revalidatePath("/account/addresses");
  revalidatePath("/account");
  return { ok: true };
}

export async function makeDefaultAddressAction(
  addressId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const customer = await requireAuthenticatedCustomerAction();
  const ok = await setDefaultCustomerAddress(customer.id, addressId);
  if (!ok) return { ok: false, error: "Address not found." };
  revalidatePath("/account/addresses");
  revalidatePath("/account");
  return { ok: true };
}
