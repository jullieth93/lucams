/*
 * Parseo + validación de la dirección ESTRUCTURADA desde un FormData. Fuente
 * ÚNICA para el checkout y para /mi-cuenta/direcciones, así ambos guardan/validan
 * exactamente igual (misma AddressSchema, mismo cross-check DANE) → una dirección
 * guardada se reusa 100% al pagar.
 */

import { z } from "zod";
import { getCityByCode, getDepartmentByCode } from "@/lib/dane-divipola";
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
  const baseFields = {
    deptCode,
    cityCode,
    department: dept.name,
    city: city.name,
    zip: (formData.get("zip") as string)?.trim() || undefined,
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
          detail: (formData.get("detail") as string)?.trim() || undefined,
        }
      : {
          ...baseFields,
          kind: "rural" as const,
          vereda: String(formData.get("vereda") ?? "").trim(),
          finca: (formData.get("finca") as string)?.trim() || undefined,
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

/**
 * Compone la calle legible (line1) a partir de la dirección estructurada — para
 * mostrarla en la lista de direcciones sin re-derivar cada vez.
 */
export function composeAddressLine(a: AddressInput): string {
  if (a.kind === "rural") {
    const parts = [`Vereda ${a.vereda}`];
    if (a.finca) parts.push(`Finca ${a.finca}`);
    return parts.join(" · ");
  }
  const via = [a.viaType, a.viaNumber];
  if (a.viaBis) via.push("Bis");
  if (a.viaCardinal) via.push(a.viaCardinal);
  const cruce = ["#", a.cruceNumber];
  if (a.cruceCardinal) cruce.push(a.cruceCardinal);
  return `${via.join(" ")} ${cruce.join(" ")}`;
}
