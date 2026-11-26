# Phase 8 — RBAC Permission Matrix

## Permission Codes (21 Total)

`dashboard.read`, `products.read`, `products.create`, `products.update`, `products.delete`, `categories.read`, `categories.manage`, `orders.read`, `orders.update`, `inventory.read`, `inventory.update`, `customers.read`, `customers.manage`, `reports.read`, `admins.read`, `admins.create`, `admins.update`, `admins.deactivate`, `roles.read`, `roles.manage`, `audit.read`.

## Role Assignments

| Role | Assigned Permissions |
| --- | --- |
| `SUPER_ADMIN` | All 21 permissions |
| `ADMIN` | `dashboard.read`, `products.read`, `products.create`, `products.update`, `products.delete`, `categories.read`, `categories.manage`, `orders.read`, `orders.update`, `inventory.read`, `inventory.update`, `customers.read`, `customers.manage`, `reports.read`, `admins.read`, `roles.read`, `audit.read` |
| `CATALOG_MANAGER` | `dashboard.read`, `products.read`, `products.create`, `products.update`, `products.delete`, `categories.read`, `categories.manage` |
| `ORDER_MANAGER` | `dashboard.read`, `orders.read`, `orders.update`, `customers.read` |
| `INVENTORY_MANAGER` | `dashboard.read`, `products.read`, `inventory.read`, `inventory.update` |
| `CUSTOMER_SUPPORT` | `dashboard.read`, `orders.read`, `customers.read` |

## Additional Invariants

- Only `SUPER_ADMIN` may assign or revoke the `SUPER_ADMIN` role.
- An administrator cannot modify their own roles or deactivate their own account.
- The last active `SUPER_ADMIN` cannot have `SUPER_ADMIN` removed or be deactivated.
