import type { ReactNode } from "react";
import Link from "next/link";
import type { AdminRole } from "@lucams/db";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  ExternalLink,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { getProceduresForRole } from "../step-builders";
import type { AdminModuleGuide, AdminSubrouteFocus } from "../types";
import { AdminHelpFeedback } from "./help-feedback";

function buildHelpHref(params: { guia?: string; flujo?: string; rol?: string }): string {
  const sp = new URLSearchParams();
  if (params.guia) sp.set("guia", params.guia);
  if (params.flujo) sp.set("flujo", params.flujo);
  if (params.rol) sp.set("rol", params.rol);
  const qs = sp.toString();
  return qs ? `/admin/ayuda?${qs}` : "/admin/ayuda";
}

export function AdminGuideView({
  guide,
  role,
  activeSubroute = null,
  relatedGuides = [],
  relatedPlaybooks = [],
  roleQueryParam,
  interactive,
  initialFeedback = null,
  onNavigate,
}: {
  guide: AdminModuleGuide;
  role: AdminRole;
  activeSubroute?: AdminSubrouteFocus | null;
  relatedGuides?: { id: string; title: string }[];
  relatedPlaybooks?: { id: string; title: string }[];
  roleQueryParam?: string;
  interactive?: ReactNode;
  initialFeedback?: { isHelpful: boolean; comment: string | null } | null;
  onNavigate?: () => void;
}) {
  const procedures = getProceduresForRole(guide, role);
  const canOpenModule = guide.route !== "/admin/ayuda" && canAccessAdminPath(role, guide.route);
  const highlightedSections = new Set(activeSubroute?.highlightSectionIds ?? []);
  const highlightedProcedures = new Set(activeSubroute?.highlightProcedureIds ?? []);

  return (
    <article className="space-y-8 text-sm leading-6 text-slate-700">
      {activeSubroute && (
        <section
          aria-label={`Contexto de subruta: ${activeSubroute.title}`}
          className="border-brand-purple/30 bg-brand-purple/5 rounded-2xl border p-4 sm:p-5"
        >
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
            <Compass className="text-brand-purple-dark h-4 w-4 shrink-0" aria-hidden />
            <span className="text-brand-purple-dark">En esta pantalla exacta</span>
          </div>
          <h3 className="font-display text-brand-purple-dark mt-1.5 text-lg font-bold">
            {activeSubroute.title}
          </h3>
          <p className="mt-1 text-slate-700">{activeSubroute.summary}</p>
          {activeSubroute.tips.length > 0 && (
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-5 text-slate-700 sm:text-sm">
              {activeSubroute.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-brand-purple-dark text-xs font-bold tracking-wider uppercase">
              {guide.area}
            </span>
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {guide.route}
            </code>
          </div>
          {canOpenModule && (
            <Link
              href={guide.route}
              onClick={onNavigate}
              className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex min-h-11 items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2 text-xs font-semibold transition-colors"
            >
              Ir al módulo <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>
        <div>
          <h2 className="font-display text-brand-purple-dark text-2xl font-bold">{guide.title}</h2>
          <p className="mt-2 text-base text-slate-600">{guide.summary}</p>
        </div>
        {interactive}
      </header>

      <section aria-labelledby={`purpose-${guide.id}`} className="space-y-3">
        <h3 id={`purpose-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
          Propósito operativo
        </h3>
        <p>{guide.purpose}</p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-brand-purple-dark font-semibold">Cuándo abrir este módulo</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {guide.whenToUse.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      {guide.dontTouch.length > 0 && (
        <section
          aria-labelledby={`dont-touch-${guide.id}`}
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950 sm:p-5"
        >
          <h3 id={`dont-touch-${guide.id}`} className="flex items-center gap-2 text-base font-bold">
            <ShieldAlert className="h-5 w-5 shrink-0 text-rose-700" aria-hidden /> Qué NO tocar y
            errores críticos a evitar
          </h3>
          <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm">
            {guide.dontTouch.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {procedures.length > 0 && (
        <section aria-labelledby={`procedures-${guide.id}`} className="space-y-4">
          <h3 id={`procedures-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
            Procedimientos paso a paso
          </h3>
          {procedures.map((procedure) => {
            const isHighlighted = highlightedProcedures.has(procedure.id);
            const procRoute = procedure.route ?? guide.route;
            const canOpenProcRoute =
              procRoute !== "/admin/ayuda" && canAccessAdminPath(role, procRoute);
            return (
              <div
                key={procedure.id}
                className={`rounded-xl border p-4 sm:p-5 ${
                  isHighlighted
                    ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-brand-purple-dark font-bold">{procedure.title}</h4>
                      {isHighlighted && (
                        <span className="bg-brand-purple-dark rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white">
                          Clave en esta pantalla
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-slate-600">{procedure.goal}</p>
                  </div>
                  {canOpenProcRoute && (
                    <Link
                      href={procRoute}
                      onClick={onNavigate}
                      className="text-brand-purple-dark inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    >
                      Abrir pantalla <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
                <ol className="mt-3 space-y-2.5">
                  {procedure.steps.map((step, index) => (
                    <li key={step} className="flex gap-2.5">
                      <span className="bg-brand-purple-dark flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 flex gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-950">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                  <span>
                    <strong>Resultado esperado:</strong> {procedure.expected}
                  </span>
                </p>
                {procedure.exceptions && procedure.exceptions.length > 0 && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <strong className="text-brand-purple-dark">Excepciones y bloqueos</strong>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {procedure.exceptions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section aria-labelledby={`sections-${guide.id}`} className="space-y-4">
        <h3 id={`sections-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
          Recorrido por la pantalla y diccionario de datos
        </h3>
        {guide.sections.map((section) => {
          const isHighlighted = highlightedSections.has(section.id);
          return (
            <div
              key={section.id}
              className={`overflow-hidden rounded-xl border ${
                isHighlighted ? "border-brand-purple" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3">
                <div>
                  <h4 className="text-brand-purple-dark font-semibold">{section.title}</h4>
                  <p className="mt-0.5 text-xs text-slate-600">{section.summary}</p>
                </div>
                {isHighlighted && (
                  <span className="bg-brand-purple-dark rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    Sección activa
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {section.topics.map((topic) => (
                  <details
                    key={topic.id}
                    open={isHighlighted || undefined}
                    className="group px-4 py-3"
                    data-admin-help-topic={`${guide.id}.${topic.id}`}
                  >
                    <summary className="marker:text-brand-purple cursor-pointer font-semibold text-slate-800">
                      {topic.label}
                    </summary>
                    <div className="mt-2 space-y-2 pl-1 text-sm">
                      <p>{topic.description}</p>
                      {topic.interpretation && (
                        <p>
                          <strong className="text-brand-purple-dark">Cómo interpretarlo:</strong>{" "}
                          {topic.interpretation}
                        </p>
                      )}
                      {topic.caution && (
                        <p className="rounded-lg bg-amber-50 p-2.5 text-amber-950">
                          <strong>Ten en cuenta:</strong> {topic.caution}
                        </p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby={`concepts-${guide.id}`}>
        <h3 id={`concepts-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
          Conceptos clave
        </h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {guide.concepts.map((concept) => (
            <div key={concept.term} className="rounded-xl border border-slate-200 p-4">
              <dt className="text-brand-purple-dark font-semibold">{concept.term}</dt>
              <dd className="mt-1 text-slate-600">{concept.definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      {guide.cautions.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <h3 className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden /> Precauciones operativas
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {guide.cautions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {(() => {
        const otherSubroutes = (guide.subroutes ?? []).filter(
          (sub) => sub.id !== activeSubroute?.id,
        );
        if (otherSubroutes.length === 0) return null;
        return (
          <section aria-labelledby={`subroutes-${guide.id}`} className="space-y-3">
            <h3 id={`subroutes-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
              {activeSubroute
                ? "Otras subpantallas cubiertas en este módulo"
                : "Subpantallas y vistas de detalle cubiertas"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {otherSubroutes.map((sub) => (
                <div key={sub.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <code className="text-xs font-semibold text-slate-600">{sub.pattern}</code>
                  <h4 className="text-brand-purple-dark mt-1 font-semibold">{sub.title}</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{sub.summary}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      <section aria-labelledby={`faq-${guide.id}`}>
        <h3 id={`faq-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
          Preguntas frecuentes y casos borde
        </h3>
        <div className="mt-3 space-y-2">
          {guide.faqs.map((faq) => (
            <details key={faq.question} className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer font-semibold text-slate-800">
                {faq.question}
              </summary>
              <p className="mt-2">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {(relatedPlaybooks.length > 0 || relatedGuides.length > 0) && (
        <nav
          aria-label="Flujos y guías relacionadas"
          className="space-y-4 rounded-xl bg-slate-50 p-4"
        >
          {relatedPlaybooks.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <Workflow className="h-4 w-4 shrink-0" aria-hidden /> Flujos E2E donde interviene
                este módulo
              </h3>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {relatedPlaybooks.map((item) => (
                  <Link
                    key={item.id}
                    href={buildHelpHref({ flujo: item.id, rol: roleQueryParam })}
                    onClick={onNavigate}
                    className="hover:border-brand-purple flex min-h-11 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 font-medium text-slate-800"
                  >
                    <span className="line-clamp-2 text-xs sm:text-sm">{item.title}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {relatedGuides.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <BookOpen className="h-4 w-4 shrink-0" aria-hidden /> Módulos conectados
              </h3>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {relatedGuides.map((item) => (
                  <Link
                    key={item.id}
                    href={buildHelpHref({ guia: item.id, rol: roleQueryParam })}
                    onClick={onNavigate}
                    className="hover:border-brand-purple flex min-h-11 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 font-medium text-slate-800"
                  >
                    <span>{item.title}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
      )}

      <AdminHelpFeedback guideId={guide.id} initialFeedback={initialFeedback} />
    </article>
  );
}
