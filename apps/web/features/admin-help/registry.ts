import type { AdminRole } from "@lucams/db";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { CATALOG_GUIDES } from "./content/catalog";
import { CMS_GUIDES } from "./content/cms";
import { CONFIGURATION_GUIDES } from "./content/configuration";
import { FINANCE_GUIDES } from "./content/finance";
import { MARKETING_GUIDES } from "./content/marketing";
import { LIFECYCLE_GUIDE } from "./content/lifecycle";
import { ONBOARDING_GUIDES } from "./content/onboarding";
import { OPERATION_GUIDES } from "./content/operations";
import { SALES_GUIDES } from "./content/sales";
import { SUPPORT_GUIDES } from "./content/support";
import type {
  AdminHelpIndexItem,
  AdminHelpStep,
  AdminModuleGuide,
  AdminOnboardingGuide,
} from "./types";

export const ADMIN_MODULE_GUIDES: AdminModuleGuide[] = [
  ...OPERATION_GUIDES,
  ...SALES_GUIDES,
  ...SUPPORT_GUIDES,
  ...CATALOG_GUIDES,
  ...MARKETING_GUIDES,
  LIFECYCLE_GUIDE,
  ...FINANCE_GUIDES,
  ...CMS_GUIDES,
  ...CONFIGURATION_GUIDES,
];

const GUIDE_BY_ID = new Map(ADMIN_MODULE_GUIDES.map((guide) => [guide.id, guide]));
const ONBOARDING_BY_ROLE = new Map(ONBOARDING_GUIDES.map((guide) => [guide.role, guide]));

const ROUTE_ALIASES: Record<string, string> = {
  "/admin/mensajes": "soporte",
  "/admin/reclamos": "garantias",
  "/admin/fichas": "disenos",
};

export function normalizeHelpText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .trim();
}

export function getAvailableModuleGuides(role: AdminRole): AdminModuleGuide[] {
  return ADMIN_MODULE_GUIDES.filter((guide) => canAccessAdminPath(role, guide.route)).sort((a, b) =>
    a.title.localeCompare(b.title, "es"),
  );
}

export function getModuleGuideById(id: string, role: AdminRole): AdminModuleGuide | null {
  const guide = GUIDE_BY_ID.get(id);
  return guide && canAccessAdminPath(role, guide.route) ? guide : null;
}

export function getGuideForPath(pathname: string, role: AdminRole): AdminModuleGuide | null {
  const cleanPath = pathname.split("?")[0].replace(/\/$/, "") || "/admin";
  const alias = Object.entries(ROUTE_ALIASES).find(
    ([route]) => cleanPath === route || cleanPath.startsWith(`${route}/`),
  );
  if (alias) return getModuleGuideById(alias[1], role);

  return (
    getAvailableModuleGuides(role)
      .filter((guide) => cleanPath === guide.route || cleanPath.startsWith(`${guide.route}/`))
      .sort((a, b) => b.route.length - a.route.length)[0] ?? null
  );
}

export function getOnboardingForRole(role: AdminRole): AdminOnboardingGuide {
  const guide = ONBOARDING_BY_ROLE.get(role);
  if (!guide) throw new Error(`No existe onboarding para el rol ${role}`);
  return guide;
}

export function getHelpGuideById(
  id: string,
  role: AdminRole,
): AdminModuleGuide | AdminOnboardingGuide | null {
  const onboarding = getOnboardingForRole(role);
  if (onboarding.id === id) return onboarding;
  return getModuleGuideById(id, role);
}

export function getHelpIndex(role: AdminRole): AdminHelpIndexItem[] {
  return getAvailableModuleGuides(role).map((guide) => ({
    id: guide.id,
    title: guide.title,
    area: guide.area,
    route: guide.route,
    summary: guide.summary,
    keywords: guide.keywords,
  }));
}

function guideSearchText(guide: AdminModuleGuide, role: AdminRole): string {
  return normalizeHelpText(
    JSON.stringify({
      title: guide.title,
      area: guide.area,
      summary: guide.summary,
      purpose: guide.purpose,
      whenToUse: guide.whenToUse,
      concepts: guide.concepts,
      sections: guide.sections,
      procedures: getProceduresForRole(guide, role),
      cautions: guide.cautions,
      faqs: guide.faqs,
      keywords: guide.keywords,
    }),
  );
}

export function searchModuleGuides(
  role: AdminRole,
  query: string,
  availableGuides = getAvailableModuleGuides(role),
): AdminModuleGuide[] {
  const terms = normalizeHelpText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return availableGuides;
  return availableGuides.filter((guide) => {
    const haystack = guideSearchText(guide, role);
    return terms.every((term) => haystack.includes(term));
  });
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
    return procedure.steps.map((step, index) => ({
      id: `${procedure.id}-${index + 1}`,
      title: `${procedure.title}: paso ${index + 1}`,
      body: step,
      anchor: "module",
    }));
  }

  return [
    {
      id: "proposito",
      title: `Para qué sirve ${guide.title}`,
      body: guide.purpose,
      anchor: "module",
    },
    ...guide.sections.map((section) => ({
      id: section.id,
      title: section.title,
      body: section.summary,
      anchor: "module" as const,
    })),
    {
      id: "precauciones",
      title: "Antes de terminar",
      body: guide.cautions.join(" "),
      anchor: "module",
    },
  ];
}

export function buildOnboardingSteps(guide: AdminOnboardingGuide): AdminHelpStep[] {
  return guide.steps;
}
