export interface NavItem {
  label: string;
  href: string;
  /** Query param that marks this item active on /products, e.g. { type: "chronograph" }. */
  param?: { key: string; value: string };
}

export const primaryNav: NavItem[] = [
  { label: "Collections", href: "/products" },
  { label: "Chronographs", href: "/products?type=chronograph", param: { key: "type", value: "chronograph" } },
  { label: "Men's", href: "/products?gender=men", param: { key: "gender", value: "men" } },
  { label: "Women's", href: "/products?gender=women", param: { key: "gender", value: "women" } },
  { label: "Atelier", href: "/about" },
];

export const mobileNav: NavItem[] = [
  { label: "Collections", href: "/products" },
  { label: "Chronographs", href: "/products?type=chronograph" },
  { label: "Men's Watches", href: "/products?gender=men" },
  { label: "Women's Atelier", href: "/products?gender=women" },
  { label: "My Account", href: "/account" },
];
