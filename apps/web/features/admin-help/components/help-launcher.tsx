"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminRole } from "@lucams/db";
import { ArrowRight, CircleHelp, GraduationCap } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AdminHelpProgress, AdminModuleGuide, AdminOnboardingGuide } from "../types";
import { AdminGuideView } from "./guide-view";
import { AdminInteractiveGuide } from "./interactive-guide";

export function AdminHelpLauncher({
  guide,
  onboarding,
  role,
  progress,
}: {
  guide: AdminModuleGuide | null;
  onboarding: AdminOnboardingGuide;
  role: AdminRole;
  progress: AdminHelpProgress[];
}) {
  const [open, setOpen] = useState(false);
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

  function snoozeOnboarding() {
    try {
      window.sessionStorage.setItem(onboardingStorageKey, "1");
    } catch {
      // La persistencia de sesión es una mejora; el avance del servidor sigue disponible.
    }
    setOnboardingSnoozed(true);
  }

  const guideProgress = progress.find((item) => item.guideId === guide?.id) ?? null;
  const onboardingProgress = progress.find((item) => item.guideId === onboarding.id) ?? null;
  const shouldStartOnboarding =
    !onboardingSnoozed &&
    (!onboardingProgress ||
      (onboardingProgress.currentStep === 0 &&
        !onboardingProgress.completedAt &&
        !onboardingProgress.dismissedAt));

  return (
    <>
      {guide ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <button
            type="button"
            data-admin-help="help"
            onClick={() => setOpen(true)}
            className="bg-brand-purple hover:bg-brand-purple-dark focus:ring-brand-purple fixed right-4 bottom-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white shadow-xl transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none"
            aria-label={`Abrir ayuda de ${guide.title}`}
          >
            <CircleHelp className="h-5 w-5" aria-hidden />
            <span className="hidden sm:inline">Ayuda</span>
          </button>
          <SheetContent
            className="w-full overflow-y-auto sm:max-w-2xl"
            aria-describedby={undefined}
          >
            <SheetHeader className="border-b border-slate-200 pr-10">
              <SheetTitle className="font-display text-brand-purple-dark text-xl">
                Ayuda de {guide.title}
              </SheetTitle>
              <SheetDescription>{guide.summary}</SheetDescription>
              <Link
                href={`/admin/ayuda?guia=${guide.id}`}
                onClick={() => setOpen(false)}
                className="text-brand-purple inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
              >
                Abrir en el Centro de ayuda <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </SheetHeader>
            <div className="px-4 pb-10">
              <AdminGuideView
                guide={guide}
                role={role}
                interactive={
                  <AdminInteractiveGuide
                    guide={guide}
                    role={role}
                    initialProgress={guideProgress}
                    onStart={() => setOpen(false)}
                  />
                }
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Link
          href="/admin/ayuda"
          data-admin-help="help"
          className="bg-brand-purple fixed right-4 bottom-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white shadow-xl"
        >
          <CircleHelp className="h-5 w-5" aria-hidden /> Ayuda
        </Link>
      )}

      {shouldStartOnboarding && (
        <AdminInteractiveGuide
          guide={onboarding}
          role={role}
          initialProgress={onboardingProgress}
          autoStart
          onClose={snoozeOnboarding}
        />
      )}

      <Link
        href="/admin/ayuda?aprender=1"
        className="sr-only"
        aria-label={`Abrir ${onboarding.title}`}
      >
        <GraduationCap aria-hidden /> {onboarding.title}
      </Link>
    </>
  );
}
