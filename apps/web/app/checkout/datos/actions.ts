"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { ContactSchema, BillingSchema } from "@/features/checkout/schemas";
import { parseStructuredAddress } from "@/features/checkout/parse-address";
import { saveAddressStep, saveContactStep } from "@/features/checkout/service";

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
      error: "Revisa los datos de contacto",
      fieldErrors: z.flattenError(contactParsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  // ─── Dirección DANE + estructurada (parseo compartido con /mi-cuenta) ───
  const addressParsed = parseStructuredAddress(formData);
  if (!addressParsed.ok) {
    return { error: addressParsed.error, fieldErrors: addressParsed.fieldErrors };
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
      error: "Si quieres factura electrónica, completá los datos de facturación",
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
      addressKind: addressParsed.data.kind,
    });
  } catch (err) {
    // Logger captura stack completo (visible en web.log con stdbuf line-buffer).
    // Al cliente solo retornamos un código sanitizado para no exponer detalles internos.
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = errMsg.includes("CSRF_SECRET")
      ? "config_csrf"
      : errMsg.includes("cookie")
        ? "cookie"
        : errMsg.includes("Prisma")
          ? "db"
          : "unknown";
    logger.error({
      event: "checkout.step.datos.save_fail",
      errCode,
      err: errMsg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return {
      error: `Error al guardar tus datos (cod: ${errCode}). Reintentá o avisanos por WhatsApp.`,
    };
  }

  redirect("/checkout/envio");
}
