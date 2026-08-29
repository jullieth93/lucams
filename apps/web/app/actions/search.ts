/*
 * Server action — búsqueda fuzzy del header Cmd+K.
 *
 * Wrapper sobre `searchStorefrontProducts` con rate-limit por IP (auditoría 2026-07-13):
 * la acción es pública y hace una query fuzzy (pg_trgm) → sin límite era un vector de abuso/coste.
 */

"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/rate-limit-keys";
import { getClientIp } from "@/lib/client-ip";
import { searchStorefrontProducts } from "@/features/products/public-service";
import type { SearchResult } from "@/features/products/public-service";

export async function searchProductsAction(query: string): Promise<SearchResult[]> {
  const ip = getClientIp(await headers());
  // 60/min por IP: generoso para búsqueda-mientras-escribes (debounced), corta abuso.
  // IP hasheada en la key (auditoría 2026-08-24, C-8): no queda en claro en rate_limit_buckets.
  const { allowed } = await rateLimit(ipKey("search_action", ip), 60, 60);
  if (!allowed) return [];
  // Cap de longitud (auditoría experto 2026-07-26, P2): el query llegaba crudo al LIKE de la
  // búsqueda; acotarlo evita queries degeneradas por strings enormes (la búsqueda ya trunca
  // internamente a 80 chars en public-service, acá cortamos antes también por defensa en capas).
  return searchStorefrontProducts(query.slice(0, 120));
}
