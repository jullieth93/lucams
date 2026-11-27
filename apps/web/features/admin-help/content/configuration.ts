import { HELP_LIVE_NUMBERS } from "../constants";
import type { AdminModuleGuide } from "../types";

export const CONFIGURATION_GUIDES: AdminModuleGuide[] = [
  {
    id: "envios",
    title: "Envíos",
    area: "Configuración y seguridad",
    route: "/admin/envios",
    summary:
      "Transportadoras nacionales de Aveonline, límites de peso, Envío Lucams por localidades y hora de corte.",
    purpose:
      "Gobierna qué métodos de entrega ofrece el checkout y bajo qué condiciones: operadores nacionales vía Aveonline acotados por peso mínimo/máximo en kg, mensajería interna Envío Lucams en localidades habilitadas de Bogotá y Soacha, tarifa local fija, hora límite de despacho y validación del punto de recogida.",
    whenToUse: [
      "Para activar o pausar una transportadora nacional o ajustar su rango de peso en kg.",
      "Para modificar la tarifa, localidades cubiertas u hora límite de Envío Lucams.",
      "Para verificar que los datos del punto de origen de recogida estén completos.",
    ],
    concepts: [
      {
        term: "Rango de peso por transportadora",
        definition:
          "Límites opcionales (mínimo y máximo en kg) con los que se filtra cada transportadora según el peso apilado real del carrito.",
      },
      {
        term: "Envío Lucams",
        definition:
          "Mensajería propia con tarifa fija para localidades seleccionadas de Bogotá y Soacha, independiente de Aveonline.",
      },
      {
        term: "Hora límite (corte local)",
        definition:
          "Hora en reloj de Bogotá (-05:00) que separa las entregas estimadas del ciclo actual frente al siguiente día hábil.",
      },
    ],
    sections: [
      {
        id: "reglas",
        title: "Cobertura nacional, ruta local y punto de recogida",
        summary:
          "Cada cambio afecta inmediatamente las cotizaciones nuevas selladas con HMAC en el checkout.",
        topics: [
          {
            id: "origen",
            label: "Verificación de punto de origen",
            description:
              "Comprueba que ciudad, dirección, contacto y teléfono remitente en Ajustes del sitio estén completos.",
            caution:
              "Si aparece alerta de origen incompleto, corrígelo en Ajustes del sitio antes de tocar transportadoras.",
          },
          {
            id: "aveonline-carriers",
            label: "Transportadoras nacionales y pesos (kg)",
            description:
              "Habilita cada operador de Aveonline y filtra qué carritos puede transportar según peso.",
            interpretation:
              "Asegúrate de no dejar huecos de peso (ej. 0–2 kg y 5–10 kg dejando huérfanos los carritos de 3 kg).",
          },
          {
            id: "lucams-local",
            label: "Localidades, tarifa y corte de Envío Lucams",
            description:
              "Define qué localidades de Bogotá y Soacha ven mensajería propia, a qué precio en pesos COP y con qué hora límite.",
            interpretation:
              "Activa únicamente zonas donde tengas capacidad operativa real de entrega.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "configurar-envio",
        title: "Ajustar transportadoras o cobertura local sin dejar el checkout sin fletes",
        goal: "Publicar reglas logísticas cumplibles y verificar cotización nacional y local.",
        route: "/admin/envios",
        steps: [
          "Confirma en la cabecera que el punto de origen esté en verde y que siempre permanezca al menos un método activo.",
          "Ajusta estado o rangos de peso (mínimo ≤ máximo) de las transportadoras nacionales en Aveonline.",
          "Revisa tarifa COP, hora límite 24h y localidades activas de Envío Lucams.",
          "Guarda la sección editada y prueba en el checkout una dirección de Bogotá cubierta y una ciudad nacional.",
        ],
        expected:
          "El checkout cotiza con sello HMAC tarifas coherentes y nunca queda bloqueado sin transportadora disponible.",
      },
    ],
    cautions: [
      "Los cambios aplican solo a cotizaciones nuevas; los pedidos ya creados conservan la transportadora y flete sellados al comprar.",
    ],
    dontTouch: [
      "Jamás desactives todas las transportadoras de Aveonline y Envío Lucams al mismo tiempo: bloquearías el 100 % de las ventas en tienda.",
      "No configures rangos de peso con vacíos intermedios que dejen carritos medianos sin cotización.",
    ],
    checklist: [
      "Punto de origen remitente verificado sin alertas.",
      "Al menos una transportadora nacional activa sin huecos de peso.",
      "Cotización probada en checkout para Bogotá y para otra ciudad.",
    ],
    faqs: [
      {
        question: "¿Si cambio la tarifa de Envío Lucams cambia un pedido ya pagado?",
        answer:
          "No. Cada pedido sella su flete al momento de confirmarse; las nuevas reglas rigen solo hacia adelante.",
      },
    ],
    related: ["integraciones-aveonline", "contenido-global", "pedidos", "conciliacion"],
    relatedPlaybooks: ["playbook-pedido-web-300dpi", "playbook-cod-conciliacion-bloqueos"],
    keywords: [
      "Aveonline",
      "Envío Lucams",
      "flete",
      "tarifa",
      "peso",
      "localidad",
      "Bogotá",
      "Soacha",
      "cobertura",
    ],
    version: 2,
  },
  {
    id: "canales",
    title: "Canales omnicanal",
    area: "Configuración y seguridad",
    route: "/admin/canales",
    summary:
      "Panorama de canales de venta, publicación en escaparate web y preparación omnicanal de inventario.",
    purpose:
      "Resume los canales comerciales conectados al núcleo de catálogo e inventario de Lucams Shop. La tienda web opera de forma exclusiva en modo transaccional completo (full) con separación estricta entre productos bajo pedido del Estudio (MADE_TO_ORDER) y productos terminados con stock físico (PHYSICAL_STOCK).",
    whenToUse: [
      "Para revisar el estado general de los canales activos y entrar al detalle de Tienda Lucams.",
      "Antes de auditar qué productos están publicados en el escaparate web y en el feed público.",
    ],
    concepts: [
      {
        term: "Operación full exclusiva",
        definition:
          "Lucams Shop opera únicamente como comercio electrónico transaccional completo (carrito, checkout, Wompi, COD y portal B2B); no existe cotización individual por WhatsApp.",
      },
      {
        term: "MADE_TO_ORDER vs PHYSICAL_STOCK",
        definition:
          "Los productos personalizados en el Estudio se fabrican bajo pedido; los productos terminados usan stock físico con reserva de seguridad para venta omnicanal.",
      },
    ],
    sections: [
      {
        id: "panorama",
        title: "Tarjetas de canal y arquitectura de publicación",
        summary: "Conecta el catálogo central con cada superficie comercial habilitada.",
        topics: [
          {
            id: "tienda-web",
            label: "Canal Tienda Lucams",
            description:
              "Canal principal activo en producción con dominio propio, feed Merchant XML y pasarelas operativas.",
            interpretation:
              "Haz clic en Tienda Lucams para inspeccionar elegibilidad de catálogo, URL canónica y dependencias.",
          },
          {
            id: "externos",
            label: "Canales externos futuros",
            description:
              "La base omnicanal de inventario ya aísla stock físico y kardex por canal; marketplaces externos solo se habilitan cuando su integración oficial está activa.",
            interpretation:
              "Nunca prometas disponibilidad en canales aún no conectados en Integraciones.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "auditar-canales",
        title: "Revisar coherencia entre catálogo y canales",
        goal: "Confirmar que los productos visibles y feeds correspondan a la operación vigente.",
        route: "/admin/canales",
        steps: [
          "Abre Canales y entra al detalle de Tienda Lucams (/admin/canales/tienda).",
          "Verifica dominio canónico HTTPS, conteo de productos publicados en tienda y salud de integraciones críticas.",
          "Si un producto activo no aparece en el canal web, revisa en Productos su bandera de publicación en tienda y estado de variantes.",
        ],
        expected:
          "Tienes certeza de qué oferta pública está expuesta y de que sus conectores transaccionales responden.",
      },
    ],
    cautions: [
      "Publicar un producto en el catálogo no implica aprobación automática en plataformas externas como Google Merchant Center.",
    ],
    dontTouch: [
      "No marques productos personalizados del Estudio como stock físico terminado: el servidor y la arquitectura omnicanal exigen que sean bajo pedido.",
    ],
    checklist: [
      "Canal Tienda Lucams con URL productiva HTTPS y conectores esenciales operativos.",
      "Productos activos con clasificación correcta entre bajo pedido y stock físico.",
    ],
    faqs: [
      {
        question:
          "¿Cómo se atienden pedidos grandes de empresas si la tienda opera 100 % transaccional?",
        answer: `Las compras individuales cierran directo en el checkout (hasta ${HELP_LIVE_NUMBERS.maxSelfServicePhysicalUnits} unidades físicas por línea) y los proyectos corporativos o eventos desde ${HELP_LIVE_NUMBERS.minB2bUnits} unidades entran por /empresas-y-eventos hacia Oportunidades B2B.`,
      },
    ],
    related: ["canales-tienda", "productos", "inventario", "integraciones"],
    relatedPlaybooks: ["playbook-catalogo-estudio-lanzamiento"],
    keywords: [
      "canales",
      "omnicanal",
      "tienda",
      "escaparate",
      "bajo pedido",
      "stock físico",
      "Merchant",
    ],
    version: 2,
  },
  {
    id: "canales-tienda",
    title: "Canal Tienda Lucams",
    area: "Configuración y seguridad",
    route: "/admin/canales/tienda",
    summary:
      "Diagnóstico operativo del escaparate web propio, feed XML para Google Merchant y elegibilidad de productos.",
    purpose:
      "Muestra en una sola vista la salud comercial de `lucamsshop.com`: dominio canónico, operación transaccional completa, ruta y cobertura del feed Google Merchant XML y estado vivo de los proveedores que sostienen compra, pago y envío.",
    whenToUse: [
      "Después de activar, pausar o archivar productos para comprobar cuántos entran al escaparate y al feed.",
      "Para obtener y verificar la URL del feed XML de Google Merchant Center.",
      "Cuando investigues por qué el checkout o el catálogo se comporta distinto a lo esperado.",
    ],
    concepts: [
      {
        term: "Publicación en escaparate (publishedOnStorefront)",
        definition:
          "Interruptor por producto que controla si un artículo activo aparece en la tienda web propia y su feed.",
      },
      {
        term: "Feed Google Merchant XML",
        definition:
          "Documento público generado dinámicamente con precios en COP, disponibilidad e imágenes de los productos elegibles.",
      },
    ],
    sections: [
      {
        id: "diagnostico-tienda",
        title: "Dominio, catálogo publicado y conectores del canal",
        summary: "Verifica de un vistazo que vitrina, pagos y envíos estén sincronizados.",
        topics: [
          {
            id: "cobertura-catalogo",
            label: "Productos elegibles vs pausados",
            description:
              "Desglosa cuántos productos activos están publicados en tienda y cuántos quedan excluidos del feed por falta de imagen o variante activa.",
            interpretation:
              "Usa este conteo tras cada lanzamiento para detectar fichas incompletas.",
          },
          {
            id: "merchant-xml",
            label: "Estado del feed XML",
            description: "Expone el enlace del feed consumido por Google Merchant Center.",
            caution:
              "Que el XML responda 200 OK significa que la tienda lo sirve bien; las revisiones políticas de Google se confirman en Merchant Center.",
          },
          {
            id: "dependencias",
            label: "Semáforo de integraciones del canal",
            description:
              "Cruza el estado de Wompi, Aveonline, Resend y Supabase que sostienen la compra directa.",
            interpretation:
              "Si alguna dependencia aparece degradada, salta directo a Integraciones u Observabilidad.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "verificar-tienda-lucams",
        title: "Validar el canal web tras cambios de catálogo",
        goal: "Asegurar que la oferta publicada en web y Merchant XML sea íntegra y comprable.",
        route: "/admin/canales/tienda",
        steps: [
          "Confirma que el dominio público mostrado corresponda al ambiente actual.",
          "Revisa el conteo de productos publicados y corrige en Productos cualquier ítem activo sin variante o sin foto principal.",
          "Comprueba que las integraciones de pagos, envíos y correos estén operativas.",
        ],
        expected:
          "El canal web sirve únicamente productos completos y listos para comprar y despachar.",
      },
    ],
    cautions: [
      "Desmarcar la publicación en escaparate de un producto activo lo retira tanto de las listados web como del feed Merchant.",
    ],
    dontTouch: [
      "No compartas URLs de ambientes de prueba (STG o túneles locales) en cuentas productivas de Google Merchant Center.",
    ],
    checklist: [
      "Dominio productivo correcto.",
      "Cero productos activos involuntariamente fuera del feed por falta de imagen o variante.",
      "Conectores de pago y logística en verde.",
    ],
    faqs: [
      {
        question: "¿Por qué en STG veo más productos pausados que en producción?",
        answer:
          "Por diseño de homologación: producción conserva limpio el catálogo activo de referencia e históricos, mientras STG mantiene el catálogo extendido pausado para pruebas.",
      },
    ],
    related: ["canales", "productos", "envios", "integraciones", "observability"],
    relatedPlaybooks: ["playbook-catalogo-estudio-lanzamiento"],
    keywords: ["Tienda Lucams", "Merchant Center", "XML", "feed", "escaparate", "dominio"],
    version: 1,
  },
  {
    id: "integraciones",
    title: "Integraciones",
    area: "Configuración y seguridad",
    route: "/admin/integraciones",
    summary:
      "Estado real de los 7 proveedores externos (Supabase, Wompi, Aveonline, Resend, Cloudflare/Turnstile, Google/IA y WhatsApp) sin exponer secretos.",
    purpose:
      "Distingue con exactitud qué está configurado en variables de entorno, conectado, activo y saludable en los 7 proveedores del ecosistema, sin interruptores ficticios ni exposición de llaves privadas.",
    whenToUse: [
      "Cuando falle un cobro en Wompi, la emisión de una guía, un correo o un reto Turnstile.",
      "Después de un despliegue o rotación de credenciales para confirmar paridad de variables.",
      "Para entrar al diagnóstico profundo y gestión de webhook de Aveonline.",
    ],
    concepts: [
      {
        term: "Resolución viva de proveedor",
        definition:
          "Cada tarjeta distingue presencia de configuración, prueba de conexión, activación real y acciones humanas externas pendientes.",
      },
      {
        term: "Circuit breaker y sondas",
        definition:
          "Protección contra caídas de terceros y pruebas ligeras de lectura que no crean pedidos, pagos ni guías reales.",
      },
    ],
    sections: [
      {
        id: "estado",
        title: "Lectura de los 7 proveedores y pendientes externos",
        summary:
          "Aísla en segundos si un fallo viene de credenciales, red externa o datos de un pedido.",
        topics: [
          {
            id: "salud",
            label: "Configurado, conectado y saludable",
            description:
              "Informa qué variables requeridas están presentes (nunca su valor) y el resultado de la sonda reciente.",
            interpretation:
              "Si un proveedor figura saludable pero un pedido puntual falló, el problema suele estar en los datos de ese pedido (ej. ciudad o peso), no en las llaves.",
          },
          {
            id: "pendiente",
            label: "Acciones humanas externas",
            description:
              "Lista pasos que solo pueden ejecutarse en consolas externas (Vercel, Supabase, Wompi, Cloudflare, Google).",
            caution:
              "Nunca pegues llaves privadas, tokens de webhook ni secretos de Vault en tickets, notas o chats.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "diagnosticar-integracion",
        title: "Diagnosticar un fallo de proveedor externo",
        goal: "Separar problemas globales de infraestructura frente a errores puntuales de operación.",
        route: "/admin/integraciones",
        roles: ["SUPERADMIN"],
        steps: [
          "Identifica el proveedor implicado y revisa su tarjeta en Integraciones.",
          "Comprueba que todas sus variables obligatorias figuren presentes.",
          "Si es Aveonline, entra a su diagnóstico dedicado (/admin/integraciones/aveonline) y ejecuta la sonda no destructiva.",
          "Cruza con Salud técnica (/admin/observability) para revisar webhooks rechazados, latidos de crons o errores recientes.",
          "Corrige variables en Vercel/entorno si faltan o atiende el dato puntual en el pedido afectado sin lanzar reintentos masivos.",
        ],
        expected:
          "Determinas con evidencia segura si debes intervenir configuración externa, esperar recuperación del tercero o corregir un registro puntual.",
      },
    ],
    cautions: [
      "Jamás generes compras, reembolsos o guías reales en producción solo para probar si una integración responde.",
    ],
    dontTouch: [
      "Nunca copies valores de `.env` o llaves de API en capturas de pantalla ni conversaciones de soporte.",
      "No registres webhooks apuntando a túneles temporales desde el ambiente de producción.",
    ],
    checklist: [
      "Variables obligatorias presentes en el proveedor afectado.",
      "Sonda de conectividad revisada sin ejecutar transacciones comerciales ficticias.",
      "Cruce verificado contra errores y webhooks en /admin/observability.",
    ],
    faqs: [
      {
        question: "¿Por qué no hay botones de apagar/encender proveedores aquí?",
        answer:
          "Por diseño arquitectónico (ADR-206): las credenciales viven en el entorno seguro de despliegue y las reglas operativas de negocio se gobiernan en sus módulos reales (como /admin/envios o /admin/lifecycle), evitando toggles engañosos.",
      },
    ],
    related: ["integraciones-aveonline", "observability", "envios", "canales-tienda"],
    relatedPlaybooks: ["playbook-incidentes-seguridad-dian", "playbook-pedido-web-300dpi"],
    keywords: [
      "Wompi",
      "Aveonline",
      "Resend",
      "Supabase",
      "Turnstile",
      "Gemini",
      "WhatsApp",
      "salud",
      "variables",
    ],
    version: 2,
  },
  {
    id: "integraciones-aveonline",
    title: "Diagnóstico y Webhook Aveonline",
    area: "Configuración y seguridad",
    route: "/admin/integraciones/aveonline",
    summary:
      "Sonda de autenticación y latencia en vivo, suscripción segura del webhook de rastreo y pruebas de cobertura nacional (Superadmin).",
    purpose:
      "Permite diagnosticar de extremo a extremo la conexión con Aveonline sin emitir guías reales: valida credenciales de autenticación, mide latencia, prueba cotización por ciudad destino y registra o retira el webhook oficial de eventos logísticos.",
    whenToUse: [
      "Cuando falle la generación de una guía en un pedido o una ciudad no devuelva cotización nacional.",
      "Para verificar o renovar la suscripción del webhook de estados de envío en producción.",
      "Tras rotar credenciales o secreto compartido de Aveonline.",
    ],
    concepts: [
      {
        term: "Sonda no destructiva",
        definition:
          "Autentica y consulta cobertura contra Aveonline sin llamar a `generarGuia2` ni generar cobros con transportadoras.",
      },
      {
        term: "Webhook logístico más cron híbrido",
        definition:
          "Aveonline empuja eventos al webhook firmado y, como respaldo resiliente, el cron `tracking-sync` consulta guías activas cada 15 minutos.",
      },
    ],
    sections: [
      {
        id: "aveonline-panel",
        title: "Autenticación, cobertura y gestión de webhook",
        summary: "Herramientas forenses exclusivas de Superadmin con protección MFA.",
        topics: [
          {
            id: "sonda",
            label: "Prueba de autenticación y cotización",
            description:
              "Comprueba token, latencia en milisegundos y respuesta de operadores hacia ciudades DANE.",
            interpretation:
              "Si la sonda autentica bien pero falla una ciudad concreta, revisa cobertura de las transportadoras habilitadas en /admin/envios.",
          },
          {
            id: "webhook",
            label: "Suscripción y retiro de webhook",
            description:
              "Vincula el endpoint oficial del sitio con Aveonline exigiendo código MFA reciente (≤ 10 min).",
            caution:
              "En ambientes desplegados bloquea dominios ajenos al oficial; en STG el secreto del webhook permanece desacoplado por aislamiento frente a PRD.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "diagnosticar-aveonline",
        title: "Resolver una falla de cotización o guía en Aveonline",
        goal: "Aislar si el bloqueo proviene de credenciales, cobertura de ciudad o datos del pedido.",
        route: "/admin/integraciones/aveonline",
        roles: ["SUPERADMIN"],
        steps: [
          "Ejecuta la sonda de salud en /admin/integraciones/aveonline para confirmar credenciales y latencia.",
          "Verifica que el punto de origen remitente (Ajustes del sitio / Envíos) tenga ciudad DANE y dirección válidas.",
          "Comprueba la cotización hacia la ciudad del pedido y revisa en /admin/envios si los rangos de peso filtraron todas las transportadoras.",
          "Solo tras corregir la causa raíz, vuelve al detalle del pedido (/admin/pedidos/[number]) y reintenta la guía una vez.",
        ],
        expected: "La guía se emite limpia sin duplicar despachos ni saturar el API del proveedor.",
      },
    ],
    cautions: [
      "Modificar la suscripción del webhook exige TOTP reciente y afecta la recepción en tiempo real de estados de envío.",
    ],
    dontTouch: [
      "Nunca apuntes el webhook de Aveonline de producción hacia un entorno local o de staging.",
      "No reintentes guías repetidamente desde el pedido mientras Aveonline reporte caída de autenticación.",
    ],
    checklist: [
      "Sonda de autenticación en verde y con latencia normal.",
      "Punto de origen remitente completo.",
      "Webhook oficial verificado en producción.",
    ],
    faqs: [
      {
        question: "¿Si el webhook de Aveonline falla temporalmente se pierden las entregas?",
        answer:
          "No. El proceso programado `lucams-tracking-sync` sincroniza periódicamente las guías en tránsito como red de seguridad.",
      },
    ],
    related: ["integraciones", "envios", "pedidos", "observability"],
    relatedPlaybooks: ["playbook-pedido-web-300dpi", "playbook-incidentes-seguridad-dian"],
    keywords: [
      "Aveonline",
      "webhook",
      "sonda",
      "guía",
      "cotizarDoble",
      "generarGuia2",
      "latencia",
      "transporte",
    ],
    version: 1,
  },
  {
    id: "observability",
    title: "Salud técnica y observabilidad",
    area: "Configuración y seguridad",
    route: "/admin/observability",
    summary:
      "Monitoreo 24h sin Sentry: entregabilidad de correo, cuotas de Supabase, latidos de crons, webhooks, respaldos R2 y errores agrupados.",
    purpose:
      "Es el tablero central de confiabilidad técnica de Lucams Shop: vigila los procesos programados con dead-man switch, firmas y resultados de webhooks (Wompi, Aveonline, Resend), uso de base de datos y Storage, respaldos diarios cifrados en Cloudflare R2 y errores del servidor agrupados por huella (`fingerprint`).",
    whenToUse: [
      "Cuando recibas una notificación o correo de alerta operativa.",
      "En la revisión de dirección para comprobar respaldos, cuotas de Supabase y entregabilidad de correos.",
      "Cuando un pago aprobado en Wompi, un render 300 DPI o un correo parezca demorado.",
    ],
    concepts: [
      {
        term: "Dead-man switch de crons",
        definition:
          "Vigilancia que marca alerta si un proceso programado supera el doble de su intervalo esperado sin reportar latido.",
      },
      {
        term: "Fingerprint de error",
        definition:
          "Clave que agrupa ocurrencias del mismo fallo técnico mostrando primera vez, última vez y contador sin saturar la pantalla.",
      },
      {
        term: "Entregabilidad y supresión",
        definition:
          "Tasa real de entregas frente a rebotes duros o quejas de spam reportadas por webhook firmado de Resend.",
      },
    ],
    sections: [
      {
        id: "procesos",
        title: "Crons, webhooks, cuotas y respaldos",
        summary: "Expone la salud real de cada pieza asíncrona del sistema.",
        topics: [
          {
            id: "cron",
            label: "Procesos programados (pg_cron)",
            description:
              "Muestra último latido de renders 300 DPI, expiración de órdenes, rastreo logístico, vigilancia fiscal, alertas y limpiezas.",
            interpretation:
              "En STG los crons emisores de correos comerciales permanecen deshabilitados deliberadamente (`CRON_JOBS_DISABLED`).",
          },
          {
            id: "webhook",
            label: "Webhooks, guías externas y reconciliación",
            description:
              "Registra eventos entrantes de Wompi (ventana anti-replay de 25 h), Aveonline y Resend; dispara alerta de prioridad alta (`paid_without_shipment_stale`) si un pedido pagado lleva > 30 min sin guía externa mientras `tracking-sync` intenta recuperarla.",
            interpretation:
              "Si aumentan rechazos de firma, cruza de inmediato con la pestaña de seguridad en /admin/auditoria.",
          },
          {
            id: "cuotas-backups",
            label: "Cuotas Supabase, backup streaming R2 y DR mensual",
            description:
              "Monitorea consumo de Postgres, los 5 buckets de Storage y el latido del respaldo cifrado GPG en streaming hacia Cloudflare R2; el simulacro DR verifica además frescura ≤ 36 h e integridad de `auth.users` y `auth.mfa_factors`.",
            caution:
              "Una alerta de respaldo atrasado exige revisar de inmediato el workflow `backup.yml` en GitHub Actions.",
          },
        ],
      },
      {
        id: "errores",
        title: "Errores agrupados y reglas de alerta",
        summary: "Permite investigar fallos sanitizados y gestionar su estado de seguimiento.",
        topics: [
          {
            id: "estado",
            label: "Abierto, resuelto o ignorado",
            description: "Organiza el triaje de incidentes técnicos.",
            caution:
              "Marcar un error como Resuelto limpia la bandeja actual pero NO repara el código: si la causa persiste volverá a abrirse en la siguiente ocurrencia.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "investigar-salud",
        title: "Atender una alerta técnica o latido vencido",
        goal: "Contener el impacto operativo y diagnosticar la raíz sin duplicar efectos.",
        route: "/admin/observability",
        roles: ["SUPERADMIN"],
        steps: [
          "Abre Salud técnica y revisa las tarjetas en rojo o ámbar del resumen de 24 horas.",
          "Identifica si el incidente corresponde a un cron detenido, un proveedor degradado, cuota de almacenamiento o pico de rebotes.",
          "Contrasta el proveedor afectado en /admin/integraciones y verifica si hay pedidos impactados (ej. renders pendientes o pagos sin conciliar).",
          "Si un recorrido comercial presenta rebotes o fallos externos, usa el interruptor general en /admin/lifecycle o /admin/carritos/configuracion para contener envíos.",
          "Una vez corregida la causa, espera el siguiente ciclo natural de latido y solo entonces marca el grupo de error como Resuelto.",
        ],
        expected:
          "El incidente queda contenido sin efectos colaterales ni reenvíos duplicados a clientes.",
      },
    ],
    cautions: [
      "Nunca dispares endpoints de cron ni reenvíes webhooks manualmente a ciegas sin verificar su idempotencia.",
    ],
    dontTouch: [
      "No ignores alertas de respaldos R2 vencidos ni de tasa de rebote/queja en Resend (arriesgas la reputación del dominio de correo).",
      "No marques errores recurrentes como Ignorados sin documentar y resolver su causa.",
    ],
    checklist: [
      "Latidos de crons críticos (renders, órdenes pendientes, tracking, alertas, backup) al día.",
      "Cuotas de Postgres y Storage dentro de margen seguro.",
      "Tasa de rebote/queja de correo saludable.",
    ],
    faqs: [
      {
        question: "¿Por qué en STG varios crons aparecen desactivados?",
        answer:
          "Es intencional: STG bloquea envíos automáticos de correo y fuerza Lifecycle en DRY_RUN para jamás contactar correos reales desde pruebas.",
      },
    ],
    related: ["integraciones", "performance", "auditoria", "notificaciones", "hoy"],
    relatedPlaybooks: ["playbook-incidentes-seguridad-dian"],
    keywords: [
      "error",
      "cron",
      "latido",
      "dead-man switch",
      "webhook",
      "backup",
      "R2",
      "Supabase",
      "salud",
      "paid_without_shipment_stale",
    ],
    version: 3,
  },
  {
    id: "seguridad",
    title: "Seguridad y clave",
    area: "Configuración y seguridad",
    route: "/admin/seguridad",
    summary: `Segundo factor TOTP obligatorio (AAL2), ${HELP_LIVE_NUMBERS.mfaRecoveryCodesCount} códigos de respaldo, cambio de teléfono y rotación de contraseña.`,
    purpose: `Protege tu cuenta administrativa personal: exige verificación en dos pasos TOTP (sesión en nivel AAL2), administra tus ${HELP_LIVE_NUMBERS.mfaRecoveryCodesCount} códigos de recuperación de emergencia y permite rotar tu contraseña validándola contra filtraciones públicas (HIBP).`,
    whenToUse: [
      "En tu primer ingreso al panel para enrolar tu aplicación autenticadora obligatoria.",
      "Cuando cambies de teléfono celular y necesites migrar tu factor TOTP.",
      `Para regenerar y guardar en tu gestor tus ${HELP_LIVE_NUMBERS.mfaRecoveryCodesCount} códigos de respaldo únicos.`,
      "Para cambiar tu contraseña y cerrar sesiones abiertas en otros dispositivos.",
    ],
    concepts: [
      {
        term: "Sesión AAL2 obligatoria",
        definition:
          "Ninguna pantalla del panel administrativo opera solo con contraseña; toda sesión exige TOTP verificado y expira por inactividad a los 30 minutos.",
      },
      {
        term: `Reautenticación reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min)`,
        definition: `Las acciones críticas (reembolsos, pagos directos B2B, exportaciones CSV, bloqueos COD, fusiones CRM, usuarios) piden confirmar tu código de 6 dígitos si pasaron más de ${HELP_LIVE_NUMBERS.recentMfaMinutes} minutos.`,
      },
      {
        term: "Códigos de respaldo de un solo uso",
        definition:
          "Llaves de emergencia mostradas una única vez al generarse; usar una en el login reinicia el factor para que enroles de inmediato tu nuevo dispositivo.",
      },
    ],
    sections: [
      {
        id: "mfa",
        title: "Autenticador TOTP, respaldos y contraseña",
        summary: "Controles personales de acceso para los 8 roles administrativos.",
        topics: [
          {
            id: "qr",
            label: "Enrolamiento QR y migración de teléfono",
            description:
              "Vincula Google Authenticator, 1Password, Bitwarden o Authy mediante código QR.",
            caution:
              "Si el código de 6 dígitos es rechazado al enrolar, activa la hora automática por red en los ajustes de tu celular.",
          },
          {
            id: "recovery",
            label: `${HELP_LIVE_NUMBERS.mfaRecoveryCodesCount} códigos de recuperación`,
            description:
              "Se revelan una sola vez al crearlos o regenerarlos; regenerar invalida al instante cualquier lista anterior.",
            caution:
              "Guárdalos únicamente en un gestor de contraseñas cifrado, nunca en notas abiertas ni chats.",
          },
          {
            id: "password",
            label: `Rotación de clave (mínimo ${HELP_LIVE_NUMBERS.minAdminPasswordChars} caracteres + HIBP)`,
            description:
              "Verifica de forma anónima (k-anonymity) que la nueva clave no aparezca en brechas públicas y revoca otras sesiones.",
            interpretation: "Exige tu contraseña actual y un código TOTP fresco.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "activar-mfa",
        title: "Completar enrolamiento MFA y custodiar respaldos",
        goal: "Dejar tu cuenta lista para operar en AAL2 sin riesgo de bloqueo por pérdida de celular.",
        route: "/admin/seguridad",
        steps: [
          "Abre tu gestor de contraseñas o app autenticadora y escanea el código QR en pantalla.",
          "Escribe el código vigente de 6 dígitos para sellar la verificación AAL2.",
          `Genera y guarda inmediatamente tus ${HELP_LIVE_NUMBERS.mfaRecoveryCodesCount} códigos de respaldo en un cofre seguro.`,
          "Elimina cualquier captura temporal si la hubieras tomado por error.",
        ],
        expected:
          "Se habilita todo el menú correspondiente a tu rol y cuentas con respaldo autónomo ante pérdida de dispositivo.",
      },
    ],
    cautions: [
      `Tu sesión administrativa se cierra por seguridad tras ${HELP_LIVE_NUMBERS.adminIdleTimeoutMinutes} minutos de inactividad.`,
    ],
    dontTouch: [
      "Jamás compartas tu usuario, contraseña, código TOTP ni códigos de respaldo con nadie (ni siquiera con Dirección).",
      "No tomes fotos al código QR para enviarlas por WhatsApp o correo.",
    ],
    checklist: [
      "Factor TOTP verificado y generando códigos de 6 dígitos.",
      `${HELP_LIVE_NUMBERS.mfaRecoveryCodesCount} códigos de respaldo guardados en gestor de contraseñas.`,
      "Contraseña única de al menos 10 caracteres no reutilizada en otros sitios.",
    ],
    faqs: [
      {
        question: "¿Por qué el panel me volvió a pedir código MFA si ya había iniciado sesión?",
        answer: `Porque ejecutaste una acción sensible (reembolso, pago B2B, exportación, bloqueo o cambio de seguridad) y habían transcurrido más de ${HELP_LIVE_NUMBERS.recentMfaMinutes} minutos desde tu última verificación TOTP.`,
      },
      {
        question: "¿Qué hago si perdí o me robaron el celular?",
        answer:
          "En la pantalla de reto MFA usa uno de tus códigos de respaldo guardados para entrar, reiniciar el factor y enrolar tu nuevo dispositivo; además rota tu contraseña de inmediato.",
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
      "HIBP",
    ],
    version: 2,
  },
  {
    id: "auditoria",
    title: "Auditoría y seguridad",
    area: "Configuración y seguridad",
    route: "/admin/auditoria",
    summary:
      "Bitácora forense inmutable del equipo (120+ acciones), alertas de autogestión (`selfDealing`) y rechazos de seguridad (Superadmin).",
    purpose:
      "Permite reconstruir con hora exacta de Colombia quién hizo qué sobre cualquier entidad del negocio (con diff antes/después y enlace directo al registro), detectar si alguien del staff operó sobre pedidos o contactos propios (`selfDealing`) y correlacionar logins fallidos o firmas inválidas por hash de IP.",
    whenToUse: [
      "Para auditar reembolsos, pagos directos B2B, exportaciones CSV, descargas 300 DPI, cambios de precios o altas de usuarios.",
      "Cuando aparezca una marca de autogestión de staff (`selfDealing`).",
      "Para investigar intentos de acceso rechazados o webhooks con firma inválida.",
    ],
    concepts: [
      {
        term: "Registro inmutable (AdminActionLog)",
        definition:
          "Entrada de solo adición con actor, acción, entidad enlazada, metadatos antes/después y marca temporal.",
      },
      {
        term: "Alerta selfDealing",
        definition:
          "Bandera automática cuando el correo del administrador coincide con el cliente del pedido, contacto o fusión que acaba de gestionar.",
      },
      {
        term: "Correlación por ipHash",
        definition:
          "Huella truncada de IP que permite agrupar intentos hostiles del mismo origen sin almacenar IPs crudas innecesarias.",
      },
    ],
    sections: [
      {
        id: "eventos",
        title: "Acciones del equipo y eventos de seguridad bloqueados",
        summary: "Dos vistas complementarias para control interno y defensa perimetral.",
        topics: [
          {
            id: "acciones-equipo",
            label: "Vistas rápidas operativas",
            description:
              "Filtra al instante accesos/descargas sensibles (PII, ZIP 300 DPI, guías), movimientos financieros, gestión de usuarios/MFA o fusiones CRM.",
            interpretation:
              "Usa el enlace directo de la entidad para contrastar cómo quedó el registro vivo.",
          },
          {
            id: "self-dealing",
            label: "Revisión de autogestión",
            description:
              "Señala cualquiera de las acciones sensibles ejecutadas por un miembro del equipo sobre sus propias compras de prueba o personales.",
            caution:
              "Toda compra real de un integrante debe ser despachada, moderada o reembolsada por otra persona autorizada.",
          },
          {
            id: "bloqueados",
            label: "Eventos de seguridad bloqueados",
            description:
              "Agrupa intentos fallidos de login y rechazos de webhooks por ventana temporal.",
            interpretation:
              "Haz clic sobre un `ipHash` para aislar toda la actividad asociada a ese origen.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "investigar-accion",
        title: "Reconstruir un cambio operativo o alerta forense",
        goal: "Obtener cronología exacta, actor y estado resultante sin alterar evidencia.",
        route: "/admin/auditoria",
        roles: ["SUPERADMIN"],
        steps: [
          "Selecciona la pestaña Acciones del equipo o Eventos de seguridad bloqueados.",
          "Acota el rango de fechas en hora Colombia y aplica el filtro rápido del dominio investigado.",
          "Revisa actor, acción exacta, metadatos y marca `selfDealing` si aplica.",
          "Abre el enlace directo a la entidad (Pedido, Producto, Cupón, Contacto, Usuario) para verificar su estado actual.",
        ],
        expected:
          "Cuentas con trazabilidad completa de extremo a extremo lista para decisión interna o soporte regulatorio.",
      },
    ],
    cautions: [
      "La bitácora es inmutable por diseño: ningún registro puede editarse ni borrarse desde el panel.",
    ],
    dontTouch: [
      "No compartas capturas externas de la bitácora sin verificar que no expongan correos o identificadores internos.",
    ],
    checklist: [
      "Revisé alertas `selfDealing` de la semana.",
      "Verifiqué que no existan picos anómalos en Eventos de seguridad bloqueados.",
    ],
    faqs: [
      {
        question: "¿También quedan auditadas las descargas de ZIP 300 DPI, guías y CSV?",
        answer:
          "Sí. Aunque no modifican datos comerciales, son lecturas sensibles y registran actor, fecha y entidad en AdminActionLog.",
      },
    ],
    related: ["usuarios", "seguridad", "observability", "finanzas", "clientes"],
    relatedPlaybooks: ["playbook-incidentes-seguridad-dian"],
    keywords: [
      "bitácora",
      "auditoría",
      "forense",
      "actor",
      "selfDealing",
      "ipHash",
      "webhook",
      "login fallido",
    ],
    version: 2,
  },
  {
    id: "usuarios",
    title: "Usuarios y acceso",
    area: "Configuración y seguridad",
    route: "/admin/usuarios",
    summary: `Altas individuales, matriz de los ${HELP_LIVE_NUMBERS.assignableAdminRoles} roles asignables, estado 2FA y revocación inmediata (Superadmin).`,
    purpose: `Gobierna quién entra al panel administrativo y con qué alcance exacto de permisos (${HELP_LIVE_NUMBERS.totalCapabilities} capacidades granulares distribuidas en ${HELP_LIVE_NUMBERS.assignableAdminRoles} roles asignables más compatibilidad histórica). Garantiza cuentas nominativas, MFA obligatorio y marcado automático \`isStaff\` en CRM.`,
    whenToUse: [
      "Cuando se incorpora alguien nuevo a Taller, Despachos, Soporte, Operaciones, Finanzas o Contenido.",
      "Para cambiar de rol a una persona cuando cambian sus funciones.",
      "Para desactivar el acceso en el mismo minuto en que alguien deja de operar.",
    ],
    concepts: [
      {
        term: "Principio de mínimo privilegio",
        definition:
          "Cada persona recibe el rol más acotado que le permite cumplir su trabajo diario (ej. Taller no ve precios ni PII; Despachos ve guía pero no ZIP de imprenta).",
      },
      {
        term: "Aislamiento automático de staff (isStaff)",
        definition:
          "El correo de todo administrador se marca automáticamente como personal interno en el CRM para no distorsionar métricas RFM/LTV ni recibir campañas.",
      },
    ],
    sections: [
      {
        id: "acceso",
        title: "Alta, postura MFA y ciclo de vida de cuentas",
        summary: "Controla rol, vigencia y segundo factor con confirmación MFA reciente.",
        topics: [
          {
            id: "rol",
            label: `Selector de los ${HELP_LIVE_NUMBERS.assignableAdminRoles} roles operativos`,
            description:
              "Asigna Administradora, Jefa de operaciones, Atención al cliente, Taller e impresión, Despachos, Analista financiera o Editor de contenido.",
            interpretation:
              "Consulta la pestaña Referencia Rápida del Centro de ayuda para ver qué datos se enmascaran en cada rol.",
          },
          {
            id: "postura-2fa",
            label: "Estado de enrolamiento MFA",
            description: "Muestra si la persona ya completó su factor TOTP obligatorio.",
            interpretation:
              "Hasta que no enrole TOTP en /admin/seguridad, el layout bloquea cualquier otra ruta del panel.",
          },
          {
            id: "retiro",
            label: "Desactivación lógica inmediata",
            description:
              "Cierra el paso al panel preservando intacto todo el historial de acciones en Auditoría.",
            caution:
              "Al retirar a alguien, reasigna también sus tickets, tareas y oportunidades abiertas.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "crear-admin",
        title: "Dar de alta y entrenar a una persona nueva del equipo",
        goal: "Habilitar acceso nominativo seguro y guiar su primer día sin riesgos.",
        route: "/admin/usuarios",
        roles: ["SUPERADMIN"],
        steps: [
          "Confirma el correo corporativo o personal verificado de la persona y elige el rol de menor privilegio necesario.",
          "Ejecuta el alta confirmando tu código MFA reciente.",
          "Pídele ingresar, enrolar su TOTP en /admin/seguridad y guardar sus 10 códigos de respaldo.",
          "Indícale abrir /admin/ayuda en la pestaña Día 1 y Rutina Diaria (puedes previsualizar antes su vista exacta usando el selector «Ver ayuda como rol…»).",
        ],
        expected:
          "La persona entra con cuenta propia en AAL2, ve únicamente sus bandejas autorizadas y sigue su rutina paso a paso.",
      },
      {
        id: "retirar-admin",
        title: "Revocar el acceso de un integrante",
        goal: "Cortar inmediatamente el ingreso sin perder trazabilidad histórica.",
        route: "/admin/usuarios",
        roles: ["SUPERADMIN"],
        steps: [
          "Reasigna sus tickets en Soporte, tareas en Bandeja Hoy u oportunidades en B2B.",
          "Desactiva la cuenta en /admin/usuarios confirmando con MFA reciente.",
          "Verifica en Auditoría sus últimas acciones ejecutadas.",
        ],
        expected:
          "La cuenta no puede volver a operar ninguna ruta ni acción del panel y la bitácora histórica permanece íntegra.",
      },
    ],
    cautions: [
      "Otorgar rol Superadmin habilita reembolsos, aprobación de pagos directos B2B, gestión de usuarios y exportación de PII completa.",
    ],
    dontTouch: [
      "Nunca crees cuentas genéricas compartidas (como `taller@...` usada por tres personas): destruyes la trazabilidad de Auditoría y MFA.",
      "Nunca asignes Superadmin por salir del paso cuando basta Jefa de operaciones, Soporte, Taller o Despachos.",
    ],
    checklist: [
      "Cuenta individual creada con el rol mínimo indispensable.",
      "Enrolamiento MFA verificado por la persona en su primer ingreso.",
      "Recorrido de Día 1 asignado en /admin/ayuda.",
    ],
    faqs: [
      {
        question: "¿Por qué en código existen 8 roles pero el selector de alta muestra 7?",
        answer:
          "Porque el rol heredado Gestora (MANAGER) tiene la misma matriz de permisos que Jefa de operaciones y se mantiene solo por compatibilidad sin downtime.",
      },
    ],
    related: ["seguridad", "auditoria", "ayuda"],
    relatedPlaybooks: ["playbook-incidentes-seguridad-dian"],
    keywords: ["admin", "rol", "permisos", "RBAC", "alta", "desactivar", "MFA", "acceso"],
    version: 2,
  },
];
