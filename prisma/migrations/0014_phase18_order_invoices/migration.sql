-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "yearMonth" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("yearMonth")
);

-- CreateTable
CREATE TABLE "OrderInvoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderInvoice_orderId_key" ON "OrderInvoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderInvoice_invoiceNumber_key" ON "OrderInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "OrderInvoice_invoiceNumber_idx" ON "OrderInvoice"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "OrderInvoice" ADD CONSTRAINT "OrderInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
