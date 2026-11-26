export interface NewsletterRepository {
  /** Returns "created" for a new subscriber, "exists" if already subscribed. */
  subscribe(email: string): Promise<"created" | "exists">;
}
