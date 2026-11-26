import type { Metadata } from "next";
import { InfoPageShell } from "@/components/store/info-page-shell";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "FAQ & Sizing Guide",
  description: `Frequently asked questions for ${brand.name}.`,
};

const FAQS = [
  {
    q: "How do I choose the right case diameter?",
    a: "Dress watches between 36 mm and 38 mm suit classic proportions, while 40 mm to 42 mm chronographs and divers offer a bolder wrist presence.",
  },
  {
    q: "Are prices inclusive of GST?",
    a: "Yes. All storefront prices are displayed in INR inclusive of applicable GST, with HSN and tax breakdowns shown at checkout.",
  },
  {
    q: "Which payment methods are supported?",
    a: "Orders can be placed via Cash on Delivery (subject to eligibility limits) or online payment once the payment gateway is enabled.",
  },
];

export default function FaqPage() {
  return (
    <InfoPageShell activeTab="faq">
      <section className="flex flex-col gap-4 max-w-3xl">
        <h2 className="font-headline text-headline-lg text-on-background mb-2">Frequently Asked Questions</h2>
        {FAQS.map((item) => (
          <div key={item.q} className="bg-surface border border-outline rounded-md p-5">
            <h3 className="font-title text-title-md text-on-surface">{item.q}</h3>
            <p className="font-body text-body-md text-on-surface-variant mt-1.5">{item.a}</p>
          </div>
        ))}
      </section>
    </InfoPageShell>
  );
}
