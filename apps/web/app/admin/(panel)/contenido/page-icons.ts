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
  Truck,
  Receipt,
  MoreHorizontal,
};
