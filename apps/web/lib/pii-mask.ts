/*
 * Enmascaramiento determinista server-side de PII (S17 · Fase 8).
 *
 * REGLA DE SEGURIDAD MANDATORIA:
 *   El enmascaramiento para perfiles operativos sin capacidad `*:read_pii`
 *   (ej. `PRINT_WORKSHOP`, `FULFILLMENT`, `CMS_EDITOR`) DEBE ejecutarse en el
 *   servidor ANTES de construir el árbol React / serializar el payload RSC.
 *   Prohibido ocultar PII únicamente con CSS o JS en el cliente.
 */

import type { AdminRole } from "@lucams/db";
import { hasCapability } from "@/lib/admin-rbac";

const MASKED_ADDRESS_LINE = "Dirección protegida (ver guía oficial de despacho)";

function maskSegment(seg: string): string {
  const clean = seg.trim();
  if (!clean) return "***";
  if (clean.length === 1) return "*";
  if (clean.length === 2) return `${clean[0]}*`;
  if (clean.length <= 4) return `${clean[0]}***`;
  return `${clean[0]}***${clean[clean.length - 1]}`;
}

/**
 * Enmascara un correo electrónico tanto en usuario como en dominio para no filtrar
 * apellidos en dominios propios (`maria.lopez@lopez.co` -> `m***z@l***.co`).
 */
export function maskEmail(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "—";
  const atIdx = value.indexOf("@");
  if (atIdx <= 0 || atIdx === value.length - 1) {
    return maskSegment(value);
  }
  const local = value.slice(0, atIdx);
  const domainFull = value.slice(atIdx + 1);
  const dotIdx = domainFull.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === domainFull.length - 1) {
    return `${maskSegment(local)}@${maskSegment(domainFull)}`;
  }
  const domainName = domainFull.slice(0, dotIdx);
  const tld = domainFull.slice(dotIdx + 1);
  return `${maskSegment(local)}@${maskSegment(domainName)}.${tld}`;
}

/**
 * Enmascara un número telefónico dejando visibles únicamente los últimos 2 dígitos
 * (`+573001234567` -> `*** *** **67`).
 */
export function maskPhone(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 3) return "***";
  return `*** *** **${digits.slice(-2)}`;
}

/**
 * Enmascara el número de documento tributario/identidad dejando solo los últimos 2 caracteres
 * (`1020304050` -> `******50`).
 */
export function maskDocumentNumber(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "—";
  const clean = value.replace(/\s+/g, "");
  if (clean.length <= 2) return "**";
  return `${"*".repeat(Math.min(6, Math.max(4, clean.length - 2)))}${clean.slice(-2)}`;
}

/**
 * Formatea y enmascara un documento completo (`CC ******50`).
 */
export function maskTaxDocument(
  docType: string | null | undefined,
  docNumber: string | null | undefined,
): string {
  const num = (docNumber ?? "").trim();
  if (!num) return "—";
  const prefix = (docType ?? "").trim();
  const masked = maskDocumentNumber(num);
  return prefix ? `${prefix} ${masked}` : masked;
}

/**
 * Enmascara apellidos de una persona conservando el primer nombre e inicial
 * (`María Camila López Pérez` -> `María L.`).
 */
export function maskPersonName(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "—";
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const secondInitial = parts[parts.length - 1]![0]?.toUpperCase() ?? "";
  return secondInitial ? `${first} ${secondInitial}.` : first;
}

/**
 * Enmascara un snapshot JSON de dirección de envío (`Order.shippingAddress`)
 * preservando ciudad y departamento para contexto logístico general sin exponer
 * dirección exacta, documento, email ni teléfonos.
 */
export function maskShippingAddressSnapshot(snapshot: unknown): Record<string, unknown> {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return {};
  }
  const src = snapshot as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };

  if (typeof src.fullName === "string" && src.fullName.trim()) {
    out.fullName = maskPersonName(src.fullName);
  }
  if (typeof src.email === "string" && src.email.trim()) {
    out.email = maskEmail(src.email);
  }
  if (typeof src.phone === "string" && src.phone.trim()) {
    out.phone = maskPhone(src.phone);
  }
  if (typeof src.altPhone === "string" && src.altPhone.trim()) {
    out.altPhone = maskPhone(src.altPhone);
  }
  if (typeof src.documentNumber === "string" && src.documentNumber.trim()) {
    out.documentNumber = maskDocumentNumber(src.documentNumber);
  }
  if (typeof src.addressLine1 === "string" && src.addressLine1.trim()) {
    out.addressLine1 = MASKED_ADDRESS_LINE;
  }
  if (typeof src.line1 === "string" && src.line1.trim()) {
    out.line1 = MASKED_ADDRESS_LINE;
  }
  if ("addressLine2" in out) {
    out.addressLine2 = undefined;
  }
  if ("neighborhood" in out) {
    out.neighborhood = undefined;
  }
  if ("zip" in out) {
    out.zip = undefined;
  }
  if ("notes" in out && typeof src.notes === "string" && src.notes.trim()) {
    out.notes = "[nota protegida]";
  }
  return out;
}

export type OrderLikeWithPii = {
  email: string;
  phone: string;
  shippingAddress: unknown;
  shippingAddressKey?: string | null;
  notes?: string | null;
  labelPath?: string | null;
  labelUrl?: string | null;
  trackingUrl?: string | null;
  billingDocumentType?: string | null;
  billingDocumentNumber?: string | null;
  billingName?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  giftMessage?: string | null;
  customer?: {
    id?: string;
    email?: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

/**
 * Aplica enmascaramiento server-side sobre un `Order` completo (detalle o listado)
 * cuando el actor administrativo NO posee `orders:read_pii` (ej. `PRINT_WORKSHOP`).
 * Nota operativa:
 *   - `giftMessage` se conserva íntegro porque el taller lo imprime en la tarjeta física.
 *   - `notes` (instrucciones de portería/entrega) y `shippingAddressKey` se protegen.
 *   - `labelPath`, `labelUrl` y `trackingUrl` se anulan salvo para `FULFILLMENT`
 *     (despachos necesita pegar la etiqueta de transporte, pero `PRINT_WORKSHOP` nunca
 *     debe recibir URLs de guías que revelan dirección exacta y teléfono).
 * Si el actor posee `orders:read_pii`, devuelve la referencia intacta.
 */
export function maskOrderForActor<T extends OrderLikeWithPii>(order: T, role: AdminRole): T {
  if (hasCapability(role, "orders:read_pii")) {
    return order;
  }

  const stripCarrierLabelUrls = role !== "FULFILLMENT";

  return {
    ...order,
    email: maskEmail(order.email),
    phone: maskPhone(order.phone),
    shippingAddress: maskShippingAddressSnapshot(order.shippingAddress),
    ...(order.shippingAddressKey !== undefined ? { shippingAddressKey: null } : {}),
    ...(order.notes !== undefined
      ? { notes: order.notes && order.notes.trim() ? "[nota de entrega protegida]" : null }
      : {}),
    ...(stripCarrierLabelUrls && order.labelPath !== undefined ? { labelPath: null } : {}),
    ...(stripCarrierLabelUrls && order.labelUrl !== undefined ? { labelUrl: null } : {}),
    ...(stripCarrierLabelUrls && order.trackingUrl !== undefined ? { trackingUrl: null } : {}),
    ...(order.billingDocumentNumber !== undefined
      ? {
          billingDocumentNumber: order.billingDocumentNumber
            ? maskDocumentNumber(order.billingDocumentNumber)
            : null,
        }
      : {}),
    ...(order.billingName !== undefined
      ? {
          billingName: order.billingName ? maskPersonName(order.billingName) : null,
        }
      : {}),
    ...(order.recipientName !== undefined
      ? {
          recipientName: order.recipientName ? maskPersonName(order.recipientName) : null,
        }
      : {}),
    ...(order.recipientPhone !== undefined
      ? {
          recipientPhone: order.recipientPhone ? maskPhone(order.recipientPhone) : null,
        }
      : {}),
    ...(order.customer !== undefined
      ? {
          customer: order.customer
            ? {
                ...order.customer,
                ...(order.customer.email !== undefined
                  ? { email: maskEmail(order.customer.email) }
                  : {}),
                ...(order.customer.lastName !== undefined
                  ? {
                      lastName: order.customer.lastName
                        ? `${order.customer.lastName.trim().slice(0, 1).toUpperCase()}.`
                        : null,
                    }
                  : {}),
              }
            : null,
        }
      : {}),
  };
}

/**
 * Enmascara una ficha/resumen de `Contact` cuando el actor carece de `contacts:read_pii`.
 */
export function maskContactSummaryForActor<
  T extends {
    displayName?: string | null;
    primaryEmail?: string | null;
    primaryPhoneE164?: string | null;
    documentNumber?: string | null;
  },
>(contact: T, role: AdminRole): T {
  if (hasCapability(role, "contacts:read_pii")) {
    return contact;
  }
  return {
    ...contact,
    displayName: contact.displayName ? maskPersonName(contact.displayName) : null,
    primaryEmail: contact.primaryEmail ? maskEmail(contact.primaryEmail) : null,
    primaryPhoneE164: contact.primaryPhoneE164 ? maskPhone(contact.primaryPhoneE164) : null,
    documentNumber: contact.documentNumber ? maskDocumentNumber(contact.documentNumber) : null,
  };
}
