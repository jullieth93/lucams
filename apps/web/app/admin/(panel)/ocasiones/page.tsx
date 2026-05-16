/*
 * Admin > Ocasiones — PLAN_CATALOG_V2 1.5 + 2.10 + 3.4.
 *
 * Lista todas las OcasionTag con count de productos asociados.
 * Crear inline + editar individual.
 *
 * UX no-técnico (memoria feedback_admin_ux_no_tecnico): labels español llano,
 * notices con emojis, fechas humanas, confirmaciones antes de archivar.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Tag, ChevronRight } from "lucide-react";
import { listOcasionTags } from "@/features/ocasiones/service";
import { getCurrentAdmin } from "@/lib/auth";
import { AdminPage, AdminPageHeader, AdminPageBody, AdminNotice } from "@/components/admin-page";
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
        breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Ocasiones" }]}
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          <strong>¿Para qué sirven?</strong> Permiten que el cliente filtre productos por momento o
          celebración (Matrimonio, Día de la Madre, Cumpleaños…). Cada ocasión tiene una descripción
          semántica que el bot futuro usa para responder preguntas como &quot;¿qué le regalo a mi
          mamá?&quot;.
        </AdminNotice>

        {created && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            🟢 Ocasión creada.
          </div>
        )}
        {updated && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            🟢 Ocasión actualizada.
          </div>
        )}
        {deleted && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            🟡 Ocasión archivada.
          </div>
        )}
        {errorMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            🔴 {errorMsg}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {ocasiones.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <Tag className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 font-medium text-slate-700">Todavía no hay ocasiones.</p>
              <p className="mt-1 text-sm text-slate-500">
                Corre{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5">make seed-ocasiones</code> para
                poblar las 15 ocasiones base, o crea la primera abajo.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Mes destacado</th>
                  <th className="px-4 py-3">Cantidad sugerida</th>
                  <th className="px-4 py-3">Productos</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {ocasiones.map((o) => {
                  const range = o.suggestedQuantityRange as {
                    min: number;
                    ideal: number;
                    max: number;
                  } | null;
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {!o.isActive && (
                          <span className="mr-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                            Inactiva
                          </span>
                        )}
                        {o.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{o.slug}</code>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {o.monthHint ? MONTH_NAMES[o.monthHint] : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {range ? `${range.min} / ${range.ideal} / ${range.max}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {o._count.products}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/ocasiones/${o.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-purple-700 hover:text-purple-900"
                        >
                          Editar
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">Crear ocasión nueva</h2>
          <CreateOcasionForm />
        </div>
      </AdminPageBody>
    </AdminPage>
  );
}
