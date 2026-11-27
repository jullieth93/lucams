"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { AdminRole } from "@lucams/db";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  GraduationCap,
  Loader2,
  Search,
  Sparkles,
  Workflow,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getContextualHelpAction, markReleaseNotesSeenAction } from "../actions";
import {
  cleanAdminPathname,
  resolveHelpEntryForPathname,
  resolveSubrouteFromList,
} from "../route-matcher";
import { normalizeHelpText } from "../step-builders";
import type {
  AdminHelpProgress,
  AdminHelpRouteEntry,
  AdminModuleGuide,
  AdminOnboardingGuide,
  AdminPlaybookIndexItem,
  AdminReleaseSummary,
} from "../types";
import { AdminGuideView } from "./guide-view";
import { AdminInteractiveGuide } from "./interactive-guide";

type CachedContextualGuide = {
  guide: AdminModuleGuide;
  feedback: { isHelpful: boolean; comment: string | null } | null;
};

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

const RELEASE_NOTES_PROGRESS_ID = "platform-release-notes";

export function AdminHelpLauncher({
  routeIndex,
  playbookIndex,
  onboarding,
  role,
  initialProgress,
  releaseSummary = { latestVersion: 0, unreadCount: 0, latestTitle: null, latestDate: null },
}: {
  routeIndex: AdminHelpRouteEntry[];
  playbookIndex: AdminPlaybookIndexItem[];
  onboarding: AdminOnboardingGuide;
  role: AdminRole;
  initialProgress: AdminHelpProgress[];
  releaseSummary?: AdminReleaseSummary;
}) {
  const rawPathname = usePathname() ?? "/admin";
  const searchParams = useSearchParams();
  const cleanPath = cleanAdminPathname(rawPathname);
  const queryKey = searchParams?.toString() ?? "";

  const isHelpCenterRoot = cleanPath === "/admin/ayuda";
  const activeHelpQueryGuide = isHelpCenterRoot ? searchParams?.get("guia") : null;
  const activeHelpQueryFlow = isHelpCenterRoot ? searchParams?.get("flujo") : null;
  const activeRoleQuery = isHelpCenterRoot ? (searchParams?.get("rol") ?? undefined) : undefined;
  const isHelpCenterLanding = isHelpCenterRoot && !activeHelpQueryGuide && !activeHelpQueryFlow;
  const isHelpCenterDetail =
    isHelpCenterRoot && Boolean(activeHelpQueryGuide || activeHelpQueryFlow);

  const routeKey = `${cleanPath}?${queryKey}`;
  const [quickQuery, setQuickQuery] = useState("");
  const [openRouteKey, setOpenRouteKey] = useState<string | null>(null);
  const open = openRouteKey === routeKey;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      setOpenRouteKey(nextOpen ? routeKey : null);
      if (!nextOpen) setQuickQuery("");
    },
    [routeKey],
  );

  const [loadingGuide, setLoadingGuide] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedContextual, setLoadedContextual] = useState<CachedContextualGuide | null>(null);
  const guideCacheRef = useRef<Map<string, CachedContextualGuide>>(new Map());

  const [progressList, setProgressList] = useState<AdminHelpProgress[]>(initialProgress);
  const [markingReleases, setMarkingReleases] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [onboardingSnoozed, setOnboardingSnoozed] = useState(true);
  const onboardingStorageKey = `admin-help-onboarding-snoozed:${onboarding.id}`;

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setOnboardingSnoozed(window.sessionStorage.getItem(onboardingStorageKey) === "1");
      } catch {
        setOnboardingSnoozed(false);
      }
    });
  }, [onboardingStorageKey]);

  const upsertProgress = useCallback((next: AdminHelpProgress) => {
    setProgressList((prev) => {
      const idx = prev.findIndex((item) => item.guideId === next.guideId);
      if (idx === -1) return [...prev, next];
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }, []);

  const resolvedRoute = useMemo(
    () => resolveHelpEntryForPathname(cleanPath, routeIndex),
    [cleanPath, routeIndex],
  );
  const currentEntry = resolvedRoute.entry;
  const currentSubrouteIndex = resolvedRoute.subroute;

  const loadContextualForCurrentPath = useCallback(
    async (targetPath: string, entryId: string) => {
      const cached = guideCacheRef.current.get(entryId);
      if (cached) {
        setLoadedContextual(cached);
        setLoadError(null);
        return;
      }
      setLoadingGuide(true);
      setLoadError(null);
      const result = await getContextualHelpAction({ pathname: targetPath });
      if (result.ok) {
        const value: CachedContextualGuide = {
          guide: result.guide,
          feedback: result.feedback,
        };
        guideCacheRef.current.set(result.guide.id, value);
        if (result.progress) {
          upsertProgress(result.progress);
        }
        setLoadedContextual(value);
      } else {
        setLoadError(result.message);
      }
      setLoadingGuide(false);
    },
    [upsertProgress],
  );

  const handleOpenContextual = useCallback(() => {
    setOpen(true);
    if (!isHelpCenterRoot && currentEntry) {
      void loadContextualForCurrentPath(cleanPath, currentEntry.id);
    }
  }, [cleanPath, currentEntry, isHelpCenterRoot, loadContextualForCurrentPath, setOpen]);

  // Atajo global `?` para abrir ayuda contextual o enfocar el buscador en /admin/ayuda.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "?") return;
      if (isEditableElement(event.target)) return;
      event.preventDefault();
      if (isHelpCenterLanding) {
        const searchInput = document.getElementById("help-search");
        if (searchInput instanceof HTMLInputElement) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }
      setOpenRouteKey((prev) => {
        const nextOpen = prev !== routeKey;
        if (nextOpen && !isHelpCenterRoot && currentEntry) {
          void loadContextualForCurrentPath(cleanPath, currentEntry.id);
        }
        return nextOpen ? routeKey : null;
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cleanPath,
    currentEntry,
    isHelpCenterLanding,
    isHelpCenterRoot,
    loadContextualForCurrentPath,
    routeKey,
  ]);

  function snoozeOnboarding() {
    try {
      window.sessionStorage.setItem(onboardingStorageKey, "1");
    } catch {
      // sessionStorage opcional; la persistencia principal vive en base de datos.
    }
    setOnboardingSnoozed(true);
  }

  const onboardingProgress = progressList.find((item) => item.guideId === onboarding.id) ?? null;
  const shouldStartOnboarding =
    !isHelpCenterRoot &&
    !onboardingSnoozed &&
    (!onboardingProgress ||
      (onboardingProgress.currentStep === 0 &&
        !onboardingProgress.completedAt &&
        !onboardingProgress.dismissedAt));

  const activeGuide =
    loadedContextual && currentEntry && loadedContextual.guide.id === currentEntry.id
      ? loadedContextual.guide
      : null;
  const activeSubroute = useMemo(
    () => (activeGuide ? resolveSubrouteFromList(cleanPath, activeGuide.subroutes) : null),
    [activeGuide, cleanPath],
  );

  const relatedGuidesForView = useMemo(() => {
    if (!activeGuide) return [];
    const byId = new Map(routeIndex.map((item) => [item.id, item.title]));
    return activeGuide.related
      .map((id) => {
        const title = byId.get(id);
        return title ? { id, title } : null;
      })
      .filter((item): item is { id: string; title: string } => item !== null);
  }, [activeGuide, routeIndex]);

  const relatedPlaybooksForView = useMemo(() => {
    if (!activeGuide?.relatedPlaybooks) return [];
    const byId = new Map(playbookIndex.map((item) => [item.id, item.title]));
    return activeGuide.relatedPlaybooks
      .map((id) => {
        const title = byId.get(id);
        return title ? { id, title } : null;
      })
      .filter((item): item is { id: string; title: string } => item !== null);
  }, [activeGuide, playbookIndex]);

  const filteredQuickPlaybooks = useMemo(() => {
    const terms = normalizeHelpText(quickQuery).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return playbookIndex;
    return playbookIndex.filter((pb) => {
      const hay = normalizeHelpText(`${pb.title} ${pb.summary} ${pb.keywords.join(" ")}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [playbookIndex, quickQuery]);

  const filteredQuickRoutes = useMemo(() => {
    const terms = normalizeHelpText(quickQuery).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return routeIndex;
    return routeIndex.filter((entry) => {
      const hay = normalizeHelpText(
        `${entry.title} ${entry.area} ${entry.summary} ${entry.keywords.join(" ")} ${entry.subroutes.map((s) => s.title).join(" ")}`,
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [quickQuery, routeIndex]);

  const currentGuideProgress = currentEntry
    ? (progressList.find((item) => item.guideId === currentEntry.id) ?? null)
    : null;

  const seenInState =
    progressList.find((item) => item.guideId === RELEASE_NOTES_PROGRESS_ID)?.version ?? 0;
  const seenInProp =
    initialProgress.find((item) => item.guideId === RELEASE_NOTES_PROGRESS_ID)?.version ?? 0;
  const seenReleaseVersion = Math.max(seenInState, seenInProp);
  const hasUnreadReleases =
    releaseSummary.unreadCount > 0 && releaseSummary.latestVersion > seenReleaseVersion;

  const handleMarkReleasesSeen = useCallback(async () => {
    if (markingReleases) return;
    setMarkingReleases(true);
    setReleaseError(null);
    try {
      const result = await markReleaseNotesSeenAction();
      if (result.ok && result.progress) {
        upsertProgress(result.progress);
      } else if (!result.ok) {
        setReleaseError(result.message);
      }
    } catch {
      setReleaseError("No pudimos guardar el estado de lectura. Intenta de nuevo.");
    } finally {
      setMarkingReleases(false);
    }
  }, [markingReleases, upsertProgress]);

  const buttonLabelTitle = currentSubrouteIndex
    ? `${currentEntry?.title}: ${currentSubrouteIndex.title}`
    : (currentEntry?.title ?? "Centro de ayuda");

  return (
    <>
      {isHelpCenterLanding ? null : isHelpCenterDetail ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <button
            type="button"
            data-admin-help="help"
            onClick={() => setOpen(true)}
            className="bg-brand-purple-dark hover:bg-brand-purple focus:ring-brand-purple fixed right-4 bottom-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white shadow-xl transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none"
            aria-label="Abrir índice y buscador rápido de ayuda"
          >
            <BookOpen className="h-5 w-5" aria-hidden />
            <span className="hidden sm:inline">Índice rápido</span>
          </button>
          <SheetContent className="w-full overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
            <SheetHeader className="border-b border-slate-200 pr-10">
              <SheetTitle className="font-display text-brand-purple-dark text-xl">
                Índice rápido y buscador
              </SheetTitle>
              <SheetDescription>
                Salta directo a cualquier flujo E2E o manual de módulo sin perder el ritmo.
              </SheetDescription>
              <div className="relative mt-2">
                <Search
                  className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  type="search"
                  value={quickQuery}
                  onChange={(event) => setQuickQuery(event.target.value)}
                  placeholder="Filtrar flujo, módulo, subruta o palabra clave…"
                  aria-label="Filtrar índice rápido de ayuda"
                  className="focus:border-brand-purple min-h-11 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-9 text-sm text-slate-800 outline-none"
                />
              </div>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-10">
              {filteredQuickPlaybooks.length > 0 && (
                <section aria-label="Flujos E2E disponibles" className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-600 uppercase">
                    <Workflow className="h-3.5 w-3.5" aria-hidden /> Flujos E2E (
                    {filteredQuickPlaybooks.length})
                  </h3>
                  <div className="space-y-1.5">
                    {filteredQuickPlaybooks.map((pb) => {
                      const sp = new URLSearchParams({ flujo: pb.id });
                      if (activeRoleQuery) sp.set("rol", activeRoleQuery);
                      const isCurrent = activeHelpQueryFlow === pb.id;
                      return (
                        <Link
                          key={pb.id}
                          href={`/admin/ayuda?${sp.toString()}`}
                          onClick={() => setOpen(false)}
                          className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border p-3 text-sm transition-colors ${
                            isCurrent
                              ? "border-brand-purple bg-brand-purple/8 text-brand-purple-dark font-bold"
                              : "hover:border-brand-purple border-slate-200 bg-white text-slate-800"
                          }`}
                        >
                          <span className="line-clamp-2">{pb.title}</span>
                          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}

              <section aria-label="Módulos disponibles" className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-600 uppercase">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden /> Módulos (
                  {filteredQuickRoutes.length})
                </h3>
                {filteredQuickRoutes.length > 0 ? (
                  <div className="space-y-1.5">
                    {filteredQuickRoutes.map((entry) => {
                      const sp = new URLSearchParams({ guia: entry.id });
                      if (activeRoleQuery) sp.set("rol", activeRoleQuery);
                      const isCurrent = activeHelpQueryGuide === entry.id;
                      return (
                        <Link
                          key={entry.id}
                          href={`/admin/ayuda?${sp.toString()}`}
                          onClick={() => setOpen(false)}
                          className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border p-3 text-sm transition-colors ${
                            isCurrent
                              ? "border-brand-purple bg-brand-purple/8 text-brand-purple-dark font-bold"
                              : "hover:border-brand-purple border-slate-200 bg-white text-slate-800"
                          }`}
                        >
                          <div>
                            <p className="font-semibold">{entry.title}</p>
                            <p className="text-xs text-slate-500">{entry.area}</p>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
                    Sin coincidencias con «{quickQuery}».
                  </p>
                )}
              </section>
            </div>
          </SheetContent>
        </Sheet>
      ) : currentEntry ? (
        <Sheet
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (nextOpen) {
              void loadContextualForCurrentPath(cleanPath, currentEntry.id);
            }
          }}
        >
          {hasUnreadReleases && (
            <span id="admin-help-unread-desc" className="sr-only">
              Hay {releaseSummary.unreadCount}{" "}
              {releaseSummary.unreadCount === 1 ? "novedad pendiente" : "novedades pendientes"} para
              tu rol
            </span>
          )}
          <button
            type="button"
            data-admin-help="help"
            onClick={handleOpenContextual}
            className="bg-brand-purple-dark hover:bg-brand-purple focus:ring-brand-purple fixed right-4 bottom-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white shadow-xl transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none"
            aria-label={`Abrir ayuda de ${buttonLabelTitle}`}
            aria-describedby={hasUnreadReleases ? "admin-help-unread-desc" : undefined}
          >
            <span className="relative inline-flex">
              <CircleHelp className="h-5 w-5" aria-hidden />
              {hasUnreadReleases && (
                <span
                  aria-hidden
                  className="bg-brand-coral ring-brand-purple-dark absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ring-2"
                />
              )}
            </span>
            <span className="hidden sm:inline">Ayuda</span>
            <kbd
              aria-hidden
              className="hidden rounded bg-white/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white lg:inline"
            >
              ?
            </kbd>
          </button>
          <SheetContent
            className="w-full overflow-y-auto sm:max-w-2xl"
            aria-describedby={undefined}
          >
            <SheetHeader className="border-b border-slate-200 pr-10">
              <SheetTitle className="font-display text-brand-purple-dark text-xl">
                Ayuda de {currentEntry.title}
              </SheetTitle>
              <SheetDescription>
                {currentSubrouteIndex
                  ? `${currentSubrouteIndex.title} — ${currentSubrouteIndex.summary}`
                  : currentEntry.summary}
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  href={`/admin/ayuda?guia=${currentEntry.id}`}
                  onClick={() => setOpen(false)}
                  className="text-brand-purple-dark inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
                >
                  Abrir en el Centro de ayuda <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/admin/ayuda?tab=flujos"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-600 underline-offset-4 hover:underline"
                >
                  Ver Flujos E2E
                </Link>
                <Link
                  href="/admin/ayuda?tab=novedades"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-600 underline-offset-4 hover:underline"
                >
                  Novedades
                </Link>
              </div>
              {hasUnreadReleases && (
                <div
                  role="status"
                  className="border-brand-purple/25 bg-brand-purple/5 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs text-slate-800"
                >
                  <div className="flex items-start gap-2">
                    <Sparkles
                      className="text-brand-purple-dark mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden
                    />
                    <div>
                      <p className="text-brand-purple-dark font-bold">
                        {releaseSummary.unreadCount}{" "}
                        {releaseSummary.unreadCount === 1
                          ? "novedad reciente"
                          : "novedades recientes"}{" "}
                        para tu rol
                      </p>
                      {releaseSummary.latestTitle && (
                        <p className="text-slate-600">{releaseSummary.latestTitle}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/admin/ayuda?tab=novedades"
                      onClick={() => setOpen(false)}
                      className="bg-brand-purple-dark hover:bg-brand-purple inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Ver qué cambió
                    </Link>
                    <button
                      type="button"
                      disabled={markingReleases}
                      onClick={() => void handleMarkReleasesSeen()}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Entendido
                    </button>
                  </div>
                  {releaseError && (
                    <p role="alert" className="w-full text-xs font-medium text-rose-800">
                      {releaseError}
                    </p>
                  )}
                </div>
              )}
            </SheetHeader>

            <div className="px-4 pb-10">
              {activeGuide ? (
                <AdminGuideView
                  guide={activeGuide}
                  role={role}
                  activeSubroute={activeSubroute}
                  relatedGuides={relatedGuidesForView}
                  relatedPlaybooks={relatedPlaybooksForView}
                  initialFeedback={loadedContextual?.feedback ?? null}
                  onNavigate={() => setOpen(false)}
                  interactive={
                    <AdminInteractiveGuide
                      guide={activeGuide}
                      role={role}
                      initialProgress={currentGuideProgress}
                      onProgressChange={upsertProgress}
                      onNavigate={() => setOpen(false)}
                    />
                  }
                />
              ) : loadingGuide ? (
                <div
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700"
                  role="status"
                >
                  <Loader2 className="text-brand-purple h-5 w-5 animate-spin" aria-hidden />
                  Cargando guía operativa de {currentEntry.title}…
                </div>
              ) : loadError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                  {loadError}
                </div>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Link
          href="/admin/ayuda"
          data-admin-help="help"
          className="bg-brand-purple-dark fixed right-4 bottom-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white shadow-xl"
        >
          <CircleHelp className="h-5 w-5" aria-hidden /> Ayuda
        </Link>
      )}

      {shouldStartOnboarding && (
        <AdminInteractiveGuide
          guide={onboarding}
          role={role}
          initialProgress={onboardingProgress}
          variant="welcome-floating"
          autoStart
          onProgressChange={upsertProgress}
          onClose={snoozeOnboarding}
        />
      )}

      <Link
        href="/admin/ayuda?tab=dia-1&aprender=1"
        className="sr-only"
        aria-label={`Abrir ${onboarding.title}`}
      >
        <GraduationCap aria-hidden /> {onboarding.title}
      </Link>
    </>
  );
}
