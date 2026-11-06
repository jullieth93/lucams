import type { ReactNode } from "react";
import Link from "next/link";
import type { AdminRole } from "@lucams/db";
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";
import { getModuleGuideById, getProceduresForRole } from "../registry";
import type { AdminModuleGuide } from "../types";
import { AdminHelpFeedback } from "./help-feedback";

export function AdminGuideView({
  guide,
  role,
  interactive,
}: {
  guide: AdminModuleGuide;
  role: AdminRole;
  interactive?: ReactNode;
}) {
  const procedures = getProceduresForRole(guide, role);
  const related = guide.related
    .map((id) => getModuleGuideById(id, role))
    .filter((item) => item !== null);

  return (
    <article className="space-y-8 text-sm leading-6 text-slate-700">
      <header className="space-y-3">
        <p className="text-brand-purple text-xs font-bold tracking-wider uppercase">{guide.area}</p>
        <div>
          <h2 className="font-display text-brand-purple-dark text-2xl font-bold">{guide.title}</h2>
          <p className="mt-2 text-base text-slate-600">{guide.summary}</p>
        </div>
        {interactive}
      </header>

      <section aria-labelledby={`purpose-${guide.id}`} className="space-y-3">
        <h3 id={`purpose-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
          Propósito del módulo
        </h3>
        <p>{guide.purpose}</p>
        <div className="bg-brand-purple/5 rounded-xl p-4">
          <h4 className="text-brand-purple-dark font-semibold">Cuándo utilizarlo</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {guide.whenToUse.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby={`concepts-${guide.id}`}>
        <h3 id={`concepts-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
          Conceptos necesarios
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

      <section aria-labelledby={`sections-${guide.id}`} className="space-y-4">
        <h3 id={`sections-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
          Recorrido por la pantalla y diccionario de datos
        </h3>
        {guide.sections.map((section) => (
          <div key={section.id} className="overflow-hidden rounded-xl border border-slate-200">
            <div className="bg-slate-50 px-4 py-3">
              <h4 className="text-brand-purple-dark font-semibold">{section.title}</h4>
              <p className="mt-1 text-xs text-slate-600">{section.summary}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {section.topics.map((topic) => (
                <details
                  key={topic.id}
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
                      <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
                        <strong>Ten en cuenta:</strong> {topic.caution}
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby={`procedures-${guide.id}`} className="space-y-4">
        <h3 id={`procedures-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
          Procedimientos paso a paso
        </h3>
        {procedures.map((procedure) => (
          <div key={procedure.id} className="rounded-xl border border-slate-200 p-4">
            <h4 className="text-brand-purple-dark font-semibold">{procedure.title}</h4>
            <p className="mt-1 text-slate-600">{procedure.goal}</p>
            <ol className="mt-3 space-y-2">
              {procedure.steps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="bg-brand-purple/10 text-brand-purple-dark flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <strong>Resultado esperado:</strong> {procedure.expected}
              </span>
            </p>
            {procedure.exceptions && procedure.exceptions.length > 0 && (
              <div className="mt-3">
                <strong className="text-brand-purple-dark">Excepciones</strong>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {procedure.exceptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <h3 className="flex items-center gap-2 font-bold">
          <AlertTriangle className="h-5 w-5" aria-hidden /> Precauciones
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {guide.cautions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`faq-${guide.id}`}>
        <h3 id={`faq-${guide.id}`} className="text-brand-purple-dark text-lg font-bold">
          Preguntas frecuentes y casos especiales
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

      {related.length > 0 && (
        <nav aria-label="Guías relacionadas" className="rounded-xl bg-slate-50 p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800">
            <BookOpen className="h-4 w-4" aria-hidden /> Continúa aprendiendo
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {related.map((item) => (
              <Link
                key={item.id}
                href={`/admin/ayuda?guia=${item.id}`}
                className="hover:border-brand-purple flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 font-medium text-slate-700"
              >
                {item.title}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ))}
          </div>
        </nav>
      )}

      <AdminHelpFeedback guideId={guide.id} />
    </article>
  );
}
