/*
 * <CmsText> — renderea el body de un CmsBlock como texto plano.
 *
 * Para slogans, headings, badges donde NO necesitamos markdown.
 * Si no existe el bloque en DB → cae al fallback.
 *
 * Marca el DOM con data-cms-key + data-cms-kind="block" para que el
 * Visual In-Place Editor (sub-bloque K) pueda detectarlo en hover y
 * abrir el popover. `display: contents` mantiene el span transparente
 * al layout (no afecta flex/grid).
 */

import { getCmsBlock } from "@/lib/cms";

export async function CmsText({ blockKey, fallback }: { blockKey: string; fallback: string }) {
  const block = await getCmsBlock(blockKey);
  return (
    <span data-cms-key={blockKey} data-cms-kind="block" style={{ display: "contents" }}>
      {block?.body ?? fallback}
    </span>
  );
}
