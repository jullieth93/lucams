"use client";

/*
 * <BlocksBrowser> — presentación reformulada de la lista de bloques CMS
 * (Lucy 2026-07-29: "el Admin debería reformularse").
 *
 * Dos cambios "menos es más" para una administradora NO técnica:
 *  1. Buscador: escribe lo que ves en tu sitio ("entrega", "whatsapp",
 *     "cariño") y la lista se filtra sola — no hay que saberse la key.
 *  2. Agrupación por LUGAR del sitio (no por categoría técnica): cada
 *     sección responde "¿dónde aparece este texto?" — Inicio · Hero,
 *     Preguntas frecuentes, Checkout, Pie de página…
 * La key técnica queda visible pero pequeña (sirve solo para soporte).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import {
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminBadge,
  AdminEmpty,
} from "@/components/admin-page";

export type BlockRow = {
  id: string;
  key: string;
  title: string | null;
  description: string | null;
  isPublished: boolean;
  version: number | null;
};

// Orden de aparición en el sitio — la primera coincidencia de prefijo gana.
const SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ["home.hero.", "Inicio · Portada (hero)"],
  ["home.howitworks.", "Inicio · Así de fácil (3 pasos)"],
  ["home.categories.", "Inicio · Categorías"],
  ["home.featured.", "Inicio · Destacados"],
  ["home.reviews.", "Inicio · Reseñas"],
  ["home.cta.", "Inicio · Llamado final"],
  ["faq.", "Preguntas frecuentes (/ayuda)"],
  ["support.contacto.", "Contacto"],
  ["support.help.", "Ayuda · Encabezados"],
  ["checkout.", "Checkout (envío y pago)"],
  ["seo.page.", "SEO · Títulos en Google"],
  ["pdp.", "Página de producto"],
  ["footer.", "Pie de página"],
  ["account.", "Mi cuenta"],
  ["email.", "Correos automáticos"],
  ["legal.", "Textos legales"],
  ["maintenance.", "Mantenimiento"],
  ["error.", "Errores (404 / 500)"],
  ["cart.", "Carrito"],
  ["search.", "Buscador"],
  ["status.", "Estado del sitio"],
];

function sectionOf(key: string): string {
  for (const [prefix, label] of SECTIONS) {
    if (key.startsWith(prefix)) return label;
  }
  return "Otros textos";
}

export function BlocksBrowser({ blocks }: { blocks: BlockRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter((b) =>
      [b.key, b.title ?? "", b.description ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [blocks, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, BlockRow[]>();
    for (const b of filtered) {
      const section = sectionOf(b.key);
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(b);
    }
    // Orden de secciones = orden declarado en SECTIONS; "Otros textos" al final.
    const order = [...SECTIONS.map(([, label]) => label), "Otros textos"];
    return [...map.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="text-brand-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca el texto como lo ves en tu sitio…"
          aria-label="Buscar bloque por texto o identificador"
          className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-lg border bg-white py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
        />
      </div>

      {filtered.length === 0 ? (
        <AdminEmpty
          icon={<Search className="h-5 w-5" />}
          title={`Nada coincide con "${query}"`}
          description="Prueba con otra palabra tal como aparece en el sitio (ej. entrega, WhatsApp, cariño)."
        />
      ) : (
        grouped.map(([section, rows]) => (
          <section key={section}>
            <h2 className="text-brand-purple-dark mb-2.5 flex items-center gap-2 text-sm font-bold">
              <span>{section}</span>
              <span className="text-brand-muted text-xs font-normal">({rows.length})</span>
            </h2>
            <AdminTable>
              <AdminTableHead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Texto</th>
                  <th className="px-4 py-3 text-center font-semibold">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {rows.map((b) => (
                  <AdminTableRow key={b.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/contenido/bloques/${b.id}`}
                        className="text-brand-purple-dark hover:text-brand-purple font-medium"
                      >
                        {b.title ?? b.key}
                      </Link>
                      {b.description && (
                        <p className="text-brand-muted line-clamp-1 text-xs">{b.description}</p>
                      )}
                      <p className="text-brand-muted/70 font-mono text-[10px]">{b.key}</p>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {b.isPublished ? (
                        <AdminBadge tone="emerald">🟢 Publicado</AdminBadge>
                      ) : (
                        <AdminBadge tone="amber">🟡 Borrador</AdminBadge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/contenido/bloques/${b.id}`}
                        className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-xs font-medium"
                      >
                        Editar
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          </section>
        ))
      )}
    </div>
  );
}
