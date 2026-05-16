/*
 * <CmsMarkdown> — renderea un CmsBlock con format=MARKDOWN.
 *
 * Server component que:
 *  1. Lee el bloque del CMS via getCmsBlock (cached).
 *  2. Si no existe en DB → usa el `fallback` hardcoded.
 *  3. Renderea con react-markdown + remark-gfm (tablas, listas GFM)
 *     + rehype-sanitize (allowlist limpia).
 *  4. Aplica styling brand-purple-dark + Fredoka headings.
 */

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { getCmsBlock } from "@/lib/cms";

export async function CmsMarkdown({
  blockKey,
  fallback,
  className = "",
}: {
  blockKey: string;
  fallback: string;
  className?: string;
}) {
  const block = await getCmsBlock(blockKey);
  const body = block?.body ?? fallback;

  return (
    <div className={"cms-markdown " + className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
