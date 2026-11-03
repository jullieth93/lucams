"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Galería compacta de las piezas de impresión de un ítem (owner 2026-11-03):
 * miniaturas en grilla densa (4–6 columnas) agrupadas por set/unidad cuando
 * aplica, para que 27–54 fichas no invadan el vertical del detalle del pedido.
 * Clic en una miniatura → lightbox con la pieza a tamaño completo, navegación
 * ‹ › (también ← → del teclado) y acciones (abrir/descargar). El borde ámbar
 * marca piezas pendientes de moderación (no imprimir hasta aprobar).
 */

export type ProductionPieceItem = {
  /** Índice global en productionUrls (para keys estables). */
  index: number;
  label: string;
  /** Signed URL del PNG de producción (bucket privado, firma 1 h). */
  url: string;
  downloadName: string;
  approved: boolean;
};

export type ProductionPieceGroupView = {
  key: string;
  title: string;
  note?: string;
  /** Índices (globales) de las piezas del grupo, en orden. */
  pieceIndexes: number[];
};

const TRANSPARENCY_GRID = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
  backgroundSize: "16px 16px",
} as const;

export function ProductionPiecesGallery({
  pieces,
  groups,
}: {
  pieces: ProductionPieceItem[];
  groups: ProductionPieceGroupView[] | null;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const current = openIndex !== null ? pieces[openIndex] : null;

  const step = useCallback(
    (delta: number) => {
      setOpenIndex((prev) =>
        prev === null ? prev : (prev + delta + pieces.length) % pieces.length,
      );
    },
    [pieces.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, step]);

  const thumb = (p: ProductionPieceItem) => {
    const flatIndex = pieces.findIndex((x) => x.index === p.index);
    return (
      <button
        key={p.index}
        type="button"
        onClick={() => setOpenIndex(flatIndex)}
        aria-label={`Ver ${p.label} en grande`}
        className={`group overflow-hidden rounded-md border text-left transition-shadow hover:shadow-md ${
          p.approved ? "border-brand-purple/15" : "border-amber-300"
        }`}
      >
        <span className="relative block h-24 w-full" style={TRANSPARENCY_GRID}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL temporal; el optimizer no reenvía cookies al handler */}
          <img src={p.url} alt={p.label} loading="lazy" className="h-full w-full object-contain" />
        </span>
        <span className="text-brand-purple-dark block truncate bg-white px-1.5 py-1 text-[10px] font-semibold">
          {p.label}
          {!p.approved && <span className="ml-1 text-amber-700">⚠️</span>}
        </span>
      </button>
    );
  };

  const byIndex = new Map(pieces.map((p) => [p.index, p]));

  return (
    <div>
      {groups
        ? groups.map((g) => (
            <section key={g.key} className="mb-3 last:mb-0">
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                <h4 className="text-brand-purple-dark text-xs font-bold">{g.title}</h4>
                <span className="text-brand-muted text-[11px]">
                  {g.pieceIndexes.length} archivo(s)
                  {g.note ? ` · ${g.note}` : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {g.pieceIndexes.map((i) => {
                  const p = byIndex.get(i);
                  return p ? thumb(p) : null;
                })}
              </div>
            </section>
          ))
        : null}
      {!groups && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {pieces.map(thumb)}
        </div>
      )}

      <Dialog open={openIndex !== null} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{current?.label ?? "Pieza de impresión"}</DialogTitle>
          <DialogDescription className="sr-only">
            Vista a tamaño completo de la pieza de impresión seleccionada.
          </DialogDescription>
          {current && (
            <div>
              <div
                className="relative flex max-h-[70vh] items-center justify-center overflow-hidden rounded-lg"
                style={TRANSPARENCY_GRID}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL temporal del handler */}
                <img
                  src={current.url}
                  alt={current.label}
                  className="max-h-[70vh] w-auto max-w-full object-contain"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-brand-purple-dark text-xs font-bold">
                  {current.label}
                  {!current.approved && (
                    <span className="ml-2 text-amber-700">
                      ⚠️ No imprimir hasta aprobar en Moderación
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {pieces.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => step(-1)}
                        aria-label="Pieza anterior"
                        className="border-brand-purple/20 hover:bg-brand-purple/5 rounded-md border p-1.5"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-brand-muted text-xs tabular-nums">
                        {(openIndex ?? 0) + 1} / {pieces.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => step(1)}
                        aria-label="Pieza siguiente"
                        className="border-brand-purple/20 hover:bg-brand-purple/5 rounded-md border p-1.5"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-purple-dark hover:bg-brand-purple/5 border-brand-purple/20 inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Resolución completa
                  </a>
                  <a
                    href={current.url}
                    download={current.downloadName}
                    className="text-brand-purple-dark hover:bg-brand-purple/5 border-brand-purple/20 inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" /> Descargar
                  </a>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
