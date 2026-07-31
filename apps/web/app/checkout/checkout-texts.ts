/*
 * Textos del checkout (roadmap B8) — estructura + defaults.
 *
 * DEFAULT_CHECKOUT_TEXTS replica EXACTAMENTE el copy pre-CMS (regla de oro:
 * si la DB cae o un campo no está publicado, la pantalla se ve idéntica).
 * CHECKOUT_TEXT_KEYS mapea cada texto a su key CMS (`checkout.<seccion>.<campo>`).
 * La resolución server-side vive en checkout-texts.server.ts (getCheckoutTexts).
 */

export type CheckoutTexts = {
  layout: {
    backHome: string;
    backCart: string;
    cartShort: string;
    secure: string;
    footerCatalog: string;
    footerPayments: string;
    linkTerminos: string;
    linkPrivacidad: string;
    linkGarantias: string;
  };
  steps: { aria: string; datos: string; envio: string; pago: string };
  summary: {
    title: string;
    itemSingle: string;
    itemMany: string;
    personalized: string;
    subtotal: string;
    shippingLabel: string;
    shippingCatalog: string;
    shippingPending: string;
    free: string;
    discount: string;
    total: string;
    noteCatalog: string;
    noteFinal: string;
  };
  datos: {
    contactTitle: string;
    nameLabel: string;
    namePlaceholder: string;
    nameError: string;
    emailLabel: string;
    emailPlaceholder: string;
    emailError: string;
    emailHint: string;
    emailTypo: string;
    phoneLabel: string;
    phoneError: string;
    phoneHint: string;
    docLabel: string;
    docTypePlaceholder: string;
    addressTitle: string;
    savedLabel: string;
    savedNew: string;
    savedNote: string;
    deptPlaceholder: string;
    cityLabel: string;
    cityPlaceholder: string;
    cityWait: string;
    cityMissing: string;
    zipLabel: string;
    zipHintAuto: string;
    zipHint: string;
    kindLabel: string;
    kindUrban: string;
    kindUrbanDesc: string;
    kindRural: string;
    kindRuralDesc: string;
    addressLabel: string;
    viaLabel: string;
    viaBis: string;
    viaHint: string;
    cruceLabel: string;
    cruceHint: string;
    cardinalPlaceholder: string;
    viaTypeAria: string;
    viaNumberAria: string;
    viaCardinalAria: string;
    cruceCardinalAria: string;
    detailLabel: string;
    detailPlaceholder: string;
    veredaLabel: string;
    veredaPlaceholder: string;
    fincaLabel: string;
    fincaPlaceholder: string;
    refLabel: string;
    refPlaceholder: string;
    refError: string;
    refHint: string;
    previewLabel: string;
    notesLabel: string;
    notesPlaceholder: string;
    saveCheck: string;
    saveNameLabel: string;
    saveNamePlaceholder: string;
    billingTitle: string;
    billingNote: string;
    billingCheck: string;
    billingTypeLabel: string;
    billingNumberLabel: string;
    billingNumberPlaceholder: string;
    billingNameLabel: string;
    billingNamePlaceholder: string;
    consent: string;
    submit: string;
    pending: string;
  };
  quote: {
    title: string;
    heading: string;
    subtext: string;
    customBadge: string;
    total: string;
    ctaTitle: string;
    ctaSub: string;
    shipNote: string;
    whatsappLabel: string;
    emailPlaceholder: string;
    cityLabel: string;
    notePlaceholder: string;
    pending: string;
    submit: string;
    consent: string;
    noSpam: string;
  };
  shipping: {
    loading: string;
    loadingSub: string;
    errorTitle: string;
    errorNote: string;
    errorReselectSuffix: string;
    errorAddress: string;
    errorWa: string;
    listTitle: string;
    free: string;
    note: string;
    back: string;
    next: string;
  };
  payment: {
    reviewTitle: string;
    contact: string;
    address: string;
    note: string;
    via: string;
    billing: string;
    billingNote: string;
    errorTitle: string;
    edit: string;
    couponLabel: string;
    couponInvalidPre: string;
    couponInvalidPost: string;
    couponInvalidNote: string;
    couponAsk: string;
    couponPlaceholder: string;
    couponApply: string;
    couponAppliedSuffix: string;
  };
  pay: {
    methodAria: string;
    wompiTitle: string;
    codTitle: string;
    codDesc: string;
    wompiNote: string;
    codNote: string;
    codButton: string;
    codPending: string;
    wompiButton: string;
    wompiPending: string;
    back: string;
    terms: string;
    legalRetractTitle: string;
    legalRetractBody: string;
    legalWarrantyTitle: string;
    legalWarrantyBody: string;
    legalMore: string;
    legalDevoluciones: string;
    legalGarantias: string;
  };
};

export const DEFAULT_CHECKOUT_TEXTS: CheckoutTexts = {
  layout: {
    backHome: "Volver al inicio",
    backCart: "Volver al carrito",
    cartShort: "Carrito",
    secure: "Compra segura",
    footerCatalog: "Cotización sin pago en línea · coordinamos por WhatsApp",
    footerPayments: "Pago seguro Wompi · Envío Aveonline",
    linkTerminos: "Términos",
    linkPrivacidad: "Privacidad",
    linkGarantias: "Garantías",
  },
  steps: { aria: "Progreso del checkout", datos: "Datos", envio: "Envío", pago: "Pago" },
  summary: {
    title: "Tu pedido",
    itemSingle: "producto",
    itemMany: "productos",
    personalized: "Personalizado",
    subtotal: "Subtotal",
    shippingLabel: "Envío",
    shippingCatalog: "Se coordina por WhatsApp",
    shippingPending: "Se calcula al elegir envío",
    free: "Gratis",
    discount: "Descuento",
    total: "Total",
    noteCatalog:
      "Precios en pesos colombianos (COP) · el envío se coordina por WhatsApp al confirmar tu cotización",
    noteFinal: "Precios en pesos colombianos (COP) · el total es el valor final que pagas",
  },
  datos: {
    contactTitle: "1. Contacto",
    nameLabel: "Nombre completo",
    namePlaceholder: "Ej. Valentina Rojas",
    nameError: "Solo letras, espacios y acentos (sin números)",
    emailLabel: "Email",
    emailPlaceholder: "tu@correo.com",
    emailError: "Email inválido",
    emailHint: "Aquí te enviamos la confirmación + tracking",
    emailTypo: "¿Quisiste decir",
    phoneLabel: "Teléfono móvil",
    phoneError: "Móvil colombiano: 10 dígitos empezando con 3",
    phoneHint: "El courier lo usa para coordinar entrega",
    docLabel: "Documento (opcional, requerido si quieres factura)",
    docTypePlaceholder: "Elige tipo primero",
    addressTitle: "2. Dirección de envío",
    savedLabel: "📍 Usar una dirección guardada",
    savedNew: "Escribir una dirección nueva…",
    savedNote: "Rellenamos tu dirección guardada. Revisa que esté completa antes de continuar.",
    deptPlaceholder: "Elige departamento...",
    cityLabel: "Ciudad",
    cityPlaceholder: "Elige ciudad...",
    cityWait: "Elige departamento primero",
    cityMissing: "No tenemos esa ciudad en el catálogo. Contáctanos por WhatsApp.",
    zipLabel: "Código postal (opcional)",
    zipHintAuto: "Autocompletado para tu ciudad",
    zipHint: "6 dígitos",
    kindLabel: "Tipo de dirección",
    kindUrban: "🏙️ Urbana",
    kindUrbanDesc: "Calle / Carrera + número (nomenclatura DIAN)",
    kindRural: "🌳 Rural",
    kindRuralDesc: "Vereda / Finca / Corregimiento + referencias",
    addressLabel: "Dirección",
    viaLabel: "Vía principal",
    viaBis: "Bis",
    viaHint: "Ej. Carrera 7A Bis Sur",
    cruceLabel: "Cruce",
    cruceHint: "Formato: 23-45 o 13B-42C",
    cardinalPlaceholder: "— Cuadrante —",
    viaTypeAria: "Tipo de vía",
    viaNumberAria: "Número de vía",
    viaCardinalAria: "Cuadrante de vía",
    cruceCardinalAria: "Cuadrante del cruce",
    detailLabel: "Complemento (opcional)",
    detailPlaceholder: "Apto 401, Conjunto Lucams, casa color rosa...",
    veredaLabel: "Vereda / Corregimiento / Sector",
    veredaPlaceholder: "Ej. Vereda El Roble",
    fincaLabel: "Finca / Lugar (opcional)",
    fincaPlaceholder: "Ej. Finca Las Flores",
    refLabel: "Indicaciones para llegar",
    refPlaceholder:
      "Ej. A 200m del puente sobre el río, casa de dos pisos color azul, portón de madera. Llamar al llegar.",
    refError: "Mínimo 10 caracteres — el courier necesita referencias claras",
    refHint: "Cuanto más detallada la referencia, más fácil para el courier",
    previewLabel: "📦 Así verá tu dirección el courier",
    notesLabel: "Notas para el courier (opcional)",
    notesPlaceholder: "Ej. timbre 2, dejar con portería",
    saveCheck: "💾 Guardar esta dirección en mi cuenta para la próxima",
    saveNameLabel: "Nombre para recordarla (opcional)",
    saveNamePlaceholder: "Ej. Casa, Oficina, Casa de mamá",
    billingTitle: "3. Facturación",
    billingNote:
      "Si necesitas un documento de venta (cuenta de cobro o factura, según corresponda), marca la casilla y déjanos tus datos: lo coordinamos a tu correo. Si es compra personal, déjala sin marcar.",
    billingCheck: "Quiero documento tributario (cuenta de cobro o factura)",
    billingTypeLabel: "Tipo doc",
    billingNumberLabel: "Número documento",
    billingNumberPlaceholder: "900.123.456-7",
    billingNameLabel: "Razón social o nombre",
    billingNamePlaceholder: "Ej. Tu nombre o el de tu empresa",
    consent:
      "Autorizo el **tratamiento de mis datos personales** para procesar y enviar mi pedido, conforme a la [Política de Privacidad](/legal/privacidad) y la [Política de Tratamiento de Datos](/legal/habeas-data). Responsable: Lucams_shop (persona natural), Bogotá D.C. Algunos proveedores (alojamiento y correo) están en EE. UU.",
    submit: "Continuar al envío →",
    pending: "Guardando…",
  },
  quote: {
    title: "Productos de tu cotización",
    heading: "Lo que estás cotizando",
    subtext:
      "Esto es exactamente lo que vas a recibir. Revísalo con calma antes de enviarnos tu cotización.",
    customBadge: "✨ Con tu diseño personalizado",
    total: "Total",
    ctaTitle: "Pide tu cotización ✨",
    ctaSub:
      "Déjanos tus datos y te contactamos por WhatsApp para confirmar precio, pago y entrega.",
    shipNote: "El envío se coordina por WhatsApp al confirmar tu cotización.",
    whatsappLabel: "Tu WhatsApp",
    emailPlaceholder: "tu@correo.com",
    cityLabel: "Ciudad",
    notePlaceholder: "Ej. es para un regalo, lo necesito antes del viernes...",
    pending: "Creando tu cotización…",
    submit: "Pedir cotización por WhatsApp",
    consent:
      "Autorizo el **tratamiento de mis datos personales** para responder esta cotización por WhatsApp, conforme a la [Política de Privacidad](/legal/privacidad) (Ley 1581 de 2012).",
    noSpam: "Sin spam: solo te escribimos por esta cotización.",
  },
  shipping: {
    loading: "Cotizando tu envío…",
    loadingSub:
      "Estamos consultando las mejores opciones para tu ciudad. Esto toma unos segundos 🦝",
    errorTitle: "No pudimos cotizar el envío",
    errorNote: "Suele resolverse reintentando en unos segundos.",
    errorReselectSuffix: "— elige de nuevo tu transportadora.",
    errorAddress: "Revisar dirección",
    errorWa: "Contáctanos por WhatsApp",
    listTitle: "Opciones de envío",
    free: "Gratis",
    note: "Son tiempos **estimados por la transportadora**, no una fecha garantizada. Antes fabricamos tu pedido a mano: lo **entregamos en máximo 3 días hábiles** (2 de fabricación + 1 de entrega) y de ahí corre el tránsito.",
    back: "← Cambiar dirección",
    next: "Continuar al pago →",
  },
  payment: {
    reviewTitle: "Revisa tu pedido antes de pagar",
    contact: "Contacto",
    address: "Dirección de envío",
    note: "Nota:",
    via: "Vía",
    billing: "Facturación",
    billingNote:
      "Coordinamos tu documento de venta (cuenta de cobro o factura, según corresponda) al correo",
    errorTitle: "No pudimos procesar el pago",
    edit: "Editar",
    couponLabel: "Cupón",
    couponInvalidPre: "El cupón",
    couponInvalidPost: "ya no aplica:",
    couponInvalidNote: "Quítalo para continuar con el pago.",
    couponAsk: "¿Tienes un cupón?",
    couponPlaceholder: "Escribe tu código",
    couponApply: "Aplicar",
    couponAppliedSuffix: "aplicado",
  },
  pay: {
    methodAria: "Método de pago",
    wompiTitle: "Pagar con Wompi",
    codTitle: "Pago contraentrega",
    codDesc: "Pagas en efectivo al recibir",
    wompiNote:
      "Al pagar serás redirigido a Wompi (Bancolombia). Tu información bancaria nunca pasa por Lucams.",
    codNote:
      "Confirmamos tu pedido de una vez y el mensajero te lo entrega. Pagas el total en efectivo al recibir — sin tarjeta.",
    codButton: "Confirmar pedido (pago al recibir)",
    codPending: "Confirmando tu pedido…",
    wompiButton: "Pagar con Wompi",
    wompiPending: "Redirigiendo a Wompi…",
    back: "← Cambiar envío",
    terms:
      "Al confirmar tu pedido aceptas los [Términos y Condiciones](/legal/terminos) y declaras que tienes derecho a usar las imágenes que subiste y autorizas su impresión.",
    legalRetractTitle: "Retracto y garantía",
    legalRetractBody:
      "tienes 5 días hábiles desde que recibes para retractarte de productos del catálogo estándar; te devolvemos el dinero en máximo 15 días calendario. Los productos personalizados en el Estudio (con tu foto o tu texto) no tienen retracto por ser hechos a tu medida (Ley 1480, art. 47).",
    legalWarrantyTitle: "Garantía:",
    legalWarrantyBody:
      "todos los productos tienen garantía legal de 1 año por defectos de fabricación; puedes pedir reparación, cambio o devolución del dinero.",
    legalMore: "Más en",
    legalDevoluciones: "Devoluciones y Retracto",
    legalGarantias: "Garantías",
  },
};

/** Mapa `seccion.prop` → key CMS del campo (checkout.<seccion>.<campo>). */
export const CHECKOUT_TEXT_KEYS: Record<string, string> = {
  "layout.backHome": "checkout.layout.back-home",
  "layout.backCart": "checkout.layout.back-cart",
  "layout.cartShort": "checkout.layout.cart-short",
  "layout.secure": "checkout.layout.secure",
  "layout.footerCatalog": "checkout.layout.footer-catalog",
  "layout.footerPayments": "checkout.layout.footer-payments",
  "layout.linkTerminos": "checkout.layout.link-terminos",
  "layout.linkPrivacidad": "checkout.layout.link-privacidad",
  "layout.linkGarantias": "checkout.layout.link-garantias",
  "steps.aria": "checkout.steps.aria",
  "steps.datos": "checkout.steps.datos",
  "steps.envio": "checkout.steps.envio",
  "steps.pago": "checkout.steps.pago",
  "summary.title": "checkout.summary.title",
  "summary.itemSingle": "checkout.summary.item-single",
  "summary.itemMany": "checkout.summary.item-many",
  "summary.personalized": "checkout.summary.personalized",
  "summary.subtotal": "checkout.summary.subtotal",
  "summary.shippingLabel": "checkout.summary.shipping-label",
  "summary.shippingCatalog": "checkout.summary.shipping-catalog",
  "summary.shippingPending": "checkout.summary.shipping-pending",
  "summary.free": "checkout.summary.free",
  "summary.discount": "checkout.summary.discount",
  "summary.total": "checkout.summary.total",
  "summary.noteCatalog": "checkout.summary.note-catalog",
  "summary.noteFinal": "checkout.summary.note-final",
  "datos.contactTitle": "checkout.datos.contact-title",
  "datos.nameLabel": "checkout.datos.name-label",
  "datos.namePlaceholder": "checkout.datos.name-placeholder",
  "datos.nameError": "checkout.datos.name-error",
  "datos.emailLabel": "checkout.datos.email-label",
  "datos.emailPlaceholder": "checkout.datos.email-placeholder",
  "datos.emailError": "checkout.datos.email-error",
  "datos.emailHint": "checkout.datos.email-hint",
  "datos.emailTypo": "checkout.datos.email-typo",
  "datos.phoneLabel": "checkout.datos.phone-label",
  "datos.phoneError": "checkout.datos.phone-error",
  "datos.phoneHint": "checkout.datos.phone-hint",
  "datos.docLabel": "checkout.datos.doc-label",
  "datos.docTypePlaceholder": "checkout.datos.doc-type-placeholder",
  "datos.addressTitle": "checkout.datos.address-title",
  "datos.savedLabel": "checkout.datos.saved-label",
  "datos.savedNew": "checkout.datos.saved-new",
  "datos.savedNote": "checkout.datos.saved-note",
  "datos.deptPlaceholder": "checkout.datos.dept-placeholder",
  "datos.cityLabel": "checkout.datos.city-label",
  "datos.cityPlaceholder": "checkout.datos.city-placeholder",
  "datos.cityWait": "checkout.datos.city-wait",
  "datos.cityMissing": "checkout.datos.city-missing",
  "datos.zipLabel": "checkout.datos.zip-label",
  "datos.zipHintAuto": "checkout.datos.zip-hint-auto",
  "datos.zipHint": "checkout.datos.zip-hint",
  "datos.kindLabel": "checkout.datos.kind-label",
  "datos.kindUrban": "checkout.datos.kind-urban",
  "datos.kindUrbanDesc": "checkout.datos.kind-urban-desc",
  "datos.kindRural": "checkout.datos.kind-rural",
  "datos.kindRuralDesc": "checkout.datos.kind-rural-desc",
  "datos.addressLabel": "checkout.datos.address-label",
  "datos.viaLabel": "checkout.datos.via-label",
  "datos.viaBis": "checkout.datos.via-bis",
  "datos.viaHint": "checkout.datos.via-hint",
  "datos.cruceLabel": "checkout.datos.cruce-label",
  "datos.cruceHint": "checkout.datos.cruce-hint",
  "datos.cardinalPlaceholder": "checkout.datos.cardinal-placeholder",
  "datos.viaTypeAria": "checkout.datos.via-type-aria",
  "datos.viaNumberAria": "checkout.datos.via-number-aria",
  "datos.viaCardinalAria": "checkout.datos.via-cardinal-aria",
  "datos.cruceCardinalAria": "checkout.datos.cruce-cardinal-aria",
  "datos.detailLabel": "checkout.datos.detail-label",
  "datos.detailPlaceholder": "checkout.datos.detail-placeholder",
  "datos.veredaLabel": "checkout.datos.vereda-label",
  "datos.veredaPlaceholder": "checkout.datos.vereda-placeholder",
  "datos.fincaLabel": "checkout.datos.finca-label",
  "datos.fincaPlaceholder": "checkout.datos.finca-placeholder",
  "datos.refLabel": "checkout.datos.ref-label",
  "datos.refPlaceholder": "checkout.datos.ref-placeholder",
  "datos.refError": "checkout.datos.ref-error",
  "datos.refHint": "checkout.datos.ref-hint",
  "datos.previewLabel": "checkout.datos.preview-label",
  "datos.notesLabel": "checkout.datos.notes-label",
  "datos.notesPlaceholder": "checkout.datos.notes-placeholder",
  "datos.saveCheck": "checkout.datos.save-check",
  "datos.saveNameLabel": "checkout.datos.save-name-label",
  "datos.saveNamePlaceholder": "checkout.datos.save-name-placeholder",
  "datos.billingTitle": "checkout.datos.billing-title",
  "datos.billingNote": "checkout.datos.billing-note",
  "datos.billingCheck": "checkout.datos.billing-check",
  "datos.billingTypeLabel": "checkout.datos.billing-type-label",
  "datos.billingNumberLabel": "checkout.datos.billing-number-label",
  "datos.billingNumberPlaceholder": "checkout.datos.billing-number-placeholder",
  "datos.billingNameLabel": "checkout.datos.billing-name-label",
  "datos.billingNamePlaceholder": "checkout.datos.billing-name-placeholder",
  "datos.consent": "checkout.datos.consent",
  "datos.submit": "checkout.datos.submit",
  "datos.pending": "checkout.datos.pending",
  "quote.title": "checkout.quote.title",
  "quote.heading": "checkout.quote.heading",
  "quote.subtext": "checkout.quote.subtext",
  "quote.customBadge": "checkout.quote.custom-badge",
  "quote.total": "checkout.quote.total",
  "quote.ctaTitle": "checkout.quote.cta-title",
  "quote.ctaSub": "checkout.quote.cta-sub",
  "quote.shipNote": "checkout.quote.ship-note",
  "quote.whatsappLabel": "checkout.quote.whatsapp-label",
  "quote.emailPlaceholder": "checkout.quote.email-placeholder",
  "quote.cityLabel": "checkout.quote.city-label",
  "quote.notePlaceholder": "checkout.quote.note-placeholder",
  "quote.pending": "checkout.quote.pending",
  "quote.submit": "checkout.quote.submit",
  "quote.consent": "checkout.quote.consent",
  "quote.noSpam": "checkout.quote.no-spam",
  "shipping.loading": "checkout.shipping.loading",
  "shipping.loadingSub": "checkout.shipping.loading-sub",
  "shipping.errorTitle": "checkout.shipping.error-title",
  "shipping.errorNote": "checkout.shipping.error-note",
  "shipping.errorReselectSuffix": "checkout.shipping.error-reselect-suffix",
  "shipping.errorAddress": "checkout.shipping.error-address",
  "shipping.errorWa": "checkout.shipping.error-wa",
  "shipping.listTitle": "checkout.shipping.list-title",
  "shipping.free": "checkout.shipping.free",
  "shipping.note": "checkout.shipping.note",
  "shipping.back": "checkout.shipping.back",
  "shipping.next": "checkout.shipping.next",
  "payment.reviewTitle": "checkout.payment.review-title",
  "payment.contact": "checkout.payment.contact",
  "payment.address": "checkout.payment.address",
  "payment.note": "checkout.payment.note",
  "payment.via": "checkout.payment.via",
  "payment.billing": "checkout.payment.billing",
  "payment.billingNote": "checkout.payment.billing-note",
  "payment.errorTitle": "checkout.payment.error-title",
  "payment.edit": "checkout.payment.edit",
  "payment.couponLabel": "checkout.payment.coupon-label",
  "payment.couponInvalidPre": "checkout.payment.coupon-invalid-pre",
  "payment.couponInvalidPost": "checkout.payment.coupon-invalid-post",
  "payment.couponInvalidNote": "checkout.payment.coupon-invalid-note",
  "payment.couponAsk": "checkout.payment.coupon-ask",
  "payment.couponPlaceholder": "checkout.payment.coupon-placeholder",
  "payment.couponApply": "checkout.payment.coupon-apply",
  "payment.couponAppliedSuffix": "checkout.payment.coupon-applied-suffix",
  "pay.methodAria": "checkout.pay.method-aria",
  "pay.wompiTitle": "checkout.pay.wompi-title",
  "pay.codTitle": "checkout.pay.cod-title",
  "pay.codDesc": "checkout.pay.cod-desc",
  "pay.wompiNote": "checkout.pay.wompi-note",
  "pay.codNote": "checkout.pay.cod-note",
  "pay.codButton": "checkout.pay.cod-button",
  "pay.codPending": "checkout.pay.cod-pending",
  "pay.wompiButton": "checkout.pay.wompi-button",
  "pay.wompiPending": "checkout.pay.wompi-pending",
  "pay.back": "checkout.pay.back",
  "pay.terms": "checkout.pay.terms",
  "pay.legalRetractTitle": "checkout.pay.legal-retract-title",
  "pay.legalRetractBody": "checkout.pay.legal-retract-body",
  "pay.legalWarrantyTitle": "checkout.pay.legal-warranty-title",
  "pay.legalWarrantyBody": "checkout.pay.legal-warranty-body",
  "pay.legalMore": "checkout.pay.legal-more",
  "pay.legalDevoluciones": "checkout.pay.legal-devoluciones",
  "pay.legalGarantias": "checkout.pay.legal-garantias",
};
