/*
 * CMS v2 — SITE MAP declarativo canónico (Arquitectura de 3 capas).
 *
 * Fuente única de verdad de la estructura del CMS v2:
 *   PÁGINA → SECCIÓN → campos (9 contenedores: 8 en /admin/contenido +
 *   «Ajustes del sitio» en Configuración; 166 campos reales).
 *
 * Qué entra acá (Capa 1 + Capa 2):
 *   - Capa 1 (kind SETTING): parámetros maestros de negocio, contacto, envíos,
 *     fidelización, recuperación de carritos, WhatsApp, redes y versión legal.
 *   - Capa 2 (kind BLOCK): contenido editorial, comercial, FAQs, los 8
 *     documentos legales (leídos desde packages/db/legal-content/*.md sin
 *     duplicar prosa) y el SEO de páginas públicas indexables.
 *
 * Qué NO entra acá (Capa 3 — código tipado):
 *   - Botones genéricos, aria-label, placeholders, mensajes de validación y
 *     micro-interfaz del Estudio (studio-texts.ts), Auth (auth-texts.ts),
 *     Checkout y Mi Cuenta.
 *
 * El test `apps/web/lib/cms-sitemap-parity.test.ts` verifica en CI que el 100 %
 * de las claves leídas en `apps/web` existan en este mapa y que ningún campo
 * declarado aquí quede huérfano sin lector en `apps/web`.
 *
 * `icon` = nombre de icono lucide-react resuelto en
 * `apps/web/app/admin/(panel)/contenido/page-icons.ts`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEGAL_DIR = join(HERE, "..", "legal-content");

function readLegalMarkdown(slug) {
  return readFileSync(join(LEGAL_DIR, `legal.${slug}.md`), "utf-8").trim();
}

const DEFAULT_FOOTER_LEGAL_LINKS = [
  { label: "Aviso de Privacidad", href: "/legal/privacidad" },
  { label: "Términos y Condiciones", href: "/legal/terminos" },
  { label: "Política de Cookies", href: "/legal/cookies" },
  { label: "Devoluciones y Retracto", href: "/legal/devoluciones" },
  { label: "Garantías", href: "/legal/garantias" },
  { label: "Hábeas Data", href: "/legal/habeas-data" },
  { label: "Subprocesadores", href: "/legal/subprocesadores" },
  { label: "Seguridad", href: "/legal/security" },
];

export const SITE_MAP = {
  pages: [
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Página principal (/) — 35 campos
    // ─────────────────────────────────────────────────────────────────────────
    {
      slug: "inicio",
      title: "Página principal",
      description: "Portada, banners promocionales, pasos, categorías, destacados y reseñas (/).",
      path: "/",
      icon: "Home",
      sortOrder: 10,
      sections: [
        {
          key: "hero",
          title: "Portada (hero)",
          description: "Titular, descripción, botones principales y chips informativos.",
          prefixes: ["home.hero."],
          sortOrder: 10,
          fields: [
            {
              key: "home.hero.badge",
              kind: "BLOCK",
              type: "TEXT",
              label: "Badge sobre el título",
              helpText: "Aparece arriba del título principal de la portada.",
              category: "HOME",
              body: "✨ Hecho a mano en Bogotá",
              sortOrder: 10,
            },
            {
              key: "home.hero.title-prefix",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Título principal (parte 1)",
              helpText: "Primera parte del titular grande de la portada.",
              category: "HOME",
              body: "Tus recuerdos, ",
              sortOrder: 20,
            },
            {
              key: "home.hero.title-accent",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Título principal (acento rosa)",
              helpText: "Segunda parte del titular grande de la portada, resaltada en rosa.",
              category: "HOME",
              body: "en imán",
              sortOrder: 30,
            },
            {
              key: "home.hero.description",
              kind: "BLOCK",
              type: "TEXT",
              label: "Descripción bajo el título",
              helpText:
                "Párrafo principal de la portada. Admite el token {{cobertura}} (destinos en Ajustes del sitio).",
              category: "HOME",
              body: "Foto-imanes, recuerdos para eventos, calendarios, marcapáginas y planners magnéticos personalizables. Entrega a {{cobertura}} destinos de Colombia.",
              sortOrder: 40,
            },
            {
              key: "home.hero.cta-primary",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón principal: texto",
              helpText: "Texto del botón morado principal de la portada.",
              category: "HOME",
              body: "Ver catálogo →",
              sortOrder: 50,
            },
            {
              key: "home.hero.cta-primary.href",
              kind: "SETTING",
              type: "URL",
              label: "Botón principal: destino",
              helpText: "A dónde lleva el botón principal de la portada («Ver catálogo»).",
              category: "HOME",
              body: "/productos",
              sortOrder: 60,
            },
            {
              key: "home.hero.cta-secondary",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón secundario: texto",
              helpText: "Texto del segundo botón de la portada.",
              category: "HOME",
              body: "Personalizar el mío",
              sortOrder: 70,
            },
            {
              key: "home.hero.cta-secondary.href",
              kind: "SETTING",
              type: "URL",
              label: "Botón secundario: destino",
              helpText: "A dónde lleva el segundo botón de la portada («Personalizar el mío»).",
              category: "HOME",
              body: "/productos?personalizable=1",
              sortOrder: 80,
            },
            {
              key: "home.hero.chip-studio",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Chip: Estudio en vivo",
              helpText: "Pastilla informativa bajo los botones de la portada.",
              category: "HOME",
              body: "Estudio de diseño en vivo ✨",
              sortOrder: 90,
            },
            {
              key: "home.hero.chip-cod",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Chip: contraentrega",
              helpText:
                "Pastilla de contraentrega (solo se muestra cuando COD_ENABLED está activo en Ajustes del sitio).",
              category: "HOME",
              body: "Pago contraentrega disponible",
              sortOrder: 100,
            },
            {
              key: "home.hero.chip-eta",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Chip: promesa de preparación y tránsito",
              helpText:
                "Pastilla amarilla con los tiempos estimados. {{fab}} y {{entrega}} se rellenan desde Ajustes del sitio.",
              category: "HOME",
              body: "Preparación estimada: alrededor de {{fab}} días hábiles · tránsito estimado: ~{{entrega}} días después del despacho",
              sortOrder: 110,
            },
          ],
        },
        {
          key: "banners",
          title: "Banners / promos",
          description:
            "Franja promocional bajo la portada (solo aparece si hay al menos un banner activo).",
          prefixes: ["home.banners"],
          sortOrder: 15,
          fields: [
            {
              key: "home.banners",
              kind: "BLOCK",
              type: "JSON",
              label: "Banners de la portada",
              helpText:
                "Promos y campañas de la portada. Cada banner tiene imagen (de la mediateca), título, enlace y estado activo. Lista vacía = la franja no se muestra.",
              category: "MARKETING",
              metadata: {
                listSchema: [
                  { name: "imagen", type: "IMAGE", label: "Imagen (de la mediateca)" },
                  { name: "titulo", type: "TEXT", label: "Título" },
                  { name: "enlace", type: "URL", label: "Enlace (ruta o URL)" },
                  { name: "activo", type: "BOOLEAN", label: "Activo (Sí/No)" },
                ],
              },
              body: "[]",
              sortOrder: 10,
            },
          ],
        },
        {
          key: "como-funciona",
          title: "Así de fácil (3 pasos)",
          description: "Explicación del flujo de compra en 3 pasos.",
          prefixes: ["home.howitworks."],
          sortOrder: 20,
          fields: [
            {
              key: "home.howitworks.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Encabezado de la sección",
              helpText: "Título sobre las 3 tarjetas de pasos en la portada.",
              category: "HOME",
              body: "Así de fácil",
              sortOrder: 10,
            },
            {
              key: "home.howitworks.subtext",
              kind: "BLOCK",
              type: "TEXT",
              label: "Subtítulo de la sección",
              helpText: "Texto breve bajo el título «Así de fácil».",
              category: "HOME",
              body: "Tu producto hecho con cariño en 3 pasos.",
              sortOrder: 20,
            },
            {
              key: "home.howitworks.step1.title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Paso 1: título",
              category: "HOME",
              body: "Eliges",
              sortOrder: 30,
            },
            {
              key: "home.howitworks.step1.description",
              kind: "BLOCK",
              type: "TEXT",
              label: "Paso 1: descripción",
              category: "HOME",
              body: "Eliges el formato que más te guste en nuestro catálogo. Hay opciones para fotos, eventos, organización y más.",
              sortOrder: 40,
            },
            {
              key: "home.howitworks.step2.title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Paso 2: título",
              category: "HOME",
              body: "Personalizas",
              sortOrder: 50,
            },
            {
              key: "home.howitworks.step2.description",
              kind: "BLOCK",
              type: "TEXT",
              label: "Paso 2: descripción",
              category: "HOME",
              body: "Diseñas tu producto en vivo en nuestro Estudio: subes fotos, agregas texto y plantillas, y lo ves con vista previa 3D. ¡Sin salir del sitio!",
              sortOrder: 60,
            },
            {
              key: "home.howitworks.step3.title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Paso 3: título",
              category: "HOME",
              body: "Llega a tus manos",
              sortOrder: 70,
            },
            {
              key: "home.howitworks.step3.description",
              kind: "BLOCK",
              type: "TEXT",
              label: "Paso 3: descripción",
              helpText:
                "Admite {{fab}} y {{entrega}}. Si COD_ENABLED está apagado, la mención a contraentrega se recorta sola.",
              category: "HOME",
              body: "La preparación toma alrededor de {{fab}} días hábiles antes del despacho; desde ahí, el tránsito estimado es de ~{{entrega}} días según tu ciudad. Pagas en línea de forma segura — contraentrega disponible.",
              sortOrder: 80,
            },
          ],
        },
        {
          key: "categorias",
          title: "Categorías",
          prefixes: ["home.categories."],
          sortOrder: 30,
          fields: [
            {
              key: "home.categories.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Encabezado de categorías",
              category: "HOME",
              body: "Explora las categorías",
              sortOrder: 10,
            },
            {
              key: "home.categories.subtext",
              kind: "BLOCK",
              type: "TEXT",
              label: "Subtítulo de categorías",
              category: "HOME",
              body: "Productos para cada rincón de tu vida.",
              sortOrder: 20,
            },
            {
              key: "home.categories.cta-all",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón «ver todo»",
              helpText:
                "Aparece bajo la cuadrícula de categorías de la portada; lleva al catálogo completo.",
              category: "HOME",
              body: "Ver todas las categorías y productos →",
              sortOrder: 30,
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
              key: "home.featured.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Encabezado de destacados",
              category: "HOME",
              body: "Productos que están enamorando",
              sortOrder: 10,
            },
            {
              key: "home.featured.subtext",
              kind: "BLOCK",
              type: "TEXT",
              label: "Subtítulo de destacados",
              category: "HOME",
              body: "Los favoritos de la temporada.",
              sortOrder: 20,
            },
            {
              key: "home.featured.cta-all",
              kind: "BLOCK",
              type: "TEXT",
              label: "Enlace «ver todo»",
              helpText:
                "Aparece a la derecha del título «Productos que están enamorando» en la portada.",
              category: "HOME",
              body: "Ver todo →",
              sortOrder: 30,
            },
            {
              key: "home.featured.empty",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Texto cuando no hay destacados",
              category: "HOME",
              body: "Cargando destacados pronto ✨",
              sortOrder: 40,
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
              key: "home.reviews.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Encabezado de reseñas",
              category: "HOME",
              body: "Lo que dicen quienes ya nos compran",
              sortOrder: 10,
            },
            {
              key: "home.reviews.subtext",
              kind: "BLOCK",
              type: "TEXT",
              label: "Subtítulo de reseñas",
              category: "HOME",
              body: "Historias reales de clientes felices.",
              sortOrder: 20,
            },
            {
              key: "home.reviews.empty",
              kind: "BLOCK",
              type: "TEXT",
              label: "Mensaje principal sin reseñas",
              helpText: "Aparece en la portada cuando aún no hay reseñas aprobadas.",
              category: "EMPTY_STATE",
              body: "Sé el primero en contarnos cómo te llegó tu pedido 💜",
              sortOrder: 30,
            },
            {
              key: "home.reviews.empty-note",
              kind: "BLOCK",
              type: "TEXT",
              label: "Nota secundaria sin reseñas",
              helpText:
                "Aparece en la portada, bajo el mensaje principal, cuando aún no hay reseñas publicadas.",
              category: "HOME",
              body: "Cuando los primeros clientes reseñen, aparecerán acá.",
              sortOrder: 40,
            },
          ],
        },
        {
          key: "cta-final",
          title: "Llamado final (pedidos especiales)",
          prefixes: ["home.cta."],
          sortOrder: 60,
          fields: [
            {
              key: "home.cta.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Encabezado del llamado final",
              category: "HOME",
              body: "¿Tienes una idea distinta?",
              sortOrder: 10,
            },
            {
              key: "home.cta.description",
              kind: "BLOCK",
              type: "TEXT",
              label: "Descripción del llamado final",
              category: "HOME",
              body: "Cotizamos a medida: regalos corporativos, eventos, bodas y proyectos especiales.",
              sortOrder: 20,
            },
            {
              key: "home.cta.whatsapp-label",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón de WhatsApp",
              helpText:
                "Texto del botón de WhatsApp en la sección final de la portada («¿Tienes una idea distinta?»).",
              category: "HOME",
              body: "Háblanos por WhatsApp",
              sortOrder: 30,
            },
            {
              key: "home.cta.catalog-label",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón de catálogo",
              helpText: "Texto del botón que lleva al catálogo en la sección final de la portada.",
              category: "HOME",
              body: "Ver catálogo",
              sortOrder: 40,
            },
          ],
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Navegación (encabezado + pie de página) — 5 campos
    // ─────────────────────────────────────────────────────────────────────────
    {
      slug: "navegacion",
      title: "Encabezado y pie de página",
      description:
        "CTA comercial del menú superior, frase de marca, newsletter y enlaces legales del pie.",
      path: null,
      icon: "PanelTop",
      sortOrder: 20,
      sections: [
        {
          key: "encabezado",
          title: "Menú superior",
          prefixes: ["header."],
          sortOrder: 10,
          fields: [
            {
              key: "header.menu.help-cta",
              kind: "BLOCK",
              type: "TEXT",
              label: "Botón «¿Te ayudamos a elegir?»",
              helpText:
                "Aparece en el menú superior (computador) y al final del menú en celular; lleva al recomendador.",
              category: "HOME",
              body: "¿Te ayudamos a elegir?",
              sortOrder: 10,
            },
          ],
        },
        {
          key: "pie",
          title: "Pie de página y newsletter",
          prefixes: ["footer."],
          sortOrder: 20,
          fields: [
            {
              key: "footer.tagline",
              kind: "BLOCK",
              type: "TEXT",
              label: "Frase bajo el logo",
              helpText: "Texto descriptivo bajo el logo de Lucams en el pie de página.",
              category: "FOOTER",
              body: "Tus recuerdos, en imán. Hechos a mano con cariño en Bogotá.",
              sortOrder: 10,
            },
            {
              key: "footer.newsletter.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Newsletter: encabezado",
              category: "FOOTER",
              body: "Recibe el correo del cariño 💜",
              sortOrder: 20,
            },
            {
              key: "footer.newsletter.description",
              kind: "BLOCK",
              type: "TEXT",
              label: "Newsletter: descripción",
              category: "FOOTER",
              body: "Lanzamientos, promos y curaduría kawaii. Sin spam — máximo una vez al mes.",
              sortOrder: 30,
            },
            {
              key: "footer.legal.links",
              kind: "BLOCK",
              type: "JSON",
              label: "Enlaces legales",
              helpText:
                "Enlaces de la columna «Información» del pie de página. Se editan como lista de filas (texto + ruta).",
              category: "FOOTER",
              metadata: {
                listSchema: [
                  { name: "label", type: "TEXT", label: "Texto del enlace" },
                  { name: "href", type: "URL", label: "Ruta o URL" },
                ],
              },
              defaultListItems: DEFAULT_FOOTER_LEGAL_LINKS,
              body: JSON.stringify(DEFAULT_FOOTER_LEGAL_LINKS, null, 2),
              sortOrder: 40,
            },
          ],
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Centro de ayuda (/ayuda) — 16 campos
    // ─────────────────────────────────────────────────────────────────────────
    {
      slug: "ayuda",
      title: "Centro de ayuda",
      description: "Página /ayuda: encabezado y las 12 preguntas frecuentes.",
      path: "/ayuda",
      icon: "HelpCircle",
      sortOrder: 30,
      sections: [
        {
          key: "encabezado",
          title: "Encabezado y llamado final",
          prefixes: ["support.help."],
          sortOrder: 10,
          fields: [
            {
              key: "support.help.heading",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Título principal",
              category: "SUPPORT",
              body: "Centro de ayuda",
              sortOrder: 10,
            },
            {
              key: "support.help.subtext",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Subtítulo",
              category: "SUPPORT",
              body: "¿Tienes una pregunta? Acá las respuestas a las dudas más comunes. Si no encuentras lo que buscas, escríbenos.",
              sortOrder: 20,
            },
            {
              key: "support.help.cta.heading",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Cuadro final: título",
              category: "SUPPORT",
              body: "¿No resolvimos tu duda?",
              sortOrder: 30,
            },
            {
              key: "support.help.cta.subtext",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Cuadro final: texto",
              category: "SUPPORT",
              body: "Escríbenos por WhatsApp o email y te respondemos en menos de 24h hábiles.",
              sortOrder: 40,
            },
          ],
        },
        {
          key: "faq",
          title: "Preguntas frecuentes",
          description:
            "El nombre del campo es la pregunta visible en /ayuda y el contenido Markdown es la respuesta (admite {{tokens}}).",
          prefixes: ["faq."],
          sortOrder: 20,
          fields: [
            {
              key: "faq.01-como-personalizo",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Cómo personalizo un producto?",
              helpText:
                "FAQ visible en /ayuda. Nombre del campo = pregunta; Contenido = respuesta.",
              category: "FAQ",
              body: "Elige el producto, haz clic en **Personalizar** y lo diseñas en vivo en nuestro Estudio: subes tus fotos, agregas texto y plantillas, y lo ves con vista previa 3D. Al terminar, lo agregas al carrito.",
              sortOrder: 10,
            },
            {
              key: "faq.02-cuanto-demora",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Cuánto demora mi pedido?",
              helpText: "Admite los tokens {{fab}} y {{entrega}} desde Ajustes del sitio.",
              category: "FAQ",
              body: "La **preparación toma alrededor de {{fab}} días hábiles antes del despacho**. Desde ahí, el tránsito estimado de la transportadora es de ~{{entrega}} días según tu ciudad; al despachar te enviamos el número de guía para que sigas tu pedido.",
              sortOrder: 20,
            },
            {
              key: "faq.03-metodos-pago",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Qué métodos de pago aceptan?",
              helpText:
                "Si COD_ENABLED está apagado, la mención a contraentrega se oculta automáticamente.",
              category: "FAQ",
              body: "Tarjetas de crédito y débito, PSE (cuentas bancarias), Nequi, Bancolombia transferencia y Daviplata. Todos los pagos los procesa Wompi de forma segura (pasarela certificada). También aceptamos **pago contraentrega**: pagas en efectivo al recibir tu pedido.",
              sortOrder: 30,
            },
            {
              key: "faq.04-envios-cobertura",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Hacen envíos a mi ciudad?",
              helpText: "Admite el token {{cobertura}} desde Ajustes del sitio.",
              category: "FAQ",
              body: "Llegamos a **{{cobertura}} destinos** en Colombia a través de nuestras transportadoras aliadas. Al hacer el pedido calculamos automáticamente el costo, el tiempo estimado y qué transportadora llega a tu ciudad.",
              sortOrder: 40,
            },
            {
              key: "faq.05-cambios-devoluciones",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Cómo cambio o devuelvo un producto?",
              helpText:
                "Usa {{retracto_dias}} y {{garantia_base}} para mantenerse sincronizada con las reglas legales.",
              category: "FAQ",
              body: "Tienes **{{retracto_dias}} días hábiles** desde la entrega para retractarte (Ley 1480 art. 47), excepto en productos personalizados. Para garantía: aplica el plazo que ves en la ficha del producto y que confirmamos en tu pedido (el catálogo inicia con **{{garantia_base}}**); el plazo **se suspende** mientras tu producto esté en reparación. [Más detalles](/legal/devoluciones) y [Garantías](/legal/garantias).",
              sortOrder: 50,
            },
            {
              key: "faq.06-comprobante-venta",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Puedo pedir comprobante de venta de mi compra?",
              helpText: "FAQ visible en /ayuda.",
              category: "FAQ",
              body: "Claro. Cuéntanos tus datos de facturación (nombre o razón social, cédula o NIT, y correo) al confirmar tu pedido y te enviamos el comprobante de tu compra a tu correo. Hoy no emitimos factura electrónica de la DIAN; te entregamos el documento equivalente que corresponda según nuestro régimen tributario.",
              sortOrder: 60,
            },
            {
              key: "faq.07-datos-personales",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Cómo manejan mis datos personales?",
              helpText: "FAQ visible en /ayuda.",
              category: "FAQ",
              body: "Tratamos tus datos según la **Ley 1581 de 2012** y nuestro [Aviso de Privacidad](/legal/privacidad). Puedes ejercer hábeas data (acceso, rectificación, supresión, revocación) escribiéndonos.",
              sortOrder: 70,
            },
            {
              key: "faq.08-borrar-mis-datos",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Cómo borro mi cuenta y mis datos?",
              helpText: "Usa {{email_contacto}} y {{habeas_reclamo_dias}} (Ley 1581 art. 15).",
              category: "FAQ",
              body: "Puedes hacerlo tú misma de inmediato desde **[Mi cuenta → Eliminar cuenta](/mi-cuenta/eliminar)**: tus datos se anonimizan al momento. Si prefieres que lo tramitemos por ti, escríbenos a **{{email_contacto}}** desde el email registrado y procesamos la supresión en máximo **{{habeas_reclamo_dias}} días hábiles**. Más info en [Hábeas Data](/legal/habeas-data).",
              sortOrder: 80,
            },
            {
              key: "faq.09-newsletter-unsuscripcion",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Cómo me suscribo o desuscribo del newsletter?",
              helpText: "Usa {{email_contacto}} desde Ajustes del sitio.",
              category: "FAQ",
              body: "Suscripción: form en el footer. Desuscripción: link **Cancelar suscripción** al final de cada email que te enviemos, o escríbenos a {{email_contacto}}.",
              sortOrder: 90,
            },
            {
              key: "faq.10-regalos-eventos",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Hacen pedidos al por mayor o para eventos corporativos?",
              helpText: "FAQ visible en /ayuda.",
              category: "FAQ",
              body: "¡Sí! Bodas, baby showers, eventos corporativos, recordatorios para regalos. Escríbenos por WhatsApp con tu idea y volumen y te pasamos cotización personalizada.",
              sortOrder: 100,
            },
            {
              key: "faq.11-envio-mismo-dia",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Tienen envío el mismo día en Bogotá?",
              helpText:
                "FAQ Envío Lucams (mismo día, Bogotá). Solo se muestra cuando LUCAMS_SHIPPING_ENABLED está activo y la tienda opera en modo completo. Usa {{cutoff_lucams}}.",
              category: "FAQ",
              body: "Sí: **Envío Lucams**, nuestro servicio propio de entrega local. Está disponible en **localidades seleccionadas de Bogotá**, con **tarifa fija** que ves antes de pagar. La ruta local se estima para el **mismo día del despacho**, sujeta a disponibilidad y condiciones de la ruta. Si el producto está **listo (sin fabricación pendiente)** y tu pedido queda confirmado **antes de las {{cutoff_lucams}}:00**, la entrega se estima para ese mismo día; si hay que fabricarlo a mano, primero corre el tiempo de preparación. Si la opción no aparece en tu checkout, tu localidad aún no está cubierta — siempre puedes elegir el envío por transportadora aliada.",
              sortOrder: 110,
            },
            {
              key: "faq.12-cuidado-imanes",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "¿Cómo cuido mis imanes?",
              helpText:
                "Instrucciones de uso y conservación (art. 11.4 Ley 1480) alineadas con /legal/garantias.",
              category: "FAQ",
              body: "Para que duren: **nada de agua ni humedad**; lejos del **calor extremo y del sol prolongado**; límpialos con **paño suave y seco** (sin químicos ni abrasivos); úsalos sobre superficies limpias, lisas y ferromagnéticas; y **no los dobles** ni los golpees. Las piezas pequeñas, lejos de niños **menores de 3 años**. Estas son las instrucciones de uso y conservación que rigen la [garantía](/legal/garantias).",
              sortOrder: 120,
            },
          ],
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Contacto (/contacto) — 8 campos
    // ─────────────────────────────────────────────────────────────────────────
    {
      slug: "contacto",
      title: "Contacto",
      description:
        "Textos editoriales de /contacto (tarjetas de canales y encabezado del formulario).",
      path: "/contacto",
      icon: "Mail",
      sortOrder: 40,
      sections: [
        {
          key: "general",
          title: "Encabezado y canales",
          prefixes: ["support.contacto."],
          sortOrder: 10,
          fields: [
            {
              key: "support.contacto.heading",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Título principal",
              category: "SUPPORT",
              body: "Hablemos",
              sortOrder: 10,
            },
            {
              key: "support.contacto.subtext",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Subtítulo",
              category: "SUPPORT",
              body: "¿Una idea, una duda, un pedido especial? Escríbenos por el medio que prefieras. Te respondemos en menos de 24h hábiles.",
              sortOrder: 20,
            },
            {
              key: "support.contacto.wa-copy",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Tarjeta de WhatsApp: texto",
              category: "SUPPORT",
              body: "El canal más rápido. Te respondemos en minutos durante horario hábil.",
              sortOrder: 30,
            },
            {
              key: "support.contacto.legal-note",
              kind: "BLOCK",
              type: "TEXT",
              label: "Tarjeta de Email: nota legal",
              helpText:
                "Etiqueta que introduce el buzón de Hábeas Data en la tarjeta de Email de /contacto.",
              category: "SUPPORT",
              body: "Datos personales y temas legales:",
              sortOrder: 40,
            },
          ],
        },
        {
          key: "formulario",
          title: "Formulario y bloque de ayuda",
          sortOrder: 20,
          fields: [
            {
              key: "support.contacto.form-heading",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Título del formulario",
              category: "SUPPORT",
              body: "Escríbenos por aquí",
              sortOrder: 10,
            },
            {
              key: "support.contacto.form-subtext",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Subtítulo del formulario",
              category: "SUPPORT",
              body: "Te respondemos al email que nos dejes.",
              sortOrder: 20,
            },
            {
              key: "support.contacto.success-note",
              kind: "BLOCK",
              type: "TEXT",
              label: "Mensaje de éxito del formulario",
              helpText:
                "Texto del panel de confirmación tras enviar el formulario de /contacto (antes del número de ticket).",
              category: "SUPPORT",
              body: "Te respondemos a tu email en menos de 24h hábiles. Tu ticket es",
              sortOrder: 30,
            },
            {
              key: "support.contacto.faq-block",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Bloque «¿Preguntas comunes?»",
              helpText: "Aparece al final de la columna izquierda de /contacto. Formato Markdown.",
              category: "SUPPORT",
              body: `## ¿Preguntas comunes?\n\nAntes de escribir, revisa el [Centro de ayuda](/ayuda) — quizás ya está respondida.`,
              sortOrder: 40,
            },
          ],
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Páginas legales (/legal/*) — 17 campos
    // ─────────────────────────────────────────────────────────────────────────
    {
      slug: "legales",
      title: "Páginas legales",
      description:
        "Los 8 documentos legales de /legal/* con enlace directo a cada ruta pública y {{tokens}} legales/operativos.",
      path: null,
      icon: "Scale",
      sortOrder: 50,
      sections: [
        {
          key: "encabezado",
          title: "Títulos y versión",
          sortOrder: 10,
          fields: [
            {
              key: "legal.last-updated",
              kind: "BLOCK",
              type: "TEXT",
              label: "Línea de última actualización",
              helpText: "Aparece bajo el título de las páginas legales del paquete vigente.",
              category: "LEGAL",
              body: "Última actualización: 2026-11-05 · Versión 3",
              sortOrder: 10,
            },
            {
              key: "legal.privacidad.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título: Aviso de Privacidad",
              category: "LEGAL",
              body: "Aviso de Privacidad",
              sortOrder: 20,
            },
            {
              key: "legal.terminos.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título: Términos y Condiciones",
              category: "LEGAL",
              body: "Términos y Condiciones",
              sortOrder: 30,
            },
            {
              key: "legal.cookies.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título: Política de Cookies",
              category: "LEGAL",
              body: "Política de Cookies",
              sortOrder: 40,
            },
            {
              key: "legal.devoluciones.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título: Devoluciones y Retracto",
              category: "LEGAL",
              body: "Devoluciones y Retracto",
              sortOrder: 50,
            },
            {
              key: "legal.garantias.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título: Garantías",
              category: "LEGAL",
              body: "Garantías",
              sortOrder: 60,
            },
            {
              key: "legal.habeas-data.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título: Hábeas Data",
              category: "LEGAL",
              body: "Hábeas Data",
              sortOrder: 70,
            },
            {
              key: "legal.subprocesadores.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título: Subprocesadores",
              category: "LEGAL",
              body: "Subprocesadores",
              sortOrder: 80,
            },
            {
              key: "legal.security.heading",
              kind: "BLOCK",
              type: "TEXT",
              label: "Título: Seguridad",
              category: "LEGAL",
              body: "Seguridad",
              sortOrder: 90,
            },
          ],
        },
        {
          key: "documentos",
          title: "Documentos completos (Markdown)",
          prefixes: ["legal."],
          sortOrder: 20,
          fields: [
            {
              key: "legal.privacidad",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Aviso de Privacidad",
              helpText: "Documento completo de /legal/privacidad. Conserva los {{tokens}} legales.",
              category: "LEGAL",
              body: readLegalMarkdown("privacidad"),
              sortOrder: 10,
            },
            {
              key: "legal.terminos",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Términos y Condiciones",
              helpText: "Documento completo de /legal/terminos. Conserva los {{tokens}} legales.",
              category: "LEGAL",
              body: readLegalMarkdown("terminos"),
              sortOrder: 20,
            },
            {
              key: "legal.cookies",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Política de Cookies",
              helpText: "Documento completo de /legal/cookies.",
              category: "LEGAL",
              body: readLegalMarkdown("cookies"),
              sortOrder: 30,
            },
            {
              key: "legal.devoluciones",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Devoluciones y Retracto",
              helpText:
                "Documento completo de /legal/devoluciones. Conserva {{retracto_dias}} y {{retracto_reembolso_dias}}.",
              category: "LEGAL",
              body: readLegalMarkdown("devoluciones"),
              sortOrder: 40,
            },
            {
              key: "legal.garantias",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Garantías",
              helpText:
                "Documento completo de /legal/garantias. Conserva {{garantia_base}} y {{garantia_respuesta_dias}}.",
              category: "LEGAL",
              body: readLegalMarkdown("garantias"),
              sortOrder: 50,
            },
            {
              key: "legal.habeas-data",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Hábeas Data",
              helpText:
                "Documento completo de /legal/habeas-data. Conserva {{habeas_consulta_dias}} y {{habeas_reclamo_dias}}.",
              category: "LEGAL",
              body: readLegalMarkdown("habeas-data"),
              sortOrder: 60,
            },
            {
              key: "legal.subprocesadores",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Subprocesadores",
              helpText: "Documento completo de /legal/subprocesadores.",
              category: "LEGAL",
              body: readLegalMarkdown("subprocesadores"),
              sortOrder: 70,
            },
            {
              key: "legal.security",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Seguridad",
              helpText: "Documento completo de /legal/security.",
              category: "LEGAL",
              body: readLegalMarkdown("security"),
              sortOrder: 80,
            },
          ],
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Checkout (promesas comerciales y post-compra) — 18 campos
    // ─────────────────────────────────────────────────────────────────────────
    {
      slug: "checkout",
      title: "Checkout",
      description:
        "Avisos comerciales de envío, incentivo de Puntos Lucams y mensajes de confirmación en /checkout/gracias.",
      path: null,
      icon: "CreditCard",
      sortOrder: 60,
      sections: [
        {
          key: "envio",
          title: "Promesas y avisos de envío",
          prefixes: ["checkout.shipping."],
          sortOrder: 10,
          fields: [
            {
              key: "checkout.shipping.lucams-today",
              kind: "BLOCK",
              type: "TEXT",
              label: "Estimación Envío Lucams (mismo día)",
              helpText: "{{cutoff}} = hora límite configurada en /admin/envios.",
              category: "SUPPORT",
              body: "Entrega estimada hoy · pedido antes de las {{cutoff}}:00 · sujeta a disponibilidad de ruta",
              sortOrder: 10,
            },
            {
              key: "checkout.shipping.lucams-days",
              kind: "BLOCK",
              type: "TEXT",
              label: "Estimación Envío Lucams (N días)",
              helpText:
                "{{daysLabel}} = días hábiles estimados calculados según fabricación + corte.",
              category: "SUPPORT",
              body: "Entrega estimada en alrededor de {{daysLabel}} · incluye preparación y ruta local",
              sortOrder: 20,
            },
            {
              key: "checkout.shipping.lucams-badge",
              kind: "BLOCK",
              type: "TEXT",
              label: "Badge mensajería propia",
              category: "SUPPORT",
              body: "LUCAMS",
              sortOrder: 30,
            },
            {
              key: "checkout.shipping.lucams-badge-today",
              kind: "BLOCK",
              type: "TEXT",
              label: "Badge mensajería propia (mismo día)",
              category: "SUPPORT",
              body: "LUCAMS · estimado hoy",
              sortOrder: 40,
            },
            {
              key: "checkout.shipping.note",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Nota legal de tiempos de entrega",
              helpText:
                "Usa {{fab}} (días de preparación) y {{entrega_max_legal_dias}} (plazo máximo legal de Ley 1480).",
              category: "SUPPORT",
              body: "Son tiempos **estimados**, no una fecha garantizada. La **preparación toma alrededor de {{fab}} días hábiles antes del despacho** y el tránsito se cuenta **después del despacho**. En todo caso, el plazo máximo legal de entrega es de **{{entrega_max_legal_dias}} días calendario**.",
              sortOrder: 50,
            },
            {
              key: "checkout.shipping.estimated-note",
              kind: "BLOCK",
              type: "TEXT",
              label: "Aviso de tarifa de respaldo",
              helpText:
                "Se muestra cuando la cotización en vivo de la transportadora no responde y se aplica la tarifa estimada.",
              category: "SUPPORT",
              body: "Tarifa estimada: la cotización en vivo no respondió; el valor exacto se confirma al generar la guía.",
              sortOrder: 60,
            },
          ],
        },
        {
          key: "fidelizacion",
          title: "Banner de Puntos Lucams (invitados)",
          prefixes: ["checkout.guest-loyalty."],
          sortOrder: 20,
          fields: [
            {
              key: "checkout.guest-loyalty.title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Invitados y puntos: título",
              helpText:
                "Banner para quien compra sin cuenta cuando Puntos Lucams está activo (paso Datos y resumen de Pago).",
              category: "SUPPORT",
              body: "✨ Crea tu cuenta y gana puntos",
              sortOrder: 10,
            },
            {
              key: "checkout.guest-loyalty.body",
              kind: "BLOCK",
              type: "TEXT",
              label: "Invitados y puntos: texto",
              helpText: "{puntos} = puntos de esta compra; {valor} = equivalencia en pesos.",
              category: "SUPPORT",
              body: "Con esta compra ganarías {puntos} Puntos Lucams (equivalen a {valor} para tu próxima compra).",
              sortOrder: 20,
            },
            {
              key: "checkout.guest-loyalty.referral-note",
              kind: "BLOCK",
              type: "TEXT",
              label: "Invitados y puntos: nota de referidos",
              helpText: "Solo se muestra si el programa Invita y gana está activo.",
              category: "SUPPORT",
              body: "Además, con tu cuenta puedes invitar amigos y ganar cupones.",
              sortOrder: 30,
            },
            {
              key: "checkout.guest-loyalty.cta",
              kind: "BLOCK",
              type: "TEXT",
              label: "Invitados y puntos: botón",
              category: "SUPPORT",
              body: "Crear mi cuenta",
              sortOrder: 40,
            },
          ],
        },
        {
          key: "gracias",
          title: "Confirmación post-pago (/checkout/gracias)",
          prefixes: ["checkout.gracias."],
          sortOrder: 30,
          fields: [
            {
              key: "checkout.gracias.approved.title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Pago aprobado: título",
              category: "SUPPORT",
              body: "¡Listo, tu pedido está confirmado! ✨",
              sortOrder: 10,
            },
            {
              key: "checkout.gracias.approved.body",
              kind: "BLOCK",
              type: "TEXT",
              label: "Pago aprobado: texto",
              category: "SUPPORT",
              body: "Tu pago fue aprobado. Te enviamos la confirmación por email y ya empezamos a preparar tu pedido.",
              sortOrder: 20,
            },
            {
              key: "checkout.gracias.received.title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Pago recibido (en verificación): título",
              category: "SUPPORT",
              body: "Recibimos tu pago, lo estamos confirmando ⏳",
              sortOrder: 30,
            },
            {
              key: "checkout.gracias.received.body",
              kind: "BLOCK",
              type: "TEXTAREA",
              label: "Pago recibido (en verificación): texto",
              category: "SUPPORT",
              body: "Tu pago fue aprobado y lo estamos verificando para preparar tu pedido. En cuanto esté todo listo te llega un correo con los detalles. Si en unas horas no recibes nada, escríbenos y lo revisamos enseguida.",
              sortOrder: 40,
            },
            {
              key: "checkout.gracias.points-earned",
              kind: "BLOCK",
              type: "TEXT",
              label: "Puntos ganados (cliente con sesión)",
              helpText: "{puntos} = cantidad de puntos acreditados.",
              category: "SUPPORT",
              body: "✨ Ganaste {puntos} Puntos Lucams con esta compra.",
              sortOrder: 50,
            },
            {
              key: "checkout.gracias.guest-points-title",
              kind: "BLOCK",
              type: "TEXT",
              label: "Puntos ganados (invitado): título",
              helpText: "{puntos} = cantidad de puntos disponibles al crear cuenta.",
              category: "SUPPORT",
              body: "🎁 Ganaste {puntos} Puntos Lucams",
              sortOrder: 60,
            },
            {
              key: "checkout.gracias.guest-points-body",
              kind: "BLOCK",
              type: "TEXT",
              label: "Puntos ganados (invitado): texto",
              helpText: "{dias} = días para reclamarlos; {valor} = equivalencia en pesos.",
              category: "SUPPORT",
              body: "Crea tu cuenta con este mismo correo en los próximos {dias} días y te los acreditamos: equivalen a {valor} para tu próxima compra.",
              sortOrder: 70,
            },
            {
              key: "checkout.gracias.guest-points-cta",
              kind: "BLOCK",
              type: "TEXT",
              label: "Puntos ganados (invitado): botón",
              category: "SUPPORT",
              body: "Crear mi cuenta y cobrar mis puntos",
              sortOrder: 80,
            },
          ],
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Modo mantenimiento (/maintenance) — 2 campos
    // ─────────────────────────────────────────────────────────────────────────
    {
      slug: "sistema",
      title: "Modo mantenimiento",
      description:
        "Mensaje público mostrado cuando el sitio está en modo mantenimiento (/maintenance).",
      path: "/maintenance",
      icon: "Wrench",
      sortOrder: 80,
      sections: [
        {
          key: "mantenimiento",
          title: "Página de mantenimiento",
          prefixes: ["maintenance."],
          sortOrder: 10,
          fields: [
            {
              key: "maintenance.title",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Título de mantenimiento",
              category: "MAINTENANCE",
              body: "Estamos puliendo unos detalles ✨",
              sortOrder: 10,
            },
            {
              key: "maintenance.description",
              kind: "BLOCK",
              type: "MARKDOWN",
              label: "Mensaje de mantenimiento",
              category: "MAINTENANCE",
              body: "Volvemos en unas horas con todo brillando. Mientras tanto, escríbenos por WhatsApp si necesitas ayuda urgente.",
              sortOrder: 20,
            },
          ],
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 8. SEO de páginas públicas indexables — 6 campos
    // ─────────────────────────────────────────────────────────────────────────
    {
      slug: "seo",
      title: "SEO (Google)",
      description:
        "Título (<title>) y descripción (meta description) que muestra Google para las 6 páginas públicas indexables.",
      path: null,
      icon: "Search",
      sortOrder: 90,
      sections: [
        {
          key: "paginas",
          title: "Páginas indexables",
          prefixes: ["seo.page."],
          sortOrder: 10,
          fields: [
            {
              key: "seo.page.home",
              kind: "BLOCK",
              type: "TEXTAREA",
              label: "Lucams Shop — Tus recuerdos en imán",
              helpText:
                "Portada (/): edita el título y la descripción que aparecen en Google (admite {{cobertura}}).",
              category: "HOME",
              body: "Imanes magnéticos personalizados, fotoimanes, recuerdos para eventos, calendarios y planners. Hechos a mano en Colombia con entrega a {{cobertura}} destinos.",
              sortOrder: 10,
            },
            {
              key: "seo.page.catalogo",
              kind: "BLOCK",
              type: "TEXTAREA",
              label: "Tienda",
              helpText:
                "Catálogo general (/productos): edita el título y la descripción en Google.",
              category: "HOME",
              body: "Explora todos nuestros imanes personalizados, fotoimanes, calendarios, marcapáginas y recuerdos hechos a mano en Bogotá con envío a toda Colombia.",
              sortOrder: 20,
            },
            {
              key: "seo.page.recomendador",
              kind: "BLOCK",
              type: "TEXTAREA",
              label: "Recomendador de imanes",
              helpText: "Recomendador (/recomendador): edita el título y la descripción en Google.",
              category: "HOME",
              body: "¿No sabes qué elegir? Te ayudamos en 4 preguntas a encontrar el imán perfecto para tu ocasión.",
              sortOrder: 30,
            },
            {
              key: "seo.page.ayuda",
              kind: "BLOCK",
              type: "TEXTAREA",
              label: "Ayuda",
              helpText: "Centro de ayuda (/ayuda): edita el título y la descripción en Google.",
              category: "HOME",
              body: "Preguntas frecuentes sobre personalización, envíos, métodos de pago, garantías y devoluciones en Lucams Shop.",
              sortOrder: 40,
            },
            {
              key: "seo.page.contacto",
              kind: "BLOCK",
              type: "TEXTAREA",
              label: "Contacto",
              helpText: "Contacto (/contacto): edita el título y la descripción en Google.",
              category: "HOME",
              body: "Escríbenos por WhatsApp, email o el formulario. Te respondemos en menos de 24 horas hábiles.",
              sortOrder: 50,
            },
            {
              key: "seo.page.rastrear",
              kind: "BLOCK",
              type: "TEXTAREA",
              label: "Rastrear pedido",
              helpText: "Rastreo público (/rastrear): edita el título y la descripción en Google.",
              category: "HOME",
              body: "Consulta el estado de tu pedido con tu número y correo, sin necesidad de cuenta.",
              sortOrder: 60,
            },
          ],
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Ajustes del sitio (Capa 1: parámetros maestros, Configuración) — 59 campos
    // ─────────────────────────────────────────────────────────────────────────
    {
      slug: "global",
      title: "Ajustes del sitio",
      description:
        "Parámetros maestros de marca, canales, origen de despachos, promesas operativas y {{tokens}} legales.",
      path: null,
      icon: "Settings",
      sortOrder: 100,
      sections: [
        {
          key: "identidad",
          title: "Identidad de marca",
          sortOrder: 5,
          fields: [
            {
              key: "site.logo",
              kind: "SETTING",
              type: "IMAGE",
              label: "Logo del sitio",
              helpText:
                "Aparece en el encabezado del sitio y del panel admin. Si está vacío, se usa el logo oficial del repositorio.",
              category: "BUSINESS",
              body: "",
              sortOrder: 10,
            },
            {
              key: "APP_NAME",
              kind: "SETTING",
              type: "TEXT",
              label: "Nombre de la marca",
              helpText: "Nombre comercial usado en el pie de página y plantillas.",
              category: "COPYRIGHT",
              body: "Lucams Shop",
              sortOrder: 20,
            },
            {
              key: "SITE_URL",
              kind: "SETTING",
              type: "URL",
              label: "URL pública del sitio",
              helpText:
                "URL de respaldo para enlaces absolutos en correos y guías cuando NEXT_PUBLIC_SITE_URL no está definida.",
              category: "EXTERNAL",
              body: "https://lucamsshop.com",
              sortOrder: 30,
            },
          ],
        },
        {
          key: "contacto",
          title: "Emails de contacto",
          settingCategories: ["CONTACT"],
          sortOrder: 10,
          fields: [
            {
              key: "CONTACT_EMAIL",
              kind: "SETTING",
              type: "EMAIL",
              label: "Email de contacto público",
              helpText:
                "Alimenta {{email_contacto}}, el pie de página, soporte, retractos, garantías y correos.",
              category: "CONTACT",
              body: "hola@lucamsshop.com",
              sortOrder: 10,
            },
            {
              key: "ALERT_EMAIL",
              kind: "SETTING",
              type: "EMAIL",
              label: "Email de avisos internos al negocio",
              helpText:
                "Acá llegan los avisos internos: nueva cotización, alertas operativas y resumen diario.",
              category: "CONTACT",
              body: "hola@lucamsshop.com",
              sortOrder: 20,
            },
            {
              key: "HABEAS_DATA_EMAIL",
              kind: "SETTING",
              type: "EMAIL",
              label: "Email de datos personales (Hábeas Data)",
              helpText:
                "Alimenta {{email_habeas}} en páginas legales y en /contacto. Si está vacío, usa habeas-data@lucamsshop.com.",
              category: "CONTACT",
              body: "habeas-data@lucamsshop.com",
              sortOrder: 30,
            },
            {
              key: "RETRACTO_EMAIL",
              kind: "SETTING",
              type: "EMAIL",
              label: "Email de retracto y devoluciones",
              helpText:
                "Alimenta {{email_retracto}} en páginas legales y correos de retracto. Si está vacío, usa retracto@lucamsshop.com.",
              category: "CONTACT",
              body: "retracto@lucamsshop.com",
              sortOrder: 40,
            },
            {
              key: "SECURITY_EMAIL",
              kind: "SETTING",
              type: "EMAIL",
              label: "Email de seguridad",
              helpText:
                "Alimenta {{email_seguridad}} en /legal/security para reportes de vulnerabilidades.",
              category: "CONTACT",
              body: "security@lucamsshop.com",
              sortOrder: 50,
            },
          ],
        },
        {
          key: "redes-sociales",
          title: "Redes sociales",
          settingCategories: ["SOCIAL"],
          sortOrder: 20,
          fields: [
            {
              key: "SOCIAL_INSTAGRAM_URL",
              kind: "SETTING",
              type: "URL",
              label: "URL de Instagram",
              helpText: "Enlace del ícono de Instagram en el pie de página y datos estructurados.",
              category: "SOCIAL",
              body: "https://www.instagram.com/lucams_shop",
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
              key: "SOCIAL_TIKTOK_URL",
              kind: "SETTING",
              type: "URL",
              label: "URL de TikTok",
              helpText: "Enlace del ícono de TikTok en el pie de página y datos estructurados.",
              category: "SOCIAL",
              body: "https://www.tiktok.com/@lucams_shop",
              sortOrder: 30,
            },
            {
              key: "SOCIAL_TIKTOK_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Mostrar TikTok",
              helpText: "Muestra u oculta el ícono de TikTok en el pie de página.",
              category: "SOCIAL",
              body: "true",
              sortOrder: 40,
            },
            {
              key: "SOCIAL_FACEBOOK_URL",
              kind: "SETTING",
              type: "URL",
              label: "URL de Facebook",
              helpText: "Enlace del ícono de Facebook en el pie de página.",
              category: "SOCIAL",
              body: "https://www.facebook.com/lucamsshop",
              sortOrder: 50,
            },
            {
              key: "SOCIAL_FACEBOOK_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Mostrar Facebook",
              helpText: "Muestra u oculta el ícono de Facebook en el pie de página.",
              category: "SOCIAL",
              body: "true",
              sortOrder: 60,
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
              key: "WA_MSG_PRODUCT",
              kind: "SETTING",
              type: "TEXT",
              label: "Mensaje WhatsApp: consulta sobre producto",
              helpText: "Variables: {productName}, {sku}.",
              category: "WHATSAPP",
              body: 'Hola Lucams 👋 Quiero saber más sobre "{productName}" (SKU {sku}).',
              sortOrder: 20,
            },
            {
              key: "WA_MSG_SUPPORT",
              kind: "SETTING",
              type: "TEXT",
              label: "Mensaje WhatsApp: soporte general",
              helpText: "Mensaje cuando el cliente abre WhatsApp sin asunto específico.",
              category: "WHATSAPP",
              body: "Hola Lucams 👋 Tengo una consulta y quería hablar por aquí.",
              sortOrder: 30,
            },
            {
              key: "WA_MSG_SUPPORT_SUBJECT",
              kind: "SETTING",
              type: "TEXT",
              label: "Mensaje WhatsApp: soporte con asunto",
              helpText: "Variable: {subject}.",
              category: "WHATSAPP",
              body: "Hola Lucams 👋 Tengo una consulta sobre: {subject}",
              sortOrder: 40,
            },
            {
              key: "WA_MSG_ORDER",
              kind: "SETTING",
              type: "TEXT",
              label: "Mensaje WhatsApp: consulta de pedido",
              helpText: "Variable: {orderNumber}.",
              category: "WHATSAPP",
              body: "Hola Lucams 👋 Quiero consultar el estado de mi pedido {orderNumber}.",
              sortOrder: 50,
            },
            {
              key: "WA_MSG_QUOTE",
              kind: "SETTING",
              type: "TEXTAREA",
              label: "Mensaje WhatsApp: cotización",
              helpText:
                "Mensaje que se abre en WhatsApp al enviar una cotización. Variables: {customerName}, {quoteNumber}, {itemsSummary}, {total}, {quoteUrl}.",
              category: "WHATSAPP",
              body: `Hola Lucams 👋 Soy *{customerName}*.\n\nAcabo de hacer la cotización *{quoteNumber}* en la tienda:\n\n{itemsSummary}\n\n*Total: {total}*\n\n_Ver el detalle:_ {quoteUrl}\n\nQuedo atento/a para concretar 🙌`,
              sortOrder: 60,
            },
            {
              key: "WA_MSG_WHOLESALE",
              kind: "SETTING",
              type: "TEXT",
              label: "Mensaje WhatsApp: pedido al por mayor",
              helpText: "Mensaje para eventos corporativos y compras por volumen.",
              category: "WHATSAPP",
              body: "Hola Lucams 👋 Estoy interesado/a en pedido al por mayor / corporativo. ¿Me puedes contar?",
              sortOrder: 70,
            },
          ],
        },
        {
          key: "negocio",
          title: "Negocio y origen de despachos",
          settingCategories: ["BUSINESS"],
          sortOrder: 40,
          fields: [
            {
              key: "BUSINESS_HOURS",
              kind: "SETTING",
              type: "TEXT",
              label: "Horario de atención",
              helpText: "Aparece en el pie de página y en /contacto.",
              category: "BUSINESS",
              body: "Lun-Sáb 9am – 7pm COT",
              sortOrder: 10,
            },
            {
              key: "BUSINESS_LOCATION",
              kind: "SETTING",
              type: "TEXT",
              label: "Ubicación comercial",
              helpText: "Ciudad y país mostrados en el pie de página.",
              category: "BUSINESS",
              body: "Bogotá, Colombia",
              sortOrder: 20,
            },
            {
              key: "BUSINESS_NIT",
              kind: "SETTING",
              type: "TEXT",
              label: "NIT o documento del remitente (Aveonline)",
              helpText:
                "Identificación tributaria del remitente para la generación de guías en Aveonline (privado, no se expone en el storefront).",
              category: "BUSINESS",
              body: "0000000000",
              sortOrder: 30,
            },
            {
              key: "PICKUP_CITY",
              kind: "SETTING",
              type: "TEXT",
              label: "Ciudad de recogida (envíos)",
              helpText: "Ciudad origen desde donde se cotizan y despachan las guías.",
              category: "BUSINESS",
              body: "Bogotá",
              sortOrder: 40,
            },
            {
              key: "PICKUP_DEPARTMENT",
              kind: "SETTING",
              type: "TEXT",
              label: "Departamento de recogida (envíos)",
              helpText: "Departamento de la ciudad de recogida.",
              category: "BUSINESS",
              body: "Cundinamarca",
              sortOrder: 50,
            },
            {
              key: "PICKUP_ADDRESS",
              kind: "SETTING",
              type: "TEXT",
              label: "Dirección de recogida (envíos)",
              helpText:
                "Dirección física donde la transportadora recoge los paquetes (privada, solo viaja a Aveonline).",
              category: "BUSINESS",
              body: "Calle 10 # 15-20",
              sortOrder: 60,
            },
            {
              key: "PICKUP_PHONE",
              kind: "SETTING",
              type: "TEXT",
              label: "Teléfono de recogida (envíos)",
              helpText: "Teléfono de contacto del remitente para la transportadora (privado).",
              category: "BUSINESS",
              body: "3001234567",
              sortOrder: 70,
            },
            {
              key: "PICKUP_CONTACT_NAME",
              kind: "SETTING",
              type: "TEXT",
              label: "Contacto de recogida (envíos)",
              helpText:
                "Nombre de la persona que entrega los paquetes a la transportadora (privado).",
              category: "BUSINESS",
              body: "Lucams Shop",
              sortOrder: 80,
            },
          ],
        },
        {
          key: "comercio",
          title: "Promesas generales de operación y contraentrega",
          settingCategories: ["COMMERCE"],
          sortOrder: 50,
          fields: [
            {
              key: "COD_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Pago contraentrega activo",
              helpText:
                "Habilita el pago en efectivo al recibir en el checkout y muestra las menciones de contraentrega en portada y FAQs.",
              category: "COMMERCE",
              body: "false",
              sortOrder: 10,
            },
            {
              key: "PRODUCTION_DAYS_DEFAULT",
              kind: "SETTING",
              type: "NUMBER",
              label: "Días hábiles de fabricación (por defecto)",
              helpText:
                "Alimenta {{fab}} y {{total}} en portada, checkout, FAQs y legales cuando un producto no define su propio plazo.",
              category: "COMMERCE",
              body: "2",
              sortOrder: 20,
            },
            {
              key: "DELIVERY_DAYS_ESTIMATE",
              kind: "SETTING",
              type: "TEXT",
              label: "Días hábiles de entrega estimados",
              helpText:
                "Alimenta {{entrega}} y {{total}} en el contenido del sitio (tramo estimado de la transportadora).",
              category: "COMMERCE",
              body: "2 a 5",
              sortOrder: 30,
            },
            {
              key: "DELIVERY_COVERAGE_COUNT",
              kind: "SETTING",
              type: "TEXT",
              label: "Cobertura de envío (destinos)",
              helpText: "Alimenta {{cobertura}} en portada, SEO, FAQs y legales.",
              category: "COMMERCE",
              body: "1.100+",
              sortOrder: 40,
            },
            {
              key: "LUCAMS_SHIPPING_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Envío propio LUCAMS activo",
              helpText:
                "Activa la opción «LUCAMS» (mensajería propia por zonas) en checkout y la FAQ de envío el mismo día. Se gestiona desde /admin/envios.",
              category: "COMMERCE",
              body: "false",
              sortOrder: 50,
            },
            {
              key: "LUCAMS_SHIPPING_PRICE_COP",
              kind: "SETTING",
              type: "NUMBER",
              label: "Precio envío propio Lucams (centavos)",
              helpText:
                "Precio fijo del envío propio en centavos COP (1000000 = $10.000). Se gestiona desde /admin/envios.",
              category: "COMMERCE",
              body: "1000000",
              sortOrder: 60,
            },
            {
              key: "LUCAMS_SHIPPING_CUTOFF_HOUR",
              kind: "SETTING",
              type: "NUMBER",
              label: "Hora límite para estimación del mismo día",
              helpText:
                "Hora de Colombia (0-23) que alimenta el corte de Envío Lucams y el token {{cutoff_lucams}}. Se gestiona desde /admin/envios.",
              category: "COMMERCE",
              body: "12",
              sortOrder: 70,
            },
            {
              key: "LUCAMS_SHIPPING_ZONES",
              kind: "SETTING",
              type: "TEXTAREA",
              label: "Zonas con envío propio (por ciudad)",
              helpText:
                "JSON { cityCode DANE: [ids de zona] } habilitadas para mensajería propia. Se gestiona desde /admin/envios.",
              category: "COMMERCE",
              body: "{}",
              sortOrder: 80,
            },
            {
              key: "SHIPPING_DISABLED_CARRIERS",
              kind: "SETTING",
              type: "TEXTAREA",
              label: "Transportadoras deshabilitadas",
              helpText:
                "JSON con nombres de transportadoras de Aveonline ocultas en el checkout. Se gestiona desde /admin/envios.",
              category: "COMMERCE",
              body: "[]",
              sortOrder: 90,
            },
            {
              key: "SHIPPING_CARRIER_RULES",
              kind: "SETTING",
              type: "TEXTAREA",
              label: "Reglas de peso por transportadora",
              helpText:
                "JSON por transportadora normalizada ({ minWeightKg, maxWeightKg, note }). Se gestiona desde /admin/envios.",
              category: "COMMERCE",
              body: '{"transprensa":{"minWeightKg":11,"maxWeightKg":null,"note":"No opera envíos de menos de 11 kg"}}',
              sortOrder: 100,
            },
            {
              key: "LOYALTY_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Programa Puntos Lucams activo",
              helpText:
                "Activa la acumulación y redención de puntos. Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "false",
              sortOrder: 110,
            },
            {
              key: "LOYALTY_EARN_COP_PER_POINT",
              kind: "SETTING",
              type: "NUMBER",
              label: "Puntos Lucams: pesos por punto",
              helpText:
                "Pesos COP pagados que otorgan 1 punto (1000 = 1 punto por cada $1.000). Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "1000",
              sortOrder: 120,
            },
            {
              key: "LOYALTY_REDEEM_POINTS_PER_1000",
              kind: "SETTING",
              type: "NUMBER",
              label: "Puntos Lucams: puntos por $1.000 de descuento",
              helpText:
                "Equivalencia al redimir (100 = 100 puntos valen $1.000 COP). Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "100",
              sortOrder: 130,
            },
            {
              key: "LOYALTY_REDEEM_MIN_POINTS",
              kind: "SETTING",
              type: "NUMBER",
              label: "Puntos Lucams: mínimo de redención",
              helpText:
                "Mínimo de puntos redimibles por compra. Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "100",
              sortOrder: 140,
            },
            {
              key: "LOYALTY_REDEEM_MAX_PERCENT",
              kind: "SETTING",
              type: "NUMBER",
              label: "Puntos Lucams: tope de redención (%)",
              helpText:
                "% máximo del subtotal de productos pagable con puntos. Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "50",
              sortOrder: 150,
            },
            {
              key: "LOYALTY_EXPIRATION_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Puntos Lucams: expiración activa",
              helpText:
                "Preparada para vencimiento de puntos. Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "false",
              sortOrder: 160,
            },
            {
              key: "LOYALTY_EXPIRATION_DAYS",
              kind: "SETTING",
              type: "NUMBER",
              label: "Puntos Lucams: días de vigencia",
              helpText: "Días de vigencia de los puntos. Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "365",
              sortOrder: 170,
            },
            {
              key: "REFERRAL_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Programa Invita y gana activo",
              helpText:
                "Controla la emisión de cupones de bienvenida y recompensas por referido. Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "true",
              sortOrder: 180,
            },
            {
              key: "REFERRAL_REWARD_PERCENT",
              kind: "SETTING",
              type: "NUMBER",
              label: "Invita y gana: % de recompensa",
              helpText:
                "% OFF de los cupones emitidos por referido. Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "10",
              sortOrder: 190,
            },
            {
              key: "REFERRAL_REWARD_DAYS",
              kind: "SETTING",
              type: "NUMBER",
              label: "Invita y gana: días de vigencia del cupón",
              helpText:
                "Días de vigencia de los cupones de referidos nuevos. Se gestiona desde /admin/fidelizacion.",
              category: "COMMERCE",
              body: "90",
              sortOrder: 200,
            },
            {
              key: "CART_RECOVERY_ENABLED",
              kind: "SETTING",
              type: "BOOLEAN",
              label: "Recuperación de carritos activa",
              helpText:
                "Kill-switch del módulo de carritos abandonados (cron y manual). Se gestiona desde /admin/carritos/configuracion.",
              category: "COMMERCE",
              body: "true",
              sortOrder: 210,
            },
            {
              key: "CART_RECOVERY_MODE",
              kind: "SETTING",
              type: "TEXT",
              label: "Recuperación de carritos: modo",
              helpText:
                '"automatic" (cron automático) o "manual" (solo envío manual desde /admin/carritos). Se gestiona desde /admin/carritos/configuracion.',
              category: "COMMERCE",
              body: "automatic",
              sortOrder: 220,
            },
            {
              key: "CART_RECOVERY_IDLE_HOURS",
              kind: "SETTING",
              type: "NUMBER",
              label: "Recuperación de carritos: horas de inactividad",
              helpText:
                "Horas sin actividad antes de considerar el carrito abandonado. Se gestiona desde /admin/carritos/configuracion.",
              category: "COMMERCE",
              body: "4",
              sortOrder: 230,
            },
            {
              key: "CART_RECOVERY_MAX_REMINDERS",
              kind: "SETTING",
              type: "NUMBER",
              label: "Recuperación de carritos: recordatorios máximos",
              helpText:
                "Número máximo de recordatorios por carrito. Se gestiona desde /admin/carritos/configuracion.",
              category: "COMMERCE",
              body: "1",
              sortOrder: 240,
            },
            {
              key: "CART_RECOVERY_INTERVAL_HOURS",
              kind: "SETTING",
              type: "NUMBER",
              label: "Recuperación de carritos: horas entre recordatorios",
              helpText:
                "Horas mínimas entre recordatorios al mismo carrito. Se gestiona desde /admin/carritos/configuracion.",
              category: "COMMERCE",
              body: "24",
              sortOrder: 250,
            },
          ],
        },
        {
          key: "legal",
          title: "Versión de consentimiento",
          settingCategories: ["LEGAL"],
          sortOrder: 60,
          fields: [
            {
              key: "PRIVACY_POLICY_VERSION",
              kind: "SETTING",
              type: "TEXT",
              label: "Versión vigente del Aviso de Privacidad",
              helpText:
                "Identificador trazable guardado cuando un titular acepta tratamiento de datos.",
              category: "LEGAL",
              body: "v3 · 2026-11-05",
              sortOrder: 10,
            },
          ],
        },
        {
          key: "copyright",
          title: "Copyright e identidad en correos",
          settingCategories: ["COPYRIGHT"],
          sortOrder: 70,
          fields: [
            {
              key: "COPYRIGHT_YEAR",
              kind: "SETTING",
              type: "NUMBER",
              label: "Año del copyright",
              helpText: "Aparece en el pie del sitio y de los correos.",
              category: "COPYRIGHT",
              body: "2026",
              sortOrder: 10,
            },
            {
              key: "COPYRIGHT_TAGLINE",
              kind: "SETTING",
              type: "TEXT",
              label: "Tagline del copyright",
              helpText: "Aparece después del © en el pie del sitio y de los correos.",
              category: "COPYRIGHT",
              body: "Hecho con 💜 en Bogotá",
              sortOrder: 20,
            },
            {
              key: "LEGAL_ENTITY_LINE",
              kind: "SETTING",
              type: "TEXT",
              label: "Identidad del proveedor (correos)",
              helpText:
                "Línea legal al pie de los correos transaccionales. No incluir cédula ni dirección privada.",
              category: "COPYRIGHT",
              body: "Lucams Shop (persona natural) · Bogotá D.C., Colombia · Identificación de la titular disponible a requerimiento del consumidor",
              sortOrder: 30,
            },
          ],
        },
        {
          key: "externos",
          title: "Enlaces oficiales externos",
          settingCategories: ["EXTERNAL"],
          sortOrder: 80,
          fields: [
            {
              key: "GOVT_SIC_URL",
              kind: "SETTING",
              type: "URL",
              label: "URL de la SIC (Superintendencia de Industria y Comercio)",
              helpText: "Enlace oficial de protección al consumidor en el pie de página.",
              category: "EXTERNAL",
              body: "https://www.sic.gov.co",
              sortOrder: 10,
            },
          ],
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Resolutores de sección (compatibilidad para utilidades/seeds).
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_SECTION = { pageSlug: "sistema", sectionKey: "mantenimiento" };

/** Bloque: busca primero coincidencia exacta en fields y luego por prefijo. */
export function resolveBlockSection(key) {
  for (const page of SITE_MAP.pages) {
    for (const section of page.sections) {
      if (section.fields?.some((f) => f.key === key)) {
        return { pageSlug: page.slug, sectionKey: section.key };
      }
    }
  }
  for (const page of SITE_MAP.pages) {
    for (const section of page.sections) {
      if (section.prefixes?.some((p) => key.startsWith(p))) {
        return { pageSlug: page.slug, sectionKey: section.key };
      }
    }
  }
  return FALLBACK_SECTION;
}

/** Setting: sección cuya lista de categorías incluya la categoría. */
export function resolveSettingSection(category) {
  for (const page of SITE_MAP.pages) {
    for (const section of page.sections) {
      if (section.settingCategories?.includes(category)) {
        return { pageSlug: page.slug, sectionKey: section.key };
      }
    }
  }
  return { pageSlug: "global", sectionKey: "comercio" };
}
