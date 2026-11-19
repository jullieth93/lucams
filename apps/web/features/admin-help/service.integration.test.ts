import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getAdminHelpProgress,
  getContextualHelpForPathname,
  saveAdminHelpProgress,
  submitAdminHelpFeedback,
} from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `helpitest_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!hasDb)("admin help persistence", { timeout: 30_000 }, () => {
  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: RUN } } });
  });

  it("guarda avance de módulos y playbooks, resuelve subrutas y respeta aislamiento RBAC", async () => {
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
    expect(progress).toMatchObject({ guideId: "contenido", version: 2, currentStep: 2 });

    const completed = await saveAdminHelpProgress({
      adminUserId: admin.id,
      role: "CMS_EDITOR",
      guideId: "contenido",
      currentStep: 2,
      intent: "complete",
    });
    expect(completed?.completedAt).not.toBeNull();

    const playbookProgress = await saveAdminHelpProgress({
      adminUserId: admin.id,
      role: "CMS_EDITOR",
      guideId: "playbook-catalogo-estudio-lanzamiento",
      currentStep: 1,
      intent: "progress",
    });
    expect(playbookProgress).toMatchObject({
      guideId: "playbook-catalogo-estudio-lanzamiento",
      currentStep: 1,
    });

    expect(
      await submitAdminHelpFeedback({
        adminUserId: admin.id,
        role: "CMS_EDITOR",
        guideId: "contenido",
        isHelpful: true,
        comment: "Procedimiento claro.",
      }),
    ).toBe(true);

    const contextual = await getContextualHelpForPathname({
      adminUserId: admin.id,
      role: "CMS_EDITOR",
      pathname: "/admin/contenido/borradores",
    });
    expect(contextual?.guide.id).toBe("contenido");
    expect(contextual?.subroute?.id).toBe("contenido-borradores");
    expect(contextual?.feedback?.isHelpful).toBe(true);

    // Bloqueo RBAC: CMS_EDITOR no puede guardar progreso ni resolver guías exclusivas de SUPERADMIN/Finanzas
    expect(
      await getContextualHelpForPathname({
        adminUserId: admin.id,
        role: "CMS_EDITOR",
        pathname: "/admin/contenido/paginas/global",
      }),
    ).toBeNull();
    expect(
      await saveAdminHelpProgress({
        adminUserId: admin.id,
        role: "CMS_EDITOR",
        guideId: "finanzas",
        currentStep: 0,
        intent: "progress",
      }),
    ).toBeNull();
    expect(
      await saveAdminHelpProgress({
        adminUserId: admin.id,
        role: "CMS_EDITOR",
        guideId: "playbook-incidentes-seguridad-dian",
        currentStep: 0,
        intent: "progress",
      }),
    ).toBeNull();

    const rows = await getAdminHelpProgress(admin.id);
    expect(rows).toHaveLength(2);
    expect(await prisma.adminHelpFeedback.count({ where: { adminUserId: admin.id } })).toBe(1);
  });
});
