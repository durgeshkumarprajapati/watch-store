# Google Sheets 24-Column Catalogue Mapping

Source of truth: [sheets-mapper.ts](file:///home/ppsd-021/watch-store/src/modules/admin/catalogue-sync/sheets-mapper.ts). Maximum `500` data rows per import (`MAX_IMPORT_ROWS = 500`), maximum `4000` chars per cell (`MAX_CELL_LENGTH = 4000`).

| Col | Header | Format / Allowed Values | Notes |
| --- | --- | --- | --- |
| A | `SKU` | Uppercase string | Primary match key (`Product.sku`); duplicates rejected |
| B | `Product Name` | String | Required on create; empty preserves existing on update |
| C | `Slug` | Lowercase slug | Auto-normalized if omitted |
| D | `Brand` | Existing `Brand` name or slug | Must exist in PostgreSQL |
| E | `Categories` | Comma-separated `Category` slugs | Must exist in PostgreSQL |
| F | `Gender` | `men \| women \| unisex` | Enum validated |
| G | `Watch Type` | `chronograph \| automatic \| dress \| diver` | Enum validated |
| H | `Strap Material` | `steel \| leather \| mesh` | Enum validated |
| I | `Dial & Strap` | String | Finish summary |
| J | `Description` | String (min 10 chars) | Product description |
| K | `Movement` | String | Spec field |
| L | `Case Dimensions` | String | Spec field |
| M | `Crystal` | String | Spec field |
| N | `Water Resistance` | String | Spec field |
| O | `HSN Code` | 4–8 digits | GST HSN code |
| P | `MRP (INR)` | Number in Rupees | Converted to integer paise (`* 100`) |
| Q | `Selling Price (INR)` | Number in Rupees | Converted to integer paise; `<= MRP` |
| R | `GST (%)` | Number `0`–`28` | Converted to basis points (`* 100`) |
| S | `Badge` | `best_seller \| new_arrival \| limited` or empty | Optional |
| T | `Best Seller` | `TRUE \| FALSE` | Boolean |
| U | `Warranty (Years)` | Integer or empty | Optional |
| V | `Status` | `DRAFT \| PUBLISHED \| ARCHIVED` | New rows default to `DRAFT`; `PUBLISHED` requires `catalogue.publish` |
| W | `Primary Image` | `/images/...` or `https://...` | Optional |
| X | `Updated At (Read-Only)` | ISO-8601 timestamp | Informational export timestamp; do not rely on editing |
