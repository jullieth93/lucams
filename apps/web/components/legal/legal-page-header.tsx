/*
 * <LegalPageHeader> — h1 + "Última actualización" de las 8 páginas
 * /legal/*. El título y la línea de versión van por CmsText con
 * fallback hardcoded (editables desde el Visual Editor o admin).
 *
 * - `legal.<slug>.heading` → título por página
 * - `legal.last-updated` → línea de fecha+versión COMÚN (default para todo
 *   el paquete legal v1, 2026-09-29: los 8 documentos comparten versión)
 * - `lastUpdated` (prop opcional) → línea LITERAL por página. Hoy cookies y
 *   security la pasan explícita por costumbre del versionado propio que
 *   tenían antes del paquete v1; debe coincidir con la línea de versión del
 *   cuerpo (legal-content/legal.<slug>.md).
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
            fallback="Última actualización: 2026-09-29 · Versión 1"
          />
        )}
      </p>
    </>
  );
}
