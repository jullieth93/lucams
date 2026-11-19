import { HELP_LIVE_NUMBERS } from "../constants";
import type { AdminModuleGuide } from "../types";

export const CMS_GUIDES: AdminModuleGuide[] = [
  {
    id: "contenido",
    title: "Contenido y CMS",
    area: "Contenido",
    route: "/admin/contenido",
    summary:
      "Páginas editoriales, secciones, bloques Markdown, borradores y publicación programada.",
    purpose:
      "Gobierna los textos, avisos, FAQs, textos legales dinámicos y bloques reutilizables del sitio público mediante una arquitectura de 3 capas (página, sección y campo con paridad verificada en CI). Separa edición en borrador de publicación en vivo, guarda historial append-only y permite programar lanzamientos.",
    whenToUse: [
      "Para editar textos de portada, contacto, rastreo, páginas informativas o FAQs.",
      "Para revisar borradores pendientes, restaurar una versión previa o programar una publicación.",
      "Para administrar bloques estructurados reutilizables sin tocar código.",
    ],
    concepts: [
      {
        term: "Página y sección CMS",
        definition:
          "Contenedor editorial conectado a una ruta pública (ej. portada, contacto, legal) cuyos campos están tipados y auditados contra el código.",
      },
      {
        term: "Campo BLOCK vs SETTING",
        definition:
          "Un BLOCK gobierna contenido editorial versionado con borrador y publicación; un SETTING aplica parámetros atómicos de operación.",
      },
      {
        term: "Borrador vs publicado",
        definition:
          "Guardar crea o actualiza un borrador interno; solo al publicar (o cumplirse la fecha programada) se invalida la caché pública.",
      },
      {
        term: "Tokens legales dinámicos",
        definition:
          "Marcadores entre dobles llaves como plazos de retracto o garantía que el motor interpola automáticamente con las constantes legales vigentes.",
      },
    ],
    sections: [
      {
        id: "paginas",
        title: "Páginas, secciones y campos",
        summary: "Ubica el campo exacto según la superficie pública donde aparece.",
        topics: [
          {
            id: "campo",
            label: "Clave estable del campo",
            description:
              "Identificador único que enlaza el contenido guardado en base de datos con el componente exacto de la tienda.",
            caution:
              "Nunca alteres claves ni tipos para forzar un cambio de diseño: dejarías la tienda mostrando el fallback estático.",
          },
          {
            id: "texto",
            label: "Texto enriquecido y Markdown",
            description:
              "Permite encabezados, listas y enlaces internos seguros sin inyectar HTML arbitrario.",
            interpretation:
              "Comprueba siempre la vista previa móvil y escritorio antes de publicar.",
          },
          {
            id: "tokens",
            label: "Promesas comerciales y tokens legales",
            description:
              "Los textos públicos están sujetos al Estatuto del Consumidor (Ley 1480 arts. 23 y 29): toda promesa anunciada obliga al negocio.",
            caution:
              "No borres marcadores entre llaves ni escribas a mano plazos o medios de pago que la tienda no opera hoy.",
          },
        ],
      },
      {
        id: "publicacion",
        title: "Borradores, programación e historial",
        summary: "Controla el ciclo editorial completo con trazabilidad reversible.",
        topics: [
          {
            id: "borrador",
            label: "Cola de borradores",
            description:
              "Lista todos los campos modificados que aún no han salido a producción para revisarlos en conjunto.",
            interpretation:
              "Si editaste un texto y no lo ves en la tienda pública, revisa primero si quedó pendiente en Borradores.",
          },
          {
            id: "programada",
            label: "Publicación programada",
            description:
              "Permite fijar fecha y hora Colombia para que el job automático publique campañas estacionales cada 5 minutos.",
            interpretation:
              "Verifica siempre que la zona horaria sea Bogotá (-05:00) antes de confirmar.",
          },
          {
            id: "historial",
            label: "Historial visual de versiones",
            description:
              "Conserva cada versión anterior de forma inmutable para comparar cambios y revertir sin perder trabajo.",
            interpretation:
              "Úsalo ante cualquier error tipográfico publicado en vez de reescribir de memoria.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-contenido",
        title: "Editar, previsualizar y publicar un cambio editorial",
        goal: "Actualizar textos o imágenes públicas sin romper formato, enlaces ni cumplimiento legal.",
        route: "/admin/contenido",
        steps: [
          "Abre Páginas del sitio y entra al contenedor de la superficie pública que necesitas ajustar.",
          "Localiza la sección y el campo exacto, edita el contenido respetando los tokens dinámicos y guarda como borrador.",
          "Abre la vista previa y comprueba saltos de línea, enlaces e imágenes tanto en móvil como en escritorio.",
          "Verifica que no estés prometiendo tiempos de entrega, descuentos o canales distintos a los vigentes.",
          "Pulsa Publicar (con MFA reciente si tocas superficie sensible) y valida la página pública en una pestaña nueva.",
        ],
        expected:
          "El cambio queda publicado, la caché de contenido se renueva al instante y el historial conserva la versión previa.",
        exceptions: [
          "Si el campo pertenece a Ajustes del sitio (global), solo Superadmin podrá abrirlo y guardarlo.",
        ],
      },
    ],
    cautions: [
      "Guardar borrador NO actualiza el sitio público: debes completar el paso explícito de Publicar.",
      "Cualquier cambio en textos legales, tiempos de entrega, medios de pago o canales de contacto exige mantener coherencia con las políticas oficiales de Lucams Shop.",
    ],
    dontTouch: [
      "No elimines marcadores dinámicos {{...}} en textos legales o FAQs.",
      "No pegues HTML crudo ni scripts externos dentro de campos Markdown.",
      "No anuncies promociones, envíos gratis o plazos de fabricación que no estén configurados en Envíos, Cupones o Productos.",
    ],
    checklist: [
      "Confirmé que edité el campo de la página correcta y conservé sus tokens dinámicos.",
      "Revisé el borrador en vista previa móvil y escritorio.",
      "Publiqué explícitamente y comprobé el texto vivo en la tienda.",
    ],
    subroutes: [
      {
        id: "contenido-pagina",
        pattern: "/admin/contenido/paginas/[slug]",
        title: "Edición de página específica",
        summary:
          "Estás editando las secciones y campos de un contenedor puntual del sitio público.",
        tips: [
          "Revisa cada sección en orden visual de arriba hacia abajo tal como aparece en la tienda.",
          "Guarda tus cambios como borrador y comprueba si hay otros campos pendientes antes de publicar todo el bloque.",
        ],
        highlightSectionIds: ["paginas", "publicacion"],
        highlightProcedureIds: ["publicar-contenido"],
      },
      {
        id: "contenido-borradores",
        pattern: "/admin/contenido/borradores",
        title: "Bandeja de borradores pendientes",
        summary: "Concentra todos los cambios guardados que todavía no están publicados en vivo.",
        tips: [
          "Inspecciona el autor y la fecha de cada borrador antes de publicar cambios acumulados de otra persona.",
          "Descarta borradores obsoletos para evitar que salgan a producción por accidente en una publicación posterior.",
        ],
        highlightSectionIds: ["publicacion"],
      },
      {
        id: "contenido-bloques",
        pattern: "/admin/contenido/bloques*",
        title: "Bloques estructurados del CMS",
        summary:
          "Gestiona piezas reutilizables de contenido estructurado conectadas a secciones del sitio.",
        tips: [
          "Verifica en qué páginas se consume el bloque antes de modificar su orden o visibilidad.",
          "Respeta el esquema de campos obligatorios al crear o editar un bloque.",
        ],
        highlightSectionIds: ["paginas"],
      },
      {
        id: "contenido-campos",
        pattern: "/admin/contenido/campos*",
        title: "Detalle e historial de campo CMS",
        summary:
          "Edición directa de un campo puntual con acceso a su historial de versiones y programación.",
        tips: [
          "Compara contra la versión publicada vigente antes de sobrescribir un texto largo.",
          "Si restauras una versión anterior, verifica que sus precios o condiciones sigan vigentes hoy.",
        ],
        highlightSectionIds: ["paginas", "publicacion"],
      },
      {
        id: "contenido-configuracion",
        pattern: "/admin/contenido/configuracion",
        title: "Configuración técnica del CMS (Superadmin)",
        summary: "Parámetros avanzados del motor editorial reservados a Dirección.",
        tips: [
          "Valida la paridad del mapa editorial antes de tocar ajustes estructurales.",
          "Si buscas cambiar el logo, anuncios globales o remitente logístico, usa Ajustes del sitio (/admin/contenido/paginas/global).",
        ],
        highlightSectionIds: ["paginas"],
      },
    ],
    faqs: [
      {
        question: "¿Guardar y publicar son lo mismo?",
        answer:
          "No. Guardar almacena un borrador interno sin afectar a los clientes; Publicar activa la versión en vivo y refresca la caché.",
      },
      {
        question: "¿Por qué Editor de contenido no puede abrir Ajustes del sitio?",
        answer:
          "Porque Ajustes del sitio (/admin/contenido/paginas/global) gobierna identidad de marca, punto de recogida logístico y parámetros globales exclusivos de Superadmin.",
      },
    ],
    related: ["contenido-global", "mediateca", "email-templates", "redirects"],
    keywords: [
      "CMS",
      "página",
      "campo",
      "bloque",
      "borrador",
      "publicar",
      "programar",
      "Markdown",
      "historial",
    ],
    version: 2,
  },
  {
    id: "contenido-global",
    title: "Ajustes del sitio",
    area: "Configuración y seguridad",
    route: "/admin/contenido/paginas/global",
    summary:
      "Identidad global de marca, barra de anuncios, contacto oficial y punto de origen logístico (Superadmin).",
    purpose:
      "Centraliza los parámetros transversales que impactan todo Lucams Shop al mismo tiempo: logotipo del cabezal y panel, cintillo superior, canales oficiales de atención y dirección remitente de recogida usada por Aveonline al cotizar y emitir guías.",
    whenToUse: [
      "Para actualizar el logotipo oficial (estacional o permanente) desde Mediateca.",
      "Para cambiar el mensaje de la barra superior de anuncios en toda la tienda.",
      "Para verificar o actualizar ciudad, dirección y teléfono del punto de recogida logístico.",
    ],
    concepts: [
      {
        term: "Setting atómico",
        definition:
          "Parámetro global donde guardar aplica y publica inmediatamente tras renovar la caché transversal del sitio.",
      },
      {
        term: "Remitente logístico de origen",
        definition:
          "Datos físicos del taller/bodega desde donde Aveonline calcula tarifas y agenda recogidas.",
      },
    ],
    sections: [
      {
        id: "identidad-origen",
        title: "Identidad, anuncios y origen de despacho",
        summary: "Cada ajuste aquí repercute en todas las páginas públicas o en el checkout.",
        topics: [
          {
            id: "logo",
            label: "Logo y activos globales",
            description:
              "Controla la imagen de marca en el encabezado de tienda y en el sidebar administrativo.",
            interpretation:
              "Sube primero el archivo optimizado en Mediateca con texto alternativo claro y luego vincúlalo aquí.",
          },
          {
            id: "origen-pickup",
            label: "Datos de recogida logística",
            description:
              "Ciudad DANE, dirección física, contacto y teléfono usados por Aveonline en cotización y generación de guías.",
            caution:
              "Dejar incompleto o mal escrito el origen impide cotizar fletes nacionales en el checkout.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "actualizar-ajustes-globales",
        title: "Modificar un parámetro global con seguridad",
        goal: "Aplicar un cambio transversal validando su efecto en tienda y checkout.",
        route: "/admin/contenido/paginas/global",
        roles: ["SUPERADMIN"],
        steps: [
          "Confirma el alcance transversal del parámetro antes de editarlo.",
          "Si cambias una imagen o logo, cárgala primero en Mediateca y verifica su contraste sobre fondo claro y oscuro.",
          "Guarda con verificación MFA reciente si el sistema lo solicita.",
          "Abre la portada pública y, si tocaste datos logísticos, revisa el banner de estado en Envíos (/admin/envios).",
        ],
        expected:
          "El parámetro global queda actualizado en todo el sitio sin romper identidad visual ni cotización de envíos.",
      },
    ],
    cautions: [
      "Los cambios en Ajustes del sitio impactan de inmediato todas las rutas públicas y transaccionales.",
    ],
    dontTouch: [
      "Nunca borres ni dejes vacíos la ciudad o dirección de origen de despacho con la tienda operando.",
      "No escribas números de WhatsApp o correos no monitoreados en los datos globales de contacto.",
    ],
    checklist: [
      "Comprobé que los datos de origen logístico siguen completos en /admin/envios.",
      "Revisé la visualización real en portada móvil y escritorio tras guardar.",
    ],
    faqs: [
      {
        question: "¿Por qué un cambio en Ajustes del sitio afecta también al módulo Envíos?",
        answer:
          "Porque Aveonline lee desde aquí la ciudad y dirección remitente para cotizar fletes y programar recogidas.",
      },
    ],
    related: ["contenido", "mediateca", "envios", "integraciones"],
    relatedPlaybooks: ["playbook-pedido-web-300dpi"],
    keywords: [
      "ajustes",
      "global",
      "logo",
      "origen",
      "recogida",
      "anuncio",
      "barra superior",
      "identidad",
    ],
    version: 1,
  },
  {
    id: "mediateca",
    title: "Mediateca",
    area: "Contenido",
    route: "/admin/contenido/mediateca",
    summary:
      "Biblioteca centralizada de imágenes editoriales reutilizables con control de referencias y accesibilidad.",
    purpose:
      "Permite subir, catalogar con texto alternativo (`alt`) y reutilizar banners, portadas, logotipos e ilustraciones en múltiples campos de imagen del CMS sin duplicar archivos en almacenamiento.",
    whenToUse: [
      "Antes de asignar una imagen nueva en cualquier página del CMS o en Ajustes del sitio.",
      "Para corregir el texto alternativo (`alt`) de una imagen ya publicada.",
      "Para verificar en cuántos campos se está usando un recurso antes de reemplazarlo o borrarlo.",
    ],
    concepts: [
      {
        term: "Texto alternativo (alt)",
        definition:
          "Descripción breve y funcional leída por lectores de pantalla y motores de búsqueda; obligatoria por accesibilidad WCAG AA.",
      },
      {
        term: "Referencias activas",
        definition:
          "Campos del CMS que apuntan actualmente al recurso; eliminar o sustituir el medio impacta todas esas ubicaciones.",
      },
    ],
    sections: [
      {
        id: "biblioteca",
        title: "Carga, metadatos y reutilización",
        summary: "Administra peso, proporciones, accesibilidad y vínculos de cada archivo.",
        topics: [
          {
            id: "carga",
            label: "Subida de imágenes",
            description:
              "Registra archivos gráficos optimizados para web dentro del bucket editorial.",
            interpretation:
              "Prefiere formatos ligeros, buena nitidez y nombres legibles antes de subir.",
          },
          {
            id: "alt-a11y",
            label: "Descripción accesible",
            description:
              "Explica qué transmite la imagen sin empezar con muletillas como «imagen de» ni dejar el nombre de archivo crudo.",
            caution:
              "Un texto alternativo vacío o técnico puede romper las auditorías automáticas de accesibilidad.",
          },
          {
            id: "referencias",
            label: "Uso compartido",
            description: "Indica dónde está conectado el activo dentro del mapa CMS.",
            caution:
              "No borres un activo en uso sin antes reasignar los campos que dependen de él.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "subir-usar-medio",
        title: "Subir una imagen y conectarla a una página",
        goal: "Publicar recursos visuales rápidos, nítidos y accesibles.",
        route: "/admin/contenido/mediateca",
        steps: [
          "Sube el archivo en Mediateca verificando peso razonable y encuadre limpio.",
          "Completa un texto alternativo claro que describa el contenido real de la pieza.",
          "Abre la página correspondiente en Páginas del sitio y selecciona el activo en el campo de imagen.",
          "Revisa recorte y legibilidad en móvil y escritorio antes de publicar.",
        ],
        expected:
          "La imagen queda centralizada en Mediateca y se sirve optimizada en todas las secciones donde se asigne.",
      },
    ],
    cautions: [
      "Mediateca es para contenido editorial del CMS; las fotos de catálogo de productos se gestionan en Productos y los artes del Estudio en Diseños prediseñados.",
    ],
    dontTouch: [
      "No subas fotografías con datos personales de clientes reales sin autorización expresa documentada.",
      "No elimines imágenes vinculadas al logo o banners activos de portada sin reemplazarlas primero.",
    ],
    checklist: [
      "La imagen tiene buen peso, encuadre correcto y derechos de uso propios.",
      "Escribí un texto alternativo descriptivo (sin dejar el nombre del archivo).",
      "Comprobé que no afecta otras páginas antes de reemplazar o eliminar un activo existente.",
    ],
    faqs: [
      {
        question: "¿Aquí se suben las fotos de un producto o las plantillas del Estudio?",
        answer:
          "No. Las fotos de producto van dentro de cada ficha en /admin/productos y los recursos de personalización en /admin/disenos.",
      },
    ],
    related: ["contenido", "contenido-global", "productos", "disenos"],
    keywords: ["mediateca", "imágenes", "banners", "logo", "alt", "accesibilidad", "galería CMS"],
    version: 1,
  },
  {
    id: "email-templates",
    title: "Plantillas de correo",
    area: "Contenido",
    route: "/admin/email-templates",
    summary: `Personalización segura, filtro por familia y vista previa de las ${HELP_LIVE_NUMBERS.emailTemplateCount} plantillas React Email.`,
    purpose: `Permite buscar, previsualizar en escritorio/móvil y personalizar asunto, preheader y titular de las ${HELP_LIVE_NUMBERS.emailTemplateCount} plantillas transaccionales, B2B, alertas y Lifecycle registradas en código (adicionales a las ${HELP_LIVE_NUMBERS.authOtpTemplateCount} plantillas de Auth OTP en Supabase), más envío de prueba controlado a tu propio correo administrativo.`,
    whenToUse: [
      `Para ajustar asunto, preheader o titular de cualquiera de las ${HELP_LIVE_NUMBERS.emailTemplateCount} plantillas activas.`,
      "Para inspeccionar el render real en escritorio y móvil antes de tocar una automatización.",
      `Para enviarte un correo de prueba controlado (tope de ${HELP_LIVE_NUMBERS.emailTestHourlyLimit} pruebas por hora).`,
    ],
    concepts: [
      {
        term: "Plantilla base React Email",
        definition:
          "Componente versionado en código que garantiza diseño, variables seguras, enlaces transaccionales y pie legal.",
      },
      {
        term: "Override editorial",
        definition:
          "Sobrescritura guardada en base de datos únicamente sobre asunto, preheader o titular; puedes restaurar el valor base en cualquier momento.",
      },
      {
        term: "Preheader",
        definition:
          "Resumen corto que acompaña al asunto en la bandeja de entrada móvil y de escritorio.",
      },
    ],
    sections: [
      {
        id: "editor",
        title: "Edición de textos clave y vista previa aislada",
        summary: "Modifica el mensaje editorial sin comprometer datos dinámicos ni entregabilidad.",
        topics: [
          {
            id: "asunto",
            label: "Asunto y preheader",
            description:
              "Definen la apertura del mensaje; deben corresponder exactamente al evento disparado.",
            interpretation:
              "Evita mayúsculas sostenidas, signos excesivos o promesas comerciales en correos puramente transaccionales.",
          },
          {
            id: "variables",
            label: "Variables interpoladas",
            description:
              "Marcadores como número de pedido o nombre que el servidor reemplaza al enviar.",
            caution:
              "Respeta la escritura exacta de los marcadores existentes y valida siempre con los datos de muestra.",
          },
          {
            id: "prueba",
            label: "Envío de prueba al administrador",
            description: `Despacha una muestra real por Resend exclusivamente a tu correo de sesión (máximo ${HELP_LIVE_NUMBERS.emailTestHourlyLimit}/hora).`,
            interpretation:
              "Si la prueba falla, diagnostica Resend en Integraciones y Salud técnica en vez de pulsar repetidamente.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "editar-correo",
        title: "Personalizar y probar una plantilla de correo",
        goal: "Actualizar el tono del correo sin romper variables ni mezclar finalidad legal.",
        route: "/admin/email-templates",
        roles: ["SUPERADMIN"],
        steps: [
          "Filtra por familia (Pedidos, Posventa, B2B, Marketing/Lifecycle, Alertas) y abre la plantilla exacta del evento.",
          "Ajusta asunto, preheader o titular conservando intactos los marcadores dinámicos.",
          "Comprueba la vista previa renderizada tanto en ancho escritorio como en móvil.",
          "Guarda el cambio y usa Enviarme prueba para validar visualización real en tu cliente de correo.",
        ],
        expected:
          "Todos los envíos futuros de ese evento aplican de inmediato el nuevo encabezado manteniendo intacta su lógica y enlaces.",
      },
    ],
    cautions: [
      "No conviertas un correo transaccional (confirmación de pedido, retracto, garantía) en pieza publicitaria: violaría la finalidad de Ley 1581.",
    ],
    dontTouch: [
      "No alteres ni inventes marcadores dinámicos que no existan en el texto base de la plantilla.",
      "No prometas plazos distintos a los legales en las plantillas de Retractos, Garantías o Soporte.",
    ],
    checklist: [
      "Verifiqué a qué evento exacto del sistema pertenece la plantilla.",
      "Conservé las variables dinámicas y revisé el render móvil.",
      "Confirmé que el asunto respeta el carácter transaccional o comercial del correo.",
    ],
    subroutes: [
      {
        id: "email-template-detail",
        pattern: "/admin/email-templates/[id]",
        title: "Editor y vista previa de plantilla individual",
        summary:
          "Ajustas asunto, preheader y titular de una plantilla específica con previsualización en vivo y envío de prueba.",
        tips: [
          "Si quieres volver a la redacción original de fábrica, limpia el override para restaurar el texto base del código.",
          `Recuerda que el botón de prueba envía a tu propio correo y tiene límite de ${HELP_LIVE_NUMBERS.emailTestHourlyLimit} envíos por hora.`,
        ],
        highlightSectionIds: ["editor"],
        highlightProcedureIds: ["editar-correo"],
      },
    ],
    faqs: [
      {
        question: "¿Dónde se editan los dos correos de código OTP de inicio de sesión?",
        answer: `Esas ${HELP_LIVE_NUMBERS.authOtpTemplateCount} plantillas pertenecen al motor de autenticación de Supabase Auth y se gobiernan por configuración de infraestructura, no desde este listado.`,
      },
    ],
    related: ["contenido", "lifecycle", "carritos", "integraciones", "observability"],
    relatedPlaybooks: [
      "playbook-audiencias-carritos-lifecycle",
      "playbook-incidentes-seguridad-dian",
    ],
    keywords: [
      "correo",
      "plantillas",
      "asunto",
      "preheader",
      "Resend",
      "React Email",
      "transaccional",
    ],
    version: 2,
  },
  {
    id: "redirects",
    title: "Redirecciones SEO",
    area: "Contenido",
    route: "/admin/redirects",
    summary:
      "Reglas 301 (permanentes) y 302 (temporales) con protección de rutas críticas y contador de impactos.",
    purpose:
      "Evita errores 404 y preserva el posicionamiento en Google cuando cambia el slug de un producto, categoría u ocasión o cuando retiras una página antigua.",
    whenToUse: [
      "Al verificar la redirección automática creada tras cambiar un slug de catálogo.",
      "Para redirigir campañas impresas, códigos QR o enlaces antiguos hacia su nueva página.",
      "Para auditar impactos recibidos antes de limpiar reglas históricas.",
    ],
    concepts: [
      {
        term: "Redirección 301 vs 302",
        definition:
          "301 transfiere de forma permanente la autoridad SEO a la nueva URL; 302 indica un desvío temporal (ej. campaña estacional).",
      },
      {
        term: "Bucle o cadena de redirección",
        definition:
          "Cuando A apunta a B y B apunta a C (o de vuelta a A), degradando velocidad e indexación.",
      },
    ],
    sections: [
      {
        id: "regla",
        title: "Configuración y auditoría de reglas",
        summary: "Controla ruta origen, ruta destino, código HTTP e impactos.",
        topics: [
          {
            id: "origen",
            label: "Ruta de origen protegida",
            description:
              "Debe iniciar con `/` y corresponder a una URL retirada; el servidor bloquea prefijos reservados como `/admin`, `/api` o `/checkout`.",
            interpretation:
              "Nunca intentes redirigir una ruta viva de operación desde este módulo.",
          },
          {
            id: "destino",
            label: "Ruta de destino",
            description:
              "Apunta hacia una ruta interna existente (`/productos/...`); las URLs externas (`https://...`) están restringidas a Superadmin.",
            caution:
              "Comprueba primero que la página de destino cargue con código 200 antes de guardar.",
          },
          {
            id: "impactos",
            label: "Contador de impactos",
            description:
              "Muestra cuántas solicitudes reales han pasado por esa regla para saber si sigue teniendo tráfico externo.",
            interpretation:
              "No elimines reglas con impactos recientes provenientes de enlaces externos o buscadores.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "crear-redirect",
        title: "Registrar y comprobar una redirección sin cadenas",
        goal: "Conducir visitantes y buscadores en un único salto hacia el contenido vigente.",
        route: "/admin/redirects",
        steps: [
          "Abre primero la URL de destino en el sitio público para confirmar que existe y responde correctamente.",
          "Ingresa la ruta antigua con barra inicial (`/...`), el destino vigente y elige `301` (cambio definitivo) o `302` (temporal).",
          "Verifica que el destino elegido no sea a su vez origen de otra redirección.",
          "Guarda y prueba la URL antigua en una ventana privada comprobando que aterrice en un solo salto.",
        ],
        expected:
          "Los enlaces antiguos y resultados indexados llegan directo al nuevo contenido sin pasar por 404 ni bucles.",
      },
    ],
    cautions: [
      "Redirigir páginas retiradas masivamente hacia la portada (`/`) cuando no guardan relación temática es considerado soft-404 por buscadores; apunta siempre a la categoría o producto equivalente.",
    ],
    dontTouch: [
      "No borres redirecciones 301 de productos o categorías renombradas mientras sigan recibiendo impactos.",
      "No uses 301 para desvíos temporales de fin de semana: los navegadores y buscadores lo cachean agresivamente.",
    ],
    checklist: [
      "El destino abre en 200 OK y no redirige a otra ruta.",
      "Código 301 seleccionado para mudanza definitiva o 302 para campaña temporal.",
      "Enlace antiguo probado en navegador y aterrizando en el destino esperado.",
    ],
    faqs: [
      {
        question: "¿Si cambio el slug de un producto debo crear el 301 a mano?",
        answer:
          "Al cambiar el slug de un producto, categoría u ocasión existente el sistema registra el 301 automáticamente, pero conviene verificarlo aquí para evitar cadenas si ya lo habías renombrado antes.",
      },
    ],
    related: ["productos", "categorias", "ocasiones", "contenido"],
    relatedPlaybooks: ["playbook-catalogo-estudio-lanzamiento"],
    keywords: ["301", "302", "URL", "SEO", "slug", "enlace roto", "redirección", "404"],
    version: 2,
  },
];
