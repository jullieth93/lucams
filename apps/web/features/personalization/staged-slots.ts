import "server-only";

/*
 * Área de paso de los snapshots del cliente (ADR-081).
 *
 * Cuando ningún tier server-side reproduce un diseño con fidelidad (hoy solo el marco SVG de la
 * Polaroid), el navegador sube los PNG de imprenta DIRECTO a Storage con una URL firmada, bajo el
 * prefijo `{designId}/_client/`. `finalizeDesign` los recoge de ahí y borra el prefijo.
 *
 * Estas rutas viven en un módulo aparte porque hay TRES dueños, no uno: el finalize las limpia en el
 * camino feliz, pero si el cliente abandona tras subirlas —cierra la pestaña, se le va el internet—
 * nadie más las conocía. No se persisten en ninguna columna (`Design.productionUrls` solo guarda los
 * archivos definitivos), así que ni la purga por retención ni el borrado de cuenta las veían y los
 * bytes quedaban en el bucket para siempre.
 *
 * No es un detalle de higiene: esos PNG son el render de las FOTOS del cliente, o sea datos
 * personales, y conservarlos más allá de la finalidad autorizada contradice el principio de
 * temporalidad de la Ley 1581 de 2012 (Decreto 1074 de 2015, art. 2.2.2.25.2.8).
 */

import { supabaseService } from "@/lib/supabase/service";

export const CLIENT_SLOT_PREFIX = "_client";

export function stagedSlotPath(designId: string, slotIndex: number): string {
  return `${designId}/${CLIENT_SLOT_PREFIX}/slot-${String(slotIndex + 1).padStart(2, "0")}.png`;
}

/**
 * Rutas que hay en el área de paso de estos diseños, listadas de verdad contra Storage.
 *
 * Se listan en vez de reconstruirlas porque la cantidad de slots no se conoce al purgar: el diseño
 * puede haberse quedado a medias, o su canvasData puede haber cambiado desde que se emitieron las
 * URLs. Best-effort: un fallo al listar devuelve lo que se pudo, nunca rompe la purga.
 */
export async function listStagedSlotPaths(bucket: string, designIds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of designIds) {
    const { data, error } = await supabaseService.storage
      .from(bucket)
      .list(`${id}/${CLIENT_SLOT_PREFIX}`);
    if (error || !data) continue;
    for (const f of data) out.push(`${id}/${CLIENT_SLOT_PREFIX}/${f.name}`);
  }
  return out;
}
