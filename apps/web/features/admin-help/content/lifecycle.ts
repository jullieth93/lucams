import { HELP_LIVE_NUMBERS } from "../constants";
import type { AdminModuleGuide } from "../types";

export const LIFECYCLE_GUIDE: AdminModuleGuide = {
  id: "lifecycle",
  title: "Lifecycle Journeys",
  area: "Marketing",
  route: "/admin/lifecycle",
  summary: `Automatizaciones por comportamiento (activación, recompra, reactivación, intención y B2B) con opt-in Ley 1581, \`DRY_RUN\` en STG y atribución a ${HELP_LIVE_NUMBERS.lifecycleAttributionWindowDays} días.`,
  purpose:
    "Ejecuta cada 15 minutos recorridos multi-paso con reserva transaccional de límite diario en PostgreSQL, horario de silencio Colombia, verificación de consentimiento `NEWSLETTER` en cada paso comercial, delegación automática frente a Carritos/Reposición para cero duplicados, tareas CRM B2B idempotentes y atribución única de pedidos pagados.",
  whenToUse: [
    "Para activar, pausar, editar o crear recorridos automáticos de relación con clientes y prospectos B2B.",
    "Para probar un paso con MFA (en STG simula en `DRY_RUN`; en PRD envía prueba controlada).",
    "Para reintentar mensajes fallidos o auditar conversión e ingresos en modo 0-PII (`FINANCE_ANALYST`).",
  ],
  concepts: [
    {
      term: "Semilla siempre en DRAFT y activación humana + MFA",
      definition:
        "Ningún despliegue ni semilla enciende envíos por su cuenta: activar un recorrido o tocar el interruptor global exige decisión humana con MFA reciente.",
    },
    {
      term: "Modo DRY_RUN forzado en STG",
      definition:
        "En ambientes Preview/STG el motor evalúa audiencias y pasos sin llamar jamás a Resend ni crear tareas reales.",
    },
    {
      term: "Delegación anti-duplicado",
      definition:
        "Si el contacto ya tiene un carrito abandonado activo o alerta `back-in-stock` lista, la inscripción sale con `DELEGATED_CART_RECOVERY` o `DELEGATED_BACK_IN_STOCK` para no enviarle doble correo.",
    },
    {
      term: `Atribución única de último clic (${HELP_LIVE_NUMBERS.lifecycleAttributionWindowDays} días)`,
      definition: `Una orden pagada dentro de ${HELP_LIVE_NUMBERS.lifecycleAttributionWindowDays} días posteriores a un clic en \`/j/[token]\` se adjudica a un único mensaje (\`convertedOrderId\` único); un clic posterior a la compra nunca roba atribución.`,
    },
  ],
  sections: [
    {
      id: "configuracion",
      title: "Interruptor global, disparadores, consentimiento y silencio",
      summary: "Salvaguardas legales y técnicas antes de emitir un solo mensaje.",
      topics: [
        {
          id: "control-general",
          label: "Killswitch y tope diario global por contacto",
          description: `Reserva en base de datos el cupo diario en hora Bogotá entre todos los recorridos; modificarlo exige MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
          caution:
            "Ante cualquier degradación de Resend o ajuste masivo de catálogo, puedes pausar todo el motor desde este interruptor.",
        },
        {
          id: "optin-comercial",
          label: "Revalidación Ley 1581 y supresión instantánea",
          description:
            "Antes de cada paso comercial vuelve a comprobar opt-in vigente; cualquier baja, rebote duro o queja cancela al instante mensajes pendientes y bloquea reanudaciones.",
          interpretation: "Solo una pausa manual administrativa puede reanudarse.",
        },
      ],
    },
    {
      id: "pasos",
      title: "Constructor de pasos, variables y rutas seguras",
      summary: "Texto escapado, saludo `{nombre}` y botones hacia rutas internas verificadas.",
      topics: [
        {
          id: "contenido-cta",
          label: "Espera en minutos, condición y ruta interna (`/productos`, `/recomendador`…)",
          description:
            "No admite HTML crudo por seguridad; el botón exige ruta interna iniciada con `/` y envuelve el enlace en token HMAC opaco sin PII en la URL.",
          interpretation:
            "Usa `1440` min para 1 día y `10080` min para 7 días; el motor respeta siempre el horario de silencio nocturno.",
        },
      ],
    },
    {
      id: "operacion",
      title: "Inscripciones, reintentos y atribución 0-PII",
      summary: "Trazabilidad desde aceptación en Resend hasta pedido pagado.",
      topics: [
        {
          id: "mensajes-metricas",
          label: "Enviado vs Entregado vs Convertido",
          description: "Cruza webhooks firmados de Resend (`EmailEvent`) y órdenes pagadas reales.",
          caution:
            "Si el circuit breaker de Resend está abierto, espera a que recupere salud en /admin/observability antes de pulsar Reintentar.",
        },
      ],
    },
  ],
  procedures: [
    {
      id: "crear-activar",
      title: "Configurar, probar y activar un recorrido Lifecycle",
      goal: "Encender una automatización segura, con audiencia validada y cero spam.",
      route: "/admin/lifecycle",
      roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"],
      steps: [
        "Revisa el interruptor general y el límite diario global en /admin/lifecycle.",
        "Crea o abre el recorrido en estado Borrador (`DRAFT`), define disparador, consentimiento requerido, ventanas, cooldown y horario de silencio.",
        "Configura cada paso con espera en minutos, condición, textos claros con `{nombre}` y ruta interna válida (`/...`).",
        "Guarda el borrador, inspecciona la estimación de audiencia elegible y abre la vista previa de cada paso.",
        `Ejecuta una prueba con MFA reciente (tope ${HELP_LIVE_NUMBERS.emailTestHourlyLimit}/hora; recuerda que en STG queda en DRY_RUN).`,
        `Activa el recorrido confirmando MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min) y audita las primeras inscripciones.`,
      ],
      expected:
        "El motor inscribe y envía únicamente a titulares elegibles dentro de horario y cupo diario.",
    },
    {
      id: "editar",
      title: "Versionar un recorrido activo sin corromper inscripciones en curso",
      goal: "Actualizar pasos conservando historial íntegro.",
      route: "/admin/lifecycle",
      roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"],
      steps: [
        "Abre el detalle del recorrido (`/admin/lifecycle/[id]`) y ajusta textos, tiempos o pasos futuros.",
        "Respeta los pasos que ya tienen mensajes históricos o inscripciones paradas en ellos (el servidor bloquea borrarlos).",
        "Guarda para incrementar versión y revisa próximas ejecuciones.",
      ],
      expected: "Nueva versión activa sin huérfanos ni reenvíos accidentales.",
    },
    {
      id: "reintentar",
      title: "Reintentar un mensaje fallido con idempotencia",
      goal: "Recuperar un fallo puntual de red conservando la instantánea exacta.",
      route: "/admin/lifecycle",
      roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"],
      steps: [
        "Comprueba primero en /admin/observability que Resend esté operativo.",
        "Ubica el mensaje fallido (que no haya sido cancelado por baja/rebote).",
        `Pulsa Reintentar confirmando MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
      ],
      expected: "El mensaje se reencola con su misma clave de deduplicación sin duplicar correos.",
    },
    {
      id: "auditar-lifecycle-finanzas",
      title: "Auditar ingresos atribuidos en modo contable 0-PII",
      goal: "Conciliar órdenes atribuidas a Lifecycle sin ver identidades personales.",
      route: "/admin/lifecycle",
      roles: ["FINANCE_ANALYST", "SUPERADMIN"],
      steps: [
        "Revisa el embudo global y el ingreso atribuido por recorrido.",
        "Filtra o inspecciona las inscripciones convertidas dentro de la ventana de 30 días.",
        "Haz clic en el pedido convertido (`LCM`) para cruzar su cobro real en /admin/finanzas.",
      ],
      expected: "Cada peso atribuido corresponde a una única orden efectivamente pagada.",
    },
  ],
  cautions: [
    "En producción, activar un recorrido sobre una ventana amplia puede inscribir de inmediato a todos los contactos que cumplan la condición.",
  ],
  dontTouch: [
    "Nunca desactives «Consentimiento requerido» en pasos con contenido promocional o descuentos: violaría la Ley 1581.",
    "No crees recorridos que repitan recordatorios de carrito abandonado o avisos de stock: esos flujos ya están delegados.",
    "No pulses Reintentar en ráfaga mientras Resend aparezca degradado.",
  ],
  checklist: [
    "Clasificación Comercial vs Transaccional y opt-in Ley 1581 verificados.",
    "Audiencia estimada y vista previa móvil revisadas en Borrador.",
    "Horario de silencio nocturno Colombia activo.",
    "Activación confirmada con MFA reciente.",
  ],
  subroutes: [
    {
      id: "lifecycle-nuevo",
      pattern: "/admin/lifecycle/nuevo",
      title: "Creación de nuevo recorrido en Borrador",
      summary:
        "Defines disparador, reglas de elegibilidad, consentimiento y pasos iniciales; al guardar nace siempre en `DRAFT`.",
      tips: [
        "Guarda primero en Borrador para poder inspeccionar la audiencia elegible real y previsualizar cada correo antes de activar.",
        "Elige una clave (`slug`) descriptiva y estable.",
      ],
      highlightSectionIds: ["configuracion", "pasos"],
      highlightProcedureIds: ["crear-activar"],
    },
    {
      id: "lifecycle-detalle",
      pattern: "/admin/lifecycle/[id]",
      title: "Operación, pasos, audiencia y atribución del recorrido",
      summary:
        "Gestionas versiones de pasos, pruebas MFA, pausa/activación, inscripciones activas, reintentos y órdenes atribuidas de este recorrido.",
      tips: [
        "No podrás eliminar un paso que ya tenga mensajes emitidos o contactos actualmente posicionados en él; edita su contenido o pausa el recorrido.",
        "En STG verás ejecuciones marcadas `DRY_RUN` porque el envío externo está bloqueado por diseño.",
      ],
      highlightSectionIds: ["pasos", "operacion"],
      highlightProcedureIds: ["editar", "reintentar"],
    },
  ],
  faqs: [
    {
      question:
        "¿Por qué STG nunca envía correos reales de Lifecycle ni siquiera en el botón de prueba?",
      answer:
        "Por blindaje de ambiente (`ADR-198`): Preview/STG fuerza `DRY_RUN` absoluto para garantizar cero contacto accidental hacia clientes reales.",
    },
    {
      question: "¿Puede una misma compra sumarse a dos mensajes o dos recorridos?",
      answer:
        "No. `LifecycleMessage.convertedOrderId` tiene restricción única en base de datos y adjudica solo al último clic previo a la compra dentro de 30 días.",
    },
  ],
  related: [
    "segmentos",
    "carritos",
    "suscriptores",
    "metricas",
    "email-templates",
    "observability",
  ],
  relatedPlaybooks: ["playbook-audiencias-carritos-lifecycle", "playbook-oportunidad-b2b-cierre"],
  keywords: [
    "journey",
    "recorrido",
    "lifecycle",
    "automatización",
    "activación",
    "recompra",
    "reactivación",
    "DRY_RUN",
    "atribución",
  ],
  version: 6,
};
