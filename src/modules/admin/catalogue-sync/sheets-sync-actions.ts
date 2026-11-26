"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActionPermission } from "../admin-auth-service";
import {
  disconnectSheetsConnection,
  exportCatalogueToSheets,
  runCatalogueImport,
  saveSheetsConnection,
} from "./sheets-sync-service";

function revalidateSheetsRoutes(syncJobId?: string) {
  try {
    revalidatePath("/admin/google-sheets");
    if (syncJobId) revalidatePath(`/admin/google-sheets/${syncJobId}`);
    revalidatePath("/admin/products");
    revalidatePath("/products");
    revalidatePath("/", "layout");
  } catch {
    // Outside Next.js request context.
  }
}

export async function saveSheetsConnectionAction(input: {
  spreadsheetId: string;
  worksheetName: string;
}) {
  const actor = await requireAdminActionPermission("catalogue.sync.configure");
  const res = await saveSheetsConnection(actor, input);
  if (res.ok) revalidateSheetsRoutes();
  return res;
}

export async function disconnectSheetsConnectionAction() {
  const actor = await requireAdminActionPermission("catalogue.sync.configure");
  const res = await disconnectSheetsConnection(actor);
  if (res.ok) revalidateSheetsRoutes();
  return res;
}

export async function exportCatalogueToSheetsAction(idempotencyKey: string) {
  const actor = await requireAdminActionPermission("catalogue.sync.export");
  const res = await exportCatalogueToSheets(actor, idempotencyKey);
  if (res.ok) revalidateSheetsRoutes(res.syncJobId);
  return res;
}

export async function runCatalogueImportAction(input: {
  isDryRun: boolean;
  idempotencyKey: string;
}) {
  const actor = await requireAdminActionPermission("catalogue.sync.import");
  const res = await runCatalogueImport(actor, input);
  if (res.ok) revalidateSheetsRoutes(res.syncJobId);
  return res;
}
