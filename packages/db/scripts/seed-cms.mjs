/*
 * Seed CMS — pobla CmsBlock + SiteSetting con todo el contenido
 * editable del sitio (~32 bloques + ~33 settings).
 *
 * Idempotente: usa upsert por key. Re-ejecutar NO duplica.
 *
 * Después de correr este seed, los archivos del repo (legal/*, home,
 * footer, empty states, lib/wa.ts) leen su contenido desde DB con
 * fallback al hardcoded. Lucy edita desde /admin/contenido.
 *
 * Uso:
 *   make seed-cms
 *
 * ⚠️ CACHÉ CMS (2026-07-23): este script edita contenido CMS DIRECTO en DB → el sitio
 * público sigue sirviendo la versión cacheada (unstable_cache tag "cms", TTL 1h) hasta
 * que alguien la invalide. Después de correrlo: /admin/contenido (Bloques o
 * Configuración) → botón "Actualizar caché de contenido".
 */

import { PrismaClient } from "@prisma/client";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== seed-cms ===");
console.log("");

// ─────────────────────────────────────────────────────────────────────
// CmsBlocks — contenido prosa larga (markdown).
// ─────────────────────────────────────────────────────────────────────

const blocks = [
  // ──────────── LEGAL (8) ────────────
  {
    key: "legal.privacidad",
    title: "Aviso de Privacidad",
    category: "LEGAL",
    format: "MARKDOWN",
    description: "Aparece en /legal/privacidad y en el link del footer.",
    body: `En **Lucams_shop** protegemos tus datos personales conforme a la **Ley 1581 de 2012** (Régimen General de Protección de Datos Personales) y el **Decreto 1377 de 2013** que la reglamenta.

## Responsable del tratamiento

**Lucams_shop** opera como emprendimiento de comercio electrónico de productos magnéticos personalizados con domicilio en **Bogotá D.C., Colombia**.

Datos de contacto del responsable:

- Email: **hola@lucamsshop.com**
- WhatsApp: +57 320 887 3826
- Sitio web: [lucamsshop.com](https://lucamsshop.com)

## Datos personales que tratamos

Recolectamos datos para procesar tu pedido y mejorar tu experiencia:

- **Identificación:** nombre, apellidos, documento de identidad (para facturación si aplica)
- **Contacto:** email, teléfono, dirección de envío
- **Comerciales:** historial de pedidos, productos vistos, preferencias
- **Técnicos:** dirección IP, navegador, dispositivo (en cumplimiento con tu consentimiento de cookies)
- **Imágenes:** fotos que subes para personalizar productos (tratadas con confidencialidad — ver Estudio de Personalización)

## Finalidades del tratamiento

Tus datos se usan únicamente para:

1. Procesar y entregar tus pedidos
2. Comunicarte el estado de tus pedidos (email/WhatsApp)
3. Cumplir obligaciones contables, tributarias y de garantía
4. Mejorar el sitio y los productos (analítica anónima si autorizas cookies analíticas)
5. Enviarte comunicaciones comerciales (solo si te suscribes al newsletter)

**No vendemos ni compartimos tus datos con terceros para sus propios fines comerciales.**

## Derechos como titular

Conforme al **artículo 8 de la Ley 1581**, tienes derecho a:

- **Conocer** qué datos tuyos tenemos y para qué los usamos
- **Actualizar** o **rectificar** información inexacta
- **Solicitar prueba** de la autorización otorgada
- **Ser informado** sobre el uso dado a tus datos
- **Revocar la autorización** o **solicitar la supresión** cuando no se respeten los principios legales
- **Presentar queja ante la SIC** (Superintendencia de Industria y Comercio)

Procedimiento detallado en [Hábeas Data](/legal/habeas-data).

## Subprocesadores

Algunos servicios técnicos tratan datos en nuestro nombre (hosting, procesamiento de pagos, envío de emails, logística). Lista completa con DPA firmado en [Subprocesadores](/legal/subprocesadores).

## Cookies

Usamos cookies necesarias para que el sitio funcione y opcionales para mejorar la experiencia. Detalle y panel de preferencias en [Política de Cookies](/legal/cookies).

## Conservación de datos

Mantenemos tus datos mientras tengas cuenta activa o exista relación comercial. Datos contables se conservan por **10 años** conforme al Código de Comercio. Puedes solicitar supresión anticipada vía [Hábeas Data](/legal/habeas-data) — evaluamos cada solicitud según base legal.

## Reclamos

Si consideras que vulneramos tus derechos, puedes presentar queja ante la **Superintendencia de Industria y Comercio (SIC)**: [sic.gov.co](https://www.sic.gov.co/).

## Más información

- [Términos y Condiciones](/legal/terminos)
- [Hábeas Data — ejercicio de derechos](/legal/habeas-data)
- [Política de Cookies](/legal/cookies)
- [Subprocesadores](/legal/subprocesadores)

*Versión 1.1 — actualizada el 13 de mayo de 2026. Documento sujeto a revisión por asesoría legal antes del lanzamiento productivo.*`,
  },
  {
    key: "legal.terminos",
    title: "Términos y Condiciones",
    category: "LEGAL",
    format: "MARKDOWN",
    description: "Aparece en /legal/terminos y en el link del footer.",
    body: `Al usar **lucamsshop.com** aceptas estos Términos y Condiciones de uso y compra. Los productos vendidos están sujetos a la legislación colombiana, en particular la **Ley 1480 de 2011** (Estatuto del Consumidor) y la **Ley 2439 de 2024** que modifica disposiciones de comercio electrónico.

## Precios y pagos

Todos los precios en pesos colombianos (COP) incluyen IVA cuando aplique. Aceptamos los siguientes medios de pago:

- Tarjetas crédito/débito y PSE vía Wompi
- Nequi, Bancolombia transferencia, Daviplata (vía Wompi)
- Pago contraentrega con Coordinadora (donde aplique)

## Derecho de retracto

Según el **artículo 47 de la Ley 1480 de 2011**, tienes derecho a retractarte dentro de los **5 días hábiles** siguientes a la entrega, sin necesidad de justificar tu decisión. Conforme a la **Ley 2439 de 2024**, una vez ejerces el retracto y nos entregas el producto, el reembolso se efectúa dentro de **15 días calendario**.

Este derecho no aplica a **productos personalizados conforme a tus especificaciones** (foto-imanes, calendarios con tus fotos, recordatorios de eventos con datos de tu evento, imanes publicitarios con tu logo, etc.) por su naturaleza única e irrepetible (Ley 1480 art. 47 numeral 1).

Ver [Devoluciones y Retracto](/legal/devoluciones) para el procedimiento detallado.

## Garantía legal

Conforme al **artículo 11 de la Ley 1480**, ofrecemos garantía legal de **un año** contado desde la fecha de entrega para defectos de fabricación, materiales o funcionamiento. Ver [Garantías](/legal/garantias).

## Privacidad

Tu información se trata conforme a la **Ley 1581 de 2012** y el **Decreto 1377 de 2013**. Detalles en [Aviso de Privacidad](/legal/privacidad).

## Reclamos

Si tu reclamo no se resuelve, puedes acudir a la Superintendencia de Industria y Comercio (SIC): [sic.gov.co](https://www.sic.gov.co/).

*Documento en revisión por asesoría legal — versión 1.1 actualizada el 13 de mayo de 2026 con Ley 2439 de 2024.*`,
  },
  {
    key: "legal.cookies",
    title: "Política de Cookies",
    category: "LEGAL",
    format: "HTML",
    description: "Aparece en /legal/cookies. Contiene tabla — usa formato HTML.",
    body: `<p>Usamos cookies para que el sitio funcione (autenticación, carrito) y para mejorar tu experiencia. Detallamos cada cookie y su propósito en cumplimiento de la <strong>Ley 1581 de 2012</strong>.</p>

<h2>Cookies que usamos actualmente</h2>

<table>
  <thead>
    <tr>
      <th>Nombre</th>
      <th>Propósito</th>
      <th>Retención</th>
      <th>Tercero</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>sb-*-auth-token</code></td>
      <td>Sesión de usuario (Supabase Auth)</td>
      <td>7 días</td>
      <td>Supabase</td>
    </tr>
    <tr>
      <td><code>cart_session</code></td>
      <td>Identifica tu carrito de compras antes y después del login</td>
      <td>30 días</td>
      <td>Lucams_shop</td>
    </tr>
  </tbody>
</table>

<p><em>Banner de consentimiento con granularidad (Necesarias / Funcionales / Analíticas / Marketing) próximamente — sub-bloque E del roadmap.</em></p>`,
  },
  {
    key: "legal.devoluciones",
    title: "Devoluciones y Retracto",
    category: "LEGAL",
    format: "MARKDOWN",
    description: "Aparece en /legal/devoluciones.",
    body: `## Derecho de retracto (Ley 1480 art. 47 + Ley 2439 de 2024)

Tienes **5 días hábiles** desde la entrega para retractarte sin justificación.

### Productos que NO admiten retracto

Conforme al **artículo 47 numeral 1 de la Ley 1480**, no se acepta retracto sobre productos personalizados conforme a tus especificaciones:

- Fotoimanes con tus fotos
- Calendarios con tus 12 fotos
- Recordatorios de eventos con datos personalizados (cumpleaños, bautizo, matrimonio, etc.)
- Imanes publicitarios con tu logo o información empresarial
- Cualquier producto donde tú hayas elegido la imagen, texto, layout o composición final

Esta excepción está claramente identificada en el catálogo: cualquier producto con la etiqueta "Personalizable" cae aquí.

## Cómo retractarte (productos NO personalizados)

1. **Escríbenos** a **hola@lucamsshop.com** o por WhatsApp dentro de los 5 días hábiles desde que recibiste el producto.
2. **Indica el medio de devolución** elegido (el mismo medio de pago original o cuenta bancaria).
3. **Devuelve el producto** en su empaque original sin uso (el costo del envío de devolución lo asume el consumidor según Ley 1480 art. 47).
4. **Reembolso** dentro de **15 días calendario** desde el momento en que cumpliste los requisitos (informaste el medio + devolviste el producto), conforme a la **Ley 2439 de 2024**.

Este plazo de 15 días calendario reemplaza el anterior de 30 días hábiles previsto en la Ley 1480 original.

## Garantía legal

Para defectos de fabricación o calidad (no retracto), ver [Garantías](/legal/garantias). El plazo y procedimiento es distinto.

## Reclamos

Si no quedas conforme con nuestra respuesta puedes acudir a la Superintendencia de Industria y Comercio (SIC): [sic.gov.co](https://www.sic.gov.co/).

*Actualizado 13 de mayo de 2026 — Ley 2439 de 2024.*`,
  },
  {
    key: "legal.garantias",
    title: "Garantías",
    category: "LEGAL",
    format: "MARKDOWN",
    description: "Aparece en /legal/garantias.",
    body: `## Garantía legal (Ley 1480 art. 11)

Todos los productos Lucams_shop tienen garantía legal de **1 año** desde la fecha de entrega para defectos de fabricación, materiales o funcionamiento.

## Qué cubre

- Imanes que se desprenden del soporte sin uso normal
- Impresión que se borra o decolora rápidamente sin exposición solar directa
- Productos entregados rotos por mal embalaje

## Qué NO cubre

- Daños por mal uso, golpes o exposición prolongada al sol/agua
- Desgaste natural del adhesivo en superficies no magnéticas

## Cómo ejercerla

Escribe a **hola@lucamsshop.com** con tu número de pedido y fotos del defecto. Respondemos lo antes posible, máximo en 1 día hábil. Reparación, reposición o devolución según corresponda dentro de los 30 días siguientes a la verificación.`,
  },
  {
    key: "legal.habeas-data",
    title: "Hábeas Data",
    category: "LEGAL",
    format: "MARKDOWN",
    description: "Aparece en /legal/habeas-data. Derechos del titular Ley 1581.",
    body: `Como titular de datos personales, conforme a la **Ley 1581 de 2012**, tienes los siguientes derechos sobre la información que Lucams_shop ha recolectado de ti:

## Tus derechos

- **Acceso:** conocer qué datos tuyos tenemos.
- **Rectificación:** corregir datos inexactos o desactualizados.
- **Actualización:** agregar información faltante.
- **Supresión:** eliminar datos cuando no haya base legal para conservarlos.
- **Revocación de la autorización:** retirar tu consentimiento en cualquier momento (newsletter, marketing, etc.).
- **Reclamo ante la SIC:** si consideras que vulneramos tus derechos puedes presentar queja ante la Superintendencia de Industria y Comercio.

## Cómo ejercer tus derechos

Escríbenos a **hola@lucamsshop.com** indicando:

1. Tu nombre completo y documento de identidad
2. Email con el que te registraste
3. El derecho que deseas ejercer
4. Una breve descripción de tu solicitud

Tenemos hasta **10 días hábiles** para responder consultas y **15 días hábiles** para reclamos. Si necesitamos más tiempo te avisaremos.

## Reclamo ante la SIC

Si no estás conforme con nuestra respuesta puedes acudir a la Superintendencia de Industria y Comercio: [sic.gov.co](https://www.sic.gov.co)`,
  },
  {
    key: "legal.subprocesadores",
    title: "Subprocesadores",
    category: "LEGAL",
    format: "HTML",
    description: "Aparece en /legal/subprocesadores. Tabla — usa formato HTML.",
    body: `<p>Lucams_shop usa los siguientes proveedores que pueden tratar datos personales en nuestro nombre. Mantenemos un Acuerdo de Procesamiento de Datos (DPA) firmado con cada uno, y exigimos garantías de seguridad adecuadas.</p>

<table>
  <thead>
    <tr>
      <th>Proveedor</th>
      <th>País</th>
      <th>Propósito</th>
      <th>DPA</th>
    </tr>
  </thead>
  <tbody>
    <tr><td><strong>Supabase</strong></td><td>US / EU</td><td>Base de datos PostgreSQL, autenticación, almacenamiento de archivos</td><td><a href="https://supabase.com/legal/dpa" target="_blank" rel="noopener">Ver</a></td></tr>
    <tr><td><strong>Vercel</strong></td><td>US</td><td>Hosting, despliegue y CDN del sitio web</td><td><a href="https://vercel.com/legal/dpa" target="_blank" rel="noopener">Ver</a></td></tr>
    <tr><td><strong>Resend</strong></td><td>US</td><td>Envío de emails transaccionales y newsletter</td><td><a href="https://resend.com/legal/dpa" target="_blank" rel="noopener">Ver</a></td></tr>
    <tr><td><strong>Wompi</strong></td><td>Colombia</td><td>Procesamiento de pagos (tarjetas y PSE)</td><td><a href="https://wompi.com/legal" target="_blank" rel="noopener">Ver</a></td></tr>
    <tr><td><strong>Venndelo / Coordinadora</strong></td><td>Colombia</td><td>Logística de envíos a 1.100+ destinos</td><td><a href="https://venndelo.com/legal" target="_blank" rel="noopener">Ver</a></td></tr>
    <tr><td><strong>Cloudflare</strong></td><td>US</td><td>Anti-bot Turnstile y protección DDoS</td><td><a href="https://www.cloudflare.com/cloudflare-customer-dpa/" target="_blank" rel="noopener">Ver</a></td></tr>
    <tr><td><strong>Anthropic (Claude API)</strong></td><td>US</td><td>Asistente IA para personalización de productos (futuro)</td><td><a href="https://www.anthropic.com/legal/dpa" target="_blank" rel="noopener">Ver</a></td></tr>
  </tbody>
</table>

<p><em>Notificaremos por email a clientes registrados cualquier cambio sustancial en este listado con al menos 30 días de anticipación.</em></p>`,
  },
  {
    key: "legal.security",
    title: "Seguridad",
    category: "LEGAL",
    format: "MARKDOWN",
    description: "Aparece en /legal/security. Responsible disclosure.",
    body: `## Divulgación responsable

Si encontraste una vulnerabilidad de seguridad en Lucams_shop, te agradecemos reportarla antes de divulgarla públicamente. Escríbenos a **security@lucamsshop.com** con:

- Descripción del problema
- Pasos para reproducir
- Impacto potencial
- Tu contacto para coordinar

Nos comprometemos a:

- Confirmar recepción en máximo 3 días hábiles
- Mantener tu identidad confidencial si lo prefieres
- Acreditarte públicamente al cerrar el reporte (si lo deseas)
- NO emprender acciones legales contra investigadores que actúen de buena fe

## Alcance

En scope: lucamsshop.com y sus subdominios. Fuera de scope: vulnerabilidades sociales (phishing a empleados), DoS volumétricos, problemas en proveedores de terceros (reportarlos a su programa).

## security.txt

Archivo machine-readable disponible en [/.well-known/security.txt](/.well-known/security.txt).`,
  },

  // ──────────── HOME (textos cortos / slogans) ────────────
  {
    key: "home.hero.badge",
    title: "Hero — Badge sobre el título",
    category: "HOME",
    format: "TEXT",
    description: "Aparece arriba del título principal del home. Ej: '✨ Hecho a mano en Bogotá'.",
    body: "✨ Hecho a mano en Bogotá",
  },
  {
    key: "home.hero.description",
    title: "Hero — Descripción bajo el título",
    category: "HOME",
    format: "TEXT",
    description: "Texto descriptivo bajo el título principal del home.",
    body: "Fotoimanes, recuerdos para eventos, calendarios y planners magnéticos personalizables. Entrega a 1.100+ destinos de Colombia.",
  },
  {
    key: "home.hero.cta-primary",
    title: "Hero — Botón principal",
    category: "HOME",
    format: "TEXT",
    description: "Texto del botón morado principal del hero.",
    body: "Ver catálogo →",
  },
  {
    key: "home.hero.cta-secondary",
    title: "Hero — Botón secundario",
    category: "HOME",
    format: "TEXT",
    description: "Texto del botón outline del hero (WhatsApp).",
    body: "Personalizar el mío",
  },
  {
    key: "home.categories.heading",
    title: "Home — Encabezado sección Categorías",
    category: "HOME",
    format: "TEXT",
    description: "Encabezado de la sección de categorías visuales.",
    body: "Explora las categorías",
  },
  {
    key: "home.categories.subtext",
    title: "Home — Subtexto sección Categorías",
    category: "HOME",
    format: "TEXT",
    description: "Texto bajo el encabezado de categorías.",
    body: "Imanes para cada rincón de tu vida.",
  },
  {
    key: "home.howitworks.heading",
    title: "Home — Encabezado 'Así de fácil'",
    category: "HOME",
    format: "TEXT",
    description: "Encabezado de los 3 pasos.",
    body: "Así de fácil",
  },
  {
    key: "home.howitworks.subtext",
    title: "Home — Subtexto 'Así de fácil'",
    category: "HOME",
    format: "TEXT",
    description: "Texto bajo el encabezado de los 3 pasos.",
    body: "Tu imán hecho con cariño en 3 pasos.",
  },
  {
    key: "home.howitworks.step1.title",
    title: "Paso 1 — Título",
    category: "HOME",
    format: "TEXT",
    description: "Título del paso 1 'Así de fácil'.",
    body: "Eliges",
  },
  {
    key: "home.howitworks.step1.description",
    title: "Paso 1 — Descripción",
    category: "HOME",
    format: "TEXT",
    description: "Descripción del paso 1.",
    body: "Eliges el formato que más te guste en nuestro catálogo. Hay opciones para fotos, eventos, organización y más.",
  },
  {
    key: "home.howitworks.step2.title",
    title: "Paso 2 — Título",
    category: "HOME",
    format: "TEXT",
    body: "Personalizas",
  },
  {
    key: "home.howitworks.step2.description",
    title: "Paso 2 — Descripción",
    category: "HOME",
    format: "TEXT",
    body: "Diseñas tu imán en vivo en nuestro Estudio: subes fotos, agregas texto y plantillas, y lo ves con vista previa 3D. ¡Sin salir del sitio!",
  },
  {
    key: "home.howitworks.step3.title",
    title: "Paso 3 — Título",
    category: "HOME",
    format: "TEXT",
    body: "Llega a tus manos",
  },
  {
    key: "home.howitworks.step3.description",
    title: "Paso 3 — Descripción",
    category: "HOME",
    format: "TEXT",
    body: "Lo producimos a mano y lo entregamos en máximo 3 días hábiles (2 de fabricación + 1 de entrega). El tiempo final depende de la transportadora y de tu ciudad. El pago y el envío se acuerdan por WhatsApp — contraentrega disponible.",
  },
  {
    key: "home.featured.heading",
    title: "Home — Encabezado Productos Destacados",
    category: "HOME",
    format: "TEXT",
    body: "Imanes que están enamorando",
  },
  {
    key: "home.featured.subtext",
    title: "Home — Subtexto Productos Destacados",
    category: "HOME",
    format: "TEXT",
    body: "Los favoritos de la temporada.",
  },
  {
    key: "home.reviews.heading",
    title: "Home — Encabezado Reseñas",
    category: "HOME",
    format: "TEXT",
    body: "Lo que dicen quienes ya nos compran",
  },
  {
    key: "home.reviews.subtext",
    title: "Home — Subtexto Reseñas",
    category: "HOME",
    format: "TEXT",
    body: "Historias reales de neveras felices.",
  },
  {
    key: "home.cta.heading",
    title: "Home — CTA cierre Encabezado",
    category: "HOME",
    format: "TEXT",
    body: "¿Tienes una idea distinta?",
  },
  {
    key: "home.cta.description",
    title: "Home — CTA cierre Descripción",
    category: "HOME",
    format: "TEXT",
    body: "Cotizamos a medida: regalos corporativos, eventos, bodas y proyectos especiales.",
  },

  // ──────────── FOOTER ────────────
  {
    key: "footer.tagline",
    title: "Footer — Tagline bajo el logo",
    category: "FOOTER",
    format: "TEXT",
    description: "Texto descriptivo bajo el logo Lucams en el footer.",
    body: "Tus recuerdos, en imán. Hechos a mano con cariño en Bogotá.",
  },
  {
    key: "footer.newsletter.heading",
    title: "Footer — Newsletter Encabezado",
    category: "FOOTER",
    format: "TEXT",
    body: "Recibe el correo del cariño 💜",
  },
  {
    key: "footer.newsletter.description",
    title: "Footer — Newsletter Descripción",
    category: "FOOTER",
    format: "TEXT",
    body: "Lanzamientos, promos y curaduría kawaii. Sin spam — máximo una vez al mes.",
  },

  // ──────────── EMPTY_STATE ────────────
  {
    key: "error.404.title",
    title: "404 — Título",
    category: "EMPTY_STATE",
    format: "TEXT",
    description: "Aparece cuando alguien entra a una URL que no existe.",
    body: "Esta página se nos perdió 👀",
  },
  {
    key: "error.404.description",
    title: "404 — Descripción",
    category: "EMPTY_STATE",
    format: "TEXT",
    body: "Probablemente cambiamos algo de lugar o el link tiene un typo. Te ayudamos a volver:",
  },
  {
    key: "error.500.title",
    title: "Error genérico — Título",
    category: "EMPTY_STATE",
    format: "TEXT",
    description: "Aparece cuando el sitio falla por una excepción inesperada.",
    body: "Algo salió mal de nuestro lado",
  },
  {
    key: "error.500.description",
    title: "Error genérico — Descripción",
    category: "EMPTY_STATE",
    format: "TEXT",
    body: "Ya quedó registrado. Puedes intentar de nuevo o volver al inicio.",
  },
  {
    key: "cart.empty.title",
    title: "Carrito vacío — Título",
    category: "EMPTY_STATE",
    format: "TEXT",
    body: "Tu carrito está vacío",
  },
  {
    key: "cart.empty.description",
    title: "Carrito vacío — Descripción",
    category: "EMPTY_STATE",
    format: "TEXT",
    body: "Encuentra el imán perfecto para tu nevera.",
  },
  {
    key: "search.empty.text",
    title: "Búsqueda vacía — Texto",
    category: "EMPTY_STATE",
    format: "TEXT",
    description: "Aparece cuando una búsqueda no tiene resultados ni sugerencias.",
    body: "Nada por aquí — prueba con otra palabra.",
  },
  {
    key: "home.reviews.empty",
    title: "Reseñas vacías en home — Texto",
    category: "EMPTY_STATE",
    format: "TEXT",
    description: "Aparece en home cuando no hay reseñas destacadas todavía.",
    body: "Sé el primero en contarnos cómo te llegó tu imán 💜",
  },
];

console.log(`Creando/actualizando ${blocks.length} bloques de contenido...`);
let blocksCreated = 0;
let blocksUpdated = 0;
for (const b of blocks) {
  const existing = await prisma.cmsBlock.findUnique({ where: { key: b.key } });
  if (existing) {
    // Si el bloque ya existe, solo actualizamos descripción + título + category
    // (NO tocamos body para no pisar ediciones manuales de Lucy).
    await prisma.cmsBlock.update({
      where: { id: existing.id },
      data: {
        title: b.title,
        category: b.category,
        description: b.description ?? null,
        deletedAt: null,
      },
    });
    blocksUpdated++;
  } else {
    // Bloque nuevo: crear con versión 1 publicada de una.
    await prisma.$transaction(async (tx) => {
      const block = await tx.cmsBlock.create({
        data: {
          key: b.key,
          title: b.title,
          body: b.body,
          format: b.format,
          category: b.category,
          description: b.description ?? null,
          isPublished: true,
        },
      });
      const version = await tx.cmsBlockVersion.create({
        data: {
          blockId: block.id,
          version: 1,
          title: b.title,
          body: b.body,
          format: b.format,
          publishedAt: new Date(),
        },
      });
      await tx.cmsBlock.update({
        where: { id: block.id },
        data: { publishedVersionId: version.id },
      });
    });
    blocksCreated++;
  }
  console.log(`  ${existing ? "↻" : "✓"} ${b.key}`);
}
console.log(`  → ${blocksCreated} nuevos · ${blocksUpdated} actualizados (sin pisar body)`);
console.log("");

// ─────────────────────────────────────────────────────────────────────
// SiteSettings — configurables atómicos key:value.
// ─────────────────────────────────────────────────────────────────────

const settings = [
  // CONTACT
  {
    key: "CONTACT_EMAIL",
    value: "hola@lucamsshop.com",
    valueType: "EMAIL",
    label: "Email de contacto público",
    description: "Aparece en footer, páginas legales y formulario de contacto.",
    category: "CONTACT",
  },
  {
    key: "SECURITY_EMAIL",
    value: "security@lucamsshop.com",
    valueType: "EMAIL",
    label: "Email de seguridad",
    description: "Para reportes de vulnerabilidad. Aparece en /legal/security.",
    category: "CONTACT",
  },

  // BUSINESS
  {
    key: "BUSINESS_HOURS",
    value: "Lun-Sáb 9am – 7pm COT",
    valueType: "TEXT",
    label: "Horario de atención",
    description: "Aparece en footer columna 'Atención cliente'.",
    category: "BUSINESS",
  },
  {
    key: "BUSINESS_LOCATION",
    value: "Bogotá, Colombia",
    valueType: "TEXT",
    label: "Ubicación del negocio",
    description: "Aparece en /legal/privacidad.",
    category: "BUSINESS",
  },
  {
    key: "BUSINESS_NIT",
    value: "",
    valueType: "TEXT",
    label: "NIT / CC del negocio (remitente)",
    description:
      "Documento del remitente que Aveonline usa al generar la guía. Si eres persona natural usa tu CC; si tienes sociedad usa el NIT.",
    category: "BUSINESS",
  },

  // PICKUP — datos de la dirección donde Aveonline recoge los paquetes.
  // Se usan al generar guías de envío. Cambialos si te mudás de taller.
  {
    key: "PICKUP_CITY",
    value: "Bogotá",
    valueType: "TEXT",
    label: "Ciudad de recogida (envíos)",
    description: "Ciudad donde Aveonline pasa a recoger los pedidos. Ej: 'Bogotá'.",
    category: "BUSINESS",
  },
  {
    key: "PICKUP_DEPARTMENT",
    value: "Cundinamarca",
    valueType: "TEXT",
    label: "Departamento de recogida (envíos)",
    description: "Departamento de la ciudad de recogida. Ej: 'Cundinamarca'.",
    category: "BUSINESS",
  },
  {
    key: "PICKUP_ADDRESS",
    value: "",
    valueType: "TEXT",
    label: "Dirección de recogida (envíos)",
    description:
      "Dirección física donde el courier pasa a recoger. Ej: 'Calle 100 # 15-20, Bogotá'.",
    category: "BUSINESS",
  },
  {
    key: "PICKUP_PHONE",
    value: "",
    valueType: "PHONE",
    label: "Teléfono de recogida (envíos)",
    description: "Teléfono operativo para coordinar recogida con el courier.",
    category: "BUSINESS",
  },
  {
    key: "PICKUP_CONTACT_NAME",
    value: "",
    valueType: "TEXT",
    label: "Persona de contacto para recogida",
    description: "Nombre de quien recibe al courier en la dirección de recogida.",
    category: "BUSINESS",
  },

  // COMMERCE — opciones del checkout.
  {
    key: "COD_ENABLED",
    value: "true",
    valueType: "BOOLEAN",
    label: "Pago contraentrega (efectivo al recibir)",
    description:
      "Si está activo, en el checkout aparece la opción de pagar en efectivo al recibir (el courier cobra y te remite). Desactívalo para vender solo con pago online (Wompi).",
    category: "COMMERCE",
  },

  // SOCIAL
  {
    key: "SOCIAL_INSTAGRAM_URL",
    value: "https://www.instagram.com/lucams_shop",
    valueType: "URL",
    label: "Instagram URL",
    description: "Link del ícono Instagram en el footer.",
    category: "SOCIAL",
  },
  {
    key: "SOCIAL_TIKTOK_URL",
    value: "https://www.tiktok.com/@lucams_shop",
    valueType: "URL",
    label: "TikTok URL",
    description: "Link del ícono TikTok en el footer.",
    category: "SOCIAL",
  },

  // LEGAL
  {
    key: "RETRACTION_DAYS_BUSINESS",
    value: "5",
    valueType: "NUMBER",
    label: "Días hábiles de retracto (Ley 1480)",
    description:
      "Plazo para retractarse según Ley 1480 art. 47. Aparece en /legal/terminos y /legal/devoluciones.",
    category: "LEGAL",
  },
  {
    key: "WARRANTY_DURATION_YEARS",
    value: "1",
    valueType: "NUMBER",
    label: "Años de garantía legal (Ley 1480)",
    description: "Duración de la garantía legal según Ley 1480 art. 11.",
    category: "LEGAL",
  },
  {
    key: "HABEAS_DATA_CONSULTATION_DAYS",
    value: "10",
    valueType: "NUMBER",
    label: "Días para responder consulta hábeas data",
    description: "Plazo Ley 1581 para responder consulta.",
    category: "LEGAL",
  },
  {
    key: "HABEAS_DATA_CLAIM_DAYS",
    value: "15",
    valueType: "NUMBER",
    label: "Días para responder reclamo hábeas data",
    description: "Plazo Ley 1581 para responder reclamo.",
    category: "LEGAL",
  },
  {
    key: "PRIVACY_POLICY_VERSION",
    value: "v1 · 2026-05-12",
    valueType: "TEXT",
    label: "Versión actual del Aviso de Privacidad",
    description: "Se muestra al titular cuando da consentimiento.",
    category: "LEGAL",
  },

  // COMMERCE
  {
    key: "MANUFACTURING_DAYS_RANGE",
    value: "2 días hábiles (hasta el despacho)",
    valueType: "TEXT",
    label: "Tiempo de fabricación",
    description: "Tiempo que tardan los productos personalizados en fabricarse antes de envío.",
    category: "COMMERCE",
  },
  {
    key: "DELIVERY_COVERAGE_COUNT",
    value: "1.100+",
    valueType: "TEXT",
    label: "Cobertura de envío (destinos)",
    description: "Aparece en hero, /legal/subprocesadores y home.",
    category: "COMMERCE",
  },

  // EXTERNAL — DPA links
  {
    key: "DPA_SUPABASE_URL",
    value: "https://supabase.com/legal/dpa",
    valueType: "URL",
    label: "DPA Supabase",
    description: "Acuerdo de tratamiento de datos. Aparece en /legal/subprocesadores.",
    category: "EXTERNAL",
  },
  {
    key: "DPA_VERCEL_URL",
    value: "https://vercel.com/legal/dpa",
    valueType: "URL",
    label: "DPA Vercel",
    category: "EXTERNAL",
  },
  {
    key: "DPA_RESEND_URL",
    value: "https://resend.com/legal/dpa",
    valueType: "URL",
    label: "DPA Resend",
    category: "EXTERNAL",
  },
  {
    key: "DPA_WOMPI_URL",
    value: "https://wompi.com/legal",
    valueType: "URL",
    label: "DPA Wompi",
    category: "EXTERNAL",
  },
  {
    key: "DPA_AVEONLINE_URL",
    value: "https://www.aveonline.co/",
    valueType: "URL",
    label: "DPA Aveonline / Coordinadora",
    category: "EXTERNAL",
  },
  {
    key: "DPA_CLOUDFLARE_URL",
    value: "https://www.cloudflare.com/cloudflare-customer-dpa/",
    valueType: "URL",
    label: "DPA Cloudflare",
    category: "EXTERNAL",
  },
  {
    key: "DPA_GOOGLE_URL",
    value: "https://cloud.google.com/terms/data-processing-addendum",
    valueType: "URL",
    label: "DPA Google (Gemini)",
    category: "EXTERNAL",
  },
  {
    key: "GOVT_SIC_URL",
    value: "https://www.sic.gov.co",
    valueType: "URL",
    label: "URL de la SIC (gobierno)",
    description: "Aparece en /legal/habeas-data para reclamos.",
    category: "EXTERNAL",
  },
  // Identidad del proveedor (persona natural) — Ley 1480 art. 23/50 + Ley 1581 art. 12. Sin cédula
  // ni dirección exacta (Opción 1). Lucy 2026-07-22: SIN el nombre de la titular — la identificación
  // completa se entrega a requerimiento del consumidor por los canales de contacto.
  // BUSINESS_LEGAL_NAME → footer del sitio; LEGAL_ENTITY_LINE → pie de los correos transaccionales.
  {
    key: "BUSINESS_LEGAL_NAME",
    value:
      "Lucams_shop (persona natural) · Bogotá D.C., Colombia · Identificación de la titular disponible a requerimiento del consumidor",
    valueType: "TEXT",
    label: "Identidad del proveedor (footer)",
    description: "Línea de identidad en el footer. NO incluir cédula ni dirección exacta.",
    category: "COPYRIGHT",
  },
  {
    key: "LEGAL_ENTITY_LINE",
    value:
      "Lucams_shop (persona natural) · Bogotá D.C., Colombia · Identificación de la titular disponible a requerimiento del consumidor",
    valueType: "TEXT",
    label: "Identidad del proveedor (correos)",
    description: "Línea de identidad al pie de los correos. NO incluir cédula ni dirección exacta.",
    category: "COPYRIGHT",
  },

  // WHATSAPP — Plantillas de mensajes pre-armados
  {
    key: "WA_MSG_PRODUCT",
    value: 'Hola Lucams 👋 Quiero saber más sobre "{productName}" (SKU {sku}).',
    valueType: "TEXT",
    label: "Mensaje WhatsApp — Consulta sobre producto",
    description:
      'Plantilla cuando el cliente hace click en "Consultar por WhatsApp" desde un producto. Variables: {productName} {sku}.',
    category: "WHATSAPP",
  },
  {
    key: "WA_MSG_PERSONALIZE",
    value:
      'Hola Lucams 👋 Quiero personalizar "{productName}" (SKU {sku}). Te paso fotos y referencias por aquí ✨',
    valueType: "TEXT",
    label: "Mensaje WhatsApp — Personalizar producto",
    description: "Plantilla del botón 'Personalizar' en producto. Variables: {productName} {sku}.",
    category: "WHATSAPP",
  },
  {
    key: "WA_MSG_SUPPORT",
    value: "Hola Lucams 👋 Tengo una consulta y quería hablar por aquí.",
    valueType: "TEXT",
    label: "Mensaje WhatsApp — Soporte general",
    description: "Plantilla del botón WhatsApp del header/footer cuando NO hay asunto específico.",
    category: "WHATSAPP",
  },
  {
    key: "WA_MSG_SUPPORT_SUBJECT",
    value: "Hola Lucams 👋 Tengo una consulta sobre: {subject}",
    valueType: "TEXT",
    label: "Mensaje WhatsApp — Soporte con asunto",
    description: "Plantilla cuando hay un tema específico. Variable: {subject}.",
    category: "WHATSAPP",
  },
  {
    key: "WA_MSG_ORDER",
    value: "Hola Lucams 👋 Quiero consultar el estado de mi pedido {orderNumber}.",
    valueType: "TEXT",
    label: "Mensaje WhatsApp — Consulta de pedido",
    description: "Variable: {orderNumber}.",
    category: "WHATSAPP",
  },
  {
    key: "WA_MSG_WHOLESALE",
    value:
      "Hola Lucams 👋 Estoy interesado/a en pedido al por mayor / corporativo. ¿Me puedes contar?",
    valueType: "TEXT",
    label: "Mensaje WhatsApp — Pedido al por mayor",
    category: "WHATSAPP",
  },

  // COPYRIGHT
  {
    key: "COPYRIGHT_YEAR",
    value: "2026",
    valueType: "NUMBER",
    label: "Año del copyright",
    description: "Aparece en el footer. Actualizar cada enero.",
    category: "COPYRIGHT",
  },
  {
    key: "COPYRIGHT_TAGLINE",
    value: "Hecho con 💜 en Bogotá",
    valueType: "TEXT",
    label: "Tagline del copyright",
    description: "Aparece después del © en el footer.",
    category: "COPYRIGHT",
  },
  {
    key: "APP_NAME",
    value: "Lucams_shop",
    valueType: "TEXT",
    label: "Nombre de la marca",
    description: "Aparece en metadata SEO y title de las páginas.",
    category: "COPYRIGHT",
  },

  // SEO
  {
    key: "SITE_TAGLINE",
    value: "Tus recuerdos en imán",
    valueType: "TEXT",
    label: "Tagline del sitio (SEO)",
    description: "Aparece en el title de la home: 'Lucams_shop — Tus recuerdos en imán'.",
    category: "SEO",
  },
  {
    key: "SITE_DESCRIPTION",
    value:
      "Imanes magnéticos personalizados, fotoimanes, recuerdos para eventos, calendarios y planners. Hechos a mano en Colombia con entrega a 1.100+ destinos.",
    valueType: "TEXT",
    label: "Meta description default",
    description: "Texto que Google muestra en resultados de búsqueda para la home.",
    category: "SEO",
  },
];

console.log(`Creando/actualizando ${settings.length} configuraciones...`);
let settingsCreated = 0;
let settingsUpdated = 0;
for (const s of settings) {
  const existing = await prisma.siteSetting.findUnique({ where: { key: s.key } });
  if (existing) {
    // Update label + description + valueType + category (NO tocamos value
    // para no pisar ediciones de Lucy).
    await prisma.siteSetting.update({
      where: { id: existing.id },
      data: {
        label: s.label,
        description: s.description ?? null,
        valueType: s.valueType,
        category: s.category,
      },
    });
    settingsUpdated++;
  } else {
    await prisma.siteSetting.create({
      data: {
        key: s.key,
        value: s.value,
        valueType: s.valueType,
        label: s.label,
        description: s.description ?? null,
        category: s.category,
      },
    });
    settingsCreated++;
  }
  console.log(`  ${existing ? "↻" : "✓"} ${s.key}`);
}
console.log(`  → ${settingsCreated} nuevas · ${settingsUpdated} actualizadas (sin pisar value)`);

const totalBlocks = await prisma.cmsBlock.count({ where: { deletedAt: null } });
const totalSettings = await prisma.siteSetting.count();

console.log("");
console.log(`Total en DB: ${totalBlocks} bloques · ${totalSettings} configuraciones.`);
console.log("");
console.log("Listo. Ve a /admin/contenido para gestionar el contenido del sitio.");

await prisma.$disconnect();
process.exit(0);
