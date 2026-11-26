import Link from "next/link";

export function InventorySubnav({
  active,
  canUpdate,
}: {
  active: "overview" | "inward" | "outward" | "adjustments" | "movements" | "reservations";
  canUpdate: boolean;
}) {
  const items = [
    { key: "overview", href: "/admin/inventory", label: "Overview", show: true },
    { key: "inward", href: "/admin/inventory/inward", label: "Stock Inward", show: canUpdate },
    { key: "outward", href: "/admin/inventory/outward", label: "Stock Outward", show: canUpdate },
    {
      key: "adjustments",
      href: "/admin/inventory/adjustments",
      label: "Adjustments",
      show: canUpdate,
    },
    { key: "movements", href: "/admin/inventory/movements", label: "Movements", show: true },
    {
      key: "reservations",
      href: "/admin/inventory/reservations",
      label: "Reservations",
      show: true,
    },
  ] as const;

  return (
    <nav aria-label="Inventory Sections" className="flex flex-wrap gap-2 border-b border-outline pb-3">
      {items
        .filter((i) => i.show)
        .map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`px-3.5 py-1.5 rounded-sm font-label text-label-sm uppercase tracking-wider transition-colors ${
                isActive
                  ? "bg-primary text-on-primary"
                  : "border border-outline text-on-surface hover:border-primary"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}
