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
  BrainCircuit,
  BarChart2,
  Settings,
  MessageSquare,
  Box,
  Users,
  AlertCircle,
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
} from "lucide-react";

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
    title: "Ventas",
    icon: ShoppingCart,
    defaultOpen: true,
    items: [
      {
        label: "Pedidos",
        href: "/admin/pedidos",
        icon: Box,
        description:
          "Tablero de pedidos con filtros por estado, detalle de cada orden, reintento de guía Aveonline y cambio de estado manual (SHIPPED/DELIVERED/CANCELLED).",
      },
      {
        label: "Retractos",
        href: "/admin/retractos",
        icon: Undo2,
        description:
          "Solicitudes de retracto (Ley 1480/2439): aprobar, marcar devolución recibida y registrar el reembolso (el dinero se emite manualmente en Wompi/transferencia).",
      },
      {
        label: "Clientes",
        href: "/admin/clientes",
        icon: Users,
        description:
          "Customer 360: listado con filtros + perfil completo con pedidos, reseñas, direcciones, diseños, referidos y puntos de fidelidad.",
      },
      {
        label: "Reclamos",
        href: "/admin/reclamos",
        icon: AlertCircle,
        badge: { text: "Fase 4", tone: "phase4" },
        description:
          "Gestión de tickets de soporte (devoluciones, garantías, dudas). Llega tras Fase 2.",
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
      // Lucy 2026-06-26 — Opción C — Entries placeholder eliminadas del sidebar:
      // - "Plantillas" (chocaba con /admin/email-templates y con PersonalizationTemplate
      //   ya seedeado en BD). Cuando se construya el editor de plantillas del Estudio,
      //   irá en grupo "Estudio" con nombre "Plantillas del Estudio".
      // - "Recomendaciones" será dashboard de analytics sobre RecommendationLog, no
      //   editor — pertenece al grupo "Analítica" cuando llegue Fase 4.
    ],
  },
  {
    title: "Promociones",
    icon: Ticket,
    items: [
      { label: "Cupones", href: "/admin/cupones", icon: Ticket },
      {
        label: "Mayorista B2B",
        href: "/admin/mayorista",
        icon: Building2,
        badge: { text: "Próximo", tone: "soon" },
        description:
          "Cuentas mayoristas con precios especiales, listas de precios B2B y aprobación de pedidos en lote.",
      },
      // P1-17: "Redirects 301" se movió a Configuración — no es una promo,
      // es plumbing SEO. Lo dejamos cerca de Integraciones y General.
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
        badge: { text: "Fase 5", tone: "phase5" },
        description:
          "Inventario de materias primas, alertas de stock bajo, proveedores. Llega con Fase 5 (gestión interna).",
      },
      {
        label: "Costos de fabricación",
        href: "/admin/costos",
        icon: Calculator,
        badge: { text: "Fase 5", tone: "phase5" },
        description:
          "Costeo por producto (materiales + mano de obra + indirectos) y margen real por venta.",
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
        badge: { text: "Próximo", tone: "soon" },
        description:
          "Configuración del canal storefront (este sitio). Hoy se administra desde Configuración › General.",
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
    href: "/admin/finanzas",
    description:
      "Dashboard financiero: KPIs ingresos + DIAN + breakdown método pago. Marco preparado; datos reales llegan con Fase 2 (Checkout).",
  },
  {
    title: "IA y Conocimiento",
    icon: BrainCircuit,
    items: [
      { label: "Base de conocimiento", href: "/admin/contenido/bloques", icon: BookOpen },
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
        badge: { text: "Fase 4", tone: "phase4" },
        description:
          "Reportes de ventas, productos más vendidos, conversión, ticket promedio. Llega con datos reales (post-Fase 2).",
      },
      {
        label: "Salud técnica",
        href: "/admin/observability",
        icon: HeartPulse,
        description:
          "Panel de salud del sistema: errores del servidor, webhooks, órdenes a reconciliar, reversas de stock y Web Vitals. La fuente para saber si algo está roto (sin Sentry).",
      },
      {
        label: "Performance",
        href: "/admin/performance",
        icon: Gauge,
        badge: { text: "Próximo", tone: "soon" },
        description:
          "Web Vitals (LCP/CLS/INP) y errores server captados. Útil para optimizar performance del storefront.",
      },
      { label: "Auditoría", href: "/admin/auditoria", icon: Activity },
    ],
  },
  {
    title: "Configuración",
    icon: Settings,
    items: [
      { label: "General", href: "/admin/contenido/configuracion", icon: Cog },
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
          "Estado en vivo de Supabase, Wompi, Aveonline, Resend, WhatsApp, Turnstile, Anthropic + env vars requeridas + acciones humanas pendientes.",
      },
      {
        label: "Plantillas de correo",
        href: "/admin/email-templates",
        icon: Mail,
        description:
          "Lista de CmsBlocks tipo EMAIL (asunto + cuerpo + CTA). Editor reusa /admin/contenido. Layout react-email vive en código.",
      },
      // P1-17: movido desde "Promociones" — es plumbing SEO, no oferta comercial.
      {
        label: "Redirects 301",
        href: "/admin/redirects",
        icon: ArrowRightLeft,
        description:
          "URLs viejas que redirigen a las nuevas (SEO). Útil cuando renombras un producto o categoría y quieres preservar los links indexados en Google.",
      },
    ],
  },
  {
    title: "Mensajes",
    icon: MessageSquare,
    href: "/admin/mensajes",
    badge: { text: "Opcional", tone: "soon" },
    description:
      "Inbox unificado de WhatsApp + emails de soporte (cuando se cablee). Hoy opcional, no bloquea operación.",
  },
];

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
