import { HELP_LIVE_NUMBERS } from "../constants";
import type { AdminModuleGuide } from "../types";

export const SALES_GUIDES: AdminModuleGuide[] = [
  {
    id: "pedidos",
    title: "Pedidos",
    area: "Ventas y CRM",
    route: "/admin/pedidos",
    summary:
      "Operación integral de órdenes `LCM-YYYY-NNNN`: pago (Wompi, COD, Bre-B/Transferencia B2B), taller 300 DPI, guías y entrega.",
    purpose:
      "Centraliza la saga completa de cada pedido respetando segregación de funciones y confidencialidad: el listado permite filtrar colas operativas y el detalle (`/admin/pedidos/[number]`) coordina validación de pago, moderación, paquete ZIP 300 DPI, carga de arte maestro B2B, emisión de guía Aveonline/Envío Lucams, modo regalo y trazabilidad 360°.",
    whenToUse: [
      "Para filtrar pedidos listos para Taller, pendientes de despacho o contraentrega sin conciliar.",
      "Para descargar el paquete ZIP 300 DPI (Taller) o imprimir la guía térmica y despachar (Despachos).",
      "Para confirmar pagos directos B2B con MFA o subir arte maestro 300 DPI post-pago.",
      "Para consultar historial vivo antes de atender un ticket, garantía o retracto.",
    ],
    concepts: [
      {
        term: "Segregación Taller vs Despachos",
        definition:
          "Taller accede a moderación y paquete ZIP 300 DPI sin ver importes COP ni guía PDF; Despachos ve guía y rótulo térmico (y el monto a cobrar solo si es COD), sin descargar el ZIP de imprenta.",
      },
      {
        term: "Modo regalo (`isGift`)",
        definition:
          "Oculta todos los precios en correos al destinatario y en el documento/etiqueta del paquete, pero conserva íntegro el mensaje de dedicatoria para incluirlo físicamente.",
      },
      {
        term: "Gate de producción y despacho",
        definition:
          "El servidor impide pasar a Enviado si algún diseño personalizado sigue sin aprobar en Moderación o si falta cargar arte maestro 300 DPI en un pedido B2B.",
      },
    ],
    sections: [
      {
        id: "listado",
        title: "Listado, pulso de 14 días y colas rápidas",
        summary: "Filtra por estado, medio de pago, etapa del pipeline o búsqueda directa.",
        topics: [
          {
            id: "pulso-etapas",
            label: "Barra interactiva de etapas y filtros rápidos",
            description:
              "Agrupa órdenes por estado y ofrece vistas de un clic para Taller, Despachos y COD pendiente.",
            interpretation:
              "Si no aparece una orden buscada por número o correo, limpia primero los filtros activos de etapa o fecha.",
          },
          {
            id: "estado",
            label: "Estados de la saga `Order`",
            description:
              "Distingue pendiente de pago, pagado/confirmado, en producción, enviado, entregado, cancelado o reembolsado.",
            caution:
              "Cada transición dispara correos reales, ajustes de stock o puntos: cámbiala únicamente cuando el hecho físico ya ocurrió.",
          },
        ],
      },
      {
        id: "detalle",
        title: "Detalle 360° del pedido (`/admin/pedidos/[number]`)",
        summary: "Conecta pagos, archivos 300 DPI, logística y posventa según tus capacidades.",
        topics: [
          {
            id: "pago",
            label: "Wompi, Contraentrega y Pago Directo B2B (Bre-B / Transferencia)",
            description: `Muestra intentos del ledger Wompi, recaudo COD o comprobante B2B con retenciones certificadas; aprobar un Pago Directo exige Superadmin con MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
            interpretation:
              "Nunca inicies fabricación de un pedido en espera de pago en línea ni de transferencia B2B aún no verificada en extracto bancario.",
          },
          {
            id: "disenos",
            label: `Renders ${HELP_LIVE_NUMBERS.printResolutionDpi} DPI, copias de tanda y arte maestro B2B`,
            description:
              "Expone unidades diseñadas (`designUnits`), cantidad de copias iguales de la tanda, estado del `RenderJob` y descarga auditada del ZIP de taller.",
            interpretation:
              "En proyectos B2B con modalidad de arte posterior al pago, carga primero todas las piezas maestras 300 DPI para habilitar el ZIP y el envío.",
          },
          {
            id: "envio",
            label: "Guía Aveonline, Envío Lucams y etiqueta térmica",
            description:
              "Permite consultar eventos de rastreo, reintentar guía fallida tras corregir causa e imprimir `/admin/pedidos/[number]/guia`.",
            caution:
              "Para roles sin permiso de PII o guía (`PRINT_WORKSHOP`, `FINANCE_ANALYST`), las URLs del rótulo PDF se redactan en servidor porque el PDF contiene dirección y teléfono.",
          },
          {
            id: "ecosistema",
            label: "Vínculos 360°",
            description:
              "Enlaza con Contacto 360, Oportunidad B2B de origen, Soporte, Garantías, Retractos, Cupón redimido y Conciliación COD.",
            interpretation: "Solo se muestran enlaces hacia módulos permitidos para tu rol.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "preparar-produccion",
        title: "Preparar un pedido para producción",
        goal: "Confirmar que la orden y sus diseños están listos antes de fabricar.",
        route: "/admin/pedidos",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "PRINT_WORKSHOP"],
        steps: [
          "Localiza el pedido en la cola de producción y abre su detalle.",
          "Verifica que la condición comercial permita producir (pagado o COD confirmado) y que no exista cancelación vigente.",
          "Revisa todos los ítems, opciones físicas (con/sin imán, tamaño), unidades de la tanda y número de copias iguales.",
          "Confirma que el 100 % de los diseños estén aprobados en Moderación y, si es B2B, que el arte maestro 300 DPI esté cargado.",
          "Descarga el paquete ZIP 300 DPI de producción y contrasta cada archivo y mensaje de regalo con la ficha del pedido.",
          "Registra la transición a En producción únicamente cuando la fabricación física haya comenzado en taller.",
        ],
        expected:
          "Taller imprime exactamente las cantidades, variantes y artes aprobados a 300 DPI, con trazabilidad auditada de descarga e inicio.",
        exceptions: [
          "Si falta un render (`RenderJob` en curso o fallido) o hay un diseño pendiente en Moderación, detén la orden y escala antes de imprimir parcial.",
          "Si las unidades o acabado del ZIP no coinciden con lo esperado, jamás fabriques por aproximación.",
        ],
      },
      {
        id: "registrar-despacho",
        title: "Alistar paquete, emitir guía y registrar despacho o entrega",
        goal: "Asegurar empaque íntegro, etiqueta correcta (respetando modo regalo/COD) y rastreo sincronizado.",
        route: "/admin/pedidos",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "FULFILLMENT"],
        steps: [
          "Confirma físicamente sobre mesa que todas las unidades e ítems fabricados correspondan al número de pedido y revisa si incluye tarjeta de regalo.",
          "Verifica modalidad logística (Aveonline nacional vs Envío Lucams Bogotá/Soacha) y que exista guía válida.",
          "Imprime el rótulo desde la vista de guía autorizada (comprobando que no lleve precios si el pedido es regalo).",
          "Cambia el estado a Enviado únicamente al entregar el paquete al operador o ruta, y a Entregado solo con confirmación real.",
          "Revisa que el evento quede reflejado en la línea de tiempo y notifique al comprador.",
        ],
        expected:
          "El paquete sale con su guía correcta, el cliente recibe seguimiento en `/pedido/[token]` y no se anticipan estados falsos.",
        exceptions: [
          "Si la emisión de guía Aveonline falla, NO cambies a Enviado a mano: revisa el error y escala a Operaciones/Superadmin para diagnosticar antes de reintentar.",
        ],
      },
      {
        id: "consultar-pedido-soporte",
        title: "Consultar un pedido para atender al cliente",
        goal: "Responder con información vigente sin ejecutar transiciones no autorizadas.",
        route: "/admin/pedidos",
        roles: ["CUSTOMER_SUPPORT"],
        steps: [
          "Localiza la orden por número `LCM-...` o correo y valida que corresponda al titular.",
          "Inspecciona el stepper de estado, pagos, estado de moderación/renders, guía de rastreo y casos previos de posventa.",
          "Informa al cliente únicamente hechos verificados en pantalla sin prometer reembolsos ni fechas no confirmadas.",
          "Documenta el seguimiento en el ticket de Soporte o en Contacto 360.",
        ],
        expected:
          "El cliente recibe información precisa sobre su orden sin comprometer controles operativos ni financieros.",
      },
    ],
    cautions: [
      "Pasar a Cancelado o Reembolsado revierte stock comprometido, cupones y puntos Lucams según reglas de la saga.",
      `Bloquear una identidad por no-show COD o confirmar un Pago Directo B2B exige MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
    ],
    dontTouch: [
      "Jamás marques un pedido como Enviado antes de tener guía válida y paquete entregado a ruta o transportadora.",
      "Jamás incluyas factura o precios impresos dentro de un paquete marcado como Regalo (`isGift`).",
      "Jamás apruebes un Pago Directo Bre-B/Transferencia solo con un pantallazo del cliente sin verificar el abono real en el banco.",
    ],
    checklist: [
      "Estado comercial habilitado para operar (pagado o COD válido).",
      "Diseños 100 % aprobados y paquete ZIP 300 DPI completo.",
      "Modo regalo y dedicatoria verificados antes de cerrar caja.",
      "Guía emitida y estado actualizado en el momento real del hecho físico.",
    ],
    subroutes: [
      {
        id: "pedido-detalle",
        pattern: "/admin/pedidos/[number]",
        title: "Detalle operativo 360° del pedido",
        summary:
          "Estás dentro del expediente individual de una orden `LCM`: aquí descargas el ZIP 300 DPI, gestionas arte B2B, imprimes guía y avanzas estados.",
        tips: [
          "Revisa arriba las insignias de Regalo, Contraentrega o B2B antes de tocar producción o empaque.",
          "Si eres Taller, céntrate en especificaciones físicas, dedicatoria y ZIP 300 DPI; si eres Despachos, verifica guía, transportadora y cobro COD.",
          "Si es una orden B2B con pago directo reportado, solo Superadmin con MFA reciente puede confirmar el abono bancario y registrar retenciones.",
        ],
        highlightSectionIds: ["detalle"],
        highlightProcedureIds: ["preparar-produccion", "registrar-despacho"],
      },
    ],
    faqs: [
      {
        question: "¿Pago aprobado significa que ya puedo imprimir la guía y despachar?",
        answer:
          "No. Primero deben aprobarse los diseños en Moderación, completarse el render 300 DPI (o el arte maestro B2B) y fabricarse físicamente en Taller.",
      },
      {
        question: "¿Por qué veo iniciales o asteriscos en el nombre/dirección del cliente?",
        answer:
          "Por minimización de datos (Ley 1581): el servidor enmascara PII en roles que no la requieren (Taller y Finanzas). Usa siempre el número `LCM-YYYY-NNNN` para comunicarte internamente.",
      },
      {
        question: "¿Qué hago si un `RenderJob` 300 DPI tarda más de un par de minutos?",
        answer:
          "El worker procesa trabajos pendientes cada minuto; si permanece bloqueado o en error, avisa a Superadmin para revisar el cron `lucams-process-render-jobs` en Salud técnica.",
      },
    ],
    related: [
      "moderacion",
      "envios",
      "integraciones-aveonline",
      "oportunidades",
      "soporte",
      "finanzas",
      "conciliacion",
    ],
    relatedPlaybooks: [
      "playbook-pedido-web-300dpi",
      "playbook-oportunidad-b2b-cierre",
      "playbook-cod-conciliacion-bloqueos",
      "playbook-posventa-ley-1480-1581",
    ],
    keywords: [
      "orden",
      "LCM",
      "pago",
      "Wompi",
      "Bre-B",
      "transferencia",
      "taller",
      "300 DPI",
      "ZIP",
      "guía",
      "despacho",
      "regalo",
    ],
    version: 4,
  },
  {
    id: "clientes",
    title: "Clientes y Contacto 360",
    area: "Ventas y CRM",
    route: "/admin/clientes",
    summary:
      "Grafo de identidad CRM (`Contact`), historial unificado de compras/posventa/B2B, consentimientos Ley 1581 y tareas.",
    purpose:
      "Consolida en una ficha canónica (`Contacto 360`) toda la relación con cada comprador o prospecto sin mezclar cuentas internas (`isStaff`) ni exponer datos del destinatario de un regalo.",
    whenToUse: [
      "Antes de responder un ticket o llamada para conocer todo el contexto previo del cliente.",
      "Para registrar llamadas, acuerdos comerciales o crear tareas con fecha compromiso.",
      "Para comprobar identidades verificadas frente a observadas y estado de opt-in Ley 1581.",
    ],
    concepts: [
      {
        term: "Identidad VERIFIED vs UNVERIFIED_OBSERVED",
        definition:
          "Un correo/cuenta autenticado con prueba de posesión es `VERIFIED`; un dato digitado en formulario de invitado se asocia como `UNVERIFIED_OBSERVED` solo para lectura interna sin otorgar acceso a puntos ni historial público.",
      },
      {
        term: "Aislamiento de destinatario de regalo",
        definition:
          "Cuando un pedido es regalo (`isGift = true`), los datos del homenajeado jamás crean ni contaminan fichas de Contacto en el CRM.",
      },
      {
        term: "Bandera `isStaff`",
        definition:
          "Marca automática sobre correos del equipo administrativo que los excluye de segmentos comerciales, Lifecycle, RFM y LTV.",
      },
    ],
    sections: [
      {
        id: "directorio",
        title: "Directorio y segmentación rápida",
        summary: "Encuentra contactos por identidad respetando permisos de lectura PII.",
        topics: [
          {
            id: "buscar",
            label: "Búsqueda en directorio",
            description: "Localiza fichas por nombre, correo o teléfono normalizado.",
            interpretation:
              "Si ves dos fichas parecidas, NO edites correos para forzar un choque: revísalas en Clientes duplicados (/admin/clientes/duplicados).",
          },
        ],
      },
      {
        id: "perfil",
        title: "Pestañas de Contacto 360 (`/admin/clientes/[id]`)",
        summary: "Pedidos, oportunidades B2B, soporte, puntos, actividades, tareas y privacidad.",
        topics: [
          {
            id: "identidades",
            label: "Identidades y empresa",
            description:
              "Muestra señales vinculadas y organización corporativa asociada cuando proviene de B2B.",
            caution: "Nunca sobrescribas datos verificados del titular con datos de un tercero.",
          },
          {
            id: "actividad",
            label: "Bitácora de actividades y tareas",
            description:
              "Guarda notas internas fechadas y compromisos que alimentan directamente Bandeja Hoy.",
            interpretation:
              "Redacta hechos objetivos, acuerdos y fechas; evita opiniones personales.",
          },
          {
            id: "consentimientos",
            label: "Evidencia Ley 1581 (Hábeas Data)",
            description: "Muestra versión, fecha y estado de cada finalidad aceptada o revocada.",
            caution:
              "Un contacto con pedidos históricos pero sin opt-in `NEWSLETTER` vigente jamás debe usarse para promociones masivas.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "seguimiento-contacto",
        title: "Documentar una interacción y agendar siguiente paso en Contacto 360",
        goal: "Dejar trazabilidad completa para que cualquier compañero retome el caso sin fricción.",
        route: "/admin/clientes",
        steps: [
          "Busca el contacto y abre su ficha Contacto 360.",
          "Revisa primero pedidos abiertos, tickets activos, oportunidades B2B y notas recientes.",
          "Registra la actividad describiendo el hecho concreto y lo acordado.",
          "Si requiere seguimiento futuro, crea una tarea con responsable y fecha límite para que aparezca en Bandeja Hoy.",
        ],
        expected:
          "El expediente 360 queda al día y el compromiso entra automáticamente en la cola diaria del responsable.",
      },
    ],
    cautions: [
      "Cualquier acción sensible de un administrador sobre un contacto con su propio correo queda marcada con `selfDealing` en Auditoría.",
    ],
    dontTouch: [
      "Jamás escribas datos de tarjetas, claves ni códigos OTP en las notas de actividad.",
      "No modifiques la bandera `isStaff` salvo revisión expresa de Superadmin.",
    ],
    checklist: [
      "Confirmé que estoy en la ficha canónica correcta.",
      "Revisé consentimientos antes de cualquier contacto comercial proactivo.",
      "Dejé tarea con fecha si quedó algún compromiso abierto.",
    ],
    subroutes: [
      {
        id: "cliente-perfil-360",
        pattern: "/admin/clientes/[id]",
        title: "Perfil individual Contacto 360",
        summary:
          "Vista consolidada de una persona: aquí cruzas pedidos, oportunidades B2B, soporte, puntos, consentimientos y creas tareas.",
        tips: [
          "Revisa las insignias superiores (`isStaff`, estado de consentimiento o duplicados pendientes) antes de actuar.",
          "Usa las pestañas para saltar directo al pedido `LCM` o ticket PQR sin volver a buscar.",
        ],
        highlightSectionIds: ["perfil"],
        highlightProcedureIds: ["seguimiento-contacto"],
      },
    ],
    faqs: [
      {
        question: "¿Por qué dos compras hechas con el mismo teléfono no se unieron solas?",
        answer:
          "Por seguridad anti-secuestro de identidad (ADR-193): el sistema jamás fusiona automáticamente por teléfono, nombre o dirección; crea un candidato en Clientes duplicados para revisión humana con MFA.",
      },
    ],
    related: ["duplicados", "oportunidades", "pedidos", "soporte", "segmentos"],
    relatedPlaybooks: ["playbook-oportunidad-b2b-cierre", "playbook-audiencias-carritos-lifecycle"],
    keywords: ["contacto", "CRM", "360", "identidad", "consentimiento", "nota", "tarea", "isStaff"],
    version: 2,
  },
  {
    id: "duplicados",
    title: "Clientes duplicados",
    area: "Ventas y CRM",
    route: "/admin/clientes/duplicados",
    summary: `Fusión humana asistida y reversible de contactos con validación MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
    purpose:
      "Resuelve de manera controlada los pares `IdentityMergeCandidate` detectados por señales compartidas (teléfono comprador, documento fiscal o correo alterno en sesión autenticada), conservando snapshot completo en auditoría y respetando descartes previos como regla de no volver a sugerir.",
    whenToUse: [
      "Semanalmente o cuando aparezcan candidatos pendientes en la cola de duplicados.",
      "Cuando en Contacto 360 notes historial partido entre dos correos de la misma persona verificada.",
    ],
    concepts: [
      {
        term: "Prohibición de auto-fusión difusa",
        definition:
          "Lucams Shop nunca une contactos sola por teléfono, dirección o similitud de nombre; toda unión exige decisión humana + MFA.",
      },
      {
        term: "Snapshot forense de fusión",
        definition:
          "Antes de unificar relaciones hacia el contacto principal, el servidor guarda una fotografía íntegra (`mergeSnapshotJson`) en el candidato y en Auditoría.",
      },
    ],
    sections: [
      {
        id: "revision",
        title: "Comparación lado a lado y elección del contacto canónico",
        summary: "Evalúa señales antes de consolidar o descartar el par.",
        topics: [
          {
            id: "coincidencias",
            label: "Motivo de sugerencia",
            description:
              "Explica si coincidió teléfono E.164, documento de facturación o correo alterno durante checkout autenticado.",
            interpretation:
              "Dos compañeros de oficina o familiares pueden compartir teléfono o NIT: si son personas distintas, pulsa Descartar.",
          },
          {
            id: "principal",
            label: "Selección de perfil principal",
            description:
              "Define qué registro sobrevive como contacto canónico recibiendo pedidos, tickets y actividades del secundario.",
            caution:
              "Prioriza siempre el contacto que tenga cuenta web verificada (`SUPABASE_USER` / `EMAIL VERIFIED`) y mayor antigüedad.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "fusionar",
        title: "Resolver un candidato de duplicado con MFA",
        goal: "Unificar únicamente identidades confirmadas de una misma persona sin perder relaciones.",
        route: "/admin/clientes/duplicados",
        steps: [
          "Compara nombres, correos, estado de verificación, pedidos y tickets de ambos lados de la tarjeta.",
          "Si pertenecen a familiares, colegas o comprador vs empresa distinta, descarta el par (el sistema recordará no volver a sugerirlo).",
          "Si descartaste un par por accidente y ambos contactos siguen activos, reábrelo desde la pestaña Descartados.",
          `Si confirmas que son exactamente la misma persona, elige como principal el perfil verificado y ejecuta la fusión ingresando tu MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
          "Abre el Contacto 360 resultante y comprueba sus pedidos y consentimientos consolidados.",
        ],
        expected:
          "Queda una sola ficha 360 íntegra y el respaldo completo queda sellado en Auditoría.",
      },
    ],
    cautions: [
      "Fusionar contactos equivocados mezcla historiales comerciales y puntos; ante duda razonable, descarta el par.",
    ],
    dontTouch: [
      "Nunca fusiones dos personas distintas solo porque trabajan en la misma empresa B2B.",
      "Nunca fusiones cuentas del staff con cuentas de clientes reales.",
    ],
    checklist: [
      "Verifiqué que no se trate de dos familiares o empleados distintos compartiendo teléfono/NIT.",
      "Seleccioné como principal el contacto con identidad verificada.",
      "Confirmé el resultado final en Contacto 360.",
    ],
    faqs: [
      {
        question: "¿Qué pasa si descarto un candidato hoy y el cliente vuelve a comprar mañana?",
        answer:
          "Un par marcado Descartado actúa como bloqueo de sugerencia automática; solo vuelve a Pendientes si alguien con permiso `contacts:merge` usa Reabrir revisión.",
      },
    ],
    related: ["clientes", "auditoria"],
    keywords: ["duplicado", "fusión", "merge", "identidad", "colisión", "MFA", "reabrir"],
    version: 3,
  },
  {
    id: "oportunidades",
    title: "Oportunidades B2B",
    area: "Ventas y CRM",
    route: "/admin/oportunidades",
    summary: `Pipeline corporativo y de eventos (desde ${HELP_LIVE_NUMBERS.minB2bUnits} uds.): propuestas versionadas \`/propuesta/[token]\`, margen BOM, muestra digital y cierre a pedido real.`,
    purpose: `Gestiona de punta a punta proyectos corporativos, bodas, grados y eventos captados en \`/empresas-y-eventos\` (mínimo ${HELP_LIVE_NUMBERS.minB2bUnits} unidades físicas) o creados internamente: controla etapas, SLAs, constructor de propuestas con validación de margen sobre costo BOM, aprobación del cliente en \`/propuesta/[token]\` y conversión automática a \`Order\` vía Wompi o Pago Directo (Bre-B / Transferencia con MFA y retenciones).`,
    whenToUse: [
      `Al recibir una solicitud de volumen (≥ ${HELP_LIVE_NUMBERS.minB2bUnits} uds.) desde \`/empresas-y-eventos\`.`,
      "Para construir, versionar y enviar una propuesta formal con flete cotizado y muestra digital.",
      "Para dar seguimiento comercial a propuestas enviadas y verificar su conversión a pedido `LCM`.",
    ],
    concepts: [
      {
        term: "Rango web orientativo vs Propuesta formal",
        definition:
          "El configurador público entrega un estimado no vinculante sin exponer costos internos; la oferta firme nace únicamente cuando emites una propuesta versionada.",
      },
      {
        term: "Versionado anti-colisión (v1, v2…)",
        definition:
          "Publicar una versión nueva invalida automáticamente enlaces/versiones anteriores para impedir pagos sobre condiciones viejas.",
      },
      {
        term: "Modalidad de arte B2B",
        definition:
          "Define si la muestra digital se aprueba antes de pagar o si el arte maestro 300 DPI se carga en el pedido después de confirmar el pago.",
      },
    ],
    sections: [
      {
        id: "pipeline",
        title: "Tablero de etapas y seguimiento",
        summary: "Prioriza por fecha objetivo del evento, valor estimado y tareas abiertas.",
        topics: [
          {
            id: "etapa",
            label: "Etapas (`NEW` → `QUALIFYING` → `PROPOSAL_SENT` → `WON` / `LOST`)",
            description:
              "Refleja el avance real de la negociación; pasar a Ganada ocurre automáticamente al confirmarse el pago del pedido convertido.",
            interpretation:
              "Toda oportunidad abierta debe tener responsable asignado y próxima tarea fechada.",
          },
          {
            id: "puntos-excluidos",
            label: "Exclusión deliberada de Puntos Lucams",
            description:
              "Las órdenes nacidas de propuestas B2B tienen precios negociados por volumen y no acumulan ni redimen Puntos Lucams.",
            interpretation:
              "Infórmalo con claridad si el comprador corporativo consulta por puntos de retail.",
          },
        ],
      },
      {
        id: "ficha",
        title: "Constructor de propuestas y conversión (`/admin/oportunidades/[id]`)",
        summary: "Cotiza con control de rentabilidad BOM, logística y enlace privado.",
        topics: [
          {
            id: "propuestas",
            label: "Líneas, margen BOM y transporte",
            description:
              "Calcula en vivo el margen frente al costo unitario de cada producto y permite cotizar Aveonline/Envío Lucams o fijar flete manual multicaja.",
            caution:
              "Cotizar por debajo del costo unitario BOM queda bloqueado salvo autorización explícita de Superadmin.",
          },
          {
            id: "vinculos",
            label: "Portal `/propuesta/[token]` y medios de pago B2B",
            description:
              "El cliente aprueba dirección exacta, datos fiscales DIAN y elige Wompi o Pago Directo (Bre-B / Transferencia bancaria).",
            interpretation:
              "Si elige Pago Directo y reporta soporte, el pedido espera confirmación bancaria de Superadmin con MFA reciente y registro de retenciones.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "emitir-propuesta-b2b",
        title: "Construir y emitir una propuesta formal B2B / Eventos",
        goal: "Enviar una cotización rentable y lista para convertirse sola en orden operativa.",
        route: "/admin/oportunidades",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"],
        steps: [
          "Abre la oportunidad, asigna propietario y valida fecha del evento en días hábiles colombianos y ciudad DANE.",
          "En el Constructor de Propuestas revisa variantes, cantidades (≥ 25 físicas en total) y precios unitarios cuidando que el margen sobre costo BOM sea saludable.",
          "Cotiza el envío real o define flete logístico manual cuando el volumen requiera varias cajas.",
          "Selecciona la modalidad de arte/muestra digital (previa al pago o posterior al pago) y adjunta muestra si aplica.",
          "Emite la propuesta para enviar el correo transaccional con `/propuesta/[token]` (o comparte el enlace seguro por WhatsApp) y agenda tarea de seguimiento.",
        ],
        expected:
          "La oportunidad pasa a Propuesta enviada, el cliente puede aprobar y pagar autónomamente, y al confirmarse el pago nace y avanza el pedido `LCM`.",
      },
      {
        id: "avanzar-oportunidad",
        title: "Hacer seguimiento consultivo y cerrar oportunidad",
        goal: "Evitar cotizaciones huérfanas y mantener limpio el pipeline.",
        route: "/admin/oportunidades",
        steps: [
          "Revisa tareas próximas en Bandeja Hoy o filtra oportunidades en `PROPOSAL_SENT`.",
          "Si el cliente pide ajustes de cantidad o empaque, genera una nueva versión (`v2`) desde el constructor en lugar de pactar precios sueltos por chat.",
          "Cuando el cliente reporte transferencia/Bre-B, avisa a Superadmin para validar en banco con MFA en el pedido generado.",
          "Si el proyecto no se concreta, cierra en `LOST` registrando el motivo real para analítica comercial.",
        ],
        expected:
          "Cada negociación refleja condiciones vigentes en su última versión y cero acuerdos informales quedan fuera del sistema.",
      },
    ],
    cautions: [
      "Emitir una nueva versión anula la anterior; avisa al cliente que use siempre el último correo o enlace recibido.",
    ],
    dontTouch: [
      "Nunca pactes precios finales o cambios de cantidades solo por WhatsApp sin emitir la nueva versión de propuesta: el pedido y Finanzas quedarían descuadrados.",
      "No sumes el valor estimado del pipeline como ingreso contable hasta que el pedido asociado figure pagado.",
    ],
    checklist: [
      "Fecha objetivo del evento viable para capacidad de Taller y transporte.",
      "Margen sobre costo BOM verificado en verde en todas las líneas.",
      "Modalidad de arte 300 DPI definida claramente.",
      "Tarea de seguimiento creada tras emitir la propuesta.",
    ],
    subroutes: [
      {
        id: "oportunidad-detalle",
        pattern: "/admin/oportunidades/[id]",
        title: "Ficha comercial y Constructor de Propuestas B2B",
        summary:
          "Estás dentro de una oportunidad específica: aquí armas versiones `v1, v2…`, verificas margen BOM, subes muestra digital y enlazas con el pedido convertido.",
        tips: [
          "Revisa primero el semáforo de días hábiles hasta la fecha del evento solicitada por el cliente.",
          "Comprueba que los costos BOM de los productos incluidos estén al día en /admin/costos antes de conceder descuento adicional.",
          "Una vez el cliente acepte `/propuesta/[token]`, usa el enlace directo al pedido `LCM` para gestionar pago directo y arte maestro 300 DPI.",
        ],
        highlightSectionIds: ["ficha"],
        highlightProcedureIds: ["emitir-propuesta-b2b"],
      },
    ],
    faqs: [
      {
        question:
          "¿Quién confirma un pago B2B hecho por Bre-B o transferencia bancaria y dónde se registran las retenciones?",
        answer: `En el detalle del pedido generado (/admin/pedidos/[number]), exclusivamente Superadmin con MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min). Ahí se registra la retención practicada para que Finanzas mantenga el ingreso bruto fiscal y ajuste el puente de caja real.`,
      },
      {
        question: "¿Qué pasa con la vigilancia DIAN de 3.500 UVT en ventas B2B?",
        answer:
          "Tanto los cobros por Wompi como los Pagos Directos (`DIRECT_TRANSFER`) confirmados suman automáticamente al acumulado vigilado diariamente.",
      },
    ],
    related: ["pedidos", "clientes", "costos", "mayorista", "finanzas", "hoy"],
    relatedPlaybooks: ["playbook-oportunidad-b2b-cierre", "playbook-economia-bom-precios-promos"],
    keywords: [
      "B2B",
      "empresa",
      "evento",
      "bodas",
      "propuesta",
      "cotización",
      "Bre-B",
      "retención",
      "margen BOM",
      "pipeline",
    ],
    version: 3,
  },
  {
    id: "resenas",
    title: "Reseñas",
    area: "Ventas y CRM",
    route: "/admin/resenas",
    summary:
      "Moderación ética de reseñas verificadas (`DELIVERED`), curaduría de destacados en portada y alerta posventa 1★–2★.",
    purpose:
      "Publica opiniones auténticas de pedidos entregados en cada página de producto (PDP), permite elegir testimonios destacados para el Home y conecta reseñas críticas con Pedido, Contacto 360 y Soporte para resolver fallas reales sin censurar puntajes bajos.",
    whenToUse: [
      "Para revisar reseñas pendientes recibidas tras entregas confirmadas.",
      "Para curar las reseñas aprobadas que se destacan en la portada.",
      "Cuando entre una calificación de 1★ o 2★ que requiera contacto proactivo de posventa.",
    ],
    concepts: [
      {
        term: "Elegibilidad posentrega (`DELIVERED`)",
        definition:
          "Solo pedidos efectivamente entregados reciben invitación y validación de compra verificada.",
      },
      {
        term: "Publicación en dos niveles",
        definition:
          "Aprobar muestra la reseña en la PDP del producto; activar ★ Destacar la lleva además al carrusel de portada.",
      },
      {
        term: "Transparencia Ley 1480",
        definition:
          "Las críticas reales por calidad o demora nunca se ocultan por su baja calificación; solo se archiva spam, insultos o exposición de PII.",
      },
    ],
    sections: [
      {
        id: "moderacion",
        title: "Distribución 5★–1★, estados y enlaces 360°",
        summary: "Modera catálogo y activa recuperación de experiencia en un clic.",
        topics: [
          {
            id: "distribucion",
            label: "Filtro rápido por estrellas",
            description:
              "Haz clic sobre 1★ o 2★ para aislar casos insatisfechos y saltar a su pedido.",
            interpretation:
              "Si se repite una queja sobre imán, corte o empaque en un SKU, escala hallazgo a Taller y Productos.",
          },
          {
            id: "estado",
            label: "Pendiente, Aprobada y Archivada",
            description:
              "Controla visibilidad pública con registro de auditoría individual o en lote.",
            caution:
              "Archiva únicamente abuso, enlaces maliciosos o textos donde el propio cliente haya escrito teléfonos/direcciones en público.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "moderar-resena",
        title: "Moderar la cola de reseñas y curar portada",
        goal: "Mantener prueba social veraz en las fichas de producto y en el Home.",
        route: "/admin/resenas",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"],
        steps: [
          "Filtra Pendientes y lee texto, estrellas, producto y sello de compra verificada.",
          "Aprueba todas las opiniones genuinas (sean de 5★ o críticas constructivas) verificando que no expongan teléfonos o direcciones.",
          "Archiva únicamente spam, lenguaje ofensivo o datos personales expuestos.",
          "Marca ★ Destacar solo sobre reseñas ya aprobadas que describan con claridad la calidad o experiencia.",
        ],
        expected:
          "Las fichas de producto y la portada se actualizan al instante con reseñas reales y auditadas.",
      },
      {
        id: "atender-resena-critica",
        title: "Convertir una reseña de 1★ o 2★ en atención posventa",
        goal: "Resolver por privado el problema del comprador respetando su opinión pública.",
        route: "/admin/resenas",
        roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT"],
        steps: [
          "Filtra las calificaciones de 1★ y 2★.",
          "Abre el enlace al Pedido `LCM` y a Contacto 360 desde la tarjeta de la reseña.",
          "Verifica si hubo defecto de impresión/transporte o demora de transportadora y gestiona la solución desde Soporte o Garantías.",
        ],
        expected: "El cliente recibe atención proactiva documentada en su expediente 360.",
      },
    ],
    cautions: [
      "No existe respuesta pública abierta debajo de la reseña para no ventilar datos del pedido; toda atención ocurre en privado vía Soporte.",
    ],
    dontTouch: [
      "Nunca archives reseñas auténticas de 1★–3★ para inflar artificialmente el promedio de estrellas.",
      "No destaques en el Home reseñas sin texto útil o de productos que ya fueron archivados.",
    ],
    checklist: [
      "Cola de reseñas pendientes revisada sin publicar PII accidental.",
      "Reseñas de 1★ y 2★ cruzadas con Soporte o Garantías.",
    ],
    faqs: [
      {
        question: "¿Por qué Atención al cliente puede ver todas las reseñas pero no aprobarlas?",
        answer:
          "Porque `CUSTOMER_SUPPORT` tiene capacidad de lectura para investigar casos posventa, mientras la publicación en catálogo requiere capacidad de gestión comercial/operativa.",
      },
    ],
    related: ["soporte", "garantias", "pedidos", "clientes", "productos"],
    relatedPlaybooks: ["playbook-pedido-web-300dpi", "playbook-posventa-ley-1480-1581"],
    keywords: ["opinión", "calificación", "estrellas", "moderar", "destacada", "reputación", "PDP"],
    version: 3,
  },
];
