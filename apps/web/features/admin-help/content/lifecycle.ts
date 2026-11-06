import type { AdminModuleGuide } from "../types";

export const LIFECYCLE_GUIDE: AdminModuleGuide = {
  id: "lifecycle",
  title: "Lifecycle Journeys",
  area: "Marketing",
  route: "/admin/lifecycle",
  summary:
    "Recorridos de activación, recompra, reactivación, alta intención y seguimiento B2B con medición de conversión.",
  purpose:
    "Coordina relaciones con contactos mediante pasos configurables, condiciones, tiempos y salidas. Cada recorrido inscribe contactos elegibles, ejecuta mensajes en el momento permitido y atribuye clics, compras e ingresos sin duplicar envíos.",
  whenToUse: [
    "Para acompañar una primera compra o impulsar la siguiente.",
    "Para reactivar clientes inactivos o cerrar oportunidades de alta intención.",
    "Para dar seguimiento consultivo a empresas y eventos.",
    "Para configurar, probar y medir automatizaciones comerciales.",
  ],
  concepts: [
    {
      term: "Recorrido",
      definition:
        "Configuración versionada de disparador, inscripción, pasos y reglas de frecuencia. Solo ejecuta mensajes cuando está activo.",
    },
    {
      term: "Control general",
      definition:
        "Interruptor y límite diario compartido por todos los recorridos. Se aplica por contacto en hora Colombia y se reserva en base de datos antes de enviar para evitar excesos incluso con workers concurrentes.",
    },
    {
      term: "Modo de prueba (DRY_RUN)",
      definition:
        "En STG procesa reglas y mensajes sin llamar a Resend ni crear tareas operativas. La acción de prueba valida el contenido sin enviar correo.",
    },
    {
      term: "Inscripción",
      definition:
        "Relación entre un contacto y un recorrido en un ciclo concreto, con paso actual, próxima ejecución y salida.",
    },
    {
      term: "Condición",
      definition:
        "Requisito que se evalúa en cada paso: compra, carrito, puntos, diseño, consentimiento, entrega o ausencia de compra.",
    },
    {
      term: "Cooldown",
      definition:
        "Tiempo que una inscripción terminada espera antes de poder comenzar otro ciclo del mismo recorrido.",
    },
    {
      term: "Atribución",
      definition:
        "Relación entre el último clic anterior a una orden creada dentro de los 30 días siguientes que ya esté pagada. Un clic posterior no roba la conversión. Cada pedido se atribuye a un solo mensaje y los ingresos nunca se calculan sobre intenciones.",
    },
  ],
  sections: [
    {
      id: "configuracion",
      title: "Configuración y disparadores",
      summary: "Controla inscripción, consentimiento, ventanas y frecuencia.",
      topics: [
        {
          id: "trigger",
          label: "Disparador",
          description:
            "Define el comportamiento que permite inscribir: primera compra, segunda compra, inactividad, alta intención o B2B.",
          interpretation:
            "Elige primero el objetivo del recorrido; los pasos se ejecutan después de validar la condición actual del contacto.",
        },
        {
          id: "status",
          label: "Estado",
          description: "Borrador, activo, pausado o archivado.",
          interpretation:
            "Solo activo inscribe y ejecuta. Pausar conserva los datos y archivar impide nuevas inscripciones sin borrar historial.",
        },
        {
          id: "optin",
          label: "Consentimiento requerido",
          description: "Determina si la inscripción exige newsletter vigente.",
          interpretation:
            "Los pasos comerciales vuelven a comprobar la versión vigente del consentimiento y cualquier revocación posterior; los transaccionales no lo usan como bloqueo.",
        },
        {
          id: "ventanas",
          label: "Inactividad, entrada y cooldown",
          description: "Controla antigüedad de datos, ventana de elegibilidad y reingreso.",
          interpretation:
            "Cooldown evita repetir el mismo recorrido inmediatamente después de completar o salir de un ciclo.",
        },
        {
          id: "frecuencia",
          label: "Límite diario y silencio",
          description: "Restringe mensajes por día y define horario de silencio.",
          interpretation:
            "El límite global cuenta todos los recorridos; el individual solo el recorrido actual. Se aplica el más restrictivo. El silencio cruza medianoche si la hora inicial es mayor que la final y la ejecución se reprograma.",
        },
        {
          id: "delegacion",
          label: "Carrito y reposición",
          description:
            "Evita recordatorios duplicados con los flujos transaccionales ya existentes.",
          interpretation:
            "Un carrito vigente sale con DELEGATED_CART_RECOVERY y una alerta con stock con DELEGATED_BACK_IN_STOCK. Esos flujos envían su propio mensaje; Lifecycle no repite el aviso.",
        },
      ],
    },
    {
      id: "pasos",
      title: "Pasos, contenido y condiciones",
      summary: "Cada paso combina espera, condición, contenido y llamada a la acción.",
      topics: [
        {
          id: "delay",
          label: "Espera en minutos",
          description:
            "Tiempo antes de ejecutar el paso: 0 es inmediato, 1440 un día y 10080 una semana.",
          interpretation:
            "La espera se calcula desde la ejecución anterior y se ajusta al horario de silencio.",
        },
        {
          id: "condition",
          label: "Condición",
          description:
            "Permite saltar pasos que ya no aplican o completar el recorrido si no hay más pasos.",
          interpretation:
            "Una condición falsa no envía mensaje; el motor avanza al siguiente paso.",
        },
        {
          id: "body",
          label: "Contenido y nombre",
          description:
            "Texto configurable con saludo personalizado mediante {nombre} y párrafos separados por líneas en blanco.",
          interpretation:
            "No se admite HTML arbitrario. La plantilla escapa el contenido para evitar inyecciones.",
        },
        {
          id: "cta",
          label: "Botón y ruta",
          description: "Define texto y destino interno del botón.",
          interpretation:
            "La ruta debe comenzar con /. El enlace público se genera con token opaco para atribuir clics sin exponer datos personales.",
        },
        {
          id: "commercial",
          label: "Comercial o transaccional",
          description: "Distingue promoción de servicio.",
          interpretation:
            "Comercial exige opt-in y añade baja en un clic; transaccional conserva el carácter de servicio.",
        },
      ],
    },
    {
      id: "operacion",
      title: "Inscripciones, mensajes y métricas",
      summary: "Permite auditar ejecución, salidas, enlaces y compras atribuidas.",
      topics: [
        {
          id: "enrollment",
          label: "Inscripciones y ciclos",
          description: "Muestran paso actual, próxima ejecución, estado y motivo de salida.",
          interpretation:
            "Solo una pausa manual puede reanudarse. Una baja, rebote, queja o fallo definitivo no se reanuda para evitar omitir la supresión. Finalizar impide una nueva inscripción automática.",
        },
        {
          id: "message",
          label: "Mensajes y entrega",
          description: "Conserva estado, error, enlace, entrega Resend, clic y conversión.",
          interpretation:
            "Enviado significa aceptado por Resend; entregado llega después por webhook. DRY_RUN es una simulación sin correo. Fallido permite reintentar; baja, rebote o queja cancelan lo pendiente.",
        },
        {
          id: "metrics",
          label: "Entrega, clics, conversión e ingresos",
          description:
            "Cruza resendId con EmailEvent para medir entrega, rebote, queja y diferido, y calcula clics, compras atribuidas e ingreso.",
          interpretation:
            "La conversión exige un clic anterior a una orden creada dentro de 30 días que ya esté pagada. Un clic posterior a la orden no la roba. No confundas aceptación por Resend, entrega o inscripciones completadas con ventas.",
        },
        {
          id: "b2b-tasks",
          label: "Tareas B2B",
          description: "Crea seguimiento operativo aunque el contacto no tenga correo.",
          interpretation:
            "Cada oportunidad, paso y ciclo tiene una clave idempotente. La tarea queda en Bandeja Hoy y la bitácora de Contacto 360; ganar o perder la oportunidad cierra el recorrido.",
        },
        {
          id: "audience",
          label: "Vista de audiencia",
          description:
            "Estimación de contactos elegibles en el momento actual, con exclusión por consentimiento.",
          interpretation:
            "La elegibilidad cambia con compras, bajas y comportamiento; la cifra no es una lista congelada de destinatarios.",
        },
      ],
    },
  ],
  procedures: [
    {
      id: "crear-activar",
      title: "Crear y activar un recorrido",
      goal: "Configurar una automatización revisada antes de permitir mensajes reales.",
      steps: [
        "Abre Lifecycle Journeys y revisa el interruptor y el límite global del motor.",
        "Selecciona Nuevo recorrido y define clave, nombre, propósito y disparador.",
        "Configura consentimiento, ventanas, límite diario y horario de silencio.",
        "Agrega los pasos con espera, condición, asunto, preheader, titular, contenido y botón.",
        "Guarda como borrador y revisa la audiencia elegible y la vista previa de cada paso.",
        "Prueba el paso elegido con MFA; en STG el resultado siempre es DRY_RUN y no sale correo.",
        "Activa el recorrido y verifica las primeras inscripciones, entregas y ejecuciones en el cron.",
      ],
      expected:
        "El recorrido queda activo con inscripciones elegibles, sin activarse por accidente ni sobrescribir otras automatizaciones.",
      exceptions: [
        "Si la audiencia está vacía, revisa consentimiento, ventana de entrada y comportamiento antes de activar.",
      ],
    },
    {
      id: "editar",
      title: "Editar pasos sin perder historial",
      goal: "Cambiar configuración preservando inscripciones y mensajes anteriores.",
      steps: [
        "Abre el recorrido y modifica configuración o pasos existentes.",
        "Al reordenar, añadir o retirar pasos, revisa que ningún paso actual quede inválido.",
        "Guarda para crear una nueva versión del recorrido.",
        "Comprueba inscripciones activas y próximas ejecuciones.",
      ],
      expected: "La versión aumenta y el historial permanece íntegro.",
      exceptions: [
        "No puedes eliminar pasos con mensajes históricos ni el paso actual de una inscripción activa.",
      ],
    },
    {
      id: "reintentar",
      title: "Reintentar un mensaje fallido",
      goal: "Recuperar un envío sin generar duplicados.",
      steps: [
        "Abre Mensajes y localiza el registro fallido.",
        "Revisa el motivo del fallo y la salud de Resend.",
        "Pulsa Reintentar y completa MFA.",
        "Verifica el nuevo estado y el identificador de entrega cuando exista.",
      ],
      expected:
        "El mensaje queda pendiente de una nueva ejecución con la misma clave de deduplicación.",
      exceptions: [
        "Si el circuito de Resend está abierto, espera el cierre antes de reintentar; no generes una tormenta de llamadas.",
      ],
    },
  ],
  cautions: [
    "No actives recorridos sin revisar audiencia, control general y previsualización: en PRD los envíos reales pueden llegar a clientes.",
    "No uses el motor para reemplazar recuperación de carritos, reposiciones o reseñas: Lifecycle delega esos avisos para no duplicarlos.",
    "No cambies horarios o pasos esperando efectos retroactivos en mensajes ya enviados.",
    "No interpretes clics ni aceptación por Resend como ventas o entregas: cada estado se mide por separado y la conversión exige orden pagada posterior al clic.",
  ],
  faqs: [
    {
      question: "¿Por qué un contacto elegible no recibió nada?",
      answer:
        "Revisa consentimiento, estado del recorrido, condición del paso, límite diario, horario de silencio, salida por compra o B2B y estado del circuito de Resend.",
    },
    {
      question: "¿La semilla activa los recorridos?",
      answer:
        "No. Las cinco rutas iniciales quedan como borradores. La activación siempre exige revisión humana y MFA.",
    },
    {
      question: "¿Se repiten mensajes al reintentar?",
      answer:
        "No deberían: cada inscripción y mensaje tiene una clave única y el token de enlace se guarda solo como hash.",
    },
    {
      question: "¿Cuándo termina una inscripción?",
      answer:
        "Al completar todos los pasos, al registrarse una salida por compra o resultado B2B, al perder consentimiento requerido, al delegar carrito o reposición, o cuando un administrador la finaliza.",
    },
    {
      question: "¿STG puede enviar correos Lifecycle reales?",
      answer:
        "No. Preview siempre ejecuta DRY_RUN: registra la simulación sin llamar a Resend ni crear tareas operativas. La prueba administrativa tampoco envía correo.",
    },
  ],
  related: [
    "segmentos",
    "carritos",
    "suscriptores",
    "metricas",
    "email-templates",
    "observability",
  ],
  keywords: [
    "journey",
    "recorrido",
    "automatización",
    "activación",
    "recompra",
    "reactivación",
    "consentimiento",
    "conversión",
    "atribución",
  ],
  version: 3,
};
