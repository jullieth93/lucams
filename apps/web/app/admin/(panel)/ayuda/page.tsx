import Link from "next/link";
import { ArrowLeft, BookOpen, GraduationCap, Search } from "lucide-react";
import { z } from "zod";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { adminRoleLabel } from "@/lib/admin-roles";
import { AdminGuideView } from "@/features/admin-help/components/guide-view";
import { AdminInteractiveGuide } from "@/features/admin-help/components/interactive-guide";
import {
  getAvailableModuleGuides,
  getModuleGuideById,
  getOnboardingForRole,
  searchModuleGuides,
} from "@/features/admin-help/registry";
import { getAdminHelpProgress } from "@/features/admin-help/service";

const HelpCenterSearchSchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  guia: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  aprender: z.string().optional(),
});

export default async function AdminHelpCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });
  const role = session.admin.role;
  const parsed = HelpCenterSearchSchema.safeParse(await searchParams);
  const params = parsed.success ? parsed.data : { q: "", guia: undefined, aprender: undefined };
  const availableGuides = getAvailableModuleGuides(role);
  const selectedGuide = params.guia ? getModuleGuideById(params.guia, role) : null;
  const results = searchModuleGuides(role, params.q, availableGuides);
  const onboarding = getOnboardingForRole(role);
  const progress = await getAdminHelpProgress(session.admin.id);
  const onboardingProgress = progress.find((item) => item.guideId === onboarding.id) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {selectedGuide ? (
        <div>
          <Link
            href={`/admin/ayuda${params.q ? `?q=${encodeURIComponent(params.q)}` : ""}`}
            className="text-brand-purple inline-flex min-h-11 items-center gap-2 font-semibold hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al Centro de ayuda
          </Link>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <AdminGuideView
              guide={selectedGuide}
              role={role}
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
            <p className="text-sm font-medium text-white/70">
              Aprendizaje para {adminRoleLabel(role)}
            </p>
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

          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-brand-purple flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
                <GraduationCap className="h-5 w-5" aria-hidden /> Tu ruta de aprendizaje
              </p>
              <h2 className="font-display text-brand-purple-dark mt-2 text-2xl font-bold">
                {onboarding.title}
              </h2>
              <p className="mt-1 text-slate-600">{onboarding.summary}</p>
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
                </p>
              </div>
              {params.q && (
                <Link
                  href="/admin/ayuda"
                  className="text-brand-purple-dark font-semibold hover:underline"
                >
                  Limpiar búsqueda
                </Link>
              )}
            </div>

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
