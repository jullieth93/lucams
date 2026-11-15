import { describe, expect, it } from "vitest";
import { ADMIN_NAV, getAdminNav } from "./admin-nav";
import { filterNavByRole } from "./admin-rbac";

describe("getAdminNav", () => {
  it("muestra Finanzas, Integraciones, Mayorista y Fidelización", () => {
    const nav = getAdminNav();
    expect(nav.some((g) => g.title === "Finanzas")).toBe(true);
    const config = nav.find((g) => g.title === "Configuración");
    expect(config?.items?.some((it) => it.href === "/admin/integraciones")).toBe(true);
    const promo = nav.find((g) => g.title === "Promociones");
    expect(promo?.items?.some((it) => it.href === "/admin/mayorista")).toBe(true);
    expect(promo?.items?.some((it) => it.href === "/admin/cupones")).toBe(true);
    expect(promo?.items?.some((it) => it.href === "/admin/fidelizacion")).toBe(true);
  });

  it("oculta módulos descopeados sin mutar ADMIN_NAV", () => {
    const nav = getAdminNav();
    const allLabels = nav.flatMap((g) => (g.items ?? []).map((it) => it.label));
    expect(allLabels).not.toContain("Mercado Libre");
    expect(allLabels).not.toContain("Bot WhatsApp");
    expect(nav).not.toBe(ADMIN_NAV);
    const canales = ADMIN_NAV.find((g) => g.title === "Canales");
    expect(canales?.items?.some((it) => it.label === "Mercado Libre")).toBe(true);
  });

  it("Pedidos es el primer item de Ventas y Cotizaciones no existe", () => {
    for (const source of [getAdminNav(), ADMIN_NAV]) {
      const ventas = source.find((g) => g.title === "Ventas");
      expect(ventas?.items?.[0]?.label).toBe("Pedidos");
    }
  });

  it("conserva Marketing y los módulos del Estudio", () => {
    const nav = getAdminNav();
    const marketing = nav.find((g) => g.title === "Marketing");
    expect(marketing?.items?.some((it) => it.href === "/admin/marketing/suscriptores")).toBe(true);
    const catalogo = nav.find((g) => g.title === "Catálogo");
    const hrefs = (catalogo?.items ?? []).map((it) => it.href);
    expect(hrefs).toContain("/admin/disenos");
    expect(hrefs).not.toContain("/admin/fichas");
    const iPlantillas = hrefs.indexOf("/admin/plantillas");
    expect(hrefs[iPlantillas + 1]).toBe("/admin/disenos");
  });

  it("NO hay entrada Mensajes; Soporte vive en Servicio al cliente", () => {
    for (const source of [getAdminNav(), ADMIN_NAV]) {
      const hrefs = [
        ...source.flatMap((g) => (g.items ?? []).map((it) => it.href)),
        ...source.filter((g) => g.href).map((g) => g.href as string),
      ];
      const labels = [
        ...source.flatMap((g) => (g.items ?? []).map((it) => it.label)),
        ...source.map((g) => g.title),
      ];
      expect(hrefs).not.toContain("/admin/mensajes");
      expect(labels).not.toContain("Mensajes");
      const servicio = source.find((g) => g.title === "Servicio al cliente");
      expect(servicio?.items?.some((it) => it.href === "/admin/soporte")).toBe(true);
    }
  });
});

describe("filterNavByRole(getAdminNav())", () => {
  it("MANAGER ve Suscriptores; FULFILLMENT y CMS_EDITOR no", () => {
    const nav = getAdminNav();
    const manager = filterNavByRole(nav, "MANAGER");
    expect(
      manager
        .find((g) => g.title === "Marketing")
        ?.items?.some((it) => it.href === "/admin/marketing/suscriptores"),
    ).toBe(true);
    for (const role of ["FULFILLMENT", "CMS_EDITOR"] as const) {
      expect(filterNavByRole(nav, role).some((g) => g.title === "Marketing")).toBe(false);
    }
  });

  it("MANAGER y OPERATIONS_MANAGER ven Tienda y Envíos, pero NO Integraciones", () => {
    const nav = getAdminNav();
    for (const role of ["MANAGER", "OPERATIONS_MANAGER"] as const) {
      const visible = filterNavByRole(nav, role);
      const canales = visible.find((g) => g.title === "Canales");
      expect(canales?.items?.map((it) => it.href)).toEqual(["/admin/canales/tienda"]);
      const configHrefs =
        visible.find((g) => g.title === "Configuración")?.items?.map((it) => it.href) ?? [];
      expect(configHrefs).toContain("/admin/envios");
      expect(configHrefs).not.toContain("/admin/integraciones");
      expect(configHrefs).not.toContain("/admin/email-templates");
    }
  });

  it("MANAGER ve diseños, Garantías y Retractos; FULFILLMENT no", () => {
    const nav = getAdminNav();
    const manager = filterNavByRole(nav, "MANAGER");
    const managerHrefs = manager.flatMap((g) => (g.items ?? []).map((it) => it.href));
    expect(managerHrefs).toContain("/admin/disenos");
    expect(managerHrefs).toContain("/admin/garantias");
    expect(managerHrefs).toContain("/admin/retractos");

    const fulfillment = filterNavByRole(nav, "FULFILLMENT");
    const fulfillmentHrefs = fulfillment.flatMap((g) => (g.items ?? []).map((it) => it.href));
    expect(fulfillmentHrefs).not.toContain("/admin/disenos");
    expect(fulfillmentHrefs).not.toContain("/admin/garantias");
    expect(fulfillmentHrefs).not.toContain("/admin/retractos");
    expect(fulfillment.some((g) => g.title === "Servicio al cliente")).toBe(false);
  });

  it("CMS_EDITOR ve únicamente sus módulos de contenido y seguridad", () => {
    const visible = filterNavByRole(getAdminNav(), "CMS_EDITOR");
    expect(visible.map((g) => g.title)).toEqual(["Contenido", "Configuración"]);
    expect(visible.find((g) => g.title === "Contenido")?.items?.map((it) => it.href)).toEqual([
      "/admin/contenido",
      "/admin/contenido/mediateca",
    ]);
    expect(visible.find((g) => g.title === "Configuración")?.items?.map((it) => it.href)).toEqual([
      "/admin/seguridad",
      "/admin/redirects",
    ]);
  });
});
