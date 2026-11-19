import { HELP_LIVE_NUMBERS } from "../constants";
import type { AdminModuleGuide } from "../types";

export const MARKETING_GUIDES: AdminModuleGuide[] = [
  {
    id: "cupones",
    title: "Cupones",
    area: "Marketing",
    route: "/admin/cupones",
    summary:
      "Códigos promocionales de campaña y cupones personales intransferibles (`REF-*`) con auditoría 360° (mutación Superadmin).",
    purpose:
      "Gobierna las promociones por código en el checkout (porcentaje, monto fijo en COP o envío gratis), evaluando vigencia estricta en hora Colombia y serializando el tope por cliente con bloqueo transaccional en PostgreSQL. Superadmin crea, pausa y archiva; Operaciones y Finanzas auditan campañas y redenciones según sus permisos de PII.",
    whenToUse: [
      "Para lanzar, pausar o archivar una campaña promocional acotada.",
      "Para auditar cuántas órdenes pagadas redimieron un código y verificar si es público o personal (`REF-*`).",
      "Cuando un comprador consulte por qué su cupón fue rechazado en el checkout.",
    ],
    concepts: [
      {
        term: "Cupón personal no transferible",
        definition:
          "Código ligado a un titular específico (como los emitidos por «Invita y gana»): jamás aparece en listados públicos y solo puede redimirlo esa cuenta o correo.",
      },
      {
        term: "Prelación frente a escalas y puntos",
        definition:
          "En el carrito primero aplica la escala mayorista de volumen, luego el cupón sobre los productos elegibles y finalmente los Puntos Lucams sobre el subtotal restante.",
      },
      {
        term: "Bloqueo anti-carrera (`advisory lock`)",
        definition:
          "Impide que dos checkouts simultáneos superen `maxUses` o `maxUsesPerCustomer`.",
      },
    ],
    sections: [
      {
        id: "reglas",
        title: "Parámetros de campaña e historial de redenciones",
        summary: "Protege el margen definiendo topes, alcance y vigencia en Bogotá (-05:00).",
        topics: [
          {
            id: "visibilidad-beneficio",
            label: "Código, visibilidad pública y tipo de beneficio",
            description:
              "Define si el cupón se anuncia públicamente o se entrega en privado, y si descuenta %, monto fijo COP o envío gratis.",
            caution:
              "Simula siempre qué ocurre si el comprador combina este cupón con una escala de /admin/mayorista.",
          },
          {
            id: "vigencia-alcance",
            label: "Vigencia COT, compra mínima y restricción por catálogo",
            description:
              "Acota fechas en hora Colombia, subtotal/unidades mínimas y slugs específicos de productos o categorías.",
            interpretation:
              "Usa Pausar para frenar de inmediato un código activo; reserva Archivar (con MFA) para cierre definitivo en solo lectura.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-cupon",
        title: "Crear, supervisar y cerrar un cupón sin erosionar margen",
        goal: "Lanzar un incentivo controlado y auditable de principio a fin.",
        route: "/admin/cupones",
        roles: ["SUPERADMIN"],
        steps: [
          "Revisa en /admin/costos y /admin/mayorista el margen actual de los productos elegibles.",
          "Define código claro, beneficio, fechas en hora Colombia, compra mínima y topes global/por cliente (`por cliente ≤ global`).",
          "Activa «Cupón público» únicamente si deseas exponerlo abiertamente en la tienda.",
          "Monitorea el avance de redenciones y, al concluir la campaña, pausa o archiva con MFA reciente.",
        ],
        expected:
          "El descuento aplica solo dentro de las reglas definidas y cada uso queda vinculado al pedido pagado.",
      },
    ],
    cautions: [
      `Archivar un cupón exige MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min) e impide volver a editarlo.`,
    ],
    dontTouch: [
      "No modifiques a la baja las condiciones de un cupón público ya anunciado en una campaña vigente (riesgo de publicidad engañosa Ley 1480): páusalo o respeta lo anunciado.",
      "No entregues un cupón `REF-*` de un cliente a otra persona: el checkout lo bloqueará por titularidad.",
    ],
    checklist: [
      "Margen combinado contra escalas mayoristas revisado.",
      "Límite total y límite por comprador configurados.",
      "Fechas verificadas en hora Colombia.",
    ],
    subroutes: [
      {
        id: "cupon-detalle",
        pattern: "/admin/cupones/[id]",
        title: "Edición y auditoría de redenciones del cupón",
        summary:
          "Inspeccionas los pedidos reales donde se redimió este código y ajustas (si eres Superadmin y no está archivado) su vigencia o estado.",
        tips: [
          "Si un cupón ya tiene usos históricos, evita cambiar su porcentaje o monto para no distorsionar análisis de campaña: crea un código nuevo para la siguiente ola.",
        ],
        highlightSectionIds: ["reglas"],
        highlightProcedureIds: ["publicar-cupon"],
      },
    ],
    faqs: [
      {
        question: "¿Si un pedido con cupón expira sin pagar, el cliente pierde su uso?",
        answer:
          "No. Al expirar o cancelarse una orden no pagada, la saga libera la reserva de `CouponUsage` para que el comprador pueda volver a utilizarlo si sigue vigente.",
      },
    ],
    related: ["costos", "mayorista", "fidelizacion", "pedidos"],
    relatedPlaybooks: ["playbook-economia-bom-precios-promos"],
    keywords: ["cupón", "descuento", "promoción", "código", "vigencia", "REF", "redención"],
    version: 2,
  },
  {
    id: "fidelizacion",
    title: "Fidelización",
    area: "Marketing",
    route: "/admin/fidelizacion",
    summary: `Gobierno de «Puntos Lucams» (tope anti-abuso ≤ ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} %), pasivo contable en COP e «Invita y gana» (mutación Superadmin + MFA).`,
    purpose: `Administra las reglas económicas de acumulación/redención de puntos (con retrocrédito de ${HELP_LIVE_NUMBERS.loyaltyRetroEarnWindowDays} días y reversión proporcional en cancelaciones/retractos) y el programa de referidos \`/r/[codigo]\`, auditando en tiempo real el pasivo equivalente en pesos.`,
    whenToUse: [
      "Para activar o ajustar las tasas de Puntos Lucams o los beneficios de «Invita y gana» con el simulador en vivo.",
      "Para auditar el pasivo total en COP de los puntos activos en circulación.",
      "Para revisar emisiones, canjes y conversiones de referidos de los últimos 14 días.",
    ],
    concepts: [
      {
        term: `Candado servidor ≤ ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} %`,
        definition: `Impide guardar cualquier combinación de tasa de acumulación y redención cuyo retorno efectivo supere el ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} % de la compra.`,
      },
      {
        term: "Exclusión B2B y fletes",
        definition:
          "Los puntos nunca cubren el valor del envío y no aplican en órdenes originadas desde propuestas corporativas B2B.",
      },
      {
        term: `Ventana de retrocrédito (${HELP_LIVE_NUMBERS.loyaltyRetroEarnWindowDays} días)`,
        definition: `Permite acreditar compras elegibles recientes al verificar identidad dentro de la ventana de ${HELP_LIVE_NUMBERS.loyaltyRetroEarnWindowDays} días.`,
      },
    ],
    sections: [
      {
        id: "programa",
        title: "Simulador financiero, referidos y libro mayor",
        summary: "Toda modificación exige Superadmin y código MFA reciente.",
        topics: [
          {
            id: "tasas",
            label: "Simulador de cashback real y umbrales",
            description:
              "Muestra en vivo cuánto equivale 1 punto en pesos y qué % máximo del subtotal tras cupón puede cubrirse.",
            caution:
              "Comprueba el pasivo acumulado antes de aumentar el valor en pesos de cada punto ya emitido.",
          },
          {
            id: "referidos",
            label: "Invita y gana (`/r/[codigo]`)",
            description:
              "Configura el % OFF y días de validez de los cupones personales para invitado y anfitrión.",
            interpretation:
              "Cambiar estos valores aplica a nuevos referidos; los cupones ya emitidos respetan su promesa original.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "validar-programa",
        title: "Ajustar tasas de fidelización o referidos con control financiero",
        goal: "Incentivar recompra protegiendo margen bruto y pasivo contable.",
        route: "/admin/fidelizacion",
        roles: ["SUPERADMIN"],
        steps: [
          "Consulta el pasivo equivalente vigente en COP y el pulso de emisión vs canje.",
          `Simula las nuevas tasas verificando que el retorno efectivo quede muy por debajo del tope duro del ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} % y sea sostenible junto con Mayorista y Cupones.`,
          `Pulsa Guardar configuración e ingresa tu código MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
          "Confirma la traza en /admin/auditoria.",
        ],
        expected:
          "Las tasas actualizadas rigen inmediatamente para próximas compras y redenciones sin romper saldos históricos.",
      },
    ],
    cautions: [
      "Aumentar el valor de redención de cada punto incrementa instantáneamente el pasivo en COP de todos los saldos activos.",
    ],
    dontTouch: [
      "Nunca hagas compras ficticias con cuentas reales para probar puntos o referidos en producción.",
      "No prometas redención de puntos sobre costos de envío ni sobre propuestas B2B.",
    ],
    checklist: [
      `Retorno simulado dentro de margen sano (≤ ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} %).`,
      "Impacto sobre el pasivo contable vigente revisado.",
      "Cambio sellado con MFA y auditado.",
    ],
    faqs: [
      {
        question: "¿Qué pasa si un cliente usa puntos en un checkout que luego no paga?",
        answer:
          "Los puntos quedan reservados mientras la orden está pendiente; cuando expira o se cancela, la saga los devuelve íntegramente a su balance.",
      },
    ],
    related: ["cupones", "mayorista", "retractos", "finanzas", "auditoria"],
    relatedPlaybooks: ["playbook-economia-bom-precios-promos"],
    keywords: [
      "puntos",
      "Puntos Lucams",
      "lealtad",
      "referidos",
      "invita y gana",
      "pasivo",
      "cashback",
    ],
    version: 2,
  },
  {
    id: "suscriptores",
    title: "Suscriptores",
    area: "Marketing",
    route: "/admin/marketing/suscriptores",
    summary:
      "Audiencia con consentimiento `NEWSLETTER` Ley 1581, bajas automáticas, exclusión de rebotes y Ledger SIC con MFA.",
    purpose:
      "Muestra la base verificable de titulares que otorgaron opt-in expreso al boletín, con versión del aviso legal, estado activo vs baja y dos exportaciones auditadas con MFA: audiencia comercial limpia y Ledger regulatorio histórico para la SIC.",
    whenToUse: [
      "Para exportar una lista limpia antes de enviar una campaña en plataforma autorizada.",
      "Para acreditar prueba de consentimiento o fecha de baja ante una consulta Ley 1581 o requerimiento SIC.",
    ],
    concepts: [
      {
        term: "Opt-in expreso Ley 1581",
        definition:
          "Haber comprado o tener cuenta NO autoriza marketing: solo entran quienes aceptaron explícitamente la finalidad `NEWSLETTER` sin revocación posterior.",
      },
      {
        term: "Exclusión por entregabilidad e `isStaff`",
        definition:
          "El CSV comercial omite automáticamente dados de baja, correos con rebote duro o queja en Resend y cuentas administrativas internas.",
      },
    ],
    sections: [
      {
        id: "audiencia",
        title: "Estado de consentimiento y exportaciones protegidas",
        summary: "Protege cumplimiento de Hábeas Data y reputación del dominio de envío.",
        topics: [
          {
            id: "export",
            label: "Exportar activos (Ley 1581) vs Ledger SIC",
            description: `Ambas descargas exigen MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min) y dejan registro en Auditoría; el Ledger SIC completo es exclusivo de Superadmin.`,
            caution:
              "Nunca uses el Ledger histórico SIC para despachar campañas: contiene bajas que está prohibido contactar.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "exportar-audiencia",
        title: "Exportar audiencia limpia para campaña comercial",
        goal: "Utilizar únicamente destinatarios con opt-in activo y sin rebote.",
        route: "/admin/marketing/suscriptores",
        steps: [
          "Revisa el pulso de altas y bajas de los últimos 14 días.",
          `Usa exclusivamente el botón «Exportar activos (Ley 1581)» y confirma tu MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
          "Custodia el archivo CSV durante la carga inmediata y elimina copias locales al terminar.",
        ],
        expected: "Cero envíos a personas dadas de baja, cuentas del staff o buzones rebotados.",
      },
    ],
    cautions: [
      "Toda exportación de suscriptores es una lectura sensible de PII auditada en `/admin/auditoria`.",
    ],
    dontTouch: [
      "Jamás uses el archivo «Ledger SIC (histórico)» para enviar correos promocionales.",
      "Jamás reactives manualmente a una persona que solicitó su baja sin un nuevo opt-in directo del titular.",
    ],
    checklist: [
      "Usé el botón «Exportar activos (Ley 1581)» (no el Ledger histórico).",
      "Eliminé el CSV descargado del equipo local tras usar la audiencia.",
    ],
    faqs: [
      {
        question: "¿Funciona la baja en un solo clic desde el correo?",
        answer:
          "Sí. Los correos comerciales implementan cabeceras RFC 8058 y enlace firmado de baja inmediata sin exigir login.",
      },
    ],
    related: ["segmentos", "lifecycle", "clientes", "auditoria"],
    relatedPlaybooks: ["playbook-audiencias-carritos-lifecycle"],
    keywords: ["newsletter", "suscriptores", "opt-in", "baja", "CSV", "SIC", "Ley 1581"],
    version: 3,
  },
  {
    id: "segmentos",
    title: "Segmentos CRM",
    area: "Marketing",
    route: "/admin/marketing/segmentos",
    summary:
      "Audiencias dinámicas (VIP, regalos, reactivación 90d, ocasión anual, alta intención) filtradas por opt-in Ley 1581 y MFA.",
    purpose:
      "Cruza el comportamiento real en Contacto 360 con consentimiento comercial vigente, ausencia de rebotes/quejas y exclusión de staff (`isStaff`), entregando segmentos listos y legales para acciones dirigidas.",
    whenToUse: [
      "Para dimensionar campañas puntuales sobre clientes VIP, compradores de regalos o inactivos.",
      "Para contrastar audiencias antes de activar un recorrido automatizado en Lifecycle Journeys.",
    ],
    concepts: [
      {
        term: "Elegibilidad triple",
        definition:
          "Para aparecer y exportarse en un segmento, el contacto debe cumplir la regla de negocio + tener opt-in `NEWSLETTER` vigente + no tener rebote/queja ni ser `isStaff`.",
      },
    ],
    sections: [
      {
        id: "criterios",
        title: "Lectura de segmentos y exportación segura",
        summary: "Evita quemar la base completa enviando solo a quien aplica.",
        topics: [
          {
            id: "grupos",
            label: "Definición de cada segmento",
            description:
              "Separa alto valor histórico (VIP), afinidad regalo, reactivación y alta intención sin compra.",
            interpretation:
              "Antes de hacer un envío manual puntual, verifica en /admin/lifecycle si ya tienes un recorrido automático activo cubriendo ese mismo comportamiento.",
          },
          {
            id: "export",
            label: `Exportación CSV con MFA (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min)`,
            description:
              "Genera el corte exacto en el instante actual y traza la descarga en Auditoría.",
            caution:
              "No reutilices un CSV exportado semanas atrás: las personas que se dieron de baja después ya no estarían filtradas.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "usar-segmento",
        title: "Exportar un segmento fresco sin solapar con Lifecycle",
        goal: "Ejecutar campañas relevantes respetando bajas recientes y frecuencia.",
        route: "/admin/marketing/segmentos",
        steps: [
          "Confirma en /admin/lifecycle que no estés duplicando un mensaje automático activo hacia el mismo público.",
          "Selecciona el segmento objetivo y revisa su conteo vigente.",
          `Descarga el CSV en el mismo momento en que vayas a ejecutar el envío confirmando tu MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
          "Borra la copia local del CSV al concluir.",
        ],
        expected: "La audiencia contactada tiene consentimiento al día y cero cruces innecesarios.",
      },
    ],
    cautions: [
      "Un CSV descargado envejece rápido: si alguien revoca su consentimiento hoy, solo una exportación fresca lo excluye.",
    ],
    dontTouch: [
      "Nunca guardes archivos CSV de segmentos viejos en carpetas compartidas para reutilizarlos meses después.",
    ],
    checklist: [
      "Sin solapamiento con recorridos activos de /admin/lifecycle.",
      "CSV exportado fresco en el día del envío y eliminado tras su uso.",
    ],
    faqs: [
      {
        question: "¿Por qué un cliente VIP que compró mucho no sale en el segmento VIP?",
        answer:
          "Porque no otorgó (o revocó) el consentimiento `NEWSLETTER`, tuvo rebote en Resend o pertenece a una cuenta `isStaff`.",
      },
    ],
    related: ["suscriptores", "lifecycle", "clientes", "metricas"],
    relatedPlaybooks: ["playbook-audiencias-carritos-lifecycle"],
    keywords: ["segmentos", "audiencia", "VIP", "reactivación", "intención", "CRM", "exportar"],
    version: 3,
  },
  {
    id: "carritos",
    title: "Carritos abandonados",
    area: "Marketing",
    route: "/admin/carritos",
    summary:
      "Bandeja de recuperación de carritos con correo capturado, vista previa real, supresión por rebote y atribución 0-PII.",
    purpose:
      "Detecta sesiones de compra que registraron correo pero no completaron pago, permite enviar un recordatorio supervisado con previsualización (o delegarlo al modo automático gobernado por Superadmin) y mide con exactitud cuántos se convirtieron en pedidos pagados.",
    whenToUse: [
      "Diariamente para revisar carritos pendientes elegibles cuando operas en modo supervisado.",
      "Para diagnosticar en qué paso abandonan o por qué hubo rechazos de pago.",
      "Como Finanzas para auditar ingresos recuperados con identidad y fotos privadas redactadas.",
    ],
    concepts: [
      {
        term: "Coordinación con Lifecycle",
        definition:
          "Cuando un contacto tiene un carrito elegible aquí, Lifecycle Journeys delega el aviso (`DELEGATED_CART_RECOVERY`) para jamás enviarle dos correos distintos por lo mismo.",
      },
      {
        term: "Supresión inmediata por rebote o queja",
        definition:
          "Cualquier buzón marcado con rebote duro o queja en Resend queda bloqueado para recordatorios.",
      },
    ],
    sections: [
      {
        id: "bandeja",
        title: "Estados, diagnóstico y envío supervisado",
        summary: "Un recordatorio oportuno, nunca spam repetitivo.",
        topics: [
          {
            id: "estado",
            label: "Pendiente, Recordado, Recuperado y Cerrado",
            description:
              "Muestra la etapa del carrito y enlaza al pedido `LCM` cuando se convierte en compra pagada.",
            interpretation:
              "Si el cliente ya compró por otro carrito reciente, verifica antes de enviar un recordatorio manual.",
          },
          {
            id: "preview-envio",
            label: "Vista previa antes de enviar",
            description:
              "Renderiza el correo exacto que recibirá el cliente; en vista 0-PII (`FINANCE_ANALYST`) las miniaturas privadas del Estudio permanecen ocultas.",
            caution:
              "En STG los envíos automáticos están apagados por seguridad (`CRON_JOBS_DISABLED`).",
          },
        ],
      },
      {
        id: "configuracion",
        title: "Configuración automática (`/admin/carritos/configuracion`)",
        summary: "Gobernada exclusivamente por Superadmin con MFA reciente.",
        topics: [
          {
            id: "acceso-config",
            label: "Interruptor, modo manual/automático y ventanas",
            description:
              "Controla si el job horario `lucams-cart-recovery` despacha solo o deja la cola para revisión humana.",
            interpretation:
              "Entra a /admin/carritos/configuracion si eres Superadmin para ajustar tiempos y encendido.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "recordar-carrito",
        title: "Enviar un recordatorio supervisado de carrito",
        goal: "Recuperar una compra real con un único correo oportuno y verificado.",
        route: "/admin/carritos",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT"],
        steps: [
          "Filtra carritos Pendientes elegibles sin alerta de rebote ni queja.",
          "Abre el detalle del carrito para confirmar ítems, antigüedad y que el cliente no tenga ya una orden pagada reciente.",
          "Abre la vista previa del correo para comprobar enlaces y productos.",
          "Envía el recordatorio una sola vez y confirma que pase a estado Recordado.",
        ],
        expected:
          "El cliente recibe su enlace de retoma y el carrito queda trazado para atribuir la orden si paga.",
      },
      {
        id: "auditar-recuperacion-carritos",
        title: "Auditar recuperación y atribución en modo 0-PII",
        goal: "Medir conversión y pesos recuperados sin acceder a correos ni fotos privadas.",
        route: "/admin/carritos",
        roles: ["FINANCE_ANALYST", "SUPERADMIN"],
        steps: [
          "Consulta la serie de 14 días de carritos detectados frente a recuperados pagados.",
          "Revisa la tasa de conversión sobre contactados.",
          "Salta desde un carrito recuperado al pedido `LCM` para cruzar su ingreso en Finanzas.",
        ],
        expected: "Conciliación exacta del aporte comercial de recuperación de carritos.",
      },
      {
        id: "configurar-recuperacion",
        title: "Configurar la recuperación automática",
        goal: "Definir ventanas seguras de envío automático con MFA.",
        route: "/admin/carritos/configuracion",
        roles: ["SUPERADMIN"],
        steps: [
          "Abre /admin/carritos/configuracion y revisa el interruptor general y el modo activo.",
          "Ajusta la espera mínima tras el abandono para no interrumpir a quien sigue diseñando en el Estudio.",
          `Guarda completando tu verificación MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min) y monitorea las primeras ejecuciones.`,
        ],
        expected:
          "El cron horario procesa solo carritos elegibles dentro de las ventanas autorizadas.",
      },
    ],
    cautions: [
      "Los precios o stock pueden haber cambiado entre el abandono y el momento en que el cliente retoma: el carrito público se auto-sana al reabrirse.",
    ],
    dontTouch: [
      "Nunca envíes recordatorios repetidos por fuera del flujo sobre el mismo carrito.",
      "No contactes manualmente por WhatsApp para cobrar un carrito si el cliente no pidió asistencia.",
    ],
    checklist: [
      "Carrito elegible sin rebote/queja ni compra posterior ya pagada.",
      "Vista previa del correo comprobada antes de enviar.",
    ],
    subroutes: [
      {
        id: "carrito-detalle",
        pattern: "/admin/carritos/[id]",
        title: "Diagnóstico individual y vista previa del carrito",
        summary:
          "Inspeccionas la instantánea de productos, etapa de abandono, eventos de pago y previsualización del correo de este carrito.",
        tips: [
          "Verifica aquí si hubo un intento rechazado en Wompi antes de decidir el seguimiento.",
          "Si el carrito ya tiene orden pagada vinculada, no envíes ningún recordatorio.",
        ],
        highlightSectionIds: ["bandeja"],
        highlightProcedureIds: ["recordar-carrito"],
      },
      {
        id: "carrito-enviar",
        pattern: "/admin/carritos/enviar",
        title: "Despacho supervisado de recordatorios",
        summary: "Confirmas el envío controlado de recordatorios sobre la selección elegible.",
        tips: [
          "Revisa el conteo de destinatarios y comprueba en Salud técnica que Resend esté saludable antes de despachar.",
        ],
        highlightSectionIds: ["bandeja"],
        highlightProcedureIds: ["recordar-carrito"],
      },
    ],
    faqs: [
      {
        question: "¿Por qué en STG no salen recordatorios automáticos?",
        answer:
          "Porque `lucams-cart-recovery` permanece deshabilitado en STG (`CRON_JOBS_DISABLED`) para evitar envíos accidentales fuera de producción.",
      },
    ],
    related: ["carritos-configuracion", "lifecycle", "pedidos", "suscriptores", "email-templates"],
    relatedPlaybooks: ["playbook-audiencias-carritos-lifecycle"],
    keywords: [
      "carrito",
      "abandono",
      "recuperación",
      "recordatorio",
      "configurar recuperación automática",
      "checkout",
    ],
    version: 3,
  },
  {
    id: "carritos-configuracion",
    title: "Configuración de recuperación de carritos",
    area: "Marketing",
    route: "/admin/carritos/configuracion",
    summary: `Interruptor maestro, modo supervisado vs automático y ventanas horarias de carritos abandonados (Superadmin + MFA ≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
    purpose:
      "Permite a Superadmin gobernar si los recordatorios de carrito abandonado requieren acción humana en bandeja o se despachan automáticamente en el job horario `lucams-cart-recovery`, definiendo tiempos de espera prudentes.",
    whenToUse: [
      "Para encender o detener de inmediato el motor de recuperación ante un incidente en pasarela o correo.",
      "Para alternar entre operación manual supervisada y operación automática por cron.",
      "Para ajustar cuántos minutos/horas esperar tras el último movimiento antes de considerar abandonado un carrito.",
    ],
    concepts: [
      {
        term: "Killswitch de recuperación",
        definition:
          "Interruptor general que detiene todo envío automático del cron sin dejar de registrar los carritos en bandeja.",
      },
      {
        term: "Ventana de enfriamiento del Estudio",
        definition:
          "Espera mínima necesaria para no enviar «olvidaste tu carrito» a alguien que todavía está eligiendo fotos con calma.",
      },
    ],
    sections: [
      {
        id: "controles-carritos",
        title: "Interruptor general, modo y ventanas",
        summary: "Cada cambio se audita en bitácora y exige MFA reciente.",
        topics: [
          {
            id: "modo-auto",
            label: "Modo Manual vs Automático",
            description:
              "En Manual el equipo elige qué recordar desde `/admin/carritos`; en Automático el cron procesa los elegibles dentro de ventana.",
            caution:
              "Antes de pasar a Automático en producción, revisa la plantilla `cart-recovery` en /admin/email-templates.",
          },
          {
            id: "tiempos",
            label: "Espera mínima y expiración de ventana",
            description:
              "Evita tanto recordatorios prematuros como correos sobre carritos demasiado antiguos.",
            interpretation:
              "Mantén una espera suficiente para productos personalizados que toman más tiempo de diseño.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "ajustar-config-carritos",
        title: "Activar, ajustar o pausar la recuperación automática",
        goal: "Controlar el disparo de correos de carrito con cero sorpresas en producción.",
        route: "/admin/carritos/configuracion",
        roles: ["SUPERADMIN"],
        steps: [
          "Comprueba la redacción vigente de la plantilla `cart-recovery` en /admin/email-templates y la salud de Resend en /admin/observability.",
          "Elige el estado del interruptor general, modo (Manual o Automático) y ventanas de tiempo.",
          `Guarda e ingresa tu código MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
          "Supervisa en /admin/carritos y /admin/auditoria los primeros envíos del siguiente corte horario.",
        ],
        expected:
          "La automatización queda gobernada exactamente según la ventana definida y con botón de parada inmediata disponible.",
      },
    ],
    cautions: [
      "Si Wompi o Aveonline sufren una caída temporal, apaga o pasa a Manual la recuperación automática mientras dura el incidente.",
    ],
    dontTouch: [
      "No configures esperas de pocos minutos: interrumpirías a clientes que aún están personalizando o buscando su tarjeta.",
    ],
    checklist: [
      "Plantilla `cart-recovery` previsualizada en /admin/email-templates.",
      "Ventana de espera prudente para compra personalizada.",
      "Cambio confirmado con MFA y verificado en /admin/auditoria.",
    ],
    faqs: [
      {
        question: "¿Apagar el interruptor borra los carritos registrados?",
        answer:
          "No. La bandeja sigue capturando y atribuyendo conversiones; solo se detiene el envío automático de correos.",
      },
    ],
    related: ["carritos", "lifecycle", "email-templates", "observability"],
    relatedPlaybooks: [
      "playbook-audiencias-carritos-lifecycle",
      "playbook-incidentes-seguridad-dian",
    ],
    keywords: [
      "carritos",
      "killswitch",
      "automático",
      "cron",
      "ventana",
      "MFA",
      "configurar recuperación automática",
    ],
    version: 1,
  },
];
