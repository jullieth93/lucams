import { HELP_LIVE_NUMBERS, formatThousandsEsCo } from "../constants";
import type { AdminModuleGuide } from "../types";

export const OPERATION_GUIDES: AdminModuleGuide[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    area: "Operación",
    route: "/admin/dashboard",
    summary:
      "Tablero ejecutivo diario: pulso comercial, embudo de conversión, alertas operativas y accesos rápidos por rol.",
    purpose:
      "Da lectura ejecutiva inmediata al abrir el turno: separa ingresos pagados reales frente a intenciones o contraentregas en tránsito, resume conversión del embudo y señala bloqueos activos para saltar al módulo especializado donde se ejecutan las acciones.",
    whenToUse: [
      "En los primeros 2 minutos de la jornada junto con Bandeja Hoy.",
      "Para detectar caídas bruscas de conversión, picos de pedidos retenidos o alertas fiscales/técnicas.",
      "Antes de tomar decisiones de precios, campañas o capacidad de taller.",
    ],
    concepts: [
      {
        term: "Orden creada vs orden pagada",
        definition:
          "Una orden en espera de pago o contraentrega aún no recaudada no equivale a caja confirmada; contrasta siempre en Finanzas.",
      },
      {
        term: "Embudo sin cookies invasivas",
        definition:
          "Mide vistas de catálogo, apertura del Estudio, carrito y compra bajo las reglas de consentimiento vigentes.",
      },
    ],
    sections: [
      {
        id: "indicadores",
        title: "Pulso comercial y embudo",
        summary: "Compara volumen, ticket y conversión dentro de la ventana temporal seleccionada.",
        topics: [
          {
            id: "ventas",
            label: "Ingresos y pedidos del período",
            description:
              "Resume el ritmo comercial en hora Colombia (-05:00), excluyendo compras marcadas de personal interno (`isStaff`).",
            interpretation:
              "Para cierres contables, retenciones B2B o conciliación COD usa siempre Finanzas (/admin/finanzas), nunca una captura del Dashboard.",
          },
          {
            id: "conversion",
            label: "Embudo de conversión",
            description:
              "Muestra en qué paso se enfrían los visitantes (ficha, Estudio, carrito o pago).",
            interpretation:
              "Si cae el paso de envío o pago, revisa de inmediato /admin/envios e /admin/integraciones.",
          },
        ],
      },
      {
        id: "alertas",
        title: "Señales prioritarias y atajos operativos",
        summary: " Conecta cada desviación con su bandeja de resolución.",
        topics: [
          {
            id: "prioridad",
            label: "Tarjetas de atención inmediata",
            description:
              "Destaca SLAs legales próximos a vencer, diseños por moderar, taller bloqueado o remesas COD envejecidas.",
            interpretation:
              "Atiende siempre primero vencimientos legales (Posventa/Hábeas Data) y bloqueos de producción o despacho.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "revision-diaria",
        title: "Ejecutar el chequeo ejecutivo de apertura (5 minutos)",
        goal: "Detectar cuellos de botella reales antes de arrancar producción o atención.",
        route: "/admin/dashboard",
        steps: [
          "Confirma el rango de fechas activo en la cabecera del Dashboard.",
          "Revisa primero las alertas rojas o ámbar (SLAs legales, salud técnica, vigilancia DIAN o bloqueos de taller).",
          "Inspecciona el embudo para descartar caídas anormales en cotización de envío o pasarela de pago.",
          "Pasa a Bandeja Hoy (/admin/hoy) para ordenar las tareas concretas de tu rol.",
        ],
        expected:
          "Identificas en menos de cinco minutos si la tienda opera fluido o qué módulo requiere intervención inmediata.",
      },
    ],
    cautions: [
      "El Dashboard es estrictamente de lectura: ninguna cifra aquí sustituye la verificación del expediente en Pedidos, Posventa o Finanzas.",
    ],
    dontTouch: [
      "No autorices reembolsos ni ajustes contables tomando solo los totales resumidos del Dashboard.",
      "No interpretes una caída puntual de embudo de pocas horas como falla de producto sin revisar antes Salud técnica e Integraciones.",
    ],
    checklist: [
      "Sin alertas críticas de salud técnica ni integraciones caídas.",
      "SLAs legales y bloqueos de taller encaminados hacia Bandeja Hoy.",
    ],
    faqs: [
      {
        question: "¿Por qué una compra de prueba hecha con mi correo admin no infla las métricas?",
        answer:
          "Porque las cuentas administrativas marcan automáticamente `Contact.isStaff = true` (ADR-195), aislándolas de segmentos y analítica comercial.",
      },
      {
        question: "¿Por qué un total del Dashboard difiere de Finanzas?",
        answer:
          "Finanzas desglosa cortes contables exactos, puente de caja real, retenciones B2B y estado de remesas COD; usa siempre Finanzas para contabilidad.",
      },
    ],
    related: ["hoy", "pedidos", "finanzas", "metricas", "notificaciones"],
    relatedPlaybooks: ["playbook-pedido-web-300dpi", "playbook-incidentes-seguridad-dian"],
    keywords: ["inicio", "KPI", "ventas", "conversión", "embudo", "alertas", "resumen"],
    version: 2,
  },
  {
    id: "hoy",
    title: "Bandeja Hoy",
    area: "Operación",
    route: "/admin/hoy",
    summary:
      "Centro de mando diario por rol: SLAs legales, tareas CRM vencidas, bloqueos de taller/arte B2B, remesas COD y vigilancia DIAN.",
    purpose:
      "Convierte todas las señales dispersas del backoffice en tu fila única de trabajo diario, filtrada estrictamente según los permisos de tu rol. Ordena por riesgo real: primero plazos legales colombianos, luego promesas de producción/despacho y seguimiento comercial.",
    whenToUse: [
      "Como primera pantalla operativa cada mañana y después del almuerzo.",
      "Antes de la hora límite de despacho local para asegurar que ningún pedido pagado quede rezagado.",
      "Al cierre del turno para confirmar que cero casos legales quedaron vencidos.",
    ],
    concepts: [
      {
        term: "Semáforo SLA legal",
        definition: `Reloj en días hábiles colombianos (con festivos Ley Emiliani) o calendario según el caso: ${HELP_LIVE_NUMBERS.pqrBusinessDays}d hábiles PQR/Garantía, ${HELP_LIVE_NUMBERS.habeasConsultationBusinessDays}d hábiles Hábeas Data y ${HELP_LIVE_NUMBERS.retractRefundCalendarDays}d calendario reembolso de retracto.`,
      },
      {
        term: "Bloqueo operativo",
        definition:
          "Pedido pagado que no puede fabricarse o enviarse porque espera moderación de diseño, arte maestro B2B 300 DPI o reintento de guía.",
      },
    ],
    sections: [
      {
        id: "prioridades",
        title: "Orden de ataque de los pendientes",
        summary: "Qué atender primero para proteger cumplimiento legal y promesa al cliente.",
        topics: [
          {
            id: "vencidos",
            label: "1. Vencidos y por vencer hoy (SLAs)",
            description:
              "Tickets de soporte, consultas Hábeas Data, garantías y retractos con reloj legal agotado o en sus últimas 48 horas.",
            caution:
              "Nunca cierres un caso sin respuesta real solo para apagar el semáforo rojo: todo cambio queda en auditoría.",
          },
          {
            id: "taller-despacho",
            label: "2. Bloqueos de moderación, taller y guías",
            description:
              "Diseños pendientes en Moderación, paquetes 300 DPI listos para fabricar o pedidos B2B esperando carga de arte maestro.",
            interpretation: "Desbloquéalos antes de la hora de corte configurada en /admin/envios.",
          },
          {
            id: "tareas-crm",
            label: "3. Tareas CRM, propuestas B2B y remesas COD",
            description: `Compromisos comerciales con fecha, oportunidades B2B activas y contraentregas entregadas hace más de ${HELP_LIVE_NUMBERS.codAgingAlertDays} días sin conciliar.`,
            interpretation:
              "Ejecuta primero la gestión en el módulo de origen y luego marca la tarea completada.",
          },
          {
            id: "fiscal",
            label: `4. Vigilancia fiscal DIAN (${formatThousandsEsCo(HELP_LIVE_NUMBERS.fiscalUvtThreshold)} UVT)`,
            description: `Muestra avisos preventivos al cruzar ${HELP_LIVE_NUMBERS.fiscalWatchPct} %, ${HELP_LIVE_NUMBERS.fiscalWarningPct} % o ${HELP_LIVE_NUMBERS.fiscalCriticalPct} % del tope anual.`,
            interpretation:
              "Escala al contador con antelación cuando se active nivel de observación o advertencia.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "gestionar-jornada",
        title: "Operar la rutina diaria desde Bandeja Hoy",
        goal: "Despejar riesgos legales, destrabar producción y dejar trazabilidad limpia al cerrar el día.",
        route: "/admin/hoy",
        steps: [
          "Abre Bandeja Hoy al iniciar turno y atiende de inmediato cualquier ítem vencido de Retractos, Garantías o Soporte.",
          "Limpia la cola de Moderación (/admin/moderacion) para no frenar a Taller de Impresión.",
          "Abre los pedidos listos para taller o despacho (/admin/pedidos) antes de la hora límite de recogida/ruta local.",
          "Ejecuta tus tareas CRM de Contacto 360 u Oportunidades B2B y regístralas en su ficha antes de marcarlas hechas.",
          "Si un bloqueo excede tu rol (ej. reembolso final o pago directo B2B con MFA), deja nota clara con número de pedido y escala a Superadmin.",
        ],
        expected:
          "Terminas el bloque con cero SLAs desatendidos, taller alimentado y pendientes escalados con contexto verificable.",
      },
    ],
    cautions: [
      "Marcar una tarea CRM como completada NO cambia el estado del pedido, ticket, garantía ni oportunidad.",
    ],
    dontTouch: [
      "No pospongas fechas de tareas vencidas repetidamente sin contactar al cliente o registrar el bloqueo real.",
      "No pegues datos personales sensibles (documentos, teléfonos, direcciones) en títulos cortos de tareas internas.",
    ],
    checklist: [
      "Cero retractos, garantías o tickets Hábeas Data vencidos sin gestión.",
      "Cola de Moderación despejada para Taller.",
      "Tareas CRM del día cerradas o reprogramadas con nota real en Contacto 360.",
    ],
    faqs: [
      {
        question: "¿Por qué mi compañero ve tarjetas distintas en Bandeja Hoy?",
        answer:
          "Porque el servidor filtra cada bloque según las capacidades RBAC de tu rol (por ejemplo, Taller ve producción y moderación, mientras Finanzas ve remesas COD y pasivos posventa).",
      },
      {
        question: "¿Por qué sigue apareciendo una alerta después de abrirla?",
        answer:
          "Porque Bandeja Hoy lee el estado real en vivo: desaparece automáticamente cuando apruebas el diseño, despachas el pedido, respondes el ticket o concilias la remesa.",
      },
    ],
    related: ["dashboard", "pedidos", "moderacion", "soporte", "garantias", "retractos"],
    relatedPlaybooks: [
      "playbook-pedido-web-300dpi",
      "playbook-posventa-ley-1480-1581",
      "playbook-oportunidad-b2b-cierre",
    ],
    keywords: ["agenda", "rutina", "hoy", "pendientes", "tareas", "SLA", "vencidos", "prioridad"],
    version: 2,
  },
  {
    id: "notificaciones",
    title: "Notificaciones",
    area: "Operación",
    route: "/admin/notificaciones",
    summary:
      "Bandeja interna de eventos recientes (pedidos, pagos B2B, stock bajo, alertas técnicas y resumen diario) acotada a tu rol.",
    purpose:
      "Registra en orden cronológico los avisos emitidos por el sistema cuyo destino (`actionUrl`) pertenece a los módulos autorizados para tu rol, evitando badges fantasma de áreas ajenas. Marcar como leída limpia tu contador personal sin apagar la alerta de fondo.",
    whenToUse: [
      "Cuando el contador numérico del menú lateral muestre avisos pendientes.",
      "Para saltar con un clic al pedido, insumo, oportunidad o incidente que disparó un aviso.",
      "Para revisar el pulso de eventos de los últimos 14 días.",
    ],
    concepts: [
      {
        term: "Alcance RBAC del badge",
        definition: "Solo cuentas y visualizas notificaciones de rutas que tu rol puede abrir.",
      },
      {
        term: "Lectura personal vs resolución operativa",
        definition:
          "Marcar como leída despeja tu campana, pero el pedido, stock o incidente sigue abierto hasta que se gestione en su módulo.",
      },
    ],
    sections: [
      {
        id: "bandeja",
        title: "Severidad, enlace directo y control de lectura",
        summary: "Triaje rápido entre avisos informativos, advertencias y alertas críticas.",
        topics: [
          {
            id: "severidad",
            label: "Nivel de severidad",
            description:
              "Diferencia eventos rutinarios (nuevo pedido) frente a advertencias (bajo stock, pago directo B2B reportado) o incidentes críticos.",
            interpretation: "Abre siempre primero los avisos críticos y de pagos o posventa.",
          },
          {
            id: "accion",
            label: "Salto directo al registro",
            description:
              "Lleva exactamente al detalle de la orden, oportunidad, inventario o panel de observabilidad.",
            interpretation:
              "Valida que nadie más del equipo lo haya atendido ya antes de repetir una acción.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "atender-notificacion",
        title: "Procesar avisos sin perder alertas críticas",
        goal: "Mantener el contador en cero habiendo encaminado cada evento real.",
        route: "/admin/notificaciones",
        steps: [
          "Revisa primero las notificaciones críticas o de advertencia antes que las informativas.",
          "Haz clic en el enlace de destino y confirma el estado actual del registro.",
          "Ejecuta la gestión necesaria en el módulo correspondiente.",
          "Marca la notificación como leída únicamente cuando ya haya quedado atendida o asignada.",
        ],
        expected: "Tu campana refleja únicamente novedades reales aún no revisadas.",
      },
    ],
    cautions: [
      "Evita usar «Marcar todas como leídas» al inicio del día sin antes barrer las alertas rojas o ámbar.",
    ],
    dontTouch: [
      "No asumas que marcar una alerta técnica como leída detiene los avisos del dead-man switch en Salud técnica.",
    ],
    checklist: [
      "Revisé todas las notificaciones críticas y de pagos reportados antes de limpiar el listado.",
    ],
    faqs: [
      {
        question: "¿Si marco una notificación como leída desaparece para los demás?",
        answer:
          "Mantén presente el alcance del centro de avisos: revisa siempre el estado vivo del pedido o ticket para coordinarte con el resto del equipo.",
      },
    ],
    related: ["hoy", "dashboard", "observability", "pedidos"],
    keywords: ["campana", "avisos", "alertas", "sin leer", "notificaciones"],
    version: 2,
  },
  {
    id: "ayuda",
    title: "Centro de ayuda",
    area: "Operación",
    route: "/admin/ayuda",
    summary:
      "Manual operativo vivo: rutina Día 1 por rol, los 8 Flujos E2E, guías por pantalla/subruta, glosario y reglas clave.",
    purpose:
      "Entrena desde cero a cualquier integrante nuevo según su rol y sirve como manual de consulta inmediata para operación compleja, plazos legales, fórmulas de margen y casos borde. Todo el contenido vive junto al código y se verifica automáticamente en pruebas.",
    whenToUse: [
      "En tu primer día para completar la pestaña Día 1 y Rutina Diaria de tu rol.",
      "Cuando necesites ejecutar de punta a punta un proceso transversal en la pestaña Flujos E2E.",
      "Desde cualquier pantalla pulsando `? Ayuda` (o la tecla `?`) para ver qué hace esa vista o subruta exacta y qué NO tocar.",
      "Como Superadmin, usando el selector «Ver ayuda como rol…» para auditar y capacitar a cada perfil del equipo.",
    ],
    concepts: [
      {
        term: "Ayuda contextual en vivo (`?`)",
        definition:
          "El botón flotante detecta en tiempo real la ruta y subruta actual (incluidos detalles y formularios) sin recargar el navegador.",
      },
      {
        term: "Playbook E2E",
        definition:
          "Guía transversal paso a paso que cruza varios módulos de principio a fin con responsables por rol, compuertas MFA y enlaces directos.",
      },
      {
        term: "Checklist con progreso guardado",
        definition:
          "Lista interactiva por guía o flujo cuyo avance queda guardado en tu usuario sin ejecutar jamás acciones comerciales por su cuenta.",
      },
    ],
    sections: [
      {
        id: "pilares",
        title: "Los 4 pilares del Centro de ayuda",
        summary: "Diseñados para responder en segundos tanto en inducción como en incidentes.",
        topics: [
          {
            id: "dia-1",
            label: "1. Día 1 y Rutina Diaria",
            description:
              "Explica tu misión, datos protegidos por Ley 1581, orden exacto de trabajo por franjas del día y qué nunca debes tocar.",
            interpretation:
              "Ideal para incorporar a una persona nueva sin depender de explicaciones improvisadas.",
          },
          {
            id: "playbooks",
            label: "2. Flujos E2E (Playbooks)",
            description:
              "Cubre los 8 recorridos transversales del negocio (Pedido 300 DPI, B2B + Bre-B/DIAN, COD, Posventa legal, BOM/Precios, Catálogo, Lifecycle e Incidentes).",
            interpretation:
              "Resalta qué pasos ejecuta tu rol y qué pasos entrega o recibe de otra área.",
          },
          {
            id: "modulos-referencia",
            label: "3. Manuales por Módulo y 4. Referencia Rápida",
            description:
              "Diccionario completo de cada pantalla y subruta, más tabla maestra de SLAs legales, topes numéricos, matriz de roles, glosario A–Z y atajos (`⌘K`, `?`).",
            interpretation:
              "Usa el buscador superior instantáneo (sin tildes) para filtrar los 4 pilares al mismo tiempo.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "consultar-guia",
        title: "Sacar el máximo provecho en operación o capacitación",
        goal: "Resolver dudas en segundos y entrenar con cero riesgo operativo.",
        route: "/admin/ayuda",
        steps: [
          "Desde cualquier pantalla del panel pulsa la tecla `?` o el botón `? Ayuda` para abrir la ficha exacta de esa ruta o subruta.",
          "Cuando entres por primera vez (o entrenes a alguien), completa la pestaña Día 1 y Rutina Diaria de ese rol.",
          "Antes de ejecutar un caso complejo (ej. cierre B2B con retención, retracto o escala mayorista), abre su Flujo E2E y marca el checklist paso a paso.",
          "Si detectas algo confuso, deja retroalimentación al final de la guía sin escribir datos reales de clientes.",
        ],
        expected:
          "Operas con seguridad jurídica, técnica y comercial sin adivinar estados ni permisos.",
      },
    ],
    cautions: [
      "Ningún checklist del Centro de ayuda modifica pedidos, pagos ni configuraciones reales.",
    ],
    dontTouch: [
      "Nunca pegues nombres, correos, teléfonos, direcciones ni llaves privadas en la caja de comentarios de retroalimentación de una guía.",
    ],
    checklist: [
      "Revisé la pestaña Día 1 y Rutina Diaria de mi rol.",
      "Probé abrir la ayuda contextual con `?` y saltar entre módulos con `⌘K` / `Ctrl+K`.",
    ],
    faqs: [
      {
        question:
          "¿Qué hace el botón flotante cuando ya estoy leyendo una guía larga dentro de /admin/ayuda?",
        answer:
          "Se oculta en la portada principal para no estorbar y, cuando entras al detalle de una guía o flujo E2E, se convierte en «Índice rápido» para saltar a otro tema sin perder tiempo.",
      },
      {
        question: "¿Cómo sé qué guías ve una persona de Taller o Soporte?",
        answer:
          "Si eres Superadmin, usa el selector «Ver ayuda como rol…» en la parte superior de /admin/ayuda para inspeccionar exactamente su experiencia filtrada.",
      },
    ],
    related: ["hoy", "dashboard", "seguridad", "usuarios"],
    keywords: [
      "manual",
      "aprender",
      "onboarding",
      "rutina",
      "flujos",
      "playbook",
      "glosario",
      "atajos",
    ],
    version: 2,
  },
];
