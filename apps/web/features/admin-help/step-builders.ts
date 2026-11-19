/*
 * Constructores puros de pasos y normalización sin importar `./content/*`,
 * de modo que los componentes cliente (`AdminHelpLauncher`, `AdminInteractiveGuide`,
 * `AdminGuideView`) no arrastren el corpus de ~300 KB al bundle JS del navegador.
 */

import type { AdminRole } from "@lucams/db";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import type { AdminHelpStep, AdminModuleGuide, AdminOnboardingGuide, AdminPlaybook } from "./types";

export function normalizeHelpText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .trim();
}

export function getProceduresForRole(guide: AdminModuleGuide, role: AdminRole) {
  return guide.procedures.filter((procedure) => !procedure.roles || procedure.roles.includes(role));
}

export function buildModuleSteps(
  guide: AdminModuleGuide,
  role: AdminRole,
  procedureId?: string,
): AdminHelpStep[] {
  const procedure = getProceduresForRole(guide, role).find((item) => item.id === procedureId);
  if (procedure) {
    const procRoute = procedure.route ?? guide.route;
    const canOpen = procRoute !== "/admin/ayuda" && canAccessAdminPath(role, procRoute);
    return procedure.steps.map((step, index) => ({
      id: `${procedure.id}-${index + 1}`,
      title: `${procedure.title}: paso ${index + 1}`,
      body: step,
      href: canOpen ? procRoute : undefined,
      hrefLabel: canOpen ? `Abrir ${guide.title}` : undefined,
    }));
  }

  if (guide.checklist && guide.checklist.length > 0) {
    const canOpen = guide.route !== "/admin/ayuda" && canAccessAdminPath(role, guide.route);
    return guide.checklist.map((item, index) => ({
      id: `check-${index + 1}`,
      title: `Verificación ${index + 1} de ${guide.checklist!.length}`,
      body: item,
      href: canOpen ? guide.route : undefined,
      hrefLabel: canOpen ? `Ir a ${guide.title}` : undefined,
    }));
  }

  return [
    {
      id: "proposito",
      title: `Para qué sirve ${guide.title}`,
      body: guide.purpose,
    },
    ...guide.sections.map((section) => ({
      id: section.id,
      title: section.title,
      body: section.summary,
    })),
    {
      id: "precauciones",
      title: "Antes de terminar",
      body: guide.cautions.join(" "),
    },
  ];
}

export function buildOnboardingSteps(guide: AdminOnboardingGuide): AdminHelpStep[] {
  return guide.steps;
}

export function buildPlaybookSteps(playbook: AdminPlaybook, role: AdminRole): AdminHelpStep[] {
  return playbook.steps.map((step, index) => {
    const canOpen = canAccessAdminPath(role, step.route);
    return {
      id: step.id,
      title: `Paso ${index + 1}: ${step.title}`,
      body: `${step.action} — Verificación: ${step.verification}`,
      href: canOpen ? step.route : undefined,
      hrefLabel: canOpen ? `Abrir ${step.moduleLabel}` : undefined,
    };
  });
}

export function resolveStepsForHelpTarget(
  target: AdminModuleGuide | AdminOnboardingGuide | AdminPlaybook,
  role: AdminRole,
): AdminHelpStep[] {
  if ("role" in target) return buildOnboardingSteps(target);
  if ("trigger" in target) return buildPlaybookSteps(target, role);
  return buildModuleSteps(target, role);
}
