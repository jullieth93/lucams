import type { AdminModuleGuide } from "../types";

export const MARKETING_GUIDES: AdminModuleGuide[] = [
  {
    id: "cupones",
    title: "Cupones",
    area: "Marketing",
    route: "/admin/cupones",
    summary:
      "Campañas comerciales y cupones personales no transferibles con auditoría 360° de redenciones.",
    purpose:
      "Gobierna los códigos de descuento aplicables en el checkout. La creación, edición, pausa y archivo son exclusivos de Superadmin; Gerencia Operativa y Analista Financiero consultan campañas y redenciones en modo lectura (con PII protegida según el rol).",
    whenToUse: [
      "Para crear, pausar o archivar una campaña promocional.",
      "Para diferenciar campañas abiertas frente a cupones personales de referidos (REF-*).",
      "Para auditar el historial de pedidos y clientes que redimieron cada código.",
    ],
    concepts: [
      {
        term: "Cupón personal no transferible",
        definition:
          "Cupón atado a un titular (como los emitidos por Invita y gana): nunca se expone en listados públicos y el checkout rechaza su uso por terceros.",
      },
      {
        term: "Tope global y por comprador",
        definition:
          "Límite total de redenciones del código y límite individual validado simultáneamente por cuenta y correo electrónico.",
      },
    ],
    sections: [
      {
        id: "reglas",
        title: "Reglas de la promoción y trazabilidad",
        summary: "Define código, beneficio, vigencia, restricciones e historial de uso.",
        topics: [
          {
            id: "codigo",
            label: "Código y visibilidad",
            description: "Texto en mayúsculas que el comprador ingresa en el checkout.",
            caution:
              "Activa «Cupón público» solo en campañas abiertas que quieras anunciar en vitrina; los cupones personales permanecen siempre privados.",
          },
          {
            id: "beneficio",
            label: "Tipo y valor del descuento",
            description: "Porcentaje (1–100%), monto fijo ($1 a $100.000 COP) o envío gratis.",
            interpretation: "Contrasta siempre con Costos y escalas mayoristas antes de activar.",
          },
          {
            id: "vigencia",
            label: "Fechas (hora Colombia) y estado",
            description: "Ventana exacta de inicio y cierre en zona America/Bogota.",
            interpretation:
              "Usa Pausar para frenar temporalmente una campaña sin perder su historial.",
          },
          {
            id: "limites",
            label: "Límites y alcance por catálogo",
            description:
              "Restringe categorías, productos específicos, unidades mínimas o compra mínima.",
            caution: "El límite por cliente nunca puede superar el límite total de usos del cupón.",
          },
          {
            id: "usos",
            label: "Historial de redenciones",
            description:
              "En el detalle de cada cupón verás los pedidos pagados, montos descontados y enlaces 360°.",
            interpretation:
              "Los cupones archivados conservan su ficha en solo lectura para auditoría.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-cupon",
        title: "Crear y auditar un cupón comercial",
        goal: "Publicar una promoción acotada y trazable.",
        steps: [
          "Define código, tipo de beneficio, vigencia y límites de uso.",
          "Restringe categorías o productos elegibles si la campaña no aplica a todo el catálogo.",
          "Contrasta el descuento frente a Costos y Precios al por mayor.",
          "Guarda y monitorea el consumo de cupo y el ranking de descuentos otorgados.",
          "Al finalizar definitivamente, pausa o archiva con confirmación MFA reciente (≤ 10 min).",
        ],
        expected:
          "El checkout aplica el beneficio únicamente a compras elegibles y enlaza cada uso al pedido pagado.",
      },
    ],
    cautions: [
      "Pausa una campaña en lugar de cambiar silenciosamente las condiciones de códigos ya divulgados.",
      "Archivar un cupón exige verificación MFA reciente (≤ 10 min) y bloquea ediciones posteriores.",
    ],
    faqs: [
      {
        question: "¿Por qué un comprador recibe aviso de que el cupón es personal?",
        answer:
          "Los cupones con titular asignado (como REF-* de Invita y gana) son intransferibles: solo puede redimirlos la cuenta titular o el mismo correo electrónico en compra como invitado.",
      },
      {
        question: "¿Por qué el cliente no puede aplicar un cupón de campaña?",
        answer:
          "Verifica vigencia en hora Colombia, estado activo, compra mínima, unidades elegibles en el carrito y topes de uso antes de emitir otro código.",
      },
    ],
    related: ["costos", "mayorista", "fidelizacion", "pedidos"],
    keywords: ["descuento", "promoción", "código", "vigencia", "redención", "tope", "personal"],
    version: 1,
  },
  {
    id: "fidelizacion",
    title: "Fidelización",
    area: "Marketing",
    route: "/admin/fidelizacion",
    summary:
      "Gobierno económico de Puntos Lucams, pasivo contable vivo y conversión de «Invita y gana».",
    purpose:
      "Configura las tasas de acumulación/redención de puntos y las recompensas por referido con simulador financiero en vivo. Editable exclusivamente por Superadmin con MFA reciente; Analista Financiero audita métricas y pasivo en modo lectura con PII protegida.",
    whenToUse: [
      "Para ajustar tasas, mínimos o topes de Puntos Lucams simulando el retorno efectivo.",
      "Para configurar el % OFF y los días de vigencia del programa «Invita y gana».",
      "Para auditar el pasivo vigente en pesos, la curva de emisión/canje y el embudo de referidos.",
    ],
    concepts: [
      {
        term: "Pasivo equivalente vigente",
        definition:
          "Valor contable en pesos colombianos del saldo total de puntos activos en circulación según la tasa actual de redención.",
      },
      {
        term: "Tope anti-abuso (25%)",
        definition:
          "Candado servidor que impide guardar combinaciones de acumulación y canje cuyo retorno efectivo supere el 25% sobre la compra.",
      },
      {
        term: "Prelación en checkout",
        definition:
          "Primero se aplica el cupón sobre los productos y luego los puntos sobre el subtotal restante; el envío nunca se paga con puntos.",
      },
    ],
    sections: [
      {
        id: "programa",
        title: "Parámetros, simulador y libros mayores",
        summary: "Controla activación, tasas, topes de seguridad y actividad reciente.",
        topics: [
          {
            id: "tasas",
            label: "Tasas y simulador económico en vivo",
            description:
              "Calcula en tiempo real el % de cashback, el valor de 1 punto y el umbral redimible.",
            caution:
              "Toda combinación por encima del 25% de retorno queda bloqueada en cliente y servidor para proteger el margen.",
          },
          {
            id: "minimos",
            label: "Mínimos y tope por pedido",
            description:
              "Define cuántos puntos exige el checkout y qué porcentaje máximo del subtotal cubren.",
            interpretation:
              "Los cambios rigen para compras y canjes futuros sin alterar saldos ya ganados.",
          },
          {
            id: "referidos",
            label: "Invita y gana (cupones personales)",
            description: "Configura el % OFF y vigencia de los cupones de bienvenida y premio.",
            interpretation:
              "Los cupones ya emitidos conservan sus condiciones originales y son estrictamente no transferibles.",
          },
          {
            id: "trazabilidad",
            label: "Pulso 14d y movimientos recientes",
            description:
              "Gráficos de emisión vs. canje, embudo de conversión y últimos registros enlazados a pedidos.",
            caution:
              "Guardar cambios en cualquiera de los dos programas exige confirmación MFA reciente (≤ 10 min) y queda registrado en Auditoría.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "validar-programa",
        title: "Actualizar parámetros de fidelización con seguridad",
        goal: "Ajustar incentivos protegiendo el margen y el pasivo contable.",
        steps: [
          "Revisa el pasivo equivalente actual y el pulso de canjes de los últimos 14 días.",
          "Ajusta las tasas o el porcentaje de recompensa observando el simulador económico en vivo.",
          "Confirma que el indicador de salud permanezca dentro del margen esperado (≤ 25% en puntos).",
          "Pulsa «Guardar configuración» y completa la verificación MFA de 6 dígitos si tu elevación superó 10 minutos.",
          "Verifica el registro en Auditoría y la actualización inmediata en tienda.",
        ],
        expected:
          "Las nuevas reglas aplican de inmediato a futuras compras, registros y canjes sin alterar saldos ni cupones históricos.",
      },
    ],
    cautions: [
      "Los puntos y referidos equivalen a dinero real; nunca uses cuentas reales para pruebas operativas.",
      "La expiración automática de puntos está preparada en configuración pero aún no descuenta saldos.",
    ],
    faqs: [
      {
        question: "¿Qué ocurre con los puntos si un pedido se cancela o tiene retracto?",
        answer:
          "El sistema devuelve automáticamente los puntos reservados al cancelar/reembolsar la orden o restituye la fracción proporcional en retractos parciales.",
      },
      {
        question: "¿Por qué no puedo guardar una tasa de puntos muy alta?",
        answer:
          "Por seguridad financiera, el servidor bloquea cualquier combinación cuyo retorno efectivo supere el 25% del valor pagado.",
      },
    ],
    related: ["cupones", "retractos", "clientes", "auditoria"],
    keywords: ["puntos", "lealtad", "referidos", "invita", "redimir", "acumular", "pasivo"],
    version: 1,
  },
  {
    id: "suscriptores",
    title: "Suscriptores",
    area: "Marketing",
    route: "/admin/marketing/suscriptores",
    summary: "Audiencia del newsletter, consentimientos, bajas y exportación autorizada.",
    purpose:
      "Permite consultar quién autorizó comunicaciones y con qué vigencia. La audiencia debe construirse desde el consentimiento, no desde cualquier correo registrado en la tienda.",
    whenToUse: [
      "Para consultar altas o bajas del newsletter.",
      "Para verificar alcance y versión del consentimiento.",
      "Para exportar una audiencia con autorización y propósito legítimo.",
    ],
    concepts: [
      {
        term: "Opt-in",
        definition:
          "Autorización afirmativa para recibir comunicaciones dentro de una finalidad concreta.",
      },
      { term: "Baja", definition: "Revocación que debe respetarse en futuros envíos." },
    ],
    sections: [
      {
        id: "audiencia",
        title: "Audiencia y consentimiento",
        summary: "Presenta estado, fecha y evidencia de autorización.",
        topics: [
          {
            id: "estado",
            label: "Suscrito o dado de baja",
            description: "Indica si el consentimiento está vigente.",
            interpretation: "No incluyas bajas en una audiencia de campaña.",
          },
          {
            id: "version",
            label: "Versión del aviso",
            description: "Identifica el texto legal asociado a la autorización.",
            interpretation:
              "Ayuda a acreditar contexto, pero no reemplaza el alcance del consentimiento.",
          },
          {
            id: "export",
            label: "Exportación CSV Ley 1581 vs Ledger SIC",
            description:
              "El botón estándar descarga únicamente suscriptores activos sin rebote duro ni cuentas internas; Superadmin cuenta además con el Ledger SIC histórico completo.",
            caution:
              "Ambas exportaciones exigen verificación MFA reciente (≤ 10 min) y quedan registradas en Auditoría.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "exportar-audiencia",
        title: "Preparar una exportación de suscriptores",
        goal: "Usar únicamente contactos con opt-in vigente y sin rebote en campañas.",
        steps: [
          "Revisa el pulso de 14 días de altas vs bajas y verifica el conteo de activos.",
          "Pulsa «Exportar activos (Ley 1581)» y completa la confirmación MFA reciente (≤ 10 min).",
          "Si requieres evidencia regulatoria completa ante la SIC, usa «Ledger SIC (histórico)» (exclusivo Superadmin).",
          "Entrega el archivo por un canal autorizado y evita copias innecesarias.",
          "Confirma que la plataforma de envío también respete bajas posteriores.",
        ],
        expected:
          "La campaña utiliza exclusivamente suscriptores con opt-in activo, sin staff ni rebotes duros.",
      },
    ],
    cautions: ["Una compra o cuenta creada no equivale por sí sola a consentimiento de marketing."],
    faqs: [
      {
        question: "¿Puedo volver a agregar una baja?",
        answer:
          "Solo con una nueva autorización válida del titular; nunca por decisión unilateral del equipo.",
      },
      {
        question: "¿Por qué la exportación estándar tiene menos filas que el total de audiencia?",
        answer:
          "Por cumplimiento de la Ley 1581 y reputación de dominio, el CSV comercial excluye bajas (DE BAJA), cuentas internas del equipo y correos con rebote duro o queja en Resend.",
      },
    ],
    related: ["segmentos", "clientes", "email-templates"],
    keywords: [
      "newsletter",
      "opt-in",
      "consentimiento",
      "baja",
      "CSV",
      "correo",
      "SIC",
      "Ley 1581",
    ],
    version: 2,
  },
  {
    id: "segmentos",
    title: "Segmentos CRM",
    area: "Marketing",
    route: "/admin/marketing/segmentos",
    summary: "Audiencias comerciales por comportamiento, fidelidad, intención y consentimiento.",
    purpose:
      "Convierte datos del CRM en grupos útiles para acciones comerciales, excluyendo contactos sin autorización. Los criterios describen comportamiento pasado y no garantizan resultados futuros.",
    whenToUse: [
      "Para identificar clientes VIP, reactivación o alta intención.",
      "Para preparar audiencias por ocasión o comportamiento.",
      "Para exportar segmentos elegibles con capacidad autorizada.",
    ],
    concepts: [
      {
        term: "Segmento",
        definition:
          "Grupo dinámico definido por criterios de comportamiento, relación y consentimiento.",
      },
      {
        term: "Reactivación",
        definition:
          "Acción dirigida a contactos cuya actividad dejó de ser reciente según el período configurado.",
      },
    ],
    sections: [
      {
        id: "criterios",
        title: "Criterios y elegibilidad",
        summary: "Explica por qué un contacto pertenece al grupo y si puede contactarse.",
        topics: [
          {
            id: "vip",
            label: "VIP y valor",
            description: "Segmenta por comportamiento y valor histórico.",
            interpretation: "No confundas alto valor histórico con actividad reciente garantizada.",
          },
          {
            id: "intencion",
            label: "Alta intención sin compra",
            description: "Identifica señales de interés sin conversión final.",
            interpretation: "Revisa consentimiento y contexto antes de contactar.",
          },
          {
            id: "optin",
            label: "Filtro de consentimiento y entregabilidad",
            description:
              "Excluye automáticamente contactos sin opt-in vigente, cuentas internas y correos con rebote duro o queja.",
            caution: "No retires este filtro para aumentar artificialmente el alcance.",
          },
          {
            id: "export",
            label: "Exportación con MFA reciente",
            description:
              "Genera el CSV del segmento activo tras validar MFA reciente (≤ 10 min) y registra el evento en Auditoría.",
            caution: "Aplica las mismas reglas de protección que cualquier dato personal.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "usar-segmento",
        title: "Preparar una acción por segmento",
        goal: "Seleccionar una audiencia coherente con el objetivo.",
        steps: [
          "Elige el segmento según una finalidad concreta.",
          "Revisa criterios, período y tamaño de la audiencia.",
          "Confirma opt-in vigente y exclusiones por baja o rebote.",
          "Exporta con confirmación MFA solo los datos necesarios y por el canal autorizado.",
          "Mide resultados sin cambiar retrospectivamente la definición del segmento.",
        ],
        expected: "La acción comercial llega a una audiencia explicable y autorizada.",
      },
    ],
    cautions: [
      "No uses segmentación para discriminar, inferir datos sensibles o evadir revocaciones.",
    ],
    faqs: [
      {
        question: "¿Por qué hay menos contactos que en Clientes?",
        answer:
          "El segmento exige criterios de comportamiento, opt-in comercial vigente, ausencia de rebotes duros y excluye cuentas del equipo.",
      },
    ],
    related: ["suscriptores", "clientes", "metricas"],
    keywords: ["audiencia", "VIP", "reactivación", "intención", "CRM", "exportar"],
    version: 2,
  },
  {
    id: "carritos",
    title: "Carritos abandonados",
    area: "Marketing",
    route: "/admin/carritos",
    summary:
      "Monitoreo, pulso de 14 días, previsualización y recuperación supervisada o automática de carritos.",
    purpose:
      "Identifica carritos con contacto registrado que no finalizaron pago y gestiona recordatorios respetando supresiones de Resend. Configuración exclusiva de Superadmin con MFA reciente; Analista Financiero consulta embudo y atribución en modo 0-PII.",
    whenToUse: [
      "Para revisar carritos pendientes, recordados o recuperados y su pulso de 14 días.",
      "Para previsualizar y enviar un recordatorio autorizado.",
      "Para analizar valor recuperado, etapa de abandono y rechazos Wompi.",
    ],
    concepts: [
      {
        term: "Abandono",
        definition:
          "Carrito elegible que no finalizó en compra dentro del proceso y ventana configurados.",
      },
      {
        term: "Recuperado",
        definition: "Carrito cuya compra posterior quedó relacionada y cerrada por el sistema.",
      },
      {
        term: "Supresión por rebote o queja",
        definition:
          "Los destinatarios con rebote duro o queja en Resend se marcan y quedan excluidos de envíos comerciales.",
      },
    ],
    sections: [
      {
        id: "bandeja",
        title: "Bandeja y diagnóstico",
        summary: "Resume estado, pulso de 14 días, productos, etapa alcanzada y recordatorios.",
        topics: [
          {
            id: "estado",
            label: "Estado y supresión",
            description:
              "Distingue pendientes, recordados, recuperados, cerrados y alertas de Rebote / Queja.",
            interpretation: "Un recordatorio enviado no equivale a recuperación.",
          },
          {
            id: "valor",
            label: "Subtotal e ítems",
            description:
              "Instantánea del contenido conocido del carrito; en modo 0-PII se ocultan fotos privadas del Estudio.",
            interpretation: "Los precios y disponibilidad pueden cambiar al retomar la compra.",
          },
          {
            id: "preview",
            label: "Vista previa del correo",
            description: "Muestra el mensaje antes de un envío manual para roles operativos.",
            caution:
              "Revisa destinatario, contenido y enlaces; el envío tiene un efecto externo real.",
          },
        ],
      },
      {
        id: "configuracion",
        title: "Configuración automática (Superadmin)",
        summary: "Controla interruptor general, modo y ventanas con verificación MFA reciente.",
        topics: [
          {
            id: "killswitch",
            label: "Activación general",
            description:
              "Habilita o detiene el proceso de recuperación con MFA reciente (≤ 10 min).",
            caution: "Cambiarlo afecta envíos futuros; verifica el modo antes de activarlo.",
          },
          {
            id: "modo",
            label: "Manual o automático",
            description: "Define si el cron envía o si el equipo supervisa cada recordatorio.",
            interpretation: "Manual no significa que el carrito deje de registrarse.",
          },
          {
            id: "ventanas",
            label: "Ventanas y frecuencia",
            description: "Evita envíos prematuros o repetidos.",
            interpretation:
              "Revisa zona horaria Colombia y último envío antes de ejecutar manualmente.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "recordar-carrito",
        title: "Enviar un recordatorio supervisado",
        goal: "Contactar solo un carrito elegible con el mensaje correcto.",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT"],
        steps: [
          "Abre el carrito y verifica estado, ausencia de rebote/queja, ítems y último envío.",
          "Confirma que no exista pedido recuperado ni motivo de cierre.",
          "Previsualiza el correo y revisa enlaces y contenido.",
          "Envía una sola vez y verifica la confirmación.",
          "Comprueba que el estado del carrito refleje el recordatorio.",
        ],
        expected: "El cliente recibe un recordatorio pertinente y el historial evita duplicados.",
      },
      {
        id: "auditar-recuperacion-carritos",
        title: "Auditar recuperación y atribución en modo 0-PII",
        goal: "Evaluar la tasa de conversión y el valor recuperado sin exponer datos personales.",
        roles: ["FINANCE_ANALYST", "SUPERADMIN"],
        steps: [
          "Revisa el pulso de 14 días de carritos detectados vs recuperados pagados.",
          "Inspecciona la composición por estado y la tasa de recuperación sobre contactados.",
          "Abre el diagnóstico de un carrito recuperado y sigue el enlace al pedido pagado para conciliar.",
        ],
        expected:
          "Obtienes trazabilidad financiera completa entre abandono y orden pagada sin PII en claro.",
      },
      {
        id: "configurar-recuperacion",
        title: "Configurar la recuperación automática",
        goal: "Activar un proceso controlado y medible.",
        roles: ["SUPERADMIN"],
        steps: [
          "Revisa consentimiento y reglas de elegibilidad.",
          "Define ventanas y frecuencia prudentes.",
          "Selecciona el modo y valida la vista previa.",
          "Guarda completando la verificación MFA reciente (≤ 10 min).",
          "Monitorea los primeros resultados y desactiva si detectas envíos inesperados.",
        ],
        expected: "El cron procesa únicamente carritos elegibles dentro de las ventanas definidas.",
      },
    ],
    cautions: [
      "No reenvíes para comprobar si funciona: podrías generar correos duplicados reales.",
    ],
    faqs: [
      {
        question: "¿Por qué cambió el valor al recuperarse?",
        answer:
          "La bandeja conserva una instantánea; la compra final puede reflejar cambios de ítems, precio o disponibilidad.",
      },
    ],
    related: ["pedidos", "suscriptores", "cupones", "observability"],
    keywords: ["abandono", "recuperación", "recordatorio", "cron", "correo", "checkout"],
    version: 2,
  },
];
