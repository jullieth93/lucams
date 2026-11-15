import type { AdminModuleGuide } from "../types";

export const SUPPORT_GUIDES: AdminModuleGuide[] = [
  {
    id: "soporte",
    title: "Soporte",
    area: "Servicio al cliente",
    route: "/admin/soporte",
    summary:
      "Bandeja ejecutiva de tickets PQR y Hábeas Data, analítica de 14 días, semáforo SLA, Copiloto IA sin PII y enlaces 360°.",
    purpose:
      "Centraliza solicitudes de ayuda, PQR y consultas de Hábeas Data para dar respuestas trazables dentro de los plazos legales colombianos. La antigua ruta Mensajes converge aquí conservando filtros, asignación, hilo público/interno y conexión directa con Pedido, Contacto 360, Garantías y Retractos.",
    whenToUse: [
      "Para responder contactos, incidencias, solicitudes PQR o requerimientos de Hábeas Data.",
      "Para asignar propiedad de casos, priorizar vencimientos de SLA y medir el pulso de los últimos 14 días.",
      "Para consultar el contexto comercial y posventa antes de escalar a Garantías o Retractos.",
    ],
    concepts: [
      {
        term: "SLA legal colombiano",
        definition:
          "Plazo hábil calculado con festivos de Colombia: 15 días hábiles para PQR generales (Ley 1480) y 10 días hábiles para consultas de Hábeas Data (Ley 1581).",
      },
      {
        term: "Respuesta pública vs. nota interna",
        definition:
          "La respuesta pública notifica al cliente por correo electrónico y marca la primera atención; la nota interna documenta hallazgos solo para el equipo.",
      },
      {
        term: "Copiloto IA cero PII",
        definition:
          "Asistente opcional que redacta una propuesta anonimizando previamente nombres, correos, teléfonos móviles y fijos, documentos, direcciones y enlaces.",
      },
    ],
    sections: [
      {
        id: "bandeja",
        title: "Pulso ejecutivo, bandeja y priorización",
        summary:
          "Combina indicadores de carga, serie diaria de 14 días, distribución por asunto y filtros de SLA.",
        topics: [
          {
            id: "sla",
            label: "Semáforo SLA y primera respuesta",
            description:
              "Distingue tickets vencidos, por vencer en menos de 48 horas, en plazo y aquellos que aún esperan su primera respuesta pública.",
            interpretation:
              "Atiende primero casos vencidos, solicitudes de Hábeas Data y tickets sin primera respuesta.",
          },
          {
            id: "analitica",
            label: "Volumen 14 días y mezcla por asunto",
            description:
              "Compara tickets recibidos frente a resueltos por día y muestra qué motivos concentran la demanda reciente.",
            interpretation:
              "Si los recibidos superan de forma sostenida a los cerrados o sube Garantía/Devolución, revisa causas raíz en Pedidos o Despachos.",
          },
          {
            id: "asignacion",
            label: "Propiedad y filtros por motivo",
            description:
              "Permite filtrar por vista operativa, asunto tipificado o búsqueda textual y asignar un responsable claro.",
            interpretation:
              "Asignar un caso no detiene el reloj de SLA; usa Esperando cliente solo cuando falte información real del solicitante.",
          },
        ],
      },
      {
        id: "hilo",
        title: "Detalle 360° y conversación",
        summary:
          "Reúne el hilo cronológico, expedientes cruzados y herramientas de redacción segura.",
        topics: [
          {
            id: "publica",
            label: "Respuesta al cliente",
            description:
              "Envía correo transaccional al solicitante y conserva constancia fechada dentro del expediente.",
            caution:
              "Evita datos innecesarios, lenguaje especulativo y promesas de reembolso no ejecutadas.",
          },
          {
            id: "copiloto",
            label: "Copiloto de soporte",
            description:
              "Sugiere un borrador con reglas de Ley 1480 y Ley 1581 sin enviar datos personales a proveedores externos.",
            interpretation:
              "Revisa siempre hechos, vigencia de garantía, estado del pedido y tono antes de enviar al cliente.",
          },
          {
            id: "relaciones",
            label: "Conexión 360°",
            description:
              "Enlaza según tus permisos con el pedido, la ficha Contacto 360 y el reclamo de garantía o retracto vinculado.",
            interpretation:
              "Verifica el estado vivo del pedido o del caso posventa antes de comprometer fechas.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "resolver-ticket",
        title: "Atender y cerrar un ticket con trazabilidad",
        goal: "Resolver la solicitud dentro del SLA legal con evidencia completa y comunicación clara.",
        steps: [
          "Abre el ticket desde la bandeja priorizada por SLA y lee el hilo completo junto con las notas internas.",
          "Toma propiedad asignándote el caso y pasa el estado a En gestión si aún estaba Abierto.",
          "Consulta el pedido, Contacto 360 o el expediente de Garantías/Retractos enlazado para confirmar los hechos.",
          "Redacta la respuesta pública (apoyándote opcionalmente en el Copiloto IA) explicando la solución o el siguiente paso concreto.",
          "Cierra como Resuelto o Cerrado únicamente cuando la gestión haya concluido o la decisión final esté sustentada y notificada.",
        ],
        expected:
          "El cliente recibe respuesta oportuna por correo, queda registrada la primera atención y el SLA se cierra con trazabilidad forense.",
        exceptions: [
          "Si dependes de evidencia del comprador o de validación de otra área, deja nota interna, asigna responsable y usa Esperando cliente sin cerrar en falso.",
        ],
      },
    ],
    cautions: [
      "Nunca copies datos sensibles de tarjetas o contraseñas en el hilo ni prometas devoluciones de dinero sin autorización de Dirección.",
    ],
    faqs: [
      {
        question: "¿Dónde está la antigua bandeja Mensajes?",
        answer:
          "La ruta histórica /admin/mensajes redirige automáticamente a Soporte preservando tu búsqueda y vista.",
      },
      {
        question: "¿Por qué algunos tickets tienen 10 días hábiles y otros 15?",
        answer:
          "Las consultas de Privacidad / Hábeas Data se rigen por el tope de 10 días hábiles de la Ley 1581; las demás PQR aplican 15 días hábiles.",
      },
    ],
    related: ["clientes", "pedidos", "garantias", "retractos", "resenas", "hoy"],
    keywords: ["ticket", "PQR", "Hábeas Data", "SLA", "hilo", "respuesta", "mensaje", "copiloto"],
    version: 2,
  },
  {
    id: "garantias",
    title: "Garantías",
    area: "Servicio al cliente",
    route: "/admin/garantias",
    summary:
      "Diagnóstico técnico, semáforo SLA de 15 días hábiles, evidencia probatoria y resolución por reparación, reposición o devolución.",
    purpose:
      "Gestiona reclamos de garantía legal (Ley 1480 arts. 7–15 y art. 58) controlando cobertura sellada en la compra, evidencia fotográfica sanitizada, propiedad del caso y exposición por devoluciones. La ruta histórica Reclamos redirige aquí y Analista Financiero dispone de consulta contable de solo lectura con PII enmascarado.",
    whenToUse: [
      "Cuando un comprador reporta defecto de calidad, daño de transporte o falla funcional dentro o fuera del plazo.",
      "Para diagnosticar evidencia, asignar responsable y aprobar reparación, reposición o rechazo motivado.",
      "Para ejecutar el cierre con devolución de dinero (exclusivo Superadmin con MFA) o auditar el pasivo contable.",
    ],
    concepts: [
      {
        term: "Vigencia sellada",
        definition:
          "Plazo en meses guardado en el ítem al momento de la compra contado desde la fecha de entrega; los productos personalizados sí cuentan con garantía legal.",
      },
      {
        term: "Evidencia de resolución aceptada",
        definition:
          "Constancia fechada cuando el comprador aprobó voluntariamente imprimir una foto de baja resolución en el editor antes de pagar.",
      },
      {
        term: "Segregación de reembolso",
        definition:
          "Operaciones y Soporte diagnostican y gestionan reparación o reposición; cerrar una garantía mediante devolución de dinero exige Superadmin con MFA reciente.",
      },
    ],
    sections: [
      {
        id: "caso",
        title: "Diagnóstico legal, SLA y trazabilidad financiera",
        summary:
          "Combina embudo de estados, remedios de Ley 1480, stepper de 4 etapas y evidencia cruzada.",
        topics: [
          {
            id: "vigencia",
            label: "Cobertura sellada y SLA de 15 días hábiles",
            description:
              "Muestra la fecha límite de garantía del ítem y el semáforo legal de 15 días hábiles desde la radicación del reclamo.",
            interpretation:
              "Prioriza los reclamos vencidos o en riesgo SLA y contrasta si el defecto proviene de fabricación, transporte o archivo de origen.",
          },
          {
            id: "evidencia",
            label: "Evidencia fotográfica y sello de calidad",
            description:
              "Presenta las fotos aportadas bajo enlaces seguros y alerta si el diseño tenía advertencia de baja resolución aceptada por el cliente.",
            caution:
              "En modo contable de solo lectura (Analista Financiero), las fotos, textos libres y datos personales permanecen ocultos por privacidad.",
          },
          {
            id: "resolucion",
            label: "Remedios: Reparar, Reponer o Reembolsar",
            description:
              "Permite elegir la vía técnica aplicable al defecto conforme al Estatuto del Consumidor.",
            interpretation:
              "En primera falla técnica prioriza reparación o reposición sin costo salvo imposibilidad material; documenta siempre las notas para el cliente.",
          },
          {
            id: "reembolso",
            label: "Ejecución de devolución de dinero (Superadmin + MFA)",
            description:
              "Cuando la garantía procede por reembolso, la transición final a Resuelta con desembolso está reservada a Superadmin con sesión MFA reciente.",
            caution:
              "Confirma primero la reversión real en Wompi o transferencia bancaria antes de marcar el cierre definitivo.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "resolver-garantia",
        title: "Diagnosticar y gestionar un reclamo de garantía",
        goal: "Adoptar una decisión técnica motivada dentro de los 15 días hábiles y coordinar su cumplimiento.",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT"],
        steps: [
          "Asigna el reclamo con Asignarme o elige responsable y pásalo a En revisión para iniciar el diagnóstico.",
          "Verifica pedido, ítem, vigencia sellada desde la entrega, fotos aportadas y si existe aceptación previa de baja resolución.",
          "Si no procede legalmente, rechaza explicando con respeto y sustento técnico el motivo verificable.",
          "Si procede por Reparación o Reposición, aprueba seleccionando el remedio e indicando al cliente los pasos logísticos.",
          "Una vez enviado el reemplazo o completada la reparación, marca Resuelta dejando constancia de guía o referencia.",
        ],
        expected:
          "El expediente avanza por sus 4 etapas legales, notifica al comprador y conserva evidencia completa en bitácora forense.",
        exceptions: [
          "Si el único remedio viable es Devolución de dinero y no eres Superadmin, documenta el diagnóstico en notas y escala a Dirección para el cierre con MFA.",
        ],
      },
      {
        id: "auditar-garantias-finanzas",
        title: "Consultar exposición por garantías en modo contable",
        goal: "Verificar montos comprometidos y reembolsos ejecutados sin acceder a PII de clientes.",
        roles: ["FINANCE_ANALYST"],
        steps: [
          "Revisa las tarjetas superiores de exposición aprobada por reembolso y total efectivamente desembolsado.",
          "Filtra por remedio Devolución dinero o busca por número de pedido o código del caso.",
          "Cruza el valor del ítem y la fecha de resolución con Finanzas o el extracto de la pasarela.",
        ],
        expected:
          "Obtienes trazabilidad contable exacta sobre salidas de caja por garantía manteniendo protegidos los datos personales.",
      },
    ],
    cautions: [
      "No confundas garantía por defecto (aplica incluso en personalizados) con derecho de retracto, ni cierres un reembolso sin soporte bancario.",
    ],
    faqs: [
      {
        question: "¿Qué pasó con la ruta /admin/reclamos?",
        answer:
          "Redirige de forma segura a Garantías preservando el identificador buscado para evitar doble bandeja.",
      },
      {
        question: "¿Por qué no puedo elegir o cerrar Devolución de dinero con mi rol operativo?",
        answer:
          "Toda salida final de efectivo en posventa está unificada bajo Superadmin con verificación MFA reciente.",
      },
    ],
    related: ["retractos", "soporte", "pedidos", "finanzas"],
    keywords: ["falla", "reparación", "reposición", "devolución", "reclamo", "Ley 1480", "SLA"],
    version: 2,
  },
  {
    id: "retractos",
    title: "Retractos",
    area: "Servicio al cliente",
    route: "/admin/retractos",
    summary:
      "Control legal de retractos (Ley 1480 art. 47 / Ley 2439), recepción física, SLA de 15 días calendario y reembolso protegido con MFA.",
    purpose:
      "Administra el ciclo de 4 etapas del derecho de retracto separando aprobación, devolución física en bodega y desembolso final del dinero. Calcula el pasivo vivo en COP, alerta vencimientos del plazo legal de 15 días calendario y ofrece vista contable enmascarada para Analista Financiero.",
    whenToUse: [
      "Al recibir una solicitud de retracto sobre productos de catálogo no personalizados dentro de los 5 días hábiles desde la entrega.",
      "Para asignar responsable, aprobar instrucciones de retorno o confirmar la recepción física del producto.",
      "Para registrar el reembolso efectivo con MFA (Superadmin) o conciliar pasivos por devolución (Analista Financiero).",
    ],
    concepts: [
      {
        term: "Excepción de personalizados",
        definition:
          "Conforme al artículo 47 numeral 3 de la Ley 1480, los bienes confeccionados a la medida o claramente personalizados no admiten retracto (sí garantía por defecto).",
      },
      {
        term: "Plazo máximo de reembolso (15 días calendario)",
        definition:
          "Tope legal de la Ley 2439 de 2024 contado desde que el consumidor ejerce el retracto para devolver el dinero sin descuentos indebidos.",
      },
      {
        term: "Cierre financiero segregado",
        definition:
          "Soporte y Operaciones gestionan aprobación y recepción física; el paso final a Reembolsado exige Superadmin con MFA reciente.",
      },
    ],
    sections: [
      {
        id: "etapas",
        title: "Stepper legal, pasivo COP y control de SLA",
        summary: "Separa evaluación documental, retorno logístico y salida efectiva de caja.",
        topics: [
          {
            id: "solicitud",
            label: "1. Solicitud y elegibilidad",
            description:
              "Expone fecha de radicación, ítem, monto en COP, responsable asignado y reloj de 15 días calendario.",
            interpretation:
              "Comprueba que el bien no sea personalizado y que la solicitud se haya presentado dentro de los 5 días hábiles posteriores a la entrega.",
          },
          {
            id: "devolucion",
            label: "2–3. Aprobación y recepción física",
            description:
              "Registra primero la autorización de retorno y, una vez verificado el paquete en bodega, marca Bien recibido.",
            interpretation:
              "Nunca marques recibido solo porque el cliente envió número de guía; espera confirmación física del estado del producto.",
          },
          {
            id: "reembolso",
            label: "4. Reembolso verificado (Superadmin + MFA)",
            description:
              "Cierra el expediente tras ejecutar la devolución real del dinero en Wompi o medio bancario y revierte puntos de fidelización aplicables.",
            caution:
              "Analista Financiero visualiza montos, estados y pedidos con PII y motivos de texto libre enmascarados en servidor.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "gestionar-retracto",
        title: "Gestionar un retracto desde la solicitud hasta recepción en bodega",
        goal: "Cumplir las etapas operativas a tiempo para no agotar los 15 días calendario de ley.",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT"],
        steps: [
          "Toma propiedad del caso con Asignarme y revisa pedido, producto y semáforo SLA.",
          "Aprueba la solicitud indicando las instrucciones claras de devolución o rechaza motivadamente si aplica una causal legal.",
          "Haz seguimiento al tránsito y confirma con bodega el ingreso e integridad del artículo devuelto.",
          "Marca Bien recibido dejando constancia en notas para habilitar el desembolso final por Dirección.",
        ],
        expected:
          "El expediente queda listo para reembolso con trazabilidad de fechas, responsable y verificación física.",
      },
      {
        id: "ejecutar-reembolso-retracto",
        title: "Ejecutar y registrar el reembolso final",
        goal: "Formalizar la devolución efectiva del dinero con verificación MFA y soporte verificable.",
        roles: ["SUPERADMIN"],
        steps: [
          "Filtra la vista Bien recibido (por reembolsar) y abre el pedido vinculado para verificar el pago original.",
          "Ejecuta la devolución en Wompi o transferencia bancaria y copia el identificador de la operación.",
          "Con tu sesión MFA reciente activa, registra la referencia en notas y pulsa Marcar reembolsado.",
        ],
        expected:
          "El cliente recibe confirmación de cierre, se ajustan puntos asociados y el caso queda sellado en auditoría forense.",
      },
      {
        id: "conciliar-retractos-finanzas",
        title: "Consultar pasivo y reembolsos por retracto",
        goal: "Contrastar compromisos de caja abiertos y devoluciones liquidadas sin exponer PII.",
        roles: ["FINANCE_ANALYST"],
        steps: [
          "Revisa los indicadores de pasivo abierto, listos por reembolsar y total reembolsado en la cabecera.",
          "Filtra por estado o busca por número de pedido para ubicar la operación contable.",
          "Cruza el importe en COP y las marcas de tiempo con los reportes de Finanzas.",
        ],
        expected:
          "Concilias el impacto en flujo de caja respetando la reserva de identidad y motivos personales.",
      },
    ],
    cautions: [
      "Nunca informes al comprador que el reembolso ya fue realizado antes de que Dirección registre el cierre efectivo.",
    ],
    faqs: [
      {
        question: "¿Por qué Soporte u Operaciones ven un aviso de escalamiento en el paso final?",
        answer:
          "Porque registrar el reembolso implica salida efectiva de dinero y requiere capacidad exclusiva de Superadmin con MFA reciente.",
      },
      {
        question: "¿Qué información ve Analista Financiero en Retractos?",
        answer:
          "Montos en COP, estados, fechas legales y vínculo al pedido, con nombres y correos enmascarados y sin motivos de texto libre.",
      },
    ],
    related: ["garantias", "pedidos", "finanzas", "soporte"],
    keywords: ["Ley 1480", "Ley 2439", "desistir", "devolución", "reembolso", "plazo legal", "MFA"],
    version: 2,
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
        title: "Cola activa, métricas e historial reciente",
        summary:
          "Permite priorizar por antigüedad, inspeccionar piezas 300 DPI bajo demanda y auditar decisiones recientes.",
        topics: [
          {
            id: "preview",
            label: "Vista previa y piezas reales",
            description:
              "Muestra el mosaico en proporción natural con zoom y permite firmar las piezas 300 DPI bajo demanda.",
            interpretation:
              "Comprueba unidades, orientación, legibilidad y aviso de resolución aceptado antes de decidir.",
          },
          {
            id: "decision",
            label: "Aprobar o rechazar",
            description:
              "Aprobar libera taller y despacho; rechazar solicita motivo obligatorio, notifica al cliente y revoca enlaces públicos.",
            caution:
              "El sistema impide rechazar diseños vinculados a pedidos ya enviados o entregados para evitar notificaciones contradictorias.",
          },
          {
            id: "origen-historial",
            label: "Origen 360° e historial de solo lectura",
            description:
              "Enlaza al pedido y a sus piezas de producción según tu rol y conserva los últimos diseños revisados para consulta.",
            interpretation:
              "No fabriques un pedido completo si aún tiene piezas pendientes o rechazadas en la cola activa.",
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
          "Abre el diseño en la cola activa y verifica su tiempo de espera y el pedido asociado.",
          "Amplía la vista previa y abre las piezas reales de producción cuando requieras validar detalle fino.",
          "Contrasta contenido, orientación, recorte y si existe advertencia de resolución aceptada por el cliente.",
          "Aprueba si está apto o rechaza redactando un motivo claro que el cliente recibirá por correo.",
          "Verifica en el pedido o ficha de taller que no queden más diseños pendientes antes de fabricar.",
        ],
        expected:
          "Cada diseño queda trazado en auditoría y producción solo recibe material aprobado.",
      },
    ],
    cautions: [
      "La aprobación de moderación no reemplaza el control físico de impresión ni la validación del pago.",
      "Rechazar un diseño compartido por enlace público (/d/…) revoca permanentemente ese enlace.",
    ],
    faqs: [
      {
        question: "¿Puedo enviar un pedido con un diseño pendiente o rechazado?",
        answer:
          "No. El gate de despacho bloquea pasar el pedido a Enviado hasta que todos sus diseños estén aprobados.",
      },
      {
        question: "¿Dónde consulto quién aprobó o rechazó un diseño ayer?",
        answer:
          "Cambia a la pestaña «Historial reciente (solo lectura)» o abre la Bitácora forense filtrada por entidad Design.",
      },
    ],
    related: ["pedidos", "disenos", "plantillas", "soporte"],
    keywords: ["diseño", "foto", "aprobar", "rechazar", "imprimir", "contenido", "SLA"],
    version: 2,
  },
];
