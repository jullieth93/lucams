/*
 * Admin > Finanzas > Bloqueos contra entrega (COD) · ADR-065.
 *
 * Block-list persistente del anti-abuso COD: teléfonos, emails y direcciones vetados que NO pueden
 * pagar contra entrega (sí pueden pagar en línea). Lucy agrega/retira teléfonos/emails desde acá; las
 * direcciones se bloquean desde el pedido (tienen la clave normalizada). SUPERADMIN (política de pago).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ShieldBan, Wallet, ArrowLeft, Search } from "lucide-react";
import {
  AdminBadge,
  AdminCard,
  AdminNotice,
  AdminEmpty,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  AdminTable,
  AdminTableHead,
  AdminTableBody,
  AdminTableRow,
  KpiCard,
} from "@/components/admin-page";
import { ADMIN_ROLE_SETS, adminHomePath, hasCapability } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { maskBlockedIdentityValue, maskEmailsInText } from "@/lib/pii-mask";
import { listBlockedIdentities } from "@/features/anti-abuse/blocklist-service";
import { AddBlockForm, RemoveBlockButton } from "./bloqueos-form";
import { formatDateCO } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Bloqueos contra entrega",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const KIND_META: Record<string, { label: string; tone: "turquoise" | "pink" | "amber" }> = {
  PHONE: { label: "Teléfono", tone: "turquoise" },
  EMAIL: { label: "Email", tone: "pink" },
  ADDRESS: { label: "Dirección", tone: "amber" },
};

type KindFilter = "ALL" | "PHONE" | "EMAIL" | "ADDRESS";
type SearchParams = Promise<{ kind?: string; q?: string }>;

export default async function BloqueosCodPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireRole(ADMIN_ROLE_SETS.FINANCE_COD);

  const canReadPii = hasCapability(session.admin.role, "orders:read_pii");
  const homeHref = adminHomePath(session.admin.role);
  const sp = await searchParams;
  const kindFilter: KindFilter = (["ALL", "PHONE", "EMAIL", "ADDRESS"] as const).includes(
    sp.kind as KindFilter,
  )
    ? (sp.kind as KindFilter)
    : "ALL";
  const qRaw = (sp.q ?? "").trim();
  const qNorm = qRaw.toLowerCase();

  const allRows = await listBlockedIdentities();

  const phoneCount = allRows.filter((r) => r.kind === "PHONE").length;
  const emailCount = allRows.filter((r) => r.kind === "EMAIL").length;
  const addressCount = allRows.filter((r) => r.kind === "ADDRESS").length;

  // Server-side PII masking ANTES de filtrar por `q` cuando el actor carece de `orders:read_pii`,
  // impidiendo usar el buscador como oráculo para deducir teléfonos/correos completos.
  const preparedRows = allRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    displayValue: canReadPii ? r.value : maskBlockedIdentityValue(r.kind, r.value),
    displayReason: canReadPii ? r.reason : maskEmailsInText(r.reason),
    createdAt: r.createdAt,
  }));

  const rows = preparedRows.filter((r) => {
    if (kindFilter !== "ALL" && r.kind !== kindFilter) return false;
    if (!qNorm) return true;
    return (
      r.displayValue.toLowerCase().includes(qNorm) || r.displayReason.toLowerCase().includes(qNorm)
    );
  });

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<ShieldBan className="h-5 w-5" />}
        title="Bloqueos contra entrega"
        subtitle="Teléfonos, emails y direcciones que no pueden pagar contra entrega (sí pueden pagar en línea)"
        breadcrumbs={[
          { label: "Admin", href: homeHref },
          { label: "Finanzas", href: "/admin/finanzas" },
          { label: "Bloqueos" },
        ]}
        actions={
          <Link
            href="/admin/finanzas/conciliacion"
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            <Wallet className="h-3.5 w-3.5" />
            Ir a conciliación COD
          </Link>
        }
      />

      <AdminPageBody>
        <AdminNotice tone="info">
          Cuando alguien abusa del <strong>pago contra entrega</strong> (pide y no recibe, deja
          paquetes devueltos), bloquéalo aquí con confirmación MFA: sus próximos pedidos tendrán que
          pagarse <strong>en línea</strong> (tarjeta, PSE o Nequi). No se le avisa que está
          bloqueado. Las <strong>direcciones</strong> se bloquean desde el detalle del pedido.
          {!canReadPii && (
            <>
              {" "}
              <strong>Modo analítico:</strong> las identidades personales se muestran enmascaradas
              por mínimo privilegio.
            </>
          )}
        </AdminNotice>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Identidades vetadas"
            value={allRows.length}
            trendLabel="Total activo en lista COD"
          />
          <KpiCard label="Teléfonos" value={phoneCount} trendLabel="Normalizados +57" />
          <KpiCard label="Correos" value={emailCount} trendLabel="Minúsculas exactas" />
          <KpiCard label="Direcciones" value={addressCount} trendLabel="Clave desde pedidos" />
        </div>

        {allRows.length > 0 && (
          <AdminCard className="p-4">
            <h2 className="text-brand-purple-dark mb-2.5 text-xs font-bold tracking-wide uppercase">
              Distribución de bloqueos por tipo de identidad
            </h2>
            <AdminSegmentedBar
              ariaLabel="Distribución de bloqueos contra entrega por tipo"
              items={[
                {
                  key: "PHONE",
                  label: "Teléfonos",
                  count: phoneCount,
                  tone: "turquoise",
                  href: "/admin/finanzas/bloqueos?kind=PHONE",
                },
                {
                  key: "EMAIL",
                  label: "Emails",
                  count: emailCount,
                  tone: "pink",
                  href: "/admin/finanzas/bloqueos?kind=EMAIL",
                },
                {
                  key: "ADDRESS",
                  label: "Direcciones",
                  count: addressCount,
                  tone: "amber",
                  href: "/admin/finanzas/bloqueos?kind=ADDRESS",
                },
              ]}
            />
          </AdminCard>
        )}

        <AdminCard className="p-4">
          <h2 className="text-brand-purple-dark mb-3 text-sm font-bold">
            Bloquear un teléfono o email (requiere MFA reciente)
          </h2>
          <AddBlockForm />
        </AdminCard>

        <form
          method="GET"
          className="border-brand-purple/10 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { value: "ALL", label: `Todos (${allRows.length})` },
                { value: "PHONE", label: `Teléfonos (${phoneCount})` },
                { value: "EMAIL", label: `Emails (${emailCount})` },
                { value: "ADDRESS", label: `Direcciones (${addressCount})` },
              ] as const
            ).map((tab) => {
              const params = new URLSearchParams();
              if (tab.value !== "ALL") params.set("kind", tab.value);
              if (qRaw) params.set("q", qRaw);
              const href = params.size
                ? `/admin/finanzas/bloqueos?${params.toString()}`
                : "/admin/finanzas/bloqueos";
              const active = kindFilter === tab.value;
              return (
                <Link
                  key={tab.value}
                  href={href}
                  aria-current={active ? "true" : undefined}
                  className={
                    active
                      ? "bg-brand-purple inline-flex min-h-9 items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
                      : "border-brand-purple/20 text-brand-purple-dark hover:border-brand-purple/50 inline-flex min-h-9 items-center rounded-full border bg-white px-3 py-1 text-xs font-semibold transition-colors"
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          <div className="flex min-w-56 flex-1 items-center gap-2 sm:max-w-xs">
            {kindFilter !== "ALL" && <input type="hidden" name="kind" value={kindFilter} />}
            <div className="relative flex-1">
              <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
              <input
                type="search"
                name="q"
                defaultValue={qRaw}
                placeholder="Buscar motivo o valor…"
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white pr-3 pl-8 text-xs focus:ring-2 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-gradient-brand h-9 rounded-md px-3 text-xs font-semibold text-white hover:brightness-110"
            >
              Filtrar
            </button>
          </div>

          {(kindFilter !== "ALL" || qRaw) && (
            <Link
              href="/admin/finanzas/bloqueos"
              className="text-brand-muted hover:text-brand-purple-dark text-xs font-semibold"
            >
              Limpiar
            </Link>
          )}

          <Link
            href="/admin/finanzas"
            className="text-brand-muted hover:text-brand-purple-dark ml-auto inline-flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Finanzas
          </Link>
        </form>

        {rows.length === 0 ? (
          <AdminEmpty
            icon={<ShieldBan className="h-8 w-8" />}
            title={allRows.length === 0 ? "Sin bloqueos" : "Sin coincidencias"}
            description={
              allRows.length === 0
                ? "Aún no has bloqueado ninguna identidad. Cuando lo hagas, aparecerá acá."
                : "Prueba limpiando el filtro por tipo o la búsqueda."
            }
          />
        ) : (
          <AdminTable>
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold">Valor</th>
                <th className="px-4 py-3 text-left font-semibold">Motivo</th>
                <th className="px-4 py-3 text-left font-semibold">Bloqueado</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((r) => {
                const meta = KIND_META[r.kind] ?? { label: r.kind, tone: "amber" as const };
                return (
                  <AdminTableRow key={r.id}>
                    <td className="px-4 py-3 align-top">
                      <AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>
                    </td>
                    <td className="text-brand-purple-dark px-4 py-3 align-top text-sm font-medium break-all">
                      {r.kind === "ADDRESS" ? (
                        <span className="text-brand-muted font-mono text-xs">{r.displayValue}</span>
                      ) : (
                        r.displayValue
                      )}
                    </td>
                    <td className="text-brand-purple-dark/85 px-4 py-3 align-top text-sm">
                      {r.displayReason}
                    </td>
                    <td className="text-brand-muted px-4 py-3 align-top text-xs">
                      {formatDateCO(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <RemoveBlockButton id={r.id} label={r.displayValue} />
                    </td>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
