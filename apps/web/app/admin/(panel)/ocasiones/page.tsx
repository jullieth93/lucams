/*
 * Admin > Ocasiones — PLAN_CATALOG_V2 1.5 + brand palette 2026-05-18.
 *
 * Lista todas las OcasionTag con count de productos asociados.
 * Crear inline + editar individual.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Tag, ChevronRight } from "lucide-react";
import { listOcasionTags } from "@/features/ocasiones/service";
import { getCurrentAdmin } from "@/lib/auth";
import {
  AdminPage,
  AdminPageHeader,
  AdminPageBody,
  AdminNotice,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  AdminBadge,
  AdminEmpty,
  AdminCard,
} from "@/components/admin-page";
import { CreateOcasionForm } from "./create-ocasion-form";

export const metadata: Metadata = {
  title: "Ocasiones",
};

const MONTH_NAMES: Record<number, string> = {
  1: "Enero",
  2: "Febrero",
  3: "Marzo",
  4: "Abril",
  5: "Mayo",
  6: "Junio",
  7: "Julio",
  8: "Agosto",
  9: "Septiembre",
  10: "Octubre",
  11: "Noviembre",
  12: "Diciembre",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AdminOcasionesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const ocasiones = await listOcasionTags();
  const created = sp.created === "1";
  const updated = sp.updated === "1";
  const deleted = sp.deleted === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Tag className="h-5 w-5" />}
        title="Ocasiones"
        subtitle="Tags transversales que cruzan categorías. Alimentan al bot WhatsApp futuro."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Catálogo" },
          { label: "Ocasiones" },
        ]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Para qué sirven?</strong> Permiten que el cliente filtre productos por momento o
          celebración (Matrimonio, Día de la Madre, Cumpleaños…). Cada ocasión tiene una descripción
          semántica que el bot futuro usa para responder preguntas como &quot;¿qué le regalo a mi
          mamá?&quot;.
        </AdminNotice>

        {created && <AdminNotice tone="success">Ocasión creada.</AdminNotice>}
        {updated && <AdminNotice tone="success">Ocasión actualizada.</AdminNotice>}
        {deleted && <AdminNotice tone="warning">Ocasión archivada.</AdminNotice>}
        {errorMsg && <AdminNotice tone="error">{errorMsg}</AdminNotice>}

        {ocasiones.length === 0 ? (
          <AdminEmpty
            icon={<Tag className="h-5 w-5" />}
            title="Todavía no hay ocasiones"
            description="Corre make seed-ocasiones para poblar las 15 ocasiones base, o crea la primera abajo."
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold">Slug</th>
                <th className="px-4 py-3 text-left font-semibold">Mes destacado</th>
                <th className="px-4 py-3 text-left font-semibold">Cantidad sugerida</th>
                <th className="px-4 py-3 text-center font-semibold">Productos</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {ocasiones.map((o) => {
                const range = o.suggestedQuantityRange as {
                  min: number;
                  ideal: number;
                  max: number;
                } | null;
                return (
                  <AdminTableRow key={o.id}>
                    <td className="px-4 py-3">
                      <div className="text-brand-purple-dark flex items-center gap-2 font-medium">
                        {!o.isActive && <AdminBadge tone="slate">Inactiva</AdminBadge>}
                        {o.name}
                      </div>
                    </td>
                    <td className="text-brand-purple-dark/75 px-4 py-3 font-mono text-xs">
                      {o.slug}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-sm">
                      {o.monthHint ? MONTH_NAMES[o.monthHint] : "—"}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-sm">
                      {range ? `${range.min} / ${range.ideal} / ${range.max}` : "—"}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 text-center text-sm tabular-nums">
                      {o._count.products}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/ocasiones/${o.id}`}
                        className="text-brand-purple hover:text-brand-purple-dark inline-flex items-center gap-1 text-xs font-medium"
                      >
                        Editar
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}

        <AdminCard className="p-5">
          <h3 className="text-brand-purple-dark font-display mb-3 text-base font-bold">
            Crear ocasión nueva
          </h3>
          <CreateOcasionForm />
        </AdminCard>
      </AdminPageBody>
    </AdminPage>
  );
}
