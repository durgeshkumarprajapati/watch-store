# Local image assets

All storefront images are served from here. The app never loads product/site images from external URLs
at runtime. If a file is missing or fails to load, the UI shows a neutral placeholder, so you can add
photos at any time without code changes.

STATUS: no photographs are committed yet (downloads from the Stitch export / stock sites could not be
fetched from the build sandbox). Development screens therefore show placeholders.

## Structure
```
public/images/
  products/<category>/<sku-lowercase>-<n>.webp   e.g. products/chronographs/vrn-chr-402-1.webp
  categories/<category-slug>.webp                e.g. categories/chronographs.webp   (1:1)
  site/hero.webp (4:3 mobile / ~1:1.1 desktop), heritage.webp (4:3), lifestyle-1.webp, lifestyle-2.webp (1:1)
```
Category folders: `chronographs`, `minimal-dress`, `automatic-divers`, `womens-atelier`.
`-1` is the primary image; add `-2`, `-3`... for the gallery (product page, step 3).

## Format rules
- WebP, product shots 4:5 (e.g. 1200x1500), quality ~80, under ~250 KB each.
- Must accurately depict the product they are attached to (dial colour, strap, case size).
- Licensed sources only (Unsplash/Pexels licence text kept in `docs/assets/licences.md` with photographer + URL);
  real client photography replaces development images using the same filenames.
