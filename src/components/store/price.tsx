import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { ProductSummary } from "@/modules/catalogue/types";

export function Price({ product, compact = false }: { product: Pick<ProductSummary, "pricePaise" | "mrpPaise" | "discountPercent">; compact?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-title text-title-md text-on-surface tabular-nums">{formatINR(product.pricePaise)}</span>
      {product.discountPercent > 0 && (
        <>
          <span className={cn("font-body text-body-md text-on-surface-variant line-through tabular-nums", compact && "hidden sm:inline")}>
            {formatINR(product.mrpPaise)}
          </span>
          <span className={cn("font-label text-label-sm text-success", compact && "hidden sm:inline")}>{product.discountPercent}% OFF</span>
        </>
      )}
    </div>
  );
}
