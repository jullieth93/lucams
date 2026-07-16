"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getCurrentCustomer } from "@/lib/auth";
import { ContactSchema, BillingSchema } from "@/features/checkout/schemas";
import { parseStructuredAddress } from "@/features/checkout/parse-address";
import { saveAddressStep, saveContactStep } from "@/features/checkout/service";
import { saveCheckoutAddressToAccount } from "@/features/addresses/service";
import { recordAbandonedCartEmail } from "@/features/cart/recovery-service";

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
      error: "Si quieres factura, completa los datos de facturación",
      fieldErrors: z.flattenError(billingParsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await saveContactStep(contactParsed.data);
    await saveAddressStep(addressParsed.data, billingParsed.data);
    // Palanca de recuperación de carrito (auditoría 2026-07-13): registra el email + genera token
    // de recuperación. Best-effort (tiene su propio try/catch) → nunca rompe el checkout.
    await recordAbandonedCartEmail(contactParsed.data.email);
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
      error: `Error al guardar tus datos (cod: ${errCode}). Reintenta o avísanos por WhatsApp.`,
    };
  }

  // Guardar la dirección en el libro del cliente (opt-in, solo logueados). NUNCA
  // debe romper el checkout: si falla, se loguea y el pago continúa igual.
  if (formData.get("saveToAccount") === "on") {
    try {
      const session = await getCurrentCustomer();
      if (session) {
        const label = String(formData.get("saveAddressLabel") ?? "").trim();
        const result = await saveCheckoutAddressToAccount(session.customer.id, addressParsed.data, {
          name: label || `Mi dirección en ${addressParsed.data.city}`,
          phone: contactParsed.data.phone,
        });
        logger.info({
          event: "checkout.address.saved_to_account",
          customerId: session.customer.id,
          created: result.created,
        });
      }
    } catch (err) {
      logger.error({
        event: "checkout.address.save_to_account_fail",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  redirect("/checkout/envio");
}
