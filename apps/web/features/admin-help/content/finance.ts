import { HELP_LIVE_NUMBERS, formatThousandsEsCo } from "../constants";
import type { AdminModuleGuide } from "../types";

export const FINANCE_GUIDES: AdminModuleGuide[] = [
  {
    id: "finanzas",
    title: "Finanzas",
    area: "Finanzas y analítica",
    route: "/admin/finanzas",
    summary:
      "Libro financiero en hora Colombia: ingresos Wompi, Pagos Directos B2B con retenciones, puente de caja COD y CSV contable DIAN.",
    purpose:
      "Consolida los ingresos reales del negocio con cortes exactos en `America/Bogota` (-05:00): separa recaudo en línea (Wompi), transferencias/Bre-B corporativas (mostrando tanto el ingreso bruto fiscal como el neto en banco tras retenciones practicadas), estado de remesas COD y exportación CSV protegida con MFA y minimización de PII.",
    whenToUse: [
      "Al cierre semanal o mensual para entregar soporte contable al contador.",
      "Para conciliar el puente entre ingreso bruto fiscal y efectivo real recibido en banco.",
      "Después de confirmar pagos directos B2B o reembolsos posventa.",
    ],
    concepts: [
      {
        term: "Ingreso bruto fiscal vs Puente de caja real",
        definition:
          "En ventas B2B con retención en la fuente, el ingreso bruto se conserva íntegro para umbrales fiscales DIAN mientras el puente de caja descuenta las retenciones certificadas y separa contraentregas aún en calle.",
      },
      {
        term: "CSV contable con PII redactada",
        definition:
          "Para Analista Financiero conserva íntegros los datos tributarios DIAN (tipo/número documento, razón social, CUFE) y enmascara el correo comercial del cliente.",
      },
    ],
    sections: [
      {
        id: "reporte",
        title: "Cortes horarios, desglose de recaudo y exportación",
        summary: "Fuente oficial para contabilidad y cuadre bancario.",
        topics: [
          {
            id: "periodo",
            label: "Ventana exacta en hora Bogotá (-05:00)",
            description:
              "Evita desfases nocturnos de 7:00 p. m. a 11:59 p. m. típicos de servidores en UTC.",
            interpretation:
              "Compara siempre contra extractos cortados en la misma fecha local colombiana.",
          },
          {
            id: "ingresos",
            label: "Wompi, Pago Directo B2B y Contraentrega",
            description:
              "Descompone productos, fletes, descuentos, retenciones B2B y estado de remesas COD (conciliadas, pendientes o con discrepancia).",
            interpretation:
              "Recuerda descontar aparte la tarifa financiera cobrada por Wompi al liquidar a tu cuenta bancaria.",
          },
          {
            id: "export",
            label: `Exportación CSV con MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min)`,
            description:
              "Incluye blindaje contra inyección de fórmulas en Excel/Sheets y registro en Auditoría.",
            caution:
              "Comparte el CSV únicamente con contabilidad autorizada y elimina copias temporales.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "exportar-finanzas",
        title: "Cerrar y exportar el corte contable del período",
        goal: "Entregar al contador cifras cuadradas con remesas, retenciones y devoluciones.",
        route: "/admin/finanzas",
        steps: [
          "Concilia primero las remesas COD pendientes en /admin/finanzas/conciliacion y verifica en /admin/retractos y /admin/garantias si hay reembolsos ejecutados.",
          "En /admin/finanzas selecciona las fechas exactas del corte en hora Colombia.",
          "Revisa ingresos brutos, descuentos, fletes, retenciones B2B y puente de caja real.",
          `Pulsa Exportar CSV e ingresa tu código MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
          "Comprueba totales de columnas antes de enviarlo por canal seguro al contador.",
        ],
        expected:
          "El archivo contable cuadra con pedidos pagados, reembolsos y remesas registradas.",
      },
    ],
    cautions: [
      "`BILLING_DOCUMENT_ENABLED` permanece desactivado mientras se formaliza proveedor tecnológico DIAN; vigila los umbrales en /admin/metricas y Bandeja Hoy.",
    ],
    dontTouch: [
      "No tomes pedidos COD entregados pero aún no conciliados como dinero disponible en banco.",
      "No edites a mano celdas de importes del CSV exportado antes de enviarlo a contabilidad.",
    ],
    checklist: [
      "Remesas COD recibidas del período ya conciliadas.",
      "Retenciones B2B y reembolsos posventa verificados.",
      "CSV descargado con MFA y resguardado de forma segura.",
    ],
    faqs: [
      {
        question:
          "¿Por qué en el CSV de Analista Financiero el correo sale con asteriscos pero el NIT/cédula sale completo?",
        answer:
          "Por diseño de privacidad Ley 1581: contabilidad necesita el identificador fiscal DIAN íntegro, pero no requiere el correo electrónico comercial para contactar al comprador.",
      },
    ],
    related: ["conciliacion", "bloqueos", "costos", "metricas", "pedidos", "oportunidades"],
    relatedPlaybooks: [
      "playbook-oportunidad-b2b-cierre",
      "playbook-cod-conciliacion-bloqueos",
      "playbook-incidentes-seguridad-dian",
    ],
    keywords: [
      "finanzas",
      "ingresos",
      "CSV",
      "contabilidad",
      "Bre-B",
      "retenciones",
      "puente de caja",
      "fletes",
      "DIAN",
    ],
    version: 4,
  },
  {
    id: "conciliacion",
    title: "Conciliación contraentrega",
    area: "Finanzas y analítica",
    route: "/admin/finanzas/conciliacion",
    summary: `Cuadre de efectivo COD contra remesas de transportadora, alerta > ${HELP_LIVE_NUMBERS.codAgingAlertDays} días y confirmación MFA.`,
    purpose:
      "Controla cada peso recaudado al entregar pedidos contraentrega (tanto transportadoras de Aveonline como mensajería Envío Lucams), separando el evento logístico «Entregado» del ingreso efectivo de dinero en la remesa y aislando diferencias para reclamo o bloqueo antifraude.",
    whenToUse: [
      "Cada vez que la transportadora o mensajería transfiera y envíe planilla de remesa.",
      `Para atacar pedidos entregados hace más de ${HELP_LIVE_NUMBERS.codAgingAlertDays} días sin liquidación.`,
      "Para documentar faltantes o rechazos reiterados antes de pasar a Bloqueos COD.",
    ],
    concepts: [
      {
        term: "Entregado ≠ Conciliado",
        definition:
          "Un paquete COD entregado significa que el cliente recibió el producto; solo pasa a caja confirmada cuando verificas y registras el valor real remesado.",
      },
      {
        term: "Discrepancia documentada",
        definition:
          "Brecha entre el valor esperado de la orden y el valor efectivamente girado en la remesa que queda marcada para reclamo formal.",
      },
    ],
    sections: [
      {
        id: "pendientes",
        title: "Cola por conciliar, envejecimiento y diferencias",
        summary: "Exige MFA reciente para sellar cada conciliación.",
        topics: [
          {
            id: "envejecidos",
            label: `Alerta de antigüedad (> ${HELP_LIVE_NUMBERS.codAgingAlertDays} días)`,
            description:
              "Resalta entregas cuyo efectivo aún no ha sido reportado dentro del ciclo normal del operador.",
            interpretation:
              "Atácalas primero antes de que venza la ventana de reclamación ante la transportadora.",
          },
          {
            id: "valores",
            label: "Valor esperado vs Valor remesado",
            description:
              "Registra exactamente el monto pagado/liquidado por el operador, nunca ajustes cosméticos.",
            caution:
              "Si hay diferencia, regístrala tal cual con el soporte de la planilla para dejar evidencia auditable.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "conciliar-cod",
        title: "Conciliar remesa contraentrega con soporte verificable",
        goal: "Cerrar entregas pagadas en banco y aislar al instante cualquier faltante.",
        route: "/admin/finanzas/conciliacion",
        steps: [
          "Descarga la planilla oficial de remesa del carrier o liquidación de ruta Envío Lucams y confirma el abono bancario.",
          `Prioriza las órdenes con alerta de más de ${HELP_LIVE_NUMBERS.codAgingAlertDays} días desde entrega.`,
          "Cruza número de guía y pedido `LCM`, digita el monto efectivamente recibido y anota referencia de remesa.",
          `Confirma con tu código MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
          "Si hubo abuso comprobado de no-show o rechazo malicioso, evalúa restricción en /admin/finanzas/bloqueos.",
        ],
        expected:
          "El puente de caja en Finanzas refleja el efectivo real recibido y las diferencias quedan trazadas.",
      },
    ],
    cautions: [
      "Verifica si la diferencia obedece a comisión de recaudo del carrier antes de reportarla como pérdida de efectivo.",
    ],
    dontTouch: [
      "Nunca concilies un pedido COD solo porque en rastreo dice Entregado sin tener planilla/abono de remesa.",
      "Nunca alteres el monto recibido para forzar que la diferencia dé cero sin soporte real.",
    ],
    checklist: [
      "Abono bancario de la remesa verificado.",
      `Entregas con > ${HELP_LIVE_NUMBERS.codAgingAlertDays} días revisadas.`,
      "Discrepancias documentadas con número de guía y planilla.",
    ],
    faqs: [
      {
        question:
          "¿Aquí también entran los pedidos contraentrega de Envío Lucams en Bogotá/Soacha?",
        answer:
          "Sí. Todo recaudo contraentrega, sea por operador nacional o ruta propia, debe conciliarse contra el efectivo/transferencia entregada.",
      },
    ],
    related: ["finanzas", "bloqueos", "pedidos", "envios"],
    relatedPlaybooks: ["playbook-cod-conciliacion-bloqueos"],
    keywords: [
      "COD",
      "conciliar remesa",
      "contraentrega",
      "discrepancia",
      "recaudo",
      "carrier",
      "efectivo",
    ],
    version: 3,
  },
  {
    id: "bloqueos",
    title: "Bloqueos contraentrega",
    area: "Finanzas y analítica",
    route: "/admin/finanzas/bloqueos",
    summary: `Lista de restricción antifraude COD por correo, teléfono o dirección normalizada (MFA ≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
    purpose:
      "Protege a Lucams Shop frente a fletes perdidos y piezas personalizadas desperdiciadas por compradores con historial probado de no recibir/no pagar contraentrega, ocultándoles únicamente la opción COD pero permitiéndoles comprar pagando por anticipado con Wompi.",
    whenToUse: [
      "Tras confirmar no-show reiterado, dirección falsa intencional o rechazo injustificado de un pedido COD personalizado.",
      "Para levantar una restricción cuando el cliente demuestra error involuntario y existe autorización.",
    ],
    concepts: [
      {
        term: "Restricción proporcional (solo COD)",
        definition:
          "No es un veto total a la persona: en el checkout desaparece contraentrega, pero Wompi permanece 100 % habilitado.",
      },
      {
        term: "Normalización determinista",
        definition:
          "Estandariza correo, teléfono y dirección + ciudad para impedir evadir la regla con mayúsculas o espacios.",
      },
    ],
    sections: [
      {
        id: "restriccion",
        title: "Alta, evidencia y levantamiento con MFA",
        summary: "Cada bloqueo y desbloqueo queda sellado en Auditoría.",
        topics: [
          {
            id: "senal",
            label: "Elección de señal (correo, teléfono o dirección)",
            description:
              "Usa teléfono o correo personal antes de bloquear una dirección general de edificio/oficina donde compran terceros.",
            caution:
              "Bloquear la dirección genérica de una torre empresarial o universidad afectaría a otros compradores legítimos en COD.",
          },
          {
            id: "motivo",
            label: "Motivo objetivo verificable",
            description:
              "Cita el número de pedido `LCM` y el hecho logístico concreto (ej. «Dos intentos fallidos con rechazo en portería en LCM-2026-0142»).",
            caution:
              "Nunca escribas insultos ni juicios subjetivos: el registro forma parte de la auditoría del negocio.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "bloquear-cod",
        title: "Aplicar o retirar un bloqueo contraentrega",
        goal: "Frenar pérdidas por flete devuelto sin cerrar ventas prepagadas.",
        route: "/admin/finanzas/bloqueos",
        steps: [
          "Confirma en el pedido `LCM` y en los eventos de guía que realmente hubo incumplimiento atribuible al comprador (y no falla de la transportadora).",
          "Elige la señal precisa (priorizando teléfono/correo sobre direcciones multiusuario) y redacta el motivo citando el pedido.",
          `Confirma el bloqueo (o desbloqueo) con tu código MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
        ],
        expected:
          "Futuros checkouts con esa señal exigirán pago anticipado en línea sin riesgo de flete perdido.",
      },
    ],
    cautions: [
      "Verifica antes en los eventos de Aveonline que no haya sido un error de nomenclatura o falta de visita del mensajero.",
    ],
    dontTouch: [
      "No bloquees direcciones completas de centros comerciales, hospitales o edificios corporativos grandes.",
      "No uses lenguaje despectivo en el campo de motivo.",
    ],
    checklist: [
      "Descartado que el fallo haya sido culpa de la transportadora.",
      "Motivo objetivo redactado con número de pedido `LCM`.",
      "Confirmado con MFA reciente.",
    ],
    faqs: [
      {
        question: "¿Si bloqueo a alguien aquí ya no puede comprar nunca más en Lucams Shop?",
        answer:
          "Sí puede comprar: el checkout simplemente oculta contraentrega y le permite pagar en línea con Wompi (PSE, tarjeta, Nequi, etc.).",
      },
    ],
    related: ["conciliacion", "pedidos", "finanzas", "auditoria"],
    relatedPlaybooks: ["playbook-cod-conciliacion-bloqueos"],
    keywords: ["fraude", "COD", "bloqueo", "no-show", "teléfono", "dirección", "MFA"],
    version: 3,
  },
  {
    id: "metricas",
    title: "Métricas",
    area: "Finanzas y analítica",
    route: "/admin/metricas",
    summary: `Analítica CRM (RFM, LTV, cohortes), embudo first-party y vigilancia fiscal DIAN (${formatThousandsEsCo(HELP_LIVE_NUMBERS.fiscalUvtThreshold)} UVT).`,
    purpose: `Reúne inteligencia de retención y valor de vida de clientes (aislando \`isStaff\`), conversión diaria del embudo y el tablero de vigilancia fiscal proactiva (\`ADR-196\`) sobre los topes anuales de ${formatThousandsEsCo(HELP_LIVE_NUMBERS.fiscalUvtThreshold)} UVT con proyección de cierre y niveles de alerta ${HELP_LIVE_NUMBERS.fiscalWatchPct} / ${HELP_LIVE_NUMBERS.fiscalWarningPct} / ${HELP_LIVE_NUMBERS.fiscalCriticalPct} %.`,
    whenToUse: [
      "Semanalmente para medir recompra, salud de cohortes y distribución RFM.",
      "Para monitorear qué tan cerca está el acumulado anual (Wompi + Pagos Directos B2B) de los umbrales DIAN.",
      "Antes de diseñar campañas en Segmentos CRM o Lifecycle Journeys.",
    ],
    concepts: [
      {
        term: "Matriz RFM y LTV sin staff",
        definition:
          "Clasifica clientes reales por recencia, frecuencia y monto excluyendo cuentas administrativas (`isStaff`).",
      },
      {
        term: `Vigilancia DIAN ${formatThousandsEsCo(HELP_LIVE_NUMBERS.fiscalUvtThreshold)} UVT`,
        definition: `Suma ingresos brutos del año calendario (incluidos Wompi y \`DIRECT_TRANSFER\` B2B) frente al tope de facturación/IVA en UVT vigente y proyecta cierre de diciembre.`,
      },
    ],
    sections: [
      {
        id: "comportamiento",
        title: "Retención, RFM y cohortes",
        summary: "Mide fidelidad real más allá de las ventas de un solo día.",
        topics: [
          {
            id: "rfm-ltv",
            label: "Segmentación RFM y valor acumulado (LTV)",
            description: "Identifica campeones, leales, en riesgo o dormidos.",
            interpretation:
              "Conecta estos hallazgos con /admin/marketing/segmentos y /admin/lifecycle para activar recompra.",
          },
        ],
      },
      {
        id: "embudo-fiscal",
        title: "Embudo comercial y semáforo tributario DIAN",
        summary: "Anticipa con meses de margen obligaciones formales de facturación.",
        topics: [
          {
            id: "fiscal",
            label: `Acumulado YTD, proyección y niveles ${HELP_LIVE_NUMBERS.fiscalWatchPct}/${HELP_LIVE_NUMBERS.fiscalWarningPct}/${HELP_LIVE_NUMBERS.fiscalCriticalPct} %`,
            description:
              "El cron diario `lucams-fiscal-watch` evalúa el acumulado real y dispara notificaciones al superar cada umbral.",
            caution:
              "Al llegar al 70 % (observación) o 90 % (advertencia), inicia trámite de RUT/proveedor tecnológico con tu contador sin esperar al 100 %.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "interpretar-metricas",
        title: "Revisar retención comercial y postura de umbrales DIAN",
        goal: "Tomar decisiones comerciales y tributarias con anticipación.",
        route: "/admin/metricas",
        steps: [
          "Revisa primero el bloque de Vigilancia Fiscal comprobando % acumulado actual vs proyección anual en UVT.",
          "Analiza caídas entre pasos del embudo diario (vista → Estudio → carrito → orden pagada).",
          "Inspecciona evolución de cohortes y peso de clientes en riesgo para ajustar incentivos o recorridos Lifecycle.",
        ],
        expected:
          "Cero sorpresas tributarias a fin de año y foco comercial puesto donde más impacta conversión y recompra.",
      },
    ],
    cautions: [
      "La vigilancia de UVT es una herramienta preventiva interna; la liquidación tributaria oficial y actualización de RUT se validan siempre con el contador.",
    ],
    dontTouch: [
      "No ignores alertas del 70 % o 90 % de UVT: habilitar proveedor tecnológico y resolución DIAN toma semanas administrativas.",
    ],
    checklist: [
      "Porcentaje YTD y proyección de 3.500 UVT verificados.",
      "Embudo y retención contrastados contra acciones de Marketing.",
    ],
    faqs: [
      {
        question: "¿Las ventas B2B por transferencia o Bre-B cuentan en el tope de 3.500 UVT?",
        answer:
          "Sí. Una vez confirmadas en el pedido, suman por su valor bruto dentro de la vigilancia fiscal diaria.",
      },
    ],
    related: ["finanzas", "segmentos", "lifecycle", "dashboard", "hoy"],
    relatedPlaybooks: ["playbook-oportunidad-b2b-cierre", "playbook-incidentes-seguridad-dian"],
    keywords: ["RFM", "LTV", "cohorte", "embudo", "UVT", "3500 UVT", "DIAN", "fiscal"],
    version: 2,
  },
  {
    id: "performance",
    title: "Rendimiento web",
    area: "Finanzas y analítica",
    route: "/admin/performance",
    summary:
      "Telemetría real de usuarios (Core Web Vitals `p75`: LCP, INP y CLS) por ruta y dispositivo (Superadmin).",
    purpose:
      "Mide con datos reales de visitantes (RUM first-party) qué tan rápido cargan y responden la portada, las páginas de producto, el Estudio Konva/3D y el checkout tanto en celulares reales como en escritorio.",
    whenToUse: [
      "Después de subir nuevos banners pesados en Mediateca o cambiar activos visuales.",
      "Cuando notes caída de conversión móvil en el Estudio o en fichas de producto.",
    ],
    concepts: [
      {
        term: "LCP, INP y CLS en percentil 75 (`p75`)",
        definition:
          "LCP mide velocidad de carga visual principal, INP fluidez al tocar/interactuar y CLS saltos inesperados de diseño para el 75 % de las visitas reales.",
      },
    ],
    sections: [
      {
        id: "vitals",
        title: "Lectura por ruta, móvil vs escritorio y tamaño de muestra",
        summary: "Enfoca mejoras donde compran los clientes en Colombia.",
        topics: [
          {
            id: "segmentacion",
            label: "Móvil vs Escritorio y conteo de muestras",
            description: "Separa desempeño en redes móviles reales frente a conexiones fijas.",
            interpretation:
              "Si el LCP sube solo tras cambiar un banner de portada, optimiza el peso de esa imagen en Mediateca.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "diagnosticar-vital",
        title: "Diagnosticar lentitud en una ruta pública",
        goal: "Detectar si una degradación viene de medios pesados o código.",
        route: "/admin/performance",
        roles: ["SUPERADMIN"],
        steps: [
          "Filtra por dispositivo Móvil y revisa que la ruta tenga volumen suficiente de muestras.",
          "Identifica cuál métrica está en ámbar/rojo (LCP: imágenes/servidor; INP: interacción pesada; CLS: saltos visuales).",
          "Si ocurrió en portada o categoría tras un cambio editorial, revisa el peso de las imágenes recientes en /admin/contenido/mediateca.",
          "Si acompaña errores del servidor, cruza con /admin/observability.",
        ],
        expected:
          "Aíslas con datos reales la ruta afectada sin adivinar desde tu propia conexión local.",
      },
    ],
    cautions: [
      "Con muy pocas muestras un único teléfono antiguo puede sesgar el `p75`; observa tendencia de varios días.",
    ],
    dontTouch: [
      "No subas imágenes gigantes sin optimizar en Mediateca para el hero principal: degradan directamente el LCP móvil y el SEO.",
    ],
    checklist: [
      "Rutas críticas (`/`, `/productos/[slug]`, `/estudio/[slug]`, `/checkout`) con `p75` saludable en móvil.",
    ],
    faqs: [
      {
        question: "¿Por qué difiere de una corrida puntual de Lighthouse?",
        answer:
          "Lighthouse simula una sola carga de laboratorio; Rendimiento web agrega la experiencia real vivida por tus visitantes en sus dispositivos y redes.",
      },
    ],
    related: ["observability", "mediateca", "dashboard"],
    relatedPlaybooks: ["playbook-incidentes-seguridad-dian"],
    keywords: ["LCP", "INP", "CLS", "p75", "Web Vitals", "velocidad", "móvil", "RUM"],
    version: 2,
  },
];
