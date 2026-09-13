/*
 * Visibilidad de plantillas — reglas COMPARTIDAS PDP ↔ Estudio (N-08, 2026-09-11).
 *
 * Antes cada consumidor filtraba por su cuenta y las listas podían discrepar: la PDP
 * (`lib/catalog.listTemplatesByProduct`) no filtraba por kind ni aspect, y el Estudio
 * (`service.listTemplatesForKind`) sí. Como el strip de la PDP enlaza al Estudio con
 * `?template=<slug>`, cualquier plantilla visible en la PDP debe resolverse en el
 * Estudio — de ahí que ambos lados usen ESTOS helpers (aspect ratio + preferencia de
 * específicas sobre globales).
 *
 * Helpers puros: sin Prisma ni "server-only", sirven en server components, service
 * layer y tests.
 */

/** Parsea "1:1", "4:5", "7:9" → ratio numérico width/height. */
export function parseAspectRatio(s: string): number | null {
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*[:×x]\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const h = parseFloat(m[2]);
  if (h === 0) return null;
  return parseFloat(m[1]) / h;
}

/** Aspect width/height del stage de la plantilla, o null si no parseable. */
export function templateAspectRatio(canvasData: unknown): number | null {
  if (!canvasData || typeof canvasData !== "object") return null;
  const cd = canvasData as { stage?: { width?: unknown; height?: unknown } };
  const w = typeof cd.stage?.width === "number" ? cd.stage.width : null;
  const h = typeof cd.stage?.height === "number" ? cd.stage.height : null;
  if (w === null || h === null || h === 0) return null;
  return w / h;
}

/**
 * Aspect filter (aterrizado 2026-05-13): solo plantillas cuyo stage matchee el aspect
 * ratio del producto físico (tolerancia 0.05). Sin aspect del producto (o no
 * parseable) no se filtra; una plantilla sin stage parseable se permite (la curaduría
 * manda sobre el dato faltante).
 */
export function filterTemplatesByAspectRatio<T extends { canvasData: unknown }>(
  templates: T[],
  productAspectRatio?: string,
): T[] {
  if (!productAspectRatio) return templates;
  const target = parseAspectRatio(productAspectRatio);
  if (target === null) return templates;
  return templates.filter((t) => {
    const a = templateAspectRatio(t.canvasData);
    if (a === null) return true; // template sin stage parseable → permitir
    return Math.abs(a - target) <= 0.05;
  });
}

/**
 * Ola 19 (Lucy 2026-07-26) — si el producto tiene plantillas ESPECÍFICAS curadas, se
 * usan SOLO esas (no se mezclan con globales del mismo kind); sin específicas, quedan
 * las globales. Sin `productId` no hay preferencia que aplicar.
 */
export function preferProductSpecific<T extends { productId: string | null }>(
  templates: T[],
  productId?: string,
): T[] {
  if (!productId) return templates;
  const specific = templates.filter((t) => t.productId === productId);
  return specific.length > 0 ? specific : templates;
}
