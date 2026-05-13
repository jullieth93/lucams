"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Settings } from "lucide-react";

const TABS = [
  {
    href: "/admin/contenido/bloques",
    icon: FileText,
    label: "Bloques de contenido",
    description: "Textos largos editables (legales, páginas, mensajes)",
  },
  {
    href: "/admin/contenido/configuracion",
    icon: Settings,
    label: "Configuración del sitio",
    description: "Email, horario, número WhatsApp, redes",
  },
];

export function ContenidoTabs() {
  const pathname = usePathname();
  return (
    <nav className="mt-5 -mb-px flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? "border-b-2 border-slate-900 px-4 py-3 text-sm font-semibold text-slate-900"
                : "border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }
          >
            <span className="inline-flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
