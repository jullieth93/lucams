"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminRole } from "@lucams/db";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  ExternalLink,
  GraduationCap,
  Keyboard,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { CountUp } from "@/components/admin/count-up";
import { ADMIN_ASSIGNABLE_ROLES, adminRoleLabel } from "@/lib/admin-roles";
import { getProceduresForRole, normalizeHelpText } from "../step-builders";
import type {
  AdminDailyRoutine,
  AdminGlossaryEntry,
  AdminHelpProgress,
  AdminModuleGuide,
  AdminOnboardingGuide,
  AdminPlaybook,
  AdminQuickRule,
  AdminRoleMatrixRow,
  AdminShortcutEntry,
  HelpCenterTab,
} from "../types";
import { AdminInteractiveGuide } from "./interactive-guide";

function buildWorkspaceHref(opts: {
  tab?: HelpCenterTab;
  q?: string;
  area?: string;
  guia?: string;
  flujo?: string;
  rol?: string;
}): string {
  const sp = new URLSearchParams();
  if (opts.tab && opts.tab !== "modulos") sp.set("tab", opts.tab);
  if (opts.q?.trim()) sp.set("q", opts.q.trim());
  if (opts.area) sp.set("area", opts.area);
  if (opts.guia) sp.set("guia", opts.guia);
  if (opts.flujo) sp.set("flujo", opts.flujo);
  if (opts.rol) sp.set("rol", opts.rol);
  const qs = sp.toString();
  return qs ? `/admin/ayuda?${qs}` : "/admin/ayuda";
}

function findGuideMatchReason(
  guide: AdminModuleGuide,
  role: AdminRole,
  terms: string[],
): string | null {
  if (terms.length === 0) return null;
  const check = (text: string) => {
    const norm = normalizeHelpText(text);
    return terms.some((t) => norm.includes(t));
  };
  if (check(`${guide.title} ${guide.summary}`)) return "Título / Resumen";
  if ((guide.subroutes ?? []).some((s) => check(`${s.title} ${s.summary} ${s.pattern}`))) {
    return "Subpantalla cubierta";
  }
  if (
    getProceduresForRole(guide, role).some((p) =>
      check(`${p.title} ${p.goal} ${p.steps.join(" ")}`),
    )
  ) {
    return "Procedimiento paso a paso";
  }
  if (guide.dontTouch.some((d) => check(d))) return "Qué NO tocar";
  if (guide.faqs.some((f) => check(`${f.question} ${f.answer}`))) return "Pregunta frecuente";
  if (guide.concepts.some((c) => check(`${c.term} ${c.definition}`))) return "Concepto clave";
  return "Diccionario de campos";
}

export function HelpCenterWorkspace({
  actualRole,
  effectiveRole,
  initialTab,
  initialQuery,
  initialArea,
  autoStartOnboarding = false,
  onboarding,
  dailyRoutine,
  playbooks,
  guides,
  quickRules,
  roleMatrix,
  shortcuts,
  glossary,
  initialProgress,
}: {
  actualRole: AdminRole;
  effectiveRole: AdminRole;
  initialTab: HelpCenterTab;
  initialQuery: string;
  initialArea?: string;
  autoStartOnboarding?: boolean;
  onboarding: AdminOnboardingGuide;
  dailyRoutine: AdminDailyRoutine;
  playbooks: AdminPlaybook[];
  guides: AdminModuleGuide[];
  quickRules: AdminQuickRule[];
  roleMatrix: AdminRoleMatrixRow[];
  shortcuts: AdminShortcutEntry[];
  glossary: AdminGlossaryEntry[];
  initialProgress: AdminHelpProgress[];
}) {
  const router = useRouter();
  const isSuperadmin = actualRole === "SUPERADMIN";
  const isSimulatingRole = isSuperadmin && effectiveRole !== "SUPERADMIN";
  const roleParam = isSimulatingRole ? effectiveRole : undefined;

  const [activeTab, setActiveTab] = useState<HelpCenterTab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [activeArea, setActiveArea] = useState<string | undefined>(initialArea);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed">("all");
  const [progressList, setProgressList] = useState<AdminHelpProgress[]>(initialProgress);

  function upsertProgress(next: AdminHelpProgress) {
    setProgressList((prev) => {
      const idx = prev.findIndex((item) => item.guideId === next.guideId);
      if (idx === -1) return [...prev, next];
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }

  const completedIds = useMemo(
    () =>
      new Set(progressList.filter((item) => item.completedAt !== null).map((item) => item.guideId)),
    [progressList],
  );

  const completedModuleCount = guides.filter((g) => completedIds.has(g.id)).length;
  const completedPlaybookCount = playbooks.filter((p) => completedIds.has(p.id)).length;
  const totalTrackable = guides.length + playbooks.length;
  const totalCompleted = completedModuleCount + completedPlaybookCount;
  const completionPct =
    totalTrackable > 0 ? Math.round((totalCompleted / totalTrackable) * 100) : 0;

  const onboardingProgress = progressList.find((item) => item.guideId === onboarding.id) ?? null;

  const terms = useMemo(() => normalizeHelpText(query).split(/\s+/).filter(Boolean), [query]);

  const matchedGuides = useMemo(() => {
    if (terms.length === 0) return guides;
    return guides.filter((guide) => {
      const hay = normalizeHelpText(
        JSON.stringify({
          title: guide.title,
          area: guide.area,
          route: guide.route,
          summary: guide.summary,
          purpose: guide.purpose,
          whenToUse: guide.whenToUse,
          concepts: guide.concepts,
          sections: guide.sections,
          procedures: getProceduresForRole(guide, effectiveRole),
          cautions: guide.cautions,
          dontTouch: guide.dontTouch,
          subroutes: guide.subroutes,
          faqs: guide.faqs,
          keywords: guide.keywords,
        }),
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [effectiveRole, guides, terms]);

  const matchedPlaybooks = useMemo(() => {
    if (terms.length === 0) return playbooks;
    return playbooks.filter((pb) => {
      const hay = normalizeHelpText(
        JSON.stringify({
          title: pb.title,
          summary: pb.summary,
          trigger: pb.trigger,
          steps: pb.steps,
          edgeCases: pb.edgeCases,
          dontTouch: pb.dontTouch,
          keywords: pb.keywords,
        }),
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [playbooks, terms]);

  const matchedGlossary = useMemo(() => {
    if (terms.length === 0) return glossary;
    return glossary.filter((item) => {
      const hay = normalizeHelpText(`${item.term} ${item.definition}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [glossary, terms]);

  const matchedQuickRules = useMemo(() => {
    if (terms.length === 0) return quickRules;
    return quickRules.filter((rule) => {
      const hay = normalizeHelpText(`${rule.category} ${rule.label} ${rule.value} ${rule.detail}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [quickRules, terms]);

  const areas = useMemo(() => [...new Set(guides.map((g) => g.area))], [guides]);
  const filteredModuleCards = useMemo(() => {
    return matchedGuides.filter((guide) => {
      if (activeArea && guide.area !== activeArea) return false;
      const done = completedIds.has(guide.id);
      if (statusFilter === "completed" && !done) return false;
      if (statusFilter === "pending" && done) return false;
      return true;
    });
  }, [activeArea, completedIds, matchedGuides, statusFilter]);

  const recommendedPlaybooks = useMemo(() => {
    const byId = new Map(playbooks.map((p) => [p.id, p]));
    return dailyRoutine.recommendedPlaybookIds
      .map((id) => byId.get(id))
      .filter((item): item is AdminPlaybook => Boolean(item));
  }, [dailyRoutine.recommendedPlaybookIds, playbooks]);

  function selectTab(nextTab: HelpCenterTab) {
    setActiveTab(nextTab);
    if (query) setQuery("");
    const nextHref = buildWorkspaceHref({
      tab: nextTab,
      area: nextTab === "modulos" ? activeArea : undefined,
      rol: roleParam,
    });
    window.history.replaceState(null, "", nextHref);
  }

  return (
    <div className="space-y-6">
      {isSimulatingRole && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            <span>
              <strong>Modo vista previa por rol:</strong> estás inspeccionando exactamente lo que ve{" "}
              <strong>{adminRoleLabel(effectiveRole)}</strong> en capacitación y operación diaria.
            </span>
          </div>
          <Link
            href={buildWorkspaceHref({ tab: activeTab, q: query })}
            className="text-brand-purple-dark inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold hover:bg-amber-100/40"
          >
            Volver a mi vista (Administradora)
          </Link>
        </div>
      )}

      <header className="bg-brand-purple-dark overflow-hidden rounded-2xl p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
              Rol activo: {adminRoleLabel(effectiveRole)}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              <CountUp value={guides.length} /> módulos · {playbooks.length} flujos E2E
            </span>
          </div>

          {isSuperadmin && (
            <div className="flex items-center gap-2">
              <label htmlFor="help-role-preview" className="text-xs font-semibold text-slate-200">
                Ver ayuda como rol:
              </label>
              <select
                id="help-role-preview"
                value={effectiveRole}
                onChange={(event) => {
                  const nextRole = event.target.value;
                  const nextRolParam = nextRole === "SUPERADMIN" ? undefined : nextRole;
                  router.push(
                    buildWorkspaceHref({
                      tab: activeTab,
                      q: query,
                      rol: nextRolParam,
                    }),
                  );
                }}
                className="min-h-11 rounded-xl border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white outline-none focus:border-white"
              >
                {ADMIN_ASSIGNABLE_ROLES.map((candidate) => (
                  <option key={candidate} value={candidate} className="text-slate-900">
                    {adminRoleLabel(candidate)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <h1 className="font-display mt-3 text-3xl font-bold">Centro de ayuda operativo</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-100 sm:text-base">
          Tu manual práctico en vivo para operar Lucams Shop: rutina diaria paso a paso, flujos
          transversales E2E, reglas de negocio, plazos legales y qué no tocar según tus permisos.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <form
            action="/admin/ayuda"
            className="flex max-w-2xl flex-col gap-2 sm:flex-row"
            role="search"
          >
            {activeTab !== "modulos" && <input type="hidden" name="tab" value={activeTab} />}
            {activeArea && <input type="hidden" name="area" value={activeArea} />}
            {roleParam && <input type="hidden" name="rol" value={roleParam} />}
            <label htmlFor="help-search" className="sr-only">
              Buscar en las guías
            </label>
            <div className="relative flex-1">
              <Search
                className="absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
              <input
                id="help-search"
                name="q"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Busca módulo, subruta, Bre-B, 300 DPI, retracto, UVT, remesa…"
                className="min-h-12 w-full rounded-xl border border-white/20 bg-white pr-10 pl-11 text-sm text-slate-900 outline-none placeholder:text-slate-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    window.history.replaceState(
                      null,
                      "",
                      buildWorkspaceHref({ tab: activeTab, area: activeArea, rol: roleParam }),
                    );
                  }}
                  aria-label="Limpiar búsqueda"
                  className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="text-brand-purple-dark min-h-12 rounded-xl bg-white px-5 text-sm font-bold hover:bg-slate-100"
            >
              Buscar
            </button>
          </form>

          {!isSimulatingRole && (
            <div className="rounded-xl bg-white/10 px-4 py-3 text-xs text-white sm:min-w-64">
              <div className="flex items-center justify-between gap-2">
                <span>Checklists dominados</span>
                <strong className="tabular-nums">
                  {totalCompleted} / {totalTrackable} ({completionPct} %)
                </strong>
              </div>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20"
                role="progressbar"
                aria-label={`Progreso total en Centro de ayuda: ${completionPct}%`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completionPct}
              >
                <div
                  className="bg-brand-turquoise h-full rounded-full transition-all"
                  style={{ width: `${Math.max(completionPct, totalCompleted > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Navegación de los 4 pilares operativos */}
      <nav
        aria-label="Secciones del Centro de ayuda"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs lg:grid-cols-4"
      >
        {(
          [
            {
              id: "dia-1",
              label: "1. Día 1 y Rutina Diaria",
              badge: onboardingProgress?.completedAt
                ? "Listo"
                : `${dailyRoutine.blocks.length} bloques`,
              icon: GraduationCap,
            },
            {
              id: "flujos",
              label: "2. Flujos E2E",
              badge: `${matchedPlaybooks.length}`,
              icon: Workflow,
            },
            {
              id: "modulos",
              label: "3. Manuales por Módulo",
              badge: `${matchedGuides.length}`,
              icon: BookOpen,
            },
            {
              id: "referencia",
              label: "4. Glosario, Reglas y Atajos",
              badge: `${matchedQuickRules.length + matchedGlossary.length}`,
              icon: Scale,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-current={selected ? "page" : undefined}
              className={`flex min-h-12 items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-xs font-bold transition-colors sm:text-sm ${
                selected
                  ? "bg-brand-purple-dark text-white shadow-xs"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{tab.label}</span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                  selected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {tab.badge}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Panel transversal de búsqueda instantánea cuando hay términos escritos */}
      {terms.length > 0 && (
        <section
          aria-labelledby="instant-search-heading"
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2
                id="instant-search-heading"
                className="font-display text-brand-purple-dark text-xl font-bold"
              >
                Resultados para «{query.trim()}»
              </h2>
              <p className="text-xs text-slate-600">
                {matchedPlaybooks.length} flujos E2E · {matchedGuides.length} módulos ·{" "}
                {matchedQuickRules.length} reglas rápidas · {matchedGlossary.length} términos del
                glosario
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-brand-purple-dark min-h-11 text-xs font-bold hover:underline"
            >
              Limpiar búsqueda
            </button>
          </div>

          {matchedPlaybooks.length === 0 &&
          matchedGuides.length === 0 &&
          matchedQuickRules.length === 0 &&
          matchedGlossary.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-brand-purple-dark font-bold">
                No encontramos coincidencias para «{query.trim()}» en los módulos de tu rol
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Prueba con palabras clave como pedido, guía, Bre-B, retracto, garantía, BOM, UVT o
                mediante una sola palabra.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {matchedPlaybooks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                    Flujos E2E coincidentes
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {matchedPlaybooks.map((pb) => (
                      <Link
                        key={pb.id}
                        href={buildWorkspaceHref({ flujo: pb.id, rol: roleParam })}
                        className="hover:border-brand-purple flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition-colors"
                      >
                        <div>
                          <span className="text-brand-purple-dark text-[11px] font-bold uppercase">
                            Flujo E2E · {pb.area}
                          </span>
                          <h4 className="text-brand-purple-dark mt-1 font-bold">{pb.title}</h4>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{pb.summary}</p>
                        </div>
                        <span className="text-brand-purple-dark mt-3 inline-flex items-center gap-1 text-xs font-semibold">
                          Abrir flujo paso a paso <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {matchedGuides.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                    Módulos coincidentes
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {matchedGuides.map((guide) => {
                      const matchReason = findGuideMatchReason(guide, effectiveRole, terms);
                      return (
                        <Link
                          key={guide.id}
                          href={buildWorkspaceHref({ guia: guide.id, rol: roleParam })}
                          className="hover:border-brand-purple flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition-colors"
                        >
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="text-brand-purple-dark text-[11px] font-bold uppercase">
                                {guide.area}
                              </span>
                              {matchReason && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                  {matchReason}
                                </span>
                              )}
                            </div>
                            <h4 className="font-display text-brand-purple-dark mt-2 text-lg font-bold">
                              {guide.title}
                            </h4>
                            <p className="mt-1 text-xs leading-5 text-slate-600">{guide.summary}</p>
                          </div>
                          <span className="text-brand-purple-dark mt-3 inline-flex items-center gap-1 text-xs font-semibold">
                            Leer manual completo <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {(matchedQuickRules.length > 0 || matchedGlossary.length > 0) && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold tracking-wider text-slate-600 uppercase">
                    Reglas rápidas y glosario
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {matchedQuickRules.slice(0, 4).map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700">{rule.label}</span>
                          <strong className="text-brand-purple-dark text-xs">{rule.value}</strong>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{rule.detail}</p>
                      </div>
                    ))}
                    {matchedGlossary.slice(0, 4).map((entry) => (
                      <div
                        key={entry.term}
                        className="rounded-xl border border-slate-200 bg-white p-3.5"
                      >
                        <p className="text-brand-purple-dark text-xs font-bold">{entry.term}</p>
                        <p className="mt-1 text-xs text-slate-600">{entry.definition}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA 1: DÍA 1 Y RUTINA DIARIA */}
      {terms.length === 0 && activeTab === "dia-1" && (
        <div className="space-y-6">
          <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-brand-purple-dark flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase">
                  <GraduationCap className="h-4 w-4" aria-hidden /> Misión de tu rol
                </span>
                {onboardingProgress?.completedAt && !isSimulatingRole && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Inducción Día 1 completada
                  </span>
                )}
              </div>
              <h2 className="font-display text-brand-purple-dark text-2xl font-bold">
                {onboarding.title}
              </h2>
              <p className="text-sm leading-6 text-slate-700">{dailyRoutine.mission}</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-5 text-slate-700">
                <strong className="text-brand-purple-dark flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden /> Alcance de privacidad
                  (Ley 1581) y confidencialidad:
                </strong>
                <p className="mt-1">{dailyRoutine.privacyScope}</p>
              </div>
            </div>

            <div>
              {!isSimulatingRole ? (
                <AdminInteractiveGuide
                  guide={onboarding}
                  role={effectiveRole}
                  initialProgress={onboardingProgress}
                  onProgressChange={upsertProgress}
                  autoStart={autoStartOnboarding}
                />
              ) : (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-brand-purple-dark text-sm font-bold">
                    Pasos del checklist Día 1 ({onboarding.steps.length})
                  </h3>
                  <ol className="space-y-2 text-xs text-slate-700">
                    {onboarding.steps.map((s) => (
                      <li key={s.id} className="rounded-lg bg-white p-2.5">
                        <strong className="text-brand-purple-dark block">{s.title}</strong>
                        <span className="mt-0.5 block text-slate-600">{s.body}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="daily-order-heading" className="space-y-4">
            <div>
              <h2
                id="daily-order-heading"
                className="font-display text-brand-purple-dark text-2xl font-bold"
              >
                Orden diario de operación recomendado
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Sigue esta secuencia cada jornada para proteger SLAs legales, horas de corte y
                trazabilidad.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {dailyRoutine.blocks.map((block) => (
                <div
                  key={block.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
                >
                  <p className="text-brand-purple-dark text-xs font-bold tracking-wider uppercase">
                    {block.windowLabel}
                  </p>
                  <h3 className="font-display text-brand-purple-dark mt-1 text-lg font-bold">
                    {block.title}
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {block.items.map((item) => (
                      <li
                        key={item.label}
                        className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                          <Link
                            href={item.route}
                            className="text-brand-purple-dark inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                          >
                            Abrir <ExternalLink className="h-3 w-3" aria-hidden />
                          </Link>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section
              aria-labelledby="role-dont-touch"
              className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950"
            >
              <h3 id="role-dont-touch" className="flex items-center gap-2 text-base font-bold">
                <ShieldAlert className="h-5 w-5 shrink-0 text-rose-700" aria-hidden /> Qué NO tocar
                jamás en tu rol
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
                {dailyRoutine.dontTouch.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section
              aria-labelledby="role-escalate"
              className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"
            >
              <h3 id="role-escalate" className="flex items-center gap-2 text-base font-bold">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden /> Cuándo
                detenerte y escalar (siempre con número LCM o ID)
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
                {dailyRoutine.escalateWhen.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>

          {recommendedPlaybooks.length > 0 && (
            <section aria-labelledby="role-playbooks" className="space-y-3">
              <h2
                id="role-playbooks"
                className="font-display text-brand-purple-dark text-xl font-bold"
              >
                Flujos E2E esenciales para tu rol
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {recommendedPlaybooks.map((pb) => (
                  <Link
                    key={pb.id}
                    href={buildWorkspaceHref({ flujo: pb.id, rol: roleParam })}
                    className="hover:border-brand-purple flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-colors"
                  >
                    <div>
                      <p className="text-brand-purple-dark font-bold">{pb.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{pb.summary}</p>
                    </div>
                    <ArrowRight className="text-brand-purple-dark h-5 w-5 shrink-0" aria-hidden />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* PESTAÑA 2: FLUJOS E2E (PLAYBOOKS) */}
      {terms.length === 0 && activeTab === "flujos" && (
        <section aria-labelledby="playbooks-heading" className="space-y-4">
          <div>
            <h2
              id="playbooks-heading"
              className="font-display text-brand-purple-dark text-2xl font-bold"
            >
              Flujos transversales de punta a punta (Playbooks E2E)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Recorridos reales que conectan múltiples módulos, compuertas MFA, SLAs legales y casos
              borde.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {matchedPlaybooks.map((playbook) => {
              const isDone = completedIds.has(playbook.id);
              const myStepsCount = playbook.steps.filter((s) =>
                s.ownerRoles.includes(effectiveRole),
              ).length;
              return (
                <Link
                  key={playbook.id}
                  href={buildWorkspaceHref({ flujo: playbook.id, rol: roleParam })}
                  className="hover:border-brand-purple flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-colors"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-brand-purple-dark text-xs font-bold tracking-wider uppercase">
                        {playbook.area}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          <Clock className="h-3 w-3" aria-hidden /> {playbook.steps.length} etapas
                        </span>
                        {isDone && !isSimulatingRole && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            Completado
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-display text-brand-purple-dark mt-3 text-xl font-bold">
                      {playbook.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{playbook.summary}</p>
                    <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                      <strong className="text-brand-purple-dark">Cuándo usarlo:</strong>{" "}
                      {playbook.trigger}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span className="font-medium text-slate-600">
                      Tu rol interviene en {myStepsCount} de {playbook.steps.length} tramos
                    </span>
                    <span className="text-brand-purple-dark inline-flex items-center gap-1 font-bold">
                      Abrir playbook <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* PESTAÑA 3: MANUALES POR MÓDULO */}
      {terms.length === 0 && activeTab === "modulos" && (
        <section aria-labelledby="help-results" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="help-results"
                className="font-display text-brand-purple-dark text-2xl font-bold"
              >
                Manuales operativos por módulo y subruta
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {filteredModuleCards.length}{" "}
                {filteredModuleCards.length === 1 ? "guía disponible" : "guías disponibles"}
                {activeArea ? ` en ${activeArea}` : ""}
              </p>
            </div>

            {!isSimulatingRole && (
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                {(
                  [
                    { id: "all", label: "Todas" },
                    { id: "pending", label: "Por practicar" },
                    { id: "completed", label: "Completadas" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStatusFilter(item.id)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${
                      statusFilter === item.id
                        ? "bg-brand-purple-dark text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {areas.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtrar por área">
              <button
                type="button"
                onClick={() => setActiveArea(undefined)}
                className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  !activeArea
                    ? "bg-brand-purple-dark text-white shadow-2xs"
                    : "text-brand-purple-dark hover:bg-brand-purple/10 border border-slate-200 bg-white"
                }`}
              >
                Todas ({matchedGuides.length})
              </button>
              {areas.map((area) => {
                const count = matchedGuides.filter((g) => g.area === area).length;
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setActiveArea(area)}
                    className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      activeArea === area
                        ? "bg-brand-purple-dark text-white shadow-2xs"
                        : "text-brand-purple-dark hover:bg-brand-purple/10 border border-slate-200 bg-white"
                    }`}
                  >
                    {area} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {filteredModuleCards.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredModuleCards.map((guide) => {
                const isDone = completedIds.has(guide.id);
                const subCount = guide.subroutes?.length ?? 0;
                return (
                  <Link
                    key={guide.id}
                    href={buildWorkspaceHref({ guia: guide.id, rol: roleParam })}
                    className="hover:border-brand-purple group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-brand-purple-dark text-xs font-bold tracking-wider uppercase">
                        {guide.area}
                      </span>
                      {isDone && !isSimulatingRole && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Completada
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-brand-purple-dark mt-2.5 text-xl font-bold">
                      {guide.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <code className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                        {guide.route}
                      </code>
                      {subCount > 0 && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          +{subCount} {subCount === 1 ? "subpantalla" : "subpantallas"}
                        </span>
                      )}
                    </div>

                    <p className="mt-2.5 flex-1 text-sm leading-6 text-slate-600">
                      {guide.summary}
                    </p>
                    <span className="text-brand-purple-dark mt-4 inline-flex items-center gap-2 text-sm font-semibold">
                      <BookOpen className="h-4 w-4" aria-hidden /> Leer guía completa
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
              <h3 className="text-brand-purple-dark mt-3 font-bold">
                No hay guías que coincidan con estos filtros
              </h3>
              <button
                type="button"
                onClick={() => {
                  setActiveArea(undefined);
                  setStatusFilter("all");
                  setQuery("");
                }}
                className="text-brand-purple-dark mt-2 min-h-11 text-sm font-bold hover:underline"
              >
                Restablecer filtros
              </button>
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA 4: REFERENCIA RÁPIDA (REGLAS, MATRIZ DE ROLES, ATAJOS Y GLOSARIO) */}
      {terms.length === 0 && activeTab === "referencia" && (
        <div className="space-y-8">
          <section aria-labelledby="quick-rules-heading" className="space-y-4">
            <div>
              <h2
                id="quick-rules-heading"
                className="font-display text-brand-purple-dark text-2xl font-bold"
              >
                SLAs legales, topes numéricos y compuertas de seguridad
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Valores conectados en vivo a las constantes del código para consulta rápida.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {matchedQuickRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                        {rule.category}
                      </span>
                      <span className="bg-brand-purple-dark rounded-full px-3 py-0.5 text-xs font-bold text-white">
                        {rule.value}
                      </span>
                    </div>
                    <h3 className="text-brand-purple-dark mt-2 font-bold">{rule.label}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{rule.detail}</p>
                  </div>
                  <Link
                    href={rule.route}
                    className="text-brand-purple-dark mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-semibold hover:underline"
                  >
                    Abrir {rule.route} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="shortcuts-heading" className="space-y-3">
            <h2
              id="shortcuts-heading"
              className="font-display text-brand-purple-dark flex items-center gap-2 text-xl font-bold"
            >
              <Keyboard className="h-5 w-5" aria-hidden /> Atajos de teclado en el panel
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {shortcut.keys.map((k) => (
                      <kbd
                        key={k}
                        className="text-brand-purple-dark rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-sans text-xs font-bold"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                  <h3 className="text-brand-purple-dark mt-2 text-sm font-bold">
                    {shortcut.label}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{shortcut.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="role-matrix-heading" className="space-y-3">
            <h2
              id="role-matrix-heading"
              className="font-display text-brand-purple-dark text-xl font-bold"
            >
              Matriz de segregación, privacidad PII y escalamiento por rol
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[680px] text-left text-xs leading-5">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 font-bold">Rol</th>
                    <th className="px-4 py-3 font-bold">Datos personales (Ley 1581)</th>
                    <th className="px-4 py-3 font-bold">Visibilidad COP</th>
                    <th className="px-4 py-3 font-bold">Ámbito y qué escala</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roleMatrix.map((row) => {
                    const isCurrent = row.role === effectiveRole;
                    return (
                      <tr
                        key={row.role}
                        className={isCurrent ? "bg-brand-purple/5 font-medium" : undefined}
                      >
                        <td className="text-brand-purple-dark px-4 py-3 font-bold">
                          {row.roleLabel}
                          {isCurrent && (
                            <span className="bg-brand-purple-dark mt-1 block w-fit rounded-full px-2 py-0.5 text-[10px] text-white">
                              Rol actual
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.piiAccess}</td>
                        <td className="px-4 py-3 text-slate-700">{row.financialVisibility}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <p>{row.primaryScope}</p>
                          <p className="mt-1 text-slate-500">
                            <strong>Escala:</strong> {row.escalatesToSuperadmin}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="glossary-heading" className="space-y-3">
            <div>
              <h2
                id="glossary-heading"
                className="font-display text-brand-purple-dark text-xl font-bold"
              >
                Glosario operativo A–Z ({matchedGlossary.length})
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Conceptos clave del negocio y la plataforma disponibles para tus permisos.
              </p>
            </div>
            <dl className="grid gap-3 md:grid-cols-2">
              {matchedGlossary.map((entry) => (
                <div
                  key={entry.term}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"
                >
                  <dt className="text-brand-purple-dark font-bold">{entry.term}</dt>
                  <dd className="mt-1 text-sm leading-6 text-slate-600">{entry.definition}</dd>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {entry.sources.map((src) => (
                      <Link
                        key={src.guideId}
                        href={buildWorkspaceHref({ guia: src.guideId, rol: roleParam })}
                        className="text-brand-purple-dark rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold hover:bg-slate-100"
                      >
                        {src.guideTitle}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
