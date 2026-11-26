# Phase 3 — Product Details Image Assets Required

This manifest lists every product photograph required for the Product Details Page (`/product/[slug]`) and storefront cards, mapped to the existing development SKUs in `src/modules/catalogue/seed/dev-catalogue.ts` and the directory structure in `public/images/README.md`.

## Summary
- **No external image URLs** are used at runtime. Until these local `.webp` files are uploaded, `MediaImage` displays a neutral watch placeholder without layout shift.
- **Main image (`-1.webp`)**: Required for all 12 SKUs (4:5 for cards, 4:3/square crop for PDP showcase). Recommended `1200×1500` px (`4:5`), WebP quality ~80, `< 250 KB`.
- **Gallery images (`-2.webp`, `-3.webp`, `-4.webp`)**: Optional per-SKU alternate angles shown in the 4-thumbnail gallery strip (`product_details_page/code.html` lines 169–189):
  - `-2.webp`: Exhibition caseback / movement calibre close-up
  - `-3.webp`: On-wrist lifestyle shot
  - `-4.webp`: Studio macro / crown & bezel detail

---

## Product Image Manifest

| Image name | Product SKU | Purpose | Reference location | Target directory | Format | Aspect ratio | Recommended dimensions | Required/optional |
|---|---|---|---|---|---|---|---|---|
| `vrn-chr-402-1.webp` | `VRN-CHR-402` | Main product image (front dial) | `product_details_page/code.html` (Main + Thumb 1) | `public/images/products/chronographs/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `vrn-chr-402-2.webp` | `VRN-CHR-402` | Gallery: exhibition calibre | `product_details_page/code.html` (Thumb 2) | `public/images/products/chronographs/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `vrn-chr-402-3.webp` | `VRN-CHR-402` | Gallery: on-wrist shot | `product_details_page/code.html` (Thumb 3) | `public/images/products/chronographs/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `vrn-chr-402-4.webp` | `VRN-CHR-402` | Gallery: studio macro | `product_details_page/code.html` (Thumb 4) | `public/images/products/chronographs/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `orr-drs-118-1.webp` | `ORR-DRS-118` | Main product image (front dial) | `product_listing_catalogue/code.html` (Card 2) | `public/images/products/minimal-dress/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `orr-drs-118-2.webp` | `ORR-DRS-118` | Gallery: movement / caseback | `product_details_page/code.html` (Gallery pattern) | `public/images/products/minimal-dress/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `orr-drs-118-3.webp` | `ORR-DRS-118` | Gallery: on-wrist shot | `product_details_page/code.html` (Gallery pattern) | `public/images/products/minimal-dress/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `orr-drs-118-4.webp` | `ORR-DRS-118` | Gallery: strap & clasp detail | `product_details_page/code.html` (Gallery pattern) | `public/images/products/minimal-dress/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `vrm-div-300-1.webp` | `VRM-DIV-300` | Main product image (front dial) | `product_listing_catalogue/code.html` (Card 3) | `public/images/products/automatic-divers/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `vrm-div-300-2.webp` | `VRM-DIV-300` | Gallery: caseback / bezel | `product_details_page/code.html` (Gallery pattern) | `public/images/products/automatic-divers/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `vrm-div-300-3.webp` | `VRM-DIV-300` | Gallery: on-wrist shot | `product_details_page/code.html` (Gallery pattern) | `public/images/products/automatic-divers/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `vrm-div-300-4.webp` | `VRM-DIV-300` | Gallery: titanium bracelet macro | `product_details_page/code.html` (Gallery pattern) | `public/images/products/automatic-divers/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `vrf-fem-209-1.webp` | `VRF-FEM-209` | Main product image (front dial) | `product_listing_catalogue/code.html` (Card 4) | `public/images/products/womens-atelier/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `vrf-fem-209-2.webp` | `VRF-FEM-209` | Gallery: mesh bracelet detail | `product_details_page/code.html` (Gallery pattern) | `public/images/products/womens-atelier/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `vrf-fem-209-3.webp` | `VRF-FEM-209` | Gallery: on-wrist shot | `product_details_page/code.html` (Gallery pattern) | `public/images/products/womens-atelier/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `vrf-fem-209-4.webp` | `VRF-FEM-209` | Gallery: pearl dial macro | `product_details_page/code.html` (Gallery pattern) | `public/images/products/womens-atelier/` | WebP | 4:3 | 1200 × 900 px | Optional |
| `orr-drs-094-1.webp` | `ORR-DRS-094` | Main product image (front dial) | `product_listing_catalogue/code.html` (Card 5) | `public/images/products/minimal-dress/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `vrn-gmt-510-1.webp` | `VRN-GMT-510` | Main product image (front dial) | `product_listing_catalogue/code.html` (Card 6) | `public/images/products/chronographs/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `vrn-chr-417-1.webp` | `VRN-CHR-417` | Main product image (front dial) | `dev-catalogue.ts` (`p-007`) | `public/images/products/chronographs/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `vrn-chr-431-1.webp` | `VRN-CHR-431` | Main product image (front dial) | `dev-catalogue.ts` (`p-008`) | `public/images/products/chronographs/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `vrm-div-206-1.webp` | `VRM-DIV-206` | Main product image (front dial) | `dev-catalogue.ts` (`p-009`) | `public/images/products/automatic-divers/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `orr-drs-136-1.webp` | `ORR-DRS-136` | Main product image (front dial) | `dev-catalogue.ts` (`p-010`) | `public/images/products/minimal-dress/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `vrf-fem-128-1.webp` | `VRF-FEM-128` | Main product image (front dial) | `dev-catalogue.ts` (`p-011`) | `public/images/products/womens-atelier/` | WebP | 4:5 | 1200 × 1500 px | **Required** |
| `vrf-div-134-1.webp` | `VRF-DIV-134` | Main product image (front dial) | `dev-catalogue.ts` (`p-012`) | `public/images/products/womens-atelier/` | WebP | 4:5 | 1200 × 1500 px | **Required** |

> **Note:** Additional `-2.webp`, `-3.webp`, `-4.webp` gallery angles can also be uploaded for `ORR-DRS-094` through `VRF-DIV-134` using the same `<sku-lowercase>-<n>.webp` convention; the Product Details Page supports multi-image galleries automatically via `product.images`.
