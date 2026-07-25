/*
 * Tests de lib/admin-nav.ts — getAdminNav() según el modo de tienda (Etapa 1/2).
 *
 * El módulo evalúa NEXT_PUBLIC_STORE_MODE AL IMPORTARSE (vía lib/store-mode),
 * así que cada caso corre con `vi.resetModules()` + import dinámico tras fijar
 * el valor (mismo patrón que lib/store-mode.test.ts).
 *
 * FOCO:
 *   - modo full: getAdminNav() === ADMIN_NAV (con Finanzas e Integraciones).
 *   - modo catalog: oculta el grupo "Finanzas" completo y el item
 *     "Integraciones" de "Configuración" (no hay pagos ni envíos integrados).
 *   - "Cotizaciones" es el primer item de "Ventas" en AMBOS modos.
 *   - el filtrado NO muta ADMIN_NAV (el catch-all placeholder sigue viendo
 *     todos los módulos para su info contextual).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "NEXT_PUBLIC_STORE_MODE";
const original = process.env[KEY];

async function loadNav() {
  return import("./admin-nav");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("getAdminNav", () => {
  it("modo full: devuelve ADMIN_NAV intacto (Finanzas e Integraciones visibles)", async () => {
    process.env[KEY] = "full";
    const mod = await loadNav();
    const nav = mod.getAdminNav();

    expect(nav).toBe(mod.ADMIN_NAV); // misma referencia, sin filtrar
    expect(nav.some((g) => g.title === "Finanzas")).toBe(true);
    const config = nav.find((g) => g.title === "Configuración");
    expect(config?.items?.some((it) => it.href === "/admin/integraciones")).toBe(true);
  });

  it("modo catalog: oculta el grupo Finanzas completo", async () => {
    process.env[KEY] = "catalog";
    const mod = await loadNav();
    const nav = mod.getAdminNav();

    expect(nav.some((g) => g.title === "Finanzas")).toBe(false);
    // Y ningún link a /admin/finanzas sobrevive en otro grupo.
    const allHrefs = nav.flatMap((g) => (g.items ?? []).map((it) => it.href));
    expect(allHrefs.some((h) => h.startsWith("/admin/finanzas"))).toBe(false);
  });

  it("modo catalog: oculta Integraciones de Configuración pero conserva el resto del grupo", async () => {
    process.env[KEY] = "catalog";
    const mod = await loadNav();
    const nav = mod.getAdminNav();

    const config = nav.find((g) => g.title === "Configuración");
    expect(config).toBeDefined();
    expect(config?.items?.some((it) => it.href === "/admin/integraciones")).toBe(false);
    // El resto de items de Configuración sigue (General, Seguridad, Redirects…).
    expect(config?.items?.some((it) => it.href === "/admin/contenido/configuracion")).toBe(true);
    expect(config?.items?.some((it) => it.href === "/admin/seguridad")).toBe(true);
  });

  it.each(["full", "catalog"])(
    "Cotizaciones es el primer item de Ventas (modo %s)",
    async (mode) => {
      process.env[KEY] = mode;
      const mod = await loadNav();
      const ventas = mod.getAdminNav().find((g) => g.title === "Ventas");

      expect(ventas?.items?.[0]?.label).toBe("Cotizaciones");
      expect(ventas?.items?.[0]?.href).toBe("/admin/cotizaciones");
    },
  );

  it("modo catalog: el filtrado NO muta ADMIN_NAV (el placeholder sigue viendo todo)", async () => {
    process.env[KEY] = "catalog";
    const mod = await loadNav();
    mod.getAdminNav(); // corre el filtrado

    // ADMIN_NAV (lo que usa findNavItem del catch-all) conserva Finanzas e
    // Integraciones después del filtrado.
    expect(mod.ADMIN_NAV.some((g) => g.title === "Finanzas")).toBe(true);
    const config = mod.ADMIN_NAV.find((g) => g.title === "Configuración");
    expect(config?.items?.some((it) => it.href === "/admin/integraciones")).toBe(true);
  });
});
