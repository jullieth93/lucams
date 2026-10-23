/*
 * resolveBootTemplate — plantilla de arranque de un draft NUEVO (5.1, owner
 * 2026-10-22): NINGUNA plantilla queda seleccionada por defecto.
 *
 * El lienzo necesita geometría para dibujarse desde el primer render (stage,
 * layers, rect del placeholder), así que SIEMPRE se devuelve una plantilla de
 * geometría (la primera de la lista visible). Pero la SELECCIÓN
 * (`selectedTemplateId`) es otra cosa: es la elección del cliente y el
 * checklist «Tu diseño» la exige como primer paso — con >1 plantillas arranca
 * en null y el paso «Elige tu plantilla» queda pendiente hasta que toque una.
 *
 * Casos:
 *  (a) Deep-link `?template=` de la PDP (`initialTemplateId` ya validado en
 *      page.tsx contra la lista visible): cuenta como elección EXPLÍCITA →
 *      seleccionada desde el boot.
 *  (b) `templates.length === 1`: la elección es trivial → se auto-selecciona
 *      (fricción sin beneficio; el paso del checklist tampoco aplica).
 *  (c) Resto: geometría = templates[0], selección = null.
 *
 * El recover (?designId=) NO pasa por acá: la plantilla persistida del diseño
 * manda (studio-editor), con el match por dimensiones como fallback legacy.
 */

import type { StudioTemplate } from "../types";

export type BootTemplateResolution = {
  /** Plantilla cuya geometría (canvasData) dibuja el lienzo al arrancar. */
  geometry: StudioTemplate | undefined;
  /** Elección del cliente para `selectedTemplateId`; null = aún sin elegir. */
  templateId: string | null;
};

export function resolveBootTemplate(
  templates: StudioTemplate[],
  initialTemplateId?: string | null,
): BootTemplateResolution {
  const geometry = templates[0];
  if (initialTemplateId) {
    const explicit = templates.find((t) => t.id === initialTemplateId);
    if (explicit) return { geometry: explicit, templateId: explicit.id };
  }
  if (templates.length === 1 && geometry) {
    return { geometry, templateId: geometry.id };
  }
  return { geometry, templateId: null };
}
