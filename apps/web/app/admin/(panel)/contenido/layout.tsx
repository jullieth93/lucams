/*
 * Layout compartido para /admin/contenido/*.
 *
 * Ya NO tiene tabs internas — el AdminShell sidebar (PLAN_CATALOG_V2 8.1)
 * ya separa "Bloques CMS" y "Configuración" como items independientes.
 * Mantener tabs duplicaba la navegación → confuso.
 */

import type { ReactNode } from "react";

export default function ContenidoLayout({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
