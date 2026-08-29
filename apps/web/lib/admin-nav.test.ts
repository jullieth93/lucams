/*
 * Tests de lib/admin-nav.ts — getAdminNav() según el modo de tienda.
 *
 * El módulo evalúa NEXT_PUBLIC_STORE_MODE AL IMPORTARSE (vía lib/store-mode),
 * así que cada caso corre con `vi.resetModules()` + import dinámico tras fijar
 * el valor (mismo patrón que lib/store-mode.test.ts).
 *
 * FOCO:
 *   - En AMBOS modos se ocultan los módulos futuros descopeados:
 *     "Mercado Libre" dentro de Canales y "Bot WhatsApp" dentro de Contenido.
 *   - modo full: todo lo demás visible (Finanzas, Integraciones, Precios al por mayor).
 *   - modo catalog: además oculta el grupo "Finanzas" completo, el item
 *     "Integraciones" de "Configuración" (no hay pagos ni envíos integrados)
 *     y "Precios al por mayor" de "Promociones" (WholesaleTier sin consumidor en Etapa 1).
 *   - "Cotizaciones" es el primer item de "Ventas" en AMBOS modos.
 *   - El filtrado NO muta ADMIN_NAV (el catch-all placeholder sigue viendo
 *     todos los módulos para su info contextual).
 *   - filterNavByRole(getAdminNav(), "CMS_EDITOR") deja el contenido del sitio
 *     (Páginas del sitio, Ajustes del sitio, Plantillas de correo) + Seguridad
 *     (autoservicio de cuenta — MFA obligatorio para todo rol, B-1 2026-08-24).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterNavByRole } from "./admin-rbac";

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

async function getNavForMode(mode: "full" | "catalog") {
  process.env[KEY] = mode;
  const mod = await loadNav();
  return { mod, nav: mod.getAdminNav() };
}

describe("getAdminNav", () => {
  it("modo full: Finanzas e Integraciones están visibles", async () => {
    const { nav } = await getNavForMode("full");

    expect(nav.some((g) => g.title === "Finanzas")).toBe(true);
    const config = nav.find((g) => g.title === "Configuración");
    expect(config?.items?.some((it) => it.href === "/admin/integraciones")).toBe(true);
  });

  it.each(["full", "catalog"] as const)(
    "modo %s: oculta Mercado Libre y Bot WhatsApp IA",
    async (mode) => {
      const { nav } = await getNavForMode(mode);

      const allHrefs = nav.flatMap((g) => (g.items ?? []).map((it) => it.href));
      const allLabels = nav.flatMap((g) => (g.items ?? []).map((it) => it.label));

      expect(allHrefs).not.toContain("/admin/canales/mercadolibre");
      expect(allLabels).not.toContain("Mercado Libre");
      expect(allLabels).not.toContain("Bot WhatsApp");
    },
  );

  it("modo catalog: oculta el grupo Finanzas y el item Integraciones", async () => {
    const { nav } = await getNavForMode("catalog");

    expect(nav.some((g) => g.title === "Finanzas")).toBe(false);
    const config = nav.find((g) => g.title === "Configuración");
    expect(config).toBeDefined();
    expect(config?.items?.some((it) => it.href === "/admin/integraciones")).toBe(false);
    // El resto de items de Configuración sigue (Ajustes del sitio, Seguridad, Redirects…).
    expect(config?.items?.some((it) => it.href === "/admin/contenido/paginas/global")).toBe(true);
    expect(config?.items?.some((it) => it.href === "/admin/seguridad")).toBe(true);
  });

  it("modo catalog: oculta Precios al por mayor de Promociones pero conserva Cupones", async () => {
    process.env[KEY] = "catalog";
    const mod = await loadNav();
    const promo = mod.getAdminNav().find((g) => g.title === "Promociones");

    expect(promo).toBeDefined();
    expect(promo?.items?.some((it) => it.href === "/admin/mayorista")).toBe(false);
    // Cupones sí aplica en Etapa 1 (se crean ahora, se activan con los pagos).
    expect(promo?.items?.some((it) => it.href === "/admin/cupones")).toBe(true);
  });

  it("modo full: Precios al por mayor visible en Promociones", async () => {
    process.env[KEY] = "full";
    const mod = await loadNav();
    const promo = mod.getAdminNav().find((g) => g.title === "Promociones");

    expect(promo?.items?.some((it) => it.href === "/admin/mayorista")).toBe(true);
  });

  it.each(["full", "catalog"] as const)(
    "Cotizaciones es el primer item de Ventas (modo %s)",
    async (mode) => {
      const { nav } = await getNavForMode(mode);
      const ventas = nav.find((g) => g.title === "Ventas");

      expect(ventas?.items?.[0]?.label).toBe("Cotizaciones");
      expect(ventas?.items?.[0]?.href).toBe("/admin/cotizaciones");
    },
  );

  it.each(["full", "catalog"] as const)("modo %s: el filtrado NO muta ADMIN_NAV", async (mode) => {
    const { mod } = await getNavForMode(mode);

    // ADMIN_NAV conserva todos los módulos originales.
    expect(mod.ADMIN_NAV.some((g) => g.title === "Finanzas")).toBe(true);
    const canales = mod.ADMIN_NAV.find((g) => g.title === "Canales");
    expect(canales?.items?.some((it) => it.label === "Mercado Libre")).toBe(true);
    const ia = mod.ADMIN_NAV.find((g) => g.title === "Contenido");
    expect(ia?.items?.some((it) => it.label === "Bot WhatsApp")).toBe(true);
  });

  it("modo full: getAdminNav() filtra descopeados sin mutar ADMIN_NAV", async () => {
    process.env[KEY] = "full";
    const mod = await loadNav();
    const nav = mod.getAdminNav();

    // Filtra: no devuelve la misma referencia porque oculta módulos descopeados.
    expect(nav).not.toBe(mod.ADMIN_NAV);

    // Los descopeados no aparecen en el NAV efectivo.
    const allLabels = nav.flatMap((g) => (g.items ?? []).map((it) => it.label));
    expect(allLabels).not.toContain("Mercado Libre");
    expect(allLabels).not.toContain("Bot WhatsApp");

    // ADMIN_NAV original conserva todo (lo usa el catch-all placeholder).
    expect(mod.ADMIN_NAV.some((g) => g.title === "Canales")).toBe(true);
    const canales = mod.ADMIN_NAV.find((g) => g.title === "Canales");
    expect(canales?.items?.some((it) => it.label === "Mercado Libre")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterNavByRole sobre el NAV real — rol CMS_EDITOR (solo contenido del sitio)
// ---------------------------------------------------------------------------

describe("filterNavByRole(getAdminNav()) — CMS_EDITOR", () => {
  it.each(["full", "catalog"] as const)(
    "modo %s: ve SOLO los grupos Contenido y Configuración",
    async (mode) => {
      const { nav } = await getNavForMode(mode);
      const visible = filterNavByRole(nav, "CMS_EDITOR");

      expect(visible.map((g) => g.title)).toEqual(["Contenido", "Configuración"]);
    },
  );

  it.each(["full", "catalog"] as const)(
    "modo %s: ve exactamente Páginas del sitio, Ajustes del sitio, Seguridad y Plantillas de correo",
    async (mode) => {
      const { nav } = await getNavForMode(mode);
      const visible = filterNavByRole(nav, "CMS_EDITOR");

      const contenido = visible.find((g) => g.title === "Contenido");
      expect(contenido?.items?.map((it) => it.href)).toEqual([
        "/admin/contenido",
        "/admin/contenido/mediateca",
      ]);

      const config = visible.find((g) => g.title === "Configuración");
      // Seguridad (autoservicio MFA) quedó abierta a todos los roles en B-1.
      expect(config?.items?.map((it) => it.href)).toEqual([
        "/admin/contenido/paginas/global",
        "/admin/seguridad",
        "/admin/email-templates",
      ]);
    },
  );

  it.each(["full", "catalog"] as const)(
    "modo %s: NO ve dashboard, usuarios, finanzas ni cupones",
    async (mode) => {
      const { nav } = await getNavForMode(mode);
      const visible = filterNavByRole(nav, "CMS_EDITOR");

      const allHrefs = [
        ...visible.flatMap((g) => (g.items ?? []).map((it) => it.href)),
        ...visible.filter((g) => g.href).map((g) => g.href as string),
      ];
      expect(allHrefs).not.toContain("/admin/dashboard");
      expect(allHrefs).not.toContain("/admin/usuarios");
      expect(allHrefs).not.toContain("/admin/finanzas");
      expect(allHrefs).not.toContain("/admin/cupones");
      // Y todo lo visible es contenido o autoservicio de cuenta (coherente con la matriz).
      for (const href of allHrefs) {
        expect(
          href.startsWith("/admin/contenido") ||
            href === "/admin/email-templates" ||
            href === "/admin/seguridad",
        ).toBe(true);
      }
    },
  );
});
