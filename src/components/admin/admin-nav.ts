import type { AdminPermissionCode } from "@/modules/admin/rbac-catalogue";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: string;
  permission: AdminPermissionCode;
}

export const adminNav: AdminNavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard", permission: "dashboard.read" },
  { href: "/admin/products", label: "Products", icon: "watch", permission: "products.read" },
  { href: "/admin/brands", label: "Brands", icon: "verified", permission: "brands.read" },
  { href: "/admin/categories", label: "Categories", icon: "category", permission: "categories.read" },
  { href: "/admin/google-sheets", label: "Google Sheets Sync", icon: "table_view", permission: "catalogue.sync.read" },
  { href: "/admin/inventory", label: "Inventory", icon: "inventory_2", permission: "inventory.read" },
  { href: "/admin/orders", label: "Orders", icon: "receipt_long", permission: "orders.read" },
  { href: "/admin/customers", label: "Customers", icon: "group", permission: "customers.read" },
  { href: "/admin/payments", label: "Payments (Razorpay)", icon: "payments", permission: "orders.read" },
  { href: "/admin/shipments", label: "Shipping (Shiprocket)", icon: "local_shipping", permission: "shipments.read" },
  { href: "/admin/gst", label: "GST & Invoices", icon: "account_balance", permission: "reports.read" },
  { href: "/admin/reports", label: "Reports", icon: "bar_chart", permission: "reports.read" },
  { href: "/admin/users", label: "Admins & Roles", icon: "admin_panel_settings", permission: "admins.read" },
  { href: "/admin/notifications", label: "Notifications", icon: "mail", permission: "notifications.read" },
  { href: "/admin/operations", label: "Operations", icon: "monitoring", permission: "operations.read" },
  { href: "/admin/audit", label: "Audit Log", icon: "history", permission: "audit.read" },
];

export const adminSettingsNav: AdminNavItem = {
  href: "/admin/settings",
  label: "Settings",
  icon: "settings",
  permission: "roles.read",
};
