/*
 * Layout root del panel admin.
 *
 * Identidad: utilitaria y sobria — no usa el kawaii de /(auth) cliente.
 * Razón: equipo interno (fulfillment, manager, superadmin) trabaja con
 * este panel a diario, prima legibilidad sobre delight visual.
 *
 * NO incluye guard de sesión acá — el guard vive en `proxy.ts` para
 * cualquier `/admin/*` excepto `/admin/login`. Eso protege contra
 * acceso no autenticado a nivel de request, sin que importe lo que
 * renderee el server component.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Panel admin · Lucams_shop",
    template: "%s · Admin Lucams",
  },
  // Importante: no indexar admin
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      {children}
    </div>
  );
}
