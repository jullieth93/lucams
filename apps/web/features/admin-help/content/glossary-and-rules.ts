import { HELP_LIVE_NUMBERS, formatThousandsEsCo } from "../constants";
import type { AdminQuickRule, AdminRoleMatrixRow, AdminShortcutEntry, HelpConcept } from "../types";

export const ADMIN_QUICK_RULES: AdminQuickRule[] = [
  {
    id: "sla-pqr",
    category: "Legal y posventa",
    label: "PQR generales y reclamos Ley 1581",
    value: `${HELP_LIVE_NUMBERS.pqrBusinessDays} días hábiles`,
    detail:
      "Calculados en reloj de Colombia descontando domingos y festivos oficiales (Ley 1480 art. 58 / Ley 1581 art. 15).",
    route: "/admin/soporte",
  },
  {
    id: "sla-habeas",
    category: "Legal y posventa",
    label: "Consultas de Hábeas Data (Ley 1581)",
    value: `${HELP_LIVE_NUMBERS.habeasConsultationBusinessDays} días hábiles`,
    detail:
      "Plazo más corto del soporte legal (art. 14 Ley 1581): atiéndelas siempre con máxima prioridad.",
    route: "/admin/soporte",
  },
  {
    id: "sla-garantia",
    category: "Legal y posventa",
    label: "Respuesta a reclamos de Garantía legal",
    value: `${HELP_LIVE_NUMBERS.warrantyBusinessDays} días hábiles`,
    detail:
      "Aplica también a productos personalizados cuando presentan defecto de calidad o transporte; envío sin costo para el cliente.",
    route: "/admin/garantias",
  },
  {
    id: "sla-retracto",
    category: "Legal y posventa",
    label: "Retracto (solicitud / reembolso Ley 2439)",
    value: `${HELP_LIVE_NUMBERS.retractWindowBusinessDays}d hábiles / ≤ ${HELP_LIVE_NUMBERS.retractRefundCalendarDays}d calendario`,
    detail:
      "Solo para productos NO personalizados (art. 47 num. 3 Ley 1480). El reembolso corre en días calendario continuos.",
    route: "/admin/retractos",
  },
  {
    id: "mfa-step-up",
    category: "Seguridad y MFA",
    label: "Ventana de reautenticación MFA reciente",
    value: `≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} minutos`,
    detail:
      "Requerida en reembolsos, pagos directos B2B, exportaciones CSV, conciliación/bloqueos COD, fusiones CRM, cupones, fidelización y usuarios.",
    route: "/admin/seguridad",
  },
  {
    id: "sesiones-admin",
    category: "Seguridad y MFA",
    label: "Inactividad de sesión y códigos de respaldo",
    value: `${HELP_LIVE_NUMBERS.adminIdleTimeoutMinutes} min · ${HELP_LIVE_NUMBERS.mfaRecoveryCodesCount} códigos`,
    detail:
      "Todo el panel exige sesión TOTP en nivel AAL2 y cierra sesión tras media hora sin actividad.",
    route: "/admin/seguridad",
  },
  {
    id: "topes-estudio",
    category: "Catálogo y Estudio",
    label: "Topes por tanda en Estudio y compra directa",
    value: `1..${HELP_LIVE_NUMBERS.maxDesignUnits} uds. · hasta ${HELP_LIVE_NUMBERS.maxSelfServicePhysicalUnits} físicas`,
    detail: `Packs de 6: 1..${HELP_LIVE_NUMBERS.maxPhotoPackUnits}; calendarios: 1..${HELP_LIVE_NUMBERS.maxCalendarUnits}; sets de letras: 1..${HELP_LIVE_NUMBERS.maxLetterSetUnits}; máx. ${HELP_LIVE_NUMBERS.maxDesignSlots} ranuras por tanda y renders a ${HELP_LIVE_NUMBERS.printResolutionDpi} DPI.`,
    route: "/admin/productos",
  },
  {
    id: "minimo-b2b",
    category: "Comercial y DIAN",
    label: "Umbral de Oportunidades B2B y Eventos",
    value: `Desde ${HELP_LIVE_NUMBERS.minB2bUnits} unidades`,
    detail:
      "Cotizado con margen BOM en `/propuesta/[token]`, pagable por Wompi o Pago Directo Bre-B/Transferencia (sin Puntos Lucams).",
    route: "/admin/oportunidades",
  },
  {
    id: "tope-fidelizacion",
    category: "Comercial y DIAN",
    label: "Tope anti-abuso Puntos Lucams y prelación",
    value: `≤ ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} % retorno · ${HELP_LIVE_NUMBERS.loyaltyRetroEarnWindowDays}d retro`,
    detail:
      "Orden exacto en carrito: 1° Escala mayorista → 2° Cupón → 3° Puntos sobre subtotal restante (nunca cubre envío).",
    route: "/admin/fidelizacion",
  },
  {
    id: "umbral-dian-cod",
    category: "Comercial y DIAN",
    label: "Vigilancia DIAN y envejecimiento COD",
    value: `${formatThousandsEsCo(HELP_LIVE_NUMBERS.fiscalUvtThreshold)} UVT · COD > ${HELP_LIVE_NUMBERS.codAgingAlertDays}d`,
    detail: `Alertas fiscales al ${HELP_LIVE_NUMBERS.fiscalWatchPct} %, ${HELP_LIVE_NUMBERS.fiscalWarningPct} % y ${HELP_LIVE_NUMBERS.fiscalCriticalPct} % (incluye Wompi + transferencias B2B).`,
    route: "/admin/metricas",
  },
];

export const ADMIN_ROLE_MATRIX: AdminRoleMatrixRow[] = [
  {
    role: "SUPERADMIN",
    roleLabel: "Administradora (Superadmin)",
    piiAccess: "Completa (auditada en bitácora)",
    financialVisibility: "Completa + aprobaciones MFA",
    primaryScope:
      "Gobierno total, usuarios, pagos directos B2B, reembolsos finales, cupones, fidelización, integraciones y auditoría.",
    escalatesToSuperadmin: "Revisión contable/legal externa con contador cuando aplique.",
  },
  {
    role: "OPERATIONS_MANAGER",
    roleLabel: "Jefa de operaciones",
    piiAccess: "Operativa (pedidos, Contacto 360, posventa y marketing)",
    financialVisibility: "Costos BOM, Mayorista y propuestas B2B (sin módulo Finanzas)",
    primaryScope:
      "Coordinación integral: Pedidos, Moderación, Catálogo, Inventario, Materiales, Envíos, B2B, Soporte y Lifecycle.",
    escalatesToSuperadmin:
      "Reembolsos finales, confirmación bancaria Bre-B/Transferencia, cupones, fidelización y salud de infraestructura.",
  },
  {
    role: "MANAGER",
    roleLabel: "Gestora (alias compatible)",
    piiAccess: "Idéntica a Jefa de operaciones",
    financialVisibility: "Costos BOM, Mayorista y propuestas B2B",
    primaryScope: "Alias heredado con la misma matriz operativa de Jefa de operaciones.",
    escalatesToSuperadmin: "Mismas compuertas exclusivas de Superadmin.",
  },
  {
    role: "CUSTOMER_SUPPORT",
    roleLabel: "Atención al cliente",
    piiAccess: "Lectura operativa para atención (sin exportaciones CSV)",
    financialVisibility: "Totales del pedido del cliente atendido (sin Finanzas ni Costos)",
    primaryScope:
      "Soporte PQR/Hábeas Data, Garantías, Retractos (etapas 1–3), Contacto 360, consulta de Pedidos/Reseñas y Carritos.",
    escalatesToSuperadmin:
      "Paso final de desembolso en Retractos/Garantías y cambios de catálogo o envíos.",
  },
  {
    role: "PRINT_WORKSHOP",
    roleLabel: "Taller e impresión",
    piiAccess:
      "Enmascarada en servidor (conserva íntegra la dedicatoria `giftMessage` para imprimir)",
    financialVisibility: "Oculta (sin precios ni desgloses comerciales)",
    primaryScope: "Moderación de diseños, descarga de paquete ZIP 300 DPI y estado En producción.",
    escalatesToSuperadmin:
      "Fallas de `RenderJob`, falta de arte maestro B2B o agotamiento de insumos (vía Operaciones).",
  },
  {
    role: "FULFILLMENT",
    roleLabel: "Despachos",
    piiAccess: "Guía PDF y datos de entrega necesarios (sin ZIP de imprenta)",
    financialVisibility: "Oculta salvo el valor a cobrar en pedidos Contraentrega (COD)",
    primaryScope:
      "Alistamiento físico, modo regalo, impresión de guía térmica y estados Enviado / Entregado.",
    escalatesToSuperadmin: "Errores de emisión de guía Aveonline o rechazos COD en ruta.",
  },
  {
    role: "FINANCE_ANALYST",
    roleLabel: "Analista financiera",
    piiAccess:
      "Enmascarada en servidor (conserva íntegros NIT/cédula, razón social y CUFE para DIAN)",
    financialVisibility:
      "Completa en lectura contable + Conciliación/Bloqueos COD y exportación CSV con MFA",
    primaryScope:
      "Finanzas, Conciliación y Bloqueos COD, Métricas/UVT y auditoría 0-PII de Costos, Mayorista, Posventa, Puntos y Lifecycle.",
    escalatesToSuperadmin:
      "Ejecución de reembolsos finales, confirmación de Pagos Directos B2B y ajustes de tasas/costos.",
  },
  {
    role: "CMS_EDITOR",
    roleLabel: "Editor de contenido",
    piiAccess: "Cero acceso a clientes, pedidos o soporte",
    financialVisibility: "Cero acceso financiero o de catálogo transaccional",
    primaryScope: "Páginas editoriales del CMS, Mediateca y Redirecciones SEO 301/302.",
    escalatesToSuperadmin:
      "Ajustes globales del sitio (`/admin/contenido/paginas/global`), plantillas de correo y redirects externos.",
  },
];

export const ADMIN_SHORTCUTS: AdminShortcutEntry[] = [
  {
    keys: ["?"],
    label: "Abrir o cerrar Ayuda contextual",
    description:
      "Muestra al instante la guía exacta de la pantalla o subruta actual (funciona fuera de campos de escritura).",
  },
  {
    keys: ["⌘K", "Ctrl+K"],
    label: "Paleta rápida de navegación",
    description: "Salta con teclado a cualquier módulo autorizado del panel sin tocar el ratón.",
  },
  {
    keys: ["Esc"],
    label: "Cerrar panel lateral o diálogo",
    description:
      "Cierra el cajón de ayuda contextual, el índice rápido o la paleta de búsqueda devolviendo el foco.",
  },
];

export const SUPPLEMENTAL_GLOSSARY_TERMS: {
  term: string;
  definition: string;
  guideId: string;
}[] = [
  {
    term: "Bre-B / Pago Directo B2B",
    definition:
      "Modalidad de pago corporativo por llave Bre-B o transferencia bancaria en propuestas B2B; requiere confirmación manual de Superadmin con MFA reciente y soporte de retenciones.",
    guideId: "oportunidades",
  },
  {
    term: "Hora Colombia (America/Bogota)",
    definition:
      "Zona horaria canónica (-05:00 sin horario de verano) usada en todos los cortes financieros, vigencias de cupones, horas límite de envío y SLAs legales.",
    guideId: "finanzas",
  },
  {
    term: "RenderJob 300 DPI",
    definition:
      "Trabajo asíncrono en segundo plano que genera los archivos de impresión a sangre en alta resolución y construye el paquete ZIP de Taller.",
    guideId: "pedidos",
  },
  {
    term: "Minimización PII (Ley 1581)",
    definition:
      "Redacción ejecutada en el servidor antes de enviar datos al navegador para que roles como Taller o Finanzas nunca reciban datos personales innecesarios.",
    guideId: "seguridad",
  },
];

export function normalizeGlossaryTermKey(concept: HelpConcept): string {
  return concept.term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .trim();
}
