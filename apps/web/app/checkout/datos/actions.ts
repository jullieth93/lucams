"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { ContactSchema, AddressSchema, BillingSchema } from "@/features/checkout/schemas";
import { saveAddressStep, saveContactStep } from "@/features/checkout/service";
import { getCityByCode, getDepartmentByCode } from "@/lib/dane-divipola";

export type DatosActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function saveDatosAction(
  _prev: DatosActionState | null,
  formData: FormData,
): Promise<DatosActionState> {
  // ─── Contacto ───
  const contactRaw = {
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    phone: String(formData.get("phone") ?? "").trim(),
    documentType: (formData.get("contactDocumentType") as string) || undefined,
    documentNumber: (formData.get("contactDocumentNumber") as string) || undefined,
  };
  const contactParsed = ContactSchema.safeParse(contactRaw);
  if (!contactParsed.success) {
    return {
      error: "Revisá los datos de contacto",
      fieldErrors: z.flattenError(contactParsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  // ─── Dirección DANE + estructurada ───
  const deptCode = String(formData.get("deptCode") ?? "");
  const cityCode = String(formData.get("cityCode") ?? "");

  // Cross-validate: cityCode debe pertenecer al deptCode + ambos existir
  // en nuestro catálogo (anti-tamper si cliente manipula HTML).
  const dept = getDepartmentByCode(deptCode);
  const city = getCityByCode(cityCode);
  if (!dept || !city || city.deptCode !== deptCode) {
    return {
      error: "Departamento o ciudad inválidos. Por favor seleccioná de la lista.",
      fieldErrors: { cityCode: ["Ciudad no válida"] },
    };
  }

  const addressKind = (formData.get("addressKind") as string) === "rural" ? "rural" : "urban";
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
  const addressParsed = AddressSchema.safeParse(addressRaw);
  if (!addressParsed.success) {
    return {
      error: "Revisá la dirección de envío",
      fieldErrors: z.flattenError(addressParsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  // ─── Facturación opcional ───
  const wantsInvoice = formData.get("wantsInvoice") === "on";
  const billingRaw = {
    wantsInvoice,
    documentType: wantsInvoice
      ? (formData.get("billingDocumentType") as string) || undefined
      : undefined,
    documentNumber: wantsInvoice
      ? (formData.get("billingDocumentNumber") as string) || undefined
      : undefined,
    name: wantsInvoice ? (formData.get("billingName") as string) || undefined : undefined,
  };
  const billingParsed = BillingSchema.safeParse(billingRaw);
  if (!billingParsed.success) {
    return {
      error: "Si querés factura electrónica, completá los datos de facturación",
      fieldErrors: z.flattenError(billingParsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await saveContactStep(contactParsed.data);
    await saveAddressStep(addressParsed.data, billingParsed.data);
    logger.info({
      event: "checkout.step.datos.saved",
      email: contactParsed.data.email,
      city: addressParsed.data.city,
      department: addressParsed.data.department,
    });
  } catch (err) {
    logger.error({
      event: "checkout.step.datos.save_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error al guardar. Reintentá." };
  }

  redirect("/checkout/envio");
}
