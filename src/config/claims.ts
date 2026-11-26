/**
 * Placeholder business claims (warranty length, return window, insured transit,
 * delivery promises, collector counts, inspection claims). These come from the
 * Stitch sample copy and are NOT verified. Per project rules they must not be
 * published as real promises. They render only in development, or when
 * SHOW_PLACEHOLDER_CLAIMS=true (local QA build). Hosted production hides them
 * until the client verifies each claim and replaces this gate.
 */
export function placeholderClaimsVisible(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SHOW_PLACEHOLDER_CLAIMS === "true";
}
