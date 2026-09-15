/*
 * Admin — Plantillas del Estudio (Fase 3). Lucy revisa el preview REAL de cada
 * plantilla y la aprueba (se muestra en el Estudio) u oculta. Incluye descartadas
 * (soft-deleted) para poder restaurar las buenas con un clic.
 *
 * 2026-09-15 — el listado se reagrupó por CATEGORÍA DE CATÁLOGO → producto (antes
 * por kind), y cada tarjeta muestra si la plantilla es visible REALMENTE en el
 * Estudio (studioVisible, misma regla que service.listTemplatesForKind) y a qué
 * producto(s) alimenta. Las globales van en el grupo "Globales (todos los
 * productos)".
 */

import type { Metadata } from "next";
import { Shapes } from "lucide-react";
import { requireRole } from "@/lib/admin-rbac-guard";
import {
  listTemplatesForAdmin,
  templateStatus,
  KIND_LABEL,
  type AdminTemplate,
} from "@/features/personalization/admin-templates";
import { AdminPage, AdminPageHeader, AdminPageBody } from "@/components/admin-page";
import { TemplateCardActions } from "./template-card-actions";
import { TemplatePreviewButton } from "./template-preview-button";

export const metadata: Metadata = { title: "Plantillas" };

const STATUS_UI: Record<string, { dot: string; label: string }> = {
  // "aprobada" ya no se anuncia como "visible": la visibilidad REAL en el
  // Estudio es la marca ✅/🚫 de la tarjeta (studioVisible).
  aprobada: { dot: "🟢", label: "Aprobada" },
  oculta: { dot: "🟡", label: "Oculta" },
  descartada: { dot: "⚫", label: "Descartada" },
};

const GLOBAL_GROUP = "Globales (todos los productos)";

type ProductGroup = { title: string; list: AdminTemplate[] };
type CategoryGroup = { category: string; products: ProductGroup[] };

/** Agrupa categoría → producto conservando el orden relativo del query. */
function groupByCategory(templates: AdminTemplate[]): CategoryGroup[] {
  const byCategory = new Map<string, Map<string, AdminTemplate[]>>();
  for (const t of templates) {
    const category = t.categoryName ?? GLOBAL_GROUP;
    // Las globales no se subdividen por producto: un solo bloque plano.
    const product = t.categoryName ? (t.productName ?? "Sin producto") : "";
    const products = byCategory.get(category) ?? new Map<string, AdminTemplate[]>();
    const arr = products.get(product) ?? [];
    arr.push(t);
    products.set(product, arr);
    byCategory.set(category, products);
  }
  return [...byCategory.entries()]
    .map(([category, products]): CategoryGroup => {
      const subs = [...products.entries()]
        .map(([title, list]) => ({ title, list }))
        .sort((a, b) => a.title.localeCompare(b.title, "es"));
      return { category, products: subs };
    })
    .sort((a, b) => {
      // "Globales" primero (alimentan a todo producto sin específicas), el resto alfabético.
      if (a.category === GLOBAL_GROUP) return -1;
      if (b.category === GLOBAL_GROUP) return 1;
      return a.category.localeCompare(b.category, "es");
    });
}

function TemplateCard({ t }: { t: AdminTemplate }) {
  const st = templateStatus(t);
  return (
    <div className="border-brand-purple/10 flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="bg-brand-cream/50 relative aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.previewUrl}
          alt={`Preview de ${t.name}`}
          className="h-full w-full object-contain p-2"
          loading="lazy"
        />
        {t.isFallback && (
          <span className="bg-brand-purple-dark/70 absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white">
            respaldo
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="text-brand-purple-dark truncate text-xs font-semibold" title={t.name}>
          {t.name}
        </p>
        <p className="text-brand-muted text-[11px]">{KIND_LABEL[t.kind] ?? t.kind}</p>
        <p className="text-brand-muted text-[11px]" title={STATUS_UI[st].label}>
          {STATUS_UI[st].dot} {st}
        </p>
        <p
          className={`text-[11px] font-semibold ${t.studioVisible ? "text-emerald-700" : "text-brand-muted"}`}
          title={
            t.studioVisible
              ? "Cumple la regla de visibilidad del Estudio (editable, activa, aspect y curaduría del producto)"
              : "El Estudio no la lista hoy (oculta, descartada, aspect distinto o tapada por específicas del producto)"
          }
        >
          {t.studioVisible ? "✅ Visible en el Estudio" : "🚫 No visible en el Estudio"}
        </p>
        <p className="text-brand-muted text-[11px] leading-snug">
          {t.studioProductNames.length > 0
            ? `Alimenta: ${t.studioProductNames.join(", ")}`
            : t.productName
              ? `Específica de ${t.productName} — hoy no alimenta su lienzo`
              : "No alimenta ningún producto del Estudio"}
        </p>
        <div className="mt-auto flex flex-col gap-1.5">
          <TemplatePreviewButton template={t} />
          <TemplateCardActions id={t.id} status={st} />
        </div>
      </div>
    </div>
  );
}

export default async function AdminPlantillasPage() {
  await requireRole(["SUPERADMIN", "MANAGER"]);
  const templates = await listTemplatesForAdmin();

  const approved = templates.filter((t) => templateStatus(t) === "aprobada").length;
  const visible = templates.filter((t) => t.studioVisible).length;
  const total = templates.length;
  const groups = groupByCategory(templates);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Shapes className="h-5 w-5" />}
        title="Plantillas del Estudio"
        subtitle={`${visible} visibles en el Estudio · ${approved} aprobadas de ${total}. Aprueba las que te gusten para que aparezcan en el Estudio; oculta las demás.`}
      />
      <AdminPageBody>
        <p className="text-brand-muted mb-4 text-xs">
          Cada imagen es el preview REAL de la plantilla (cómo se ve el imán), agrupada por la
          categoría y el producto del catálogo al que pertenece. 🟢 aprobada · 🟡 oculta · ⚫
          descartada. ✅/🚫 indica si el Estudio la lista HOY en el lienzo (misma regla que usa el
          editor: editable, activa, aspect del producto y específicas del producto por encima de las
          globales). Aprobar una descartada la restaura.
        </p>

        {groups.map((g) => {
          const all = g.products.flatMap((p) => p.list);
          const visibleCount = all.filter((t) => t.studioVisible).length;
          return (
            <section key={g.category} className="mb-8">
              <h2 className="text-brand-purple-dark border-brand-purple/10 mb-3 border-b pb-1.5 text-sm font-bold">
                {g.category}{" "}
                <span className="text-brand-muted font-normal">
                  ({visibleCount}/{all.length} visibles en el Estudio)
                </span>
              </h2>
              {g.products.map((p) => (
                <div key={p.title || "_globals"} className="mb-5 last:mb-0">
                  {p.title && (
                    <h3 className="text-brand-purple-dark/80 mb-2 text-xs font-bold">
                      {p.title}{" "}
                      <span className="text-brand-muted font-normal">
                        ({p.list.filter((t) => t.studioVisible).length}/{p.list.length})
                      </span>
                    </h3>
                  )}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {p.list.map((t) => (
                      <TemplateCard key={t.id} t={t} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </AdminPageBody>
    </AdminPage>
  );
}
