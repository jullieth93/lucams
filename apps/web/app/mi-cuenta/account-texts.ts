/*
 * Textos del área de cliente /mi-cuenta (roadmap B9) — estructura + defaults.
 *
 * DEFAULT_ACCOUNT_TEXTS replica EXACTAMENTE el copy pre-CMS (regla de oro: si
 * la DB cae o un campo no está publicado, la pantalla se ve idéntica a hoy).
 * ACCOUNT_TEXT_KEYS mapea cada texto a su key CMS (`account.<seccion>.<campo>`).
 * La resolución server-side vive en account-texts.server.ts (getAccountTexts).
 */

export type AccountTexts = {
  nav: {
    resumen: string;
    pedidos: string;
    disenos: string;
    favoritos: string;
    direcciones: string;
    resenas: string;
    seguridad: string;
    logout: string;
    aria: string;
  };
  back: { miCuenta: string; misPedidos: string };
  perfil: { title: string; subtitle: string };
  orders: {
    countSingle: string;
    countMany: string;
    limitNote: string;
    catalogCta: string;
    guide: string;
    itemSingle: string;
    itemMany: string;
  };
  order: {
    codBanner: string;
    statusTitle: string;
    cancelled: string;
    cancelledNote: string;
    itemsTitle: string;
    subtotal: string;
    shipping: string;
    discount: string;
    total: string;
    shippingTitle: string;
    note: string;
    deliveryTitle: string;
    carrier: string;
    tracking: string;
    trackCta: string;
    reviewTitle: string;
    reviewSub: string;
    reviewCta: string;
  };
  retract: {
    cta: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    policyNote: string;
    submit: string;
    personalized: string;
  };
  warranty: {
    cta: string;
    descLabel: string;
    descPlaceholder: string;
    covered: string;
    submit: string;
    out: string;
  };
  address: {
    title: string;
    emptyTitle: string;
    emptySub: string;
    add: string;
    edit: string;
    delete: string;
    confirm: string;
    confirmYes: string;
    confirmNo: string;
    makeDefault: string;
    defaultBadge: string;
    legacyTitle: string;
    legacyNote: string;
    legacyPrev: string;
    defaultCheck: string;
    cancel: string;
    save: string;
    saving: string;
    editTitle: string;
    newTitle: string;
    subtitle: string;
  };
  designs: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptySub: string;
    emptyCta: string;
    used: string;
    share: string;
    shareWa: string;
    view: string;
    revoke: string;
    archiveConfirm: string;
    yes: string;
    no: string;
    archiveAria: string;
  };
  favorites: {
    title: string;
    subtitleEmpty: string;
    countSingle: string;
    countMany: string;
    emptyTitle: string;
    emptySub: string;
    emptyCta: string;
  };
  reviews: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptySub: string;
    emptyCta: string;
    published: string;
    pending: string;
    delete: string;
    confirm: string;
    yes: string;
    no: string;
  };
  security: {
    title: string;
    subtitle: string;
    passwordTitle: string;
    dangerTitle: string;
    dangerNote: string;
    dangerCta: string;
  };
  delete: {
    title: string;
    warn: string;
    listTitle: string;
    item1: string;
    item2: string;
    item3: string;
    item4: string;
    item5: string;
    contact: string;
    contactEmail: string;
    passwordLabel: string;
    passwordSuffix: string;
    confirmLabel: string;
    confirmWord: string;
    submit: string;
    pending: string;
  };
};

export const DEFAULT_ACCOUNT_TEXTS: AccountTexts = {
  nav: {
    resumen: "Resumen",
    pedidos: "Pedidos",
    disenos: "Mis diseños",
    favoritos: "Favoritos",
    direcciones: "Direcciones",
    resenas: "Reseñas",
    seguridad: "Seguridad",
    logout: "Cerrar sesión",
    aria: "Secciones de mi cuenta",
  },
  back: { miCuenta: "Mi cuenta", misPedidos: "Mis pedidos" },
  perfil: {
    title: "Editar perfil",
    subtitle: "Tu correo {email} es tu identidad y no se cambia aquí.",
  },
  orders: {
    countSingle: "{n} pedido en tu historial",
    countMany: "{n} pedidos en tu historial",
    limitNote: "mostrando los {n} más recientes",
    catalogCta: "Ver catálogo",
    guide: "guía",
    itemSingle: "producto",
    itemMany: "productos",
  },
  order: {
    codBanner: "Pagas {total} en efectivo cuando el mensajero te entregue el pedido.",
    statusTitle: "Estado de tu pedido",
    cancelled: "Este pedido fue {estado}.",
    cancelledNote: "Si tienes dudas, escríbenos por WhatsApp o responde el email que te enviamos.",
    itemsTitle: "Lo que pediste ({n})",
    subtotal: "Subtotal",
    shipping: "Envío",
    discount: "Descuento",
    total: "Total",
    shippingTitle: "Dirección de envío",
    note: "Nota:",
    deliveryTitle: "Envío",
    carrier: "Transportadora",
    tracking: "Número de guía",
    trackCta: "Rastrear mi pedido →",
    reviewTitle: "¿Cómo te llegó tu pedido?",
    reviewSub: "Tu reseña nos ayuda muchísimo (30 segundos).",
    reviewCta: "Dejar reseña",
  },
  retract: {
    cta: "Solicitar retracto",
    reasonLabel: "¿Por qué lo devuelves? (opcional)",
    reasonPlaceholder: "Ej. no era lo que esperaba",
    policyNote:
      "Tienes 5 días hábiles desde la entrega. Coordinamos la devolución contigo; el costo del envío corre por tu cuenta, salvo que el producto llegara defectuoso o equivocado. Ver [política de devoluciones](/legal/devoluciones).",
    submit: "Enviar solicitud",
    personalized: "Personalizado — sin derecho de retracto (ley).",
  },
  warranty: {
    cta: "Reportar garantía",
    descLabel: "¿Qué falla tiene el producto?",
    descPlaceholder: "Cuéntanos qué pasó (ej. el imán se despegó, llegó rayado…)",
    covered: "Cubierto por garantía legal hasta el {fecha}.",
    submit: "Enviar reclamo",
    out: "Fuera del periodo de garantía.",
  },
  address: {
    title: "Mis direcciones",
    emptyTitle: "Aún no tienes direcciones guardadas",
    emptySub: "Guarda una para que tu próximo checkout sea más rápido.",
    add: "Agregar dirección",
    edit: "Editar",
    delete: "Eliminar",
    confirm: "¿Seguro?",
    confirmYes: "Sí, eliminar",
    confirmNo: "No",
    makeDefault: "Hacer predeterminada",
    defaultBadge: "Predeterminada",
    legacyTitle: "Actualiza esta dirección al nuevo formato",
    legacyNote:
      "Ya llenamos el departamento y la ciudad. Vuelve a escribir la vía (Calle/Carrera y números) para que se reuse automáticamente en tu próximo pago.",
    legacyPrev: "Dirección anterior:",
    defaultCheck: "Usar como dirección predeterminada",
    cancel: "Cancelar",
    save: "Guardar",
    saving: "Guardando...",
    editTitle: "Editar dirección",
    newTitle: "Nueva dirección",
    subtitle: "Guárdalas para que tu próximo pedido sea más rápido.",
  },
  designs: {
    title: "Mis diseños",
    subtitle:
      "Tus creaciones del Estudio. Compártelas con un link o guárdalas para pedir otra vez.",
    emptyTitle: "Aún no tienes diseños guardados",
    emptySub:
      "Crea un fotoimán en el Estudio de Personalización y aparecerá aquí para compartirlo o pedirlo otra vez.",
    emptyCta: "Explorar productos",
    used: "Ya pedido",
    share: "Compartir",
    shareWa: "Compartir por WhatsApp",
    view: "Ver",
    revoke: "Dejar de compartir",
    archiveConfirm: "¿Archivar?",
    yes: "Sí",
    no: "No",
    archiveAria: "Archivar diseño",
  },
  favorites: {
    title: "Mis favoritos",
    subtitleEmpty: "Guarda los productos que te encanten para encontrarlos rápido.",
    countSingle: "{n} producto guardado.",
    countMany: "{n} productos guardados.",
    emptyTitle: "Aún no tienes favoritos",
    emptySub: "Toca el corazón en cualquier producto para guardarlo aquí.",
    emptyCta: "Ver el catálogo",
  },
  reviews: {
    title: "Mis reseñas",
    subtitle: "Los productos que has calificado.",
    emptyTitle: "Todavía no has dejado reseñas",
    emptySub: "Cuando recibas un pedido podrás calificarlo y ayudar a otros compradores ✨",
    emptyCta: "Ver mis pedidos →",
    published: "Publicada",
    pending: "En revisión",
    delete: "Eliminar",
    confirm: "¿Eliminar?",
    yes: "Sí",
    no: "No",
  },
  security: {
    title: "Seguridad",
    subtitle: "Administra el acceso a tu cuenta.",
    passwordTitle: "Cambiar contraseña",
    dangerTitle: "Eliminar mi cuenta",
    dangerNote:
      "Borra tus datos personales de forma permanente (Ley 1581). Tus pedidos se conservan anonimizados por obligación fiscal.",
    dangerCta: "Continuar a eliminar cuenta",
  },
  delete: {
    title: "Eliminar mi cuenta",
    warn: "Esta acción es **permanente** y no se puede deshacer.",
    listTitle: "Qué pasa cuando eliminas tu cuenta:",
    item1: "· Borramos tu nombre, teléfono, documento y direcciones guardadas.",
    item2: "· Borramos las **fotos que subiste** al Estudio de personalización.",
    item3: "· No podrás volver a iniciar sesión con este correo.",
    item4: "· Tus reseñas se conservan, pero sin tu nombre.",
    item5:
      "· Por ley (facturación DIAN) debemos **conservar tus pedidos**. Los datos de envío se anonimizan una vez el pedido finaliza.",
    contact: "¿Prefieres que lo hagamos por ti o tienes dudas? Escríbenos a",
    contactEmail: "habeas-data@lucamsshop.com",
    passwordLabel: "Tu contraseña",
    passwordSuffix: "para confirmar",
    confirmLabel: "Escribe {palabra} para confirmar",
    confirmWord: "ELIMINAR",
    submit: "Eliminar mi cuenta permanentemente",
    pending: "Eliminando...",
  },
};

/** Mapa `seccion.prop` → key CMS del campo (account.<seccion>.<campo>). */
export const ACCOUNT_TEXT_KEYS: Record<string, string> = {
  "nav.resumen": "account.nav.resumen",
  "nav.pedidos": "account.nav.pedidos",
  "nav.disenos": "account.nav.disenos",
  "nav.favoritos": "account.nav.favoritos",
  "nav.direcciones": "account.nav.direcciones",
  "nav.resenas": "account.nav.resenas",
  "nav.seguridad": "account.nav.seguridad",
  "nav.logout": "account.nav.logout",
  "nav.aria": "account.nav.aria",
  "back.miCuenta": "account.back.mi-cuenta",
  "back.misPedidos": "account.back.mis-pedidos",
  "perfil.title": "account.perfil.title",
  "perfil.subtitle": "account.perfil.subtitle",
  "orders.countSingle": "account.orders.count-single",
  "orders.countMany": "account.orders.count-many",
  "orders.limitNote": "account.orders.limit-note",
  "orders.catalogCta": "account.orders.catalog-cta",
  "orders.guide": "account.orders.guide",
  "orders.itemSingle": "account.orders.item-single",
  "orders.itemMany": "account.orders.item-many",
  "order.codBanner": "account.order.cod-banner",
  "order.statusTitle": "account.order.status-title",
  "order.cancelled": "account.order.cancelled",
  "order.cancelledNote": "account.order.cancelled-note",
  "order.itemsTitle": "account.order.items-title",
  "order.subtotal": "account.order.subtotal",
  "order.shipping": "account.order.shipping",
  "order.discount": "account.order.discount",
  "order.total": "account.order.total",
  "order.shippingTitle": "account.order.shipping-title",
  "order.note": "account.order.note",
  "order.deliveryTitle": "account.order.delivery-title",
  "order.carrier": "account.order.carrier",
  "order.tracking": "account.order.tracking",
  "order.trackCta": "account.order.track-cta",
  "order.reviewTitle": "account.order.review-title",
  "order.reviewSub": "account.order.review-sub",
  "order.reviewCta": "account.order.review-cta",
  "retract.cta": "account.retract.cta",
  "retract.reasonLabel": "account.retract.reason-label",
  "retract.reasonPlaceholder": "account.retract.reason-placeholder",
  "retract.policyNote": "account.retract.policy-note",
  "retract.submit": "account.retract.submit",
  "retract.personalized": "account.retract.personalized",
  "warranty.cta": "account.warranty.cta",
  "warranty.descLabel": "account.warranty.desc-label",
  "warranty.descPlaceholder": "account.warranty.desc-placeholder",
  "warranty.covered": "account.warranty.covered",
  "warranty.submit": "account.warranty.submit",
  "warranty.out": "account.warranty.out",
  "address.title": "account.address.title",
  "address.emptyTitle": "account.address.empty-title",
  "address.emptySub": "account.address.empty-sub",
  "address.add": "account.address.add",
  "address.edit": "account.address.edit",
  "address.delete": "account.address.delete",
  "address.confirm": "account.address.confirm",
  "address.confirmYes": "account.address.confirm-yes",
  "address.confirmNo": "account.address.confirm-no",
  "address.makeDefault": "account.address.make-default",
  "address.defaultBadge": "account.address.default-badge",
  "address.legacyTitle": "account.address.legacy-title",
  "address.legacyNote": "account.address.legacy-note",
  "address.legacyPrev": "account.address.legacy-prev",
  "address.defaultCheck": "account.address.default-check",
  "address.cancel": "account.address.cancel",
  "address.save": "account.address.save",
  "address.saving": "account.address.saving",
  "address.editTitle": "account.address.edit-title",
  "address.newTitle": "account.address.new-title",
  "address.subtitle": "account.address.subtitle",
  "designs.title": "account.designs.title",
  "designs.subtitle": "account.designs.subtitle",
  "designs.emptyTitle": "account.designs.empty-title",
  "designs.emptySub": "account.designs.empty-sub",
  "designs.emptyCta": "account.designs.empty-cta",
  "designs.used": "account.designs.used",
  "designs.share": "account.designs.share",
  "designs.shareWa": "account.designs.share-wa",
  "designs.view": "account.designs.view",
  "designs.revoke": "account.designs.revoke",
  "designs.archiveConfirm": "account.designs.archive-confirm",
  "designs.yes": "account.designs.yes",
  "designs.no": "account.designs.no",
  "designs.archiveAria": "account.designs.archive-aria",
  "favorites.title": "account.favorites.title",
  "favorites.subtitleEmpty": "account.favorites.subtitle-empty",
  "favorites.countSingle": "account.favorites.count-single",
  "favorites.countMany": "account.favorites.count-many",
  "favorites.emptyTitle": "account.favorites.empty-title",
  "favorites.emptySub": "account.favorites.empty-sub",
  "favorites.emptyCta": "account.favorites.empty-cta",
  "reviews.title": "account.reviews.title",
  "reviews.subtitle": "account.reviews.subtitle",
  "reviews.emptyTitle": "account.reviews.empty-title",
  "reviews.emptySub": "account.reviews.empty-sub",
  "reviews.emptyCta": "account.reviews.empty-cta",
  "reviews.published": "account.reviews.published",
  "reviews.pending": "account.reviews.pending",
  "reviews.delete": "account.reviews.delete",
  "reviews.confirm": "account.reviews.confirm",
  "reviews.yes": "account.reviews.yes",
  "reviews.no": "account.reviews.no",
  "security.title": "account.security.title",
  "security.subtitle": "account.security.subtitle",
  "security.passwordTitle": "account.security.password-title",
  "security.dangerTitle": "account.security.danger-title",
  "security.dangerNote": "account.security.danger-note",
  "security.dangerCta": "account.security.danger-cta",
  "delete.title": "account.delete.title",
  "delete.warn": "account.delete.warn",
  "delete.listTitle": "account.delete.list-title",
  "delete.item1": "account.delete.item1",
  "delete.item2": "account.delete.item2",
  "delete.item3": "account.delete.item3",
  "delete.item4": "account.delete.item4",
  "delete.item5": "account.delete.item5",
  "delete.contact": "account.delete.contact",
  "delete.contactEmail": "account.delete.contact-email",
  "delete.passwordLabel": "account.delete.password-label",
  "delete.passwordSuffix": "account.delete.password-suffix",
  "delete.confirmLabel": "account.delete.confirm-label",
  "delete.confirmWord": "account.delete.confirm-word",
  "delete.submit": "account.delete.submit",
  "delete.pending": "account.delete.pending",
};
