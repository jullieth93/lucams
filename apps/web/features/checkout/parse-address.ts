/*
 * Parseo + validación de la dirección ESTRUCTURADA desde un FormData. Fuente
 * ÚNICA para el checkout y para /mi-cuenta/direcciones, así ambos guardan/validan
 * exactamente igual (misma AddressSchema, mismo cross-check DANE) → una dirección
 * guardada se reusa 100% al pagar.
 */

import { z } from "zod";
import { getCityByCode, getDepartmentByCode } from "@/lib/dane-divipola";
import { isValidZone } from "@/lib/lucams-zones";
import { stripPhone } from "@/lib/colombia-validators";
import { DESTINATION_TYPE_ERROR } from "./destination-types";
import { AddressSchema, type AddressInput } from "./schemas";

export type ParsedStructuredAddress =
  | { ok: true; data: AddressInput; deptName: string; cityName: string }
  | { ok: false; error: string; fieldErrors: Record<string, string[]> };

export function parseStructuredAddress(formData: FormData): ParsedStructuredAddress {
  const deptCode = String(formData.get("deptCode") ?? "");
  const cityCode = String(formData.get("cityCode") ?? "");

  // Cross-validate contra el catálogo DANE (anti-tamper).
  const dept = getDepartmentByCode(deptCode);
  const city = getCityByCode(cityCode);
  if (!dept || !city || city.deptCode !== deptCode) {
    return {
      ok: false,
      error: "Departamento o ciudad inválidos. Por favor selecciona de la lista.",
      fieldErrors: { cityCode: ["Ciudad no válida"] },
    };
  }

  const addressKind = String(formData.get("addressKind") ?? "") === "rural" ? "rural" : "urban";
  // Tipo de destino (2026-10, anti-devoluciones): OPCIONAL en el schema para
  // que las direcciones viejas sigan parseando, pero OBLIGATORIO en toda
  // captura urbana nueva (el form lo pide; acá se re-valida anti-tamper).
  const destinationTypeRaw = String(formData.get("destinationType") ?? "").trim();
  if (addressKind === "urban" && !destinationTypeRaw) {
    return {
      ok: false,
      error: "Revisa la dirección de envío.",
      fieldErrors: { destinationType: [DESTINATION_TYPE_ERROR] },
    };
  }
  // Zona de entrega: solo se conserva si la ciudad está en el catálogo de zonas
  // y el id es válido para ESA ciudad (anti-tamper; fuera del catálogo se
  // descarta en silencio). Es dato de dirección — su obligatoriedad la aplica
  // el caller (saveDatosAction), no las settings del envío propio.
  const localityRaw = String(formData.get("localityId") ?? "").trim();
  const localityId = isValidZone(cityCode, localityRaw) ? localityRaw : undefined;
  const baseFields = {
    deptCode,
    cityCode,
    department: dept.name,
    city: city.name,
    zip: (formData.get("zip") as string)?.trim() || undefined,
    localityId,
    neighborhood: (formData.get("neighborhood") as string)?.trim() || undefined,
    notes: (formData.get("notes") as string)?.trim() || undefined,
  };
  const addressRaw =
    addressKind === "urban"
      ? {
          ...baseFields,
          kind: "urban" as const,
          viaType: String(formData.get("viaType") ?? "Calle"),
          viaNumber: String(formData.get("viaNumber") ?? "")
            .trim()
            .toUpperCase(),
          viaBis: formData.get("viaBis") === "on",
          viaCardinal: (formData.get("viaCardinal") as string) || "",
          cruceNumber: String(formData.get("cruceNumber") ?? "")
            .trim()
            .toUpperCase(),
          cruceCardinal: (formData.get("cruceCardinal") as string) || "",
          // Campos estructurados por tipo de destino (2026-10). La
          // obligatoriedad por tipo la aplica el superRefine del schema.
          destinationType: destinationTypeRaw || undefined,
          apartment: (formData.get("apartment") as string)?.trim() || undefined,
          tower: (formData.get("tower") as string)?.trim() || undefined,
          houseNumber: (formData.get("houseNumber") as string)?.trim() || undefined,
          blockCode: (formData.get("blockCode") as string)?.trim() || undefined,
          complexName: (formData.get("complexName") as string)?.trim() || undefined,
          floor: (formData.get("floor") as string)?.trim() || undefined,
          buildingName: (formData.get("buildingName") as string)?.trim() || undefined,
          officeNumber: (formData.get("officeNumber") as string)?.trim() || undefined,
          companyName: (formData.get("companyName") as string)?.trim() || undefined,
          referencePoint: (formData.get("referencePoint") as string)?.trim() || undefined,
          detail: (formData.get("detail") as string)?.trim() || undefined,
        }
      : {
          ...baseFields,
          kind: "rural" as const,
          vereda: String(formData.get("vereda") ?? "").trim(),
          finca: (formData.get("finca") as string)?.trim() || undefined,
          // stripPhone normaliza (quita espacios y un eventual indicativo 57);
          // la PHONE_REGEX del schema es la validación final.
          altPhone: stripPhone(String(formData.get("altPhone") ?? "")) || undefined,
          referencia: String(formData.get("referencia") ?? "").trim(),
        };

  const parsed = AddressSchema.safeParse(addressRaw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa la dirección de envío.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  return { ok: true, data: parsed.data, deptName: dept.name, cityName: city.name };
}

// composeAddressLine (line1 legible) vive en features/checkout/schemas.ts — se
// reusa esa versión canónica (la que arma la dirección para Aveonline) para que
// el display de la cuenta coincida EXACTO con la dirección de envío.
