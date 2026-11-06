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
        "Relación entre el último clic y la primera compra pagada en los 30 días siguientes. Cada pedido se atribuye a un solo mensaje y los ingresos nunca se calculan sobre intenciones.",
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
            "Los pasos comerciales vuelven a comprobar consentimiento siempre; los transaccionales no lo usan como bloqueo.",
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
            "El silencio cruza medianoche si la hora inicial es mayor que la final. La ejecución se reprograma, no se pierde.",
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
            "Pausar detiene temporalmente; reanudar programa la ejecución. Finalizar impide además una nueva inscripción automática del contacto en ese recorrido.",
        },
        {
          id: "message",
          label: "Mensajes",
          description: "Conserva estado, fecha, error, enlace, clic y conversión.",
          interpretation:
            "Pendiente espera ejecución; enviado ya salió; fallido permite reintentar; suprimido no continúa.",
        },
        {
          id: "metrics",
          label: "Clics, conversión e ingresos",
          description:
            "Calcula tasa de clics, compras atribuidas y monto de la primera orden pagada dentro de los 30 días posteriores al último clic.",
          interpretation:
            "No es atribución de apertura: el clic precede a la compra y esta debe ser pagada. No confundas inscripciones completadas con ingresos.",
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
        "Abre Lifecycle Journeys y selecciona Nuevo recorrido.",
        "Define clave, nombre, propósito y disparador.",
        "Configura consentimiento, ventanas, límite diario y horario de silencio.",
        "Agrega los pasos con espera, condición, asunto, preheader, titular, contenido y botón.",
        "Guarda como borrador y revisa la audiencia elegible.",
        "Envíate una prueba con MFA y revisa texto, enlaces y clasificación comercial.",
        "Activa el recorrido y verifica las primeras inscripciones y ejecuciones en el cron.",
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
    "No actives recorridos sin revisar audiencia y prueba de correo: los envíos reales pueden llegar a clientes.",
    "No uses el motor para reemplazar recuperación de carritos o reseñas existentes; sus condiciones evitan duplicarlos.",
    "No cambies horarios o pasos esperando efectos retroactivos en mensajes ya enviados.",
    "No interpretes clics como ventas: la conversión solo se registra sobre una orden pagada posterior.",
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
        "Al completar todos los pasos, al registrarse una salida por compra o resultado B2B, al perder consentimiento requerido o cuando un administrador la finaliza.",
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
  version: 2,
};
