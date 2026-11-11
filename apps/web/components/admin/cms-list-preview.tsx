/*
 * <CmsListPreview> — vista HUMANA de un campo LISTA del CMS (owner 2026-11-11):
 * tarjetas con miniatura del subcampo IMAGE + una línea por subcampo con su
 * etiqueta del schema («Título», «Enlace», «Activo: Sí/No»), nunca el JSON
 * crudo del body. Compartida por el historial de versiones del campo
 * (campos/[id]/version-history.tsx) y la tarjeta del campo en el editor de
 * página (paginas/[slug]/page.tsx). `maxItems` recorta la lista con
 * «+N más» (la tarjeta de la página es un preview compacto).
 *
 * Server-safe (sin hooks ni eventos) — la renderizan páginas RSC.
 */

import type { CmsListSubfield } from "@/features/cms/service";

export function CmsListPreview({
  body,
  listSchema,
  mediaById = {},
  maxItems,
}: {
  /** Body JSON del campo (array de filas). */
  body: string;
  listSchema: CmsListSubfield[];
  /** Media id → {url, alt} para las miniaturas de los subcampos IMAGE. */
  mediaById?: Record<string, { url: string; alt: string }>;
  /** Tope de filas mostradas (undefined = todas). */
  maxItems?: number;
}) {
  let items: unknown;
  try {
    items = JSON.parse(body);
  } catch {
    items = null;
  }
  if (!Array.isArray(items)) {
    return <p className="text-brand-muted text-xs italic">Contenido no legible como lista.</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-brand-muted text-xs italic">Lista vacía (no se muestra en el sitio).</p>
    );
  }
  const imageField = listSchema.find((s) => s.type === "IMAGE");
  const shown = maxItems !== undefined ? items.slice(0, maxItems) : items;
  const hidden = items.length - shown.length;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {shown.map((raw, i) => {
          const item =
            typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
          const media = imageField ? mediaById[String(item[imageField.name] ?? "")] : undefined;
          return (
            <li
              key={i}
              className="border-brand-purple/10 flex items-center gap-3 rounded-lg border bg-white p-2"
            >
              {imageField &&
                (media ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura admin; la URL pública ya viene resuelta
                  <img
                    src={media.url}
                    alt={media.alt}
                    className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="bg-brand-cream text-brand-muted flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-[9px]">
                    sin imagen
                  </span>
                ))}
              <div className="min-w-0 flex-1 space-y-0.5">
                {listSchema
                  .filter((s) => s.type !== "IMAGE")
                  .map((s) => {
                    const value = String(item[s.name] ?? "").trim();
                    const display =
                      s.type === "BOOLEAN" ? (value === "false" ? "No" : "Sí") : value || "—";
                    return (
                      <p key={s.name} className="text-brand-purple-dark/85 truncate text-xs">
                        <span className="text-brand-muted">{s.label}:</span>{" "}
                        <span className={s.type === "URL" ? "break-all" : undefined}>
                          {display}
                        </span>
                      </p>
                    );
                  })}
              </div>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && <p className="text-brand-muted text-xs italic">y {hidden} más…</p>}
    </div>
  );
}
