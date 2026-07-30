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

type Version = {
  id: string;
  version: number;
  title: string | null;
  body: string;
  publishedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
};

export function VersionHistory({
  fieldId,
  versions,
  currentPublishedVersionId,
}: {
  fieldId: string;
  versions: Version[];
  currentPublishedVersionId: string | null;
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
                {!v.publishedAt && !isCurrent && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                    Borrador
                  </span>
                )}
              </div>
              <p className="text-brand-muted mt-1 text-xs">
                Guardada el {formatDateHuman(v.createdAt)}
              </p>
              <p className="text-brand-purple-dark/75 mt-2 line-clamp-2 text-sm">
                {v.title && <b className="text-brand-purple-dark">{v.title}: </b>}
                {v.body.replace(/[#*_`>-]/g, "").slice(0, 200)}
                {v.body.length > 200 && "…"}
              </p>
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
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-brand-purple-dark hover:bg-brand-purple/10"
                  title={`Hacer pública la versión ${v.version}`}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Volver a esta
                </Button>
              </form>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function formatDateHuman(d: Date): string {
  const date = new Date(d);
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
