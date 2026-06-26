/*
 * <ProductStockPanel> — Vista de inventario del producto en el admin.
 *
 * Lucy 2026-06-26 — ADM-P0-004: el form de producto no muestra stock
 * (vive en ProductVariant.stock por arquitectura). Sin este panel, Lucy
 * tenía que ir a /admin/productos/[id]/variants para algo tan básico
 * como cambiar el stock de un producto.
 *
 * Modos:
 *   - 1 variant "Default": editor inline directo (input + botón Guardar).
 *     Caso típico de productos simples sin variaciones.
 *   - N variants (Set 6, Set 9, Set 12, etc.): tabla compacta con stock
 *     por variant + botón inline para editar cada uno + link grande
 *     "Editar todas las variantes →" para ir a la página completa.
 *
 * Estados visuales (constants en stock-constants.ts):
 *   🟢 OK    (> 5 unidades)
 *   🟡 Bajo  (1-5 unidades)
 *   🔴 Agotado (0 unidades)
 *
 * Server component que delega a un client child para los inputs editables.
 */

import Link from "next/link";
import { ArrowRight, Layers, PackageOpen } from "lucide-react";
import {
  getStockEmoji,
  getStockLabel,
  getStockStatus,
  summarizeStock,
} from "@/features/products/stock-constants";
import { SimpleVariantStockEditor } from "./product-stock-editor";

export type StockPanelVariant = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  isActive: boolean;
  deletedAt: Date | null;
  attributes?: unknown;
};

export function ProductStockPanel({
  productId,
  variants,
}: {
  productId: string;
  variants: StockPanelVariant[];
}) {
  const active = variants.filter((v) => !v.deletedAt);
  const summary = summarizeStock(active);

  // Caso: producto sin variants activas (extremo, no debería pasar — el service
  // garantiza al menos una variant Default al crear producto).
  if (active.length === 0) {
    return (
      <section
        className="border-brand-purple/15 rounded-xl border bg-amber-50 p-5"
        aria-labelledby="stock-panel-title"
      >
        <h2
          id="stock-panel-title"
          className="text-brand-purple-dark flex items-center gap-2 text-base font-semibold"
        >
          <PackageOpen className="h-5 w-5" />
          Inventario
        </h2>
        <p className="text-brand-purple-dark/75 mt-2 text-sm">
          Este producto no tiene variantes activas. Creá al menos una desde{" "}
          <Link
            href={`/admin/productos/${productId}/variants`}
            className="text-brand-purple-dark font-semibold underline"
          >
            Variantes
          </Link>
          .
        </p>
      </section>
    );
  }

  // Caso simple: 1 variant Default → editor inline directo.
  const isSimpleProduct = active.length === 1 && isDefaultVariant(active[0]);

  return (
    <section
      className="border-brand-purple/15 space-y-4 rounded-xl border bg-white p-5 shadow-sm"
      aria-labelledby="stock-panel-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="stock-panel-title"
            className="text-brand-purple-dark flex items-center gap-2 text-base font-semibold"
          >
            <PackageOpen className="h-5 w-5" />
            Inventario
          </h2>
          <p className="text-brand-purple-dark/65 mt-0.5 text-xs">
            {isSimpleProduct
              ? "Producto sin variaciones — un solo stock."
              : `${summary.variantsCount} variantes · ${summary.totalUnits.toLocaleString("es-CO")} unidades en total`}
          </p>
        </div>
        <StockOverallBadge summary={summary} />
      </header>

      {/* Alertas globales si hay agotadas o bajas */}
      {summary.outCount > 0 && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          🔴 <strong>{summary.outCount}</strong> variante{summary.outCount === 1 ? "" : "s"}{" "}
          agotada{summary.outCount === 1 ? "" : "s"}. No se puede vender hasta que repongas.
        </p>
      )}
      {summary.lowCount > 0 && summary.outCount === 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          🟡 <strong>{summary.lowCount}</strong> variante{summary.lowCount === 1 ? "" : "s"} con
          stock bajo. Considera producir un nuevo lote pronto.
        </p>
      )}

      {/* Modo "simple": 1 variant Default → editor inline */}
      {isSimpleProduct ? (
        <SimpleVariantStockEditor
          variantId={active[0].id}
          productId={productId}
          currentStock={active[0].stock}
        />
      ) : (
        /* Modo "múltiple": tabla compacta + link a /variants */
        <>
          <ul className="border-brand-purple/10 divide-brand-purple/10 divide-y overflow-hidden rounded-lg border">
            {active.map((v) => {
              const status = getStockStatus(v.stock);
              const label = formatVariantLabel(v);
              return (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 hover:bg-brand-purple/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-brand-purple-dark text-sm font-semibold">{label}</p>
                    <p className="text-brand-purple-dark/55 mt-0.5 font-mono text-[11px]">
                      {v.sku}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold " +
                        statusClassNames(status)
                      }
                    >
                      <span aria-hidden>{getStockEmoji(status)}</span>
                      <span>{getStockLabel(status, v.stock)}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <Link
            href={`/admin/productos/${productId}/variants`}
            className="text-brand-purple bg-brand-purple/10 hover:bg-brand-purple/15 focus-visible:ring-brand-purple/40 inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <Layers className="h-4 w-4" />
            Editar todas las variantes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

function StockOverallBadge({
  summary,
}: {
  summary: ReturnType<typeof summarizeStock>;
}) {
  const cls = statusClassNames(summary.worstStatus);
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold " +
        cls
      }
      aria-label={`Estado general del inventario: ${getStockLabel(summary.worstStatus, summary.totalUnits)}`}
    >
      <span aria-hidden>{getStockEmoji(summary.worstStatus)}</span>
      <span className="tabular-nums">
        {summary.totalUnits.toLocaleString("es-CO")} {summary.totalUnits === 1 ? "unidad" : "unidades"}
      </span>
    </span>
  );
}

function statusClassNames(status: "out" | "low" | "ok"): string {
  switch (status) {
    case "out":
      return "bg-red-50 text-red-800 border border-red-200";
    case "low":
      return "bg-amber-50 text-amber-900 border border-amber-200";
    case "ok":
      return "bg-emerald-50 text-emerald-800 border border-emerald-200";
  }
}

function isDefaultVariant(v: StockPanelVariant): boolean {
  return v.name.trim().toLowerCase() === "default";
}

/**
 * Render del nombre de variant amable para Lucy.
 *  - Si name === "Default" → "Variante única"
 *  - Sino → nombre tal cual
 */
function formatVariantLabel(v: StockPanelVariant): string {
  if (isDefaultVariant(v)) return "Variante única";
  return v.name;
}
