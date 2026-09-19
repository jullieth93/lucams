/*
 * Admin > Marketing > Suscriptores — audiencia del newsletter (Fase 3A,
 * feedback Lucy 2026-09-18).
 *
 * Antes no existía vista: los emails iban a Resend Contacts + tabla Consent
 * (scope=NEWSLETTER) y el negocio no podía ver su audiencia. Acá se lista el
 * ledger deduplicado por email (estado = ÚLTIMA fila: la baja es otra fila
 * accepted=false, ver features/newsletter/admin-service.ts), con contadores
 * (activos / de baja / total), búsqueda, paginación y export CSV (botón de
 * arriba, descarga server-side en ./export/route.ts).
 *
 * SOLO LECTURA + export (Ley 1581: la revocación la inicia el titular con su
 * link firmado de baja; el admin no da de baja a terceros desde acá).
 *
 * RBAC: CATALOG (SUPERADMIN + MANAGER), misma matriz que /admin/clientes —
 * declarada en lib/admin-rbac.ts y enforceada por el layout del (panel).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, MailCheck } from "lucide-react";
import {
  AdminBadge,
  AdminEmpty,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableHead,
  AdminTableRow,
  AdminButton,
  KpiCard,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getCurrentAdmin } from "@/lib/auth";
import { listNewsletterSubscribers } from "@/features/newsletter/admin-service";

export const metadata: Metadata = {
  title: "Suscriptores del newsletter",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const STATUS_OPTIONS = ["all", "active", "unsubscribed"] as const;

export default async function AdminSuscriptoresPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentAdmin();
  if (!session) redirect("/admin/login");

  const sp = await searchParams;
  const q = pickString(sp, "q");
  const statusRaw = pickString(sp, "status");
  const status = (STATUS_OPTIONS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as (typeof STATUS_OPTIONS)[number])
    : "all";
  const page = Number(sp.page) || 1;

  const { items, counters, total, totalPages } = await listNewsletterSubscribers({
    q,
    status,
    page,
  });
  const hasActiveFilters = !!q || status !== "all";

  const dateFmt = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<MailCheck className="h-5 w-5" />}
        title="Suscriptores del newsletter"
        subtitle={
          <>
            {total} {total === 1 ? "suscriptor" : "suscriptores"}
            {hasActiveFilters && " · con filtros aplicados"}
          </>
        }
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Marketing" },
          { label: "Suscriptores" },
        ]}
        actions={
          <AdminButton href="/admin/marketing/suscriptores/export" variant="secondary">
            <Download className="h-4 w-4" />
            Exportar CSV
          </AdminButton>
        }
      />

      <AdminPageBody>
        {/* Contadores del universo completo (no del filtro aplicado) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Activos" value={counters.active} trendLabel="Reciben las campañas" />
          <KpiCard
            label="De baja"
            value={counters.unsubscribed}
            trendLabel="Revocaron el consentimiento"
          />
          <KpiCard label="Total histórico" value={counters.total} trendLabel="Altas + bajas" />
        </div>

        {/* Toolbar */}
        <form
          method="GET"
          className="border-brand-purple/10 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-12"
        >
          <div className="sm:col-span-6">
            <label
              htmlFor="f-q"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Buscar
            </label>
            <Input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Email del suscriptor…"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
          </div>
          <div className="sm:col-span-4">
            <label
              htmlFor="f-status"
              className="text-brand-purple-dark/70 mb-1 block text-xs font-semibold"
            >
              Estado
            </label>
            <select
              id="f-status"
              name="status"
              defaultValue={status}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="unsubscribed">De baja</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              className="bg-gradient-brand h-9 w-full text-white hover:brightness-110"
            >
              Aplicar
            </Button>
          </div>
          {hasActiveFilters && (
            <div className="sm:col-span-12">
              <Link
                href="/admin/marketing/suscriptores"
                className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
              >
                Limpiar filtros
              </Link>
            </div>
          )}
        </form>

        {items.length === 0 ? (
          <AdminEmpty
            icon={<MailCheck className="h-5 w-5" />}
            title={hasActiveFilters ? "Sin resultados" : "Aún no hay suscriptores"}
            description={
              hasActiveFilters
                ? "Prueba quitar algún filtro o cambiar el texto de búsqueda."
                : "Cuando el primer visitante se suscriba desde el formulario del sitio, aparecerá acá."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Suscripción</th>
                <th className="px-4 py-3 text-left font-semibold">Baja</th>
                <th className="px-4 py-3 text-left font-semibold">Aviso de privacidad</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((s) => (
                <AdminTableRow key={s.email}>
                  <td className="text-brand-purple-dark px-4 py-3 font-medium">{s.email}</td>
                  <td className="px-4 py-3">
                    {s.status === "active" ? (
                      <AdminBadge tone="emerald">Activo</AdminBadge>
                    ) : (
                      <AdminBadge tone="slate">De baja</AdminBadge>
                    )}
                  </td>
                  <td className="text-brand-purple-dark/85 px-4 py-3 text-xs">
                    {s.subscribedAt ? dateFmt.format(s.subscribedAt) : "—"}
                  </td>
                  <td className="text-brand-muted px-4 py-3 text-xs">
                    {s.unsubscribedAt ? dateFmt.format(s.unsubscribedAt) : "—"}
                  </td>
                  <td className="text-brand-muted px-4 py-3 text-xs">{s.version ?? "—"}</td>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}

        {totalPages > 1 && (
          <div className="text-brand-purple-dark/70 flex items-center justify-between text-sm">
            <span>
              {total} {total === 1 ? "suscriptor" : "suscriptores"} · página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <PaginationLink page={page - 1} q={q} status={status}>
                  ← Anterior
                </PaginationLink>
              )}
              {page < totalPages && (
                <PaginationLink page={page + 1} q={q} status={status}>
                  Siguiente →
                </PaginationLink>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}

function PaginationLink({
  page,
  q,
  status,
  children,
}: {
  page: number;
  q?: string;
  status?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  return (
    <Link
      href={`/admin/marketing/suscriptores?${params.toString()}`}
      className="border-brand-purple/20 hover:bg-brand-purple/5 text-brand-purple-dark rounded-md border bg-white px-3 py-1.5 text-xs font-medium"
    >
      {children}
    </Link>
  );
}
