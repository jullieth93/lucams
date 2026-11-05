/*
 * Catálogo tipado y etiquetas client-safe para el motor transversal de actividades
 * (`ContactActivity`) y tareas (`Task`) del CRM operativo (`Fase 10 · S22`).
 */

export const CONTACT_ACTIVITY_KINDS = ["NOTE", "CALL", "WHATSAPP", "EMAIL", "SYSTEM"] as const;
export type ContactActivityKind = (typeof CONTACT_ACTIVITY_KINDS)[number];

export const MANUAL_ACTIVITY_KINDS = ["NOTE", "CALL", "WHATSAPP", "EMAIL"] as const;
export type ManualActivityKind = (typeof MANUAL_ACTIVITY_KINDS)[number];

export const CONTACT_ACTIVITY_LABELS: Record<ContactActivityKind, string> = {
  NOTE: "Nota interna",
  CALL: "Llamada",
  WHATSAPP: "WhatsApp",
  EMAIL: "Correo manual",
  SYSTEM: "Sistema",
};

export const CONTACT_ACTIVITY_TONES: Record<
  ContactActivityKind,
  "purple" | "blue" | "emerald" | "amber" | "slate"
> = {
  NOTE: "purple",
  CALL: "blue",
  WHATSAPP: "emerald",
  EMAIL: "amber",
  SYSTEM: "slate",
};

export const CRM_TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number];

export const CRM_TASK_STATUS_LABELS: Record<CrmTaskStatus, string> = {
  OPEN: "Pendiente",
  IN_PROGRESS: "En curso",
  DONE: "Completada",
  CANCELLED: "Cancelada",
};

export const CRM_TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type CrmTaskPriority = (typeof CRM_TASK_PRIORITIES)[number];

export const CRM_TASK_PRIORITY_LABELS: Record<CrmTaskPriority, string> = {
  LOW: "Baja",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const CRM_TASK_PRIORITY_TONES: Record<
  CrmTaskPriority,
  "slate" | "purple" | "amber" | "rose"
> = {
  LOW: "slate",
  NORMAL: "purple",
  HIGH: "amber",
  URGENT: "rose",
};

export function isContactActivityKind(value: string): value is ContactActivityKind {
  return (CONTACT_ACTIVITY_KINDS as readonly string[]).includes(value);
}

export function isManualActivityKind(value: string): value is ManualActivityKind {
  return (MANUAL_ACTIVITY_KINDS as readonly string[]).includes(value);
}

export function isCrmTaskStatus(value: string): value is CrmTaskStatus {
  return (CRM_TASK_STATUSES as readonly string[]).includes(value);
}

export function isCrmTaskPriority(value: string): value is CrmTaskPriority {
  return (CRM_TASK_PRIORITIES as readonly string[]).includes(value);
}
