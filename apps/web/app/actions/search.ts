/*
 * Server action — búsqueda fuzzy del header Cmd+K.
 *
 * Wrapper sobre `searchStorefrontProducts` con rate-limit por IP (en
 * sub-bloque F endurecemos esto a futuro).
 */

"use server";

import { searchStorefrontProducts } from "@/features/products/public-service";
import type { SearchResult } from "@/features/products/public-service";

export async function searchProductsAction(query: string): Promise<SearchResult[]> {
  return searchStorefrontProducts(query);
}
