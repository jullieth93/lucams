/*
 * Layout compartido para /admin/contenido/* — header con tabs.
 *
 * 2 tabs: "Bloques de contenido" (textos largos versionados) y
 * "Configuración del sitio" (settings atómicos: email, horario, etc).
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Settings } from "lucide-react";
import { ContenidoTabs } from "./contenido-tabs";

export default function ContenidoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/dashboard"
              className="text-slate-500 hover:text-slate-700"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <p className="text-xs tracking-wider text-slate-500 uppercase">Admin</p>
              <h1 className="text-lg font-bold text-slate-900">Contenido del sitio</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Textos, mensajes y configuración editables sin tocar código.
              </p>
            </div>
          </div>

          <ContenidoTabs />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

export { FileText, Settings };
