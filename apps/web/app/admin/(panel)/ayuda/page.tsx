import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { z } from "zod";
import { ADMIN_ROLE_SETS } from "@/lib/admin-rbac";
import { requireAdminAction } from "@/lib/admin-rbac-guard";
import { adminRoleLabel, isValidAdminRole } from "@/lib/admin-roles";
import { AdminGuideView } from "@/features/admin-help/components/guide-view";
import { HelpCenterWorkspace } from "@/features/admin-help/components/help-center-workspace";
import { AdminInteractiveGuide } from "@/features/admin-help/components/interactive-guide";
import { AdminPlaybookView } from "@/features/admin-help/components/playbook-view";
import {
  ADMIN_SHORTCUTS,
  getAvailableModuleGuides,
  getAvailablePlaybooks,
  getConsolidatedGlossary,
  getDailyRoutineForRole,
  getModuleGuideById,
  getOnboardingForRole,
  getPlaybookById,
  getQuickRulesForRole,
  getReleaseNotesForRole,
  getRoleMatrixForRole,
} from "@/features/admin-help/registry";
import { getAdminHelpFeedbackForGuide, getAdminHelpProgress } from "@/features/admin-help/service";
import type { HelpCenterTab } from "@/features/admin-help/types";

export const metadata: Metadata = {
  title: "Centro de ayuda",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const HelpCenterSearchSchema = z.object({
  tab: z.enum(["dia-1", "flujos", "modulos", "referencia", "novedades"]).optional(),
  q: z.string().trim().max(200).optional().default(""),
  area: z.string().trim().max(80).optional(),
  guia: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  flujo: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  rol: z.string().trim().max(40).optional(),
  aprender: z.string().optional(),
});

function buildBackHref(opts: {
  tab?: HelpCenterTab;
  q?: string;
  area?: string;
  rol?: string;
}): string {
  const sp = new URLSearchParams();
  if (opts.tab && opts.tab !== "modulos") sp.set("tab", opts.tab);
  if (opts.q) sp.set("q", opts.q);
  if (opts.area) sp.set("area", opts.area);
  if (opts.rol) sp.set("rol", opts.rol);
  const qs = sp.toString();
  return qs ? `/admin/ayuda?${qs}` : "/admin/ayuda";
}

export default async function AdminHelpCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminAction({ roles: ADMIN_ROLE_SETS.ALL_PLUS_CMS });
  const actualRole = session.admin.role;
  const parsed = HelpCenterSearchSchema.safeParse(await searchParams);
  const params = parsed.success
    ? parsed.data
    : {
        tab: undefined,
        q: "",
        area: undefined,
        guia: undefined,
        flujo: undefined,
        rol: undefined,
        aprender: undefined,
      };

  // Seguridad RBAC: el selector `?rol=` solo se honra para SUPERADMIN; cualquier otro rol queda fijo en su sesión.
  const effectiveRole =
    actualRole === "SUPERADMIN" && params.rol && isValidAdminRole(params.rol)
      ? params.rol
      : actualRole;
  const isSimulatingRole = actualRole === "SUPERADMIN" && effectiveRole !== "SUPERADMIN";
  const roleQueryParam = isSimulatingRole ? effectiveRole : undefined;

  const availableGuides = getAvailableModuleGuides(effectiveRole);
  const availablePlaybooks = getAvailablePlaybooks(effectiveRole);
  const areas = [...new Set(availableGuides.map((g) => g.area))];
  const activeArea = params.area ? areas.find((a) => a === params.area) : undefined;

  const selectedGuide = params.guia ? getModuleGuideById(params.guia, effectiveRole) : null;
  const selectedPlaybook =
    !selectedGuide && params.flujo ? getPlaybookById(params.flujo, effectiveRole) : null;

  const detailTargetId = selectedGuide?.id ?? selectedPlaybook?.id ?? null;

  const [progress, selectedFeedback] = await Promise.all([
    getAdminHelpProgress(session.admin.id),
    detailTargetId && !isSimulatingRole
      ? getAdminHelpFeedbackForGuide(session.admin.id, detailTargetId)
      : Promise.resolve(null),
  ]);

  if (selectedGuide) {
    const relatedGuides = selectedGuide.related
      .map((id) => getModuleGuideById(id, effectiveRole))
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map((item) => ({ id: item.id, title: item.title }));
    const relatedPlaybooks = (selectedGuide.relatedPlaybooks ?? [])
      .map((id) => getPlaybookById(id, effectiveRole))
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map((item) => ({ id: item.id, title: item.title }));

    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {isSimulatingRole && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-950">
            <Eye className="h-4 w-4 shrink-0" aria-hidden />
            Vista filtrada para {adminRoleLabel(effectiveRole)}
          </div>
        )}
        <Link
          href={buildBackHref({
            tab: "modulos",
            q: params.q,
            area: activeArea,
            rol: roleQueryParam,
          })}
          className="text-brand-purple-dark inline-flex min-h-11 items-center gap-2 font-semibold hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al Centro de ayuda
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-8">
          <h1 className="sr-only">Centro de ayuda: {selectedGuide.title}</h1>
          <AdminGuideView
            guide={selectedGuide}
            role={effectiveRole}
            relatedGuides={relatedGuides}
            relatedPlaybooks={relatedPlaybooks}
            roleQueryParam={roleQueryParam}
            initialFeedback={selectedFeedback}
            interactive={
              !isSimulatingRole ? (
                <AdminInteractiveGuide
                  guide={selectedGuide}
                  role={effectiveRole}
                  initialProgress={progress.find((item) => item.guideId === selectedGuide.id)}
                />
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  if (selectedPlaybook) {
    const relatedGuides = selectedPlaybook.relatedGuides
      .map((id) => getModuleGuideById(id, effectiveRole))
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map((item) => ({ id: item.id, title: item.title }));

    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {isSimulatingRole && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-950">
            <Eye className="h-4 w-4 shrink-0" aria-hidden />
            Vista filtrada para {adminRoleLabel(effectiveRole)}
          </div>
        )}
        <Link
          href={buildBackHref({ tab: "flujos", q: params.q, rol: roleQueryParam })}
          className="text-brand-purple-dark inline-flex min-h-11 items-center gap-2 font-semibold hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a Flujos E2E
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-8">
          <h1 className="sr-only">Flujo E2E: {selectedPlaybook.title}</h1>
          <AdminPlaybookView
            playbook={selectedPlaybook}
            role={effectiveRole}
            relatedGuides={relatedGuides}
            roleQueryParam={roleQueryParam}
            initialFeedback={selectedFeedback}
            interactive={
              !isSimulatingRole ? (
                <AdminInteractiveGuide
                  guide={selectedPlaybook}
                  role={effectiveRole}
                  initialProgress={progress.find((item) => item.guideId === selectedPlaybook.id)}
                />
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  const onboarding = getOnboardingForRole(effectiveRole);
  const dailyRoutine = getDailyRoutineForRole(effectiveRole);
  const quickRules = getQuickRulesForRole(effectiveRole);
  const roleMatrix = getRoleMatrixForRole(effectiveRole);
  const glossary = getConsolidatedGlossary(effectiveRole);
  const releaseNotes = getReleaseNotesForRole(effectiveRole);

  const initialTab: HelpCenterTab = params.tab ?? (params.aprender === "1" ? "dia-1" : "modulos");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <HelpCenterWorkspace
        key={`${effectiveRole}:${initialTab}:${params.q}`}
        actualRole={actualRole}
        effectiveRole={effectiveRole}
        initialTab={initialTab}
        initialQuery={params.q}
        initialArea={activeArea}
        autoStartOnboarding={params.aprender === "1"}
        onboarding={onboarding}
        dailyRoutine={dailyRoutine}
        playbooks={availablePlaybooks}
        guides={availableGuides}
        quickRules={quickRules}
        roleMatrix={roleMatrix}
        shortcuts={ADMIN_SHORTCUTS}
        glossary={glossary}
        releaseNotes={releaseNotes}
        initialProgress={progress}
      />
    </div>
  );
}
