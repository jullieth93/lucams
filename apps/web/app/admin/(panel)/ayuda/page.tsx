import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, CheckCircle2, GraduationCap, Search } from "lucide-react";
import { z } from "zod";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { adminRoleLabel } from "@/lib/admin-roles";
import { CountUp } from "@/components/admin/count-up";
import { AdminGuideView } from "@/features/admin-help/components/guide-view";
import { AdminInteractiveGuide } from "@/features/admin-help/components/interactive-guide";
import {
  getAvailableModuleGuides,
  getModuleGuideById,
  getOnboardingForRole,
  searchModuleGuides,
} from "@/features/admin-help/registry";
import { getAdminHelpFeedbackForGuide, getAdminHelpProgress } from "@/features/admin-help/service";

export const metadata: Metadata = {
  title: "Centro de ayuda",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const HelpCenterSearchSchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  area: z.string().trim().max(80).optional(),
  guia: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  aprender: z.string().optional(),
});

function buildHelpFilterHref(q: string, area?: string): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (area) sp.set("area", area);
  const qs = sp.toString();
  return qs ? `/admin/ayuda?${qs}` : "/admin/ayuda";
}

export default async function AdminHelpCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });
  const role = session.admin.role;
  const parsed = HelpCenterSearchSchema.safeParse(await searchParams);
  const params = parsed.success
    ? parsed.data
    : { q: "", area: undefined, guia: undefined, aprender: undefined };
  const availableGuides = getAvailableModuleGuides(role);
  const areas = [...new Set(availableGuides.map((g) => g.area))];
  const activeArea = params.area ? areas.find((a) => a === params.area) : undefined;

  const selectedGuide = params.guia ? getModuleGuideById(params.guia, role) : null;
  const searchFiltered = searchModuleGuides(role, params.q, availableGuides);
  const results = activeArea ? searchFiltered.filter((g) => g.area === activeArea) : searchFiltered;

  const onboarding = getOnboardingForRole(role);
  const [progress, selectedFeedback] = await Promise.all([
    getAdminHelpProgress(session.admin.id),
    selectedGuide
      ? getAdminHelpFeedbackForGuide(session.admin.id, selectedGuide.id)
      : Promise.resolve(null),
  ]);
  const onboardingProgress = progress.find((item) => item.guideId === onboarding.id) ?? null;

  const completedGuideIds = new Set(
    progress.filter((item) => item.completedAt !== null).map((item) => item.guideId),
  );
  const completedModuleCount = availableGuides.filter((g) => completedGuideIds.has(g.id)).length;
  const completionPct =
    availableGuides.length > 0
      ? Math.round((completedModuleCount / availableGuides.length) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {selectedGuide ? (
        <div>
          <Link
            href={buildHelpFilterHref(params.q, activeArea)}
            className="text-brand-purple inline-flex min-h-11 items-center gap-2 font-semibold hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al Centro de ayuda
          </Link>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <AdminGuideView
              guide={selectedGuide}
              role={role}
              initialFeedback={selectedFeedback}
              interactive={
                <AdminInteractiveGuide
                  guide={selectedGuide}
                  role={role}
                  initialProgress={progress.find((item) => item.guideId === selectedGuide.id)}
                />
              }
            />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <header className="from-brand-purple-dark to-brand-purple overflow-hidden rounded-2xl bg-gradient-to-br p-6 text-white sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-white/75">
                Aprendizaje para {adminRoleLabel(role)}
              </p>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                <CountUp value={availableGuides.length} /> guías adaptadas a tu rol
              </span>
            </div>
            <h1 className="font-display mt-2 text-3xl font-bold">Centro de ayuda</h1>
            <p className="mt-3 max-w-3xl text-white/85">
              Encuentra para qué sirve cada módulo, cómo interpretar sus datos y cómo completar tus
              tareas con seguridad. Todo el contenido se adapta a tus permisos.
            </p>
            <form
              action="/admin/ayuda"
              className="mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row"
              role="search"
            >
              {activeArea && <input type="hidden" name="area" value={activeArea} />}
              <label htmlFor="help-search" className="sr-only">
                Buscar en las guías
              </label>
              <div className="relative flex-1">
                <Search
                  className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  id="help-search"
                  name="q"
                  type="search"
                  defaultValue={params.q}
                  placeholder="Busca un módulo, campo, estado o tarea"
                  className="min-h-12 w-full rounded-xl border border-white/20 bg-white px-11 text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                type="submit"
                className="text-brand-purple-dark min-h-12 rounded-xl bg-white px-5 font-bold"
              >
                Buscar
              </button>
            </form>
          </header>

          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-brand-purple flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
                  <GraduationCap className="h-5 w-5" aria-hidden /> Tu ruta de aprendizaje
                </p>
                {onboardingProgress?.completedAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Bienvenida completada
                  </span>
                )}
              </div>
              <h2 className="font-display text-brand-purple-dark mt-2 text-2xl font-bold">
                {onboarding.title}
              </h2>
              <p className="mt-1 text-slate-600">{onboarding.summary}</p>
              <div className="mt-3 max-w-md">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Recorridos de módulos completados:{" "}
                    <strong className="text-brand-purple-dark tabular-nums">
                      <CountUp value={completedModuleCount} /> / {availableGuides.length}
                    </strong>
                  </span>
                  <span className="font-semibold tabular-nums">{completionPct}%</span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label={`Progreso en guías de módulos: ${completionPct}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={completionPct}
                >
                  <div
                    className="admin-bar-grow-x bg-brand-purple h-full rounded-full"
                    style={{
                      width: `${Math.max(completionPct, completedModuleCount > 0 ? 3 : 0)}%`,
                    }}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Opcional · {onboarding.steps.length} pasos · Puedes retomarla o repetirla cuando
                quieras.
              </p>
            </div>
            <div className="sm:w-72">
              <AdminInteractiveGuide
                guide={onboarding}
                role={role}
                initialProgress={onboardingProgress}
                autoStart={params.aprender === "1"}
              />
            </div>
          </section>

          <section aria-labelledby="help-results">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2
                  id="help-results"
                  className="font-display text-brand-purple-dark text-2xl font-bold"
                >
                  {params.q ? `Resultados para «${params.q}»` : "Guías de todos tus módulos"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {results.length} {results.length === 1 ? "guía disponible" : "guías disponibles"}
                  {activeArea ? ` en ${activeArea}` : ""}
                </p>
              </div>
              {(params.q || activeArea) && (
                <Link
                  href="/admin/ayuda"
                  className="text-brand-purple-dark font-semibold hover:underline"
                >
                  Limpiar filtros
                </Link>
              )}
            </div>

            {areas.length > 1 && (
              <div
                className="mt-4 flex flex-wrap items-center gap-1.5"
                aria-label="Filtrar por área"
              >
                <Link
                  href={buildHelpFilterHref(params.q, undefined)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !activeArea
                      ? "bg-brand-purple text-white shadow-sm"
                      : "text-brand-purple-dark hover:bg-brand-purple/10 border border-slate-200 bg-white"
                  }`}
                >
                  Todas ({searchFiltered.length})
                </Link>
                {areas.map((area) => {
                  const count = searchFiltered.filter((g) => g.area === area).length;
                  return (
                    <Link
                      key={area}
                      href={buildHelpFilterHref(params.q, area)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeArea === area
                          ? "bg-brand-purple text-white shadow-sm"
                          : "text-brand-purple-dark hover:bg-brand-purple/10 border border-slate-200 bg-white"
                      }`}
                    >
                      {area} ({count})
                    </Link>
                  );
                })}
              </div>
            )}

            {results.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {results.map((guide) => {
                  const guideProgress = progress.find((item) => item.guideId === guide.id);
                  return (
                    <Link
                      key={guide.id}
                      href={`/admin/ayuda?guia=${guide.id}`}
                      className="hover:border-brand-purple group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-brand-purple text-xs font-bold tracking-wider uppercase">
                          {guide.area}
                        </span>
                        {guideProgress?.completedAt && (
                          <span className="text-xs font-medium text-emerald-700">Completada</span>
                        )}
                      </div>
                      <h3 className="font-display text-brand-purple-dark mt-3 text-xl font-bold">
                        {guide.title}
                      </h3>
                      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                        {guide.summary}
                      </p>
                      <span className="text-brand-purple mt-4 inline-flex items-center gap-2 text-sm font-semibold">
                        <BookOpen className="h-4 w-4" aria-hidden /> Leer guía completa
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
                <h3 className="text-brand-purple-dark mt-3 font-bold">
                  No encontramos una guía con esos términos
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Prueba con el nombre del módulo, una sola palabra del campo o la tarea que quieres
                  realizar.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
