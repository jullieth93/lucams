import "server-only";

import type { AdminRole } from "@lucams/db";
import { prisma } from "@/lib/db";
import {
  getGuideAndSubrouteForPath,
  getHelpGuideById,
  resolveStepsForHelpTarget,
} from "./registry";
import type { AdminHelpProgress, AdminModuleGuide, AdminSubrouteFocus } from "./types";

export async function getAdminHelpProgress(adminUserId: string): Promise<AdminHelpProgress[]> {
  const rows = await prisma.adminHelpProgress.findMany({
    where: { adminUserId },
    select: {
      guideId: true,
      version: true,
      currentStep: true,
      completedAt: true,
      dismissedAt: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    completedAt: row.completedAt?.toISOString() ?? null,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
  }));
}

function stepsForGuide(guideId: string, role: AdminRole) {
  const guide = getHelpGuideById(guideId, role);
  if (!guide) return null;
  const steps = resolveStepsForHelpTarget(guide, role);
  return { guide, steps };
}

export async function saveAdminHelpProgress(input: {
  adminUserId: string;
  role: AdminRole;
  guideId: string;
  currentStep: number;
  intent: "progress" | "complete" | "dismiss";
}): Promise<AdminHelpProgress | null> {
  const resolved = stepsForGuide(input.guideId, input.role);
  if (!resolved || resolved.steps.length === 0) return null;

  const lastStep = resolved.steps.length - 1;
  const currentStep = Math.min(input.currentStep, lastStep);
  const now = new Date();
  const values = {
    version: resolved.guide.version,
    currentStep,
    completedAt: input.intent === "complete" ? now : null,
    dismissedAt: input.intent === "dismiss" ? now : null,
  };

  const row = await prisma.adminHelpProgress.upsert({
    where: {
      adminUserId_guideId: { adminUserId: input.adminUserId, guideId: input.guideId },
    },
    create: {
      adminUserId: input.adminUserId,
      guideId: input.guideId,
      ...values,
    },
    update: values,
    select: {
      guideId: true,
      version: true,
      currentStep: true,
      completedAt: true,
      dismissedAt: true,
    },
  });

  return {
    ...row,
    completedAt: row.completedAt?.toISOString() ?? null,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
  };
}

export async function getAdminHelpFeedbackForGuide(
  adminUserId: string,
  guideId: string,
): Promise<{ isHelpful: boolean; comment: string | null } | null> {
  const row = await prisma.adminHelpFeedback.findUnique({
    where: {
      adminUserId_guideId: { adminUserId, guideId },
    },
    select: {
      isHelpful: true,
      comment: true,
    },
  });
  return row ?? null;
}

export async function getContextualHelpForPathname(input: {
  adminUserId: string;
  role: AdminRole;
  pathname: string;
}): Promise<{
  guide: AdminModuleGuide;
  subroute: AdminSubrouteFocus | null;
  progress: AdminHelpProgress | null;
  feedback: { isHelpful: boolean; comment: string | null } | null;
} | null> {
  const { guide, subroute } = getGuideAndSubrouteForPath(input.pathname, input.role);
  if (!guide) return null;

  const [progressRow, feedback] = await Promise.all([
    prisma.adminHelpProgress.findUnique({
      where: {
        adminUserId_guideId: { adminUserId: input.adminUserId, guideId: guide.id },
      },
      select: {
        guideId: true,
        version: true,
        currentStep: true,
        completedAt: true,
        dismissedAt: true,
      },
    }),
    getAdminHelpFeedbackForGuide(input.adminUserId, guide.id),
  ]);

  return {
    guide,
    subroute,
    progress: progressRow
      ? {
          ...progressRow,
          completedAt: progressRow.completedAt?.toISOString() ?? null,
          dismissedAt: progressRow.dismissedAt?.toISOString() ?? null,
        }
      : null,
    feedback,
  };
}

export async function submitAdminHelpFeedback(input: {
  adminUserId: string;
  role: AdminRole;
  guideId: string;
  isHelpful: boolean;
  comment: string | null;
}): Promise<boolean> {
  if (!getHelpGuideById(input.guideId, input.role)) return false;
  await prisma.adminHelpFeedback.upsert({
    where: {
      adminUserId_guideId: { adminUserId: input.adminUserId, guideId: input.guideId },
    },
    create: {
      adminUserId: input.adminUserId,
      guideId: input.guideId,
      isHelpful: input.isHelpful,
      comment: input.comment,
    },
    update: { isHelpful: input.isHelpful, comment: input.comment },
  });
  return true;
}
