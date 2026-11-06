import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_CAPABILITIES } from "@/lib/admin-rbac";
import { ONBOARDING_GUIDES } from "./content/onboarding";
import {
  ADMIN_MODULE_GUIDES,
  buildModuleSteps,
  getAvailableModuleGuides,
  getGuideForPath,
  getModuleGuideById,
  getOnboardingForRole,
  getProceduresForRole,
  searchModuleGuides,
} from "./registry";

const ROLES = [
  "SUPERADMIN",
  "OPERATIONS_MANAGER",
  "CUSTOMER_SUPPORT",
  "PRINT_WORKSHOP",
  "FINANCE_ANALYST",
  "MANAGER",
  "FULFILLMENT",
  "CMS_EDITOR",
] as const;

function adminPageRoutes(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return adminPageRoutes(path.join(directory, entry.name), relative);
    if (entry.name !== "page.tsx" || relative.includes("[...placeholder]")) return [];
    const route = path.posix.dirname(relative).replace(/^\/+/, "");
    return [`/admin${route ? `/${route}` : ""}`];
  });
}

describe("admin help registry", () => {
  it("cubre automáticamente todas las páginas reales del panel", () => {
    const routes = adminPageRoutes(path.resolve(process.cwd(), "app/admin/(panel)"));
    expect(routes.length).toBeGreaterThan(40);
    const missing = routes.filter((route) => !getGuideForPath(route, "SUPERADMIN"));
    expect(missing).toEqual([]);
  });

  it("tiene identificadores únicos, contenido completo y relaciones válidas", () => {
    const ids = ADMIN_MODULE_GUIDES.map((guide) => guide.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ADMIN_MODULE_GUIDES).toHaveLength(44);

    for (const guide of ADMIN_MODULE_GUIDES) {
      expect(guide.purpose.length, guide.id).toBeGreaterThan(80);
      expect(guide.whenToUse.length, guide.id).toBeGreaterThan(0);
      expect(guide.concepts.length, guide.id).toBeGreaterThan(0);
      expect(guide.sections.length, guide.id).toBeGreaterThan(0);
      expect(guide.procedures.length, guide.id).toBeGreaterThan(0);
      expect(guide.cautions.length, guide.id).toBeGreaterThan(0);
      expect(guide.faqs.length, guide.id).toBeGreaterThan(0);
      expect(guide.version, guide.id).toBeGreaterThan(0);
      for (const section of guide.sections) {
        expect(section.topics.length, `${guide.id}.${section.id}`).toBeGreaterThan(0);
        for (const topic of section.topics) {
          expect(topic.description.length, `${guide.id}.${topic.id}`).toBeGreaterThan(25);
        }
      }
      for (const procedure of guide.procedures) {
        expect(procedure.steps.length, `${guide.id}.${procedure.id}`).toBeGreaterThanOrEqual(3);
        expect(procedure.expected.length, `${guide.id}.${procedure.id}`).toBeGreaterThan(30);
      }
      for (const related of guide.related) {
        expect(
          ADMIN_MODULE_GUIDES.some((candidate) => candidate.id === related),
          `${guide.id} → ${related}`,
        ).toBe(true);
      }
    }
  });

  it("ofrece onboarding para los ocho roles y solo módulos autorizados", () => {
    expect(ONBOARDING_GUIDES.map((guide) => guide.role).sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      const onboarding = getOnboardingForRole(role);
      expect(onboarding.steps.length).toBeGreaterThanOrEqual(4);
      for (const moduleId of onboarding.moduleIds) {
        expect(getModuleGuideById(moduleId, role), `${role}: ${moduleId}`).not.toBeNull();
      }
    }
    expect(
      getAvailableModuleGuides("CMS_EDITOR")
        .map((guide) => guide.id)
        .sort(),
    ).toEqual(["ayuda", "contenido", "seguridad"]);
    expect(getModuleGuideById("finanzas", "CMS_EDITOR")).toBeNull();
  });

  it("resuelve subrutas y rutas históricas con el contenido correcto", () => {
    expect(getGuideForPath("/admin/pedidos/LCM-2026-0001", "PRINT_WORKSHOP")?.id).toBe("pedidos");
    expect(getGuideForPath("/admin/contenido/campos/campo-1", "CMS_EDITOR")?.id).toBe("contenido");
    expect(getGuideForPath("/admin/mensajes", "CUSTOMER_SUPPORT")?.id).toBe("soporte");
    expect(getGuideForPath("/admin/reclamos/caso-1", "SUPERADMIN")?.id).toBe("garantias");
    expect(getGuideForPath("/admin/fichas", "SUPERADMIN")?.id).toBe("disenos");
  });

  it("busca sin depender de tildes y limita procedimientos por rol", () => {
    expect(
      searchModuleGuides("FINANCE_ANALYST", "conciliar remesa").some(
        (guide) => guide.id === "conciliacion",
      ),
    ).toBe(true);
    expect(
      searchModuleGuides("SUPERADMIN", "configurar recuperación automática").some(
        (guide) => guide.id === "carritos",
      ),
    ).toBe(true);
    expect(
      searchModuleGuides("CUSTOMER_SUPPORT", "conciliación").some(
        (guide) => guide.id === "conciliacion",
      ),
    ).toBe(false);
    const orders = getModuleGuideById("pedidos", "SUPERADMIN")!;
    expect(
      getProceduresForRole(orders, "CUSTOMER_SUPPORT").map((procedure) => procedure.id),
    ).toEqual(["consultar-pedido-soporte"]);
    expect(buildModuleSteps(orders, "PRINT_WORKSHOP", "preparar-produccion")).toHaveLength(6);
  });

  it("mantiene el catálogo RBAC alineado con las capacidades usadas por las guías", () => {
    expect(ADMIN_CAPABILITIES).toHaveLength(35);
  });
});
