# Phase 14 — WatchStore Google Sheets Spreadsheet Template

All WatchStore catalogue spreadsheets use a single header row (`A1:X1`) with 24 ordered columns. Never rename or reorder the first 23 columns.

| Col | Header | Type / Format | Required | Notes |
| --- | --- | --- | --- | --- |
| A | `SKU` | String (uppercased) | Yes | Primary match key (`Product.sku`) |
| B | `Product Name` | String | Yes | Display title |
| C | `Slug` | String | Yes on create | URL slug |
| D | `Brand` | Brand name or slug | Yes on create | Must match existing `Brand` |
| E | `Categories` | Comma-separated slugs | Yes on create | Must match existing `Category` records |
| F | `Gender` | `men \| women \| unisex` | Yes on create | Enum validated |
| G | `Watch Type` | `chronograph \| automatic \| dress \| diver` | Yes on create | Enum validated |
| H | `Strap Material` | `steel \| leather \| mesh` | Yes on create | Enum validated |
| I | `Dial & Strap` | String | Yes on create | Short finish summary |
| J | `Description` | String | Yes on create | Product copy |
| K | `Movement` | String | Yes on create | Spec field |
| L | `Case Dimensions` | String | Yes on create | Spec field |
| M | `Crystal` | String | Yes on create | Spec field |
| N | `Water Resistance` | String | Yes on create | Spec field |
| O | `HSN Code` | 4–8 digits | Yes on create | GST HSN code |
| P | `MRP (INR)` | Number (Rupees) | Yes on create | Converted to integer paise |
| Q | `Selling Price (INR)` | Number (Rupees) | Yes on create | Converted to integer paise; must be `<= MRP` |
| R | `GST (%)` | Number (`0`–`28`) | Yes on create | Converted to basis points (`18` -> `1800`) |
| S | `Badge` | String | No | Optional badge label |
| T | `Best Seller` | `TRUE \| FALSE` | No | Defaults to `FALSE` |
| U | `Warranty (Years)` | Integer | No | Optional warranty period |
| V | `Status` | `DRAFT \| PUBLISHED \| ARCHIVED` | No | New products default to `DRAFT` unless `catalogue.publish` is authorized |
| W | `Primary Image` | Relative or HTTPS URL | No | Optional primary image URL |
| X | `Updated At (Read-Only)` | ISO-8601 timestamp | No | Written on export; used for informational display |
