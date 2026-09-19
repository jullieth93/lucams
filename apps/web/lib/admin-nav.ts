/*
 * Admin navigation source of truth — usado por admin-shell.tsx (sidebar)
 * y por la página catch-all [...placeholder] (que necesita conocer el
 * label + estado de cada link para mostrar info contextual cuando el
 * cliente clickea un módulo "Próximo").
 *
 * Si agregás una página admin nueva:
 *   1. Crea apps/web/app/admin/(panel)/<ruta>/page.tsx
 *   2. Si no estaba en el NAV (link nuevo), agregalo acá
 *   3. Si SÍ estaba con badge "Próximo", quitá el badge y opcionalmente
 *      el campo `phase` (para que ya no caiga al catch-all como "en desarrollo")
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShieldCheck,
  ShoppingCart,
  Package,
  Ticket,
  Factory,
  Globe,
  DollarSign,
  Wallet,
  ShieldBan,
  BarChart2,
  Settings,
  Box,
  Users,
  AlertCircle,
  ShieldAlert,
  Star,
  Layers,
  Tag,
  Building2,
  ArrowRightLeft,
  Boxes,
  Calculator,
  Store,
  ShoppingBag,
  BookOpen,
  Bot,
  TrendingUp,
  Gauge,
  Activity,
  Cog,
  UserPlus,
  Plug,
  Mail,
  Undo2,
  HeartPulse,
  Shapes,
  BadgeCheck,
  LifeBuoy,
  FileText,
  Headset,
  Image,
  Bell,
  LayoutTemplate,
  Megaphone,
  MailCheck,
} from "lucide-react";
import { isCatalogMode } from "@/lib/store-mode";

/** Badge visual + filtro de estado. */
export type NavBadge = {
  text: string;
  tone: "soon" | "phase4" | "phase5";
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: NavBadge;
  /** Descripción contextual mostrada en la página "En desarrollo" cuando el
   *  link no está implementado todavía. */
  description?: string;
};

export type NavGroup = {
  title: string;
  icon: LucideIcon;
  items?: NavItem[];
  href?: string;
  badge?: NavBadge;
  defaultOpen?: boolean;
  description?: string;
};

export const ADMIN_NAV: NavGroup[] = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/admin/dashboard",
  },
  {
    // Top-level (Lucy 2026-08-11): dentro del grupo colapsado "Analítica" la
    // campana no se veía — el negocio no se enteraba de los avisos. Ahora es
    // hoja visible con el pill de no-leídas siempre a la vista.
    title: "Notificaciones",
    icon: Bell,
    href: "/admin/notificaciones",
    description:
      "Avisos de tu tienda (pedidos nuevos, alertas, cotizaciones, resumen diario) con pendientes por leer.",
  },
  {
    title: "Ventas",
    icon: ShoppingCart,
    defaultOpen: true,
    items: [
      // Feedback Lucy 2026-09-18: "Cotizaciones" (/admin/cotizaciones) salió del
      // nav — es módulo heredado de la Etapa 1 (modo catálogo) y la tienda corre
      // en modo full (Wompi/COD); el QuoteForm ni se renderiza (isCatalogMode).
      // Las páginas SIGUEN vivas por URL directa (histórico Etapa 1 + RBAC
      // CATALOG en admin-rbac): solo se oculta la entrada del sidebar, en AMBOS
      // modos. Además createQuoteAction rechaza creaciones fuera de modo catálogo.
      {
        label: "Pedidos",
        href: "/admin/pedidos",
        icon: Box,
        description:
          "Tablero de pedidos con filtros por estado, detalle de cada orden, reintento de guía Aveonline y cambio de estado manual (SHIPPED/DELIVERED/CANCELLED).",
      },
      {
        label: "Clientes",
        href: "/admin/clientes",
        icon: Users,
        description:
          "Customer 360: listado con filtros + perfil completo con pedidos, reseñas, direcciones, diseños, referidos y puntos de fidelidad.",
      },
      {
        label: "Reseñas",
        href: "/admin/resenas",
        icon: Star,
        description:
          "Moderación: aprobar/rechazar reseñas pendientes, destacar las mejores en home, archivar las que no sirven.",
      },
    ],
  },
  {
    // 2026-07-28 — decisión Lucy/Kimi: los 4 tipos de caso (Soporte, Retractos,
    // Garantías, Reclamos) + la revisión de diseños NO se fusionan en un solo
    // módulo: legalmente son flujos distintos (retracto Ley 1480, garantía
    // legal, SAC) y cada uno conserva su pantalla y su proceso. Solo se
    // REAGRUPAN bajo esta sección (colapsada por defecto) para que el menú
    // quede corto: Ventas = lo del día a día; acá = los casos puntuales.
    title: "Servicio al cliente",
    icon: Headset,
    defaultOpen: false,
    items: [
      {
        label: "Soporte",
        href: "/admin/soporte",
        icon: LifeBuoy,
        description:
          "Tickets de soporte que llegan desde /contacto: responder por email (mailto), asignar estado y cerrar. Al cerrar, el cliente recibe aviso por correo. Bandeja única — acá converge la antigua /admin/mensajes (N-09).",
      },
      {
        label: "Moderación",
        href: "/admin/moderacion",
        icon: ShieldAlert,
        description:
          "Revisa el contenido de cada diseño personalizado antes de imprimirlo. Aprueba para producir o rechaza (avisamos al cliente). Un pedido no se puede marcar enviado con diseños sin aprobar.",
      },
      {
        label: "Retractos",
        href: "/admin/retractos",
        icon: Undo2,
        description:
          "Solicitudes de retracto (Ley 1480/2439): aprobar, marcar devolución recibida y registrar el reembolso (el dinero se emite manualmente en Wompi/transferencia).",
      },
      {
        label: "Garantías",
        href: "/admin/garantias",
        icon: BadgeCheck,
        description:
          "Reclamos de garantía legal (1 año, Ley 1480): recibir, evaluar, resolver (reparación/reposición/devolución) y notificar al cliente en cada paso.",
      },
      {
        label: "Reclamos",
        href: "/admin/reclamos",
        icon: AlertCircle,
        description:
          "Gestión de reclamos de garantía: revisa, resuelve o rechaza con remedio (reparación, cambio o devolución).",
      },
    ],
  },
  {
    title: "Catálogo",
    icon: Package,
    defaultOpen: true,
    items: [
      { label: "Productos", href: "/admin/productos", icon: ShoppingBag },
      {
        label: "Inventario",
        href: "/admin/inventario",
        icon: Boxes,
        description:
          "Stock de todas las versiones de un vistazo. Filtra por agotadas o stock bajo y ajusta cantidades sin entrar producto por producto.",
      },
      { label: "Categorías", href: "/admin/categorias", icon: Layers },
      { label: "Ocasiones", href: "/admin/ocasiones", icon: Tag },
      {
        label: "Plantillas del Estudio",
        href: "/admin/plantillas",
        icon: Shapes,
        description:
          "Revisa el preview REAL de cada plantilla del Estudio y apruébala (aparece para el cliente) u ocúltala. Aprobar una descartada la restaura.",
      },
      // N-16 (2026-09-11): módulo que solo era alcanzable desde los QuickLinks del
      // dashboard. Mismo grupo que "Plantillas del Estudio" (ambos alimentan el
      // Estudio; permiso de ruta CATALOG/MANAGER_UP en admin-rbac).
      // 2026-09-15: "Fichas del abecedario" (antes item hermano /admin/fichas) se
      // embebió como tab dentro de /admin/disenos — un solo entry point para todo
      // el material visual del Estudio. /admin/fichas es redirect permanente.
      {
        label: "Diseños prediseñados",
        href: "/admin/disenos",
        icon: LayoutTemplate,
        description:
          "Imágenes de diseño listas que el cliente aplica con un toque en el Estudio (en vez de subir su propia foto), agrupadas por producto. Incluye el tab “Fichas del abecedario”: abecedarios ilustrados por tema (Animales, Navidad…) que alimentan el editor de nombres y los packs de letras.",
      },
      // Lucy 2026-06-26 — Opción C — Entries placeholder eliminadas del sidebar:
      // - "Plantillas" (chocaba con /admin/email-templates y con PersonalizationTemplate
      //   ya seedeado en BD). Cuando se construya el editor de plantillas del Estudio,
      //   irá en grupo "Estudio" con nombre "Plantillas del Estudio".
    ],
  },
  {
    title: "Promociones",
    icon: Ticket,
    items: [
      { label: "Cupones", href: "/admin/cupones", icon: Ticket },
      {
        label: "Precios al por mayor",
        href: "/admin/mayorista",
        icon: Building2,
        description:
          "Niveles de precio mayorista B2B por producto o catálogo completo (cantidad mínima → precio por unidad).",
      },
      // P1-17: "Redirects 301" se movió a Configuración — no es una promo,
      // es plumbing SEO. Lo dejamos cerca de Integraciones y General.
    ],
  },
  {
    // Feedback Lucy 2026-09-18 (Fase 3A): primer módulo de marketing — la vista
    // de suscriptores del newsletter (tabla Consent scope=NEWSLETTER + Resend
    // Contacts). Solo lectura + export CSV; las campañas se envían desde Resend.
    title: "Marketing",
    icon: Megaphone,
    items: [
      {
        label: "Suscriptores",
        href: "/admin/marketing/suscriptores",
        icon: MailCheck,
        description:
          "Audiencia del newsletter: emails suscritos (y dados de baja) con fecha y versión del aviso de privacidad. Exportable a CSV.",
      },
    ],
  },
  {
    title: "Producción",
    icon: Factory,
    items: [
      {
        label: "Materiales e Insumos",
        href: "/admin/materiales",
        icon: Boxes,
        description: "Inventario de materiales e insumos de producción con alerta de bajo stock.",
      },
      {
        label: "Costos de fabricación",
        href: "/admin/costos",
        icon: Calculator,
        description: "Costo de fabricación por producto y margen contra el precio de venta.",
      },
    ],
  },
  {
    title: "Canales",
    icon: Globe,
    items: [
      {
        label: "Tienda Lucams",
        href: "/admin/canales/tienda",
        icon: Store,
        description:
          "Estado del canal Tienda online: URL, modo de tienda y salud de integraciones.",
      },
      {
        label: "Mercado Libre",
        href: "/admin/canales/mercadolibre",
        icon: ShoppingBag,
        badge: { text: "Próximo", tone: "soon" },
        description:
          "Sincronización de catálogo con Mercado Libre Colombia. Requiere integración OAuth con cuenta vendedor.",
      },
    ],
  },
  {
    title: "Finanzas",
    icon: DollarSign,
    items: [
      {
        label: "Resumen",
        href: "/admin/finanzas",
        icon: DollarSign,
      },
      {
        label: "Conciliación contra entrega",
        href: "/admin/finanzas/conciliacion",
        icon: Wallet,
        description:
          "Efectivo de los pedidos contra entrega ya entregados: marca qué remesó el mensajero, cuánto falta y las discrepancias (antifraude).",
      },
      {
        label: "Bloqueos contra entrega",
        href: "/admin/finanzas/bloqueos",
        icon: ShieldBan,
        description:
          "Teléfonos, emails y direcciones vetados que no pueden pagar contra entrega (anti-abuso COD). Pueden pagar en línea.",
      },
    ],
  },
  {
    title: "Contenido",
    icon: FileText,
    items: [
      { label: "Páginas del sitio", href: "/admin/contenido", icon: BookOpen },
      {
        label: "Mediateca",
        href: "/admin/contenido/mediateca",
        icon: Image,
        description:
          "Biblioteca de imágenes del sitio (banners, hero, logos). Sube una vez y reutiliza en los campos de imagen.",
      },
      {
        label: "Bot WhatsApp",
        href: "/admin/bot",
        icon: Bot,
        badge: { text: "Fase 5+", tone: "phase5" },
        description:
          "Asistente WhatsApp con IA (responder ¿qué le regalo a mi mamá? consultando base de conocimiento). Llega con Fase 5+.",
      },
    ],
  },
  {
    title: "Analítica",
    icon: BarChart2,
    items: [
      {
        label: "Métricas",
        href: "/admin/metricas",
        icon: TrendingUp,
        description: "Métricas de ventas: pedidos, cotizaciones, ingresos del mes y top productos.",
      },
      {
        label: "Salud técnica",
        href: "/admin/observability",
        icon: HeartPulse,
        description:
          "Panel de salud del sistema: errores del servidor, webhooks, órdenes a reconciliar, reversas de stock y Web Vitals. La fuente para saber si algo está roto (sin Sentry).",
      },
      {
        label: "Rendimiento web",
        href: "/admin/performance",
        icon: Gauge,
        description: "Rendimiento técnico: errores recientes y métricas web (LCP/CLS/INP).",
      },
      { label: "Auditoría", href: "/admin/auditoria", icon: Activity },
    ],
  },
  {
    title: "Configuración",
    icon: Settings,
    items: [
      { label: "Ajustes del sitio", href: "/admin/contenido/paginas/global", icon: Cog },
      {
        label: "Seguridad (2 pasos)",
        href: "/admin/seguridad",
        icon: ShieldCheck,
        description: "Verificación en 2 pasos (MFA/TOTP) de tu cuenta admin: activar, desactivar.",
      },
      {
        label: "Usuarios y acceso",
        href: "/admin/usuarios",
        icon: UserPlus,
        description:
          "Gestión de admins: listar, promover clientes existentes, cambiar rol (Superadmin/Manager/Fulfillment), activar/desactivar. Solo Superadmin.",
      },
      {
        label: "Integraciones",
        href: "/admin/integraciones",
        icon: Plug,
        description:
          "Estado en vivo de Supabase, Wompi, Aveonline, Resend, WhatsApp, Turnstile + env vars requeridas + acciones humanas pendientes.",
      },
      {
        label: "Plantillas de correo",
        href: "/admin/email-templates",
        icon: Mail,
        description:
          "Las 26 plantillas transaccionales (pedidos, retracto, soporte, garantías, marketing): preview renderizado, edición de asunto/preheader/titular y envío de prueba. Solo Superadmin.",
      },
      // P1-17: movido desde "Promociones" — es plumbing SEO, no oferta comercial.
      {
        label: "Redirecciones (SEO)",
        href: "/admin/redirects",
        icon: ArrowRightLeft,
        description:
          "URLs viejas que redirigen a las nuevas (SEO). Útil cuando renombras un producto o categoría y quieres preservar los links indexados en Google.",
      },
    ],
  },
];

/* N-09 (2026-09-11): la entrada top-level "Mensajes" (/admin/mensajes) se ELIMINÓ
 * del nav — era una segunda bandeja sobre el mismo servicio de tickets que
 * /admin/soporte (mismas acciones, permisos y auditoría). /admin/mensajes queda
 * como redirect permanente (308) a /admin/soporte; la bandeja operativa única es
 * "Soporte" dentro del grupo "Servicio al cliente". La decisión de NO fusionar de
 * más arriba (Servicio al cliente, 2026-07-28) cubre los 4 tipos de caso legales;
 * este par SÍ se fusionó porque no había flujo legal distinto: misma tabla, mismo
 * servicio, misma matriz RBAC (CATALOG). */

/**
 * NAV efectivo según el modo de tienda (Etapa 1/2 — lib/store-mode).
 *
 * En TODOS los modos se ocultan los módulos futuros descopeados (decisión
 * develop 5499161): "Mercado Libre" (Canales) y "Bot WhatsApp IA".
 * En modo catálogo (Etapa 1), además, no hay pagos en línea ni envíos
 * integrados, así que el sidebar oculta lo que no aplica:
 *   - el grupo "Finanzas" completo (resumen, conciliación y bloqueos COD),
 *   - "Integraciones" dentro de "Configuración" (Wompi/Aveonline apagadas),
 *   - "Precios al por mayor" dentro de "Promociones" (WholesaleTier no tiene NINGÚN
 *     consumidor fuera del admin: ni PDP, ni carrito, ni cotización aplican
 *     niveles B2B — módulo de Etapa 2).
 *
 * ADMIN_NAV se mantiene exportado e intacto: lo usa el catch-all placeholder
 * (findNavItem) para mostrar info contextual de módulos "Próximo". El consumidor
 * del sidebar (admin-shell.tsx) usa ESTA función.
 */
export function getAdminNav(): NavGroup[] {
  // Módulos futuros explícitamente descopeados: ocultos en TODOS los modos
  // (decisión develop 5499161): Mercado Libre (Canales) y Bot WhatsApp IA.
  const withoutFuture = ADMIN_NAV.map((group) => {
    if (group.title === "Canales" && group.items) {
      return {
        ...group,
        items: group.items.filter((it) => it.label !== "Mercado Libre"),
      };
    }
    if (group.title === "Contenido" && group.items) {
      return {
        ...group,
        items: group.items.filter((it) => it.label !== "Bot WhatsApp"),
      };
    }
    return group;
  });
  if (!isCatalogMode()) {
    return withoutFuture.filter((group) => !group.items || group.items.length > 0 || group.href);
  }
  // Modo catálogo (Etapa 1): además de los futuros, se ocultan lo que solo aplica
  // con pagos/envíos online (grupo Finanzas completo, Integraciones) y Precios al por mayor
  // (WholesaleTier sin consumidor en storefront hasta Etapa 2). Coherente con los
  // gates de página (esas rutas redirigen a /admin/dashboard en este modo).
  return withoutFuture
    .filter((group) => group.title !== "Finanzas")
    .map((group) => {
      if (group.title === "Promociones" && group.items) {
        return { ...group, items: group.items.filter((it) => it.href !== "/admin/mayorista") };
      }
      if (group.title === "Configuración" && group.items) {
        return { ...group, items: group.items.filter((it) => it.href !== "/admin/integraciones") };
      }
      return group;
    })
    .filter((group) => !group.items || group.items.length > 0 || group.href);
}

/**
 * Busca un item en el NAV por href (full path o prefix). Útil para el
 * catch-all placeholder que necesita mostrar el label correcto.
 */
export function findNavItem(
  href: string,
): { label: string; group: string; item?: NavItem; group_obj?: NavGroup } | null {
  for (const group of ADMIN_NAV) {
    // Leaf top-level
    if (group.href === href) {
      return { label: group.title, group: group.title, group_obj: group };
    }
    // Items dentro de grupo
    if (group.items) {
      for (const item of group.items) {
        if (item.href === href || href.startsWith(item.href + "/")) {
          return { label: item.label, group: group.title, item };
        }
      }
    }
  }
  return null;
}
