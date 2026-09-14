/*
 * seed-products.mjs — WRAPPER de compatibilidad (N-06, 2026-09-12).
 *
 * El seed histórico se dividió porque era crítico de correr (CF-09):
 *   - seed-catalog-canonical.mjs → catálogo (categorías+productos+variantes),
 *     dry-run por defecto, sin pisar precios/imágenes/estados, sin reseñas.
 *   - seed-demo-reviews.mjs      → las 26 reseñas demo (marcadas createdBy).
 *
 * Este wrapper existe para no romper la costumbre `node scripts/seed-products.mjs`
 * y referencias viejas fuera del Makefile: delega en el canónico pasándole los
 * mismos flags (--apply / --prune). El Makefile ya apunta directo al canónico.
 *
 * Uso:
 *   node scripts/seed-products.mjs [--apply] [--prune]
 */

import { main } from "./seed-catalog-canonical.mjs";

console.log(
  "[seed-products] Wrapper N-06: el catálogo vive en seed-catalog-canonical.mjs " +
    "y las reseñas demo en seed-demo-reviews.mjs. Delegando...\n",
);

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
