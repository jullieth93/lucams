/*
 * Seed Ruta A — extensión del CMS in-house (2026-07-29).
 *
 * Siembra los bloques de contenido que hoy están "planos" en código, para
 * que Lucy los edite desde /admin/contenido/bloques. Idempotente: solo
 * CREA los que falten; jamás pisa el body de uno existente (respeta las
 * ediciones manuales).
 *
 * Fase 1 — FAQ (/ayuda): la página YA itera getCmsBlocksByCategory("FAQ")
 * con fallback; la categoría estaba vacía. Prefijo numérico en la key =
 * orden editorial (la página ordena por key ascendente).
 *
 * Uso: node --env-file=../../apps/web/.env.local scripts/seed-cms-ruta-a.mjs
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const FAQS = [
  {
    key: "faq.01-como-personalizo",
    title: "¿Cómo personalizo un producto?",
    body: "Elige el producto, haz clic en **Personalizar** y lo diseñas en vivo en nuestro Estudio: subes tus fotos, agregas texto y plantillas, y lo ves con vista previa 3D. Al terminar, lo agregas al carrito.",
  },
  {
    key: "faq.02-cuanto-demora",
    title: "¿Cuánto demora mi pedido?",
    body: "Lo producimos a mano y lo **entregamos en máximo 3 días hábiles** (2 de fabricación + 1 de entrega) desde que confirmas. El tránsito final lo pone la transportadora; al despachar te enviamos el número de guía para que sigas tu pedido.",
  },
  {
    key: "faq.03-metodos-pago",
    title: "¿Qué métodos de pago aceptan?",
    body: "Tarjetas de crédito y débito, PSE (cuentas bancarias), Nequi, Bancolombia transferencia y Daviplata. Todos los pagos los procesa Wompi de forma segura (pasarela certificada). También aceptamos **pago contraentrega**: pagas en efectivo al recibir tu pedido.",
  },
  {
    key: "faq.04-envios-cobertura",
    title: "¿Hacen envíos a mi ciudad?",
    body: "Llegamos a **1.100+ destinos** en Colombia a través de nuestras transportadoras aliadas. Al hacer el pedido calculamos automáticamente el costo, el tiempo estimado y qué transportadora llega a tu ciudad.",
  },
  {
    key: "faq.05-cambios-devoluciones",
    title: "¿Cómo cambio o devuelvo un producto?",
    body: "Tienes **5 días hábiles** desde la entrega para retractarte (Ley 1480 art. 47), excepto en productos personalizados. Para garantía: 1 año desde la entrega. [Más detalles](/legal/devoluciones).",
  },
  {
    key: "faq.06-comprobante-venta",
    title: "¿Puedo pedir comprobante de venta de mi compra?",
    body: "Claro. Cuéntanos tus datos de facturación (nombre o razón social, cédula o NIT, y correo) al confirmar tu pedido y te enviamos el comprobante de tu compra a tu correo. Hoy no emitimos factura electrónica de la DIAN; te entregamos el documento equivalente que corresponda según nuestro régimen tributario.",
  },
  {
    key: "faq.07-datos-personales",
    title: "¿Cómo manejan mis datos personales?",
    body: "Tratamos tus datos según la **Ley 1581 de 2012** y nuestro [Aviso de Privacidad](/legal/privacidad). Puedes ejercer hábeas data (acceso, rectificación, supresión, revocación) escribiéndonos.",
  },
  {
    key: "faq.08-borrar-mis-datos",
    title: "¿Cómo borro mi cuenta y mis datos?",
    body: "Escríbenos a **hola@lucamsshop.com** desde el email registrado. Procesamos la supresión dentro de **10 días hábiles**. Más info en [Hábeas Data](/legal/habeas-data).",
  },
  {
    key: "faq.09-newsletter-unsuscripcion",
    title: "¿Cómo me suscribo o desuscribo del newsletter?",
    body: "Suscripción: form en el footer. Desuscripción: link **Cancelar suscripción** al final de cada email que te enviemos, o escríbenos a hola@lucamsshop.com.",
  },
  {
    key: "faq.10-regalos-eventos",
    title: "¿Hacen pedidos al por mayor o para eventos corporativos?",
    body: "¡Sí! Bodas, baby showers, eventos corporativos, recordatorios para regalos. Escríbenos por WhatsApp con tu idea y volumen y te pasamos cotización personalizada.",
  },
];

// Fase 2 — microcopy del checkout (Ruta A). Categoría HOME (copy del sitio).
// `checkout.envio.subtext` admite el token {{ciudad}} (ver splitCityTemplate).
const CHECKOUT_MICROCOPY = [
  {
    key: "checkout.envio.heading",
    category: "HOME",
    title: "Checkout · Envío — título",
    body: "Elige cómo te lo enviamos",
  },
  {
    key: "checkout.envio.subtext",
    category: "HOME",
    title: "Checkout · Envío — subtexto (usa {{ciudad}})",
    body: "Cotizamos con Aveonline para {{ciudad}}.",
  },
  {
    key: "checkout.pago.heading",
    category: "HOME",
    title: "Checkout · Pago — título",
    body: "Método de pago",
  },
];

// Fase 3 — SEO por página estática (Ruta A): title = meta title, body = meta
// description. Los consume getPageSeo() en generateMetadata de cada página.
const SEO_PAGES = [
  {
    key: "seo.page.home",
    category: "HOME",
    title: "Lucams_shop — Tus recuerdos en imán",
    body: "Imanes magnéticos personalizados, fotoimanes, recuerdos para eventos, calendarios y planners. Hechos a mano en Colombia con entrega a 1.100+ destinos.",
    description: "SEO de la home: Título = <title>, Cuerpo = meta description.",
  },
  {
    key: "seo.page.ayuda",
    category: "HOME",
    title: "Ayuda",
    body: "Preguntas frecuentes sobre personalización, envíos, métodos de pago, garantías y devoluciones en Lucams_shop.",
    description: "SEO de /ayuda: Título = <title>, Cuerpo = meta description.",
  },
  {
    key: "seo.page.contacto",
    category: "HOME",
    title: "Contacto",
    body: "Escríbenos por WhatsApp, email o el formulario. Te respondemos en menos de 24 horas hábiles.",
    description: "SEO de /contacto: Título = <title>, Cuerpo = meta description.",
  },
];

// Fase 4 — patrón emails editables (Ruta A): subject + preview por plantilla.
// El body HTML queda en código a propósito (variables + layout + cumplimiento).
// Migrada como prueba del patrón: newsletter-welcome. Backlog: las otras 12.
const EMAIL_BLOCKS = [
  {
    key: "email.welcome.subject",
    category: "EMAIL",
    title: "Email bienvenida newsletter — asunto",
    body: "¡Estás dentro! 💜",
    description: "Asunto del email de bienvenida al newsletter.",
  },
  {
    key: "email.welcome.preview",
    category: "EMAIL",
    title: "Email bienvenida newsletter — preheader",
    body: "Gracias por sumarte. Esto es lo que viene.",
    description: "Texto de vista previa (preheader) del email de bienvenida.",
  },
];

// Fase 5 — completion (2026-07-29): todo texto visible del sitio queda editable
// en /admin/contenido/bloques (Lucy: "que todo esto se administre desde el
// Admin"). Son los blockKeys que antes solo tenían fallback en código.
// LEGAL queda fuera A PROPÓSITO (textos de cumplimiento, no edición casual).
const COMPLETION = [
  // HOME
  {
    key: "home.hero.title-prefix",
    category: "HOME",
    title: "Hero — título (parte 1)",
    body: "Tus recuerdos, ",
  },
  {
    key: "home.hero.title-accent",
    category: "HOME",
    title: "Hero — título (acento rosa)",
    body: "en imán",
  },
  {
    key: "home.hero.chip-studio",
    category: "HOME",
    title: "Hero — chip Estudio",
    body: "Estudio de diseño en vivo ✨",
  },
  {
    key: "home.hero.chip-cod",
    category: "HOME",
    title: "Hero — chip contraentrega",
    body: "Pago contraentrega disponible",
  },
  {
    key: "home.hero.chip-eta",
    category: "HOME",
    title: "Hero — chip entrega (usa tokens {{total}}/{{fab}}/{{entrega}})",
    body: "Entrega en máx. {{total}} días hábiles ({{fab}} de fabricación + {{entrega}} de entrega)",
  },
  {
    key: "home.featured.empty",
    category: "HOME",
    title: "Destacados — texto vacío",
    body: "Cargando destacados pronto ✨",
  },
  {
    key: "pdp.related.heading",
    category: "HOME",
    title: "PDP — título relacionados",
    body: "También te puede gustar",
  },
  // FOOTER
  {
    key: "footer.column.info",
    category: "FOOTER",
    title: "Footer — columna Información",
    body: "Información",
  },
  {
    key: "footer.column.shop",
    category: "FOOTER",
    title: "Footer — columna Tienda",
    body: "Tienda",
  },
  {
    key: "footer.column.support",
    category: "FOOTER",
    title: "Footer — columna Atención cliente",
    body: "Atención cliente",
  },
  {
    key: "footer.shop.cta-all",
    category: "FOOTER",
    title: "Footer — link Ver todo",
    body: "Ver todo →",
  },
  // SUPPORT (contacto / ayuda / mi-cuenta / status)
  {
    key: "support.contacto.heading",
    category: "SUPPORT",
    title: "Contacto — título",
    body: "Hablemos",
  },
  {
    key: "support.contacto.subtext",
    category: "SUPPORT",
    title: "Contacto — subtexto",
    body: "¿Una idea, una duda, un pedido especial? Escríbenos por el medio que prefieras. Te respondemos en menos de 24h hábiles.",
  },
  {
    key: "support.contacto.form-heading",
    category: "SUPPORT",
    title: "Contacto — título form",
    body: "Escríbenos por aquí",
  },
  {
    key: "support.contacto.form-subtext",
    category: "SUPPORT",
    title: "Contacto — subtexto form",
    body: "Te respondemos al email que nos dejes.",
  },
  {
    key: "support.contacto.wa-copy",
    category: "SUPPORT",
    title: "Contacto — copy WhatsApp",
    body: "El canal más rápido. Te respondemos en minutos durante horario hábil.",
  },
  {
    key: "support.help.heading",
    category: "SUPPORT",
    title: "Ayuda — título",
    body: "Centro de ayuda",
  },
  {
    key: "support.help.subtext",
    category: "SUPPORT",
    title: "Ayuda — subtexto",
    body: "¿Tienes una pregunta? Acá las respuestas a las dudas más comunes. Si no encuentras lo que buscas, escríbenos.",
  },
  {
    key: "support.help.cta.heading",
    category: "SUPPORT",
    title: "Ayuda — CTA título",
    body: "¿No resolvimos tu duda?",
  },
  {
    key: "support.help.cta.subtext",
    category: "SUPPORT",
    title: "Ayuda — CTA subtexto",
    body: "Escríbenos por WhatsApp o email y te respondemos en menos de 24h.",
  },
  {
    key: "account.orders.heading",
    category: "SUPPORT",
    title: "Mi cuenta — título pedidos",
    body: "Mis pedidos",
  },
  {
    key: "account.orders.empty.title",
    category: "SUPPORT",
    title: "Mi cuenta — vacío título",
    body: "Aún no has hecho un pedido",
  },
  {
    key: "account.orders.empty.subtext",
    category: "SUPPORT",
    title: "Mi cuenta — vacío subtexto",
    body: "Cuando hagas tu primer pedido aparecerá aquí con todos los detalles ✨",
  },
  {
    key: "status.heading",
    category: "SUPPORT",
    title: "Status — título",
    body: "Estado de Lucams_shop",
  },
  // MAINTENANCE
  {
    key: "maintenance.title",
    category: "MAINTENANCE",
    title: "Mantenimiento — título",
    body: "Estamos puliendo unos detalles ✨",
  },
  {
    key: "maintenance.description",
    category: "MAINTENANCE",
    title: "Mantenimiento — descripción",
    body: "Volvemos en unas horas con todo brillando. Mientras tanto, escríbenos por WhatsApp si necesitas ayuda urgente.",
  },
];

let created = 0;
let skipped = 0;

for (const b of [...FAQS, ...CHECKOUT_MICROCOPY, ...SEO_PAGES, ...EMAIL_BLOCKS, ...COMPLETION]) {
  const existing = await prisma.cmsBlock.findUnique({ where: { key: b.key } });
  if (existing) {
    skipped++;
    console.log(`  ↷ ${b.key} (ya existe — no se toca)`);
    continue;
  }
  await prisma.$transaction(async (tx) => {
    const block = await tx.cmsBlock.create({
      data: {
        key: b.key,
        title: b.title,
        body: b.body,
        format: "MARKDOWN",
        category: b.category ?? "FAQ",
        description:
          b.description ?? "FAQ visible en /ayuda. Edita título (pregunta) y cuerpo (respuesta).",
        isPublished: true,
      },
    });
    const version = await tx.cmsBlockVersion.create({
      data: {
        blockId: block.id,
        version: 1,
        title: b.title,
        body: b.body,
        format: "MARKDOWN",
        publishedAt: new Date(),
      },
    });
    await tx.cmsBlock.update({
      where: { id: block.id },
      data: { publishedVersionId: version.id },
    });
  });
  created++;
  console.log(`  ✓ ${b.key}`);
}

console.log(`\nRuta A: ${created} creados · ${skipped} ya existían`);
await prisma.$disconnect();
