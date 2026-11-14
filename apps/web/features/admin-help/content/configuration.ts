import type { AdminModuleGuide } from "../types";

export const CONFIGURATION_GUIDES: AdminModuleGuide[] = [
  {
    id: "envios",
    title: "Envíos",
    area: "Configuración y seguridad",
    route: "/admin/envios",
    summary:
      "Transportadoras de Aveonline, límites de peso, Envío Lucams por localidades, hora límite y origen.",
    purpose:
      "Configura qué opciones logísticas se ofrecen en el checkout y bajo qué reglas operativas: transportadoras nacionales vía Aveonline con límites de peso mínimo y máximo, mensajería propia Envío Lucams por localidades y verificación del punto de origen de despacho.",
    whenToUse: [
      "Para activar o desactivar una transportadora nacional o definir sus rangos de peso en kg.",
      "Para ajustar tarifa, hora límite de despacho o localidades cubiertas de Envío Lucams.",
      "Para verificar que el punto de origen de recogida (PICKUP_*) esté completo antes de cotizar.",
    ],
    concepts: [
      {
        term: "Rango de peso por transportadora",
        definition:
          "Límites opcionales de peso mínimo y máximo en kilogramos dentro de los cuales esa transportadora puede cotizarse.",
      },
      {
        term: "Envío Lucams",
        definition:
          "Modalidad de mensajería propia con tarifa fija para localidades habilitadas de Bogotá y Soacha.",
      },
      {
        term: "Punto de origen (PICKUP_*)",
        definition:
          "Ciudad, departamento, dirección, teléfono y contacto en Ajustes del sitio desde donde Aveonline cotiza y recoge.",
      },
    ],
    sections: [
      {
        id: "reglas",
        title: "Reglas de cotización y cobertura",
        summary: "Determina disponibilidad por peso, cobertura local, tarifa y corte horario.",
        topics: [
          {
            id: "activa",
            label: "Transportadora activa",
            description:
              "Controla si el operador nacional puede aparecer entre las opciones cotizadas en el checkout.",
            caution:
              "Si desactivas todas las transportadoras y también Envío Lucams, ningún cliente podrá finalizar envíos a domicilio.",
          },
          {
            id: "pesos",
            label: "Peso mínimo y máximo (kg)",
            description:
              "Filtra la transportadora según el peso total del carrito antes de ofrecerla al comprador.",
            interpretation:
              "Deja vacío cuando no aplique restricción; si defines ambos, el máximo debe ser mayor o igual al mínimo.",
          },
          {
            id: "zonas",
            label: "Localidades de Envío Lucams",
            description:
              "Sectores específicos de Bogotá y Soacha donde opera la entrega local directa.",
            interpretation:
              "Activa únicamente localidades con capacidad real de ruta; usa los selectores rápidos por ciudad.",
          },
          {
            id: "corte",
            label: "Tarifa local y hora límite",
            description:
              "Precio fijo en pesos colombianos y hora de corte en zona horaria de Bogotá para promesa del día.",
            interpretation:
              "Los pedidos pagados después de la hora límite pasan automáticamente al siguiente día hábil.",
          },
          {
            id: "origen",
            label: "Punto de origen de despacho",
            description:
              "Resumen del remitente logístico configurado en Ajustes del sitio para cotización y recogida.",
            interpretation:
              "Si falta ciudad, dirección o teléfono de recogida, el panel muestra alerta preventiva.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "configurar-envio",
        title: "Actualizar reglas de envío",
        goal: "Ofrecer modalidades, pesos y coberturas que operación puede cumplir.",
        steps: [
          "Comprueba en el bloque superior que el punto de origen de despacho esté completo y quede al menos un método activo.",
          "Activa o desactiva cada transportadora nacional y ajusta sus rangos de peso mínimo o máximo si aplica.",
          "En Envío Lucams revisa tarifa en COP, hora límite en formato 24h y localidades seleccionadas.",
          "Guarda los cambios de la sección modificada y confirma el aviso de éxito.",
          "Simula un checkout hacia una localidad cubierta y hacia otra ciudad nacional para validar la cotización.",
        ],
        expected:
          "El checkout ofrece únicamente las modalidades habilitadas con tarifas, pesos y tiempos coherentes.",
      },
    ],
    cautions: [
      "No desactives simultáneamente todas las transportadoras de Aveonline y Envío Lucams en una tienda activa.",
    ],
    faqs: [
      {
        question: "¿Cambiar una tarifa o transportadora modifica pedidos anteriores?",
        answer:
          "No altera pedidos ni guías ya emitidas; aplica únicamente a cotizaciones nuevas en el checkout.",
      },
    ],
    related: ["integraciones", "pedidos", "conciliacion", "canales"],
    keywords: [
      "Aveonline",
      "Envío Lucams",
      "flete",
      "tarifa",
      "peso",
      "localidad",
      "zona",
      "cobertura",
      "origen",
    ],
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
        title: "Diagnóstico y webhook de Aveonline",
        summary: "Verifica autenticación en vivo y administra el webhook de eventos de guía.",
        topics: [
          {
            id: "webhook",
            label: "Registro y retiro de webhook",
            description:
              "Suscribe la URL oficial del sitio para recibir novedades automáticas de estados de envío.",
            caution:
              "Exige re-autenticación TOTP reciente y en ambientes desplegados bloquea dominios distintos al oficial.",
          },
          {
            id: "error",
            label: "Sonda de autenticación y latencia",
            description:
              "Mide conectividad real y tiempo de respuesta contra Aveonline sin emitir guías comerciales.",
            interpretation:
              "Contrasta credenciales, secreto compartido del webhook y dirección de recogida antes de reintentar.",
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
    summary:
      "Resumen 24h, entregabilidad, cuotas de Supabase (Storage y Postgres), crons, webhooks y errores.",
    purpose:
      "Reúne señales operativas y de infraestructura en vivo para saber si el sistema está sano y cuáles cuotas o procesos requieren intervención, desplegando automáticamente el detalle técnico ante incidentes activos.",
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
    title: "Seguridad y clave",
    area: "Configuración y seguridad",
    route: "/admin/seguridad",
    summary:
      "Segundo factor obligatorio (TOTP), códigos de respaldo, cambio de dispositivo y rotación de contraseña.",
    purpose:
      "Protege tu identidad administrativa con verificación en dos pasos obligatoria (AAL2), rotación de contraseña verificada contra filtraciones públicas y códigos de respaldo de un solo uso.",
    whenToUse: [
      "Al enrolar o migrar a un nuevo teléfono la verificación en dos pasos.",
      "Para generar y custodiar nuevos códigos de respaldo.",
      "Para rotar tu contraseña administrativa y cerrar sesiones en otros dispositivos.",
    ],
    concepts: [
      {
        term: "TOTP",
        definition:
          "Código temporal generado por tu aplicación de autenticación como segundo factor.",
      },
      {
        term: "AAL2",
        definition:
          "Sesión que ya verificó el segundo factor obligatorio para operar el panel administrativo.",
      },
      {
        term: "Código de recuperación",
        definition:
          "Respaldo de un solo uso para emergencias cuando pierdes tu dispositivo; al usarlo reinicia el factor para enrolar uno nuevo.",
      },
    ],
    sections: [
      {
        id: "mfa",
        title: "Segundo factor y contraseña",
        summary: "Controla enrolamiento TOTP, respaldos, cambio de teléfono y rotación de clave.",
        topics: [
          {
            id: "qr",
            label: "Código QR y cambio de dispositivo",
            description:
              "Vincula tu autenticador o reemplaza el teléfono actual sin dejar la cuenta sin MFA permanente.",
            caution: "No compartas el QR, el secreto ni capturas del enrolamiento.",
          },
          {
            id: "verificacion",
            label: "Código temporal y re-autenticación",
            description:
              "Confirma que el generador funciona y autoriza operaciones sensibles cuando la sesión lleva más de 10 minutos.",
            interpretation:
              "Si falla, revisa la hora automática del teléfono y usa el código vigente.",
          },
          {
            id: "recovery",
            label: "Códigos de respaldo (10 usos únicos)",
            description: "Respaldo de emergencia que se muestra una sola vez al generarse.",
            caution: "Guárdalos en un gestor seguro; regenerarlos invalida el conjunto anterior.",
          },
          {
            id: "password",
            label: "Cambio de contraseña",
            description:
              "Actualiza tu clave (mínimo 10 caracteres, verificada contra brechas públicas HIBP) y revoca otras sesiones abiertas.",
            interpretation:
              "Exige tu contraseña actual y código TOTP reciente sin cerrar tu sesión activa.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "activar-mfa",
        title: "Configurar MFA y proteger tu cuenta",
        goal: "Asegurar tu sesión con segundo factor obligatorio y respaldos custodiados.",
        steps: [
          "Abre Seguridad y clave desde tu propia sesión.",
          "Escanea el QR con una aplicación autenticadora confiable.",
          "Ingresa el código de 6 dígitos para confirmar el vínculo.",
          "Guarda los 10 códigos de respaldo en tu gestor de contraseñas.",
          "Si necesitas rotar tu clave, usa el formulario lateral con una contraseña única de al menos 10 caracteres.",
          "Retira cualquier captura o copia temporal del QR o de los códigos.",
        ],
        expected:
          "La cuenta opera en AAL2 obligatorio, con respaldos vigentes y contraseña no filtrada.",
      },
    ],
    cautions: ["Nunca envíes códigos TOTP o de respaldo por correo, WhatsApp o tickets."],
    faqs: [
      {
        question: "¿Puedo desactivar la verificación en dos pasos?",
        answer:
          "No. El segundo factor es obligatorio para todos los roles administrativos; solo puedes cambiar de dispositivo autenticador o usar un código de respaldo en caso de pérdida.",
      },
      {
        question: "¿Qué hago si perdí mi teléfono?",
        answer:
          "En el reto MFA ingresa uno de tus códigos de respaldo vigentes para reiniciar el factor y enrolar tu nuevo dispositivo de inmediato.",
      },
    ],
    related: ["usuarios", "auditoria", "ayuda"],
    keywords: [
      "MFA",
      "TOTP",
      "AAL2",
      "dos pasos",
      "contraseña",
      "clave",
      "QR",
      "recuperación",
      "seguridad",
    ],
    version: 1,
  },
  {
    id: "auditoria",
    title: "Auditoría y seguridad",
    area: "Configuración y seguridad",
    route: "/admin/auditoria",
    summary:
      "Bitácora inmutable del equipo, pulso de 14 días y eventos de seguridad bloqueados (hora Colombia).",
    purpose:
      "Permite reconstruir mutaciones administrativas con enlaces directos a cada entidad e investigar intentos rechazados de login o firmas inválidas de webhooks.",
    whenToUse: [
      "Para investigar quién ejecutó un cambio y saltar directo al registro afectado.",
      "Para auditar accesos a PII, reembolsos, cambios de rol o alertas de auto-gestión.",
      "Para revisar campañas de login fallido o webhooks rechazados en la pestaña de seguridad.",
    ],
    concepts: [
      { term: "Actor", definition: "Usuario administrativo que ejecutó la acción registrada." },
      {
        term: "Entidad",
        definition:
          "Objeto de negocio afectado con enlace directo a su módulo operativo en el panel.",
      },
      {
        term: "Evento de seguridad",
        definition:
          "Intento fallido de autenticación o firma inválida de webhook agregado por ventana y correlacionado por hash de IP.",
      },
    ],
    sections: [
      {
        id: "eventos",
        title: "Acciones del equipo y seguridad bloqueada",
        summary: "Alterna entre la bitácora operativa y el registro forense de rechazos.",
        topics: [
          {
            id: "accion",
            label: "Acción y entidad enlazada",
            description:
              "Evento administrativo ejecutado en hora de Colombia con acceso directo al registro.",
            interpretation:
              "Combina vistas rápidas (PII, finanzas, usuarios/MFA, CRM) con rango de fechas en hora Bogotá.",
          },
          {
            id: "seguridad",
            label: "Eventos de seguridad bloqueados",
            description:
              "Muestra fallos de login admin/tienda y firmas de webhook rechazadas agrupados con contador.",
            interpretation:
              "Haz clic en un hash de IP para correlacionar todos los intentos del mismo origen sin exponer IPs personales.",
          },
          {
            id: "self",
            label: "Alerta de auto-gestión staff",
            description: "Señala cuando un integrante opera sobre un pedido asociado a su correo.",
            caution: "No es prueba automática de irregularidad, pero exige verificación.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "investigar-accion",
        title: "Investigar un cambio o incidente",
        goal: "Reconstruir responsable, momento y origen sin alterar evidencia.",
        steps: [
          "Elige la pestaña Acciones del equipo o Eventos de seguridad bloqueados.",
          "Delimita el rango de fechas (hora Colombia) y aplica el filtro rápido correspondiente.",
          "Identifica actor u origen hash IP y revisa el pulso de los últimos 14 días.",
          "Abre la entidad enlazada para contrastar su estado vivo actual.",
          "Documenta hallazgos sin modificar registros históricos.",
        ],
        expected:
          "La investigación conserva una cronología verificable en hora local y trazabilidad completa.",
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
    keywords: [
      "bitácora",
      "actor",
      "acción",
      "self dealing",
      "seguridad",
      "webhook",
      "ipHash",
      "historial",
    ],
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
