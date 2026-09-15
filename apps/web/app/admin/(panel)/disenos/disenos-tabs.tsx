"use client";

/*
 * Tabs de /admin/disenos (2026-09-15): "Diseños por producto" (galería de diseños
 * prediseñados) y "Fichas del abecedario" (antes /admin/fichas). Reutiliza el patrón
 * AdminTabBar (?tab=, deep-linkable) de components/admin/admin-tabs.tsx.
 */

import type { ReactNode } from "react";
import { AdminTabBar, AdminTabPanel, useAdminActiveTab } from "@/components/admin/admin-tabs";

const TABS = [
  { value: "productos", label: "Diseños por producto" },
  { value: "fichas", label: "Fichas del abecedario" },
] as const;

export function DisenosTabs({ productos, fichas }: { productos: ReactNode; fichas: ReactNode }) {
  const active = useAdminActiveTab("tab", "productos", TABS.map((t) => t.value));
  return (
    <>
      <AdminTabBar param="tab" defaultTab="productos" tabs={[...TABS]} />
      <AdminTabPanel value="productos" active={active}>
        {productos}
      </AdminTabPanel>
      <AdminTabPanel value="fichas" active={active}>
        {fichas}
      </AdminTabPanel>
    </>
  );
}
