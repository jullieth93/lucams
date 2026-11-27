/**
 * Constantes de identidad del sitio. La marca visible es "Lucams Shop"
 * (nunca con apóstrofe ni con underscore en textos visibles). Los
 * identificadores técnicos (slugs, dominios, handles, paths) no usan
 * estas constantes.
 */
export const SITE_NAME = "Lucams Shop";
export const SITE_TAGLINE = "Tus recuerdos en imán";
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`;

const SITE_NAME_SUFFIX_RE = /\s*[|·—–-]\s*lucams\s+shop$/i;

/**
 * Elimina sufijos de marca repetidos (`| Lucams Shop`, `· Lucams Shop`, `— Lucams Shop`, etc.)
 * para evitar duplicaciones cuando el layout raíz aplica `title.template` (`%s · Lucams Shop`).
 */
export function stripSiteNameSuffix(rawTitle: string): string {
  let cleaned = rawTitle.trim();
  while (SITE_NAME_SUFFIX_RE.test(cleaned)) {
    const next = cleaned.replace(SITE_NAME_SUFFIX_RE, "").trim();
    if (!next) break;
    cleaned = next;
  }
  return cleaned;
}
