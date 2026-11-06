import type { AdminModuleGuide } from "../types";

export const OPERATION_GUIDES: AdminModuleGuide[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    area: "Operación",
    route: "/admin/dashboard",
    summary:
      "Panorama ejecutivo de ventas, conversión, operación y alertas que requieren atención.",
    purpose:
      "Permite entender el estado general del negocio y decidir qué área necesita atención. Es una vista de lectura y priorización; los cambios operativos se realizan en cada módulo especializado.",
    whenToUse: [
      "Al comenzar la jornada para identificar desviaciones o alertas.",
      "Al comparar ventas, actividad comercial y carga operativa.",
      "Antes de entrar a un módulo para investigar un indicador concreto.",
    ],
    concepts: [
      {
        term: "Indicador",
        definition:
          "Una medida resumida del período consultado. Debe interpretarse junto con su fecha, unidad y contexto operativo.",
      },
      {
        term: "Alerta",
        definition:
          "Una señal de que existe una condición pendiente o anómala; no siempre representa un error del sistema.",
      },
    ],
    sections: [
      {
        id: "indicadores",
        title: "Indicadores del negocio",
        summary: "Resume desempeño comercial y operativo para orientar la revisión diaria.",
        topics: [
          {
            id: "ventas",
            label: "Ventas y pedidos",
            description: "Presenta los totales y tendencias de la actividad comercial registrada.",
            interpretation:
              "Verifica el período y distingue intención de compra, pedido creado y pedido pagado antes de comparar cifras.",
          },
          {
            id: "conversion",
            label: "Conversión",
            description: "Relaciona visitas o intenciones con resultados comerciales.",
            interpretation:
              "Una variación puede deberse a tráfico, disponibilidad, precios o pagos; investiga el embudo antes de atribuirla a una sola causa.",
          },
          {
            id: "accesos",
            label: "Accesos a módulos",
            description:
              "Lleva a las bandejas donde se consulta el detalle y se ejecutan acciones.",
            interpretation: "Úsalos después de identificar el indicador que necesitas profundizar.",
          },
        ],
      },
      {
        id: "alertas",
        title: "Alertas y pendientes",
        summary: "Agrupa señales operativas que pueden exigir seguimiento.",
        topics: [
          {
            id: "severidad",
            label: "Prioridad de la alerta",
            description:
              "Diferencia avisos informativos de condiciones que afectan operación o plazos.",
            interpretation:
              "Atiende primero riesgos legales, pagos, producción bloqueada y entregas comprometidas.",
          },
          {
            id: "origen",
            label: "Origen del dato",
            description: "Cada tarjeta procede de un proceso o módulo concreto.",
            interpretation:
              "Confirma el detalle en la fuente antes de contactar al cliente o modificar un registro.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "revision-diaria",
        title: "Realizar la revisión ejecutiva diaria",
        goal: "Convertir los indicadores en una lista priorizada de revisiones operativas.",
        steps: [
          "Confirma el período de tiempo que está resumiendo el dashboard.",
          "Revisa alertas críticas y plazos antes que las métricas de tendencia.",
          "Compara ventas, pedidos y conversión sin asumir que representan el mismo evento.",
          "Abre el módulo de origen de cada desviación y valida sus registros detallados.",
          "Registra o asigna el seguimiento en Bandeja Hoy cuando corresponda.",
        ],
        expected:
          "Sales del dashboard con pendientes verificados y una prioridad clara de atención.",
        exceptions: [
          "Si una cifra parece desactualizada, comprueba el período y la fuente antes de tomar decisiones.",
          "Si no tienes acceso al módulo de origen, escala el hallazgo al rol responsable.",
        ],
      },
    ],
    cautions: [
      "No uses un indicador resumido como única evidencia para reembolsar, bloquear o modificar un pedido.",
      "Las cifras financieras definitivas se verifican en Finanzas, no por aproximación visual.",
    ],
    faqs: [
      {
        question: "¿Por qué una cifra no coincide con la de otro módulo?",
        answer:
          "Revisa período, estados incluidos, zona horaria y definición de la métrica. El detalle especializado es la fuente para investigar la diferencia.",
      },
      {
        question: "¿Puedo cambiar un pedido desde el dashboard?",
        answer:
          "No. Abre Pedidos y sigue el procedimiento correspondiente según tu rol y el estado actual.",
      },
    ],
    related: ["hoy", "pedidos", "finanzas", "metricas", "notificaciones"],
    keywords: ["inicio", "KPI", "ventas", "conversión", "alertas", "resumen"],
    version: 1,
  },
  {
    id: "hoy",
    title: "Bandeja Hoy",
    area: "Operación",
    route: "/admin/hoy",
    summary: "Cola priorizada de tareas, plazos, bloqueos y compromisos operativos del día.",
    purpose:
      "Convierte pendientes de distintos módulos en una agenda de trabajo según tu rol. No reemplaza las bandejas especializadas: te ayuda a decidir qué atender primero.",
    whenToUse: [
      "Al iniciar y retomar la jornada operativa.",
      "Cuando necesites identificar vencimientos legales o compromisos de entrega.",
      "Para revisar tus tareas y los bloqueos que impiden avanzar.",
    ],
    concepts: [
      {
        term: "SLA",
        definition:
          "Tiempo objetivo o límite para atender un caso. En posventa puede depender de días hábiles y reglas legales.",
      },
      {
        term: "Pendiente",
        definition:
          "Una tarea, alerta o condición que necesita acción humana; su presencia no implica que puedas resolverla desde esta pantalla.",
      },
    ],
    sections: [
      {
        id: "prioridades",
        title: "Prioridades operativas",
        summary: "Ordena el trabajo por urgencia, vencimiento e impacto.",
        topics: [
          {
            id: "vencidos",
            label: "Vencidos",
            description: "Elementos cuyo tiempo objetivo ya terminó.",
            interpretation:
              "Revisa primero la causa y toma la acción permitida en el módulo de origen.",
            caution: "No cambies fechas o estados solo para ocultar un vencimiento.",
          },
          {
            id: "proximos",
            label: "Próximos a vencer",
            description: "Compromisos que aún pueden atenderse dentro del plazo.",
            interpretation:
              "Prioriza los que dependen de terceros, producción o respuesta del cliente.",
          },
          {
            id: "tareas",
            label: "Tareas CRM",
            description: "Actividades asignadas con responsable, prioridad y fecha compromiso.",
            interpretation: "Actualiza su estado al terminar para mantener la cola confiable.",
          },
        ],
      },
      {
        id: "bloqueos",
        title: "Bloqueos y alertas",
        summary: "Muestra condiciones que impiden cerrar pedidos, casos o procesos.",
        topics: [
          {
            id: "taller",
            label: "Bloqueos de taller",
            description: "Pedidos o diseños que requieren revisión antes de continuar producción.",
            interpretation:
              "Abre el pedido y diferencia moderación, archivos, stock y fabricación.",
          },
          {
            id: "fiscal",
            label: "Vigilancia fiscal",
            description:
              "Alertas por acercamiento o superación de umbrales configurados por el negocio.",
            interpretation:
              "Es una señal de gestión; confirma las obligaciones con el contador, no una liquidación tributaria.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "gestionar-jornada",
        title: "Gestionar la jornada desde Bandeja Hoy",
        goal: "Resolver o encaminar los pendientes sin perder trazabilidad.",
        steps: [
          "Filtra mentalmente los elementos que pertenecen a tu rol y responsabilidad.",
          "Atiende vencidos legales, operativos y compromisos con cliente en ese orden de riesgo.",
          "Abre el registro de origen y verifica su estado actual antes de actuar.",
          "Ejecuta la acción en el módulo especializado y anota la información relevante.",
          "Marca la tarea como realizada solo cuando el resultado esperado esté confirmado.",
          "Escala lo bloqueado indicando causa, responsable y siguiente paso.",
        ],
        expected:
          "La bandeja refleja pendientes reales, responsables claros y próximos pasos verificables.",
      },
    ],
    cautions: [
      "Cerrar una tarea no cambia automáticamente el estado del pedido, ticket o reclamo relacionado.",
      "No compartas datos personales al escalar un pendiente; utiliza los identificadores internos.",
    ],
    faqs: [
      {
        question: "¿Por qué veo menos elementos que otra persona?",
        answer:
          "La bandeja se adapta al rol y a las capacidades asignadas; no todos los pendientes son visibles para todos.",
      },
      {
        question: "¿Un elemento desaparece al abrirlo?",
        answer:
          "No. Debe resolverse la condición de origen o actualizarse la tarea para que deje de aparecer.",
      },
    ],
    related: ["dashboard", "pedidos", "soporte", "garantias", "retractos"],
    keywords: ["agenda", "pendientes", "tareas", "SLA", "vencidos", "prioridad"],
    version: 1,
  },
  {
    id: "notificaciones",
    title: "Notificaciones",
    area: "Operación",
    route: "/admin/notificaciones",
    summary: "Centro interno de avisos operativos, comerciales y de salud del sistema.",
    purpose:
      "Conserva avisos que requieren consulta o seguimiento y permite distinguir los pendientes de lectura. Marcar como leído organiza la bandeja, pero no resuelve el evento de origen.",
    whenToUse: [
      "Cuando el contador del menú indica avisos sin leer.",
      "Para localizar el enlace al módulo afectado por una alerta.",
      "Para revisar antecedentes de un aviso operativo.",
    ],
    concepts: [
      {
        term: "No leída",
        definition: "Notificación que aún no has marcado como revisada en el centro interno.",
      },
      {
        term: "Agrupación",
        definition:
          "Mecanismo que reduce repeticiones del mismo evento para evitar ruido en la bandeja.",
      },
    ],
    sections: [
      {
        id: "bandeja",
        title: "Lectura de la bandeja",
        summary: "Presenta fecha, severidad, detalle y destino de cada aviso.",
        topics: [
          {
            id: "severidad",
            label: "Severidad",
            description: "Clasifica el aviso como informativo, advertencia o condición crítica.",
            interpretation:
              "La severidad orienta la urgencia; valida siempre el contenido y el módulo de origen.",
          },
          {
            id: "accion",
            label: "Enlace de acción",
            description:
              "Dirige al registro o bandeja relacionada cuando existe un destino disponible.",
            interpretation: "Ábrelo para confirmar el estado vivo antes de actuar.",
          },
          {
            id: "lectura",
            label: "Estado de lectura",
            description: "Controla el contador de pendientes del menú.",
            interpretation: "Leído significa revisado por ti, no resuelto por el negocio.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "atender-notificacion",
        title: "Atender una notificación",
        goal: "Revisar el aviso y resolver correctamente su causa.",
        steps: [
          "Lee título, detalle, severidad y fecha del aviso.",
          "Abre el enlace relacionado y verifica si la condición sigue vigente.",
          "Realiza la acción permitida en el módulo correspondiente.",
          "Regresa y marca la notificación como leída cuando ya no necesites conservarla como pendiente personal.",
        ],
        expected:
          "El aviso queda revisado y su condición de origen resuelta o asignada para seguimiento.",
      },
    ],
    cautions: [
      "No marques toda la bandeja como leída antes de identificar avisos críticos sin revisar.",
    ],
    faqs: [
      {
        question: "¿Marcar como leído elimina la alerta del sistema?",
        answer:
          "No. Solo cambia tu estado de lectura; el proceso que generó la alerta conserva su propio estado.",
      },
    ],
    related: ["dashboard", "hoy", "observability"],
    keywords: ["campana", "avisos", "alertas", "sin leer", "mensajes internos"],
    version: 1,
  },
  {
    id: "ayuda",
    title: "Centro de ayuda",
    area: "Operación",
    route: "/admin/ayuda",
    summary: "Manuales operativos, buscador, recorridos y rutas de aprendizaje del Admin.",
    purpose:
      "Explica el propósito y uso de cada módulo según tus permisos. Permite consultar conceptos, campos, procedimientos y recorridos sin modificar información del negocio.",
    whenToUse: [
      "Cuando no conozcas la finalidad o el efecto de una pantalla.",
      "Antes de ejecutar un procedimiento poco frecuente o delicado.",
      "Para aprender las responsabilidades de tu rol y retomar guías pendientes.",
    ],
    concepts: [
      {
        term: "Guía contextual",
        definition:
          "Contenido asociado a la pantalla actual, incluidos sus formularios y detalles.",
      },
      {
        term: "Recorrido interactivo",
        definition:
          "Secuencia opcional de pasos con progreso guardado; nunca ejecuta acciones por ti.",
      },
    ],
    sections: [
      {
        id: "explorar",
        title: "Explorar y buscar",
        summary: "Encuentra contenido por módulo, tarea, campo, estado o concepto.",
        topics: [
          {
            id: "buscador",
            label: "Buscador",
            description:
              "Consulta títulos, propósito, conceptos, campos, procedimientos y preguntas frecuentes.",
            interpretation:
              "Prueba con el nombre visible del campo o con una pregunta como «cómo conciliar».",
          },
          {
            id: "modulos",
            label: "Catálogo de módulos",
            description: "Muestra únicamente guías disponibles para tu rol.",
            interpretation: "Abre una tarjeta para leer la guía completa sin salir del centro.",
          },
          {
            id: "progreso",
            label: "Progreso de aprendizaje",
            description: "Conserva paso, finalización y descarte de los recorridos por usuario.",
            interpretation: "Puedes cerrar un recorrido y retomarlo después desde el mismo módulo.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "consultar-guia",
        title: "Resolver una duda operativa",
        goal: "Encontrar una respuesta aplicable a tu pantalla y permisos.",
        steps: [
          "Escribe el módulo, campo o tarea en el buscador.",
          "Abre el resultado que coincida con la acción que necesitas realizar.",
          "Revisa requisitos, permisos y precauciones antes de los pasos.",
          "Inicia el recorrido opcional si prefieres acompañamiento.",
          "Ejecuta la acción en el módulo correspondiente y verifica el resultado esperado.",
          "Califica la guía si necesitamos mejorar su contenido.",
        ],
        expected:
          "Puedes completar la tarea comprendiendo su efecto y sin depender de una respuesta genérica.",
      },
    ],
    cautions: [
      "Los ejemplos son orientativos y no sustituyen la validación del registro real.",
      "El contenido nunca debe incluir datos personales reales de clientes.",
    ],
    faqs: [
      {
        question: "¿El recorrido realiza cambios por mí?",
        answer:
          "No. Solo explica y guarda tu avance; todas las operaciones se confirman en la interfaz normal.",
      },
      {
        question: "¿Puedo repetir el onboarding?",
        answer: "Sí. Abre la ruta de tu rol desde el centro y reiníciala cuando quieras.",
      },
    ],
    related: ["dashboard", "seguridad"],
    keywords: ["manual", "aprender", "onboarding", "recorrido", "buscar", "duda", "tutorial"],
    version: 1,
  },
];
