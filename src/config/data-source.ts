/**
 * Data-source guard. Development seed data may only be used in development, or
 * when explicitly enabled with CATALOGUE_SOURCE=seed (local production-build QA).
 * Hosted production must use PostgreSQL (Phase 4); until it exists the app fails
 * loudly instead of silently serving fictional products.
 */
export function seedDataAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CATALOGUE_SOURCE === "seed";
}
