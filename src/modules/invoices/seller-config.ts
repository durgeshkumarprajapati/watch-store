import "server-only";
import { brand } from "@/config/brand";
import { getServerEnv } from "@/config/env";

export interface SellerInvoiceConfig {
  legalName: string;
  address: string;
  state: string;
  gstin: string | null;
  email: string;
  phone: string;
}

export class InvoiceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceConfigurationError";
  }
}

const PLACEHOLDER_MARKERS = ["[LEGAL_NAME]", "[GSTIN]", "Address line, City, State PIN"];

function isPlaceholder(val?: string | null): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_MARKERS.some((p) => trimmed.includes(p));
}

/**
 * Resolves authoritative seller details from server environment variables.
 * Never fabricates a GSTIN, legal name, or business address.
 */
export function resolveSellerInvoiceConfig(
  override?: Partial<SellerInvoiceConfig>,
): SellerInvoiceConfig {
  const env = getServerEnv();
  const legalName = (override?.legalName ?? env.SELLER_LEGAL_NAME ?? brand.business.legalName).trim();
  const address = (override?.address ?? env.SELLER_ADDRESS ?? brand.contact.address).trim();
  const state = (override?.state ?? env.SELLER_STATE ?? "").trim();
  const rawGstin = (override?.gstin ?? env.SELLER_GSTIN ?? brand.business.gstin)?.trim() ?? "";
  const email = (override?.email ?? env.SELLER_EMAIL ?? brand.contact.email).trim();
  const phone = (override?.phone ?? env.SELLER_PHONE ?? brand.contact.phone).trim();

  if (isPlaceholder(legalName) || isPlaceholder(address)) {
    throw new InvoiceConfigurationError(
      "Seller invoice configuration is incomplete. Set SELLER_LEGAL_NAME and SELLER_ADDRESS on the server.",
    );
  }

  const gstin = rawGstin && !isPlaceholder(rawGstin) ? rawGstin.toUpperCase() : null;
  return {
    legalName,
    address,
    state,
    gstin,
    email,
    phone,
  };
}
