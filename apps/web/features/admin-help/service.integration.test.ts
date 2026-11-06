import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getAdminHelpProgress, saveAdminHelpProgress, submitAdminHelpFeedback } from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `helpitest_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!hasDb)("admin help persistence", { timeout: 30_000 }, () => {
  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: RUN } } });
  });

  it("guarda avance, finalización y feedback aislados por AdminUser", async () => {
    const admin = await prisma.adminUser.create({
      data: {
        supabaseUserId: `${RUN}_supabase`,
        email: `${RUN}@lucams.test`,
        role: "CMS_EDITOR",
      },
    });

    const progress = await saveAdminHelpProgress({
      adminUserId: admin.id,
      role: "CMS_EDITOR",
      guideId: "contenido",
      currentStep: 2,
      intent: "progress",
    });
    expect(progress).toMatchObject({ guideId: "contenido", version: 1, currentStep: 2 });

    const completed = await saveAdminHelpProgress({
      adminUserId: admin.id,
      role: "CMS_EDITOR",
      guideId: "contenido",
      currentStep: 2,
      intent: "complete",
    });
    expect(completed?.completedAt).not.toBeNull();

    expect(
      await submitAdminHelpFeedback({
        adminUserId: admin.id,
        role: "CMS_EDITOR",
        guideId: "contenido",
        isHelpful: true,
        comment: "Procedimiento claro.",
      }),
    ).toBe(true);

    const rows = await getAdminHelpProgress(admin.id);
    expect(rows).toHaveLength(1);
    expect(await prisma.adminHelpFeedback.count({ where: { adminUserId: admin.id } })).toBe(1);
    expect(
      await saveAdminHelpProgress({
        adminUserId: admin.id,
        role: "CMS_EDITOR",
        guideId: "finanzas",
        currentStep: 0,
        intent: "progress",
      }),
    ).toBeNull();
  });
});
