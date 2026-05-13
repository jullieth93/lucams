/*
 * <CmsText> — renderea el body de un CmsBlock como texto plano.
 *
 * Para slogans, headings, badges donde NO necesitamos markdown.
 * Si no existe el bloque en DB → cae al fallback.
 */

import { getCmsBlock } from "@/lib/cms";

export async function CmsText({ blockKey, fallback }: { blockKey: string; fallback: string }) {
  const block = await getCmsBlock(blockKey);
  return <>{block?.body ?? fallback}</>;
}
