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
            id: "pulso-etapas",
            label: "Pulso de 14 días y barra de etapas",
            description:
              "Muestra la evolución diaria de órdenes y la distribución interactiva por estado del pipeline.",
            interpretation:
              "Haz clic en un segmento de etapa o filtro rápido (Pendientes de taller, COD sin conciliar) para enfocar la cola.",
          },
        ],
      },
      {
        id: "detalle",
        title: "Detalle del pedido",
        summary: "Reúne los datos, el stepper de ciclo de vida y los vínculos 360° de la orden.",
        topics: [
          {
            id: "pago",
            label: "Pago, Pago Directo B2B y confidencialidad comercial",
            description:
              "Muestra medio de pago, intentos Wompi, soporte de Pago Directo (Bre-B / Transferencia con confirmación MFA) o monto COD según los permisos de tu rol.",
            interpretation:
              "Taller opera sin importes comerciales; Alistamiento solo visualiza el valor a cobrar cuando el pedido es contraentrega; la confirmación bancaria de pagos directos es exclusiva de SUPERADMIN con MFA reciente.",
          },
          {
            id: "disenos",
            label: "Diseños, arte maestro B2B y renders 300 DPI",
            description:
              "Relaciona los ítems personalizados con su estado de moderación, carga de arte maestro 300 DPI en pedidos B2B/eventos, progreso de RenderJob y paquete ZIP de taller.",
            interpretation:
              "En pedidos B2B/eventos con arte posterior al pago, el paquete ZIP y el despacho permanecen bloqueados hasta cargar todas las piezas maestras 300 DPI.",
          },
          {
            id: "envio",
            label: "Envío y guía térmica",
            description:
              "Presenta transportadora, dirección, guía Aveonline, eventos y etiqueta imprimible (sin precios cuando es regalo).",
            interpretation:
              "El último evento del carrier y el estado interno deben interpretarse juntos antes de reintentar una guía.",
          },
          {
            id: "ecosistema",
            label: "Ecosistema 360° vinculado",
            description:
              "Conecta con Contacto 360, oportunidad comercial de origen, retractos, garantías, tickets de soporte, cupón y remesa COD.",
            interpretation:
              "Solo aparecen enlaces hacia submódulos habilitados para tu rol actual.",
          },
          {
            id: "pii",
            label: "Datos del cliente",
            description:
              "La visibilidad de identidad y dirección depende de capacidades específicas de lectura de PII.",
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
      "No anticipes estados: producción, despacho y entrega deben registrar hechos físicos que ya ocurrieron.",
      "Cada rol opera su tramo: Taller prepara e imprime 300 DPI; Alistamiento despacha y gestiona guías; Dirección/Operaciones concilia y cancela.",
      "Bloquear una dirección por no-show COD exige confirmación reciente con segundo factor (MFA).",
    ],
    faqs: [
      {
        question: "¿Pago aprobado significa que el pedido está listo para enviar?",
        answer:
          "No. Todavía deben cumplirse personalización, moderación, producción, alistamiento y generación de guía.",
      },
      {
        question: "¿Por qué no veo los datos de contacto o el desglose comercial?",
        answer:
          "Tu rol recibe únicamente la información necesaria para su etapa (privacidad de PII y confidencialidad comercial). Trabaja con el número de pedido y escala si necesitas validación adicional.",
      },
      {
        question: "¿Dónde corrijo una guía fallida?",
        answer:
          "Abre el detalle del pedido con un rol de Alistamiento u Operaciones, revisa el error reportado y reintenta la guía tras corregir la causa.",
      },
    ],
    related: ["moderacion", "envios", "soporte", "finanzas", "conciliacion", "oportunidades"],
    keywords: [
      "orden",
      "LCM",
      "pago",
      "Bre-B",
      "transferencia",
      "taller",
      "ZIP",
      "guía",
      "despacho",
      "entrega",
      "estado",
    ],
    version: 3,
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
          "Si descartaste un par por error y ambos perfiles siguen activos, puedes reabrirlo a pendientes desde la pestaña Descartados.",
          "Si procede la unificación, selecciona el contacto principal y confirma con tu código MFA reciente.",
          "Verifica pedidos, oportunidades, tickets y consentimientos resultantes en Contacto 360.",
        ],
        expected:
          "Existe una identidad canónica coherente con snapshot reversible en auditoría o un descarte justificado.",
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
      {
        question: "¿Qué pasa si descarté un candidato de duplicado por accidente?",
        answer:
          "Abre la pestaña Descartados y usa Reabrir revisión para devolverlo a Pendientes con registro en auditoría. La fusión definitiva seguirá exigiendo verificación MFA.",
      },
    ],
    related: ["clientes", "auditoria"],
    keywords: ["duplicado", "fusión", "identidad", "colisión", "contacto canónico", "reabrir"],
    version: 2,
  },
  {
    id: "oportunidades",
    title: "Oportunidades B2B",
    area: "Ventas y CRM",
    route: "/admin/oportunidades",
    summary: "Pipeline consultivo para empresas, eventos y pedidos de volumen.",
    purpose:
      "Organiza oportunidades desde el contacto inicial hasta el cierre, con responsable, tareas, propuestas comerciales y relación con pedidos. Permite distinguir interés comercial de una venta confirmada.",
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
        title: "Ficha comercial y constructor de propuestas",
        summary:
          "Reúne configuración solicitada, propuestas versionadas, muestra digital y pedido resultante.",
        topics: [
          {
            id: "requisitos",
            label: "Configuración solicitada y semáforo SLA",
            description:
              "Muestra las líneas del catálogo elegidas por el cliente en /empresas-y-eventos, modalidad de arte, empaque y días hábiles disponibles.",
            interpretation:
              "El rango mostrado al cliente en la web es orientativo; la oferta vinculante nace al emitir una propuesta formal.",
          },
          {
            id: "propuestas",
            label: "Propuestas versionadas (v1, v2…) y enlace privado",
            description:
              "Permite cotizar líneas reales con verificación de margen sobre costo BOM, cotización de envío Aveonline/Envío Lucams, muestra digital y enlace cifrado /propuesta/[token].",
            interpretation:
              "Emitir una nueva versión reemplaza automáticamente la anterior para evitar pagos sobre cotizaciones desactualizadas.",
          },
          {
            id: "vinculos",
            label: "Conversión a pedido real",
            description:
              "Cuando el cliente aprueba y elige medio de pago en su portal privado, se genera automáticamente un pedido LCM conectado a Wompi o Pago Directo, taller 300 DPI, Aveonline y Finanzas.",
            interpretation:
              "La oportunidad pasa a Ganada automáticamente cuando se confirma el pago real del pedido.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "emitir-propuesta-b2b",
        title: "Armar y enviar una propuesta formal B2B / Eventos",
        goal: "Entregar una oferta clara, rentable y pagable en un clic desde /propuesta/[token].",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"],
        steps: [
          "Revisa la configuración solicitada por el cliente, la fecha objetivo y el destino DANE.",
          "En el Constructor de Propuestas ajusta variantes, cantidades, precios negociados y revisa el margen sobre costo BOM.",
          "Cotiza el transporte en vivo (o define tarifa pactada si requiere múltiples cajas o logística asistida).",
          "Elige si la muestra digital se aprueba antes o después del pago y sube el arte de prueba cuando corresponda.",
          "Guarda el borrador y pulsa Emitir y enviar al cliente (o genera el enlace privado para compartirlo por WhatsApp).",
        ],
        expected:
          "El cliente recibe su propuesta versionada con enlace seguro para aprobar dirección exacta, muestra y pago, convirtiéndose en una orden real.",
      },
      {
        id: "avanzar-oportunidad",
        title: "Hacer seguimiento y avanzar una oportunidad",
        goal: "Mantener el pipeline alineado con hechos comerciales verificables.",
        steps: [
          "Revisa necesidades, historial, responsable y tareas abiertas.",
          "Registra la interacción y actualiza requisitos o condiciones confirmadas.",
          "Cambia la etapa únicamente si se cumplió su criterio comercial.",
          "Vincula el pedido existente cuando la oportunidad se concrete fuera del portal o verifica la conversión automática.",
          "Crea el siguiente compromiso con fecha o cierra indicando el resultado y motivo.",
        ],
        expected:
          "La oportunidad muestra etapa real, contexto suficiente y un próximo paso o cierre explícito.",
      },
    ],
    cautions: [
      "No conviertas una oportunidad en ingreso proyectado o real sin revisar el pedido confirmado.",
      "Los precios por debajo del costo unitario BOM están bloqueados salvo autorización expresa de SUPERADMIN.",
    ],
    faqs: [
      {
        question: "¿Cómo se convierte una propuesta en pedido?",
        answer:
          "Al aprobar condiciones y dirección exacta en /propuesta/[token], el sistema crea automáticamente el pedido LCM y al confirmarse el pago (Wompi o Pago Directo verificado) marca la oportunidad como Ganada.",
      },
    ],
    related: ["clientes", "pedidos", "hoy", "finanzas"],
    keywords: ["B2B", "empresa", "evento", "propuesta", "cotización", "Bre-B", "pipeline", "etapa"],
    version: 2,
  },
  {
    id: "resenas",
    title: "Reseñas",
    area: "Ventas y CRM",
    route: "/admin/resenas",
    summary:
      "Reputación verificada, analítica de calificaciones 5★–1★, moderación de catálogo y seguimiento posventa 360°.",
    purpose:
      "Permite supervisar la voz real de los compradores verificados, publicar reseñas legítimas en la ficha del producto (PDP), curar testimonios destacados para la portada (Home) y detectar calificaciones bajas para activar atención privada en Soporte o Contacto 360. No oculta críticas válidas por su puntaje.",
    whenToUse: [
      "Para revisar y aprobar reseñas pendientes antes de su publicación en la tienda.",
      "Para seleccionar reseñas aprobadas que merezcan aparecer en el bloque de testimonios del Home.",
      "Para detectar calificaciones críticas (1★–2★) y abrir seguimiento directo con el pedido, Contacto 360 o Soporte.",
    ],
    concepts: [
      {
        term: "Publicación en dos pasos",
        definition:
          "Aprobar publica la reseña en la página del producto (PDP); marcar ★ Destacar en Home requiere que esté aprobada y la promueve a la portada.",
      },
      {
        term: "Compra verificada",
        definition:
          "Distintivo otorgado cuando la opinión proviene de una compra real confirmada mediante cuenta de cliente o enlace único posentrega.",
      },
      {
        term: "Lectura de reputación vs. moderación",
        definition:
          "Soporte consulta todas las calificaciones y navega a Pedido o Contacto 360 en solo lectura; Catálogo y Operaciones ejecutan la moderación editorial.",
      },
    ],
    sections: [
      {
        id: "moderacion",
        title: "Analítica 5★–1★, moderación y conexión posventa",
        summary:
          "Integra distribución por estrellas, barra de estados, acciones por lote y enlaces 360°.",
        topics: [
          {
            id: "distribucion",
            label: "Distribución 5★–1★ y alertas críticas",
            description:
              "Muestra el promedio global aprobado, el peso porcentual de cada estrella y permite filtrar con un clic las reseñas de 1★ o 2★.",
            interpretation:
              "Si aumentan las reseñas de 1★ o 2★ en un mismo producto, inspecciona la ficha en catálogo y los reclamos de garantía asociados.",
          },
          {
            id: "estado",
            label: "Estados: Pendiente, Aprobada y Archivada",
            description:
              "Controla qué opiniones se muestran en la tienda pública y conserva archivadas las descartadas por spam, abuso o datos privados.",
            caution:
              "Nunca archives una reseña legítima solo por tener baja calificación; archiva únicamente cuando infrinja normas de respeto o exponga datos personales.",
          },
          {
            id: "destacada",
            label: "★ Destacar en Home y enlaces 360°",
            description:
              "Promueve reseñas aprobadas a la portada y enlaza cada fila con PDP, ficha del producto, Pedido, Contacto 360 y Soporte.",
            interpretation:
              "Para atender una mala experiencia no existe réplica pública en la reseña: gestiona la solución privada por Soporte o Contacto 360.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "moderar-resena",
        title: "Moderar reseñas y curar destacados de portada",
        goal: "Publicar opiniones auténticas en PDP y mantener testimonios representativos en el Home.",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"],
        steps: [
          "Filtra la vista Pendientes y verifica el texto, puntaje, producto y sello de compra verificada.",
          "Aprueba las reseñas legítimas (individualmente o en lote) para publicarlas en la página del producto.",
          "Si una reseña contiene insultos, spam o datos sensibles (teléfonos, direcciones), archívala para retirarla de la vista pública.",
          "Entre las reseñas ya aprobadas con contexto útil para futuros compradores, activa ★ Destacar para mostrarlas en el Home.",
        ],
        expected:
          "La caché de la ficha del producto y de la portada se actualiza al instante y cada acción queda registrada en auditoría.",
      },
      {
        id: "atender-resena-critica",
        title: "Dar seguimiento posventa a una reseña de 1★ o 2★",
        goal: "Convertir una calificación crítica en gestión proactiva de soporte o garantía.",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT"],
        steps: [
          "Haz clic en las barras de 1★ o 2★ o en la tarjeta de atención prioritaria para aislar las opiniones críticas.",
          "Abre el enlace al Pedido o a Contacto 360 en la misma fila para revisar entrega, diseño y antecedentes.",
          "Inicia o actualiza la atención privada desde Soporte o Garantías según corresponda al caso.",
        ],
        expected:
          "El comprador recibe acompañamiento directo por el canal adecuado sin alterar ni censurar su calificación original.",
      },
    ],
    cautions: [
      "No censures reseñas negativas reales: la transparencia protege la confianza de marca y cumple las normas de protección al consumidor.",
    ],
    faqs: [
      {
        question: "¿Cómo respondo a un cliente que dejó una queja en una reseña?",
        answer:
          "Lucams no publica réplicas abiertas sobre la reseña para proteger la privacidad del comprador; usa los enlaces a Pedido, Contacto 360 o Soporte para atenderlo directamente.",
      },
      {
        question: "¿Por qué Soporte ve las reseñas pero no los botones de aprobar o archivar?",
        answer:
          "Porque Soporte tiene acceso de lectura reputacional para investigar incidencias, mientras la publicación en escaparate corresponde a roles con escritura de catálogo.",
      },
    ],
    related: ["soporte", "garantias", "pedidos", "clientes", "productos"],
    keywords: ["opinión", "calificación", "estrellas", "moderar", "destacada", "reputación", "PDP"],
    version: 2,
  },
];
