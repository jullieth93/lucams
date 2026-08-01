/*
 * <CmsText> — renderea el body de un CmsBlock como texto plano.
 *
 * Para slogans, headings, badges donde NO necesitamos markdown.
 * Si no existe el bloque en DB → cae al fallback.
 */

import { getCmsBlock } from "@/lib/cms";
import { resolveCmsTokens } from "@/lib/cms-tokens";
import { isCmsEditMode } from "@/lib/cms-edit-mode";

export async function CmsText({ blockKey, fallback }: { blockKey: string; fallback: string }) {
  const block = await getCmsBlock(blockKey);
  const body = await resolveCmsTokens(block?.body ?? fallback);
  // Roadmap C1 paso 2 — en modo edición el span anota la key para que el
  // overlay abra el editor de este campo al clickear el texto.
  if (await isCmsEditMode()) return <span data-cms-key={blockKey}>{body}</span>;
  return <>{body}</>;
}
