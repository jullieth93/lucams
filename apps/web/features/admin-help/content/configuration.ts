import type { AdminModuleGuide } from "../types";

export const CONFIGURATION_GUIDES: AdminModuleGuide[] = [
  {
    id: "envios",
    title: "Envíos",
    area: "Configuración y seguridad",
    route: "/admin/envios",
    summary:
      "Transportadoras, tarifas de respaldo, envío gratis, zonas locales y preferencias de despacho.",
    purpose:
      "Configura qué opciones logísticas se ofrecen y bajo qué condiciones. Reúne reglas de negocio para Aveonline y Envío Lucams, incluidos parámetros que afectan el checkout y la estimación de entrega.",
    whenToUse: [
      "Para activar o ajustar una opción de envío.",
      "Para configurar tarifas, tope de envío gratis o zonas locales.",
      "Para revisar preferencias que afectan cotización y despacho.",
    ],
    concepts: [
      {
        term: "Tarifa de respaldo",
        definition:
          "Valor utilizado cuando la cotización externa no está disponible y las reglas permiten ofrecer una alternativa.",
      },
      {
        term: "Envío Lucams",
        definition:
          "Modalidad de mensajería interna para zonas habilitadas, distinta de Aveonline.",
      },
      {
        term: "Hora límite",
        definition: "Corte que influye en la estimación y compromiso de entrega local.",
      },
    ],
    sections: [
      {
        id: "reglas",
        title: "Reglas de cotización y cobertura",
        summary: "Determina disponibilidad, precio y compromiso mostrado al cliente.",
        topics: [
          {
            id: "activa",
            label: "Transportadora activa",
            description: "Controla si la modalidad puede ofrecerse.",
            caution:
              "Desactivarla afecta checkouts futuros; no cambia guías ni pedidos existentes.",
          },
          {
            id: "gratis",
            label: "Tope de envío gratis",
            description: "Umbral comercial a partir del cual puede aplicarse el beneficio.",
            interpretation: "Simula carritos cerca del umbral y revisa interacción con descuentos.",
          },
          {
            id: "respaldo",
            label: "Tarifa de respaldo",
            description: "Precio alternativo bajo las condiciones configuradas.",
            interpretation:
              "Debe cubrir costo y ser coherente con la cobertura; no es la tarifa viva del carrier.",
          },
          {
            id: "zonas",
            label: "Zonas locales",
            description: "Ciudades o sectores donde Envío Lucams está habilitado.",
            interpretation: "La dirección del cliente debe coincidir con una zona operativa real.",
          },
          {
            id: "corte",
            label: "Hora límite y preferencias",
            description: "Parámetros para calcular y organizar despachos.",
            interpretation:
              "Usa la zona horaria de Colombia y valida el mensaje de entrega resultante.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "configurar-envio",
        title: "Actualizar reglas de envío",
        goal: "Ofrecer tarifas y compromisos que operación puede cumplir.",
        steps: [
          "Revisa cobertura y capacidad logística antes de cambiar parámetros.",
          "Actualiza transportadora, tarifas, umbral, zonas u hora límite.",
          "Guarda y prueba un checkout para una dirección cubierta y otra no cubierta.",
          "Compara valores por debajo y por encima del envío gratis.",
          "Verifica pedido resultante, tarifa y preferencias de despacho.",
        ],
        expected:
          "El checkout solo ofrece modalidades operables con precio y estimación correctos.",
      },
    ],
    cautions: ["No actives una zona o tarifa sin confirmar capacidad real de entrega."],
    faqs: [
      {
        question: "¿Cambiar una tarifa modifica pedidos anteriores?",
        answer:
          "No debe alterar condiciones ya selladas de un pedido; aplica a cotizaciones futuras.",
      },
    ],
    related: ["integraciones", "pedidos", "conciliacion", "canales"],
    keywords: ["Aveonline", "Envío Lucams", "flete", "tarifa", "gratis", "zona", "cobertura"],
    version: 1,
  },
  {
    id: "canales",
    title: "Canales y Tienda Lucams",
    area: "Configuración y seguridad",
    route: "/admin/canales",
    summary: "Estado del canal de tienda, modo operativo, URL, feed y conexiones relacionadas.",
    purpose:
      "Presenta cómo está configurado el canal de venta y qué capacidades tiene activas. La vista Tienda Lucams reúne modo, URL y dependencias para diagnosticar coherencia entre catálogo y checkout.",
    whenToUse: [
      "Para verificar el modo y URL del canal.",
      "Para revisar el estado del feed de productos.",
      "Antes de investigar una diferencia entre tienda pública y operación.",
    ],
    concepts: [
      {
        term: "Modo catálogo",
        definition:
          "Configuración orientada a captación sin todas las funciones transaccionales del modo completo.",
      },
      {
        term: "Modo completo",
        definition:
          "Operación con carrito, checkout, pagos y logística habilitados según configuración.",
      },
      {
        term: "Merchant feed",
        definition: "Archivo de productos utilizado por Google Merchant Center.",
      },
    ],
    sections: [
      {
        id: "tienda",
        title: "Estado del canal",
        summary: "Resume identidad, capacidades e integraciones del canal.",
        topics: [
          {
            id: "modo",
            label: "Modo de tienda",
            description: "Define las capacidades comerciales visibles.",
            interpretation:
              "El modo actual no se cambia desde una preferencia visual; requiere configuración controlada.",
          },
          {
            id: "url",
            label: "URL pública",
            description: "Dirección del canal que deben usar enlaces e integraciones.",
            interpretation: "Debe coincidir con el dominio productivo y HTTPS.",
          },
          {
            id: "feed",
            label: "Feed de productos",
            description: "Fuente de catálogo para Merchant Center.",
            interpretation:
              "Disponibilidad del XML no garantiza aprobación de productos en Google.",
          },
          {
            id: "salud",
            label: "Salud de integraciones",
            description: "Señales de dependencias necesarias para el canal.",
            interpretation: "Abre Integraciones para diagnosticar el proveedor concreto.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "revisar-canal",
        title: "Verificar la configuración del canal",
        goal: "Confirmar coherencia entre tienda, feed e integraciones.",
        steps: [
          "Comprueba URL y modo mostrados.",
          "Abre la tienda y verifica que sus capacidades coincidan con ese modo.",
          "Revisa el feed y la selección de productos elegibles.",
          "Consulta Integraciones para cualquier dependencia degradada.",
          "Documenta pendientes externos sin interpretar el panel como una acción de publicación.",
        ],
        expected:
          "El canal y sus dependencias presentan una configuración coherente y verificable.",
      },
    ],
    cautions: [
      "No prometas productos en Merchant Center solo porque el feed responde correctamente.",
    ],
    faqs: [
      {
        question: "¿Dónde cambio el modo de tienda?",
        answer:
          "Es una configuración de despliegue controlada por el equipo técnico, no una edición cotidiana del contenido.",
      },
    ],
    related: ["integraciones", "envios", "productos", "observability"],
    keywords: ["canal", "tienda", "modo", "Merchant", "feed", "Google", "URL"],
    version: 1,
  },
  {
    id: "integraciones",
    title: "Integraciones",
    area: "Configuración y seguridad",
    route: "/admin/integraciones",
    summary:
      "Diagnóstico de Supabase, Wompi, Aveonline, Resend, Turnstile y dependencias externas.",
    purpose:
      "Permite comprobar configuración y salud de proveedores sin exponer secretos. La vista Aveonline incluye diagnóstico específico y pruebas de cobertura logística.",
    whenToUse: [
      "Cuando un pago, correo, guía o validación externa falle.",
      "Para confirmar si falta una configuración requerida.",
      "Para ejecutar diagnósticos no destructivos de cobertura.",
    ],
    concepts: [
      {
        term: "Health check",
        definition:
          "Comprobación de disponibilidad o configuración de una dependencia en un momento dado.",
      },
      {
        term: "Variable de entorno",
        definition:
          "Configuración de despliegue; el panel informa presencia o estado, nunca debe revelar su valor secreto.",
      },
      {
        term: "Sonda",
        definition:
          "Prueba acotada para verificar respuesta de un proveedor sin ejecutar una operación comercial real.",
      },
    ],
    sections: [
      {
        id: "estado",
        title: "Estado de proveedores",
        summary: "Resume disponibilidad, configuración y pendientes humanos.",
        topics: [
          {
            id: "salud",
            label: "Operativo o degradado",
            description: "Resultado de la última comprobación disponible.",
            interpretation:
              "Verifica fecha y detalle; un estado pasado no garantiza disponibilidad actual.",
          },
          {
            id: "config",
            label: "Configuración requerida",
            description: "Indica presencia o ausencia de variables necesarias.",
            caution: "Nunca copies secretos a tickets, guías o capturas.",
          },
          {
            id: "pendiente",
            label: "Acción humana",
            description: "Configuración externa que la aplicación no puede completar sola.",
            interpretation: "Asigna el pendiente al responsable del proveedor o despliegue.",
          },
        ],
      },
      {
        id: "aveonline",
        title: "Diagnóstico Aveonline",
        summary: "Prueba conectividad y cobertura con datos controlados.",
        topics: [
          {
            id: "cobertura",
            label: "Prueba de cobertura",
            description: "Consulta si el carrier ofrece servicio para el escenario indicado.",
            interpretation:
              "Una cobertura positiva no crea guía ni garantiza disponibilidad futura.",
          },
          {
            id: "error",
            label: "Respuesta del proveedor",
            description: "Detalle sanitizado del fallo o validación.",
            interpretation:
              "Contrasta dirección, peso, dimensiones y credenciales antes de reintentar.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "diagnosticar-integracion",
        title: "Diagnosticar una dependencia",
        goal: "Distinguir configuración, proveedor y datos de la operación.",
        steps: [
          "Identifica el proceso afectado y la hora del fallo.",
          "Revisa estado y configuración del proveedor sin exponer secretos.",
          "Ejecuta únicamente sondas no destructivas relacionadas.",
          "Contrasta el error con Observabilidad y el registro de negocio.",
          "Escala con identificadores y mensajes sanitizados, evitando reintentos comerciales repetidos.",
        ],
        expected: "La causa queda acotada y el siguiente responsable recibe evidencia segura.",
      },
    ],
    cautions: ["No uses pagos, guías o correos reales como prueba de conectividad."],
    faqs: [
      {
        question: "¿El panel muestra las claves?",
        answer:
          "No. Solo debe indicar estado o presencia; las claves se administran en el entorno seguro correspondiente.",
      },
    ],
    related: ["observability", "envios", "canales", "pedidos"],
    keywords: ["Wompi", "Aveonline", "Resend", "Supabase", "Turnstile", "salud", "secretos"],
    version: 1,
  },
  {
    id: "observability",
    title: "Salud técnica y observabilidad",
    area: "Configuración y seguridad",
    route: "/admin/observability",
    summary: "Errores, procesos programados, webhooks, integraciones, alertas y respaldos.",
    purpose:
      "Reúne señales para saber si los procesos del sistema están funcionando y cuáles requieren intervención. Permite investigar errores y latidos de crons sin depender de un servicio externo de observabilidad.",
    whenToUse: [
      "Ante errores repetidos o procesos sin ejecución.",
      "Para revisar webhooks, reversas de stock y pendientes técnicos.",
      "Para comprobar señales de respaldo y salud general.",
    ],
    concepts: [
      {
        term: "Latido",
        definition: "Señal temporal que demuestra que un proceso programado reportó actividad.",
      },
      {
        term: "Dead-man switch",
        definition:
          "Alerta que se activa cuando una señal esperada no llega dentro del tiempo permitido.",
      },
      {
        term: "Fingerprint",
        definition:
          "Agrupación de errores equivalentes para estudiar frecuencia sin contar cada evento como causa distinta.",
      },
    ],
    sections: [
      {
        id: "procesos",
        title: "Procesos y conectores",
        summary: "Presenta ejecuciones esperadas y dependencias degradadas.",
        topics: [
          {
            id: "cron",
            label: "Crons y latidos",
            description: "Muestra actividad de procesos programados vigilados.",
            interpretation:
              "Un latido ausente exige revisar horario, entorno y último error antes de ejecutar manualmente.",
          },
          {
            id: "webhook",
            label: "Webhooks",
            description: "Señales recibidas desde proveedores.",
            interpretation:
              "Revisa firma, idempotencia y resultado; no reenvíes eventos sin procedimiento.",
          },
          {
            id: "backup",
            label: "Respaldos",
            description: "Estado de copias y señales relacionadas con recuperación.",
            interpretation:
              "Un respaldo reciente no sustituye la prueba periódica de restauración.",
          },
        ],
      },
      {
        id: "errores",
        title: "Errores y alertas",
        summary: "Agrupa incidencias para facilitar diagnóstico y seguimiento.",
        topics: [
          {
            id: "error",
            label: "Error y frecuencia",
            description: "Mensaje sanitizado, apariciones y última ocurrencia.",
            interpretation:
              "Prioriza impacto y recurrencia; evita compartir trazas con datos sensibles.",
          },
          {
            id: "estado",
            label: "Abierto, resuelto o ignorado",
            description: "Estado de seguimiento del reporte agrupado.",
            caution: "Marcar resuelto no corrige el código ni elimina futuras ocurrencias.",
          },
          {
            id: "alerta",
            label: "Regla de alerta",
            description: "Condición que convirtió una señal en aviso.",
            interpretation: "Consulta el umbral y la fuente antes de cambiar operación.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "investigar-salud",
        title: "Investigar una alerta técnica",
        goal: "Confirmar impacto y encaminar una corrección segura.",
        steps: [
          "Anota proceso, hora, severidad y registros afectados.",
          "Revisa última ejecución correcta y errores agrupados.",
          "Contrasta el estado de Integraciones y la operación relacionada.",
          "Contén el impacto usando el interruptor autorizado si existe, sin repetir procesos a ciegas.",
          "Escala con identificadores y evidencia sanitizada.",
          "Después de corregir, verifica un nuevo latido o ejecución antes de marcar resuelto.",
        ],
        expected: "La incidencia tiene causa acotada, contención y verificación posterior.",
      },
    ],
    cautions: [
      "No ejecutes crons o webhooks manualmente como primer intento; puedes duplicar efectos.",
    ],
    faqs: [
      {
        question: "¿Un cron sin latido siempre está dañado?",
        answer:
          "Puede estar deshabilitado por entorno o aún no cumplir su horario; verifica configuración y ventana esperada.",
      },
    ],
    related: ["integraciones", "performance", "notificaciones", "hoy"],
    keywords: ["error", "cron", "latido", "webhook", "backup", "alerta", "salud"],
    version: 1,
  },
  {
    id: "seguridad",
    title: "Seguridad de la cuenta",
    area: "Configuración y seguridad",
    route: "/admin/seguridad",
    summary:
      "Verificación en dos pasos, códigos de recuperación y eventos de seguridad autorizados.",
    purpose:
      "Permite proteger tu cuenta administrativa con TOTP y recuperar acceso de forma controlada. Todos los roles necesitan MFA; el historial global adicional está restringido.",
    whenToUse: [
      "Al activar o renovar la verificación en dos pasos.",
      "Para generar y custodiar nuevos códigos de recuperación.",
      "Para revisar eventos de seguridad cuando tu rol lo permita.",
    ],
    concepts: [
      {
        term: "TOTP",
        definition:
          "Código temporal generado por tu aplicación de autenticación como segundo factor.",
      },
      {
        term: "AAL2",
        definition: "Sesión que ya verificó el segundo factor requerido para el Admin.",
      },
      {
        term: "Código de recuperación",
        definition:
          "Respaldo de un solo uso para recuperar acceso; debe almacenarse fuera del navegador compartido.",
      },
    ],
    sections: [
      {
        id: "mfa",
        title: "Verificación en dos pasos",
        summary: "Controla enrolamiento, validación y recuperación de la cuenta.",
        topics: [
          {
            id: "qr",
            label: "Código QR y secreto",
            description: "Vincula la aplicación de autenticación con tu cuenta.",
            caution: "No compartas el QR, el secreto ni capturas del enrolamiento.",
          },
          {
            id: "verificacion",
            label: "Código temporal",
            description: "Confirma que el generador funciona y eleva la seguridad de la sesión.",
            interpretation:
              "Si falla, revisa hora del dispositivo y código vigente sin reutilizar uno anterior.",
          },
          {
            id: "recovery",
            label: "Códigos de recuperación",
            description: "Respaldo de un solo uso que se muestra de forma controlada.",
            caution: "Guárdalos en un gestor seguro; regenerarlos invalida el conjunto anterior.",
          },
          {
            id: "eventos",
            label: "Eventos de seguridad",
            description: "Señales de acceso y rechazos disponibles según permisos.",
            interpretation: "No contienen secretos; investiga patrones antes de cambiar acceso.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "activar-mfa",
        title: "Activar la verificación en dos pasos",
        goal: "Proteger la cuenta y conservar una recuperación segura.",
        steps: [
          "Abre Seguridad desde tu propia sesión.",
          "Escanea el QR con una aplicación de autenticación confiable.",
          "Ingresa el código temporal para confirmar el vínculo.",
          "Genera códigos de recuperación y guárdalos en un lugar seguro.",
          "Cierra y vuelve a iniciar sesión para comprobar el segundo factor.",
          "Retira el QR o secreto de cualquier superficie temporal.",
        ],
        expected: "La cuenta exige MFA y dispone de códigos de recuperación custodiados.",
      },
    ],
    cautions: ["Nunca envíes códigos TOTP o de recuperación por correo, WhatsApp o tickets."],
    faqs: [
      {
        question: "¿Qué hago si perdí mi teléfono?",
        answer:
          "Usa un código de recuperación válido o contacta a dirección para el procedimiento de recuperación y renovación del factor.",
      },
    ],
    related: ["usuarios", "auditoria", "ayuda"],
    keywords: ["MFA", "TOTP", "AAL2", "dos pasos", "QR", "recuperación", "seguridad"],
    version: 1,
  },
  {
    id: "auditoria",
    title: "Auditoría",
    area: "Configuración y seguridad",
    route: "/admin/auditoria",
    summary:
      "Bitácora de acciones administrativas, actores, entidades y alertas de autonegociación.",
    purpose:
      "Permite reconstruir acciones sensibles con fecha, responsable y contexto. Es una vista de investigación y control; no una bandeja para editar el historial.",
    whenToUse: [
      "Para investigar quién ejecutó un cambio.",
      "Para revisar acciones sobre una entidad o durante un incidente.",
      "Para analizar señales de autonegociación.",
    ],
    concepts: [
      { term: "Actor", definition: "Usuario administrativo que ejecutó la acción registrada." },
      {
        term: "Entidad",
        definition: "Objeto de negocio afectado, identificado por tipo e identificador.",
      },
      {
        term: "Autonegociación",
        definition: "Acción de una persona sobre registros propios que requiere control adicional.",
      },
    ],
    sections: [
      {
        id: "eventos",
        title: "Consulta de eventos",
        summary: "Filtra y analiza la bitácora inmutable.",
        topics: [
          {
            id: "accion",
            label: "Acción",
            description: "Nombre del evento administrativo ejecutado.",
            interpretation:
              "Úsalo junto con entidad y fecha; una acción puede tener varios pasos relacionados.",
          },
          {
            id: "metadata",
            label: "Contexto",
            description: "Datos adicionales registrados para entender el evento.",
            interpretation:
              "No todos los campos de la entidad se copian; abre el registro vivo para su estado actual.",
          },
          {
            id: "self",
            label: "Alerta de autonegociación",
            description: "Señala una posible acción del personal sobre sí mismo.",
            caution: "No es prueba automática de fraude, pero exige revisión y evidencia.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "investigar-accion",
        title: "Investigar un cambio administrativo",
        goal: "Reconstruir responsable, momento y alcance sin alterar evidencia.",
        steps: [
          "Delimita entidad, acción y período.",
          "Identifica actor y eventos inmediatamente anteriores y posteriores.",
          "Abre el registro de negocio y compara su estado actual.",
          "Revisa alertas de autonegociación o eventos de seguridad relacionados.",
          "Documenta hallazgos y escala sin editar ni eliminar registros de auditoría.",
        ],
        expected:
          "La investigación conserva una cronología verificable y conclusiones diferenciadas de hipótesis.",
      },
    ],
    cautions: [
      "No compartas exportaciones o capturas con datos personales fuera del equipo autorizado.",
    ],
    faqs: [
      {
        question: "¿Puedo corregir una entrada?",
        answer:
          "No desde esta bitácora. Corrige el registro de negocio mediante una nueva acción autorizada que también quede trazada.",
      },
    ],
    related: ["usuarios", "seguridad", "clientes", "fidelizacion"],
    keywords: ["bitácora", "actor", "acción", "self dealing", "autonegociación", "historial"],
    version: 1,
  },
  {
    id: "usuarios",
    title: "Usuarios y acceso",
    area: "Configuración y seguridad",
    route: "/admin/usuarios",
    summary: "Alta, roles, activación y retiro de usuarios administrativos.",
    purpose:
      "Controla quién puede ingresar al backoffice y qué capacidades tiene. La asignación de rol afecta acceso y visibilidad de datos, por lo que exige mínimo privilegio y verificación de identidad.",
    whenToUse: [
      "Para incorporar una persona al equipo administrativo.",
      "Para cambiar responsabilidades y rol.",
      "Para desactivar acceso cuando alguien deja de requerirlo.",
    ],
    concepts: [
      {
        term: "Rol",
        definition: "Conjunto de capacidades que determina módulos, datos y acciones disponibles.",
      },
      {
        term: "Usuario activo",
        definition:
          "Cuenta administrativa habilitada y no eliminada que puede completar autenticación y MFA.",
      },
      {
        term: "Mínimo privilegio",
        definition: "Asignar únicamente las capacidades necesarias para el trabajo actual.",
      },
    ],
    sections: [
      {
        id: "acceso",
        title: "Gestión de accesos",
        summary: "Administra identidad, rol y vigencia.",
        topics: [
          {
            id: "rol",
            label: "Rol asignado",
            description: "Define las capacidades operativas de la cuenta.",
            interpretation:
              "Contrasta la matriz de roles antes de cambiarlo; un rol superior puede revelar PII y finanzas.",
          },
          {
            id: "activo",
            label: "Activo o desactivado",
            description: "Controla si la cuenta puede utilizar el panel.",
            caution:
              "Desactiva oportunamente al retirar personal; no compartas cuentas entre personas.",
          },
          {
            id: "alta",
            label: "Alta de administrador",
            description: "Vincula una identidad verificada con un rol administrativo.",
            interpretation:
              "La persona deberá completar autenticación y enrolar MFA antes de operar.",
          },
          {
            id: "retiro",
            label: "Retiro lógico",
            description: "Conserva trazabilidad mientras impide nuevos accesos.",
            interpretation: "No borres el historial de acciones asociado al usuario.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "crear-admin",
        title: "Incorporar un usuario administrativo",
        goal: "Otorgar acceso individual con permisos mínimos y MFA.",
        steps: [
          "Verifica identidad, correo y responsabilidad de la persona.",
          "Selecciona el rol con el menor privilegio suficiente.",
          "Registra el alta y confirma que la cuenta quede activa.",
          "Entrega las instrucciones por un canal seguro sin compartir contraseñas.",
          "Verifica que la persona complete MFA y que su página inicial y menú correspondan al rol.",
          "Revisa el primer acceso en Auditoría si es necesario.",
        ],
        expected: "La persona accede con cuenta propia, MFA y únicamente los módulos necesarios.",
      },
      {
        id: "retirar-admin",
        title: "Retirar acceso",
        goal: "Impedir nuevos usos conservando la trazabilidad.",
        steps: [
          "Confirma la identidad y la decisión autorizada de retiro.",
          "Reasigna tickets, tareas u oportunidades pendientes.",
          "Desactiva la cuenta y verifica que no pueda volver a ingresar.",
          "Conserva el historial y revisa sesiones o factores según el procedimiento de seguridad.",
        ],
        expected: "El acceso queda cerrado y los pendientes tienen nuevo responsable.",
      },
    ],
    cautions: [
      "No crees una cuenta SUPERADMIN por comodidad ni compartas una misma cuenta entre varias personas.",
    ],
    faqs: [
      {
        question: "¿Cambiar el rol actualiza el onboarding?",
        answer:
          "La ruta de aprendizaje disponible corresponde al rol actual; el progreso anterior se conserva por usuario.",
      },
    ],
    related: ["seguridad", "auditoria", "ayuda"],
    keywords: ["admin", "rol", "permisos", "activar", "desactivar", "MFA", "acceso"],
    version: 1,
  },
];
