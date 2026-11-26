import Link from "next/link";
import Image from "next/image";
import { brand } from "@/config/brand";
import { Icon } from "@/components/ui/icon";

export function Logo({
  href = "/",
  tone = "default",
}: {
  href?: string;
  tone?: "default" | "on-band";
}) {
  const wordmarkColor = tone === "on-band" ? "text-on-band" : "text-on-surface";

  return (
    <Link href={href} className="flex items-center gap-3 shrink-0">
      {brand.logo.imageSrc ? (
        <Image src={brand.logo.imageSrc} alt={brand.name} width={24} height={24} />
      ) : (
        <Icon name={brand.logo.icon} size={24} className="text-primary" />
      )}
      <span className={`font-headline text-headline-md tracking-tight ${wordmarkColor}`}>
        {brand.wordmark}
      </span>
    </Link>
  );
}
