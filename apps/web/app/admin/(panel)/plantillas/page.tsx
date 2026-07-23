/*
 * Admin — Plantillas del Estudio (Fase 3). Lucy revisa el preview REAL de cada
 * plantilla y la aprueba (se muestra en el Estudio) u oculta. Agrupadas por tipo.
 * Incluye descartadas (soft-deleted) para poder restaurar las buenas con un clic.
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
import type { PersonalizationKind } from "@lucams/db";
import { AdminPage, AdminPageHeader, AdminPageBody } from "@/components/admin-page";
import { TemplateCardActions } from "./template-card-actions";
import { TemplatePreviewButton } from "./template-preview-button";

export const metadata: Metadata = { title: "Plantillas" };

const STATUS_UI: Record<string, { dot: string; label: string }> = {
  aprobada: { dot: "🟢", label: "Aprobada (visible en el Estudio)" },
  oculta: { dot: "🟡", label: "Oculta" },
  descartada: { dot: "⚫", label: "Descartada" },
};

export default async function AdminPlantillasPage() {
  await requireRole(["SUPERADMIN", "MANAGER"]);
  const templates = await listTemplatesForAdmin();

  const approved = templates.filter((t) => templateStatus(t) === "aprobada").length;
  const total = templates.length;

  // Agrupar por kind conservando el orden.
  const byKind = new Map<PersonalizationKind, AdminTemplate[]>();
  for (const t of templates) {
    const arr = byKind.get(t.kind) ?? [];
    arr.push(t);
    byKind.set(t.kind, arr);
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Shapes className="h-5 w-5" />}
        title="Plantillas del Estudio"
        subtitle={`${approved} aprobadas de ${total}. Aprueba las que te gusten para que aparezcan en el Estudio; oculta las demás.`}
      />
      <AdminPageBody>
        <p className="text-brand-muted mb-4 text-xs">
          Cada imagen es el preview REAL de la plantilla (cómo se ve el imán). 🟢 aprobada · 🟡
          oculta · ⚫ descartada. Aprobar una descartada la restaura.
        </p>

        {[...byKind.entries()].map(([kind, list]) => (
          <section key={kind} className="mb-8">
            <h2 className="text-brand-purple-dark border-brand-purple/10 mb-3 border-b pb-1.5 text-sm font-bold">
              {KIND_LABEL[kind] ?? kind}{" "}
              <span className="text-brand-muted font-normal">
                ({list.filter((t) => templateStatus(t) === "aprobada").length}/{list.length})
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {list.map((t) => {
                const st = templateStatus(t);
                return (
                  <div
                    key={t.id}
                    className="border-brand-purple/10 flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm"
                  >
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
                      <p
                        className="text-brand-purple-dark truncate text-xs font-semibold"
                        title={t.name}
                      >
                        {t.name}
                      </p>
                      <p className="text-brand-muted text-[11px]" title={STATUS_UI[st].label}>
                        {STATUS_UI[st].dot} {st}
                      </p>
                      <div className="mt-auto flex flex-col gap-1.5">
                        <TemplatePreviewButton template={t} />
                        <TemplateCardActions id={t.id} status={st} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </AdminPageBody>
    </AdminPage>
  );
}
