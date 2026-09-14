/*
 * <LegalPageHeader> — h1 + "Última actualización" de las 8 páginas
 * /legal/*. El título y la línea de versión van por CmsText con
 * fallback hardcoded (editables desde el Visual Editor o admin).
 *
 * - `legal.<slug>.heading` → título por página
 * - `legal.last-updated` → línea de fecha+versión COMÚN (default para los
 *   6 documentos del paquete v5, 2026-09-04)
 * - `lastUpdated` (prop opcional) → línea LITERAL por página, para los
 *   documentos con versionado propio que no participan del paquete v5
 *   (cookies v4 · 2026-09-11, security v2 · 2026-07-25). Debe coincidir
 *   con la línea de versión del cuerpo (legal-content/legal.<slug>.md).
 */

import { CmsText } from "@/components/cms/cms-text";

export function LegalPageHeader({
  blockKey,
  defaultTitle,
  lastUpdated,
}: {
  blockKey: string;
  defaultTitle: string;
  lastUpdated?: string;
}) {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
        <CmsText blockKey={blockKey} fallback={defaultTitle} />
      </h1>
      <p className="text-brand-muted mt-2 text-sm">
        {lastUpdated ?? (
          <CmsText
            blockKey="legal.last-updated"
            fallback="Última actualización: 2026-09-04 · Versión 5"
          />
        )}
      </p>
    </>
  );
}
