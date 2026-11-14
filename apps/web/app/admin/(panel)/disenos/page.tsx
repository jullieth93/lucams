/*
 * ADR-057 Fase B2 — Admin de "Diseños prediseñados". Lucy sube imágenes de diseño listas por
 * producto; el cliente las aplica a un slot en el editor (sin subir su propia foto).
 *
 * 2026-09-15 — el módulo "Fichas del abecedario" (antes página hermana /admin/fichas)
 * se embebió acá como segundo tab: ambos alimentan el Estudio y comparten guard
 * MANAGER_UP. /admin/fichas quedó como redirect permanente a /admin/disenos?tab=fichas.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { LayoutTemplate, Package, Shapes, ShieldAlert } from "lucide-react";
import { requireCapability } from "@/lib/admin-rbac-guard";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import {
  AdminCard,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
} from "@/components/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { Button } from "@/components/ui/button";
import { listGalleryAdmin, listGalleryTagOptions } from "@/features/personalization/design-gallery";
import { GalleryManager } from "./gallery-manager";
import { FichasSection } from "./fichas-section";
import { DisenosTabs } from "./disenos-tabs";

export const metadata: Metadata = { title: "Diseños prediseñados" };
export const dynamic = "force-dynamic";

export default async function DisenosAdminPage() {
  // B-7 (auditoría 2026-08-24): guard propio — el layout de (panel) NO se
  // re-ejecuta en navegaciones soft, así que un admin degradado a mitad de
  // sesión conservaría acceso de lectura sin este check. Mismo capability que
  // ./actions.ts y ./fichas-actions.ts.
  const session = await requireCapability("production:manage_AssetsCatalog");
  const [items, tagOptions] = await Promise.all([
    listGalleryAdmin(undefined, { includeArchived: true }),
    listGalleryTagOptions(),
  ]);

  const activeCount = items.filter((i) => !i.deletedAt && i.isActive).length;
  const pausedCount = items.filter((i) => !i.deletedAt && !i.isActive).length;
  const archivedCount = items.filter((i) => Boolean(i.deletedAt)).length;
  const tagsWithActiveDesigns = new Set(
    items.filter((i) => !i.deletedAt && i.isActive).map((i) => i.tag),
  ).size;

  const canAccessPlantillas = canAccessAdminPath(session.admin.role, "/admin/plantillas");
  const canAccessModeracion = canAccessAdminPath(session.admin.role, "/admin/moderacion");
  const canAccessProductos = canAccessAdminPath(session.admin.role, "/admin/productos");

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Shapes className="h-5 w-5" />}
        title="Diseños prediseñados y fichas"
        subtitle="Todo el material visual que alimenta el Estudio: diseños print-grade listos por producto y fichas ilustradas del abecedario."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Producción" },
          { label: "Diseños prediseñados" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAccessPlantillas && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/plantillas">
                  <LayoutTemplate className="h-4 w-4" />
                  Plantillas
                </Link>
              </Button>
            )}
            {canAccessModeracion && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/moderacion">
                  <ShieldAlert className="h-4 w-4" />
                  Moderación UGC
                </Link>
              </Button>
            )}
            {canAccessProductos && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/productos">
                  <Package className="h-4 w-4" />
                  Catálogo
                </Link>
              </Button>
            )}
          </div>
        }
      />
      <AdminPageBody>
        {/* Pulso ejecutivo de galería print-grade */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-sm">
            <p className="text-xs font-medium text-emerald-800">Activos en Estudio</p>
            <p className="font-display mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
              <CountUp value={activeCount} />
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-800/80">Miniatura watermark + master</p>
          </div>
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-sm">
            <p className="text-xs font-medium text-amber-800">Pausados</p>
            <p className="font-display mt-1 text-2xl font-bold text-amber-700 tabular-nums">
              <CountUp value={pausedCount} />
            </p>
            <p className="mt-0.5 text-[11px] text-amber-800/80">Ocultos del cliente</p>
          </div>
          <div className="border-brand-purple/10 rounded-xl border bg-slate-50/70 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-700">Archivados</p>
            <p className="font-display mt-1 text-2xl font-bold text-slate-700 tabular-nums">
              <CountUp value={archivedCount} />
            </p>
            <p className="text-brand-muted mt-0.5 text-[11px]">Restaurables o purgables</p>
          </div>
          <div className="border-brand-purple/12 rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-brand-muted text-xs font-medium">Productos cubiertos</p>
            <p className="text-brand-purple-dark font-display mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={tagsWithActiveDesigns} />/{tagOptions.length}
            </p>
            <p className="text-brand-muted mt-0.5 text-[11px]">Con galería prediseñada activa</p>
          </div>
        </div>

        {items.length > 0 && (
          <AdminCard className="p-4">
            <p className="text-brand-purple-dark mb-2 text-xs font-semibold tracking-wider uppercase">
              Estado del catálogo de diseños prediseñados
            </p>
            <AdminSegmentedBar
              ariaLabel="Distribución de diseños prediseñados por estado"
              items={[
                {
                  key: "active",
                  label: "Activos en Estudio",
                  count: activeCount,
                  tone: "emerald",
                },
                {
                  key: "paused",
                  label: "Pausados",
                  count: pausedCount,
                  tone: "amber",
                },
                {
                  key: "archived",
                  label: "Archivados",
                  count: archivedCount,
                  tone: "slate",
                },
              ]}
            />
          </AdminCard>
        )}

        <DisenosTabs
          productos={
            <GalleryManager
              items={items}
              tagOptions={tagOptions}
              canAccessCatalog={canAccessProductos}
            />
          }
          fichas={<FichasSection />}
        />
      </AdminPageBody>
    </AdminPage>
  );
}
