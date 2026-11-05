/*
 * Admin > Clientes > Contactos duplicados (`/admin/clientes/duplicados` · Fase 9 · S20).
 *
 * Cola humana gobernada (ADR-193 Nivel 4):
 *  - Guard N-21 en paridad con `ROUTE_ROLES`: `requireCapability("contacts:merge")`.
 *  - Muestra señales probables (`SAME_BUYER_PHONE_E164`, `SAME_BILLING_DOCUMENT`,
 *    `AUTH_BUYER_ALT_ORDER_EMAIL`, `HISTORICAL_ID01_EMAIL_MISMATCH`) sin auto-merge.
 *  - Permite revisar pendientes, consultar historial de aprobados (con enlace al
 *    sobreviviente) y consultar descartados (*do-not-suggest* permanentes).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, GitMerge, ShieldCheck } from "lucide-react";
import type { MergeCandidateStatus } from "@lucams/db";
import { AdminEmpty, AdminPage, AdminPageBody, AdminPageHeader } from "@/components/admin-page";
import { requireCapability } from "@/lib/admin-rbac-guard";
import {
  isMergeCandidateStatusFilter,
  listMergeCandidatesForActor,
} from "@/features/identity/merge-service";
import { MergeCandidateCard } from "./merge-candidate-card";

export const metadata: Metadata = {
  title: "Revisión de contactos duplicados",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function pickString(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

const STATUS_TABS: ReadonlyArray<{
  key: MergeCandidateStatus;
  label: string;
}> = [
  { key: "PENDING", label: "Pendientes de revisión" },
  { key: "APPROVED", label: "Fusionados" },
  { key: "REJECTED", label: "Descartados" },
];

export default async function AdminDuplicateContactsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireCapability("contacts:merge");

  const sp = await searchParams;
  const statusRaw = pickString(sp, "status");
  const status: MergeCandidateStatus = isMergeCandidateStatusFilter(statusRaw)
    ? statusRaw
    : "PENDING";
  const page = Math.max(1, Number(pickString(sp, "page")) || 1);
  const mergedOk = pickString(sp, "merged") === "1";
  const survivorId = pickString(sp, "survivor");
  const rejectedOk = pickString(sp, "rejected") === "1";
  const errorMsg = pickString(sp, "error");

  const data = await listMergeCandidatesForActor({ status, page }, session.admin.role);

  const countByTab: Record<MergeCandidateStatus, number> = {
    PENDING: data.counts.pending,
    APPROVED: data.counts.approved,
    REJECTED: data.counts.rejected,
  };

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<GitMerge className="h-5 w-5" />}
        title="Revisión de contactos duplicados"
        subtitle="Cola asistida de unificación humana con verificación MFA y respaldo reversible (ADR-193)."
        breadcrumbs={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Clientes", href: "/admin/clientes" },
          { label: "Duplicados" },
        ]}
        actions={
          <Link
            href="/admin/clientes"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al directorio
          </Link>
        }
      />

      <AdminPageBody>
        <div className="border-brand-purple/15 bg-brand-cream/50 flex items-start gap-3 rounded-xl border p-4 text-xs">
          <ShieldCheck className="text-brand-purple mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="text-brand-purple-dark font-semibold">
              Reglas seguras de unificación en Lucams
            </p>
            <p className="text-muted-foreground">
              El motor nunca fusiona en silencio por teléfono ni documento compartido, ni mezcla
              datos de destinatarios de regalo. Cada fusión exige código MFA reciente, conserva un
              snapshot completo en auditoría y respeta los bloqueos permanentes cuando marcas dos
              perfiles como personas distintas.
            </p>
          </div>
        </div>

        {mergedOk && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          >
            <span className="inline-flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              Contactos fusionados correctamente con respaldo en auditoría.
            </span>
            {survivorId && (
              <Link
                href={`/admin/clientes/${encodeURIComponent(survivorId)}`}
                className="font-semibold text-emerald-800 underline underline-offset-2"
              >
                Abrir perfil unificado →
              </Link>
            )}
          </div>
        )}

        {rejectedOk && (
          <div
            role="status"
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900"
          >
            Sugerencia descartada. El par quedó registrado para no volver a sugerirse.
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900"
          >
            {errorMsg}
          </div>
        )}

        <nav
          aria-label="Estado de candidatos de fusión"
          className="flex flex-wrap items-center gap-2"
        >
          {STATUS_TABS.map((tab) => {
            const active = status === tab.key;
            return (
              <Link
                key={tab.key}
                href={`/admin/clientes/duplicados?status=${tab.key}`}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                  active
                    ? "border-brand-purple bg-brand-purple text-white"
                    : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 bg-white"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    active ? "bg-white/20 text-white" : "bg-brand-purple/10 text-brand-purple-dark"
                  }`}
                >
                  {countByTab[tab.key]}
                </span>
              </Link>
            );
          })}
        </nav>

        {data.items.length === 0 ? (
          <AdminEmpty
            icon={<GitMerge className="h-8 w-8" />}
            title={
              status === "PENDING"
                ? "No hay contactos duplicados pendientes"
                : status === "APPROVED"
                  ? "Aún no se han aprobado fusiones"
                  : "No hay sugerencias descartadas"
            }
            description={
              status === "PENDING"
                ? "Cuando dos contactos distintos compartan celular de comprador, documento DIAN o correo alterno propio, aparecerán aquí para tu revisión."
                : "Aquí puedes consultar la trazabilidad histórica de las decisiones tomadas por el equipo."
            }
          />
        ) : (
          <div className="space-y-4">
            {data.items.map((item) => (
              <MergeCandidateCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {data.totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs">
            <span className="text-muted-foreground">
              Página {data.page} de {data.totalPages} ({data.total} registros)
            </span>
            <div className="flex items-center gap-2">
              {data.page > 1 && (
                <Link
                  href={`/admin/clientes/duplicados?status=${status}&page=${data.page - 1}`}
                  className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-10 items-center rounded-lg border bg-white px-3 font-semibold"
                >
                  Anterior
                </Link>
              )}
              {data.page < data.totalPages && (
                <Link
                  href={`/admin/clientes/duplicados?status=${status}&page=${data.page + 1}`}
                  className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-10 items-center rounded-lg border bg-white px-3 font-semibold"
                >
                  Siguiente
                </Link>
              )}
            </div>
          </div>
        )}
      </AdminPageBody>
    </AdminPage>
  );
}
