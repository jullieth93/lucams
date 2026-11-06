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
};

export type HelpConcept = {
  term: string;
  definition: string;
};

export type HelpFaq = {
  question: string;
  answer: string;
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
  faqs: HelpFaq[];
  related: string[];
  keywords: string[];
  version: number;
};

export type AdminHelpStep = {
  id: string;
  title: string;
  body: string;
  anchor: "module" | "navigation" | "help";
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

export type AdminHelpProgress = {
  guideId: string;
  version: number;
  currentStep: number;
  completedAt: string | null;
  dismissedAt: string | null;
};

export type AdminHelpIndexItem = {
  id: string;
  title: string;
  area: HelpArea;
  route: string;
  summary: string;
  keywords: string[];
};
