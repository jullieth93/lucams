import "server-only";
import { headers } from "next/headers";
import { escapeJsonLd } from "@/lib/seo/structured-data";

/**
 * Emite uno o más bloques JSON-LD en un `<script type="application/ld+json">`, escapados contra XSS
 * y con el nonce de la CSP (C3). El JSON-LD es un bloque de DATOS (exento de script-src) pero le
 * pasamos el nonce por robustez ante navegadores estrictos. Server component (lee headers()).
 *
 * `suppressHydrationWarning`: el navegador BORRA el nonce del DOM tras aplicar la CSP, así que el
 * cliente ve nonce="" y no matchea el del servidor. Es esperado, no un bug de datos.
 */
export async function JsonLd({ data }: { data: unknown | unknown[] }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: escapeJsonLd(data) }}
    />
  );
}
