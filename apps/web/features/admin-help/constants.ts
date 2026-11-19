/*
 * Constantes operativas y legales vivas para el Centro de Ayuda (`ADR-197`).
 *
 * Módulo 100 % puro (sin `server-only` ni acceso a BD) para poder utilizarse tanto
 * en servidor como en pruebas `jsdom`. Los valores cuyos módulos de origen sí usan
 * `server-only` (`EMAIL_TEMPLATE_REGISTRY.length`, `RETROACTIVE_EARN_WINDOW_DAYS`)
 * se verifican automáticamente por contrato en `registry.test.ts`.
 */

import {
  FISCAL_INVOICING_THRESHOLD_UVT,
  FISCAL_LEVEL_RATIOS,
} from "@/features/fiscal-watch/config";
import { MIN_B2B_PHYSICAL_UNITS } from "@/features/opportunities/configurator-math";
import {
  MAX_CALENDAR_DESIGN_UNITS,
  MAX_DESIGN_SLOTS,
  MAX_DESIGN_UNITS,
  MAX_LETTER_SET_UNITS,
  MAX_PHOTO_PACK_DESIGN_UNITS,
  MAX_SELF_SERVICE_PHYSICAL_UNITS,
} from "@/features/personalization/design-units";
import { ADMIN_CAPABILITIES } from "@/lib/admin-rbac";
import { ADMIN_ASSIGNABLE_ROLES, ADMIN_ROLES_ALL } from "@/lib/admin-roles";
import {
  HABEAS_DATA_CLAIM_BUSINESS_DAYS,
  HABEAS_DATA_CONSULTATION_BUSINESS_DAYS,
  MAX_LEGAL_DELIVERY_CALENDAR_DAYS,
  RETRACT_REFUND_MAX_CALENDAR_DAYS,
  RETRACT_WINDOW_BUSINESS_DAYS,
  WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS,
} from "@/lib/consumer-law";

export const HELP_LIVE_NUMBERS = {
  // Roles y RBAC
  totalAdminRoles: ADMIN_ROLES_ALL.length,
  assignableAdminRoles: ADMIN_ASSIGNABLE_ROLES.length,
  totalCapabilities: ADMIN_CAPABILITIES.length,

  // Seguridad de sesión administrativa
  recentMfaMinutes: 10,
  adminIdleTimeoutMinutes: 30,
  minAdminPasswordChars: 10,
  mfaRecoveryCodesCount: 10,

  // Estudio de personalización y compra directa (ADR-209)
  maxDesignUnits: MAX_DESIGN_UNITS,
  maxPhotoPackUnits: MAX_PHOTO_PACK_DESIGN_UNITS,
  maxCalendarUnits: MAX_CALENDAR_DESIGN_UNITS,
  maxLetterSetUnits: MAX_LETTER_SET_UNITS,
  maxDesignSlots: MAX_DESIGN_SLOTS,
  maxSelfServicePhysicalUnits: MAX_SELF_SERVICE_PHYSICAL_UNITS,
  printResolutionDpi: 300,

  // B2B, fidelización y correos (verificados en registry.test.ts contra sus registros server-only)
  minB2bUnits: MIN_B2B_PHYSICAL_UNITS,
  emailTemplateCount: 33,
  authOtpTemplateCount: 2,
  emailTestHourlyLimit: 12,
  loyaltyMaxEffectiveReturnPct: 25,
  loyaltyRetroEarnWindowDays: 30,
  lifecycleAttributionWindowDays: 30,

  // Plazos legales colombianos (Ley 1480, Ley 2439 y Ley 1581)
  pqrBusinessDays: HABEAS_DATA_CLAIM_BUSINESS_DAYS,
  warrantyBusinessDays: WARRANTY_CLAIM_RESPONSE_BUSINESS_DAYS,
  habeasConsultationBusinessDays: HABEAS_DATA_CONSULTATION_BUSINESS_DAYS,
  retractWindowBusinessDays: RETRACT_WINDOW_BUSINESS_DAYS,
  retractRefundCalendarDays: RETRACT_REFUND_MAX_CALENDAR_DAYS,
  maxLegalDeliveryCalendarDays: MAX_LEGAL_DELIVERY_CALENDAR_DAYS,

  // Finanzas, COD y vigilancia fiscal DIAN (ADR-196)
  codAgingAlertDays: 7,
  fiscalUvtThreshold: FISCAL_INVOICING_THRESHOLD_UVT,
  fiscalWatchPct: Math.round(FISCAL_LEVEL_RATIOS.watch * 100),
  fiscalWarningPct: Math.round(FISCAL_LEVEL_RATIOS.warning * 100),
  fiscalCriticalPct: Math.round(FISCAL_LEVEL_RATIOS.critical * 100),
} as const;

export function formatThousandsEsCo(value: number): string {
  return value.toLocaleString("es-CO");
}
