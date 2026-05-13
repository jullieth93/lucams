/*
 * Tab "Historial" — lista de versiones del bloque con botón
 * "Volver a esta versión".
 *
 * Cada save crea una versión. El admin ve fecha humana + texto inicial
 * + acción para republicar una versión antigua.
 */

import { History, RotateCcw } from "lucide-react";
import { publishCmsBlockVersionAction } from "@/app/admin/contenido/actions";
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
  blockId,
  versions,
  currentPublishedVersionId,
}: {
  blockId: string;
  versions: Version[];
  currentPublishedVersionId: string | null;
}) {
  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
        <History className="mx-auto h-6 w-6 text-slate-400" />
        <p className="mt-2 text-sm text-slate-500">Sin versiones aún.</p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {versions.map((v) => {
        const isCurrent = v.id === currentPublishedVersionId;
        return (
          <li
            key={v.id}
            className={
              "flex items-start justify-between gap-4 rounded-lg border bg-white p-4 " +
              (isCurrent ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200")
            }
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">Versión {v.version}</span>
                {isCurrent && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    🟢 PUBLICADA AHORA
                  </span>
                )}
                {v.publishedAt && !isCurrent && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    Publicada antes
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Guardada el {formatDateHuman(v.createdAt)}
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                {v.title && <b className="text-slate-900">{v.title}: </b>}
                {v.body.replace(/[#*_`>-]/g, "").slice(0, 200)}
                {v.body.length > 200 && "…"}
              </p>
            </div>
            {!isCurrent && (
              <form action={publishCmsBlockVersionAction}>
                <input type="hidden" name="blockId" value={blockId} />
                <input type="hidden" name="versionId" value={v.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-slate-700 hover:bg-slate-100"
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
