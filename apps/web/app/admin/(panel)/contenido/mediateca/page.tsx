/*
 * Admin > Contenido > Mediateca (roadmap B5).
 *
 * Biblioteca de imágenes del sitio: assets subidos al bucket `cms-media`
 * (Supabase Storage) con su metadata en CmsMedia. Se suben acá o desde el
 * editor de un campo de imagen; se reutilizan en cualquier campo type IMAGE
 * (el campo guarda el CmsMedia.id como body).
 *
 * Por asset: miniatura, texto alternativo editable (a11y), dimensiones/peso,
 * conteo de uso (campos que la referencian — si está en uso NO se puede
 * borrar, la guarda vive en el service) y borrado con confirmación.
 *
 * Fase 3D (feedback Lucy 2026-09-18): botón "Copiar URL" por asset, filtro
 * "Sin uso" para cazar huérfanos y detalle expandible de QUÉ campos/páginas
 * usan cada imagen (getCmsMediaUsageDetail en lib/cms-media.ts).
 */

import type { Metadata } from "next";
import { ArrowLeft, Image as ImageIcon } from "lucide-react";
import {
  AdminButton,
  AdminCard,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  KpiCard,
} from "@/components/admin-page";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { getCmsMediaUsageDetail, listCmsMedia } from "@/lib/cms-media";
import { MediaLibraryClient } from "./media-library-client";

export const metadata: Metadata = {
  title: "Mediateca",
};

function formatMegabytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb < 0.1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toFixed(1)} MB`;
}

export default async function MediatecaPage() {
  await requireRole(ADMIN_ROLE_SETS.CONTENT);

  const media = await listCmsMedia(120);
  const usage = await getCmsMediaUsageDetail(media.map((m) => m.id));

  const enriched = media.map((m) => ({
    id: m.id,
    url: m.url,
    alt: m.alt,
    width: m.width,
    height: m.height,
    bytes: m.bytes,
    usedBy: usage.get(m.id) ?? [],
  }));

  const totalAssets = enriched.length;
  const inUseCount = enriched.filter((m) => m.usedBy.length > 0).length;
  const orphanCount = totalAssets - inUseCount;
  const missingAltCount = enriched.filter((m) => !m.alt || !m.alt.trim()).length;
  const totalBytes = enriched.reduce((acc, m) => acc + (m.bytes ?? 0), 0);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ImageIcon className="h-5 w-5" />}
        title="Mediateca"
        subtitle="Imágenes del sitio listas para usar en campos de imagen (banners, hero, logos). Sube una vez y reutiliza."
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Contenido", href: "/admin/contenido" },
          { label: "Mediateca" },
        ]}
        actions={
          <AdminButton href="/admin/contenido" variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </AdminButton>
        }
      />

      <AdminPageBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Imágenes cargadas"
            value={totalAssets}
            trend="neutral"
            trendLabel={`Peso acumulado: ${formatMegabytes(totalBytes)}`}
          />
          <KpiCard
            label="En uso en el sitio"
            value={inUseCount}
            trend={inUseCount > 0 ? "up" : "neutral"}
            trendLabel="Protegidas contra borrado accidental"
          />
          <KpiCard
            label="Sin uso (huérfanas)"
            value={orphanCount}
            trend="neutral"
            trendLabel="Disponibles o candidatas a limpieza"
          />
          <KpiCard
            label="Sin texto alternativo"
            value={missingAltCount}
            trend={missingAltCount > 0 ? "down" : "up"}
            trendLabel={
              missingAltCount > 0
                ? "Completa el alt para SEO y accesibilidad"
                : "100% con descripción accesible"
            }
          />
        </div>

        {totalAssets > 0 && (
          <AdminCard className="p-5">
            <h2 className="font-display text-brand-purple-dark mb-2 text-base font-bold">
              Ocupación editorial de imágenes
            </h2>
            <AdminSegmentedBar
              ariaLabel="Proporción de imágenes en uso frente a imágenes sin uso en la mediateca"
              items={[
                {
                  key: "used",
                  label: "En uso activo",
                  count: inUseCount,
                  tone: "emerald",
                },
                {
                  key: "orphan",
                  label: "Sin asignar",
                  count: orphanCount,
                  tone: "amber",
                },
              ]}
            />
          </AdminCard>
        )}

        <MediaLibraryClient media={enriched} />
      </AdminPageBody>
    </AdminPage>
  );
}
