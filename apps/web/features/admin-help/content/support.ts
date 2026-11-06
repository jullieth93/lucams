import type { AdminModuleGuide } from "../types";

export const SUPPORT_GUIDES: AdminModuleGuide[] = [
  {
    id: "soporte",
    title: "Soporte",
    area: "Servicio al cliente",
    route: "/admin/soporte",
    summary:
      "Bandeja de tickets, conversación con el cliente, responsables, estados y semáforo de SLA.",
    purpose:
      "Centraliza solicitudes de ayuda y conversaciones para dar respuestas trazables y oportunas. La antigua bandeja Mensajes converge aquí; cada ticket conserva su hilo, asignación y compromiso de atención.",
    whenToUse: [
      "Para responder contactos, incidencias o solicitudes de clientes.",
      "Para asignar responsabilidad y controlar tiempos de atención.",
      "Para consultar el contexto antes de escalar a otro módulo.",
    ],
    concepts: [
      {
        term: "Ticket",
        definition:
          "Caso de atención con identificador, solicitante, estado, hilo y tiempos de seguimiento.",
      },
      {
        term: "SLA hábil",
        definition:
          "Objetivo de tiempo calculado con el calendario operativo colombiano aplicable al caso.",
      },
      {
        term: "Respuesta pública",
        definition:
          "Mensaje dirigido al cliente dentro del hilo y notificado por el canal configurado.",
      },
    ],
    sections: [
      {
        id: "bandeja",
        title: "Bandeja y priorización",
        summary: "Organiza casos por estado, asignación y tiempo restante.",
        topics: [
          {
            id: "sla",
            label: "Semáforo SLA",
            description: "Señala si el caso está dentro del objetivo, próximo a vencer o vencido.",
            interpretation:
              "Prioriza vencidos y próximos, pero revisa también la gravedad del caso.",
          },
          {
            id: "estado",
            label: "Estado del ticket",
            description: "Distingue casos nuevos, en gestión, pendientes y cerrados.",
            interpretation:
              "Usa pendiente solo cuando realmente esperas información o una dependencia.",
          },
          {
            id: "asignacion",
            label: "Responsable",
            description: "Persona encargada de la próxima gestión.",
            interpretation:
              "Asignar no equivale a resolver; el responsable debe mantener el hilo actualizado.",
          },
        ],
      },
      {
        id: "hilo",
        title: "Detalle y conversación",
        summary: "Reúne mensajes, datos relacionados y herramientas de respuesta.",
        topics: [
          {
            id: "publica",
            label: "Respuesta al cliente",
            description: "Comunicación visible para el solicitante.",
            caution: "Evita datos innecesarios, lenguaje especulativo y promesas no confirmadas.",
          },
          {
            id: "copiloto",
            label: "Copiloto de soporte",
            description: "Asiste la redacción con un contexto limitado y sin datos personales.",
            interpretation:
              "Es una propuesta: revisa hechos, tono y procedimiento antes de usarla.",
          },
          {
            id: "relaciones",
            label: "Pedido o contacto relacionado",
            description: "Vincula el caso con la fuente que permite entender el problema.",
            interpretation: "Consulta el estado vivo antes de responder.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "resolver-ticket",
        title: "Atender y cerrar un ticket",
        goal: "Resolver la necesidad con respuesta clara y trazabilidad completa.",
        steps: [
          "Lee todo el hilo y revisa pedido, contacto o casos relacionados.",
          "Asigna responsable y estado de gestión si el caso no estaba en curso.",
          "Investiga la causa y confirma la solución en el módulo correspondiente.",
          "Responde al cliente explicando el resultado y el siguiente paso sin exponer datos internos.",
          "Cierra solo cuando la solicitud esté resuelta o se haya comunicado una decisión final sustentada.",
          "Verifica que el estado y el SLA reflejen el cierre.",
        ],
        expected:
          "El cliente recibe una respuesta útil y el ticket conserva evidencia suficiente para futuras consultas.",
        exceptions: [
          "Si dependes de otra área, deja el caso pendiente con responsable y próximo paso; no lo cierres para mejorar el SLA.",
        ],
      },
    ],
    cautions: [
      "No uses el copiloto como fuente de verdad ni incluyas datos personales en instrucciones externas.",
    ],
    faqs: [
      {
        question: "¿Dónde está Mensajes?",
        answer: "La antigua ruta redirige a Soporte; esta es la bandeja única de atención.",
      },
      {
        question: "¿Puedo cerrar si el cliente no responde?",
        answer:
          "Aplica el procedimiento vigente de espera y comunica el cierre; no uses la falta de respuesta para ocultar un caso sin gestionar.",
      },
    ],
    related: ["clientes", "pedidos", "garantias", "retractos", "hoy"],
    keywords: ["ticket", "PQR", "SLA", "hilo", "respuesta", "mensaje", "copiloto"],
    version: 1,
  },
  {
    id: "garantias",
    title: "Garantías",
    area: "Servicio al cliente",
    route: "/admin/garantias",
    summary:
      "Evaluación y resolución de reclamos por reparación, reposición, devolución o rechazo.",
    purpose:
      "Gestiona solicitudes de garantía con evidencia, plazos, asignación y notificación al cliente. La antigua bandeja Reclamos fue absorbida por este flujo único para evitar cierres divergentes.",
    whenToUse: [
      "Cuando un cliente reporta una falla cubierta potencialmente por garantía.",
      "Para evaluar evidencia y registrar una solución o decisión motivada.",
      "Para controlar plazos y seguimiento de casos abiertos.",
    ],
    concepts: [
      {
        term: "Garantía",
        definition:
          "Obligación aplicable según el producto y el plazo informado en la compra; no equivale a retracto.",
      },
      {
        term: "Resolución",
        definition:
          "Resultado de evaluar el caso: reparación, reposición, devolución u otra decisión permitida y comunicada.",
      },
    ],
    sections: [
      {
        id: "caso",
        title: "Evaluación del caso",
        summary: "Reúne compra, producto, plazo, evidencia y responsable.",
        topics: [
          {
            id: "vigencia",
            label: "Vigencia",
            description:
              "Contrasta la fecha de compra y el plazo de garantía informado para el ítem.",
            interpretation: "La vigencia es un criterio, no sustituye el análisis de la falla.",
          },
          {
            id: "evidencia",
            label: "Descripción y evidencia",
            description: "Explica la falla reportada y el material aportado.",
            caution: "No solicites ni expongas datos que no sean necesarios para evaluar.",
          },
          {
            id: "resolucion",
            label: "Tipo de solución",
            description: "Distingue reparación, reposición, devolución o rechazo.",
            interpretation: "Selecciona solo lo que realmente podrás ejecutar y registrar.",
          },
          {
            id: "reembolso",
            label: "Devolución de dinero",
            description: "Acción financiera condicionada a una capacidad específica.",
            caution:
              "Registrar la decisión no prueba que el dinero ya se devolvió; verifica el comprobante del medio de pago.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "resolver-garantia",
        title: "Evaluar y cerrar una garantía",
        goal: "Adoptar una solución sustentada y comunicarla oportunamente.",
        steps: [
          "Verifica pedido, ítem, fecha y plazo de garantía.",
          "Revisa la falla y la evidencia; solicita solo información adicional necesaria.",
          "Registra la evaluación y selecciona la solución autorizada.",
          "Coordina reparación, reposición o devolución en el módulo que corresponda.",
          "Comunica el resultado al cliente con pasos y condiciones concretos.",
          "Cierra el caso cuando la solución esté ejecutada o la decisión final haya sido notificada.",
        ],
        expected:
          "El reclamo queda resuelto con evidencia, solución verificable y comunicación al cliente.",
      },
    ],
    cautions: [
      "No confundas garantía con retracto ni registres un reembolso sin verificar su ejecución.",
    ],
    faqs: [
      {
        question: "¿Reclamos y Garantías son dos módulos?",
        answer:
          "No. Reclamos redirige a esta bandeja única para conservar un solo procedimiento de cierre y notificación.",
      },
    ],
    related: ["retractos", "soporte", "pedidos", "finanzas"],
    keywords: ["falla", "reparación", "reposición", "devolución", "reclamo", "legal"],
    version: 1,
  },
  {
    id: "retractos",
    title: "Retractos",
    area: "Servicio al cliente",
    route: "/admin/retractos",
    summary:
      "Gestión legal de solicitudes de retracto, devolución del producto y registro del reembolso.",
    purpose:
      "Controla las etapas y plazos del derecho de retracto aplicable en Colombia. Separa la aceptación de la solicitud, la recepción del bien y la ejecución del reembolso para no dar por completado un proceso pendiente.",
    whenToUse: [
      "Al recibir una solicitud de retracto.",
      "Para verificar devolución del producto y documentar la decisión.",
      "Para registrar y comunicar el reembolso cuando tu rol tenga autorización.",
    ],
    concepts: [
      {
        term: "Retracto",
        definition:
          "Derecho legal de desistir de una compra en los casos y plazos aplicables; no es lo mismo que garantía.",
      },
      {
        term: "Reembolso",
        definition:
          "Devolución efectiva del dinero por el medio correspondiente, con registro y evidencia.",
      },
    ],
    sections: [
      {
        id: "etapas",
        title: "Etapas del retracto",
        summary: "Distingue solicitud, evaluación, devolución física y cierre financiero.",
        topics: [
          {
            id: "solicitud",
            label: "Solicitud y plazo",
            description: "Contiene fecha, motivo, pedido y datos necesarios para evaluar.",
            interpretation: "Verifica oportunidad y condiciones aplicables antes de aprobar.",
          },
          {
            id: "devolucion",
            label: "Producto devuelto",
            description: "Registra la recepción y el estado del bien cuando aplique.",
            interpretation:
              "No marques recibido por anticipado ni únicamente por una guía anunciada.",
          },
          {
            id: "reembolso",
            label: "Registro del reembolso",
            description: "Documenta el resultado financiero final y sus datos de referencia.",
            caution:
              "La acción está restringida y requiere confirmar la devolución real en Wompi o el medio utilizado.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "gestionar-retracto",
        title: "Gestionar un retracto hasta su cierre",
        goal: "Cumplir el proceso legal sin omitir la devolución física ni financiera.",
        steps: [
          "Verifica pedido, fecha de solicitud, ítems y condiciones aplicables.",
          "Registra la decisión y comunica instrucciones claras de devolución cuando proceda.",
          "Confirma la recepción física antes de marcar esa etapa.",
          "La persona autorizada ejecuta el reembolso en el medio correspondiente y conserva la referencia.",
          "Registra el reembolso realizado y notifica el cierre al cliente.",
          "Comprueba que pedido, puntos y registros relacionados reflejen el resultado.",
        ],
        expected:
          "El expediente muestra decisión, devolución y reembolso con fechas y evidencia coherentes.",
      },
    ],
    cautions: [
      "No confirmes al cliente que el dinero fue devuelto antes de verificar la operación financiera.",
    ],
    faqs: [
      {
        question: "¿Todos los roles de Soporte registran reembolsos?",
        answer:
          "No. La gestión del retracto y el reembolso final tienen capacidades distintas según el rol.",
      },
    ],
    related: ["garantias", "pedidos", "finanzas", "soporte"],
    keywords: ["Ley 1480", "desistir", "devolución", "reembolso", "plazo legal"],
    version: 1,
  },
  {
    id: "moderacion",
    title: "Moderación de diseños",
    area: "Servicio al cliente",
    route: "/admin/moderacion",
    summary: "Revisión de contenido personalizado antes de autorizar su impresión.",
    purpose:
      "Protege la calidad y las reglas de contenido antes de producción. La decisión se aplica a diseños concretos y condiciona que el pedido pueda avanzar correctamente.",
    whenToUse: [
      "Cuando un diseño esté pendiente de revisión.",
      "Para aprobar material apto o rechazar contenido que requiera corrección.",
      "Antes de desbloquear fabricación de un pedido personalizado.",
    ],
    concepts: [
      {
        term: "Aprobado",
        definition:
          "Diseño revisado que puede continuar hacia producción, sujeto al resto de condiciones del pedido.",
      },
      {
        term: "Rechazado",
        definition:
          "Diseño que no puede fabricarse en su estado actual y requiere corrección o sustitución.",
      },
    ],
    sections: [
      {
        id: "revision",
        title: "Revisión visual y decisión",
        summary: "Permite inspeccionar el contenido y registrar el resultado.",
        topics: [
          {
            id: "preview",
            label: "Vista previa",
            description: "Representación del diseño que se revisa antes de imprimir.",
            interpretation:
              "Comprueba unidades, orientación, legibilidad y contenido; no revises solo la miniatura.",
          },
          {
            id: "decision",
            label: "Aprobar o rechazar",
            description: "Actualiza el estado de moderación del diseño.",
            caution:
              "Rechazar puede requerir comunicación y nueva versión; explica el motivo por el canal correspondiente.",
          },
          {
            id: "pedido",
            label: "Pedido relacionado",
            description: "Permite contrastar variante, cantidad y demás diseños.",
            interpretation:
              "No fabriques un pedido completo si aún tiene diseños pendientes o rechazados.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "moderar-diseno",
        title: "Revisar un diseño",
        goal: "Autorizar únicamente contenido completo y apto para producción.",
        steps: [
          "Abre el diseño y verifica pedido, variante y unidades asociadas.",
          "Amplía la vista previa y revisa todas las superficies necesarias.",
          "Contrasta contenido, orientación, recorte y legibilidad con la ficha.",
          "Aprueba si está apto o rechaza indicando el motivo operativo.",
          "Verifica el estado del pedido y deja seguimiento si requiere nueva versión del cliente.",
        ],
        expected:
          "Cada diseño tiene una decisión clara y producción solo recibe material aprobado.",
      },
    ],
    cautions: [
      "La aprobación de moderación no reemplaza el control de calidad del archivo de impresión ni la validación del pago.",
    ],
    faqs: [
      {
        question: "¿Puedo enviar un pedido con un diseño pendiente?",
        answer:
          "No debes hacerlo; la moderación es una condición del flujo previo a producción y despacho.",
      },
    ],
    related: ["pedidos", "disenos", "plantillas", "soporte"],
    keywords: ["diseño", "foto", "aprobar", "rechazar", "imprimir", "contenido"],
    version: 1,
  },
];
