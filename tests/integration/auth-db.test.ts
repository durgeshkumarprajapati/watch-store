import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedCatalogue } from "../../prisma/seed";
import { resetRateLimit } from "@/lib/rate-limit";
import {
  registerCustomerAccount,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyCustomerEmail,
} from "@/modules/auth/auth-service";
import { verifyPassword } from "@/modules/auth/password-service";
import {
  createCustomerAddress,
  deleteCustomerAddress,
  getCustomerOrderById,
  listCustomerOrders,
  setDefaultCustomerAddress,
  updateCustomerAddress,
} from "@/modules/customers/customer-service";
import { createPersistentOrder } from "@/modules/checkout/persistent-order-service";

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const runDbTests = process.env.RUN_DB_TESTS === "1" && Boolean(dbUrl);
const describeWithDb = runDbTests ? describe : describe.skip;

describeWithDb("Phase 7 Auth & Customer PostgreSQL integration against watchstore_db", () => {
  let prisma: PrismaClient;
  const testEmails: string[] = [];
  const orderKeys: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await seedCatalogue(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    if (orderKeys.length > 0) {
      const orders = await prisma.order.findMany({
        where: { idempotencyKey: { in: orderKeys } },
        select: { id: true },
      });
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await prisma.stockAdjustment.deleteMany({ where: { referenceId: { in: orderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      }
    }
    if (testEmails.length > 0) {
      await prisma.customer.deleteMany({ where: { email: { in: testEmails } } });
      await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    }
    await prisma.productStock.update({
      where: { productId: "p-011" },
      data: { available: 11, reserved: 1 },
    });
    await prisma.$disconnect();
  });

  it("registers, verifies email once, links guest orders, and supports password reset with sessionVersion bump", async () => {
    resetRateLimit();
    const email = `p7-auth-${Date.now()}@example.com`;
    const otherEmail = `p7-other-${Date.now()}@example.com`;
    testEmails.push(email, otherEmail);

    // 1. Place a guest order BEFORE registering
    const guestKey = `p7-guest-${Date.now()}`;
    const otherKey = `p7-other-${Date.now()}`;
    orderKeys.push(guestKey, otherKey);

    const guestOrder = await createPersistentOrder(
      {
        idempotencyKey: guestKey,
        fullName: "Guest Collector",
        email,
        phone: "9820144510",
        addressLine1: "10 Guest Lane",
        addressLine2: "",
        city: "Mumbai",
        state: "Maharashtra",
        pinCode: "400001",
        country: "India",
        shippingMethod: "standard",
        paymentMethod: "cod",
      },
      [{ productId: "p-011", quantity: 1 }],
      null,
    );
    expect(guestOrder.ok).toBe(true);

    // Another customer's guest order
    await createPersistentOrder(
      {
        idempotencyKey: otherKey,
        fullName: "Other Collector",
        email: otherEmail,
        phone: "9820144511",
        addressLine1: "20 Other Road",
        addressLine2: "",
        city: "Pune",
        state: "Maharashtra",
        pinCode: "411001",
        country: "India",
        shippingMethod: "standard",
        paymentMethod: "cod",
      },
      [{ productId: "p-011", quantity: 1 }],
      null,
    );

    // 2. Register account + verify duplicate registration is rejected
    const reg = await registerCustomerAccount(
      { fullName: "Verified Collector", email, password: "InitialPassword1" },
      { prismaClient: prisma },
    );
    expect(reg.ok).toBe(true);
    if (!reg.ok || !reg.devVerificationUrl) return;

    const dupReg = await registerCustomerAccount(
      { fullName: "Dup", email: email.toUpperCase(), password: "InitialPassword1" },
      { prismaClient: prisma },
    );
    expect(dupReg.ok).toBe(false);

    // 3. Verify email using raw token from devVerificationUrl
    const verifyToken = new URL(reg.devVerificationUrl).searchParams.get("token")!;
    const verified = await verifyCustomerEmail(verifyToken, prisma);
    expect(verified.ok).toBe(true);

    // Reusing verification token fails
    const reuseVerify = await verifyCustomerEmail(verifyToken, prisma);
    expect(reuseVerify.ok).toBe(false);

    // 4. Verified user is linked to their Customer and sees ONLY their own order
    const customer = await prisma.customer.findUnique({ where: { email } });
    expect(customer?.authUserId).toBeTruthy();

    const myOrders = await listCustomerOrders(customer!.id, {}, prisma);
    expect(myOrders.total).toBe(1);
    expect(myOrders.items[0]?.guestEmail).toBe(email);

    const otherOrder = await prisma.order.findUnique({ where: { idempotencyKey: otherKey } });
    expect(await getCustomerOrderById(customer!.id, otherOrder!.id, prisma)).toBeNull();

    // 5. Password reset updates hash & increments sessionVersion
    const beforeUser = await prisma.user.findUnique({ where: { email } });
    const resetReq = await requestPasswordReset(email, { prismaClient: prisma });
    expect(resetReq.ok).toBe(true);
    if (!resetReq.ok || !resetReq.devResetUrl) return;

    const resetToken = new URL(resetReq.devResetUrl).searchParams.get("token")!;
    const resetRes = await resetPasswordWithToken(
      { token: resetToken, password: "UpdatedPassword2" },
      prisma,
    );
    expect(resetRes.ok).toBe(true);

    // Reusing reset token fails
    expect(
      (await resetPasswordWithToken({ token: resetToken, password: "AnotherPassword3" }, prisma)).ok,
    ).toBe(false);

    const afterUser = await prisma.user.findUnique({ where: { email } });
    expect(afterUser?.sessionVersion).toBe((beforeUser?.sessionVersion ?? 1) + 1);
    expect(await verifyPassword(afterUser!.passwordHash!, "UpdatedPassword2")).toBe(true);
    expect(await verifyPassword(afterUser!.passwordHash!, "InitialPassword1")).toBe(false);
  });

  it("enforces address ownership and keeps historical order address snapshots immutable", async () => {
    const emailA = `p7-addr-a-${Date.now()}@example.com`;
    const emailB = `p7-addr-b-${Date.now()}@example.com`;
    testEmails.push(emailA, emailB);

    const custA = await prisma.customer.create({
      data: { email: emailA, fullName: "Cust A", phone: "9820144510" },
    });
    const custB = await prisma.customer.create({
      data: { email: emailB, fullName: "Cust B", phone: "9820144511" },
    });

    const addrA = await createCustomerAddress(
      custA.id,
      {
        label: "Home",
        addressLine1: "100 Original Street",
        addressLine2: "",
        city: "Mumbai",
        state: "Maharashtra",
        pinCode: "400001",
        isDefault: true,
      },
      prisma,
    );

    // Cross-customer edit/delete/default rejected
    expect(
      await updateCustomerAddress(
        custB.id,
        addrA.id,
        {
          label: "Hacked",
          addressLine1: "999 Attacker Lane",
          addressLine2: "",
          city: "Delhi",
          state: "Delhi",
          pinCode: "110001",
          isDefault: true,
        },
        prisma,
      ),
    ).toBeNull();
    expect(await deleteCustomerAddress(custB.id, addrA.id, prisma)).toBe(false);
    expect(await setDefaultCustomerAddress(custB.id, addrA.id, prisma)).toBe(false);

    // Place order, then edit/delete CustomerAddress -> OrderAddressSnapshot stays untouched
    const ordKey = `p7-snap-${Date.now()}`;
    orderKeys.push(ordKey);
    await createPersistentOrder(
      {
        idempotencyKey: ordKey,
        fullName: "Cust A",
        email: emailA,
        phone: "9820144510",
        addressLine1: "100 Original Street",
        addressLine2: "",
        city: "Mumbai",
        state: "Maharashtra",
        pinCode: "400001",
        country: "India",
        shippingMethod: "standard",
        paymentMethod: "cod",
      },
      [{ productId: "p-011", quantity: 1 }],
      null,
      custA.id,
    );

    await updateCustomerAddress(
      custA.id,
      addrA.id,
      {
        label: "New Home",
        addressLine1: "200 Updated Avenue",
        addressLine2: "",
        city: "Bengaluru",
        state: "Karnataka",
        pinCode: "560001",
        isDefault: true,
      },
      prisma,
    );

    const ord = await prisma.order.findUnique({
      where: { idempotencyKey: ordKey },
      include: { addressSnapshot: true },
    });
    expect(ord?.addressSnapshot?.addressLine1).toBe("100 Original Street");
    expect(ord?.addressSnapshot?.pinCode).toBe("400001");
  });
});
