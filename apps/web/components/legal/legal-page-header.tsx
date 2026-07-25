/*
 * <LegalPageHeader> — h1 + "Última actualización" de las 8 páginas
 * /legal/*. El título y la línea de versión van por CmsText con
 * fallback hardcoded (editables desde el Visual Editor o admin).
 *
 * - `legal.<slug>.heading` → título por página
 * - `legal.last-updated` → línea de fecha+versión COMÚN a las 8
 *   (Lucy edita una sola vez y aplica a todas)
 */

import { CmsText } from "@/components/cms/cms-text";

export function LegalPageHeader({
  blockKey,
  defaultTitle,
}: {
  blockKey: string;
  defaultTitle: string;
}) {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
        <CmsText blockKey={blockKey} fallback={defaultTitle} />
      </h1>
      <p className="text-brand-muted mt-2 text-sm">
        <CmsText
          blockKey="legal.last-updated"
          fallback="Última actualización: 2026-07-25 · Versión 4"
        />
      </p>
    </>
  );
}
