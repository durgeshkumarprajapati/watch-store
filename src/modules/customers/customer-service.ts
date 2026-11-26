import "server-only";
import type { Customer, CustomerAddress, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/modules/auth/password-service";

export async function updateCustomerProfile(
  customerId: string,
  input: { fullName: string; phone: string },
  prismaClient?: PrismaClient,
): Promise<Customer> {
  const prisma = prismaClient ?? getPrisma();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.customer.update({
      where: { id: customerId },
      data: {
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
      },
    });
    if (updated.authUserId) {
      await tx.user.update({
        where: { id: updated.authUserId },
        data: { name: input.fullName.trim() },
      });
    }
    return updated;
  });
}

export async function changeCustomerPassword(
  authUserId: string,
  input: { currentPassword: string; newPassword: string },
  prismaClient?: PrismaClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prisma = prismaClient ?? getPrisma();
  const user = await prisma.user.findUnique({ where: { id: authUserId } });
  if (!user) return { ok: false, error: "Account not found." };

  if (user.passwordHash) {
    const valid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!valid) return { ok: false, error: "Current password is incorrect." };
  }

  const nextHash = await hashPassword(input.newPassword);
  await prisma.user.update({
    where: { id: authUserId },
    data: {
      passwordHash: nextHash,
      sessionVersion: { increment: 1 },
    },
  });

  return { ok: true };
}

export async function listCustomerAddresses(
  customerId: string,
  prismaClient?: PrismaClient,
): Promise<CustomerAddress[]> {
  const prisma = prismaClient ?? getPrisma();
  return prisma.customerAddress.findMany({
    where: { customerId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

export async function createCustomerAddress(
  customerId: string,
  input: {
    label: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pinCode: string;
    isDefault: boolean;
  },
  prismaClient?: PrismaClient,
): Promise<CustomerAddress> {
  const prisma = prismaClient ?? getPrisma();
  return prisma.$transaction(async (tx) => {
    const existingCount = await tx.customerAddress.count({ where: { customerId } });
    const makeDefault = input.isDefault || existingCount === 0;

    if (makeDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.customerAddress.create({
      data: {
        customerId,
        label: input.label || null,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        pinCode: input.pinCode,
        country: "India",
        isDefault: makeDefault,
      },
    });
  });
}

export async function updateCustomerAddress(
  customerId: string,
  addressId: string,
  input: {
    label: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pinCode: string;
    isDefault: boolean;
  },
  prismaClient?: PrismaClient,
): Promise<CustomerAddress | null> {
  const prisma = prismaClient ?? getPrisma();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });
    if (!existing) return null;

    if (input.isDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.customerAddress.update({
      where: { id: addressId },
      data: {
        label: input.label || null,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        pinCode: input.pinCode,
        isDefault: input.isDefault ? true : existing.isDefault,
      },
    });
  });
}

export async function deleteCustomerAddress(
  customerId: string,
  addressId: string,
  prismaClient?: PrismaClient,
): Promise<boolean> {
  const prisma = prismaClient ?? getPrisma();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });
    if (!existing) return false;

    await tx.customerAddress.delete({ where: { id: addressId } });

    if (existing.isDefault) {
      const next = await tx.customerAddress.findFirst({
        where: { customerId },
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await tx.customerAddress.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
    return true;
  });
}

export async function setDefaultCustomerAddress(
  customerId: string,
  addressId: string,
  prismaClient?: PrismaClient,
): Promise<boolean> {
  const prisma = prismaClient ?? getPrisma();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.customerAddress.findFirst({
      where: { id: addressId, customerId },
    });
    if (!existing) return false;

    await tx.customerAddress.updateMany({
      where: { customerId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.customerAddress.update({
      where: { id: addressId },
      data: { isDefault: true },
    });
    return true;
  });
}

export async function listCustomerOrders(
  customerId: string,
  opts: { page?: number; pageSize?: number } = {},
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 10), 50);
  const requestedPage = Math.max(1, opts.page ?? 1);

  const total = await prisma.order.count({ where: { customerId } });
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);

  const items = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      items: true,
    },
  });

  return { items, total, page, pageSize, totalPages };
}

export async function getCustomerOrderById(
  customerId: string,
  orderId: string,
  prismaClient?: PrismaClient,
) {
  const prisma = prismaClient ?? getPrisma();
  return prisma.order.findFirst({
    where: { id: orderId, customerId },
    include: {
      items: true,
      addressSnapshot: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}
