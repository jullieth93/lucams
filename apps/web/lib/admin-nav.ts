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
  Sparkles,
  Wand2,
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
        badge: { text: "Fase 4", tone: "phase4" },
        description:
          "Tablero de pedidos con filtros por estado, detalle de cada orden y cambio de estado manual. Llega con Fase 2 (Checkout + Wompi) ya que necesita Orders reales.",
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
      { label: "Categorías", href: "/admin/categorias", icon: Layers },
      { label: "Ocasiones", href: "/admin/ocasiones", icon: Tag },
      {
        label: "Plantillas",
        href: "/admin/plantillas",
        icon: Sparkles,
        badge: { text: "Próximo", tone: "soon" },
        description:
          "Editor de plantillas pre-armadas para el Estudio (composiciones que el cliente parte y personaliza).",
      },
      {
        label: "Recomendaciones",
        href: "/admin/recomendaciones",
        icon: Wand2,
        badge: { text: "Fase 4", tone: "phase4" },
        description:
          "Sistema de recomendaciones cross-sell + bestsellers + 'compran junto'. Llega con Fase 4.",
      },
    ],
  },
  {
    title: "Comercial",
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
      {
        label: "Redirects 301",
        href: "/admin/redirects",
        icon: ArrowRightLeft,
        badge: { text: "Próximo", tone: "soon" },
        description:
          "Gestión de URLs legacy → nuevas (SEO). Hoy se administran desde el código (apps/web/lib/product-redirects.ts).",
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
    badge: { text: "Próximo", tone: "soon" },
    description:
      "Dashboard financiero: ingresos, egresos, IVA, conciliación con Wompi. Próxima sub-fase.",
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
        label: "Usuarios y acceso",
        href: "/admin/usuarios",
        icon: UserPlus,
        badge: { text: "Próximo", tone: "soon" },
        description:
          "Gestión de admins: invitar nuevos, asignar roles, 2FA. Hoy hay solo 1 admin (tú); útil cuando crezca el equipo.",
      },
      {
        label: "Integraciones",
        href: "/admin/integraciones",
        icon: Plug,
        badge: { text: "Próximo", tone: "soon" },
        description:
          "Estado de integraciones (Wompi, Aveonline, Resend, Supabase) + rotación de keys. Próxima sub-fase.",
      },
      {
        label: "Plantillas de correo",
        href: "/admin/email-templates",
        icon: Mail,
        badge: { text: "Próximo", tone: "soon" },
        description:
          "Editor de emails transaccionales (confirmación pedido, envío, etc.). Hoy se administran desde código.",
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
