/*
 * Overrides editables de plantillas de email (módulo /admin/email-templates,
 * Fase 4 — feedback Lucy 2026-09-18: "quiero ver TODAS las plantillas y editar
 * los textos clave sin tocar código").
 *
 * Modelo: el copy base sigue en código (features/emails/templates/*.ts — mezcla
 * variables, layout inline-style y texto de cumplimiento; un HTML libre editable
 * rompería clientes de correo, mismo criterio que la Ruta A del newsletter).
 * Encima vive EmailTemplateOverride (Prisma): una fila por (templateId, key)
 * con el texto que Lucy editó. Las keys acotadas son:
 *   - SUBJECT   → asunto del correo
 *   - PREHEADER → texto del preview pane de Gmail/Apple Mail (el <div> oculto
 *                 que inyecta renderEmailLayout)
 *   - HEADING   → titular principal (primer <h1> del body)
 *
 * Consumo SISTEMÁTICO (sin reescribir las 26 plantillas): el wrapper
 * `withOverrides(templateId, render)` post-procesa el {subject, html} que
 * devuelve la plantilla — reemplaza el subject, el contenido del div oculto
 * de preview y el primer <h1>. El registry (features/emails/registry.ts)
 * envuelve TODAS las plantillas con él: el módulo admin lo usa para el
 * preview y "Enviarme una prueba", y los senders productivos importan las
 * funciones `render*` del registry → los overrides aplican a los ENVÍOS
 * REALES con el mismo fallback total.
 * El texto plano `text` NO se toca: el subject no se repite dentro del body
 * plano y el preheader solo existe en HTML.
 *
 * Fallbacks (REGLA DE ORO del CMS): sin fila en DB → texto base del código;
 * DB caída → texto base; override vacío → se borra la fila (la action lo
 * hace) y vuelve el base. Un override NUNCA rompe un envío transaccional.
 *
 * Tokens: los overrides admiten `{campo}` (ej. "Pedido {orderNumber}
 * confirmado 🎉") interpolado con los escalares top-level del `data` del
 * render — sin esto, un subject editado perdería el número de pedido.
 * Token desconocido o no escalar → queda literal, visible para el admin.
 *
 * Cache: mismo patrón que lib/cms — unstable_cache con tag propio
 * "email-overrides" + fallback crudo cuando no hay incrementalCache (vitest,
 * scripts). Las Server Actions del módulo invalidan con updateTag al guardar.
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { escapeHtml } from "./layout";

export const EMAIL_OVERRIDE_KEYS = ["SUBJECT", "PREHEADER", "HEADING"] as const;
export type EmailOverrideKey = (typeof EMAIL_OVERRIDE_KEYS)[number];

export const EMAIL_OVERRIDE_KEY_LABEL: Record<EmailOverrideKey, string> = {
  SUBJECT: "Asunto",
  PREHEADER: "Preheader (preview en la bandeja)",
  HEADING: "Titular principal",
};

export type EmailOverrideMap = Partial<Record<EmailOverrideKey, string>>;

/**
 * `unstable_cache` con degradación grácil sin `incrementalCache` de Next
 * (vitest, scripts standalone) — réplica del patrón cachedCms de lib/cms:
 * en Next 16 llamar unstable_cache fuera de un request lanza el invariante
 * E469; capturamos SOLO ese invariante y ejecutamos la función cruda.
 */
function cachedOverrides<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
): (...args: A) => Promise<R> {
  const cached = unstable_cache(fn, keyParts, {
    tags: ["email-overrides"],
    revalidate: 3600,
  });
  return async (...args: A): Promise<R> => {
    try {
      return await cached(...args);
    } catch (err) {
      const code = (err as { __NEXT_ERROR_CODE?: string } | null)?.__NEXT_ERROR_CODE;
      const missingCache =
        code === "E469" || (err instanceof Error && err.message.includes("incrementalCache"));
      if (missingCache) return fn(...args);
      throw err;
    }
  };
}

/**
 * Lee todos los overrides de una plantilla. Devuelve {} si no hay filas o si
 * la DB falla — el caller siempre puede caer al copy base (fallback pattern).
 */
export const getEmailOverrides = cachedOverrides(
  async (templateId: string): Promise<EmailOverrideMap> => {
    try {
      const rows = await prisma.emailTemplateOverride.findMany({
        where: { templateId },
        select: { key: true, value: true },
      });
      const map: EmailOverrideMap = {};
      for (const row of rows) {
        if ((EMAIL_OVERRIDE_KEYS as readonly string[]).includes(row.key) && row.value.trim()) {
          map[row.key as EmailOverrideKey] = row.value;
        }
      }
      return map;
    } catch {
      // DB unreachable (build con placeholder, network blip) → copy base.
      return {};
    }
  },
  ["email-template-overrides"],
);

/**
 * Helper directo con fallback: `await getEmailOverride("order-confirmation", "SUBJECT", base)`.
 */
export async function getEmailOverride(
  templateId: string,
  key: EmailOverrideKey,
  fallback: string,
): Promise<string> {
  const overrides = await getEmailOverrides(templateId);
  return overrides[key] ?? fallback;
}

/**
 * Interpola tokens `{campo}` con los escalares (string/number) top-level del
 * data del render. Token inexistente o no escalar queda literal ({campo}) —
 * visible en el preview para que el admin corrija.
 */
export function interpolateOverrideTokens(template: string, data: unknown): string {
  if (!data || typeof data !== "object") return template;
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (raw, key: string) => {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return raw;
  });
}

// El div oculto de preview que inyecta renderEmailLayout (layout.ts). El
// estilo inline es estable — es el contrato entre layout y este wrapper.
const PREHEADER_DIV_RE =
  /(<div style="display:none;max-height:0;overflow:hidden;font-size:0;line-height:0;color:transparent;mso-hide:all;">)[^]*?(<\/div>)/;

/** Reemplaza el texto del preheader oculto. Sin div (template sin preview) → html intacto. */
export function replacePreheader(html: string, preheader: string): string {
  return html.replace(PREHEADER_DIV_RE, `$1${escapeHtml(preheader)}$2`);
}

/** Reemplaza el contenido del primer <h1> (titular principal), conservando sus estilos inline. */
export function replaceHeading(html: string, heading: string): string {
  return html.replace(/<h1([^>]*)>[^]*?<\/h1>/, `<h1$1>${escapeHtml(heading)}</h1>`);
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/**
 * Extrae el preheader actual de un HTML renderizado (para mostrarlo en el
 * admin). Devuelve null si la plantilla no pasa `preview` al layout.
 */
export function extractPreheader(html: string): string | null {
  const match = html.match(PREHEADER_DIV_RE);
  if (!match) return null;
  return unescapeHtml(
    html.slice(match.index! + match[1].length, match.index! + match[0].length - match[2].length),
  );
}

/**
 * Extrae el titular actual (contenido del primer <h1>) de un HTML renderizado.
 * Devuelve null si la plantilla no tiene <h1>.
 */
export function extractHeading(html: string): string | null {
  const match = html.match(/<h1[^>]*>([^]*?)<\/h1>/);
  if (!match) return null;
  return unescapeHtml(match[1]);
}

function unescapeHtml(s: string): string {
  return s.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

/**
 * Wrapper del registry: envuelve la función de una plantilla para que el
 * resultado respete los overrides editados en /admin/email-templates, con
 * fallback total al copy base (sin overrides o error de DB → resultado
 * original intacto).
 */
export function withOverrides<TData, TResult extends { subject: string; html: string }>(
  templateId: string,
  render: (data: TData) => Promise<TResult>,
): (data: TData) => Promise<TResult> {
  return async (data: TData): Promise<TResult> => {
    const result = await render(data);
    const overrides = await getEmailOverrides(templateId);
    if (!overrides.SUBJECT && !overrides.PREHEADER && !overrides.HEADING) return result;

    let { subject, html } = result;
    if (overrides.SUBJECT) subject = interpolateOverrideTokens(overrides.SUBJECT, data);
    if (overrides.PREHEADER) {
      html = replacePreheader(html, interpolateOverrideTokens(overrides.PREHEADER, data));
    }
    if (overrides.HEADING) {
      html = replaceHeading(html, interpolateOverrideTokens(overrides.HEADING, data));
    }
    return { ...result, subject, html };
  };
}
