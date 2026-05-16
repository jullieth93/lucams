/*
 * Layout root del panel admin.
 *
 * PLAN_CATALOG_V2 8.1 — sidebar permanente con 5 grupos.
 * El gate de sesión vive en proxy.ts (`/admin/*` excepto `/admin/login`).
 * Acá NO hacemos guard porque /admin/login también pasa por este layout
 * (sin sidebar — el shell se monta en cada page con getCurrentAdmin).
 *
 * Identidad: utilitaria sobria (no kawaii cliente). Branding contenido
 * en el sidebar para que las páginas mantengan layout simple slate.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Panel admin · Lucams_shop",
    template: "%s · Admin Lucams",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</div>;
}
