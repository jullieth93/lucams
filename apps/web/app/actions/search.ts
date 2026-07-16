/*
 * Server action — búsqueda fuzzy del header Cmd+K.
 *
 * Wrapper sobre `searchStorefrontProducts` con rate-limit por IP (auditoría 2026-07-13):
 * la acción es pública y hace una query fuzzy (pg_trgm) → sin límite era un vector de abuso/coste.
 */

"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { searchStorefrontProducts } from "@/features/products/public-service";
import type { SearchResult } from "@/features/products/public-service";

export async function searchProductsAction(query: string): Promise<SearchResult[]> {
  const ip = getClientIp(await headers());
  // 60/min por IP: generoso para búsqueda-mientras-escribes (debounced), corta abuso.
  const { allowed } = await rateLimit(`search_action:${ip}`, 60, 60);
  if (!allowed) return [];
  return searchStorefrontProducts(query);
}
