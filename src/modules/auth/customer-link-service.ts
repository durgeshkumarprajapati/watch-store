import "server-only";
import type { Customer, Prisma } from "@prisma/client";

export class CustomerLinkConflictError extends Error {
  constructor(message = "Customer record is already linked to another account.") {
    super(message);
    this.name = "CustomerLinkConflictError";
  }
}

/**
 * Links a verified auth User to the corresponding Customer record by normalized email,
 * and associates eligible unlinked guest orders with that Customer.
 * Must ONLY be called after email ownership is verified.
 */
export async function linkVerifiedUserToCustomerInTx(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    verifiedEmail: string;
    fullName?: string | null;
  },
): Promise<Customer> {
  const email = params.verifiedEmail.trim().toLowerCase();

  // Check if this user is already linked to a Customer
  const alreadyLinked = await tx.customer.findUnique({
    where: { authUserId: params.userId },
  });
  if (alreadyLinked) return alreadyLinked;

  const existingByEmail = await tx.customer.findUnique({
    where: { email },
  });

  let customer: Customer;
  if (existingByEmail) {
    if (existingByEmail.authUserId && existingByEmail.authUserId !== params.userId) {
      throw new CustomerLinkConflictError();
    }
    customer = await tx.customer.update({
      where: { id: existingByEmail.id },
      data: {
        authUserId: params.userId,
        ...(existingByEmail.fullName ? {} : { fullName: params.fullName ?? email }),
      },
    });
  } else {
    customer = await tx.customer.create({
      data: {
        email,
        fullName: params.fullName?.trim() || email.split("@")[0] || "Collector",
        phone: "",
        authUserId: params.userId,
      },
    });
  }

  // Associate unlinked guest orders matching the verified email.
  // Never touches orders already belonging to another Customer.
  await tx.order.updateMany({
    where: {
      guestEmail: email,
      customerId: null,
    },
    data: { customerId: customer.id },
  });

  return customer;
}
