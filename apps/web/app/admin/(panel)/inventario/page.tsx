/*
 * /admin/inventario — vista cross-product del stock por variante.
 *
 * Lucy 2026-06-26 — Opción C Sprint 1: el flujo "ver qué se está agotando
 * HOY" antes era abrir 9 productos uno por uno. Dashboard mentía con `0`
 * hardcoded. Esta página resuelve eso con una vista agregada filtrable.
 *
 * Features:
 *  - KPI strip header: 🔴 agotados / 🟡 bajos / 🟢 ok / total unidades.
 *  - Filtro por estado (Todos / Agotados / Stock bajo / OK).
 *  - Filtro por categoría.
 *  - Búsqueda libre (nombre producto / código / nombre opción).
 *  - Orden configurable (stock asc/desc, producto A-Z, recientes).
 *  - Tabla con: producto · opción · código · stock + chip semáforo · acciones.
 *  - "Editar stock" inline por fila → CompactStockEditor (1 fila densa,
 *    icon-only Save). Comparte server action setVariantStockAction con
 *    el editor full del panel del producto (audit completo InventoryLog).
 *  - Link "Editar producto →" para casos donde el ajuste va más allá del stock.
 *
 * Pagination: server-side con searchParams (?page=N). PageSize=50 default.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, ExternalLink } from "lucide-react";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminEmpty,
} from "@/components/admin-page";
import { getCurrentAdmin } from "@/lib/auth";
import {
  listVariantsAcrossProducts,
  listCategoriesForInventoryFilter,
  type InventoryStatusFilter,
  type InventorySortKey,
} from "@/features/products/inventory-service";
import {
  getStockEmoji,
  getStockLabel,
} from "@/features/products/stock-constants";
import { CompactStockEditor } from "@/components/admin/compact-stock-editor";

export const metadata: Metadata = {
  title: "Inventario · Admin",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const VALID_STATUS: InventoryStatusFilter[] = ["all", "out", "low", "ok"];
const VALID_SORT: InventorySortKey[] = ["stock-asc", "stock-desc", "product-asc", "recent"];

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const statusRaw = typeof sp.estado === "string" ? sp.estado : "all";
  const status: InventoryStatusFilter = VALID_STATUS.includes(statusRaw as InventoryStatusFilter)
    ? (statusRaw as InventoryStatusFilter)
    : "all";
  const categoryId = typeof sp.categoria === "string" ? sp.categoria : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  // Default "product-asc": agrupa las opciones de cada producto juntas (modelo
  // mental de Lucy: piensa en productos, no en SKUs sueltos). Para triage de
  // stock bajo están el filtro 🟡/🔴 + el sort "Stock más bajo primero".
  const sortRaw = typeof sp.orden === "string" ? sp.orden : "product-asc";
  const sort: InventorySortKey = VALID_SORT.includes(sortRaw as InventorySortKey)
    ? (sortRaw as InventorySortKey)
    : "product-asc";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [data, categories] = await Promise.all([
    listVariantsAcrossProducts({ status, categoryId, q, sort, page }),
    listCategoriesForInventoryFilter(),
  ]);

  // Metadata de agrupación visual por producto: cada fila sabe si es la PRIMERA
  // de su producto (muestra nombre+categoría) o una continuación (opción del
  // mismo producto, con sangría). El tono de fondo alterna por grupo para que
  // las opciones de un producto se lean como un bloque conectado.
  let groupCounter = -1;
  let prevProductId = "";
  const grouped = data.rows.map((row) => {
    const isFirstOfProduct = row.productId !== prevProductId;
    if (isFirstOfProduct) groupCounter += 1;
    prevProductId = row.productId;
    // Cuántas opciones tiene este producto en la página (para el "N opciones").
    const variantsInGroup = data.rows.filter((r) => r.productId === row.productId).length;
    return { row, isFirstOfProduct, tinted: groupCounter % 2 === 1, variantsInGroup };
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Boxes className="h-5 w-5" />}
        title="Inventario"
        subtitle={`${data.summary.totalVariants.toLocaleString("es-CO")} opciones activas · ${data.summary.totalUnits.toLocaleString("es-CO")} unidades en total`}
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Inventario" },
        ]}
      />

      <AdminPageBody>
        {/* KPI strip — semáforo del catálogo de un golpe */}
        <KpiStrip
          out={data.summary.outCount}
          low={data.summary.lowCount}
          ok={data.summary.okCount}
        />

        {/* Filtros */}
        <FiltersBar
          status={status}
          categoryId={categoryId}
          q={q}
          sort={sort}
          categories={categories}
        />

        {/* Tabla cross-product */}
        {data.rows.length === 0 ? (
          <AdminEmpty
            icon={<Boxes className="h-5 w-5" />}
            title={
              status === "out"
                ? "Nada agotado por aquí ✨"
                : status === "low"
                  ? "Sin stock bajo — todo en orden"
                  : q
                    ? "No encontramos opciones que coincidan"
                    : "Aún no hay opciones activas"
            }
            description={
              q || categoryId
                ? "Quita los filtros para ver todo el inventario."
                : "Crea un producto en la sección Productos y se mostrará acá."
            }
          />
        ) : (
          <AdminTable minWidth={800}>
            {/*
             * Hotfix P0-1: removido el wrapper AdminCard que duplicaba
             * border + rounded-xl + shadow (AdminTable ya es una card).
             * Hotfix P0-2: removidas clases redundantes del <tr> que
             * sobrescribían el text-brand-purple-dark/70 global del head.
             * Hotfix P0-14: minWidth=800 da más respiro a 6 columnas.
             */}
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Producto</th>
                <th className="px-4 py-3 text-left font-semibold">Opción</th>
                <th className="px-4 py-3 text-left font-semibold">Código</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Stock</th>
                <th className="px-4 py-3 text-right font-semibold">Ajustar</th>
              </tr>
            </AdminTableHead>
              <AdminTableBody>
                {grouped.map(({ row, isFirstOfProduct, tinted, variantsInGroup }) => (
                  <AdminTableRow
                    key={row.variantId}
                    className={
                      // Fondo de grupo + línea superior al empezar un producto nuevo,
                      // para que las opciones de un mismo producto se lean juntas.
                      (tinted ? "bg-brand-purple/[0.025] " : "") +
                      (isFirstOfProduct ? "border-brand-purple/15 border-t-2" : "")
                    }
                  >
                    <td className="px-4 py-3 align-top">
                      {isFirstOfProduct ? (
                        <>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link
                              href={`/admin/productos/${row.productId}`}
                              className="text-brand-purple-dark hover:text-brand-purple inline-flex items-center gap-1 text-sm font-semibold"
                            >
                              {row.productName}
                              <ExternalLink className="h-3 w-3 opacity-50" aria-hidden />
                            </Link>
                            {!row.isProductActive && (
                              <span
                                className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900"
                                title="Producto pausado — no visible en la tienda"
                              >
                                Pausado
                              </span>
                            )}
                          </div>
                          <p className="text-brand-purple-dark/55 mt-0.5 text-xs">
                            {row.categoryName}
                            {variantsInGroup > 1 && (
                              <span className="text-brand-purple-dark/45">
                                {" · "}
                                {variantsInGroup} opciones
                              </span>
                            )}
                          </p>
                        </>
                      ) : (
                        // Continuación: misma familia. Sangría + guion para conectar
                        // visualmente con el producto de arriba (no repetimos el nombre).
                        <span
                          className="text-brand-purple-dark/35 pl-3 text-xs"
                          aria-label={`Otra opción de ${row.productName}`}
                        >
                          ↳ misma familia
                        </span>
                      )}
                    </td>
                    <td className="text-brand-purple-dark/80 px-4 py-3 align-top text-sm">
                      {row.variantName === "Default" ? "Única" : row.variantName}
                    </td>
                    <td className="text-brand-purple-dark/65 px-4 py-3 align-top font-mono text-xs">
                      {row.variantSku}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusChip status={row.status} stock={row.stock} />
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 text-right align-top text-sm font-bold tabular-nums">
                      {row.stock.toLocaleString("es-CO")}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <InlineStockEditor
                        variantId={row.variantId}
                        productId={row.productId}
                        currentStock={row.stock}
                      />
                    </td>
                  </AdminTableRow>
                ))}
              </AdminTableBody>
            </AdminTable>
          )}

        {/* Paginación */}
        {data.totalPages > 1 && (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            params={{ estado: status, categoria: categoryId, q, orden: sort }}
          />
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

function KpiStrip({ out, low, ok }: { out: number; low: number; ok: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiTile
        emoji="🔴"
        label="Agotadas"
        value={out}
        tone={out > 0 ? "danger" : "muted"}
        href={out > 0 ? "/admin/inventario?estado=out" : undefined}
        hint="Opciones con 0 unidades — no se pueden vender"
      />
      <KpiTile
        emoji="🟡"
        label="Stock bajo"
        value={low}
        tone={low > 0 ? "warning" : "muted"}
        href={low > 0 ? "/admin/inventario?estado=low" : undefined}
        hint="5 unidades o menos — planea reponer"
      />
      <KpiTile
        emoji="🟢"
        label="Con stock OK"
        value={ok}
        tone="ok"
        href="/admin/inventario?estado=ok"
        hint="Más de 5 unidades — todo en orden"
      />
    </div>
  );
}

function KpiTile({
  emoji,
  label,
  value,
  hint,
  tone,
  href,
}: {
  emoji: string;
  label: string;
  value: number;
  hint: string;
  tone: "danger" | "warning" | "ok" | "muted";
  href?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50"
        : tone === "ok"
          ? "border-emerald-200 bg-emerald-50"
          : "border-brand-purple/15 bg-white";

  const content = (
    <div
      className={`rounded-xl border p-5 transition-colors ${toneClass} ${href ? "hover:brightness-95" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-brand-purple-dark/75 text-xs font-semibold">
            <span aria-hidden className="mr-1">
              {emoji}
            </span>
            {label}
          </span>
          <p className="text-brand-purple-dark/55 mt-1 text-[11px] leading-snug">{hint}</p>
        </div>
        <span className="text-brand-purple-dark shrink-0 text-3xl font-bold tabular-nums leading-none">
          {value.toLocaleString("es-CO")}
        </span>
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function StatusChip({
  status,
  stock,
}: {
  status: "out" | "low" | "ok";
  stock: number;
}) {
  const cls =
    status === "out"
      ? "bg-red-50 text-red-800 border border-red-200"
      : status === "low"
        ? "bg-amber-50 text-amber-900 border border-amber-200"
        : "bg-emerald-50 text-emerald-800 border border-emerald-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      <span aria-hidden>{getStockEmoji(status)}</span>
      <span>{getStockLabel(status, stock)}</span>
    </span>
  );
}

function InlineStockEditor({
  variantId,
  productId,
  currentStock,
}: {
  variantId: string;
  productId: string;
  currentStock: number;
}) {
  // CompactStockEditor: 1 fila densa (input + icon-only Save), pensado para
  // celda de tabla. Reusa setVariantStockAction (audit InventoryLog + audit
  // log admin). Botón disabled si no hay cambios.
  return (
    <CompactStockEditor
      variantId={variantId}
      productId={productId}
      currentStock={currentStock}
    />
  );
}

function FiltersBar({
  status,
  categoryId,
  q,
  sort,
  categories,
}: {
  status: InventoryStatusFilter;
  categoryId: string | undefined;
  q: string | undefined;
  sort: InventorySortKey;
  categories: Array<{ id: string; name: string }>;
}) {
  return (
    <form
      method="GET"
      action="/admin/inventario"
      className="border-brand-purple/15 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <label className="space-y-1">
        <span className="text-brand-purple-dark/70 block text-xs font-semibold">
          Estado del stock
        </span>
        <select
          name="estado"
          defaultValue={status}
          className="border-brand-purple/25 text-brand-purple-dark h-10 w-full rounded-lg border bg-white px-3 text-sm"
        >
          <option value="all">Todos</option>
          <option value="out">🔴 Solo agotadas</option>
          <option value="low">🟡 Solo stock bajo</option>
          <option value="ok">🟢 Solo con stock</option>
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-brand-purple-dark/70 block text-xs font-semibold">Categoría</span>
        <select
          name="categoria"
          defaultValue={categoryId ?? ""}
          className="border-brand-purple/25 text-brand-purple-dark h-10 w-full rounded-lg border bg-white px-3 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 lg:col-span-2">
        <span className="text-brand-purple-dark/70 block text-xs font-semibold">Buscar</span>
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Por nombre, código o opción…"
          className="border-brand-purple/25 text-brand-purple-dark placeholder:text-brand-purple-dark/40 h-10 w-full rounded-lg border bg-white px-3 text-sm"
        />
      </label>

      <label className="space-y-1">
        <span className="text-brand-purple-dark/70 block text-xs font-semibold">Ordenar por</span>
        <select
          name="orden"
          defaultValue={sort}
          className="border-brand-purple/25 text-brand-purple-dark h-10 w-full rounded-lg border bg-white px-3 text-sm"
        >
          <option value="product-asc">Por producto (agrupado)</option>
          <option value="stock-asc">Stock más bajo primero</option>
          <option value="stock-desc">Stock más alto primero</option>
          <option value="recent">Editados recientemente</option>
        </select>
      </label>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
        <button
          type="submit"
          className="bg-brand-purple hover:bg-brand-purple-dark inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white"
        >
          Aplicar filtros
        </button>
        {(status !== "all" || categoryId || q) && (
          <Link
            href="/admin/inventario"
            className="text-brand-purple-dark/65 hover:text-brand-purple-dark inline-flex h-10 items-center px-3 text-sm font-medium"
          >
            Limpiar
          </Link>
        )}
      </div>
    </form>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  params,
}: {
  page: number;
  totalPages: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const buildHref = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/admin/inventario${qs ? "?" + qs : ""}`;
  };

  return (
    <nav
      className="flex items-center justify-between gap-3 text-sm"
      aria-label="Paginación"
    >
      <p className="text-brand-purple-dark/65">
        Página {page} de {totalPages} · {total.toLocaleString("es-CO")} opciones
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={buildHref(page - 1)}
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-9 items-center rounded-lg border bg-white px-3 text-sm font-semibold"
          >
            ← Anterior
          </Link>
        )}
        {page < totalPages && (
          <Link
            href={buildHref(page + 1)}
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-9 items-center rounded-lg border bg-white px-3 text-sm font-semibold"
          >
            Siguiente →
          </Link>
        )}
      </div>
    </nav>
  );
}
