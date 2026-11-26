import type { Metadata } from "next";
import { InfoPageShell } from "@/components/store/info-page-shell";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Contact Us",
  description: `Contact ${brand.name} concierge.`,
};

export default function ContactPage() {
  return (
    <InfoPageShell activeTab="contact">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
        <div className="lg:col-span-5 bg-surface border border-outline rounded-md p-6 flex flex-col gap-4">
          <h2 className="font-headline text-headline-md text-on-surface">Boutique &amp; Service Desk</h2>
          <p className="font-body text-body-md text-on-surface-variant">{brand.contact.address}</p>
          <p className="font-mono text-mono-sm text-on-surface">
            {brand.contact.email} • {brand.contact.phone}
          </p>
        </div>
        <div className="lg:col-span-7 bg-surface border border-outline rounded-md p-6 flex flex-col gap-4">
          <h2 className="font-headline text-headline-md text-on-surface">Concierge Assistance</h2>
          <p className="font-body text-body-md text-on-surface-variant">
            For sizing guidance, movement specifications, or order assistance, reach out to our concierge team by email or phone.
          </p>
        </div>
      </section>
    </InfoPageShell>
  );
}
