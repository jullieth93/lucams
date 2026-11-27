import type { AdminRole } from "@lucams/db";
import { canAccessAdminPath } from "@/lib/admin-rbac";
import { CATALOG_GUIDES } from "./content/catalog";
import { CMS_GUIDES } from "./content/cms";
import { CONFIGURATION_GUIDES } from "./content/configuration";
import { DAILY_ROUTINES } from "./content/daily-routines";
import { FINANCE_GUIDES } from "./content/finance";
import {
  ADMIN_QUICK_RULES,
  ADMIN_ROLE_MATRIX,
  ADMIN_SHORTCUTS,
  SUPPLEMENTAL_GLOSSARY_TERMS,
  normalizeGlossaryTermKey,
} from "./content/glossary-and-rules";
import { LIFECYCLE_GUIDE } from "./content/lifecycle";
import { MARKETING_GUIDES } from "./content/marketing";
import { ONBOARDING_GUIDES } from "./content/onboarding";
import { OPERATION_GUIDES } from "./content/operations";
import { ADMIN_PLAYBOOKS } from "./content/playbooks";
import { ADMIN_RELEASE_NOTES, RELEASE_NOTES_PROGRESS_GUIDE_ID } from "./content/release-notes";
import { SALES_GUIDES } from "./content/sales";
import { SUPPORT_GUIDES } from "./content/support";
import { HELP_ROUTE_ALIASES, cleanAdminPathname, resolveSubrouteFromList } from "./route-matcher";
import {
  buildModuleSteps,
  buildOnboardingSteps,
  buildPlaybookSteps,
  getProceduresForRole,
  normalizeHelpText,
  resolveStepsForHelpTarget,
} from "./step-builders";
import type {
  AdminDailyRoutine,
  AdminGlossaryEntry,
  AdminHelpIndexItem,
  AdminHelpProgress,
  AdminHelpRouteEntry,
  AdminModuleGuide,
  AdminOnboardingGuide,
  AdminPlaybook,
  AdminPlaybookIndexItem,
  AdminQuickRule,
  AdminReleaseNote,
  AdminReleaseSummary,
  AdminRoleMatrixRow,
  AdminSubrouteFocus,
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

export {
  ADMIN_PLAYBOOKS,
  ADMIN_RELEASE_NOTES,
  ADMIN_SHORTCUTS,
  RELEASE_NOTES_PROGRESS_GUIDE_ID,
  buildModuleSteps,
  buildOnboardingSteps,
  buildPlaybookSteps,
  getProceduresForRole,
  normalizeHelpText,
  resolveStepsForHelpTarget,
};

const GUIDE_BY_ID = new Map(ADMIN_MODULE_GUIDES.map((guide) => [guide.id, guide]));
const ONBOARDING_BY_ROLE = new Map(ONBOARDING_GUIDES.map((guide) => [guide.role, guide]));
const ROUTINE_BY_ROLE = new Map(DAILY_ROUTINES.map((routine) => [routine.role, routine]));
const PLAYBOOK_BY_ID = new Map(ADMIN_PLAYBOOKS.map((playbook) => [playbook.id, playbook]));

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
  const cleanPath = cleanAdminPathname(pathname);
  const alias = Object.entries(HELP_ROUTE_ALIASES).find(
    ([route]) => cleanPath === route || cleanPath.startsWith(`${route}/`),
  );
  if (alias) return getModuleGuideById(alias[1], role);
  if (cleanPath.startsWith("/admin") && !canAccessAdminPath(role, cleanPath)) {
    return null;
  }

  return (
    getAvailableModuleGuides(role)
      .filter((guide) => cleanPath === guide.route || cleanPath.startsWith(`${guide.route}/`))
      .sort((a, b) => b.route.length - a.route.length)[0] ?? null
  );
}

export function getGuideAndSubrouteForPath(
  pathname: string,
  role: AdminRole,
): {
  guide: AdminModuleGuide | null;
  subroute: AdminSubrouteFocus | null;
} {
  const cleanPath = cleanAdminPathname(pathname);
  const guide = getGuideForPath(cleanPath, role);
  if (!guide) return { guide: null, subroute: null };
  const subroute = resolveSubrouteFromList(cleanPath, guide.subroutes);
  return { guide, subroute };
}

export function getOnboardingForRole(role: AdminRole): AdminOnboardingGuide {
  const guide = ONBOARDING_BY_ROLE.get(role);
  if (!guide) throw new Error(`No existe onboarding para el rol ${role}`);
  return guide;
}

export function getAvailablePlaybooks(role: AdminRole): AdminPlaybook[] {
  return ADMIN_PLAYBOOKS.filter(
    (playbook) =>
      playbook.roles.includes(role) &&
      playbook.steps.some((step) => canAccessAdminPath(role, step.route)),
  );
}

export function getPlaybookById(id: string, role: AdminRole): AdminPlaybook | null {
  const playbook = PLAYBOOK_BY_ID.get(id);
  if (!playbook) return null;
  const available =
    playbook.roles.includes(role) &&
    playbook.steps.some((step) => canAccessAdminPath(role, step.route));
  return available ? playbook : null;
}

export function getDailyRoutineForRole(role: AdminRole): AdminDailyRoutine {
  const routine = ROUTINE_BY_ROLE.get(role);
  if (!routine) throw new Error(`No existe rutina diaria para el rol ${role}`);
  const allowedPlaybooks = new Set(getAvailablePlaybooks(role).map((p) => p.id));
  return {
    ...routine,
    blocks: routine.blocks
      .map((block) => ({
        ...block,
        items: block.items.filter((item) => canAccessAdminPath(role, item.route)),
      }))
      .filter((block) => block.items.length > 0),
    recommendedPlaybookIds: routine.recommendedPlaybookIds.filter((id) => allowedPlaybooks.has(id)),
  };
}

export function getQuickRulesForRole(role: AdminRole): AdminQuickRule[] {
  return ADMIN_QUICK_RULES.filter((rule) => canAccessAdminPath(role, rule.route));
}

export function getRoleMatrixForRole(role: AdminRole): AdminRoleMatrixRow[] {
  if (role === "SUPERADMIN" || role === "OPERATIONS_MANAGER" || role === "MANAGER") {
    return ADMIN_ROLE_MATRIX;
  }
  return ADMIN_ROLE_MATRIX.filter(
    (row) => row.role === role || row.role === "SUPERADMIN" || row.role === "OPERATIONS_MANAGER",
  );
}

export function getConsolidatedGlossary(role: AdminRole): AdminGlossaryEntry[] {
  const guides = getAvailableModuleGuides(role);
  const byKey = new Map<string, AdminGlossaryEntry>();

  for (const guide of guides) {
    for (const concept of guide.concepts) {
      const key = normalizeGlossaryTermKey(concept);
      const existing = byKey.get(key);
      const source = { guideId: guide.id, guideTitle: guide.title, route: guide.route };
      if (existing) {
        if (!existing.sources.some((s) => s.guideId === guide.id)) {
          existing.sources.push(source);
        }
      } else {
        byKey.set(key, {
          term: concept.term,
          definition: concept.definition,
          sources: [source],
        });
      }
    }
  }

  for (const extra of SUPPLEMENTAL_GLOSSARY_TERMS) {
    const guide = getModuleGuideById(extra.guideId, role);
    if (!guide) continue;
    const key = normalizeGlossaryTermKey(extra);
    if (!byKey.has(key)) {
      byKey.set(key, {
        term: extra.term,
        definition: extra.definition,
        sources: [{ guideId: guide.id, guideTitle: guide.title, route: guide.route }],
      });
    }
  }

  return [...byKey.values()].sort((a, b) => a.term.localeCompare(b.term, "es"));
}

export function getHelpGuideById(
  id: string,
  role: AdminRole,
): AdminModuleGuide | AdminOnboardingGuide | AdminPlaybook | null {
  const onboarding = getOnboardingForRole(role);
  if (onboarding.id === id) return onboarding;
  const playbook = getPlaybookById(id, role);
  if (playbook) return playbook;
  return getModuleGuideById(id, role);
}

export function getHelpRouteIndex(role: AdminRole): AdminHelpRouteEntry[] {
  return getAvailableModuleGuides(role).map((guide) => ({
    id: guide.id,
    title: guide.title,
    area: guide.area,
    route: guide.route,
    summary: guide.summary,
    keywords: guide.keywords,
    subroutes: (guide.subroutes ?? []).map((sub) => ({
      id: sub.id,
      pattern: sub.pattern,
      title: sub.title,
      summary: sub.summary,
    })),
  }));
}

export function getHelpIndex(role: AdminRole): AdminHelpIndexItem[] {
  return getHelpRouteIndex(role);
}

export function getPlaybookIndex(role: AdminRole): AdminPlaybookIndexItem[] {
  return getAvailablePlaybooks(role).map((playbook) => ({
    id: playbook.id,
    title: playbook.title,
    area: playbook.area,
    summary: playbook.summary,
    durationHint: playbook.durationHint,
    keywords: playbook.keywords,
  }));
}

function guideSearchText(guide: AdminModuleGuide, role: AdminRole): string {
  return normalizeHelpText(
    JSON.stringify({
      title: guide.title,
      area: guide.area,
      route: guide.route,
      summary: guide.summary,
      purpose: guide.purpose,
      whenToUse: guide.whenToUse,
      concepts: guide.concepts,
      sections: guide.sections,
      procedures: getProceduresForRole(guide, role),
      cautions: guide.cautions,
      dontTouch: guide.dontTouch,
      checklist: guide.checklist,
      subroutes: guide.subroutes,
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

export function searchPlaybooks(
  role: AdminRole,
  query: string,
  availablePlaybooks = getAvailablePlaybooks(role),
): AdminPlaybook[] {
  const terms = normalizeHelpText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return availablePlaybooks;
  return availablePlaybooks.filter((playbook) => {
    const haystack = normalizeHelpText(
      JSON.stringify({
        title: playbook.title,
        area: playbook.area,
        summary: playbook.summary,
        trigger: playbook.trigger,
        steps: playbook.steps,
        edgeCases: playbook.edgeCases,
        dontTouch: playbook.dontTouch,
        keywords: playbook.keywords,
      }),
    );
    return terms.every((term) => haystack.includes(term));
  });
}

export function searchGlossary(
  role: AdminRole,
  query: string,
  glossary = getConsolidatedGlossary(role),
): AdminGlossaryEntry[] {
  const terms = normalizeHelpText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return glossary;
  return glossary.filter((entry) => {
    const haystack = normalizeHelpText(`${entry.term} ${entry.definition}`);
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Filtra las novedades de la plataforma según las capacidades RBAC efectivas
 * del rol: ningún rol recibe ítems sobre módulos que no puede abrir.
 */
export function getReleaseNotesForRole(role: AdminRole): AdminReleaseNote[] {
  return ADMIN_RELEASE_NOTES.map((release) => ({
    ...release,
    items: release.items.filter((item) => {
      // Fail-closed (deny-by-default): todo ítem debe declarar al menos un alcance RBAC.
      if (!item.roles && !item.route && !item.guideId) return false;
      if (item.roles && !item.roles.includes(role)) return false;
      if (item.route && !canAccessAdminPath(role, item.route)) return false;
      if (item.guideId && !getModuleGuideById(item.guideId, role)) return false;
      return true;
    }),
  })).filter((release) => release.items.length > 0);
}

export function getLatestReleaseVersionForRole(role: AdminRole): number {
  const notes = getReleaseNotesForRole(role);
  return notes.reduce((max, note) => Math.max(max, note.version), 0);
}

export function getUnreadReleaseSummary(
  role: AdminRole,
  progress: AdminHelpProgress[],
): AdminReleaseSummary {
  const notes = getReleaseNotesForRole(role);
  if (notes.length === 0) {
    return { latestVersion: 0, unreadCount: 0, latestTitle: null, latestDate: null };
  }
  const seenVersion =
    progress.find((item) => item.guideId === RELEASE_NOTES_PROGRESS_GUIDE_ID)?.version ?? 0;
  const unreadNotes = notes.filter((note) => note.version > seenVersion);
  const unreadCount = unreadNotes.reduce((acc, note) => acc + note.items.length, 0);
  const latest = notes[0]!;
  return {
    latestVersion: latest.version,
    unreadCount,
    latestTitle: latest.items.length === 1 ? latest.items[0]!.title : latest.title,
    latestDate: latest.date,
  };
}
