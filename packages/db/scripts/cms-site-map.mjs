/*
 * CMS v2 — SITE MAP declarativo.
 *
 * Fuente de verdad de la organización del contenido del sitio tal como la ve
 * una administradora NO técnica: PÁGINA → SECCIÓN → campos. Lo consume
 * `migrate-cms-v2.mjs` para crear la estructura en BD y asignar cada key
 * histórica (CmsBlock/SiteSetting) a su página/sección.
 *
 * Cómo se asignan las keys existentes:
 *   - Bloques (kind BLOCK): por PREFIJO de key (`prefixes`), primera
 *     coincidencia gana. Lo no mapeado cae en la página `otros`.
 *   - Settings (kind SETTING): por `settingCategories` (SettingCategory legacy).
 *
 * Campos NUEVOS (brechas de contenido): se declaran inline en `fields` de la
 * sección correspondiente; el migrador los crea con su valor por defecto y
 * versión v1 publicada (nunca pisa ediciones posteriores del admin).
 *
 * `icon` = nombre de icono lucide-react usado por el índice del admin.
 */

export const SITE_MAP = {
  pages: [
    {
      slug: "inicio",
      title: "Página principal",
      description: "Todo lo que se ve en la portada del sitio (/).",
      path: "/",
      icon: "Home",
      sortOrder: 10,
      sections: [
        {
          key: "hero",
          title: "Portada (hero)",
          description: "Titular, descripción y botones principales.",
          prefixes: ["home.hero."],
          sortOrder: 10,
          fields: [
            {
              key: "home.hero.cta-primary.href",
              kind: "SETTING",
              type: "URL",
              label: "Botón principal: destino",
              helpText: "A dónde lleva el botón principal de la portada («Ver catálogo»).",
              category: "HOME",
              body: "/productos",
              sortOrder: 10,
            },
            {
              key: "home.hero.cta-secondary.href",
              kind: "SETTING",
              type: "URL",
              label: "Botón secundario: destino",
              helpText: "A dónde lleva el segundo botón de la portada («Personalizar el mío»).",
              category: "HOME",
              body: "/productos?personalizable=1",
              sortOrder: 20,
            },
          ],
        },
        {
          key: "como-funciona",
          title: "Así de fácil (3 pasos)",
          prefixes: ["home.howitworks."],
          sortOrder: 20,
        },
        {
          key: "categorias",
          title: "Categorías",
          prefixes: ["home.categories."],
          sortOrder: 30,
          fields: [
            {
              key: "home.categories.cta-all",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón «ver todo»",
              helpText:
                "Aparece bajo la cuadrícula de categorías de la portada; lleva al catálogo completo.",
              category: "HOME",
              body: "Ver todas las categorías y productos →",
              sortOrder: 10,
            },
          ],
        },
        {
          key: "destacados",
          title: "Productos destacados",
          prefixes: ["home.featured."],
          sortOrder: 40,
          fields: [
            {
              key: "home.featured.cta-all",
              kind: "BLOCK",
              type: "TEXT",
              label: "Enlace «ver todo»",
              helpText:
                "Aparece a la derecha del título «Productos que están enamorando» en la portada.",
              category: "HOME",
              body: "Ver todo →",
              sortOrder: 10,
            },
          ],
        },
        {
          key: "resenas",
          title: "Reseñas de clientes",
          prefixes: ["home.reviews."],
          sortOrder: 50,
          fields: [
            {
              key: "home.reviews.empty-note",
              kind: "BLOCK",
              type: "TEXT",
              label: "Nota cuando no hay reseñas",
              helpText:
                "Aparece en la portada, bajo el mensaje principal, cuando aún no hay reseñas publicadas.",
              category: "HOME",
              body: "Cuando los primeros clientes reseñen, aparecerán acá.",
              sortOrder: 10,
            },
          ],
        },
        {
          key: "cta-final",
          title: "Llamado final",
          prefixes: ["home.cta."],
          sortOrder: 60,
          fields: [
            {
              key: "home.cta.whatsapp-label",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón de WhatsApp",
              helpText:
                "Texto del botón de WhatsApp en la sección final de la portada («¿Tienes una idea distinta?»).",
              category: "HOME",
              body: "Háblanos por WhatsApp",
              sortOrder: 10,
            },
            {
              key: "home.cta.catalog-label",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón de catálogo",
              helpText: "Texto del botón que lleva al catálogo en la sección final de la portada.",
              category: "HOME",
              body: "Ver catálogo",
              sortOrder: 20,
            },
          ],
        },
      ],
    },
    {
      slug: "header",
      title: "Encabezado del sitio",
      description: "Menú superior y navegación (visible en todas las páginas).",
      path: "/",
      icon: "PanelTop",
      sortOrder: 20,
      sections: [
        {
          key: "menu",
          title: "Menú y navegación",
          prefixes: ["header."],
          sortOrder: 10,
          fields: [
            {
              key: "header.menu.catalog",
              kind: "BLOCK",
              type: "TEXT",
              label: "Palabra «Catálogo»",
              helpText:
                "Aparece en el menú superior (abre el mega-menú) y como título del menú en celular.",
              category: "HOME",
              body: "Catálogo",
              sortOrder: 10,
            },
            {
              key: "header.menu.help-cta",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón «¿Te ayudamos a elegir?»",
              helpText:
                "Aparece en el menú superior (computador) y al final del menú en celular; lleva al recomendador.",
              category: "HOME",
              body: "¿Te ayudamos a elegir?",
              sortOrder: 20,
            },
            {
              key: "header.menu.occasions-title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título «Por ocasión»",
              helpText: "Título de la fila de ocasiones dentro del menú de catálogo.",
              category: "HOME",
              body: "Por ocasión",
              sortOrder: 30,
            },
            {
              key: "header.menu.view-all",
              kind: "BLOCK",
              type: "TEXT",
              label: "Enlace «Ver todo el catálogo»",
              helpText: "Aparece al final del menú de catálogo en computador.",
              category: "HOME",
              body: "Ver todo el catálogo →",
              sortOrder: 40,
            },
            {
              key: "header.menu.account",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título «Tu cuenta»",
              helpText: "Título de la sección de cuenta al final del menú en celular.",
              category: "HOME",
              body: "Tu cuenta",
              sortOrder: 50,
            },
            {
              key: "header.menu.login",
              kind: "BLOCK",
              type: "TEXT",
              label: "Enlace «Ingresar»",
              helpText:
                "Aparece en el menú superior y en el menú en celular cuando el cliente no ha iniciado sesión.",
              category: "HOME",
              body: "Ingresar",
              sortOrder: 60,
            },
            {
              key: "header.menu.signup",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón «Crear cuenta»",
              helpText:
                "Aparece en el menú superior y en el menú en celular cuando el cliente no ha iniciado sesión.",
              category: "HOME",
              body: "Crear cuenta",
              sortOrder: 70,
            },
            {
              key: "header.menu.logout",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón «Salir»",
              helpText:
                "Aparece en el menú superior cuando el cliente ya inició sesión (cierra la sesión).",
              category: "HOME",
              body: "Salir",
              sortOrder: 80,
            },
            {
              key: "header.menu.occasion.cumpleanos",
              kind: "BLOCK",
              type: "TEXT",
              label: "Ocasión: Cumpleaños",
              helpText:
                "Chip de la fila «Por ocasión» en el menú de catálogo; enlaza a /ocasion/cumpleanos.",
              category: "HOME",
              body: "Cumpleaños",
              sortOrder: 90,
            },
            {
              key: "header.menu.occasion.matrimonio",
              kind: "BLOCK",
              type: "TEXT",
              label: "Ocasión: Matrimonio",
              helpText:
                "Chip de la fila «Por ocasión» en el menú de catálogo; enlaza a /ocasion/matrimonio.",
              category: "HOME",
              body: "Matrimonio",
              sortOrder: 100,
            },
            {
              key: "header.menu.occasion.dia-madre",
              kind: "BLOCK",
              type: "TEXT",
              label: "Ocasión: Día Madre",
              helpText:
                "Chip de la fila «Por ocasión» en el menú de catálogo; enlaza a /ocasion/dia-madre.",
              category: "HOME",
              body: "Día Madre",
              sortOrder: 110,
            },
            {
              key: "header.menu.occasion.dia-padre",
              kind: "BLOCK",
              type: "TEXT",
              label: "Ocasión: Día Padre",
              helpText:
                "Chip de la fila «Por ocasión» en el menú de catálogo; enlaza a /ocasion/dia-padre.",
              category: "HOME",
              body: "Día Padre",
              sortOrder: 120,
            },
            {
              key: "header.menu.occasion.navidad",
              kind: "BLOCK",
              type: "TEXT",
              label: "Ocasión: Navidad",
              helpText:
                "Chip de la fila «Por ocasión» en el menú de catálogo; enlaza a /ocasion/navidad.",
              category: "HOME",
              body: "Navidad",
              sortOrder: 130,
            },
            {
              key: "header.menu.occasion.empresarial",
              kind: "BLOCK",
              type: "TEXT",
              label: "Ocasión: Empresarial",
              helpText:
                "Chip de la fila «Por ocasión» en el menú de catálogo; enlaza a /ocasion/empresarial.",
              category: "HOME",
              body: "Empresarial",
              sortOrder: 140,
            },
            {
              key: "header.menu.help-chip",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón de ayuda (chip, computador)",
              helpText:
                "Chip dentro del menú de catálogo en computador, junto a la fila «Por ocasión»; lleva al recomendador.",
              category: "HOME",
              body: "¿Te ayudamos?",
              sortOrder: 150,
            },
            {
              key: "header.menu.view-all-mobile",
              kind: "BLOCK",
              type: "TEXT",
              label: "'Ver todo el catálogo' (móvil)",
              helpText: "Aparece al final del menú en celular; enlaza a /productos.",
              category: "HOME",
              body: "Ver todo el catálogo",
              sortOrder: 160,
            },
            {
              key: "header.menu.account-mobile",
              kind: "BLOCK",
              type: "TEXT",
              label: "'Mi cuenta' (móvil)",
              helpText:
                "Aparece en la sección «Tu cuenta» del menú en celular cuando el cliente ya inició sesión; enlaza a /mi-cuenta.",
              category: "HOME",
              body: "Mi cuenta",
              sortOrder: 170,
            },
          ],
        },
      ],
    },
    {
      slug: "footer",
      title: "Pie de página",
      description: "Columnas de enlaces, newsletter y línea legal (visible en todas las páginas).",
      path: "/",
      icon: "PanelBottom",
      sortOrder: 30,
      sections: [
        {
          key: "general",
          title: "Contenido del pie de página",
          prefixes: ["footer."],
          sortOrder: 10,
          fields: [
            {
              key: "footer.help.cta",
              kind: "BLOCK",
              type: "TEXT",
              label: "Enlace «Centro de ayuda»",
              helpText:
                "Aparece en la columna «Atención cliente» del pie de página (en todas las páginas).",
              category: "FOOTER",
              body: "Centro de ayuda →",
              sortOrder: 10,
            },
            {
              key: "footer.contact.cta",
              kind: "BLOCK",
              type: "TEXT",
              label: "Enlace «Contacto»",
              helpText:
                "Aparece en la columna «Atención cliente» del pie de página (en todas las páginas).",
              category: "FOOTER",
              body: "Contacto →",
              sortOrder: 20,
            },
            {
              key: "footer.track.cta",
              kind: "BLOCK",
              type: "TEXT",
              label: "Enlace «Rastrear pedido»",
              helpText:
                "Aparece en la columna «Atención cliente» del pie de página (en todas las páginas).",
              category: "FOOTER",
              body: "Rastrear pedido →",
              sortOrder: 30,
            },
            {
              key: "footer.legal.links",
              kind: "BLOCK",
              type: "JSON",
              label: "Enlaces legales",
              helpText:
                "Los enlaces de la columna «Información» del pie de página. Se editan como una lista: texto y ruta por enlace, sin ver código.",
              category: "FOOTER",
              // Campo LISTA (roadmap B4): el admin lo edita como filas
              // (texto + ruta) en vez de JSON crudo. El service serializa
              // la lista a JSON y ese JSON sigue siendo el body público.
              metadata: {
                listSchema: [
                  { name: "label", type: "TEXT", label: "Texto del enlace" },
                  { name: "href", type: "URL", label: "Ruta o URL" },
                ],
              },
              body: `[
  {
    "label": "Aviso de Privacidad",
    "href": "/legal/privacidad"
  },
  {
    "label": "Términos y Condiciones",
    "href": "/legal/terminos"
  },
  {
    "label": "Política de Cookies",
    "href": "/legal/cookies"
  },
  {
    "label": "Devoluciones y Retracto",
    "href": "/legal/devoluciones"
  },
  {
    "label": "Garantías",
    "href": "/legal/garantias"
  },
  {
    "label": "Hábeas Data",
    "href": "/legal/habeas-data"
  },
  {
    "label": "Subprocesadores",
    "href": "/legal/subprocesadores"
  },
  {
    "label": "Seguridad",
    "href": "/legal/security"
  }
]`,
              sortOrder: 40,
            },
            {
              key: "footer.legal.sic-label",
              kind: "BLOCK",
              type: "TEXT",
              label: "Texto del enlace a la SIC",
              helpText:
                "Aparece en la línea legal al final del pie de página; enlaza a la Superintendencia de Industria y Comercio (sic.gov.co).",
              category: "FOOTER",
              body: "SIC (protección al consumidor)",
              sortOrder: 50,
            },
          ],
        },
      ],
    },
    {
      slug: "contacto",
      title: "Contacto",
      description: "Página /contacto: tarjetas de WhatsApp, email y horario, y formulario.",
      path: "/contacto",
      icon: "Mail",
      sortOrder: 40,
      sections: [
        {
          key: "principal",
          title: "Contenido",
          prefixes: ["support.contacto."],
          sortOrder: 10,
          fields: [
            {
              key: "support.contacto.wa-card-title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Tarjeta de WhatsApp: título",
              helpText: "Título de la tarjeta verde de WhatsApp en la página /contacto.",
              category: "SUPPORT",
              body: "WhatsApp",
              sortOrder: 10,
            },
            {
              key: "support.contacto.email-card-title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Tarjeta de Email: título",
              helpText: "Título de la tarjeta de correo electrónico en la página /contacto.",
              category: "SUPPORT",
              body: "Email",
              sortOrder: 20,
            },
            {
              key: "support.contacto.hours-card-title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Tarjeta de Horario: título",
              helpText: "Título de la tarjeta de horario de atención en la página /contacto.",
              category: "SUPPORT",
              body: "Horario",
              sortOrder: 30,
            },
            {
              key: "support.contacto.wa-cta",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón de WhatsApp",
              helpText: "Texto del botón verde dentro de la tarjeta de WhatsApp en /contacto.",
              category: "SUPPORT",
              body: "Háblanos por WhatsApp →",
              sortOrder: 40,
            },
            {
              key: "support.contacto.faq-block",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Bloque «¿Preguntas comunes?»",
              helpText:
                "Aparece al final de la columna izquierda de /contacto. Formato Markdown (admite enlaces).",
              category: "SUPPORT",
              body: `## ¿Preguntas comunes?

Antes de escribir, revisa el [Centro de ayuda](/ayuda) — quizás ya está respondida.`,
              sortOrder: 50,
            },
          ],
        },
      ],
    },
    {
      slug: "ayuda",
      title: "Centro de ayuda",
      description: "Página /ayuda: encabezado y preguntas frecuentes.",
      path: "/ayuda",
      icon: "HelpCircle",
      sortOrder: 50,
      sections: [
        {
          key: "encabezado",
          title: "Encabezado y llamado final",
          prefixes: ["support.help."],
          sortOrder: 10,
        },
        {
          key: "faq",
          title: "Preguntas frecuentes",
          description: "Cada pregunta es un campo Markdown con la respuesta.",
          prefixes: ["faq."],
          sortOrder: 20,
        },
      ],
    },
    {
      slug: "checkout",
      title: "Checkout",
      description: "Textos de los pasos de envío y pago.",
      path: "/checkout/envio",
      icon: "CreditCard",
      sortOrder: 60,
      sections: [{ key: "general", title: "Envío y pago", prefixes: ["checkout."], sortOrder: 10 }],
    },
    {
      slug: "producto",
      title: "Página de producto",
      description: "Textos de la ficha de producto (PDP).",
      path: "/productos",
      icon: "Package",
      sortOrder: 70,
      sections: [{ key: "general", title: "Textos", prefixes: ["pdp."], sortOrder: 10 }],
    },
    {
      slug: "carrito",
      title: "Carrito",
      description: "Página /carrito y sus estados.",
      path: "/carrito",
      icon: "ShoppingCart",
      sortOrder: 80,
      sections: [{ key: "general", title: "Estados y textos", prefixes: ["cart."], sortOrder: 10 }],
    },
    {
      slug: "mi-cuenta",
      title: "Mi cuenta",
      description: "Textos del área de cliente (pedidos, estados vacíos).",
      path: "/mi-cuenta",
      icon: "User",
      sortOrder: 90,
      sections: [
        { key: "general", title: "Pedidos y cuenta", prefixes: ["account."], sortOrder: 10 },
      ],
    },
    {
      slug: "legales",
      title: "Textos legales",
      description: "Las 8 páginas /legal/* (privacidad, términos, cookies…).",
      path: "/legal/terminos",
      icon: "Scale",
      sortOrder: 100,
      sections: [{ key: "general", title: "Páginas legales", prefixes: ["legal."], sortOrder: 10 }],
    },
    {
      slug: "emails",
      title: "Correos automáticos",
      description: "Textos de las plantillas de correo transaccional.",
      icon: "MailOpen",
      sortOrder: 110,
      sections: [
        { key: "general", title: "Plantillas de correo", prefixes: ["email."], sortOrder: 10 },
      ],
    },
    {
      slug: "errores",
      title: "Errores y estados",
      description: "Páginas de error (404/500), buscador y página de estado.",
      path: "/status",
      icon: "AlertTriangle",
      sortOrder: 120,
      sections: [
        { key: "errores", title: "Páginas de error", prefixes: ["error."], sortOrder: 10 },
        { key: "busqueda", title: "Buscador", prefixes: ["search."], sortOrder: 20 },
        { key: "estado", title: "Estado del sitio", prefixes: ["status."], sortOrder: 30 },
      ],
    },
    {
      slug: "mantenimiento",
      title: "Mantenimiento",
      description: "Página mostrada cuando el sitio está en mantenimiento.",
      path: "/maintenance",
      icon: "Wrench",
      sortOrder: 130,
      sections: [
        { key: "general", title: "Mantenimiento", prefixes: ["maintenance."], sortOrder: 10 },
      ],
    },
    {
      slug: "seo",
      title: "SEO",
      description: "Títulos y descripciones que aparecen en Google, por página.",
      icon: "Search",
      sortOrder: 140,
      sections: [
        { key: "paginas", title: "Títulos y descripciones", prefixes: ["seo."], sortOrder: 10 },
      ],
    },
    {
      slug: "cotizacion",
      title: "Cotización confirmada",
      description:
        "Página que ve el cliente cuando su cotización está lista (/cotizacion/[token]).",
      icon: "FileText",
      sortOrder: 150,
      sections: [
        {
          key: "confirmacion",
          title: "Confirmación",
          prefixes: ["quote.confirmation."],
          sortOrder: 10,
          fields: [
            {
              key: "quote.confirmation.title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título de confirmación",
              helpText:
                "Título grande de la página de cotización confirmada. {nombre} se reemplaza por el primer nombre del cliente.",
              category: "SUPPORT",
              body: "¡Listo, {nombre}! Tu cotización está lista ✨",
              sortOrder: 10,
            },
            {
              key: "quote.confirmation.subtitle",
              kind: "BLOCK",
              type: "TEXTAREA",
              label: "Subtítulo (coordinación por WhatsApp)",
              helpText:
                "Aparece bajo el título. {ciudad} se reemplaza por « en Ciudad, Depto» cuando el cliente la indicó; si no, queda vacío.",
              category: "SUPPORT",
              body: "Te contactamos por WhatsApp para concretar precio, pago y entrega{ciudad}. ¿Quieres ir más rápido? Mándanos la cotización por aquí:",
              sortOrder: 20,
            },
            {
              key: "quote.confirmation.quote-label",
              kind: "BLOCK",
              type: "TEXT",
              label: "Rótulo del número",
              helpText: "Aparece junto al número de la cotización (COT-XXXXXX).",
              category: "SUPPORT",
              body: "Cotización",
              sortOrder: 30,
            },
            {
              key: "quote.confirmation.items-heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título de la lista de productos",
              helpText: "Encabeza la lista de productos cotizados.",
              category: "SUPPORT",
              body: "Esto es lo que cotizaste",
              sortOrder: 40,
            },
            {
              key: "quote.confirmation.total-label",
              kind: "BLOCK",
              type: "TEXT",
              label: "Rótulo del total",
              helpText: "Aparece junto al valor total de la cotización.",
              category: "SUPPORT",
              body: "Total",
              sortOrder: 50,
            },
            {
              key: "quote.confirmation.prices-note",
              kind: "BLOCK",
              type: "TEXT",
              label: "Nota bajo el total",
              helpText: "Aclaración pequeña bajo el total de la cotización.",
              category: "SUPPORT",
              body: "Precios en pesos colombianos (COP) · el envío se coordina por WhatsApp al confirmar tu cotización",
              sortOrder: 60,
            },
            {
              key: "quote.confirmation.wa-cta",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón principal de WhatsApp",
              helpText: "Botón verde que abre WhatsApp con el mensaje de la cotización ya listo.",
              category: "SUPPORT",
              body: "Enviar cotización por WhatsApp",
              sortOrder: 70,
            },
            {
              key: "quote.confirmation.wa-note",
              kind: "BLOCK",
              type: "TEXT",
              label: "Nota bajo el botón de WhatsApp",
              helpText: "Texto pequeño que explica qué pasa al pulsar el botón de WhatsApp.",
              category: "SUPPORT",
              body: "Se abre WhatsApp con el mensaje ya listo (número de cotización, productos, total y link) — solo dale enviar.",
              sortOrder: 80,
            },
            {
              key: "quote.confirmation.keep-browsing",
              kind: "BLOCK",
              type: "TEXT",
              label: "Enlace «seguir explorando»",
              helpText: "Enlace para volver al catálogo desde la confirmación.",
              category: "SUPPORT",
              body: "← Seguir explorando",
              sortOrder: 90,
            },
            {
              key: "quote.confirmation.cart-note",
              kind: "BLOCK",
              type: "TEXT",
              label: "Nota sobre el carrito",
              helpText:
                "Aclaración al final de la página: el carrito quedó vacío al crear la cotización.",
              category: "SUPPORT",
              body: "Tu carrito quedó vacío al crear la cotización — puedes armar otra cuando quieras.",
              sortOrder: 100,
            },
            {
              key: "quote.confirmation.meta-title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título de la pestaña (SEO)",
              helpText:
                "Título que muestra la pestaña del navegador en la página de cotización confirmada. La página no se indexa en Google (noindex).",
              category: "SUPPORT",
              body: "Tu cotización · Lucams",
              sortOrder: 110,
            },
          ],
        },
      ],
    },
    {
      slug: "global",
      title: "Ajustes del sitio",
      description:
        "Valores globales: contacto, redes sociales, WhatsApp, negocio y enlaces externos.",
      icon: "Settings",
      sortOrder: 160,
      sections: [
        { key: "contacto", title: "Contacto", settingCategories: ["CONTACT"], sortOrder: 10 },
        {
          key: "redes-sociales",
          title: "Redes sociales",
          settingCategories: ["SOCIAL"],
          sortOrder: 20,
          fields: [
            {
              key: "SOCIAL_FACEBOOK_URL",
              kind: "SETTING",
              type: "URL",
              label: "URL de Facebook",
              helpText: "Enlace del ícono de Facebook en el pie de página (en todas las páginas).",
              category: "SOCIAL",
              body: "https://www.facebook.com/lucamsshop",
              sortOrder: 10,
            },
            {
              key: "SOCIAL_INSTAGRAM_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Mostrar Instagram",
              helpText: "Muestra u oculta el ícono de Instagram en el pie de página.",
              category: "SOCIAL",
              body: "true",
              sortOrder: 20,
            },
            {
              key: "SOCIAL_TIKTOK_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Mostrar TikTok",
              helpText: "Muestra u oculta el ícono de TikTok en el pie de página.",
              category: "SOCIAL",
              body: "true",
              sortOrder: 30,
            },
            {
              key: "SOCIAL_FACEBOOK_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Mostrar Facebook",
              helpText: "Muestra u oculta el ícono de Facebook en el pie de página.",
              category: "SOCIAL",
              body: "true",
              sortOrder: 40,
            },
          ],
        },
        {
          key: "whatsapp",
          title: "WhatsApp",
          settingCategories: ["WHATSAPP"],
          sortOrder: 30,
          fields: [
            {
              key: "WA_NUMBER",
              kind: "SETTING",
              type: "PHONE",
              label: "Número de WhatsApp",
              helpText:
                "Se usa en todos los botones de WhatsApp del sitio. Formato wa.me: código país + número, sin + ni espacios.",
              category: "WHATSAPP",
              body: "573208873826",
              sortOrder: 10,
            },
            {
              key: "WA_MSG_QUOTE",
              kind: "SETTING",
              type: "TEXTAREA",
              label: "Mensaje de cotización",
              helpText:
                "Mensaje que se abre en WhatsApp cuando el cliente envía su cotización. Variables: {customerName}, {quoteNumber}, {itemsSummary}, {total}, {quoteUrl}.",
              category: "WHATSAPP",
              body: `Hola Lucams 👋 Soy *{customerName}*.

Acabo de hacer la cotización *{quoteNumber}* en la tienda:

{itemsSummary}

*Total: {total}*

_Ver el detalle:_ {quoteUrl}

Quedo atento/a para concretar 🙌`,
              sortOrder: 20,
            },
          ],
        },
        { key: "negocio", title: "Negocio", settingCategories: ["BUSINESS"], sortOrder: 40 },
        { key: "comercio", title: "Comercio", settingCategories: ["COMMERCE"], sortOrder: 50 },
        { key: "legal", title: "Legal", settingCategories: ["LEGAL"], sortOrder: 60 },
        { key: "copyright", title: "Copyright", settingCategories: ["COPYRIGHT"], sortOrder: 70 },
        { key: "seo", title: "SEO", settingCategories: ["SEO"], sortOrder: 80 },
        {
          key: "externos",
          title: "Enlaces externos",
          settingCategories: ["EXTERNAL"],
          sortOrder: 90,
        },
      ],
    },
    {
      slug: "otros",
      title: "Otros textos",
      description: "Campos que no corresponden a ninguna página del mapa (revisar y reubicar).",
      icon: "MoreHorizontal",
      sortOrder: 999,
      sections: [{ key: "general", title: "Sin clasificar", sortOrder: 10 }],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Resolutores de sección (usados por migrate-cms-v2.mjs y por el seed de
// campos nuevos). Devuelven { pageSlug, sectionKey }.
// ─────────────────────────────────────────────────────────────────────────────

const OTROS = { pageSlug: "otros", sectionKey: "general" };

/** Bloque: primera sección cuyo prefijo matchee la key. */
export function resolveBlockSection(key) {
  for (const page of SITE_MAP.pages) {
    for (const section of page.sections) {
      if (section.prefixes?.some((p) => key.startsWith(p))) {
        return { pageSlug: page.slug, sectionKey: section.key };
      }
    }
  }
  return OTROS;
}

/** Setting: sección cuya lista de categorías legacy incluya la categoría. */
export function resolveSettingSection(category) {
  for (const page of SITE_MAP.pages) {
    for (const section of page.sections) {
      if (section.settingCategories?.includes(category)) {
        return { pageSlug: page.slug, sectionKey: section.key };
      }
    }
  }
  return OTROS;
}
