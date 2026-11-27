import type { AdminReleaseNote } from "../types";

/**
 * Identificador persistido en `AdminHelpProgress.guideId` para registrar la
 * última versión de novedades marcada como leída por cada usuario admin.
 */
export const RELEASE_NOTES_PROGRESS_GUIDE_ID = "platform-release-notes";

/**
 * Registro vivo de novedades del panel administrativo (`ADR-197`).
 *
 * Política obligatoria:
 *   - Toda entrega que agregue, modifique o cambie el comportamiento de un
 *     módulo bajo `/admin/*` DEBE actualizar su guía en `content/*.ts` y sumar
 *     o actualizar aquí una entrada con `version` estrictamente creciente.
 *   - El servidor filtra automáticamente cada ítem según las capacidades RBAC
 *     del rol (`route` + `guideId` + `roles`), de modo que todo perfil del
 *     equipo —incluido `SUPERADMIN`— recibe aviso únicamente de los cambios
 *     pertinentes a los módulos que puede operar.
 *   - Orden: más reciente primero (mayor `version` arriba).
 */
export const ADMIN_RELEASE_NOTES: AdminReleaseNote[] = [
  {
    id: "2026-11-27-stock-omnicanal-finanzas-checkout-ayuda",
    version: 1,
    date: "2026-11-27",
    title: "Actualización operativa de la plataforma — Noviembre 2026",
    summary:
      "Mejoras de operación, controles de calidad y Centro de ayuda aplicadas a los módulos habilitados para tu rol.",
    items: [
      {
        id: "ayuda-novedades-por-rol",
        category: "nuevo",
        title: "Nueva pestaña «Novedades» y avisos de cambios por rol en el Centro de ayuda",
        detail:
          "Cada entrega que modifique pantallas, reglas o procedimientos del panel ahora publica aquí sus novedades filtradas por tus permisos (para todos los roles, incluido Superadmin), con confirmación de lectura guardada en tu usuario.",
        guideId: "ayuda",
        route: "/admin/ayuda",
      },
      {
        id: "inventario-adr208-1b",
        category: "mejora",
        title: "Inventario físico 100 % real y paridad 1:1 de reserva de seguridad (`ADR-208`)",
        detail:
          "Los productos del Estudio (`MADE_TO_ORDER`) quedaron normalizados en stock 0 y ya no aparecen en /admin/inventario ni aceptan ajustes manuales de stock. Para productos físicos (`PHYSICAL_STOCK`), la reserva `safetyStock` aplica igual en lucamsshop.com, canales externos y feeds (`disponible neto = máx(0, stock − reserva)`).",
        guideId: "inventario",
        route: "/admin/inventario",
      },
      {
        id: "productos-atributos-variantes",
        category: "correccion",
        title: "Preservación segura de atributos técnicos en opciones de producto",
        detail:
          "Editar opciones desde /admin/productos conserva intactos los atributos técnicos internos (como dimensiones logísticas `_shipping`, `noFold` y `facesPerUnit`) sin sobrescribirlos al guardar.",
        guideId: "productos",
        route: "/admin/productos",
      },
      {
        id: "metricas-intencion-bajo-pedido",
        category: "correccion",
        title: "Intención comercial en Métricas distingue productos «Bajo pedido»",
        detail:
          "En el bloque «Intención comercial latente vs. inventario vivo», los productos del Estudio guardados en Favoritos ahora muestran estado propio «Bajo pedido» (`—` en Stock vivo) y enlazan directo a /admin/productos/[id] en lugar de marcarse como agotados.",
        guideId: "metricas",
        route: "/admin/metricas",
      },
      {
        id: "garantias-finanzas-reembolso",
        category: "mejora",
        title: "Reembolsos de garantía integrados en Finanzas, LTV y CSV contable",
        detail:
          "Resolver una garantía con devolución de dinero (`REFUND`) ahora registra monto y método real (Superadmin + MFA) y se descuenta automáticamente en /admin/finanzas, en la columna `reembolso_garantia_cop` del CSV contable y en el LTV del cliente, sin doble descuento si la orden ya estaba reembolsada.",
        guideId: "garantias",
        route: "/admin/garantias",
      },
      {
        id: "finanzas-csv-reembolso-garantia",
        category: "mejora",
        title: "Nueva columna `reembolso_garantia_cop` en el CSV contable",
        detail:
          "El reporte de /admin/finanzas y su exportación CSV DIAN ahora deducen los desembolsos reales de garantías cerradas en el período y muestran su detalle separado para cuadre con contabilidad.",
        guideId: "finanzas",
        route: "/admin/finanzas",
      },
      {
        id: "retractos-festivos-colombia",
        category: "correccion",
        title: "Ventana de retracto calculada con festivos oficiales de Colombia",
        detail:
          "El conteo de 5 días hábiles para ejercer retracto usa ahora el calendario oficial de días hábiles colombianos (incluyendo la Ley Emiliani y el 9 de julio de la Ley 2578).",
        guideId: "retractos",
        route: "/admin/retractos",
      },
      {
        id: "pedidos-snapshots-y-aveonline",
        category: "mejora",
        title: "Snapshots históricos de producto/SKU en pedidos y guías Aveonline desacopladas",
        detail:
          "Cada pedido (tienda y B2B) conserva el nombre y SKU vigentes al comprar (`ADR-211`), incluso si luego editas el catálogo. Además, la creación de guías Aveonline corre en segundo plano con recuperación automática en `tracking-sync` para no bloquear pagos.",
        guideId: "pedidos",
        route: "/admin/pedidos",
      },
      {
        id: "carritos-recotizacion-checkout",
        category: "mejora",
        title: "Re-cotización automática con aviso visible al retomar un carrito (`ADR-211`)",
        detail:
          "Si cambias un precio o escala mayorista mientras un cliente tiene ítems en el carrito, al entrar al checkout el sistema actualiza al precio vigente, muestra un banner explicativo antes de pagar y refresca escalas al fusionar carritos.",
        guideId: "carritos",
        route: "/admin/carritos",
      },
      {
        id: "observabilidad-alerta-guia-y-dr",
        category: "seguridad",
        title: "Alerta automática (> 30 min sin guía externa), Web Vitals en lotes y DR verificado",
        detail:
          "Salud técnica incorpora alerta de prioridad alta si un pedido pagado lleva más de 30 min sin guía externa, respaldos streaming a R2 con simulacro DR validando Auth/MFA y envío agrupado de Web Vitals en /admin/performance.",
        guideId: "observability",
        route: "/admin/observability",
      },
    ],
  },
];
