/*
 * Admin > Plantillas de correo — catálogo de TODAS las plantillas transaccionales
 * (features/emails/registry.ts): nombre, cuándo se envía, y cuántos textos tiene
 * personalizados. El detalle (/admin/email-templates/[id]) tiene preview renderizado,
 * editor de textos clave (overrides EmailTemplateOverride) y envío de prueba.
 *
 * RBAC: SUPERADMIN (misma barra que redirects/integraciones — ver
 * lib/admin-rbac.ts ROUTE_ROLES). El layout ya rebotó al resto de roles.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ChevronRight, Globe, Mail, Plug, Search, Sparkles, X } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminNotice,
  AdminPage,
  AdminPageBody,
  AdminPageHeader,
  AdminSegmentedBar,
  KpiCard,
  QuickLink,
} from "@/components/admin-page";
import { Input } from "@/components/ui/input";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireRole } from "@/lib/admin-rbac-guard";
import { prisma } from "@/lib/db";
import { EMAIL_TEMPLATE_REGISTRY, type EmailTemplateEntry } from "@/features/emails/registry";

export const metadata: Metadata = {
  title: "Plantillas de correo",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  filter?: string;
  group?: string;
}>;

/** Conteo de overrides por plantilla; {} si la DB falla (la lista nunca se rompe). */
async function countOverridesByTemplate(): Promise<Record<string, number>> {
  try {
    const rows = await prisma.emailTemplateOverride.groupBy({
      by: ["templateId"],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.templateId, r._count._all]));
  } catch {
    return {};
  }
}

function buildFilterHref(params: { q?: string; filter?: string; group?: string }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.filter && params.filter !== "all") sp.set("filter", params.filter);
  if (params.group) sp.set("group", params.group);
  const qs = sp.toString();
  return qs ? `/admin/email-templates?${qs}` : "/admin/email-templates";
}

export default async function EmailTemplatesPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireRole(ADMIN_ROLE_SETS.SUPER);

  const sp = (await searchParams) ?? {};
  const q = (sp.q ?? "").trim();
  const qLower = q.toLowerCase();
  const filter = sp.filter === "customized" || sp.filter === "default" ? sp.filter : "all";
  const selectedGroup = (sp.group ?? "").trim();

  const overrideCounts = await countOverridesByTemplate();

  const allGroupsMap = new Map<string, number>();
  for (const tpl of EMAIL_TEMPLATE_REGISTRY) {
    allGroupsMap.set(tpl.group, (allGroupsMap.get(tpl.group) ?? 0) + 1);
  }
  const allGroups = [...allGroupsMap.entries()];

  const totalTemplates = EMAIL_TEMPLATE_REGISTRY.length;
  const customizedTemplates = EMAIL_TEMPLATE_REGISTRY.filter(
    (tpl) => (overrideCounts[tpl.id] ?? 0) > 0,
  ).length;
  const defaultTemplates = totalTemplates - customizedTemplates;
  const totalOverrides = EMAIL_TEMPLATE_REGISTRY.reduce(
    (acc, tpl) => acc + (overrideCounts[tpl.id] ?? 0),
    0,
  );
  const totalEditableSlots = EMAIL_TEMPLATE_REGISTRY.reduce(
    (acc, tpl) => acc + tpl.editableKeys.length,
    0,
  );

  const filteredTemplates = EMAIL_TEMPLATE_REGISTRY.filter((tpl) => {
    const ov = overrideCounts[tpl.id] ?? 0;
    if (filter === "customized" && ov === 0) return false;
    if (filter === "default" && ov > 0) return false;
    if (selectedGroup && tpl.group !== selectedGroup) return false;
    if (qLower) {
      const haystack = `${tpl.name} ${tpl.description} ${tpl.id} ${tpl.group}`.toLowerCase();
      if (!haystack.includes(qLower)) return false;
    }
    return true;
  });

  const groups = new Map<string, EmailTemplateEntry[]>();
  for (const tpl of filteredTemplates) {
    const list = groups.get(tpl.group) ?? [];
    list.push(tpl);
    groups.set(tpl.group, list);
  }

  const hasActiveFilters = Boolean(q || filter !== "all" || selectedGroup);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={<Mail className="h-5 w-5" />}
        title="Plantillas de correo"
        subtitle={`${totalTemplates} correos transaccionales y de ciclo de vida. Toca una plantilla para verla renderizada, editar sus textos clave o enviarte una prueba.`}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Configuración" },
          { label: "Plantillas de correo" },
        ]}
      />
      <AdminPageBody>
        {/* Resumen ejecutivo + barra de personalización */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Plantillas activas"
            value={totalTemplates}
            trend="neutral"
            trendLabel={`Agrupadas en ${allGroups.length} familias`}
          />
          <KpiCard
            label="Con textos propios"
            value={customizedTemplates}
            trend={customizedTemplates > 0 ? "up" : "neutral"}
            trendLabel={
              customizedTemplates > 0
                ? `${Math.round((customizedTemplates / totalTemplates) * 100)}% del catálogo personalizado`
                : "Usando textos originales de código"
            }
          />
          <KpiCard
            label="Overrides guardados"
            value={totalOverrides}
            trend="neutral"
            trendLabel={`De ${totalEditableSlots} campos editables totales`}
          />
          <KpiCard
            label="En vista actual"
            value={filteredTemplates.length}
            trend="neutral"
            trendLabel={hasActiveFilters ? "Con filtros aplicados" : "Catálogo completo"}
          />
        </div>

        <AdminCard className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-brand-purple-dark text-base font-bold">
                Postura editorial de correos
              </h2>
              <p className="text-brand-muted text-xs">
                Proporción de plantillas con textos personalizados frente al copy base de respaldo.
              </p>
            </div>
            <AdminBadge tone="purple">Envío de prueba: máx. 12 / hora</AdminBadge>
          </div>
          <AdminSegmentedBar
            ariaLabel="Distribución de plantillas de correo por estado de personalización"
            items={[
              {
                key: "customized",
                label: "Con textos personalizados",
                count: customizedTemplates,
                tone: "pink",
                href: buildFilterHref({ q, filter: "customized", group: selectedGroup }),
              },
              {
                key: "default",
                label: "Con texto original",
                count: defaultTemplates,
                tone: "purple",
                href: buildFilterHref({ q, filter: "default", group: selectedGroup }),
              },
            ]}
          />
        </AdminCard>

        <AdminNotice tone="info">
          Los textos base de cada correo viven en código (mezclan variables, estilos inline para
          clientes de correo y textos legales). Acá editas{" "}
          <strong>asunto, preheader y titular</strong>; tus cambios se guardan como override y el
          texto original queda de respaldo. Los datos globales (email de contacto, WhatsApp, razón
          social) se editan en{" "}
          <Link
            href="/admin/contenido/paginas/global"
            className="font-semibold underline underline-offset-2"
          >
            Ajustes del sitio
          </Link>
          .
        </AdminNotice>

        {/* Buscador y filtros por estado y familia */}
        <AdminCard className="space-y-3 p-4">
          <form method="GET" action="/admin/email-templates" className="flex flex-wrap gap-2">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            {selectedGroup && <input type="hidden" name="group" value={selectedGroup} />}
            <div className="relative min-w-[220px] flex-1">
              <Search className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar por nombre, cuándo se envía o ID (ej. order-paid, seguimiento)…"
                className="pl-9"
              />
            </div>
            <AdminButton type="submit" variant="secondary" size="md">
              Buscar
            </AdminButton>
            {hasActiveFilters && (
              <AdminButton href="/admin/email-templates" variant="ghost" size="md">
                <X className="h-3.5 w-3.5" />
                Limpiar
              </AdminButton>
            )}
          </form>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-brand-muted mr-1 font-semibold">Estado:</span>
            {[
              { key: "all", label: `Todas (${totalTemplates})` },
              { key: "customized", label: `Personalizadas (${customizedTemplates})` },
              { key: "default", label: `Originales (${defaultTemplates})` },
            ].map((item) => {
              const active = filter === item.key;
              return (
                <Link
                  key={item.key}
                  href={buildFilterHref({ q, filter: item.key, group: selectedGroup })}
                  className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                    active
                      ? "bg-brand-purple text-white"
                      : "bg-brand-purple/8 text-brand-purple-dark hover:bg-brand-purple/15"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-brand-muted mr-1 font-semibold">Familia:</span>
            <Link
              href={buildFilterHref({ q, filter, group: "" })}
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                !selectedGroup
                  ? "bg-brand-purple-dark text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Todas
            </Link>
            {allGroups.map(([grp, count]) => {
              const active = selectedGroup === grp;
              return (
                <Link
                  key={grp}
                  href={buildFilterHref({ q, filter, group: active ? "" : grp })}
                  className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                    active
                      ? "bg-brand-purple-dark text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {grp} ({count})
                </Link>
              );
            })}
          </div>
        </AdminCard>

        {filteredTemplates.length === 0 ? (
          <AdminEmpty
            icon={<Sparkles className="h-5 w-5" />}
            title="Ninguna plantilla coincide con tu filtro"
            description="Prueba con otra palabra clave o vuelve al catálogo completo de las 32 plantillas."
            action={
              <AdminButton href="/admin/email-templates" variant="secondary" size="sm">
                Ver todas las plantillas
              </AdminButton>
            }
          />
        ) : (
          [...groups.entries()].map(([group, templates]) => (
            <section key={group}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-brand-purple-dark text-lg font-bold">{group}</h2>
                <span className="text-brand-muted text-xs font-medium">
                  {templates.length} plantilla{templates.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((tpl) => {
                  const overrides = overrideCounts[tpl.id] ?? 0;
                  const maxKeys = Math.max(1, tpl.editableKeys.length);
                  const pct = Math.min(100, Math.round((overrides / maxKeys) * 100));
                  return (
                    <Link key={tpl.id} href={`/admin/email-templates/${tpl.id}`} className="group">
                      <AdminCard className="card-hover group-hover:border-brand-purple/40 flex h-full flex-col justify-between p-4 transition-all">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-brand-purple-dark text-sm font-bold">{tpl.name}</h3>
                            <ChevronRight className="text-brand-purple/40 group-hover:text-brand-purple h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{tpl.description}</p>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <code className="bg-brand-purple/5 text-brand-purple-dark/70 rounded px-1.5 py-0.5 text-[11px]">
                              {tpl.id}
                            </code>
                            {overrides > 0 ? (
                              <AdminBadge tone="pink">
                                {overrides}/{tpl.editableKeys.length} texto
                                {overrides === 1 ? "" : "s"} propio{overrides === 1 ? "" : "s"}
                              </AdminBadge>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                {tpl.editableKeys.length} campos editables
                              </span>
                            )}
                          </div>
                          {overrides > 0 && (
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="admin-bar-grow-x bg-brand-pink h-full rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </AdminCard>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}

        {/* Conexiones 360° de correo */}
        <section>
          <h2 className="font-display text-brand-purple-dark mb-3 text-lg font-bold">
            Conexiones del canal de correo
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <QuickLink
              href="/admin/integraciones"
              icon={Plug}
              label="Estado de Resend"
              description="Verifica que la API de envío y el remitente transaccional estén operativos."
            />
            <QuickLink
              href="/admin/contenido/paginas/global"
              icon={Globe}
              label="Ajustes del sitio"
              description="Email de soporte, WhatsApp y razón social que aparecen al pie de los correos."
            />
            <QuickLink
              href="/admin/observability"
              icon={Activity}
              label="Salud y colas de correo"
              description="Monitorea reintentos, webhooks y eventos operativos de entrega."
            />
          </div>
        </section>
      </AdminPageBody>
    </AdminPage>
  );
}
