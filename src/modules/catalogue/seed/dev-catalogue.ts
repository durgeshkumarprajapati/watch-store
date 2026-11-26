/**
 * ============================================================================
 * DEVELOPMENT SEED DATA — NOT A PRODUCTION CATALOGUE
 * Fictional brands, fictional SKUs, sample prices and sample stock. Modelled on
 * the products shown in the Stitch design so screens can be built and
 * visually compared. Never ship or present as real inventory. Brand names are
 * invented; the client must run their own trademark checks on final names.
 * Production data comes from PostgreSQL (Phase 4) / the admin + Google Sheets sync.
 * ============================================================================
 */
import type { Brand, Category, Product } from "../types";

export const devBrands: Brand[] = [
  { id: "b-verrane-chrono", name: "Verrane Chrono" },
  { id: "b-orrin-studio", name: "Orrin Studio" },
  { id: "b-verrane-marine", name: "Verrane Marine" },
  { id: "b-verrane-femme", name: "Verrane Femme" },
];
const brand = (id: string) => devBrands.find((b) => b.id === id)!;

export const devCategories: Category[] = [
  { id: "c-chronographs", slug: "chronographs", name: "Chronographs", image: "/images/categories/category_chronographs.webp" },
  { id: "c-minimal-dress", slug: "minimal-dress", name: "Minimal & Dress", image: "/images/categories/category_minimal_dress.webp" },
  { id: "c-automatic-divers", slug: "automatic-divers", name: "Automatic Divers", image: "/images/categories/category_automatic_divers.webp" },
  { id: "c-womens-atelier", slug: "womens-atelier", name: "Women's Atelier", image: "/images/categories/category_womens_atelier.webp" },
];

const rupees = (n: number) => n * 100;
const DIR_PREFIX: Record<string, string> = {
  "automatic-divers": "automatic_diver",
  chronographs: "chronograph",
  "minimal-dress": "minimal_dress",
  "womens-atelier": "women_s_atelier",
};
const img = (dir: string, sku: string) => {
  const prefix = DIR_PREFIX[dir] ?? dir;
  const skuSlug = sku.toLowerCase().replace(/-/g, "_");
  return [`/images/products/${dir}/${prefix}_${skuSlug}_1.webp`];
};

type Seed = Omit<Product, "brand" | "images" | "createdAt" | "gstRateBps" | "warrantyYears"> & {
  brandId: string;
  imageDir: string;
  createdAt?: string;
};

const seeds: Seed[] = [
  {
    id: "p-001", slug: "tempora-heritage-chronograph-40mm", sku: "VRN-CHR-402", name: "Tempora Heritage Chronograph 40mm",
    brandId: "b-verrane-chrono", imageDir: "chronographs", categoryIds: ["c-chronographs"], gender: "men", watchType: "chronograph",
    strapMaterial: "steel", dialAndStrap: "Navy Sunray / 316L Steel",
    description: "Development sample copy. Automatic column-wheel chronograph with a navy sunray dial and domed sapphire crystal.",
    specs: { movement: "Sample Calibre VC-882 Automatic Chronograph, 28,800 vph", caseDimensions: "40.0 mm × 11.4 mm (316L Stainless Steel)", crystal: "Box-domed Sapphire with dual anti-reflective coating", waterResistance: "100 Meters / 10 ATM", hsn: "9102" },
    mrpPaise: rupees(165000), pricePaise: rupees(145000), badge: "best_seller", isBestSeller: true, stock: { available: 18, reserved: 3 },
  },
  {
    id: "p-002", slug: "atelier-classique-bronze", sku: "ORR-DRS-118", name: "Atelier Classique Bronze",
    brandId: "b-orrin-studio", imageDir: "minimal-dress", categoryIds: ["c-minimal-dress"], gender: "men", watchType: "dress",
    strapMaterial: "leather", dialAndStrap: "Ivory Dial / Espresso Leather Strap",
    description: "Development sample copy. Slim bronze-toned dress watch on an espresso calfskin strap.",
    specs: { movement: "Sample Calibre OS-210 Automatic, 21,600 vph", caseDimensions: "38.0 mm × 9.2 mm (Bronze-tone steel)", crystal: "Sapphire with anti-reflective coating", waterResistance: "50 Meters / 5 ATM", hsn: "9102" },
    mrpPaise: rupees(98000), pricePaise: rupees(88500), badge: "new_arrival", isBestSeller: true, stock: { available: 12, reserved: 1 },
  },
  {
    id: "p-003", slug: "deepwater-300m-titanium", sku: "VRM-DIV-300", name: "Deepwater 300M Titanium",
    brandId: "b-verrane-marine", imageDir: "automatic-divers", categoryIds: ["c-automatic-divers"], gender: "men", watchType: "diver",
    strapMaterial: "steel", dialAndStrap: "Black Dial / Titanium Bracelet",
    description: "Development sample copy. Grade 5 titanium diver rated to 300 metres.",
    specs: { movement: "Sample Calibre VM-300 Automatic, 28,800 vph", caseDimensions: "42.0 mm × 13.0 mm (Grade 5 Titanium)", crystal: "Flat Sapphire with anti-reflective coating", waterResistance: "300 Meters / 30 ATM", hsn: "9102" },
    mrpPaise: rupees(192000), pricePaise: rupees(192000), badge: null, isBestSeller: true, stock: { available: 7, reserved: 0 },
  },
  {
    id: "p-004", slug: "lumiere-pearl-mesh-32mm", sku: "VRF-FEM-209", name: "Lumière Pearl Mesh 32mm",
    brandId: "b-verrane-femme", imageDir: "womens-atelier", categoryIds: ["c-womens-atelier"], gender: "women", watchType: "dress",
    strapMaterial: "mesh", dialAndStrap: "Pearl Dial / Gold Milanese Mesh",
    description: "Development sample copy. Compact pearl-dial watch on a gold-tone Milanese mesh bracelet.",
    specs: { movement: "Sample Calibre VF-032 Quartz", caseDimensions: "32.0 mm × 8.4 mm (Gold PVD Steel)", crystal: "Sapphire", waterResistance: "30 Meters / 3 ATM", hsn: "9102" },
    mrpPaise: rupees(132000), pricePaise: rupees(118000), badge: "limited", isBestSeller: true, stock: { available: 3, reserved: 1 },
  },
  {
    id: "p-005", slug: "solstice-ultra-thin-38mm", sku: "ORR-DRS-094", name: "Solstice Ultra-Thin 38mm",
    brandId: "b-orrin-studio", imageDir: "minimal-dress", categoryIds: ["c-minimal-dress"], gender: "unisex", watchType: "dress",
    strapMaterial: "leather", dialAndStrap: "Slate Dial / Black Leather Strap",
    description: "Development sample copy. Ultra-thin quartz dress watch with a slate dial.",
    specs: { movement: "Sample Calibre OS-094 Quartz", caseDimensions: "38.0 mm × 6.8 mm (316L Stainless Steel)", crystal: "Sapphire", waterResistance: "30 Meters / 3 ATM", hsn: "9102" },
    mrpPaise: rupees(62000), pricePaise: rupees(54000), badge: null, isBestSeller: false, stock: { available: 25, reserved: 2 },
  },
  {
    id: "p-006", slug: "meridian-gmt-automatic", sku: "VRN-GMT-510", name: "Meridian GMT Automatic",
    brandId: "b-verrane-chrono", imageDir: "chronographs", categoryIds: ["c-chronographs"], gender: "men", watchType: "automatic",
    strapMaterial: "steel", dialAndStrap: "Graphite Dial / Steel Bracelet",
    description: "Development sample copy. Dual-time automatic with a graphite dial.",
    specs: { movement: "Sample Calibre VC-510 Automatic GMT, 28,800 vph", caseDimensions: "41.0 mm × 12.2 mm (316L Stainless Steel)", crystal: "Sapphire with anti-reflective coating", waterResistance: "100 Meters / 10 ATM", hsn: "9102" },
    mrpPaise: rupees(168000), pricePaise: rupees(168000), badge: null, isBestSeller: false, stock: { available: 9, reserved: 0 },
  },
  {
    id: "p-007", slug: "harbour-regatta-chronograph-42mm", sku: "VRN-CHR-417", name: "Harbour Regatta Chronograph 42mm",
    brandId: "b-verrane-chrono", imageDir: "chronographs", categoryIds: ["c-chronographs"], gender: "men", watchType: "chronograph",
    strapMaterial: "leather", dialAndStrap: "White Dial / Tan Leather Strap",
    description: "Development sample copy. Quartz chronograph with a white dial and tan strap.",
    specs: { movement: "Sample Calibre VC-417 Quartz Chronograph", caseDimensions: "42.0 mm × 11.8 mm (316L Stainless Steel)", crystal: "Sapphire", waterResistance: "100 Meters / 10 ATM", hsn: "9102" },
    mrpPaise: rupees(110000), pricePaise: rupees(98000), badge: null, isBestSeller: false, stock: { available: 14, reserved: 2 },
  },
  {
    id: "p-008", slug: "obsidian-pilot-chronograph-41mm", sku: "VRN-CHR-431", name: "Obsidian Pilot Chronograph 41mm",
    brandId: "b-verrane-chrono", imageDir: "chronographs", categoryIds: ["c-chronographs"], gender: "men", watchType: "chronograph",
    strapMaterial: "leather", dialAndStrap: "Black Dial / Olive Leather Strap",
    description: "Development sample copy. Black-dial pilot chronograph.",
    specs: { movement: "Sample Calibre VC-431 Automatic Chronograph, 28,800 vph", caseDimensions: "41.0 mm × 13.1 mm (Black DLC Steel)", crystal: "Sapphire with anti-reflective coating", waterResistance: "100 Meters / 10 ATM", hsn: "9102" },
    mrpPaise: rupees(124000), pricePaise: rupees(124000), badge: "new_arrival", isBestSeller: false, stock: { available: 5, reserved: 1 },
  },
  {
    id: "p-009", slug: "fathom-automatic-diver-41mm", sku: "VRM-DIV-206", name: "Fathom Automatic Diver 41mm",
    brandId: "b-verrane-marine", imageDir: "automatic-divers", categoryIds: ["c-automatic-divers"], gender: "men", watchType: "diver",
    strapMaterial: "steel", dialAndStrap: "Green Dial / Steel Bracelet",
    description: "Development sample copy. Green-dial automatic diver with a unidirectional bezel.",
    specs: { movement: "Sample Calibre VM-206 Automatic, 21,600 vph", caseDimensions: "41.0 mm × 12.6 mm (316L Stainless Steel)", crystal: "Sapphire", waterResistance: "200 Meters / 20 ATM", hsn: "9102" },
    mrpPaise: rupees(84000), pricePaise: rupees(76500), badge: null, isBestSeller: false, stock: { available: 16, reserved: 2 },
  },
  {
    id: "p-010", slug: "slate-minimal-automatic-36mm", sku: "ORR-DRS-136", name: "Slate Minimal Automatic 36mm",
    brandId: "b-orrin-studio", imageDir: "minimal-dress", categoryIds: ["c-minimal-dress"], gender: "unisex", watchType: "automatic",
    strapMaterial: "leather", dialAndStrap: "Slate Dial / Grey Suede Strap",
    description: "Development sample copy. Minimal three-hand automatic.",
    specs: { movement: "Sample Calibre OS-136 Automatic, 21,600 vph", caseDimensions: "36.0 mm × 9.0 mm (316L Stainless Steel)", crystal: "Sapphire", waterResistance: "50 Meters / 5 ATM", hsn: "9102" },
    mrpPaise: rupees(68000), pricePaise: rupees(62000), badge: null, isBestSeller: false, stock: { available: 0, reserved: 0 },
  },
  {
    id: "p-011", slug: "aurora-rose-quartz-28mm", sku: "VRF-FEM-128", name: "Aurora Rose Quartz 28mm",
    brandId: "b-verrane-femme", imageDir: "womens-atelier", categoryIds: ["c-womens-atelier", "c-minimal-dress"], gender: "women", watchType: "dress",
    strapMaterial: "leather", dialAndStrap: "Rose Dial / Blush Leather Strap",
    description: "Development sample copy. Petite rose-dial quartz watch.",
    specs: { movement: "Sample Calibre VF-128 Quartz", caseDimensions: "28.0 mm × 7.6 mm (Rose PVD Steel)", crystal: "Sapphire", waterResistance: "30 Meters / 3 ATM", hsn: "9102" },
    mrpPaise: rupees(52000), pricePaise: rupees(48500), badge: "new_arrival", isBestSeller: false, stock: { available: 11, reserved: 1 },
  },
  {
    id: "p-012", slug: "marina-pearl-diver-34mm", sku: "VRF-DIV-134", name: "Marina Pearl Diver 34mm",
    brandId: "b-verrane-femme", imageDir: "womens-atelier", categoryIds: ["c-womens-atelier", "c-automatic-divers"], gender: "women", watchType: "diver",
    strapMaterial: "steel", dialAndStrap: "Pearl Dial / Steel Bracelet",
    description: "Development sample copy. Compact automatic diver with a pearl dial.",
    specs: { movement: "Sample Calibre VF-134 Automatic, 21,600 vph", caseDimensions: "34.0 mm × 11.2 mm (316L Stainless Steel)", crystal: "Sapphire", waterResistance: "100 Meters / 10 ATM", hsn: "9102" },
    mrpPaise: rupees(88000), pricePaise: rupees(82000), badge: null, isBestSeller: false, stock: { available: 6, reserved: 0 },
  },
];

export const devProducts: Product[] = seeds.map(({ brandId, imageDir, createdAt, ...rest }, i) => ({
  ...rest,
  brand: brand(brandId),
  images: img(imageDir, rest.sku),
  gstRateBps: 1800, // sample only — real rate/HSN must be set by the business accountant
  warrantyYears: 5, // sample only
  createdAt: createdAt ?? new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
}));
