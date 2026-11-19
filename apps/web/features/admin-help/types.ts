import type { AdminRole } from "@lucams/db";

export type HelpArea =
  | "Operación"
  | "Ventas y CRM"
  | "Servicio al cliente"
  | "Catálogo y producción"
  | "Marketing"
  | "Finanzas y analítica"
  | "Contenido"
  | "Configuración y seguridad";

export type HelpCenterTab = "dia-1" | "flujos" | "modulos" | "referencia";

export type HelpTopic = {
  id: string;
  label: string;
  description: string;
  interpretation?: string;
  caution?: string;
};

export type HelpSection = {
  id: string;
  title: string;
  summary: string;
  topics: HelpTopic[];
};

export type HelpProcedure = {
  id: string;
  title: string;
  goal: string;
  roles?: AdminRole[];
  steps: string[];
  expected: string;
  exceptions?: string[];
  route?: string;
};

export type HelpConcept = {
  term: string;
  definition: string;
};

export type HelpFaq = {
  question: string;
  answer: string;
};

export type AdminSubrouteFocus = {
  id: string;
  pattern: string;
  title: string;
  summary: string;
  tips: string[];
  highlightSectionIds?: string[];
  highlightProcedureIds?: string[];
};

export type AdminModuleGuide = {
  id: string;
  title: string;
  area: HelpArea;
  route: string;
  summary: string;
  purpose: string;
  whenToUse: string[];
  concepts: HelpConcept[];
  sections: HelpSection[];
  procedures: HelpProcedure[];
  cautions: string[];
  dontTouch: string[];
  checklist?: string[];
  subroutes?: AdminSubrouteFocus[];
  faqs: HelpFaq[];
  related: string[];
  relatedPlaybooks?: string[];
  keywords: string[];
  version: number;
};

export type AdminHelpStep = {
  id: string;
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
};

export type AdminOnboardingGuide = {
  id: string;
  role: AdminRole;
  title: string;
  summary: string;
  version: number;
  moduleIds: string[];
  steps: AdminHelpStep[];
};

export type AdminDailyRoutineBlock = {
  id: string;
  windowLabel: string;
  title: string;
  items: {
    label: string;
    detail: string;
    route: string;
  }[];
};

export type AdminDailyRoutine = {
  role: AdminRole;
  mission: string;
  privacyScope: string;
  escalateWhen: string[];
  dontTouch: string[];
  blocks: AdminDailyRoutineBlock[];
  recommendedPlaybookIds: string[];
};

export type AdminPlaybookStep = {
  id: string;
  title: string;
  route: string;
  moduleLabel: string;
  ownerRoles: AdminRole[];
  action: string;
  verification: string;
  gateBadge?: string;
};

export type AdminPlaybook = {
  id: string;
  title: string;
  area: HelpArea;
  summary: string;
  trigger: string;
  durationHint: string;
  roles: AdminRole[];
  steps: AdminPlaybookStep[];
  edgeCases: {
    scenario: string;
    resolution: string;
  }[];
  dontTouch: string[];
  relatedGuides: string[];
  keywords: string[];
  version: number;
};

export type AdminQuickRule = {
  id: string;
  category: "Legal y posventa" | "Seguridad y MFA" | "Catálogo y Estudio" | "Comercial y DIAN";
  label: string;
  value: string;
  detail: string;
  route: string;
};

export type AdminRoleMatrixRow = {
  role: AdminRole;
  roleLabel: string;
  piiAccess: string;
  financialVisibility: string;
  primaryScope: string;
  escalatesToSuperadmin: string;
};

export type AdminShortcutEntry = {
  keys: string[];
  label: string;
  description: string;
};

export type AdminGlossaryEntry = {
  term: string;
  definition: string;
  sources: {
    guideId: string;
    guideTitle: string;
    route: string;
  }[];
};

export type AdminHelpProgress = {
  guideId: string;
  version: number;
  currentStep: number;
  completedAt: string | null;
  dismissedAt: string | null;
};

export type AdminHelpSubrouteIndexItem = {
  id: string;
  pattern: string;
  title: string;
  summary: string;
};

export type AdminHelpRouteEntry = {
  id: string;
  title: string;
  area: HelpArea;
  route: string;
  summary: string;
  keywords: string[];
  subroutes: AdminHelpSubrouteIndexItem[];
};

export type AdminPlaybookIndexItem = {
  id: string;
  title: string;
  area: HelpArea;
  summary: string;
  durationHint: string;
  keywords: string[];
};

export type AdminHelpIndexItem = AdminHelpRouteEntry;
