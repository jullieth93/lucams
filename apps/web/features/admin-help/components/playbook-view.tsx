import type { ReactNode } from "react";
import Link from "next/link";
import type { AdminRole } from "@lucams/db";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { adminRoleLabel } from "@/lib/admin-roles";
import type { AdminPlaybook } from "../types";
import { AdminHelpFeedback } from "./help-feedback";

export function AdminPlaybookView({
  playbook,
  role,
  relatedGuides = [],
  roleQueryParam,
  interactive,
  initialFeedback = null,
}: {
  playbook: AdminPlaybook;
  role: AdminRole;
  relatedGuides?: { id: string; title: string }[];
  roleQueryParam?: string;
  interactive?: ReactNode;
  initialFeedback?: { isHelpful: boolean; comment: string | null } | null;
}) {
  return (
    <article className="space-y-8 text-sm leading-6 text-slate-700">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-brand-purple-dark text-xs font-bold tracking-wider uppercase">
            Flujo E2E · {playbook.area}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {playbook.durationHint}
          </span>
        </div>
        <div>
          <h2 className="font-display text-brand-purple-dark text-2xl font-bold">
            {playbook.title}
          </h2>
          <p className="mt-2 text-base text-slate-600">{playbook.summary}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold tracking-wider text-slate-600 uppercase">
            Disparador del flujo
          </p>
          <p className="mt-1 font-medium text-slate-800">{playbook.trigger}</p>
        </div>

        {interactive}
      </header>

      <section aria-labelledby={`steps-${playbook.id}`} className="space-y-4">
        <h3 id={`steps-${playbook.id}`} className="text-brand-purple-dark text-lg font-bold">
          Secuencia operativa de punta a punta
        </h3>
        <ol className="space-y-4">
          {playbook.steps.map((step, index) => {
            const roleParticipates = step.ownerRoles.includes(role);
            const canOpenRoute = canAccessAdminPath(role, step.route);
            return (
              <li
                key={step.id}
                className={`rounded-2xl border p-4 sm:p-5 ${
                  roleParticipates
                    ? "border-brand-purple/40 bg-white shadow-xs"
                    : "border-slate-200 bg-slate-50/70"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                        roleParticipates ? "bg-brand-purple-dark" : "bg-slate-600"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-brand-purple-dark text-base font-bold">{step.title}</h4>
                        {roleParticipates ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            Tu rol ejecuta este tramo
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            Tramo de: {step.ownerRoles.map((r) => adminRoleLabel(r)).join(" / ")}
                          </span>
                        )}
                        {step.gateBadge && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-950">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {step.gateBadge}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-slate-700">{step.action}</p>
                    </div>
                  </div>

                  {canOpenRoute && (
                    <Link
                      href={step.route}
                      className="text-brand-purple-dark inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    >
                      Abrir {step.moduleLabel} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </div>

                <p className="mt-3 flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-950 sm:text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                  <span>
                    <strong>Punto de control:</strong> {step.verification}
                  </span>
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      {playbook.dontTouch.length > 0 && (
        <section
          aria-labelledby={`playbook-dont-touch-${playbook.id}`}
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950 sm:p-5"
        >
          <h3
            id={`playbook-dont-touch-${playbook.id}`}
            className="flex items-center gap-2 text-base font-bold"
          >
            <ShieldAlert className="h-5 w-5 shrink-0 text-rose-700" aria-hidden /> Qué NO tocar en
            este flujo
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            {playbook.dontTouch.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {playbook.edgeCases.length > 0 && (
        <section aria-labelledby={`edge-cases-${playbook.id}`} className="space-y-3">
          <h3
            id={`edge-cases-${playbook.id}`}
            className="text-brand-purple-dark flex items-center gap-2 text-lg font-bold"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden /> Casos borde
            frecuentes y cómo destrabarlos
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {playbook.edgeCases.map((edge) => (
              <div key={edge.scenario} className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-brand-purple-dark font-semibold">{edge.scenario}</h4>
                <p className="mt-1.5 text-slate-600">{edge.resolution}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {relatedGuides.length > 0 && (
        <nav aria-label="Módulos de este flujo" className="rounded-xl bg-slate-50 p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800">
            <BookOpen className="h-4 w-4 shrink-0" aria-hidden /> Manuales detallados de cada
            pantalla involucrada
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {relatedGuides.map((item) => {
              const sp = new URLSearchParams({ guia: item.id });
              if (roleQueryParam) sp.set("rol", roleQueryParam);
              return (
                <Link
                  key={item.id}
                  href={`/admin/ayuda?${sp.toString()}`}
                  className="hover:border-brand-purple flex min-h-11 items-center justify-between rounded-lg border border-slate-200 bg-white p-3 font-medium text-slate-800"
                >
                  <span>{item.title}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <AdminHelpFeedback guideId={playbook.id} initialFeedback={initialFeedback} />
    </article>
  );
}
