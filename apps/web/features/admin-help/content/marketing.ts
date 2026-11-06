import type { AdminModuleGuide } from "../types";

export const MARKETING_GUIDES: AdminModuleGuide[] = [
  {
    id: "cupones",
    title: "Cupones",
    area: "Marketing",
    route: "/admin/cupones",
    summary: "Promociones con reglas de vigencia, alcance, límites y seguimiento de redenciones.",
    purpose:
      "Configura descuentos aplicables en el checkout y permite auditar su uso. Cada cupón debe tener condiciones claras para evitar beneficios ilimitados o incompatibles con el margen.",
    whenToUse: [
      "Para crear o editar una promoción.",
      "Para limitar vigencia, usos o alcance de un descuento.",
      "Para investigar redenciones y resultados de una campaña.",
    ],
    concepts: [
      {
        term: "Redención",
        definition: "Uso registrado del cupón en una compra que cumplió sus condiciones.",
      },
      { term: "Tope", definition: "Límite de veces o monto que restringe el beneficio otorgado." },
    ],
    sections: [
      {
        id: "reglas",
        title: "Reglas de la promoción",
        summary: "Define código, beneficio, vigencia y restricciones.",
        topics: [
          {
            id: "codigo",
            label: "Código",
            description: "Texto que el cliente ingresa en el checkout.",
            caution: "Evita códigos ambiguos o reutilizados con condiciones distintas.",
          },
          {
            id: "beneficio",
            label: "Tipo y valor del descuento",
            description: "Define cómo se calcula el beneficio.",
            interpretation: "Simula el carrito y valida el margen antes de divulgarlo.",
          },
          {
            id: "vigencia",
            label: "Fechas y estado",
            description: "Determina cuándo puede aplicarse.",
            interpretation: "Revisa zona horaria, inicio, fin y activación.",
          },
          {
            id: "limites",
            label: "Límites y alcance",
            description: "Restringe productos, clientes, usos o monto del beneficio.",
            caution: "Un campo sin límite puede ampliar la promoción más allá de lo previsto.",
          },
          {
            id: "usos",
            label: "Redenciones",
            description: "Historial de aplicaciones del cupón.",
            interpretation: "No toda visualización de un código equivale a una redención.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-cupon",
        title: "Crear y validar un cupón",
        goal: "Publicar una promoción acotada y funcional.",
        steps: [
          "Define código, beneficio, vigencia, alcance y topes.",
          "Contrasta el descuento con Costos y escalas mayoristas.",
          "Guarda y prueba un carrito elegible y uno que no cumpla condiciones.",
          "Verifica total, mensaje de validación y registro de redención.",
          "Comunica condiciones coherentes con las configuradas.",
        ],
        expected: "El checkout aplica el beneficio solo a compras elegibles y registra su uso.",
      },
    ],
    cautions: [
      "Desactiva una campaña en lugar de cambiar silenciosamente las condiciones de cupones ya redimidos.",
    ],
    faqs: [
      {
        question: "¿Por qué el cliente no puede aplicarlo?",
        answer:
          "Revisa vigencia, estado, alcance, mínimos, topes y productos del carrito antes de crear otro cupón.",
      },
    ],
    related: ["costos", "mayorista", "fidelizacion", "pedidos"],
    keywords: ["descuento", "promoción", "código", "vigencia", "redención", "tope"],
    version: 1,
  },
  {
    id: "fidelizacion",
    title: "Fidelización",
    area: "Marketing",
    route: "/admin/fidelizacion",
    summary: "Reglas de Puntos Lucams, referidos, acumulación, redención y ajustes auditados.",
    purpose:
      "Configura incentivos posteriores a la compra y su uso como descuento. Separa parámetros del programa, cupones emitidos y ajustes manuales para conservar trazabilidad financiera.",
    whenToUse: [
      "Para configurar acumulación o redención de puntos.",
      "Para revisar reglas del programa de referidos.",
      "Para consultar o registrar un ajuste autorizado.",
    ],
    concepts: [
      {
        term: "Acumulación",
        definition:
          "Puntos otorgados cuando se cumple el evento elegible, no simplemente por crear una cuenta o pedido.",
      },
      {
        term: "Redención",
        definition: "Aplicación de puntos como beneficio en una compra elegible.",
      },
      {
        term: "Retrocrédito",
        definition:
          "Ajuste posterior asociado a verificación o corrección de saldo según las reglas del programa.",
      },
    ],
    sections: [
      {
        id: "programa",
        title: "Parámetros del programa",
        summary: "Controla activación, tasas, mínimos y límites.",
        topics: [
          {
            id: "tasas",
            label: "Tasas de acumulación y redención",
            description: "Determinan cuánto se otorga y qué valor tiene al redimir.",
            caution: "Un cambio afecta operaciones futuras; simula su impacto económico.",
          },
          {
            id: "minimos",
            label: "Mínimos y topes",
            description: "Restringen cuándo y cuánto puede utilizarse el beneficio.",
            interpretation: "Verifica interacción con el total del carrito y otros descuentos.",
          },
          {
            id: "referidos",
            label: "Invita y gana",
            description: "Configura beneficio y vigencia de cupones por referido.",
            interpretation: "Los cupones ya emitidos conservan sus condiciones históricas.",
          },
          {
            id: "ajustes",
            label: "Ajustes manuales",
            description: "Correcciones excepcionales de saldo con auditoría.",
            caution:
              "Exige motivo y autorización; nunca uses un ajuste para beneficios personales.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "validar-programa",
        title: "Cambiar reglas de fidelización",
        goal: "Actualizar incentivos sin romper saldos ni checkout.",
        steps: [
          "Documenta las reglas actuales y el efecto esperado.",
          "Modifica activación, tasas o límites necesarios.",
          "Simula acumulación en una compra elegible y reversión cuando aplique.",
          "Prueba redención dentro y fuera de los mínimos.",
          "Revisa saldo, cupones y registros de auditoría.",
        ],
        expected:
          "El programa aplica reglas nuevas a eventos futuros sin alterar indebidamente beneficios históricos.",
      },
    ],
    cautions: [
      "Los puntos y referidos tienen impacto económico; no los pruebes con clientes reales ni con tu propia cuenta.",
    ],
    faqs: [
      {
        question: "¿Un retracto puede afectar puntos?",
        answer:
          "Sí, el flujo puede revertir incentivos asociados; verifica el caso completo antes de hacer ajustes manuales.",
      },
    ],
    related: ["cupones", "retractos", "clientes", "auditoria"],
    keywords: ["puntos", "lealtad", "referidos", "invita", "redimir", "acumular"],
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
            label: "Exportación CSV",
            description: "Descarga datos para una gestión autorizada.",
            caution:
              "El archivo contiene datos personales: controla acceso, destino y eliminación.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "exportar-audiencia",
        title: "Preparar una exportación",
        goal: "Usar únicamente contactos con opt-in vigente.",
        steps: [
          "Filtra el estado de consentimiento requerido.",
          "Verifica finalidad, fecha y bajas.",
          "Exporta solo si tu rol tiene capacidad y existe una necesidad real.",
          "Entrega el archivo por un canal autorizado y evita copias innecesarias.",
          "Confirma que la plataforma de envío también respete bajas posteriores.",
        ],
        expected: "La campaña utiliza una audiencia lícita y las bajas permanecen protegidas.",
      },
    ],
    cautions: ["Una compra o cuenta creada no equivale por sí sola a consentimiento de marketing."],
    faqs: [
      {
        question: "¿Puedo volver a agregar una baja?",
        answer:
          "Solo con una nueva autorización válida del titular; nunca por decisión unilateral del equipo.",
      },
    ],
    related: ["segmentos", "clientes", "email-templates"],
    keywords: ["newsletter", "opt-in", "consentimiento", "baja", "CSV", "correo"],
    version: 1,
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
            label: "Filtro de consentimiento",
            description: "Excluye contactos no elegibles para la finalidad comercial.",
            caution: "No retires este filtro para aumentar artificialmente el alcance.",
          },
          {
            id: "export",
            label: "Exportación",
            description: "Genera un archivo del segmento visible.",
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
          "Confirma opt-in vigente y exclusiones.",
          "Exporta solo los datos necesarios y por el canal autorizado.",
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
        answer: "El segmento aplica criterios de comportamiento y consentimiento adicionales.",
      },
    ],
    related: ["suscriptores", "clientes", "metricas"],
    keywords: ["audiencia", "VIP", "reactivación", "intención", "CRM", "exportar"],
    version: 1,
  },
  {
    id: "carritos",
    title: "Carritos abandonados",
    area: "Marketing",
    route: "/admin/carritos",
    summary:
      "Monitoreo, previsualización y recuperación manual o automática de carritos sin compra.",
    purpose:
      "Identifica carritos con datos de contacto que no terminaron en pedido y permite enviar recordatorios bajo reglas controladas. La configuración global está restringida y el detalle conserva el contenido histórico.",
    whenToUse: [
      "Para revisar carritos pendientes, recordados o recuperados.",
      "Para previsualizar y enviar un recordatorio autorizado.",
      "Para analizar valor, productos y resultado de recuperación.",
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
        term: "Ventana de envío",
        definition: "Condición temporal que controla cuándo puede enviarse un recordatorio.",
      },
    ],
    sections: [
      {
        id: "bandeja",
        title: "Bandeja de recuperación",
        summary: "Resume estado, valor, productos y recordatorios.",
        topics: [
          {
            id: "estado",
            label: "Estado",
            description: "Distingue pendientes, recordados, recuperados o cerrados por otra causa.",
            interpretation: "Un recordatorio enviado no equivale a recuperación.",
          },
          {
            id: "valor",
            label: "Subtotal e ítems",
            description: "Instantánea del contenido conocido del carrito.",
            interpretation: "Los precios y disponibilidad pueden cambiar al retomar la compra.",
          },
          {
            id: "preview",
            label: "Vista previa del correo",
            description: "Muestra el mensaje antes de un envío manual.",
            caution:
              "Revisa destinatario, contenido y enlaces; el envío tiene un efecto externo real.",
          },
        ],
      },
      {
        id: "configuracion",
        title: "Configuración automática",
        summary: "Controla interruptor general, modo y ventanas del proceso programado.",
        topics: [
          {
            id: "killswitch",
            label: "Activación general",
            description: "Habilita o detiene el proceso de recuperación.",
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
            interpretation: "Revisa zona horaria y último envío antes de ejecutar manualmente.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "recordar-carrito",
        title: "Enviar un recordatorio supervisado",
        goal: "Contactar solo un carrito elegible con el mensaje correcto.",
        steps: [
          "Abre el carrito y verifica estado, destinatario, ítems y último envío.",
          "Confirma que no exista pedido recuperado ni motivo de cierre.",
          "Previsualiza el correo y revisa enlaces y contenido.",
          "Envía una sola vez y registra el resultado.",
          "Comprueba que el estado del carrito refleje el recordatorio.",
        ],
        expected: "El cliente recibe un recordatorio pertinente y el historial evita duplicados.",
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
          "Activa el interruptor general solo después de comprobar la configuración.",
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
    version: 1,
  },
];
