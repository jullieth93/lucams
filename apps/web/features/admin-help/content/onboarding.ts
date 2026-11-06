import type { AdminOnboardingGuide } from "../types";

const FIRST_STEPS = [
  {
    id: "bienvenida",
    title: "Conoce tu espacio de trabajo",
    body: "El menú muestra únicamente los módulos permitidos para tu rol. Puedes cambiar de módulo sin perder el acceso al Centro de ayuda.",
    anchor: "navigation" as const,
  },
  {
    id: "ayuda",
    title: "La ayuda siempre está disponible",
    body: "Abre el botón Ayuda para leer la guía de la pantalla actual. También puedes buscar procedimientos y retomar recorridos desde el Centro de ayuda.",
    anchor: "help" as const,
  },
];

const LAST_STEP = {
  id: "practica",
  title: "Aprende antes de ejecutar",
  body: "Los recorridos son opcionales y nunca realizan cambios por ti. Revisa requisitos y precauciones, ejecuta la acción en el módulo y confirma el resultado esperado.",
  anchor: "module" as const,
};

export const ONBOARDING_GUIDES: AdminOnboardingGuide[] = [
  {
    id: "onboarding-superadmin",
    role: "SUPERADMIN",
    title: "Ruta de Dirección",
    summary: "Gobierno del negocio, accesos, configuración, finanzas y control.",
    version: 1,
    moduleIds: ["dashboard", "hoy", "pedidos", "finanzas", "metricas", "usuarios", "seguridad"],
    steps: [
      ...FIRST_STEPS,
      {
        id: "prioridad",
        title: "Revisa dirección y riesgos",
        body: "Comienza por Dashboard y Bandeja Hoy. Contrasta ventas, alertas fiscales, salud técnica y pendientes antes de modificar configuración.",
        anchor: "module" as const,
      },
      {
        id: "control",
        title: "Protege los accesos",
        body: "Asigna el menor rol suficiente, exige MFA y consulta Auditoría ante acciones sensibles. Evita cuentas compartidas y autonegociación.",
        anchor: "module" as const,
      },
      LAST_STEP,
    ],
  },
  {
    id: "onboarding-operations-manager",
    role: "OPERATIONS_MANAGER",
    title: "Ruta de Jefatura de Operaciones",
    summary: "Pedidos, catálogo, producción, clientes, posventa y coordinación diaria.",
    version: 1,
    moduleIds: ["hoy", "pedidos", "inventario", "moderacion", "soporte", "clientes", "envios"],
    steps: [
      ...FIRST_STEPS,
      {
        id: "flujo",
        title: "Coordina el flujo completo",
        body: "Usa Bandeja Hoy para priorizar y Pedidos para verificar pago, moderación, producción y despacho. Cada estado debe reflejar un hecho real.",
        anchor: "module" as const,
      },
      {
        id: "equipo",
        title: "Desbloquea al equipo",
        body: "Revisa stock, diseños, SLAs y envíos en sus módulos de origen. Asigna siguiente paso y responsable en lugar de cerrar pendientes sin resolver.",
        anchor: "module" as const,
      },
      LAST_STEP,
    ],
  },
  {
    id: "onboarding-manager",
    role: "MANAGER",
    title: "Ruta de Gestión",
    summary: "Supervisión comercial y operativa, catálogo, CRM y posventa.",
    version: 1,
    moduleIds: ["dashboard", "hoy", "pedidos", "clientes", "oportunidades", "productos", "soporte"],
    steps: [
      ...FIRST_STEPS,
      {
        id: "gestion",
        title: "Convierte indicadores en acciones",
        body: "Revisa Dashboard y Bandeja Hoy, pero confirma cada desviación en Pedidos, Clientes u Oportunidades antes de actuar.",
        anchor: "module" as const,
      },
      {
        id: "continuidad",
        title: "Conserva la trazabilidad",
        body: "Registra actividades y próximos pasos. Coordina catálogo, producción y posventa sin anticipar estados ni omitir permisos.",
        anchor: "module" as const,
      },
      LAST_STEP,
    ],
  },
  {
    id: "onboarding-customer-support",
    role: "CUSTOMER_SUPPORT",
    title: "Ruta de Atención al Cliente",
    summary: "Pedidos, Contacto 360, soporte, garantías, retractos y seguimiento comercial.",
    version: 1,
    moduleIds: ["pedidos", "clientes", "soporte", "garantias", "retractos", "carritos", "hoy"],
    steps: [
      ...FIRST_STEPS,
      {
        id: "contexto",
        title: "Investiga antes de responder",
        body: "Consulta el pedido, Contacto 360 y el hilo completo. Comunica solo hechos confirmados y protege los datos personales.",
        anchor: "module" as const,
      },
      {
        id: "casos",
        title: "Distingue cada tipo de caso",
        body: "Soporte, garantía y retracto tienen procedimientos distintos. Gestionar un caso no equivale a ejecutar un reembolso; respeta tus capacidades.",
        anchor: "module" as const,
      },
      LAST_STEP,
    ],
  },
  {
    id: "onboarding-print-workshop",
    role: "PRINT_WORKSHOP",
    title: "Ruta de Taller de Impresión",
    summary: "Moderación, pedidos, archivos de producción y estados de fabricación.",
    version: 1,
    moduleIds: ["pedidos", "moderacion", "hoy", "seguridad"],
    steps: [
      ...FIRST_STEPS,
      {
        id: "archivos",
        title: "Verifica antes de imprimir",
        body: "Abre el pedido, revisa variantes y cantidades, confirma diseños aprobados y contrasta el paquete de producción con la ficha.",
        anchor: "module" as const,
      },
      {
        id: "privacidad",
        title: "Trabaja con datos operativos",
        body: "Tu acceso no requiere datos personales del cliente. Usa el número de pedido para escalar diferencias y nunca fabriques por aproximación.",
        anchor: "module" as const,
      },
      LAST_STEP,
    ],
  },
  {
    id: "onboarding-fulfillment",
    role: "FULFILLMENT",
    title: "Ruta de Alistamiento y Despacho",
    summary: "Pedidos, activos, guías, alistamiento y transiciones logísticas.",
    version: 1,
    moduleIds: ["pedidos", "hoy", "seguridad"],
    steps: [
      ...FIRST_STEPS,
      {
        id: "alistar",
        title: "Contrasta el paquete",
        body: "Verifica pedido, ítems, cantidades, producción y guía antes de cerrar el paquete. Usa el número de pedido para cualquier novedad.",
        anchor: "module" as const,
      },
      {
        id: "estados",
        title: "Registra hechos logísticos",
        body: "Cambia a despachado o entregado solo cuando el evento ocurrió. Si la guía falla, conserva el estado y escala sin reintentar a ciegas.",
        anchor: "module" as const,
      },
      LAST_STEP,
    ],
  },
  {
    id: "onboarding-finance-analyst",
    role: "FINANCE_ANALYST",
    title: "Ruta de Analista Financiero",
    summary: "Finanzas, conciliación COD, bloqueos, costos, métricas y exportaciones.",
    version: 1,
    moduleIds: ["finanzas", "conciliacion", "bloqueos", "costos", "metricas", "pedidos", "hoy"],
    steps: [
      ...FIRST_STEPS,
      {
        id: "cortes",
        title: "Verifica períodos y eventos",
        body: "Distingue venta, pago, entrega, remesa y recepción bancaria. Antes de exportar, confirma fechas, estados y totales.",
        anchor: "module" as const,
      },
      {
        id: "evidencia",
        title: "Concilia con evidencia",
        body: "No ajustes diferencias a cero sin soporte. Protege los CSV y trata proyecciones fiscales y márgenes como análisis, no como liquidación.",
        anchor: "module" as const,
      },
      LAST_STEP,
    ],
  },
  {
    id: "onboarding-cms-editor",
    role: "CMS_EDITOR",
    title: "Ruta de Editor de Contenido",
    summary: "Páginas, campos, bloques, borradores, mediateca y publicación.",
    version: 1,
    moduleIds: ["contenido", "ayuda", "seguridad"],
    steps: [
      ...FIRST_STEPS,
      {
        id: "estructura",
        title: "Respeta la estructura editorial",
        body: "Localiza página, sección y campo antes de editar. No cambies claves o tipos: el contenido depende de ellos para aparecer en el sitio.",
        anchor: "module" as const,
      },
      {
        id: "publicar",
        title: "Guardar no es publicar",
        body: "Guarda el borrador, revisa la vista previa en escritorio y móvil, publica y confirma el resultado público después de la renovación de caché.",
        anchor: "module" as const,
      },
      LAST_STEP,
    ],
  },
];
