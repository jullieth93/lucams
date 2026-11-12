"use client";

/*
 * Tabs de /admin/disenos (2026-09-15): "Diseños por producto" (galería de diseños
 * prediseñados) y "Fichas del abecedario" (antes /admin/fichas). Reutiliza el patrón
 * AdminTabBar (?tab=, deep-linkable) de components/admin/admin-tabs.tsx.
 */

import type { ReactNode } from "react";
import { Images, Sparkles } from "lucide-react";
import { AdminTabBar, AdminTabPanel, useAdminActiveTab } from "@/components/admin/admin-tabs";

const TABS = [
  {
    value: "productos",
    label: "Diseños por producto",
    icon: <Images className="h-4 w-4 shrink-0" aria-hidden />,
  },
  {
    value: "fichas",
    label: "Fichas del abecedario",
    icon: <Sparkles className="h-4 w-4 shrink-0" aria-hidden />,
  },
] as const;

export function DisenosTabs({ productos, fichas }: { productos: ReactNode; fichas: ReactNode }) {
  const active = useAdminActiveTab(
    "tab",
    "productos",
    TABS.map((t) => t.value),
  );
  return (
    <>
      <AdminTabBar
        param="tab"
        defaultTab="productos"
        tabs={[...TABS]}
        className="sm:rounded-xl sm:border-b sm:shadow-xs"
      />
      <AdminTabPanel value="productos" active={active}>
        {productos}
      </AdminTabPanel>
      <AdminTabPanel value="fichas" active={active}>
        {fichas}
      </AdminTabPanel>
    </>
  );
}
