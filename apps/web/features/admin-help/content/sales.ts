import type { AdminModuleGuide } from "../types";

export const SALES_GUIDES: AdminModuleGuide[] = [
  {
    id: "pedidos",
    title: "Pedidos",
    area: "Ventas y CRM",
    route: "/admin/pedidos",
    summary:
      "Consulta y operación del ciclo del pedido: pago, personalización, producción, envío y posventa.",
    purpose:
      "Centraliza la información necesaria para interpretar y hacer avanzar cada orden. El listado localiza pedidos y el detalle muestra ítems, diseños, pagos, envío, historial y acciones permitidas para tu rol.",
    whenToUse: [
      "Para localizar una orden por número, cliente, estado o fecha.",
      "Antes de fabricar, despachar, responder una novedad o revisar un pago.",
      "Para descargar activos de producción o consultar la trazabilidad del pedido.",
    ],
    concepts: [
      {
        term: "Estado del pedido",
        definition:
          "Etapa principal de la saga comercial y logística. No debe confundirse con pago, producción o entrega por separado.",
      },
      {
        term: "Moderación",
        definition: "Revisión de diseños personalizados antes de autorizar su fabricación.",
      },
      {
        term: "Contraentrega",
        definition:
          "Modalidad en la que el recaudo se realiza al entregar; requiere conciliación posterior y no equivale a pago anticipado.",
      },
    ],
    sections: [
      {
        id: "listado",
        title: "Listado y filtros",
        summary: "Permite construir una cola de trabajo y detectar pedidos que requieren atención.",
        topics: [
          {
            id: "busqueda",
            label: "Búsqueda y filtros",
            description:
              "Acotan resultados por identificador, datos comerciales, estado o período.",
            interpretation:
              "Si no encuentras una orden, retira filtros antes de concluir que no existe.",
          },
          {
            id: "estado",
            label: "Estado",
            description: "Resume la etapa actual de la orden y determina las acciones disponibles.",
            interpretation:
              "Contrasta el estado con pago, producción y envío en el detalle antes de decidir.",
          },
          {
            id: "lote",
            label: "Acciones por lote",
            description:
              "Aplican una misma transición a varios pedidos seleccionados cuando las reglas lo permiten.",
            caution:
              "Revisa cada selección: una acción masiva puede afectar varios clientes y no sustituye la validación individual.",
          },
        ],
      },
      {
        id: "detalle",
        title: "Detalle del pedido",
        summary: "Reúne los datos y procesos que explican la situación real de la orden.",
        topics: [
          {
            id: "pago",
            label: "Pago y conciliación",
            description: "Muestra la información disponible del medio y resultado del recaudo.",
            interpretation:
              "Un pedido creado no prueba un pago aprobado; verifica el resultado registrado por el proveedor o la conciliación COD.",
          },
          {
            id: "disenos",
            label: "Diseños y producción",
            description:
              "Relaciona los ítems personalizados con sus diseños, moderación y paquete de taller.",
            interpretation:
              "Descarga el paquete únicamente cuando el pedido esté listo según el flujo operativo.",
          },
          {
            id: "envio",
            label: "Envío y guía",
            description:
              "Presenta transportadora, dirección, guía, eventos y novedades logísticas.",
            interpretation:
              "El último evento del carrier y el estado interno deben interpretarse juntos.",
          },
          {
            id: "timeline",
            label: "Historial",
            description: "Conserva eventos y cambios para reconstruir qué ocurrió y cuándo.",
            interpretation: "Úsalo antes de repetir una acción o atribuir una incidencia.",
          },
          {
            id: "pii",
            label: "Datos del cliente",
            description:
              "La visibilidad de identidad y contacto depende de capacidades específicas.",
            caution:
              "No copies ni compartas datos personales fuera del canal autorizado, incluso si puedes verlos.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "preparar-produccion",
        title: "Preparar un pedido para producción",
        goal: "Confirmar que la orden y sus diseños están listos antes de fabricar.",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "PRINT_WORKSHOP"],
        steps: [
          "Localiza el pedido y abre su detalle.",
          "Verifica que la condición comercial permita producir y que no exista una cancelación vigente.",
          "Revisa todos los ítems, variantes, cantidades y especificaciones de personalización.",
          "Confirma que los diseños estén aprobados y que no falten activos.",
          "Descarga el paquete de producción y contrasta su contenido con la ficha del pedido.",
          "Registra la transición de producción únicamente cuando el trabajo haya comenzado realmente.",
        ],
        expected:
          "Taller recibe exactamente los archivos y especificaciones del pedido, con trazabilidad del inicio de fabricación.",
        exceptions: [
          "Si falta un diseño o está pendiente de moderación, detén ese ítem y escala el bloqueo.",
          "Si el paquete no coincide con la ficha, no fabriques por aproximación; solicita revisión.",
        ],
      },
      {
        id: "registrar-despacho",
        title: "Registrar el despacho o la entrega",
        goal: "Mantener sincronizados el estado visible, la guía y el trabajo logístico real.",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "FULFILLMENT"],
        steps: [
          "Confirma que los ítems estén fabricados, alistados y correspondan al pedido.",
          "Verifica transportadora, destinatario, dirección y guía antes de cerrar el paquete.",
          "Imprime o descarga la guía desde la acción autorizada.",
          "Registra el cambio de estado solo cuando el evento logístico haya ocurrido.",
          "Comprueba el historial y la información pública resultante.",
        ],
        expected:
          "El pedido refleja el despacho o entrega real sin anticipar eventos ni omitir trazabilidad.",
        exceptions: [
          "Si la guía falla, conserva el pedido en su estado y revisa la integración antes de reintentar.",
        ],
      },
      {
        id: "consultar-pedido-soporte",
        title: "Consultar un pedido para atender al cliente",
        goal: "Responder con información vigente sin ejecutar transiciones no autorizadas.",
        roles: ["CUSTOMER_SUPPORT"],
        steps: [
          "Localiza la orden y verifica identidad, número y fecha.",
          "Revisa pago, historial, producción, envío y casos de posventa relacionados.",
          "Explica al cliente solo hechos confirmados y próximos pasos realistas.",
          "Crea o actualiza el ticket de soporte si requiere seguimiento.",
        ],
        expected:
          "La atención queda sustentada en el detalle vivo del pedido y con seguimiento cuando es necesario.",
      },
    ],
    cautions: [
      "No anticipes estados: producción, despacho y entrega deben registrar hechos que ya ocurrieron.",
      "Una cancelación, reembolso o modificación de pago puede exigir otro procedimiento y permisos adicionales.",
      "Las acciones por lote exigen la misma validación que una acción individual.",
    ],
    faqs: [
      {
        question: "¿Pago aprobado significa que el pedido está listo para enviar?",
        answer:
          "No. Todavía deben cumplirse personalización, moderación, producción, alistamiento y generación de guía.",
      },
      {
        question: "¿Por qué no veo los datos de contacto?",
        answer:
          "Tu rol puede tener acceso operativo sin permiso para datos personales. Trabaja con el número de pedido y escala si necesitas validación adicional.",
      },
      {
        question: "¿Dónde corrijo una guía fallida?",
        answer:
          "Abre el detalle, revisa el error y sigue el diagnóstico de Integraciones o Envíos según la causa antes de reintentar.",
      },
    ],
    related: ["moderacion", "envios", "soporte", "finanzas", "conciliacion"],
    keywords: ["orden", "LCM", "pago", "taller", "ZIP", "guía", "despacho", "entrega", "estado"],
    version: 1,
  },
  {
    id: "clientes",
    title: "Clientes y Contacto 360",
    area: "Ventas y CRM",
    route: "/admin/clientes",
    summary:
      "Directorio de identidades y vista integral de relación comercial, pedidos, soporte y consentimientos.",
    purpose:
      "Permite entender la relación con una persona sin duplicar identidades ni mezclar datos de personal interno. El detalle reúne actividad comercial y operativa para soporte, seguimiento y CRM.",
    whenToUse: [
      "Para localizar un contacto y revisar su historial.",
      "Antes de registrar actividades, tareas o seguimiento comercial.",
      "Para verificar consentimientos, vínculos y posibles duplicados.",
    ],
    concepts: [
      {
        term: "Contacto canónico",
        definition: "Registro principal que reúne identidades y relaciones de una misma persona.",
      },
      {
        term: "Contacto 360",
        definition:
          "Vista consolidada de pedidos, oportunidades, tickets, actividades, tareas y consentimientos.",
      },
      {
        term: "Personal interno",
        definition:
          "Contacto identificado como miembro del equipo; debe tratarse separadamente de la analítica de clientes.",
      },
    ],
    sections: [
      {
        id: "directorio",
        title: "Directorio",
        summary: "Busca y segmenta contactos sin perder su identidad principal.",
        topics: [
          {
            id: "buscar",
            label: "Búsqueda",
            description: "Localiza por los datos de identidad disponibles para tu rol.",
            interpretation:
              "Revisa coincidencias similares antes de crear seguimiento sobre una identidad distinta.",
          },
          {
            id: "propietario",
            label: "Responsable",
            description:
              "Indica quién acompaña comercialmente el contacto cuando existe asignación.",
            interpretation: "Coordina con el responsable antes de cambiar el seguimiento.",
          },
        ],
      },
      {
        id: "perfil",
        title: "Perfil 360",
        summary: "Presenta la historia relacionada con el contacto y las acciones CRM permitidas.",
        topics: [
          {
            id: "identidades",
            label: "Identidades vinculadas",
            description: "Muestra correos, teléfonos u otras señales asociadas al mismo contacto.",
            caution: "No fusiones identidades solo por semejanza; usa la revisión de duplicados.",
          },
          {
            id: "actividad",
            label: "Actividades y notas",
            description: "Registra interacciones útiles para continuidad del seguimiento.",
            interpretation:
              "Escribe hechos, fecha y próximo paso; evita juicios o datos innecesarios.",
          },
          {
            id: "consentimientos",
            label: "Consentimientos",
            description: "Muestra autorizaciones y revocaciones con su alcance.",
            interpretation:
              "El consentimiento para una finalidad no habilita automáticamente otras.",
          },
          {
            id: "autogestion",
            label: "Autonegociación",
            description:
              "Señala operaciones del personal sobre sus propios registros que requieren revisión.",
            caution: "No apruebes beneficios o ajustes propios sin el control correspondiente.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "seguimiento-contacto",
        title: "Registrar seguimiento de un contacto",
        goal: "Conservar contexto útil y un próximo paso claro.",
        steps: [
          "Verifica que estés en el contacto canónico correcto.",
          "Revisa actividades recientes, pedidos, tickets y oportunidades para evitar duplicar gestión.",
          "Registra la actividad con hechos concretos y el acuerdo alcanzado.",
          "Crea una tarea con responsable y fecha si queda un compromiso.",
          "Comprueba que el próximo paso aparezca en la vista del contacto y en la bandeja correspondiente.",
        ],
        expected:
          "Otra persona autorizada puede continuar el seguimiento sin pedir nuevamente el contexto.",
      },
    ],
    cautions: [
      "Registra solo datos necesarios para la gestión; nunca escribas contraseñas, códigos o información financiera sensible en notas.",
      "La exportación o uso comercial de datos exige consentimiento y capacidad específica.",
    ],
    faqs: [
      {
        question: "¿Cliente y Contacto son siempre lo mismo?",
        answer:
          "El Contacto es la identidad canónica que puede reunir varias relaciones; usa la vista 360 para entender sus vínculos.",
      },
      {
        question: "¿Cómo corrijo un duplicado?",
        answer:
          "Desde Clientes duplicados, con revisión humana y evidencia; no borres manualmente una de las identidades.",
      },
    ],
    related: ["duplicados", "oportunidades", "soporte", "segmentos"],
    keywords: ["contacto", "CRM", "360", "actividad", "consentimiento", "nota", "tarea"],
    version: 1,
  },
  {
    id: "duplicados",
    title: "Clientes duplicados",
    area: "Ventas y CRM",
    route: "/admin/clientes/duplicados",
    summary:
      "Cola humana para revisar colisiones de identidad y fusionar contactos de forma controlada.",
    purpose:
      "Ayuda a consolidar identidades que representan a la misma persona preservando relaciones y trazabilidad. La fusión es una decisión de datos, no una limpieza visual del directorio.",
    whenToUse: [
      "Cuando exista un candidato de duplicado detectado por el sistema.",
      "Antes de unificar historiales comerciales aparentemente separados.",
    ],
    concepts: [
      {
        term: "Candidato",
        definition:
          "Par de contactos con señales de coincidencia que todavía requiere revisión humana.",
      },
      {
        term: "Fusión asistida",
        definition:
          "Proceso que selecciona un registro principal y reasigna sus relaciones de forma reversible y auditada.",
      },
    ],
    sections: [
      {
        id: "revision",
        title: "Revisión del par",
        summary: "Compara señales y relaciones antes de decidir.",
        topics: [
          {
            id: "coincidencias",
            label: "Coincidencias",
            description: "Explica qué datos aproximaron los dos contactos.",
            interpretation:
              "Un nombre igual o un dato compartido puede no ser suficiente para afirmar identidad.",
          },
          {
            id: "principal",
            label: "Contacto principal",
            description: "Registro que conservará la identidad canónica después de fusionar.",
            interpretation:
              "Elige considerando integridad, antigüedad, vínculos y datos verificados.",
          },
          {
            id: "relaciones",
            label: "Pedidos y casos relacionados",
            description: "Permiten identificar consecuencias de unir los historiales.",
            caution: "Verifica que todos los vínculos realmente pertenezcan a la misma persona.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "fusionar",
        title: "Resolver un candidato de duplicado",
        goal: "Unificar o descartar el par con evidencia y trazabilidad.",
        steps: [
          "Compara identidades, historial y relaciones de ambos contactos.",
          "Descarta el candidato si no existe evidencia suficiente de que sean la misma persona.",
          "Si procede, selecciona el contacto principal y revisa los datos que prevalecerán.",
          "Confirma la fusión y verifica pedidos, oportunidades, tickets y consentimientos resultantes.",
          "Registra cualquier incidencia para revisión en lugar de repetir la fusión.",
        ],
        expected:
          "Existe una identidad canónica coherente o un descarte justificado, sin pérdida de relaciones.",
      },
    ],
    cautions: [
      "No uses la fusión para ocultar autonegociación, revocar consentimientos o eliminar historial incómodo.",
    ],
    faqs: [
      {
        question: "¿Puedo fusionar porque dos personas comparten teléfono?",
        answer:
          "No necesariamente. Un dato compartido puede corresponder a familiares o empresas; contrasta varias señales.",
      },
    ],
    related: ["clientes", "auditoria"],
    keywords: ["duplicado", "fusión", "identidad", "colisión", "contacto canónico"],
    version: 1,
  },
  {
    id: "oportunidades",
    title: "Oportunidades B2B",
    area: "Ventas y CRM",
    route: "/admin/oportunidades",
    summary: "Pipeline consultivo para empresas, eventos y pedidos de volumen.",
    purpose:
      "Organiza oportunidades desde el contacto inicial hasta el cierre, con responsable, tareas, cotizaciones y relación con pedidos. Permite distinguir interés comercial de una venta confirmada.",
    whenToUse: [
      "Para gestionar solicitudes de empresas y eventos.",
      "Cuando una venta requiera seguimiento, propuesta o varias interacciones.",
      "Para revisar carga y avance del pipeline comercial.",
    ],
    concepts: [
      {
        term: "Etapa",
        definition:
          "Situación comercial de la oportunidad dentro del pipeline; no representa por sí sola una orden o pago.",
      },
      {
        term: "Responsable",
        definition:
          "Persona encargada del siguiente paso y de mantener actualizada la oportunidad.",
      },
      {
        term: "Cierre",
        definition:
          "Resultado ganado o perdido que debe reflejar la realidad comercial y conservar el motivo.",
      },
    ],
    sections: [
      {
        id: "pipeline",
        title: "Pipeline y listado",
        summary: "Agrupa oportunidades por etapa y facilita la priorización.",
        topics: [
          {
            id: "etapa",
            label: "Etapa comercial",
            description: "Ubica la oportunidad en el recorrido de venta.",
            interpretation: "Avanza solo cuando se cumplió el criterio de la nueva etapa.",
          },
          {
            id: "valor",
            label: "Valor estimado",
            description:
              "Referencia comercial de la oportunidad antes de confirmar condiciones finales.",
            interpretation: "No lo sumes como ingreso realizado ni como pedido pagado.",
          },
          {
            id: "tareas",
            label: "Próxima actividad",
            description: "Compromiso que evita dejar la oportunidad sin seguimiento.",
            interpretation: "Debe tener responsable, fecha y resultado esperado.",
          },
        ],
      },
      {
        id: "ficha",
        title: "Ficha comercial",
        summary: "Reúne contacto, necesidades, propuestas, actividades y vínculos.",
        topics: [
          {
            id: "requisitos",
            label: "Necesidad y alcance",
            description: "Documenta productos, cantidades, fechas y personalización solicitada.",
            interpretation: "Valida factibilidad antes de prometer precio o entrega.",
          },
          {
            id: "vinculos",
            label: "Cotización u orden vinculada",
            description: "Relaciona la gestión consultiva con documentos comerciales concretos.",
            interpretation: "Usa el vínculo para evitar duplicar propuestas o pedidos.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "avanzar-oportunidad",
        title: "Hacer seguimiento y avanzar una oportunidad",
        goal: "Mantener el pipeline alineado con hechos comerciales verificables.",
        steps: [
          "Revisa necesidades, historial, responsable y tareas abiertas.",
          "Registra la interacción y actualiza requisitos o condiciones confirmadas.",
          "Cambia la etapa únicamente si se cumplió su criterio comercial.",
          "Vincula la cotización u orden existente cuando corresponda.",
          "Crea el siguiente compromiso con fecha o cierra indicando el resultado y motivo.",
        ],
        expected:
          "La oportunidad muestra etapa real, contexto suficiente y un próximo paso o cierre explícito.",
      },
    ],
    cautions: [
      "No conviertas una oportunidad en ingreso proyectado o real sin revisar los documentos vinculados.",
    ],
    faqs: [
      {
        question: "¿Una oportunidad ganada crea automáticamente un pedido?",
        answer:
          "Debes verificar el vínculo comercial correspondiente; la etapa por sí sola no prueba que exista una orden pagada.",
      },
    ],
    related: ["cotizaciones", "clientes", "pedidos", "hoy"],
    keywords: ["B2B", "empresa", "evento", "pipeline", "etapa", "venta consultiva"],
    version: 1,
  },
  {
    id: "cotizaciones",
    title: "Cotizaciones",
    area: "Ventas y CRM",
    route: "/admin/cotizaciones",
    summary:
      "Consulta histórica y operativa de cotizaciones, conversiones comerciales y fichas de taller.",
    purpose:
      "Conserva las solicitudes y propuestas del flujo de cotización, incluidos datos históricos del modo catálogo. Permite revisar condiciones y vincular oportunidades sin confundir una cotización con una venta.",
    whenToUse: [
      "Para consultar una cotización recibida o emitida.",
      "Para revisar líneas personalizadas y su ficha técnica.",
      "Cuando una propuesta requiera seguimiento como oportunidad B2B.",
    ],
    concepts: [
      {
        term: "Cotización",
        definition:
          "Propuesta o solicitud con condiciones estimadas; no representa por sí misma un pago ni una orden.",
      },
      {
        term: "Modo catálogo",
        definition:
          "Etapa operativa en la que la captación comercial se realizaba sin el checkout completo actual.",
      },
    ],
    sections: [
      {
        id: "detalle",
        title: "Detalle comercial y técnico",
        summary: "Muestra solicitante, líneas, condiciones y archivos necesarios para evaluar.",
        topics: [
          {
            id: "vigencia",
            label: "Condiciones y vigencia",
            description:
              "Precios, cantidades y tiempos deben leerse según la fecha y alcance de la propuesta.",
            caution:
              "No reutilices condiciones históricas sin validar disponibilidad y costos actuales.",
          },
          {
            id: "conversion",
            label: "Conversión a oportunidad",
            description: "Vincula la solicitud con el pipeline consultivo.",
            interpretation: "Evita crear otra oportunidad si ya existe una relacionada.",
          },
          {
            id: "taller",
            label: "Ficha de taller",
            description: "Detalla líneas personalizadas para evaluar o preparar fabricación.",
            interpretation:
              "La ficha técnica no autoriza producción sin el flujo comercial correspondiente.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "revisar-cotizacion",
        title: "Revisar y dar seguimiento a una cotización",
        goal: "Confirmar alcance y mantener la relación comercial correcta.",
        steps: [
          "Verifica identidad del solicitante, fecha y estado de la cotización.",
          "Revisa productos, variantes, cantidades, personalización y condiciones.",
          "Consulta la ficha de taller si hay requisitos técnicos.",
          "Vincula o crea una sola oportunidad para el seguimiento cuando proceda.",
          "Registra el próximo paso sin afirmar que existe una venta confirmada.",
        ],
        expected:
          "La cotización conserva seguimiento comercial y técnico sin duplicar oportunidades ni órdenes.",
      },
    ],
    cautions: ["No uses cotizaciones históricas como evidencia de ingresos o pagos."],
    faqs: [
      {
        question: "¿Por qué no aparece en el menú principal?",
        answer:
          "Es un módulo histórico del modo catálogo; las páginas siguen disponibles para consulta y continuidad comercial.",
      },
    ],
    related: ["oportunidades", "pedidos", "clientes"],
    keywords: ["propuesta", "precio", "histórico", "catálogo", "taller", "B2B"],
    version: 1,
  },
  {
    id: "resenas",
    title: "Reseñas",
    area: "Ventas y CRM",
    route: "/admin/resenas",
    summary: "Moderación, respuesta oficial y destacado de reseñas verificadas de clientes.",
    purpose:
      "Permite revisar que las opiniones publicadas cumplan las reglas del sitio y responder de manera institucional. Las reseñas proceden de compras elegibles y no deben manipularse para ocultar críticas legítimas.",
    whenToUse: [
      "Para revisar opiniones pendientes de moderación.",
      "Para responder una experiencia de compra públicamente.",
      "Para seleccionar contenido destacable sin alterar la opinión del cliente.",
    ],
    concepts: [
      {
        term: "Reseña verificada",
        definition:
          "Opinión asociada a una compra que cumple las condiciones del flujo de reseñas.",
      },
      {
        term: "Respuesta oficial",
        definition: "Comentario de Lucams que complementa la opinión sin reemplazarla ni editarla.",
      },
    ],
    sections: [
      {
        id: "moderacion",
        title: "Moderación y publicación",
        summary: "Controla visibilidad, estado, respuesta y selección editorial.",
        topics: [
          {
            id: "estado",
            label: "Estado de moderación",
            description: "Indica si la reseña está pendiente, aprobada, rechazada o archivada.",
            interpretation: "Aplica criterios consistentes y registra el motivo cuando se rechace.",
          },
          {
            id: "contenido",
            label: "Texto y calificación",
            description: "Opinión del cliente sobre su experiencia.",
            caution:
              "No edites el sentido de la opinión ni expongas datos personales en la respuesta.",
          },
          {
            id: "destacada",
            label: "Destacada",
            description: "Controla su selección para ubicaciones editoriales.",
            interpretation: "Destacar no equivale a aprobar ni cambia la calificación.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "moderar-resena",
        title: "Moderar y responder una reseña",
        goal: "Publicar contenido legítimo y atender la experiencia con respeto.",
        steps: [
          "Revisa la reseña y su compra relacionada sin divulgar información privada.",
          "Aprueba o rechaza según reglas de contenido, no según la calificación.",
          "Redacta una respuesta oficial breve, empática y orientada a solución cuando aporte valor.",
          "Abre un ticket si existe un problema que requiera atención privada.",
          "Marca como destacada solo si la reseña aprobada aporta contexto útil a futuros compradores.",
        ],
        expected:
          "La opinión conserva su autenticidad y cualquier problema operativo tiene seguimiento por el canal adecuado.",
      },
    ],
    cautions: [
      "No rechaces una reseña únicamente por ser negativa ni prometas soluciones que aún no están confirmadas.",
    ],
    faqs: [
      {
        question: "¿Puedo responder con los datos del pedido?",
        answer:
          "No expongas datos personales ni detalles privados; traslada la gestión sensible a Soporte.",
      },
    ],
    related: ["soporte", "pedidos", "clientes"],
    keywords: ["opinión", "calificación", "moderar", "respuesta", "destacada"],
    version: 1,
  },
];
