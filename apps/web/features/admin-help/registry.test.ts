import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATE_REGISTRY } from "@/features/emails/registry";
import { RETROACTIVE_EARN_WINDOW_DAYS } from "@/features/loyalty/service";
import { getAdminNav } from "@/lib/admin-nav";
import { ADMIN_CAPABILITIES, canAccessAdminPath } from "@/lib/admin-rbac";
import { ADMIN_ROLES_ALL } from "@/lib/admin-roles";
import { HELP_LIVE_NUMBERS } from "./constants";
import { DAILY_ROUTINES } from "./content/daily-routines";
import { ADMIN_QUICK_RULES } from "./content/glossary-and-rules";
import { ONBOARDING_GUIDES } from "./content/onboarding";
import {
  ADMIN_MODULE_GUIDES,
  ADMIN_PLAYBOOKS,
  buildModuleSteps,
  getAvailableModuleGuides,
  getAvailablePlaybooks,
  getConsolidatedGlossary,
  getDailyRoutineForRole,
  getGuideAndSubrouteForPath,
  getGuideForPath,
  getHelpRouteIndex,
  getModuleGuideById,
  getOnboardingForRole,
  getPlaybookById,
  getProceduresForRole,
  searchGlossary,
  searchModuleGuides,
  searchPlaybooks,
} from "./registry";
import { resolveHelpEntryForPathname } from "./route-matcher";

const ROLES = ADMIN_ROLES_ALL;

function adminPageRoutes(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return adminPageRoutes(path.join(directory, entry.name), relative);
    if (entry.name !== "page.tsx" || relative.includes("[...placeholder]")) return [];
    const route = path.posix.dirname(relative).replace(/^\/+/, "");
    return [`/admin${route ? `/${route}` : ""}`];
  });
}

describe("admin help registry & anti-drift contracts", () => {
  it("cubre automáticamente todas las páginas reales del panel y todos los ítems activos de ADMIN_NAV", () => {
    const routes = adminPageRoutes(path.resolve(process.cwd(), "app/admin/(panel)"));
    expect(routes.length).toBeGreaterThan(40);
    const missing = routes.filter((route) => !getGuideForPath(route, "SUPERADMIN"));
    expect(missing).toEqual([]);

    const navHrefs = getAdminNav().flatMap((group) => [
      ...(group.href ? [group.href] : []),
      ...(group.items ?? []).map((item) => item.href),
    ]);
    for (const href of navHrefs) {
      expect(getGuideForPath(href, "SUPERADMIN"), `NAV sin guía: ${href}`).not.toBeNull();
    }
  });

  it("mantiene las constantes vivas sincronizadas contra los registros reales del servidor", () => {
    expect(HELP_LIVE_NUMBERS.emailTemplateCount).toBe(EMAIL_TEMPLATE_REGISTRY.length);
    expect(HELP_LIVE_NUMBERS.loyaltyRetroEarnWindowDays).toBe(RETROACTIVE_EARN_WINDOW_DAYS);
    expect(HELP_LIVE_NUMBERS.totalCapabilities).toBe(ADMIN_CAPABILITIES.length);
    expect(HELP_LIVE_NUMBERS.totalAdminRoles).toBe(ADMIN_ROLES_ALL.length);
    expect(ADMIN_CAPABILITIES).toHaveLength(38);
  });

  it("tiene identificadores globalmente únicos, contenido completo y relaciones válidas en las 48 guías y 8 playbooks", () => {
    expect(ADMIN_MODULE_GUIDES).toHaveLength(48);
    expect(ADMIN_PLAYBOOKS).toHaveLength(8);

    const allIds = [
      ...ADMIN_MODULE_GUIDES.map((g) => g.id),
      ...ONBOARDING_GUIDES.map((o) => o.id),
      ...ADMIN_PLAYBOOKS.map((p) => p.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);

    const guideIds = new Set(ADMIN_MODULE_GUIDES.map((g) => g.id));
    const playbookIds = new Set(ADMIN_PLAYBOOKS.map((p) => p.id));

    for (const guide of ADMIN_MODULE_GUIDES) {
      expect(guide.purpose.length, guide.id).toBeGreaterThan(80);
      expect(guide.whenToUse.length, guide.id).toBeGreaterThan(0);
      expect(guide.concepts.length, guide.id).toBeGreaterThan(0);
      expect(guide.sections.length, guide.id).toBeGreaterThan(0);
      expect(guide.procedures.length, guide.id).toBeGreaterThan(0);
      expect(guide.cautions.length, guide.id).toBeGreaterThan(0);
      expect(guide.dontTouch.length, `${guide.id}.dontTouch`).toBeGreaterThan(0);
      expect(guide.faqs.length, guide.id).toBeGreaterThan(0);
      expect(guide.version, guide.id).toBeGreaterThan(0);
      expect(getGuideForPath(guide.route, "SUPERADMIN"), `ruta ${guide.route}`).not.toBeNull();

      for (const section of guide.sections) {
        expect(section.topics.length, `${guide.id}.${section.id}`).toBeGreaterThan(0);
        for (const topic of section.topics) {
          expect(topic.description.length, `${guide.id}.${topic.id}`).toBeGreaterThan(25);
        }
      }
      for (const procedure of guide.procedures) {
        expect(procedure.steps.length, `${guide.id}.${procedure.id}`).toBeGreaterThanOrEqual(3);
        expect(procedure.expected.length, `${guide.id}.${procedure.id}`).toBeGreaterThan(30);
        if (procedure.route) {
          expect(getGuideForPath(procedure.route, "SUPERADMIN"), procedure.route).not.toBeNull();
        }
      }
      for (const related of guide.related) {
        expect(guideIds.has(related), `${guide.id} → guía ${related}`).toBe(true);
      }
      for (const pbId of guide.relatedPlaybooks ?? []) {
        expect(playbookIds.has(pbId), `${guide.id} → playbook ${pbId}`).toBe(true);
      }
    }

    for (const playbook of ADMIN_PLAYBOOKS) {
      expect(playbook.steps.length, playbook.id).toBeGreaterThanOrEqual(4);
      expect(playbook.edgeCases.length, playbook.id).toBeGreaterThan(0);
      expect(playbook.dontTouch.length, playbook.id).toBeGreaterThan(0);
      for (const step of playbook.steps) {
        expect(
          getGuideForPath(step.route, "SUPERADMIN"),
          `${playbook.id}: ${step.route}`,
        ).not.toBeNull();
      }
      for (const relatedGuide of playbook.relatedGuides) {
        expect(guideIds.has(relatedGuide), `${playbook.id} → ${relatedGuide}`).toBe(true);
      }
    }

    for (const rule of ADMIN_QUICK_RULES) {
      expect(getGuideForPath(rule.route, "SUPERADMIN"), `rule: ${rule.route}`).not.toBeNull();
    }
  });

  it("prohíbe términos obsoletos y violaciones de marca ADR-138 en todo el corpus de ayuda", () => {
    const serialized = JSON.stringify({
      guides: ADMIN_MODULE_GUIDES,
      playbooks: ADMIN_PLAYBOOKS,
      routines: DAILY_ROUTINES,
      onboarding: ONBOARDING_GUIDES,
      rules: ADMIN_QUICK_RULES,
    });
    expect(serialized).not.toMatch(/modo cat[aá]logo/i);
    expect(serialized).not.toMatch(/lucam['’]s/i);
    expect(serialized).not.toMatch(/lucams_shop/i);
  });

  it("evita que los componentes cliente arrastren el corpus pesado de content/* al navegador", () => {
    const clientFiles = [
      "components/help-launcher.tsx",
      "components/guide-view.tsx",
      "components/interactive-guide.tsx",
      "components/playbook-view.tsx",
      "components/help-center-workspace.tsx",
    ];
    for (const rel of clientFiles) {
      const source = readFileSync(path.resolve(process.cwd(), "features/admin-help", rel), "utf8");
      expect(source, `${rel} no debe importar registry ni content`).not.toMatch(
        /from\s+["']\.\.\/(registry|content)/,
      );
    }
  });

  it("ofrece onboarding y rutina diaria segura por RBAC para los ocho roles", () => {
    expect(ONBOARDING_GUIDES.map((guide) => guide.role).sort()).toEqual([...ROLES].sort());
    expect(DAILY_ROUTINES.map((routine) => routine.role).sort()).toEqual([...ROLES].sort());

    for (const role of ROLES) {
      const onboarding = getOnboardingForRole(role);
      expect(onboarding.steps.length).toBeGreaterThanOrEqual(4);
      for (const moduleId of onboarding.moduleIds) {
        expect(getModuleGuideById(moduleId, role), `${role}: ${moduleId}`).not.toBeNull();
      }
      for (const step of onboarding.steps) {
        if (step.href) {
          expect(canAccessAdminPath(role, step.href), `${role} step href: ${step.href}`).toBe(true);
        }
      }

      const routine = getDailyRoutineForRole(role);
      expect(routine.blocks.length).toBeGreaterThan(0);
      for (const block of routine.blocks) {
        for (const item of block.items) {
          expect(canAccessAdminPath(role, item.route), `${role} routine: ${item.route}`).toBe(true);
        }
      }
      for (const pbId of routine.recommendedPlaybookIds) {
        expect(getPlaybookById(pbId, role), `${role} playbook: ${pbId}`).not.toBeNull();
      }
    }

    expect(
      getAvailableModuleGuides("CMS_EDITOR")
        .map((guide) => guide.id)
        .sort(),
    ).toEqual(["ayuda", "contenido", "mediateca", "redirects", "seguridad"]);
    expect(getModuleGuideById("contenido-global", "CMS_EDITOR")).toBeNull();
    expect(getModuleGuideById("finanzas", "CMS_EDITOR")).toBeNull();
    expect(getPlaybookById("playbook-incidentes-seguridad-dian", "CMS_EDITOR")).toBeNull();
  });

  it("resuelve subguías dedicadas, subrutas dinámicas y rutas históricas en servidor y en índice cliente", () => {
    // Subguías dedicadas nuevas
    expect(getGuideForPath("/admin/contenido/paginas/global", "SUPERADMIN")?.id).toBe(
      "contenido-global",
    );
    expect(getGuideForPath("/admin/contenido/mediateca", "CMS_EDITOR")?.id).toBe("mediateca");
    expect(getGuideForPath("/admin/carritos/configuracion", "SUPERADMIN")?.id).toBe(
      "carritos-configuracion",
    );
    expect(getGuideForPath("/admin/integraciones/aveonline", "SUPERADMIN")?.id).toBe(
      "integraciones-aveonline",
    );
    expect(getGuideForPath("/admin/canales/tienda", "OPERATIONS_MANAGER")?.id).toBe(
      "canales-tienda",
    );

    // Subrutas dinámicas con foco contextual exacto
    const orderDetail = getGuideAndSubrouteForPath(
      "/admin/pedidos/LCM-2026-0001",
      "PRINT_WORKSHOP",
    );
    expect(orderDetail.guide?.id).toBe("pedidos");
    expect(orderDetail.subroute?.id).toBe("pedido-detalle");

    const oppDetail = getGuideAndSubrouteForPath("/admin/oportunidades/opp-99", "SUPERADMIN");
    expect(oppDetail.guide?.id).toBe("oportunidades");
    expect(oppDetail.subroute?.id).toBe("oportunidad-detalle");

    const newProduct = getGuideAndSubrouteForPath("/admin/productos/nuevo", "OPERATIONS_MANAGER");
    expect(newProduct.subroute?.id).toBe("producto-nuevo");

    const prodVariants = getGuideAndSubrouteForPath(
      "/admin/productos/prod-1/variants",
      "OPERATIONS_MANAGER",
    );
    expect(prodVariants.subroute?.id).toBe("producto-variantes");

    // Paridad en el matcher liviano del cliente
    const index = getHelpRouteIndex("SUPERADMIN");
    expect(resolveHelpEntryForPathname("/admin/pedidos/LCM-2026-0042", index)).toMatchObject({
      entry: { id: "pedidos" },
      subroute: { id: "pedido-detalle" },
    });
    expect(resolveHelpEntryForPathname("/admin/contenido/paginas/global", index)).toMatchObject({
      entry: { id: "contenido-global" },
      subroute: null,
    });

    // Alias históricos
    expect(getGuideForPath("/admin/mensajes", "CUSTOMER_SUPPORT")?.id).toBe("soporte");
    expect(getGuideForPath("/admin/reclamos/caso-1", "SUPERADMIN")?.id).toBe("garantias");
    expect(getGuideForPath("/admin/fichas", "SUPERADMIN")?.id).toBe("disenos");
  });

  it("busca sin depender de tildes en módulos, playbooks y glosario respetando RBAC", () => {
    expect(
      searchModuleGuides("FINANCE_ANALYST", "conciliar remesa").some(
        (guide) => guide.id === "conciliacion",
      ),
    ).toBe(true);
    expect(
      searchModuleGuides("SUPERADMIN", "configurar recuperacion automatica").some(
        (guide) => guide.id === "carritos",
      ),
    ).toBe(true);
    expect(
      searchModuleGuides("CUSTOMER_SUPPORT", "conciliación").some(
        (guide) => guide.id === "conciliacion",
      ),
    ).toBe(false);

    expect(
      searchPlaybooks("SUPERADMIN", "retencion bre-b").some(
        (pb) => pb.id === "playbook-oportunidad-b2b-cierre",
      ),
    ).toBe(true);
    expect(getAvailablePlaybooks("PRINT_WORKSHOP").map((p) => p.id)).toEqual([
      "playbook-pedido-web-300dpi",
      "playbook-oportunidad-b2b-cierre",
    ]);

    const glossary = getConsolidatedGlossary("SUPERADMIN");
    expect(glossary.length).toBeGreaterThan(40);
    expect(searchGlossary("SUPERADMIN", "bre-b").length).toBeGreaterThan(0);

    const orders = getModuleGuideById("pedidos", "SUPERADMIN")!;
    expect(
      getProceduresForRole(orders, "CUSTOMER_SUPPORT").map((procedure) => procedure.id),
    ).toEqual(["consultar-pedido-soporte"]);
    expect(buildModuleSteps(orders, "PRINT_WORKSHOP", "preparar-produccion")).toHaveLength(6);
  });
});
