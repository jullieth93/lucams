/*
 * Textos del área de cliente /mi-cuenta (roadmap B9) — estructura + defaults.
 *
 * DEFAULT_ACCOUNT_TEXTS replica EXACTAMENTE el copy pre-CMS (regla de oro: si
 * la DB cae o un campo no está publicado, la pantalla se ve idéntica a hoy).
 * ACCOUNT_TEXT_KEYS mapea cada texto a su key CMS (`account.<seccion>.<campo>`).
 * La resolución server-side vive en account-texts.server.ts (getAccountTexts).
 */

import { RETRACT_WINDOW_BUSINESS_DAYS } from "@/lib/consumer-law";

export type AccountTexts = {
  nav: {
    resumen: string;
    pedidos: string;
    disenos: string;
    favoritos: string;
    direcciones: string;
    resenas: string;
    cupones: string;
    perfil: string;
    soporte: string;
    seguridad: string;
    logout: string;
    aria: string;
  };
  back: { miCuenta: string; misPedidos: string };
  perfil: {
    title: string;
    subtitle: string;
    docTypeLabel: string;
    docTypePlaceholder: string;
    docNumberLabel: string;
    docHint: string;
    /** Hint del DV calculado para NIT ({dv} = el dígito). */
    nitDvHint: string;
  };
  /** Puntos Lucams en el hub /mi-cuenta (2026-10-13). {valor} = equivalencia
   *  en pesos del balance; {earn}/{per1000}/{min}/{max} = config del programa
   *  (features/loyalty/settings). */
  loyalty: {
    balanceValue: string;
    mechanics: string;
  };
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
  reorder: {
    cta: string;
    pending: string;
    addedTitle: string;
    needsPhotosTitle: string;
    needsPhotosNote: string;
    photosCta: string;
    unavailableTitle: string;
    goToCart: string;
    priceNow: string;
    priceWas: string;
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
    neighborhoodPlaceholder: string;
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
    /** Fase 2 · item 2.4 (2026-10-07) — borradores vigentes en "Mis diseños":
     *  badge de la tarjeta y CTA que reabre el Estudio con ?designId=. */
    draftBadge: string;
    draftResume: string;
    /** 2026-10-13 — CTA «Editar» de la tarjeta READY: abre el Estudio con
     *  ?designId= (el recover clona READY→DRAFT; al finalizar queda listo de
     *  nuevo) y badge «Listo» para la distinción Borrador/Listo. */
    edit: string;
    readyBadge: string;
    inCartBadge: string;
    /** 2026-10-13 — sección «Borradores» (colapsable, debajo de los listos):
     *  título, contador ({n} = cantidad), eliminación individual con
     *  confirmación y «Vaciar borradores» con confirmación. */
    draftsSection: string;
    draftsCountSingle: string;
    draftsCountMany: string;
    draftDelete: string;
    draftDeleteConfirm: string;
    draftsEmpty: string;
    draftsEmptyConfirm: string;
    /** 2026-10-20 — confirmaciones destructivas como Dialog real (reemplazan el
     *  confirm inline "Sí/No" de texto xs): cuerpo del diálogo + rótulo del
     *  botón destructivo por acción, y «Cancelar» compartido. Los títulos del
     *  diálogo reusan archiveConfirm/draftDeleteConfirm/draftsEmptyConfirm. */
    archiveBody: string;
    archiveYes: string;
    draftDeleteBody: string;
    draftDeleteYes: string;
    draftsEmptyBody: string;
    draftsEmptyYes: string;
    cancel: string;
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
    cupones: "Mis cupones",
    perfil: "Perfil",
    soporte: "Soporte",
    seguridad: "Seguridad",
    logout: "Cerrar sesión",
    aria: "Secciones de mi cuenta",
  },
  back: { miCuenta: "Mi cuenta", misPedidos: "Mis pedidos" },
  perfil: {
    title: "Editar perfil",
    subtitle: "Tu correo {email} es tu identidad y no se cambia aquí.",
    docTypeLabel: "Tipo de documento",
    docTypePlaceholder: "Elige el tipo",
    docNumberLabel: "Número de documento",
    docHint: "Lo usamos para pre-llenar tu checkout y para tu documento de venta si lo pides.",
    nitDvHint: "Dígito de verificación: {dv} — lo agregamos al guardar.",
  },
  loyalty: {
    balanceValue: "≈ {valor} de descuento",
    mechanics:
      "Ganas 1 punto por cada ${earn} que pagues en tus pedidos. Al pagar puedes redimirlos como descuento: {per1000} puntos = $1.000 de descuento (mínimo {min} puntos, hasta el {max}% del valor de tus productos). Tus puntos no vencen.",
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
    policyNote: `Tienes ${RETRACT_WINDOW_BUSINESS_DAYS} días hábiles desde la entrega. Coordinamos la devolución contigo; el costo del envío corre por tu cuenta, salvo que el producto llegara defectuoso o equivocado. Ver [política de devoluciones](/legal/devoluciones).`,
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
  reorder: {
    cta: "Volver a pedir",
    pending: "Armando tu carrito…",
    addedTitle: "Agregamos a tu carrito:",
    needsPhotosTitle: "Para repetir estos, sube las fotos de nuevo:",
    needsPhotosNote:
      "Por privacidad borramos las fotos de los pedidos entregados hace más de 90 días.",
    photosCta: "Crearlo de nuevo",
    unavailableTitle: "Ya no pudimos agregar:",
    goToCart: "Ir al carrito",
    priceNow: "ahora {precio}",
    priceWas: "antes {precio}",
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
    neighborhoodPlaceholder: "Ej. Cedritos, La Alameda",
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
    draftBadge: "Borrador",
    draftResume: "Seguir editando",
    edit: "Editar",
    readyBadge: "Listo",
    inCartBadge: "En carrito",
    draftsSection: "Borradores",
    draftsCountSingle: "{n} borrador",
    draftsCountMany: "{n} borradores",
    draftDelete: "Eliminar",
    draftDeleteConfirm: "¿Eliminar?",
    draftsEmpty: "Vaciar borradores",
    draftsEmptyConfirm: "¿Vaciar todos?",
    archiveBody: "El diseño dejará de aparecer en tu lista de «Mis diseños».",
    archiveYes: "Sí, archivar",
    draftDeleteBody:
      "Se eliminará este borrador con las fotos que subiste. Esta acción no se puede deshacer.",
    draftDeleteYes: "Sí, eliminar",
    draftsEmptyBody:
      "Se eliminarán TODOS tus borradores con las fotos que subiste. Esta acción no se puede deshacer.",
    draftsEmptyYes: "Sí, vaciar",
    cancel: "Cancelar",
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
