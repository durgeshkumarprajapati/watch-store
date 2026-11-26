import "server-only";
import { redirect } from "next/navigation";
import type { Customer } from "@prisma/client";
import { hasDatabaseUrl } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { getAuthenticatedAdmin } from "@/modules/admin/admin-auth-service";
import { auth } from "./auth";
import { linkVerifiedUserToCustomerInTx } from "./customer-link-service";

export class UnauthorizedCustomerError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedCustomerError";
  }
}

export async function getAuthenticatedCustomer(): Promise<Customer | null> {
  if (!hasDatabaseUrl()) return null;
  let session = null;
  try {
    session = await auth();
  } catch {
    return null;
  }
  const userId = session?.user?.id;
  if (!userId) return null;

  const prisma = getPrisma();
  const existing = await prisma.customer.findUnique({
    where: { authUserId: userId },
  });
  if (existing) return existing;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, emailVerified: true },
  });
  if (!user || !user.emailVerified) return null;

  return prisma.$transaction((tx) =>
    linkVerifiedUserToCustomerInTx(tx, {
      userId: user.id,
      verifiedEmail: user.email,
      fullName: user.name,
    }),
  );
}

export async function requireAuthenticatedCustomerPage(): Promise<Customer> {
  const admin = await getAuthenticatedAdmin();
  if (admin) redirect("/admin/dashboard");

  const customer = await getAuthenticatedCustomer();
  if (!customer) redirect("/login");
  return customer;
}

export async function requireAuthenticatedCustomerAction(): Promise<Customer> {
  const customer = await getAuthenticatedCustomer();
  if (!customer) throw new UnauthorizedCustomerError();
  return customer;
}
