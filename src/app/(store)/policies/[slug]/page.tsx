import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InfoPageShell, type InfoTabKey } from "@/components/store/info-page-shell";

const POLICIES: Record<
  string,
  { tab: InfoTabKey; title: string; body: string }
> = {
  shipping: {
    tab: "shipping",
    title: "Shipping & Delivery Policy",
    body: "Delivery availability and dispatch timelines are confirmed at checkout based on your Indian PIN code.",
  },
  returns: {
    tab: "returns",
    title: "Returns & Refunds Policy",
    body: "Unworn timepieces with intact protective seals, tags, and original presentation packaging are eligible for return inspection per store terms.",
  },
  warranty: {
    tab: "warranty",
    title: "Movement Warranty",
    body: "Eligible timepieces include manufacturer movement coverage from the invoice date. Normal strap wear and accidental impact are excluded.",
  },
  privacy: {
    tab: "privacy",
    title: "Privacy Policy & Terms of Service",
    body: "Customer information is processed strictly for order fulfilment, GST invoicing, and client support.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const policy = POLICIES[slug];
  if (!policy) return { title: "Policy Not Found" };
  return { title: policy.title };
}

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const policy = POLICIES[slug];
  if (!policy) notFound();

  return (
    <InfoPageShell activeTab={policy.tab}>
      <section className="bg-surface border border-outline rounded-md p-8 max-w-3xl flex flex-col gap-3">
        <h2 className="font-headline text-headline-lg text-on-surface">{policy.title}</h2>
        <p className="font-body text-body-md text-on-surface-variant">{policy.body}</p>
      </section>
    </InfoPageShell>
  );
}
