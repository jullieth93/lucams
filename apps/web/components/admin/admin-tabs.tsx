"use client";

/*
 * <AdminTabBar> + useAdminActiveTab — tabs server-friendly para forms admin.
 *
 * Diseño (ADM-P0-001 / Bloque A2 — Lucy 2026-06-26):
 *
 *  - Tabs cambian con searchParam (?tab=resumen). Deep-linkable + refresh-safe.
 *  - Cliente usa router.replace (no push) → no contamina history.
 *  - **TODOS los paneles SIEMPRE montados** en el DOM. Solo togglea visibilidad
 *    con `hidden` attribute. Esto evita que FormData pierda inputs no visibles
 *    bajo `useActionState` (issue identificado en plan redesign admin).
 *  - Tab activa por default cuando ?tab= ausente o inválido.
 *  - Paleta brand-purple (no slate). Touch targets ≥44px en mobile.
 *
 * Uso típico:
 *
 *   const activeTab = useAdminActiveTab("tab", "resumen", ["resumen", "texto", ...]);
 *   <AdminTabBar param="tab" defaultTab="resumen" tabs={[
 *     { value: "resumen", label: "Resumen" },
 *     { value: "texto", label: "Texto y bot" },
 *     ...
 *   ]} />
 *   <div hidden={activeTab !== "resumen"}>{...}</div>
 *   <div hidden={activeTab !== "texto"}>{...}</div>
 *   ...
 */

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type AdminTab = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  /** Badge a la derecha del label (ej. "(3)" o un dot rojo de alerta). */
  badge?: React.ReactNode;
};

/**
 * Hook server/client-friendly que devuelve la tab activa actual.
 * En server components usar searchParams del page; este hook es para
 * client components que necesitan reaccionar a cambios de URL.
 *
 * Si `allowedValues` se proporciona, valida que el query sea uno de ellos
 * — defiende contra URLs manipuladas (ej. `?tab=<script>`).
 */
export function useAdminActiveTab(
  paramName: string,
  defaultTab: string,
  allowedValues?: readonly string[],
): string {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const candidate = searchParams.get(paramName) ?? defaultTab;
    if (allowedValues && !allowedValues.includes(candidate)) return defaultTab;
    return candidate;
  }, [searchParams, paramName, defaultTab, allowedValues]);
}

export function AdminTabBar({
  tabs,
  param,
  defaultTab,
  className,
}: {
  tabs: AdminTab[];
  param: string;
  defaultTab: string;
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get(param) ?? defaultTab;

  const goto = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === defaultTab) next.delete(param);
    else next.set(param, value);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  return (
    <div
      role="tablist"
      aria-label="Secciones del formulario"
      className={
        "border-brand-purple/15 sticky top-0 z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b bg-white/95 px-4 py-1 backdrop-blur sm:mx-0 sm:rounded-t-xl sm:border sm:border-b-0 sm:px-2 " +
        (className ?? "")
      }
    >
      {tabs.map((t) => {
        const isActive = t.value === active;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`admin-tab-${t.value}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => goto(t.value)}
            className={
              "focus-visible:ring-brand-purple/50 inline-flex h-11 min-w-[88px] shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none " +
              (isActive
                ? "bg-brand-purple text-white shadow-sm"
                : "text-brand-purple-dark/70 hover:bg-brand-purple/8 hover:text-brand-purple-dark")
            }
          >
            {t.icon}
            <span>{t.label}</span>
            {t.badge != null && <span className="ml-0.5">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Wrapper de un panel (sección). Mantiene el panel en el DOM siempre
 * (importante para preservar inputs bajo useActionState) y solo togglea
 * visibilidad con `hidden`.
 */
export function AdminTabPanel({
  value,
  active,
  children,
}: {
  value: string;
  active: string;
  children: React.ReactNode;
}) {
  const isActive = value === active;
  return (
    <div
      role="tabpanel"
      id={`admin-tab-${value}`}
      aria-labelledby={`admin-tab-trigger-${value}`}
      hidden={!isActive}
      className={isActive ? "space-y-5" : ""}
    >
      {children}
    </div>
  );
}
