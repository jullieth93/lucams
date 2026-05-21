"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { ContactSchema, AddressSchema, BillingSchema } from "@/features/checkout/schemas";
import { saveAddressStep, saveContactStep } from "@/features/checkout/service";

export type DatosActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function saveDatosAction(
  _prev: DatosActionState | null,
  formData: FormData,
): Promise<DatosActionState> {
  // Contact
  const contactRaw = {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
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

  // Address
  const addressRaw = {
    city: String(formData.get("city") ?? ""),
    department: String(formData.get("department") ?? ""),
    addressLine1: String(formData.get("addressLine1") ?? ""),
    addressLine2: (formData.get("addressLine2") as string) || undefined,
    zip: (formData.get("zip") as string) || undefined,
    notes: (formData.get("notes") as string) || undefined,
  };
  const addressParsed = AddressSchema.safeParse(addressRaw);
  if (!addressParsed.success) {
    return {
      error: "Revisá la dirección de envío",
      fieldErrors: z.flattenError(addressParsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  // Billing (opcional)
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
    logger.info({ event: "checkout.step.datos.saved", email: contactParsed.data.email });
  } catch (err) {
    logger.error({
      event: "checkout.step.datos.save_fail",
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: "Error al guardar. Reintentá." };
  }

  redirect("/checkout/envio");
}
