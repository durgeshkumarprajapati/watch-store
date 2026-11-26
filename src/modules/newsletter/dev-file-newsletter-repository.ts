import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { NewsletterRepository } from "./newsletter-repository";

/** DEVELOPMENT ONLY: stores subscribers in .data/ (git-ignored). Replaced by Prisma in Phase 4. */
const file = path.join(process.cwd(), ".data", "newsletter-subscribers.json");

export const devFileNewsletterRepository: NewsletterRepository = {
  async subscribe(email) {
    let list: { email: string; subscribedAt: string }[] = [];
    try {
      list = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      /* first subscriber */
    }
    if (list.some((s) => s.email === email)) return "exists";
    list.push({ email, subscribedAt: new Date().toISOString() });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(list, null, 2));
    return "created";
  },
};
