import { HELP_LIVE_NUMBERS } from "../constants";
import type { AdminModuleGuide } from "../types";

export const SUPPORT_GUIDES: AdminModuleGuide[] = [
  {
    id: "soporte",
    title: "Soporte",
    area: "Servicio al cliente",
    route: "/admin/soporte",
    summary: `Bandeja única de PQR (${HELP_LIVE_NUMBERS.pqrBusinessDays}d hábiles) y Hábeas Data (${HELP_LIVE_NUMBERS.habeasConsultationBusinessDays}d hábiles), Copiloto IA 0-PII y conversión a caso.`,
    purpose: `Centraliza todas las solicitudes de \`/contacto\`, PQR y requerimientos de privacidad Ley 1581 (absorbiendo la ruta histórica \`/admin/mensajes\`). Controla propiedad del ticket, semáforo legal en días hábiles colombianos, separación estricta entre respuesta pública por correo y nota interna, redacción asistida sin enviar PII a terceros y escalamiento limpio hacia Garantías o Retractos.`,
    whenToUse: [
      "A primera hora y durante el día para responder tickets ordenados por vencimiento SLA.",
      "Para atender consultas o reclamos de Hábeas Data (Ley 1581) dentro de su plazo estricto.",
      "Para convertir o vincular una conversación con un expediente formal de Garantía o Retracto.",
    ],
    concepts: [
      {
        term: "SLAs legales diferenciados",
        definition: `Consultas de Hábeas Data (Ley 1581 art. 14): máximo ${HELP_LIVE_NUMBERS.habeasConsultationBusinessDays} días hábiles. Reclamos de datos y PQR generales (Ley 1480 art. 58 / Ley 1581 art. 15): máximo ${HELP_LIVE_NUMBERS.pqrBusinessDays} días hábiles.`,
      },
      {
        term: "Respuesta pública vs nota interna",
        definition:
          "La respuesta pública dispara correo real al solicitante y sella la primera atención; la nota interna solo la lee el equipo administrativo.",
      },
      {
        term: "Copiloto IA cero-PII",
        definition:
          "Antes de consultar al modelo Gemini, el servidor anonimiza nombres, correos, teléfonos, documentos, direcciones y enlaces para que ningún dato personal salga de Lucams Shop.",
      },
    ],
    sections: [
      {
        id: "bandeja",
        title: "Semáforo SLA, filtros y asignación",
        summary: "Prioriza por riesgo regulatorio y evita tickets sin dueño.",
        topics: [
          {
            id: "sla",
            label: "Vencidos, próximos (< 48 h) y sin primera respuesta",
            description:
              "Ordena la cola usando el calendario oficial de festivos de Colombia en zona Bogotá.",
            interpretation:
              "Atiende siempre en este orden: 1) Vencidos, 2) Hábeas Data, 3) Próximos a vencer < 48 h, 4) Sin primera respuesta.",
          },
          {
            id: "estados",
            label: "Abierto, En gestión, Esperando cliente, Resuelto y Cerrado",
            description: "Refleja quién tiene la pelota en este momento.",
            caution:
              "Asignarte el ticket NO detiene el reloj legal; usa Esperando cliente solo cuando ya enviaste una solicitud concreta de evidencia o confirmación al usuario.",
          },
        ],
      },
      {
        id: "hilo",
        title: "Conversación 360°, Copiloto y conversión (`/admin/soporte/[id]`)",
        summary: "Investiga hechos reales antes de escribir una sola línea al cliente.",
        topics: [
          {
            id: "publica",
            label: "Redacción pública verificada",
            description:
              "Usa tuteo respetuoso colombiano (`es-CO`), cita el número de pedido `LCM` cuando aplique y revisa cada dato sugerido por el Copiloto IA antes de enviar.",
            caution:
              "Jamás prometas un reembolso de dinero como hecho consumado: toda devolución monetaria final depende de Superadmin + MFA.",
          },
          {
            id: "conversion-caso",
            label: "Conversión a Garantía o Retracto",
            description:
              "Si el ticket corresponde realmente a falla de calidad o derecho de retracto dentro de término, vincúlalo o conviértelo al flujo legal especializado.",
            interpretation:
              "No tramites un retracto o garantía informalmente solo por correo de soporte: perderías el control del pasivo COP y los relojes de Ley 1480/2439.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "resolver-ticket",
        title: "Atender, escalar o cerrar un ticket PQR / Hábeas Data",
        goal: "Dar solución sustentada en hechos dentro del plazo legal colombiano.",
        route: "/admin/soporte",
        steps: [
          "Abre el ticket más urgente por SLA, léelo completo (incluidas notas internas) y asígnatelo pasando a En gestión.",
          "Abre los enlaces 360° al Pedido `LCM`, Contacto 360 y Reseñas para verificar fechas de pago, entrega, fotos y consentimientos.",
          "Si es un defecto de producto o desistimiento elegible, encamínalo al expediente formal de Garantías o Retractos.",
          "Redacta la respuesta pública (puedes generar borrador con el Copiloto IA 0-PII y verificar cada cifra/fecha) y envíala.",
          "Pasa a Esperando cliente si requieres fotos/datos adicionales, o marca Resuelto/Cerrado solo cuando la solicitud quedó efectivamente atendida.",
        ],
        expected:
          "Queda sellada la respuesta por correo dentro del SLA legal y el expediente conserva trazabilidad completa.",
      },
    ],
    cautions: [
      "Si recibes una solicitud de eliminación o revocación de datos Ley 1581, verifica identidades y obligaciones legales de conservación contable/contractual antes de responder.",
    ],
    dontTouch: [
      "Nunca envíes el borrador del Copiloto IA sin leerlo ni contrastarlo con el pedido vivo.",
      "Nunca escribas una nota interna en la pestaña de Respuesta pública (saldría por correo al cliente).",
      "Nunca cierres tickets en falso para maquillar métricas de SLA.",
    ],
    checklist: [
      "Caso asignado a responsable nominal.",
      "Pedido y Contacto 360 verificados antes de responder.",
      "Confirmé si estoy en pestaña Pública (sale correo) o Nota interna (solo staff).",
      "Si implica retracto o garantía, quedó radicado en su módulo legal propio.",
    ],
    subroutes: [
      {
        id: "soporte-detalle",
        pattern: "/admin/soporte/[id]",
        title: "Expediente y conversación del ticket",
        summary:
          "Estás dentro de un ticket puntual: aquí asignas responsable, alternas entre Respuesta pública y Nota interna, usas el Copiloto 0-PII y conviertes a caso posventa.",
        tips: [
          "Comprueba dos veces el selector Respuesta al cliente vs Nota interna antes de pulsar enviar.",
          "Revisa en la columna lateral el reloj exacto de SLA y los vínculos a Pedido y Contacto 360.",
        ],
        highlightSectionIds: ["hilo"],
        highlightProcedureIds: ["resolver-ticket"],
      },
    ],
    faqs: [
      {
        question: "¿Qué pasó con la bandeja /admin/mensajes?",
        answer:
          "Redirige de forma permanente a /admin/soporte conservando filtros para operar una única bandeja con SLA legal.",
      },
      {
        question: "¿El Copiloto IA ve el correo, teléfono o cédula del cliente?",
        answer:
          "No. Un sanitizador en servidor reemplaza toda PII por marcadores genéricos antes de solicitar la sugerencia de redacción.",
      },
    ],
    related: ["garantias", "retractos", "pedidos", "clientes", "resenas", "hoy"],
    relatedPlaybooks: ["playbook-posventa-ley-1480-1581"],
    keywords: [
      "ticket",
      "PQR",
      "Hábeas Data",
      "Ley 1581",
      "SLA",
      "hilo",
      "respuesta",
      "nota interna",
      "copiloto",
    ],
    version: 3,
  },
  {
    id: "garantias",
    title: "Garantías",
    area: "Servicio al cliente",
    route: "/admin/garantias",
    summary: `Garantía legal Ley 1480 (SLA ${HELP_LIVE_NUMBERS.warrantyBusinessDays}d hábiles), vigencia sellada en compra, evidencia fotográfica y cierre financiero segregado.`,
    purpose: `Gestiona reclamos por calidad, idoneidad o daño en transporte (incluyendo productos personalizados, que SÍ tienen garantía legal). Unifica la antigua ruta \`/admin/reclamos\`, verifica el plazo de garantía sellado en el ítem al comprar, muestra si el cliente aceptó advertencia de baja resolución en el Estudio y separa reparación/reposición frente a devolución de dinero (exclusiva de Superadmin + MFA).`,
    whenToUse: [
      "Cuando un cliente reporte defecto de imán, impresión, corte, estructura o daño de transporte.",
      "Para evaluar fotos probatorias y decidir motivadamente entre Reparación, Reposición, Reembolso o Rechazo técnico.",
      "Como Superadmin para ejecutar el cierre por devolución de dinero, o como Finanzas para auditar exposición en modo 0-PII.",
    ],
    concepts: [
      {
        term: "Personalizados SÍ tienen garantía",
        definition:
          "La excepción del art. 47 de la Ley 1480 aplica solo a Retracto (arrepentimiento); ante defectos de fabricación o transporte, todo producto personalizado goza de garantía legal.",
      },
      {
        term: "Sello de baja resolución aceptada",
        definition:
          "Evidencia fechada cuando el comprador decidió continuar e imprimir una foto pese al aviso de baja nitidez en el Estudio.",
      },
      {
        term: "Segregación del desembolso",
        definition: `Soporte y Operaciones aprueban y cierran reparaciones o reposiciones; cerrar con devolución de dinero exige Superadmin con MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
      },
    ],
    sections: [
      {
        id: "caso",
        title: "Diagnóstico técnico, remedios Ley 1480 y cierre",
        summary: `4 etapas auditadas dentro del tope legal de ${HELP_LIVE_NUMBERS.warrantyBusinessDays} días hábiles.`,
        topics: [
          {
            id: "vigencia-evidencia",
            label: "Vigencia sellada, fotos y alerta de resolución origen",
            description:
              "Compara la fecha de entrega contra los meses de garantía sellados en `OrderItem` y expone las fotos subidas más el sello de calidad del Estudio.",
            interpretation:
              "Distingue defecto de taller/materiales frente a pixelado de una imagen cuya advertencia fue expresamente aceptada por el comprador.",
          },
          {
            id: "remedios",
            label: "Orden legal de remedios: Reparar / Reponer vs Reembolsar",
            description:
              "Conforme a la Ley 1480, ante una primera falla técnica prioriza reposición o reparación sin ningún costo de envío para el consumidor.",
            caution:
              "En rechazo técnico es obligatorio redactar explicación respetuosa, objetiva y sustentada en evidencia verificable.",
          },
          {
            id: "reembolso",
            label: "Cierre con devolución de dinero (Superadmin + MFA)",
            description:
              "Habilitado solo después de ejecutar la reversión real en Wompi o transferencia bancaria.",
            caution:
              "En vista Analista Financiero los nombres, fotos y relatos libres se ocultan en servidor por Ley 1581.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "resolver-garantia",
        title: "Diagnosticar y resolver un reclamo de garantía",
        goal: `Emitir decisión motivada y cumplir el remedio dentro de los ${HELP_LIVE_NUMBERS.warrantyBusinessDays} días hábiles.`,
        route: "/admin/garantias",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT"],
        steps: [
          "Asigna el reclamo y pásalo a En revisión verificando el reloj SLA en días hábiles.",
          "Inspecciona el pedido `LCM`, fecha real de entrega, vigencia en meses sellada, fotos aportadas y si hubo aceptación previa de baja resolución.",
          "Si procede reposición o reparación, apruébala sin cobrar flete adicional al cliente, coordina producción con Taller y marca Resuelta solo al enviar/entregar la solución con su guía.",
          "Si no procede legalmente (plazo vencido, mal uso comprobado o baja resolución advertida y aceptada), rechaza dejando sustento técnico respetuoso y claro.",
          "Si el único remedio viable es devolver dinero, documenta el dictamen en notas y escala a Superadmin para desembolso con MFA.",
        ],
        expected:
          "El cliente recibe notificación formal en cada hito y la bitácora conserva sustento probatorio completo.",
      },
      {
        id: "auditar-garantias-finanzas",
        title: "Auditar pasivo y desembolsos por garantías (0-PII)",
        goal: "Conciliar salidas de caja por posventa sin acceder a fotos ni datos personales.",
        route: "/admin/garantias",
        roles: ["FINANCE_ANALYST"],
        steps: [
          "Consulta en la franja superior el monto aprobado pendiente de desembolso y el total reembolsado.",
          "Filtra por remedio Devolución de dinero.",
          "Cruza código de pedido, valor COP y fecha de cierre con /admin/finanzas y extractos.",
        ],
        expected: "Cuadre contable exacto de garantías reembolsadas bajo mínimo privilegio.",
      },
    ],
    cautions: [
      "Nunca le cobres fletes de recogida ni de reenvío al consumidor en una garantía aprobada (Ley 1480 art. 11).",
    ],
    dontTouch: [
      "Jamás rechaces una garantía diciendo que «los productos personalizados no tienen garantía»: eso es falso legalmente (solo están excluidos de retracto).",
      "Jamás pulses cierre por devolución de dinero antes de tener el comprobante real de Wompi o banco.",
    ],
    checklist: [
      "Verifiqué fecha de entrega, meses de garantía sellados y sello de resolución del Estudio.",
      "Revisé las fotos de evidencia antes de decidir.",
      "Documenté guía de reposición o comprobante bancario antes de marcar Resuelta.",
    ],
    faqs: [
      {
        question: "¿Qué ocurre al entrar a /admin/reclamos o /admin/reclamos/[id]?",
        answer:
          "Redirige de forma permanente a Garantías conservando el identificador para que todo cierre notifique siempre al cliente.",
      },
      {
        question: "¿Por qué mi rol de Soporte u Operaciones no puede cerrar un reembolso aprobado?",
        answer:
          "Por segregación financiera: quien diagnostica el caso no ejecuta la salida de efectivo; el paso final requiere Superadmin con MFA reciente.",
      },
    ],
    related: ["retractos", "soporte", "pedidos", "finanzas"],
    relatedPlaybooks: ["playbook-posventa-ley-1480-1581"],
    keywords: [
      "falla",
      "defecto",
      "reparación",
      "reposición",
      "devolución",
      "reclamo",
      "Ley 1480",
      "SLA",
    ],
    version: 3,
  },
  {
    id: "retractos",
    title: "Retractos",
    area: "Servicio al cliente",
    route: "/admin/retractos",
    summary: `Derecho de retracto (ventana ${HELP_LIVE_NUMBERS.retractWindowBusinessDays}d hábiles; reembolso máx. ${HELP_LIVE_NUMBERS.retractRefundCalendarDays}d calendario Ley 2439) con MFA.`,
    purpose: `Administra las 4 etapas legales del derecho de retracto sobre bienes NO personalizados: validación de elegibilidad (${HELP_LIVE_NUMBERS.retractWindowBusinessDays} días hábiles desde entrega), aprobación con instrucciones de retorno, confirmación física en bodega y reembolso final en máximo ${HELP_LIVE_NUMBERS.retractRefundCalendarDays} días calendario ejecutado por Superadmin con MFA reciente (revirtiendo puntos proporcionales).`,
    whenToUse: [
      "Al recibir una solicitud de desistimiento sobre productos estándar sin personalización.",
      "Para confirmar recepción física e integridad en bodega del artículo devuelto.",
      "Como Superadmin para registrar el reembolso dentro de los 15 días calendario, o como Finanzas para auditar el pasivo.",
    ],
    concepts: [
      {
        term: "Exclusión legal de personalizados (art. 47 num. 3 Ley 1480)",
        definition:
          "Los artículos confeccionados conforme a especificaciones del consumidor o claramente personalizados NO admiten retracto por arrepentimiento (sí garantía si tienen defecto).",
      },
      {
        term: `Reloj estricto de ${HELP_LIVE_NUMBERS.retractRefundCalendarDays} días calendario (Ley 2439 de 2024)`,
        definition: `Plazo máximo corrido (incluyendo fines de semana y festivos) para devolver el dinero sin deducciones indebidas desde que el cliente ejerció el derecho.`,
      },
    ],
    sections: [
      {
        id: "etapas",
        title: "Las 4 etapas del retracto y control de pasivo COP",
        summary: "Separa admisión legal, retorno físico y devolución bancaria.",
        topics: [
          {
            id: "solicitud",
            label: `1. Elegibilidad (${HELP_LIVE_NUMBERS.retractWindowBusinessDays} días hábiles y producto estándar)`,
            description: "Comprueba fecha de entrega y naturaleza no personalizada del ítem.",
            interpretation:
              "Si el cliente en realidad reporta un producto roto o mal impreso sobre un personalizado, oriéntalo o conviértelo a Garantía legal.",
          },
          {
            id: "recepcion",
            label: "2–3. Instrucciones de devolución y Bien recibido",
            description:
              "El consumidor asume el transporte de devolución en retracto puro; bodega verifica que llegue completo y en las mismas condiciones.",
            caution:
              "Jamás marques Bien recibido solo porque el cliente mandó foto de la guía: espera tener el paquete inspeccionado físicamente.",
          },
          {
            id: "reembolso",
            label: "4. Reembolso final (Superadmin + MFA)",
            description: `Tras devolver el dinero en Wompi o banco, Superadmin confirma con MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min), ajustando puntos automáticamente.`,
            caution:
              "Cuida que la demora del envío de retorno no haga vencer el tope legal de 15 días calendario sin gestión documentada.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "gestionar-retracto",
        title: "Evaluar, aprobar y recibir físicamente un retracto",
        goal: "Adelantar ágilmente las etapas 1 a 3 para dejar margen holgado al desembolso.",
        route: "/admin/retractos",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT"],
        steps: [
          "Asigna el caso de inmediato y verifica que el ítem no sea personalizado y esté dentro de los 5 días hábiles desde la entrega.",
          "Aprueba enviando dirección e instrucciones claras de retorno, o rechaza motivadamente citando la causal exacta (ej. bien personalizado art. 47 num. 3, recordándole que sí cuenta con garantía si hubiera defecto).",
          "Cuando bodega reciba y revise físicamente el producto, marca Bien recibido con nota de conformidad y avisa a Superadmin.",
        ],
        expected:
          "El caso llega verificado a la bandeja de desembolso antes de agotar el reloj de 15 días calendario.",
      },
      {
        id: "ejecutar-reembolso-retracto",
        title: "Ejecutar devolución bancaria y sellar reembolso con MFA",
        goal: `Cerrar legal y contablemente el retracto dentro de los ${HELP_LIVE_NUMBERS.retractRefundCalendarDays} días calendario.`,
        route: "/admin/retractos",
        roles: ["SUPERADMIN"],
        steps: [
          "Filtra los casos en estado Bien recibido y abre el pedido `LCM` para revisar el cobro original.",
          "Ejecuta el reembolso en Wompi o transferencia bancaria y copia el número de comprobante.",
          `Registra la referencia y confirma Marcar reembolsado con tu código MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
        ],
        expected:
          "Se notifica al consumidor, se revierten puntos aplicables y queda trazado en Finanzas y Auditoría.",
      },
      {
        id: "conciliar-retractos-finanzas",
        title: "Auditar pasivo vivo y reembolsos ejecutados (0-PII)",
        goal: "Cruzar compromisos y salidas de efectivo sin exponer identidad del comprador.",
        route: "/admin/retractos",
        roles: ["FINANCE_ANALYST"],
        steps: [
          "Revisa pasivo en curso, casos listos por desembolsar y total reembolsado en las tarjetas superiores.",
          "Filtra por estado Reembolsado o Bien recibido según el corte que estés auditando.",
          "Cruza pedido `LCM`, fecha y monto COP contra Finanzas y extractos de pasarela.",
        ],
        expected:
          "Visibilidad contable exacta sobre devoluciones bajo protección de datos personales.",
      },
    ],
    cautions: [
      `Recuerda: la ventana para solicitar retracto se mide en días HÁBILES (${HELP_LIVE_NUMBERS.retractWindowBusinessDays}), pero el plazo para reembolsar el dinero corre en días CALENDARIO (${HELP_LIVE_NUMBERS.retractRefundCalendarDays}).`,
    ],
    dontTouch: [
      "Nunca apruebes un retracto por simple cambio de opinión sobre fotoimanes, calendarios o piezas personalizadas con fotos del cliente.",
      "Nunca apliques descuentos o penalidades arbitrarias al monto reembolsado (prohibido por Ley 1480/2439).",
      "Nunca marques Reembolsado sin haber ejecutado primero la transferencia o reversión real.",
    ],
    checklist: [
      "Confirmado que el ítem NO es personalizado y está dentro de los 5 días hábiles.",
      "Paquete recibido y verificado físicamente antes de pasar a Bien recibido.",
      "Reembolso ejecutado y sellado por Superadmin + MFA dentro de los 15 días calendario.",
    ],
    faqs: [
      {
        question: "¿Qué pasa con los Puntos Lucams ganados o usados en un pedido con retracto?",
        answer:
          "Al registrar el reembolso, el motor ajusta o restituye proporcionalmente los puntos asociados de forma atómica.",
      },
    ],
    related: ["garantias", "pedidos", "finanzas", "soporte", "fidelizacion"],
    relatedPlaybooks: ["playbook-posventa-ley-1480-1581"],
    keywords: [
      "retracto",
      "Ley 1480",
      "Ley 2439",
      "desistir",
      "devolución",
      "reembolso",
      "15 días calendario",
      "MFA",
    ],
    version: 3,
  },
  {
    id: "moderacion",
    title: "Moderación de diseños",
    area: "Servicio al cliente",
    route: "/admin/moderacion",
    summary: `Revisión previa a imprenta (${HELP_LIVE_NUMBERS.printResolutionDpi} DPI) que habilita producción y bloquea despachos no aprobados.`,
    purpose:
      "Verifica que cada diseño personalizado subido por compradores cumpla normas legales y técnicas antes de pasar a fabricación en Taller. Es una compuerta dura: ningún pedido personalizado puede marcarse Enviado mientras tenga piezas pendientes o rechazadas aquí.",
    whenToUse: [
      "Al iniciar jornada y varias veces al día antes de los cortes de Taller.",
      "Para inspeccionar con zoom o render firmado 300 DPI diseños dudosos.",
      "Para rechazar con motivo claro material ilegal o corrupto, notificando al comprador.",
    ],
    concepts: [
      {
        term: "Gate duro de envío",
        definition:
          "El backend bloquea la transición a Enviado en Pedidos si algún diseño vinculado no está en estado Aprobado.",
      },
      {
        term: "Revocación de enlace compartido (`/d/...`)",
        definition:
          "Rechazar un diseño invalida de inmediato cualquier enlace público compartido por el usuario.",
      },
    ],
    sections: [
      {
        id: "revision",
        title: "Cola activa, inspección 300 DPI e historial",
        summary: "Prioriza por antigüedad para no detener a Taller de Impresión.",
        topics: [
          {
            id: "preview",
            label: `Mosaico proporcional, piezas ${HELP_LIVE_NUMBERS.printResolutionDpi} DPI y sello de resolución`,
            description:
              "Muestra encuadre real, cantidad de ranuras y si el cliente aceptó imprimir pese a advertencia de baja resolución.",
            interpretation:
              "Si la foto es algo blanda pero el cliente aceptó expresamente el aviso de resolución, no la rechaces arbitrariamente salvo que esté corrupta o ilegible por error técnico.",
          },
          {
            id: "decision",
            label: "Aprobar vs Rechazar con motivo",
            description:
              "Aprobar libera el pedido hacia Taller; Rechazar exige redactar explicación respetuosa que llega por correo al cliente.",
            caution:
              "El sistema bloquea rechazar diseños cuyos pedidos ya estén enviados o entregados.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "moderar-diseno",
        title: "Despejar la cola de moderación sin frenar producción",
        goal: "Autorizar diseños aptos con agilidad y atajar piezas inválidas antes de gastar insumos.",
        route: "/admin/moderacion",
        steps: [
          "Ordena o recorre la cola activa empezando por los diseños con mayor tiempo de espera y pedidos ya pagados.",
          "Abre el zoom y firma las piezas 300 DPI si observas bordes cortados, caras vacías accidentales (ej. cara B en Bola Navideña) o contenido dudoso.",
          "Comprueba si existe sello de baja resolución aceptado por el comprador.",
          "Pulsa Aprobar cuando esté apto para fabricar, o Rechazar escribiendo un motivo claro y accionable para que el comprador lo corrija.",
          "Confirma en el detalle del pedido que no queden más piezas retenidas.",
        ],
        expected:
          "Taller recibe únicamente órdenes 100 % aprobadas y el cliente recibe aviso inmediato si debe corregir un archivo.",
      },
    ],
    cautions: [
      "El texto que escribas al rechazar un diseño llega directamente al correo del comprador: cuida ortografía y tuteo amable.",
    ],
    dontTouch: [
      "Nunca descargues ni guardes fotografías privadas de clientes en computadores o celulares personales.",
      "No dejes diseños de pedidos pagados sin revisar de un día para otro: retrasas toda la promesa de entrega.",
    ],
    checklist: [
      "Revisé todas las ranuras/caras del diseño (incluida cara B cuando aplica).",
      "Respeté la privacidad de las fotos sin copias locales fuera del flujo de Taller.",
      "En rechazos redacté un motivo claro y respetuoso.",
    ],
    faqs: [
      {
        question: "¿Por qué Despachos me dice que el sistema no deja marcar Enviado un pedido?",
        answer:
          "Revisa esta cola activa buscando el número de pedido: basta con que un solo diseño del pedido siga Pendiente o Rechazado para que el gate bloquee el despacho.",
      },
    ],
    related: ["pedidos", "plantillas", "disenos", "soporte"],
    relatedPlaybooks: ["playbook-pedido-web-300dpi"],
    keywords: [
      "moderación",
      "diseño",
      "foto",
      "300 DPI",
      "aprobar",
      "rechazar",
      "imprimir",
      "taller",
    ],
    version: 3,
  },
];
