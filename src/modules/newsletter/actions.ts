"use server";

import { seedDataAllowed } from "@/config/data-source";
import { newsletterSchema } from "@/validations/newsletter";
import { devFileNewsletterRepository } from "./dev-file-newsletter-repository";
import type { NewsletterRepository } from "./newsletter-repository";

export type NewsletterState = { status: "idle" | "success" | "error"; message: string };

function getRepository(): NewsletterRepository {
  if (seedDataAllowed()) return devFileNewsletterRepository;
  throw new Error("Newsletter storage is not configured (Phase 4).");
}

export async function subscribeNewsletterAction(_prev: NewsletterState, formData: FormData): Promise<NewsletterState> {
  const parsed = newsletterSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  }
  try {
    const result = await getRepository().subscribe(parsed.data.email);
    return {
      status: "success",
      message: result === "exists" ? "You're already on the list." : "Thank you — you're on the list.",
    };
  } catch {
    // Never report success if the subscription was not stored.
    return { status: "error", message: "Subscriptions are temporarily unavailable. Please try again later." };
  }
}
