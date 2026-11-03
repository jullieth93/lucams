/*
 * Mapa nombre → icono lucide para las tarjetas de CmsPage.
 *
 * CmsPage.icon guarda el NOMBRE del icono (lo escribe packages/db/scripts/
 * cms-site-map.mjs); acá lo resolvemos a componente. Uso: lookup directo
 * `CMS_PAGE_ICONS[page.icon ?? ""] ?? FileText` en el render de la página
 * (un helper que devuelva el componente dispara react-hooks/static-components).
 */

import {
  Home,
  PanelTop,
  PanelBottom,
  Mail,
  HelpCircle,
  CreditCard,
  Package,
  ShoppingCart,
  User,
  Scale,
  MailOpen,
  AlertTriangle,
  Wrench,
  Search,
  FileText,
  Settings,
  Cog,
  Truck,
  Receipt,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

export const CMS_PAGE_ICONS: Record<string, LucideIcon> = {
  Home,
  PanelTop,
  PanelBottom,
  Mail,
  HelpCircle,
  CreditCard,
  Package,
  ShoppingCart,
  User,
  Scale,
  MailOpen,
  AlertTriangle,
  Wrench,
  Search,
  FileText,
  Settings,
  Cog,
  Truck,
  Receipt,
  MoreHorizontal,
};

/**
 * Settings de Capa 1 cuya UI oficial, validada y tipada vive en su propio
 * módulo del Admin (/admin/envios, /admin/fidelizacion y
 * /admin/carritos/configuracion). Se mantienen en `CmsField` como fuente de
 * datos única, pero se ocultan como inputs/JSON crudos en «Ajustes del sitio»
 * y en el buscador de /admin/contenido para evitar edición duplicada o rota.
 */
export const MODULE_MANAGED_SETTING_KEYS = new Set<string>([
  // /admin/envios (6)
  "LUCAMS_SHIPPING_ENABLED",
  "LUCAMS_SHIPPING_PRICE_COP",
  "LUCAMS_SHIPPING_CUTOFF_HOUR",
  "LUCAMS_SHIPPING_ZONES",
  "SHIPPING_DISABLED_CARRIERS",
  "SHIPPING_CARRIER_RULES",
  // /admin/fidelizacion (10)
  "LOYALTY_ENABLED",
  "LOYALTY_EARN_COP_PER_POINT",
  "LOYALTY_REDEEM_POINTS_PER_1000",
  "LOYALTY_REDEEM_MIN_POINTS",
  "LOYALTY_REDEEM_MAX_PERCENT",
  "LOYALTY_EXPIRATION_ENABLED",
  "LOYALTY_EXPIRATION_DAYS",
  "REFERRAL_ENABLED",
  "REFERRAL_REWARD_PERCENT",
  "REFERRAL_REWARD_DAYS",
  // /admin/carritos/configuracion (5)
  "CART_RECOVERY_ENABLED",
  "CART_RECOVERY_MODE",
  "CART_RECOVERY_IDLE_HOURS",
  "CART_RECOVERY_MAX_REMINDERS",
  "CART_RECOVERY_INTERVAL_HOURS",
]);

/** Resuelve el módulo propietario de un setting gestionado fuera de Ajustes del sitio. */
export function ownerModuleHrefForSettingKey(key: string): string | null {
  if (key.startsWith("LUCAMS_SHIPPING_") || key.startsWith("SHIPPING_")) {
    return "/admin/envios";
  }
  if (key.startsWith("LOYALTY_") || key.startsWith("REFERRAL_")) {
    return "/admin/fidelizacion";
  }
  if (key.startsWith("CART_RECOVERY_")) {
    return "/admin/carritos/configuracion";
  }
  return null;
}

const LEGAL_DOC_SLUGS = new Set([
  "privacidad",
  "terminos",
  "cookies",
  "devoluciones",
  "garantias",
  "habeas-data",
  "subprocesadores",
  "security",
]);

const SEO_PAGE_PATHS: Record<string, string> = {
  "seo.page.home": "/",
  "seo.page.catalogo": "/productos",
  "seo.page.recomendador": "/recomendador",
  "seo.page.ayuda": "/ayuda",
  "seo.page.contacto": "/contacto",
  "seo.page.rastrear": "/rastrear",
};

/**
 * Ruta pública individual asociada a un campo cuando su contenedor agrupa
 * varias URLs distintas (ej. los 8 documentos de `legales` o las 6 rutas de `seo`).
 */
export function publicPathForCmsFieldKey(key: string): string | null {
  if (key in SEO_PAGE_PATHS) return SEO_PAGE_PATHS[key]!;
  if (key.startsWith("legal.")) {
    const rest = key.slice("legal.".length).replace(/\.heading$/, "");
    if (LEGAL_DOC_SLUGS.has(rest)) return `/legal/${rest}`;
  }
  return null;
}
