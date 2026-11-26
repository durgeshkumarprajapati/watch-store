import "server-only";
import { z } from "zod";
import { readJsonCookie, writeJsonCookie } from "@/lib/cookie-list";

const schema = z.array(z.string().min(1).max(64)).max(100);

export const getWishlistIds = () => readJsonCookie("wishlist", schema, []);
export const saveWishlistIds = (ids: string[]) => writeJsonCookie("wishlist", ids);
