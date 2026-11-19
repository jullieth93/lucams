import { HELP_LIVE_NUMBERS, formatThousandsEsCo } from "../constants";
import type { AdminDailyRoutine } from "../types";

const OPERATIONS_ROUTINE_BASE = {
  mission:
    "Orquestar el flujo diario completo desde pedido pagado hasta entrega, sosteniendo SLAs legales de posventa, costos BOM actualizados, propuestas B2B rentables y coordinación entre Taller, Despachos y Soporte.",
  privacyScope:
    "Ves datos comerciales y de contacto necesarios para operar pedidos, Contacto 360, B2B y marketing con opt-in; las aprobaciones finales de salida de efectivo, confirmaciones bancarias Bre-B/Transferencia y auditoría forense pertenecen exclusivamente a Superadmin.",
  escalateWhen: [
    "Un retracto con bien recibido o una garantía aprobada requiera devolución final de dinero.",
    "Un cliente B2B reporte soporte de Pago Directo (Bre-B / Transferencia) para confirmar abono en banco y retenciones.",
    "Falle la autenticación global de Aveonline, Wompi o Resend y se requiera revisar Integraciones u Observabilidad.",
    "Una propuesta B2B requiera excepcionalmente precio inferior al costo BOM.",
  ],
  dontTouch: [
    "No desactives simultáneamente todas las transportadoras de Aveonline y Envío Lucams en /admin/envios.",
    "No prometas al cliente un reembolso ejecutado antes de que Superadmin lo selle con MFA.",
    "No crees variantes multi-pack para descuentos de volumen: usa siempre /admin/mayorista.",
  ],
  blocks: [
    {
      id: "apertura",
      windowLabel: "1. Apertura de jornada",
      title: "Priorizar riesgos legales y destrabar Taller",
      items: [
        {
          label: "Barrer vencimientos y alertas del día",
          detail:
            "Revisa SLAs próximos a vencer, bloqueos de arte B2B y tareas vencidas del equipo.",
          route: "/admin/hoy",
        },
        {
          label: "Despejar la cola de Moderación",
          detail:
            "Aprueba o rechaza con motivo claro los diseños pendientes para alimentar a Taller.",
          route: "/admin/moderacion",
        },
        {
          label: "Chequear pulso comercial y conversión",
          detail: "Detecta caídas atípicas en el embudo antes de iniciar actividad promocional.",
          route: "/admin/dashboard",
        },
      ],
    },
    {
      id: "precorte",
      windowLabel: "2. Antes de la hora de corte logístico",
      title: "Asegurar fabricación 300 DPI y salida de guías",
      items: [
        {
          label: "Supervisar órdenes listas para producir y despachar",
          detail:
            "Verifica que los pedidos pagados avancen sin bloqueos y carga artes maestros 300 DPI en órdenes B2B cuando aplique.",
          route: "/admin/pedidos",
        },
        {
          label: "Revisar existencias físicas y materia prima",
          detail:
            "Comprueba agotados en Inventario (stock físico) y alertas de bajo stock en Materiales de taller.",
          route: "/admin/materiales",
        },
      ],
    },
    {
      id: "continuo",
      windowLabel: "3. Ejecución comercial y posventa",
      title: "Oportunidades B2B, casos legales y catálogo",
      items: [
        {
          label: "Emitir propuestas B2B y dar seguimiento",
          detail: `Cotiza solicitudes desde ${HELP_LIVE_NUMBERS.minB2bUnits} unidades cuidando margen BOM y fecha objetivo.`,
          route: "/admin/oportunidades",
        },
        {
          label: "Supervisar SLAs en Soporte, Garantías y Retractos",
          detail: "Desbloquea casos complejos y escala a Superadmin los listos para reembolso.",
          route: "/admin/soporte",
        },
        {
          label: "Sincronizar Costos BOM y Escalas Mayoristas",
          detail:
            "Valida que ningún producto activo quede sin costo o con margen en pérdida tras cambios de insumos.",
          route: "/admin/costos",
        },
      ],
    },
    {
      id: "cierre",
      windowLabel: "4. Cierre de turno",
      title: "Dejar bandejas limpias y trazabilidad 360",
      items: [
        {
          label: "Moderar reseñas nuevas y atender críticas 1★–2★",
          detail:
            "Publica opiniones auténticas y abre seguimiento privado ante malas experiencias.",
          route: "/admin/resenas",
        },
        {
          label: "Confirmar cero SLAs vencidos en Bandeja Hoy",
          detail: "Reprograma con nota real cualquier tarea pendiente y limpia tus notificaciones.",
          route: "/admin/hoy",
        },
      ],
    },
  ],
  recommendedPlaybookIds: [
    "playbook-pedido-web-300dpi",
    "playbook-oportunidad-b2b-cierre",
    "playbook-posventa-ley-1480-1581",
    "playbook-economia-bom-precios-promos",
    "playbook-catalogo-estudio-lanzamiento",
  ],
};

export const DAILY_ROUTINES: AdminDailyRoutine[] = [
  {
    role: "SUPERADMIN",
    mission:
      "Gobernar seguridad, flujo de caja real, aprobaciones protegidas con MFA (pagos directos B2B, reembolsos finales, cupones, fidelización, usuarios), salud técnica sin Sentry y vigilancia tributaria DIAN.",
    privacyScope:
      "Acceso completo auditado en AdminActionLog. Recuerda: nunca gestiones reembolsos, moderaciones ni fusiones sobre pedidos asociados a tu propio correo (dispara alerta `selfDealing`).",
    escalateWhen: [
      `El acumulado o proyección anual en Métricas supere el ${HELP_LIVE_NUMBERS.fiscalWatchPct} % o ${HELP_LIVE_NUMBERS.fiscalWarningPct} % de las ${formatThousandsEsCo(HELP_LIVE_NUMBERS.fiscalUvtThreshold)} UVT → coordinar con contador y proveedor tecnológico DIAN.`,
      "Aparezcan discrepancias reiteradas en liquidaciones de transportadora → reclamo formal con planillas de Conciliación COD.",
    ],
    dontTouch: [
      "Nunca compartas tu sesión Superadmin ni asignes rol Superadmin cuando basta Jefa de operaciones.",
      "Nunca apruebes un Pago Directo B2B ni un reembolso de Retracto/Garantía sin contrastar primero el movimiento real en el banco o Wompi.",
      "Nunca ignores una alerta de respaldo R2 vencido o rebote elevado en Salud técnica.",
    ],
    blocks: [
      {
        id: "apertura",
        windowLabel: "1. Apertura ejecutiva (5–10 min)",
        title: "Salud técnica, riesgos legales y caja por confirmar",
        items: [
          {
            label: "Revisar Salud técnica y crons vigilados",
            detail: "Comprueba latidos de renders, backups R2, entregabilidad Resend y webhooks.",
            route: "/admin/observability",
          },
          {
            label: "Priorizar alertas críticas y vigilancia DIAN en Bandeja Hoy",
            detail: "Identifica SLAs legales en riesgo, remesas envejecidas y avisos fiscales.",
            route: "/admin/hoy",
          },
          {
            label: "Confirmar Pagos Directos B2B reportados (con MFA)",
            detail:
              "Valida en banco transferencias/Bre-B, registra retenciones practicadas y libera órdenes a Taller.",
            route: "/admin/pedidos",
          },
        ],
      },
      {
        id: "precorte",
        windowLabel: "2. Media mañana / Pre-corte",
        title: "Desembolsos posventa y desbloqueo comercial",
        items: [
          {
            label: "Ejecutar reembolsos finales de Retractos listos",
            detail: `Devuelve dentro del tope legal de ${HELP_LIVE_NUMBERS.retractRefundCalendarDays} días calendario y sella con MFA.`,
            route: "/admin/retractos",
          },
          {
            label: "Cerrar Garantías aprobadas por devolución de dinero",
            detail: "Verifica reversión bancaria/Wompi antes de marcar Resuelta con MFA.",
            route: "/admin/garantias",
          },
          {
            label: "Revisar pipeline B2B de alto valor",
            detail: "Destraba negociaciones especiales y verifica márgenes sobre BOM.",
            route: "/admin/oportunidades",
          },
        ],
      },
      {
        id: "continuo",
        windowLabel: "3. Control financiero y crecimiento",
        title: "Conciliación COD, márgenes e incentivos",
        items: [
          {
            label: "Conciliar remesas COD y evaluar bloqueos antifraude",
            detail: `Cruza planillas de transportadora priorizando entregas > ${HELP_LIVE_NUMBERS.codAgingAlertDays} días.`,
            route: "/admin/finanzas/conciliacion",
          },
          {
            label: "Auditar Costos, Mayorista, Cupones y Fidelización",
            detail: `Valida pasivo de puntos (tope ≤ ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} %) y campañas activas.`,
            route: "/admin/fidelizacion",
          },
        ],
      },
      {
        id: "cierre",
        windowLabel: "4. Cierre y gobierno semanal",
        title: "Finanzas, umbrales UVT y bitácora forense",
        items: [
          {
            label: "Revisar puente de caja en Finanzas y corte DIAN",
            detail: "Contrasta ingresos Wompi, B2B neto de retenciones y efectivo COD.",
            route: "/admin/finanzas",
          },
          {
            label: "Inspeccionar Auditoría y eventos bloqueados",
            detail:
              "Revisa acciones sensibles del equipo, marcas `selfDealing` y accesos vigentes.",
            route: "/admin/auditoria",
          },
        ],
      },
    ],
    recommendedPlaybookIds: [
      "playbook-oportunidad-b2b-cierre",
      "playbook-incidentes-seguridad-dian",
      "playbook-cod-conciliacion-bloqueos",
      "playbook-posventa-ley-1480-1581",
      "playbook-economia-bom-precios-promos",
    ],
  },
  {
    role: "OPERATIONS_MANAGER",
    ...OPERATIONS_ROUTINE_BASE,
  },
  {
    role: "MANAGER",
    ...OPERATIONS_ROUTINE_BASE,
  },
  {
    role: "CUSTOMER_SUPPORT",
    mission:
      "Responder con calidez, exactitud y estricto apego a la Ley 1480/2439/1581 cada consulta PQR, solicitud Hábeas Data, garantía o retracto, apoyándose en el contexto real de Pedido y Contacto 360.",
    privacyScope:
      "Tienes acceso de lectura a PII de clientes para poder identificarlos y ayudarlos; está prohibido exportar bases, copiar datos fuera del panel o prometer desembolsos aún no ejecutados por Dirección.",
    escalateWhen: [
      "Un retracto ya tenga recepción física confirmada en bodega (`Bien recibido`) para que Superadmin ejecute el reembolso con MFA.",
      "Una garantía solo pueda resolverse mediante devolución de dinero.",
      "Un pedido presente bloqueo técnico de render o falla de integración logística en Aveonline.",
      "Entre una solicitud legal compleja de supresión total Ley 1581 con pedidos contables activos.",
    ],
    dontTouch: [
      "Jamás escribas apuntes internos estando seleccionada la opción «Respuesta pública» (saldría por correo al cliente).",
      "Jamás envíes una sugerencia del Copiloto IA sin verificar cada fecha, estado y plazo contra el pedido real.",
      "Jamás rechaces una garantía diciendo que los personalizados no tienen garantía (solo están excluidos de retracto).",
    ],
    blocks: [
      {
        id: "apertura",
        windowLabel: "1. Apertura de turno",
        title: "Atacar relojes legales críticos primero",
        items: [
          {
            label: "Revisar vencidos y próximos a vencer en Bandeja Hoy",
            detail: "Identifica casos con menos de 48 horas hábiles o calendario restantes.",
            route: "/admin/hoy",
          },
          {
            label: "Atender tickets de Hábeas Data y PQR sin primera respuesta",
            detail: `Prioriza Hábeas Data (${HELP_LIVE_NUMBERS.habeasConsultationBusinessDays}d hábiles) y luego PQR generales (${HELP_LIVE_NUMBERS.pqrBusinessDays}d hábiles).`,
            route: "/admin/soporte",
          },
        ],
      },
      {
        id: "precorte",
        windowLabel: "2. Media mañana",
        title: "Avanzar expedientes de Garantías y Retractos",
        items: [
          {
            label: "Diagnosticar reclamos de Garantía en revisión",
            detail:
              "Comprueba vigencia sellada, fotos y sello de baja resolución; coordina reposición o escala reembolso.",
            route: "/admin/garantias",
          },
          {
            label: "Gestionar admisión y retorno físico de Retractos",
            detail: `Verifica elegibilidad (${HELP_LIVE_NUMBERS.retractWindowBusinessDays}d hábiles, no personalizado) y seguimiento de llegada a bodega.`,
            route: "/admin/retractos",
          },
        ],
      },
      {
        id: "continuo",
        windowLabel: "3. Durante la jornada",
        title: "Seguimiento 360, reseñas críticas y carritos",
        items: [
          {
            label: "Consultar estado vivo en Pedidos y Contacto 360",
            detail: "Responde dudas de rastreo o producción basándote solo en hechos confirmados.",
            route: "/admin/pedidos",
          },
          {
            label: "Dar seguimiento privado a reseñas de 1★ y 2★",
            detail: "Detecta clientes insatisfechos en Reseñas y contáctalos desde Soporte.",
            route: "/admin/resenas",
          },
          {
            label: "Enviar recordatorios supervisados de Carritos elegibles",
            detail:
              "Previsualiza y envía un único recordatorio a carritos sin rebote ni compra posterior.",
            route: "/admin/carritos",
          },
        ],
      },
      {
        id: "cierre",
        windowLabel: "4. Cierre de turno",
        title: "Cero tickets huérfanos",
        items: [
          {
            label: "Dejar notas internas y tareas claras en Contacto 360",
            detail:
              "Asegura que todo caso pendiente quede asignado y con contexto claro para mañana.",
            route: "/admin/clientes",
          },
        ],
      },
    ],
    recommendedPlaybookIds: [
      "playbook-posventa-ley-1480-1581",
      "playbook-pedido-web-300dpi",
      "playbook-audiencias-carritos-lifecycle",
    ],
  },
  {
    role: "PRINT_WORKSHOP",
    mission: `Moderar diseños con criterio técnico, fabricar a ${HELP_LIVE_NUMBERS.printResolutionDpi} DPI respetando exactamente variantes físicas, tandas, copias y dedicatorias de regalo, y entregar piezas impecables a Alistamiento.`,
    privacyScope:
      "Operas con privacidad por diseño: nombres, correos, teléfonos, direcciones, guías PDF e importes COP están ocultos en servidor. El mensaje de regalo (`giftMessage`) sí es visible porque debes imprimirlo para el paquete.",
    escalateWhen: [
      "Un `RenderJob` 300 DPI permanezca fallido o no coincida con las unidades del pedido.",
      "Un pedido B2B pagado siga bloqueado sin arte maestro 300 DPI cargado.",
      "Se agote o esté por agotarse papel, imán, tinta o insumo crítico en taller.",
    ],
    dontTouch: [
      "Jamás fabriques «al ojo» o con capturas de baja resolución si el paquete ZIP 300 DPI no está completo.",
      "Jamás guardes fotografías personales de clientes fuera de la carpeta temporal de impresión del pedido.",
      "No pases un pedido a En producción hasta que realmente arranques su impresión física.",
    ],
    blocks: [
      {
        id: "apertura",
        windowLabel: "1. Inicio de taller",
        title: "Liberar Moderación y ordenar cola de impresión",
        items: [
          {
            label: "Revisar bloqueos de taller en Bandeja Hoy",
            detail: "Identifica pedidos urgentes o reposiciones de garantía pendientes.",
            route: "/admin/hoy",
          },
          {
            label: "Aprobar o rechazar diseños en Moderación",
            detail:
              "Revisa encuadre, caras dobles (Bola Navideña / Mini Libros) y sello de resolución.",
            route: "/admin/moderacion",
          },
        ],
      },
      {
        id: "precorte",
        windowLabel: "2. Lotes previos al corte de despacho",
        title: "Descargar ZIP 300 DPI y producir sin errores",
        items: [
          {
            label: `Bajar paquetes ZIP ${HELP_LIVE_NUMBERS.printResolutionDpi} DPI y marcar En producción`,
            detail:
              "Comprueba opción física (con imán vs `-NOMAG`), diseños de la tanda, copias iguales y tarjeta de regalo.",
            route: "/admin/pedidos",
          },
        ],
      },
      {
        id: "continuo",
        windowLabel: "3. Control de calidad en mesa",
        title: "Corte, laminado, imán y entrega a Alistamiento",
        items: [
          {
            label: "Verificar conteo exacto contra ficha del pedido",
            detail:
              "Agrupa cada orden identificada con su código `LCM-YYYY-NNNN` para que Despachos nunca cruce paquetes.",
            route: "/admin/pedidos",
          },
        ],
      },
      {
        id: "cierre",
        windowLabel: "4. Cierre de taller",
        title: "Dejar Moderación al día y reportar insumos bajos",
        items: [
          {
            label: "Barrer últimos diseños entrantes en Moderación",
            detail:
              "Deja listos los renders nocturnos y avisa a Operaciones si algún insumo bajó del mínimo.",
            route: "/admin/moderacion",
          },
        ],
      },
    ],
    recommendedPlaybookIds: ["playbook-pedido-web-300dpi"],
  },
  {
    role: "FULFILLMENT",
    mission:
      "Empacar con precisión cada orden terminada por Taller, cuidar la presentación de regalo sin precios, adherir la guía correcta (Aveonline o Envío Lucams) y registrar despachos y entregas reales a tiempo.",
    privacyScope:
      "Accedes a la guía y rótulo térmico necesarios para entregar el paquete y ves el importe en pesos únicamente cuando debes recaudarlo contraentrega (COD). No tienes acceso al ZIP de archivos fotográficos de imprenta.",
    escalateWhen: [
      "Falle la generación de guía Aveonline o aparezca dirección/ciudad inválida.",
      "Las unidades o variantes físicas entregadas por Taller no coincidan con el pedido `LCM`.",
      "Un destinatario rechace recibir o pagar un pedido contraentrega en ruta local.",
    ],
    dontTouch: [
      "Jamás introduzcas precios, recibos ni valores comerciales dentro de un paquete marcado como Regalo (`isGift`).",
      "Jamás marques un pedido como Enviado antes de que tenga guía válida y haya salido físicamente.",
      "Jamás marques Entregado sin confirmación efectiva del operador o mensajero.",
    ],
    blocks: [
      {
        id: "apertura",
        windowLabel: "1. Apertura de bodega / alistamiento",
        title: "Identificar prioridades de salida",
        items: [
          {
            label: "Revisar compromisos del día en Bandeja Hoy",
            detail: "Ubica pedidos listos de Taller y urgencias antes de la hora límite local.",
            route: "/admin/hoy",
          },
        ],
      },
      {
        id: "precorte",
        windowLabel: "2. Antes de la hora límite (Bogotá/Soacha y recogida nacional)",
        title: "Empaque verificado, guía térmica y despacho",
        items: [
          {
            label: "Contrastar piezas, imprimir rótulo y despachar",
            detail:
              "Verifica cantidades, dedicatoria de regalo, cobro COD si aplica, pega guía `/admin/pedidos/[number]/guia` y marca Enviado al entregar a ruta.",
            route: "/admin/pedidos",
          },
        ],
      },
      {
        id: "continuo",
        windowLabel: "3. Seguimiento de tránsito",
        title: "Novedades de transportadora y entregas locales",
        items: [
          {
            label: "Actualizar entregas confirmadas de Envío Lucams y revisar novedades",
            detail:
              "Registra entregas reales de mensajería propia y escala cualquier dirección fallida.",
            route: "/admin/pedidos",
          },
        ],
      },
      {
        id: "cierre",
        windowLabel: "4. Cierre logístico",
        title: "Cuadre de paquetes salientes y efectivo COD local",
        items: [
          {
            label: "Confirmar que ningún paquete empacado quedó sin estado actualizado",
            detail: "Entrega planilla/recaudo COD local a Finanzas/Dirección para su conciliación.",
            route: "/admin/hoy",
          },
        ],
      },
    ],
    recommendedPlaybookIds: ["playbook-pedido-web-300dpi", "playbook-cod-conciliacion-bloqueos"],
  },
  {
    role: "FINANCE_ANALYST",
    mission:
      "Asegurar exactitud contable en hora Colombia: conciliar cada remesa contraentrega, auditar márgenes BOM, controlar pasivos (retractos, garantías, puntos), preparar exportaciones DIAN y vigilar el tope de 3.500 UVT.",
    privacyScope:
      "Operas en modo contable 0-PII comercial: correos, teléfonos, fotos y relatos libres se enmascaran en servidor, conservando íntegros los identificadores tributarios DIAN (NIT/cédula, razón social y CUFE) en el CSV financiero.",
    escalateWhen: [
      `Una entrega COD supere ${HELP_LIVE_NUMBERS.codAgingAlertDays} días sin remesa o presente faltante en la liquidación del carrier.`,
      "Detectes productos activos sin costo BOM o escalas mayoristas/campañas operando con margen negativo.",
      `El acumulado o proyección anual en Métricas alcance el ${HELP_LIVE_NUMBERS.fiscalWatchPct} % de las ${formatThousandsEsCo(HELP_LIVE_NUMBERS.fiscalUvtThreshold)} UVT.`,
      "Existan retractos o garantías listos para desembolsar que requieran ejecución de Superadmin.",
    ],
    dontTouch: [
      "Jamás concilies una orden COD sin verificar la planilla y el ingreso bancario real.",
      "Jamás ajustes a mano una discrepancia de remesa para forzar cuadre cero.",
      "Jamás compartas el CSV contable fuera de los canales autorizados de contabilidad.",
    ],
    blocks: [
      {
        id: "apertura",
        windowLabel: "1. Revisión matutina",
        title: "Alertas de caja, remesas vencidas y vigilancia UVT",
        items: [
          {
            label: "Revisar alertas contables y fiscales en Bandeja Hoy",
            detail: "Identifica entregas COD envejecidas, pasivos posventa abiertos y umbral DIAN.",
            route: "/admin/hoy",
          },
          {
            label: "Verificar acumulado y proyección de 3.500 UVT",
            detail: "Comprueba posición tributaria anual incluyendo Wompi y Pagos Directos B2B.",
            route: "/admin/metricas",
          },
        ],
      },
      {
        id: "precorte",
        windowLabel: "2. Conciliación operativa",
        title: "Remesas COD y pasivos de posventa",
        items: [
          {
            label: "Conciliar remesas contraentrega con MFA",
            detail: `Cruza planillas del carrier contra entregas pendientes (> ${HELP_LIVE_NUMBERS.codAgingAlertDays}d primero) y evalúa bloqueos por abuso.`,
            route: "/admin/finanzas/conciliacion",
          },
          {
            label: "Auditar pasivos en Retractos, Garantías y Fidelización",
            detail: "Contrasta devoluciones pendientes/ejecutadas y pasivo vivo de Puntos Lucams.",
            route: "/admin/retractos",
          },
        ],
      },
      {
        id: "continuo",
        windowLabel: "3. Auditoría de rentabilidad",
        title: "Costos BOM, escalas y atribución comercial",
        items: [
          {
            label: "Inspeccionar Costos y Precios al por mayor (solo lectura)",
            detail:
              "Señala a Operaciones cualquier producto sin costo o tramo con margen comprometido.",
            route: "/admin/costos",
          },
          {
            label: "Auditar atribución 0-PII en Carritos y Lifecycle",
            detail: "Verifica que los ingresos recuperados coincidan con pedidos pagados.",
            route: "/admin/lifecycle",
          },
        ],
      },
      {
        id: "cierre",
        windowLabel: "4. Cierre de período",
        title: "Puente de caja y exportación CSV DIAN",
        items: [
          {
            label: "Validar Finanzas y exportar CSV con MFA",
            detail:
              "Confirma corte en hora Bogotá, retenciones B2B practicadas y totales antes de entregar al contador.",
            route: "/admin/finanzas",
          },
        ],
      },
    ],
    recommendedPlaybookIds: [
      "playbook-cod-conciliacion-bloqueos",
      "playbook-oportunidad-b2b-cierre",
      "playbook-economia-bom-precios-promos",
      "playbook-incidentes-seguridad-dian",
    ],
  },
  {
    role: "CMS_EDITOR",
    mission:
      "Mantener impecables, veloces, accesibles y legalmente veraces las páginas editoriales, banners de Mediateca y redirecciones SEO de Lucams Shop.",
    privacyScope:
      "Tu rol está aislado al 100 % de pedidos, clientes, pagos y finanzas: solo operas contenido público editorial (`Páginas del sitio`, `Mediateca` y `Redirecciones SEO`).",
    escalateWhen: [
      "Se requiera cambiar logotipo global, barra de anuncios superior o punto de recogida logístico en Ajustes del sitio (exclusivo Superadmin).",
      "Un cambio de texto toque condiciones legales, tiempos de entrega o medios de pago que deban validarse con Dirección.",
      "Se necesite redirigir hacia un dominio externo (`https://...`), reservado a Superadmin.",
    ],
    dontTouch: [
      "Nunca elimines ni modifiques marcadores dinámicos `{{...}}` en textos legales o FAQs.",
      "Nunca publiques textos prometiendo descuentos, envíos o garantías que no estén activos en la operación.",
      "Nunca subas imágenes pesadas sin texto alternativo (`alt`) ni reemplaces un medio compartido sin revisar dónde se usa.",
    ],
    blocks: [
      {
        id: "apertura",
        windowLabel: "1. Inicio de edición",
        title: "Revisar borradores pendientes y estado actual",
        items: [
          {
            label: "Inspeccionar borradores sin publicar en Contenido",
            detail: "Verifica qué cambios quedaron en trabajo antes de iniciar nuevas ediciones.",
            route: "/admin/contenido",
          },
        ],
      },
      {
        id: "precorte",
        windowLabel: "2. Preparación de medios",
        title: "Optimizar recursos en Mediateca",
        items: [
          {
            label: "Cargar imágenes optimizadas con descripción `alt` accesible",
            detail:
              "Revisa peso para móvil, encuadre y referencias activas antes de conectar a campos.",
            route: "/admin/contenido/mediateca",
          },
        ],
      },
      {
        id: "continuo",
        windowLabel: "3. Edición, vista previa y publicación",
        title: "Flujo seguro Borrador → Preview → Publicar",
        items: [
          {
            label: "Editar campos respetando tuteo `es-CO` y marca «Lucams Shop»",
            detail:
              "Guarda borrador, revisa móvil y escritorio y publica (o programa en hora Bogotá).",
            route: "/admin/contenido",
          },
        ],
      },
      {
        id: "cierre",
        windowLabel: "4. Higiene SEO",
        title: "Verificar enlaces y redirecciones",
        items: [
          {
            label: "Comprobar ausencia de enlaces rotos o cadenas en Redirecciones",
            detail: "Valida que toda URL retirada apunte en un solo salto 301 a destino 200 OK.",
            route: "/admin/redirects",
          },
        ],
      },
    ],
    recommendedPlaybookIds: ["playbook-catalogo-estudio-lanzamiento"],
  },
];
