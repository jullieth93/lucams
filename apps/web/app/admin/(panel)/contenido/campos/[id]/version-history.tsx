/*
 * Historial de versiones de un CmsField (CMS v2) — adaptado del viejo
 * version-history.tsx de bloques (brand 2026-05-20).
 *
 * Cada guardado crea una versión. La administradora ve fecha humana +
 * inicio del texto + botón "Volver a esta" (publica esa versión vía
 * publishCmsFieldAction y vuelve al editor del campo).
 */

import { History, RotateCcw } from "lucide-react";
import { publishCmsFieldAction } from "@/app/admin/(panel)/contenido/actions";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { formatDateTimeCO } from "@/lib/datetime";
import type { CmsListSubfield } from "@/features/cms/service";

type Version = {
  id: string;
  version: number;
  title: string | null;
  body: string;
  publishedAt: Date | null;
  /** Roadmap C3: publicación programada (solo en borradores). */
  publishAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
};

export function VersionHistory({
  fieldId,
  versions,
  currentPublishedVersionId,
  listSchema = null,
  mediaById = {},
}: {
  fieldId: string;
  versions: Version[];
  currentPublishedVersionId: string | null;
  /**
   * 2026-11-11 (owner) — campos LISTA (ej. home.banners): el historial muestra
   * las filas en VISUAL (miniatura + título + enlace + activo), no el JSON
   * crudo — lo lee también quien no es técnico.
   */
  listSchema?: CmsListSubfield[] | null;
  /** Media id → {url, alt} para las miniaturas de los subcampos IMAGE. */
  mediaById?: Record<string, { url: string; alt: string }>;
}) {
  if (versions.length === 0) {
    return (
      <div className="border-brand-purple/15 px-6 py-10 text-center">
        <History className="text-brand-muted mx-auto h-6 w-6" />
        <p className="text-brand-muted mt-2 text-sm">Sin versiones aún.</p>
      </div>
    );
  }

  return (
    <ol className="divide-brand-purple/10 divide-y">
      {versions.map((v) => {
        const isCurrent = v.id === currentPublishedVersionId;
        return (
          <li
            key={v.id}
            className={
              "flex items-start justify-between gap-4 p-4 " +
              (isCurrent ? "bg-emerald-50/50" : "hover:bg-brand-purple/[0.03]")
            }
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-brand-purple-dark text-sm font-semibold">
                  Versión {v.version}
                </span>
                {isCurrent && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    🟢 PUBLICADA AHORA
                  </span>
                )}
                {v.publishedAt && !isCurrent && (
                  <span className="bg-brand-purple/10 text-brand-purple-dark/70 rounded px-1.5 py-0.5 text-[10px] font-medium">
                    Publicada antes
                  </span>
                )}
                {!v.publishedAt && !isCurrent && !v.publishAt && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                    Borrador
                  </span>
                )}
                {!v.publishedAt && !isCurrent && v.publishAt && (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                    Programada: sale el {formatDateHuman(v.publishAt)} (hora Colombia)
                  </span>
                )}
              </div>
              <p className="text-brand-muted mt-1 text-xs">
                Guardada el {formatDateHuman(v.createdAt)}
              </p>
              {listSchema ? (
                <ListVersionPreview body={v.body} listSchema={listSchema} mediaById={mediaById} />
              ) : (
                <p className="text-brand-purple-dark/75 mt-2 line-clamp-2 text-sm">
                  {v.title && <b className="text-brand-purple-dark">{v.title}: </b>}
                  {v.body.replace(/[#*_`>-]/g, "").slice(0, 200)}
                  {v.body.length > 200 && "…"}
                </p>
              )}
            </div>
            {!isCurrent && (
              <form action={publishCmsFieldAction}>
                <input type="hidden" name="fieldId" value={fieldId} />
                <input type="hidden" name="versionId" value={v.id} />
                <input
                  type="hidden"
                  name="redirectTo"
                  value={`/admin/contenido/campos/${fieldId}`}
                />
                <Hint content={`Hacer pública la versión ${v.version}`}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-brand-purple-dark hover:bg-brand-purple/10"
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Volver a esta
                  </Button>
                </Hint>
              </form>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function formatDateHuman(d: Date): string {
  // Hora de Colombia fija vía helper compartido (lib/datetime — bug LCM-2026-0004).
  return formatDateTimeCO(d);
}

/**
 * Vista HUMANA de una versión de campo LISTA (2026-11-11, owner — antes el
 * historial mostraba el JSON crudo del body, ilegible para quien no es
 * técnico). Cada fila del array se muestra como tarjeta: miniatura del
 * subcampo IMAGE + una línea por subcampo con su ETIQUETA del schema
 * («Título», «Enlace», «Activo»). JSON inválido o vacío → nota en texto plano.
 */
function ListVersionPreview({
  body,
  listSchema,
  mediaById,
}: {
  body: string;
  listSchema: CmsListSubfield[];
  mediaById: Record<string, { url: string; alt: string }>;
}) {
  let items: unknown;
  try {
    items = JSON.parse(body);
  } catch {
    items = null;
  }
  if (!Array.isArray(items)) {
    return <p className="text-brand-muted mt-2 text-xs italic">Contenido no legible como lista.</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-brand-muted mt-2 text-xs italic">
        Lista vacía (no se muestra en el sitio).
      </p>
    );
  }
  const imageField = listSchema.find((s) => s.type === "IMAGE");
  return (
    <ul className="mt-2 space-y-2">
      {items.map((raw, i) => {
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
                // eslint-disable-next-line @next/next/no-img-element -- miniatura del historial admin; la URL pública ya viene resuelta
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
                      <span className={s.type === "URL" ? "break-all" : undefined}>{display}</span>
                    </p>
                  );
                })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
