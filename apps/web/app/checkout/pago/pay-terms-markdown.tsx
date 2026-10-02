"use client";

/*
 * Paquete J (2026-10-02) — el bloque de términos en markdown del botón de
 * pago, extraído de pay-button.tsx para cargarlo con next/dynamic.
 *
 * react-markdown + rehype-sanitize + remark-gfm pesan ~100 KB gz y antes se
 * importaban ESTÁTICAMENTE en el chunk principal de /checkout/pago para
 * renderizar un párrafo legal. Con el dynamic import (ssr: true) el HTML
 * sigue saliendo server-renderizado (el contenido legal no depende de JS)
 * pero el JS de hidratación llega en un chunk aparte, fuera del critical
 * path de interacción del checkout.
 */

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export default function PayTermsMarkdown({ terms }: { terms: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
      {terms}
    </ReactMarkdown>
  );
}
