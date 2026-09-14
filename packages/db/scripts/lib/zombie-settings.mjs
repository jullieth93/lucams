/*
 * Settings CMS ZOMBI (N-10 / CF-19, 2026-09-12) — la usa
 * remove-zombie-settings.mjs y la testea lib/zombie-settings.test.mjs.
 *
 * Son CmsField kind=SETTING sin NINGÚN lector en el código (verificado en la
 * auditoría 360° §M contra apps/web: 0 imports/reads de estas keys): texto
 * muerto que el admin puede editar creyendo que cambia algo del sitio.
 *
 * Origen: llegaron a la DB por la migración legacy SiteSetting→CmsField
 * (2026-07-30 — consta en los dumps de tmp/backups/). NO están inline en
 * cms-site-map.mjs, así que migrate-cms-v2 NO los vuelve a sembrar (verificado
 * 2026-09-12; el test de este archivo lo garantiza a futuro: falla si alguien
 * re-agrega una de estas keys al site map).
 */

export const ZOMBIE_SETTING_KEYS = [
  "WARRANTY_DURATION_YEARS",
  "MANUFACTURING_DAYS_RANGE",
  "SITE_TAGLINE",
  "SITE_DESCRIPTION",
  "BUSINESS_LEGAL_NAME",
  "HABEAS_DATA_CLAIM_DAYS",
  "HABEAS_DATA_CONSULTATION_DAYS",
  "RETRACTION_DAYS_BUSINESS",
  "DPA_AVEONLINE_URL",
  "DPA_CLOUDFLARE_URL",
  "DPA_GOOGLE_URL",
  "DPA_RESEND_URL",
  "DPA_SUPABASE_URL",
  "DPA_VERCEL_URL",
  "DPA_WOMPI_URL",
];
