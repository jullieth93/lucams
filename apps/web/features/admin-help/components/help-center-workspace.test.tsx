// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_SHORTCUTS,
  getAvailableModuleGuides,
  getAvailablePlaybooks,
  getConsolidatedGlossary,
  getDailyRoutineForRole,
  getOnboardingForRole,
  getPlaybookById,
  getQuickRulesForRole,
  getRoleMatrixForRole,
} from "../registry";
import { HelpCenterWorkspace } from "./help-center-workspace";
import { AdminPlaybookView } from "./playbook-view";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/admin/count-up", () => ({
  CountUp: ({ value }: { value: number }) => <span>{value}</span>,
}));

vi.mock("../actions", () => ({
  saveHelpProgressAction: vi.fn().mockResolvedValue({ ok: true, message: "OK" }),
  submitHelpFeedbackAction: vi.fn().mockResolvedValue({ ok: true, message: "OK" }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HelpCenterWorkspace & AdminPlaybookView", () => {
  it("navega entre las 4 pestañas, filtra en vivo y expone selector de rol solo a SUPERADMIN", () => {
    const role = "SUPERADMIN" as const;
    render(
      <HelpCenterWorkspace
        actualRole={role}
        effectiveRole={role}
        initialTab="modulos"
        initialQuery=""
        onboarding={getOnboardingForRole(role)}
        dailyRoutine={getDailyRoutineForRole(role)}
        playbooks={getAvailablePlaybooks(role)}
        guides={getAvailableModuleGuides(role)}
        quickRules={getQuickRulesForRole(role)}
        roleMatrix={getRoleMatrixForRole(role)}
        shortcuts={ADMIN_SHORTCUTS}
        glossary={getConsolidatedGlossary(role)}
        initialProgress={[]}
      />,
    );

    expect(screen.getByLabelText("Ver ayuda como rol:")).toBeInTheDocument();

    // Cambio a Día 1 y Rutina Diaria
    fireEvent.click(screen.getByRole("button", { name: /1\. Día 1 y Rutina Diaria/i }));
    expect(
      screen.getByRole("heading", { name: "Orden diario de operación recomendado" }),
    ).toBeInTheDocument();

    // Cambio a Flujos E2E
    fireEvent.click(screen.getByRole("button", { name: /2\. Flujos E2E/i }));
    expect(
      screen.getByRole("heading", {
        name: "Flujos transversales de punta a punta (Playbooks E2E)",
      }),
    ).toBeInTheDocument();

    // Cambio a Referencia Rápida
    fireEvent.click(screen.getByRole("button", { name: /4\. Glosario, Reglas y Atajos/i }));
    expect(
      screen.getByRole("heading", {
        name: "SLAs legales, topes numéricos y compuertas de seguridad",
      }),
    ).toBeInTheDocument();

    // Buscador instantáneo global sin recarga
    const searchbox = screen.getByRole("searchbox", { name: "Buscar en las guías" });
    fireEvent.change(searchbox, { target: { value: "Bre-B retención" } });
    expect(
      screen.getByRole("heading", { name: /Resultados para «Bre-B retención»/i }),
    ).toBeInTheDocument();

    // Selector de vista previa por rol dispara navegación hacia ?rol=PRINT_WORKSHOP
    fireEvent.change(screen.getByLabelText("Ver ayuda como rol:"), {
      target: { value: "PRINT_WORKSHOP" },
    });
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("rol=PRINT_WORKSHOP"));
  });

  it("oculta el selector de rol para perfiles no SUPERADMIN y renderiza Playbook E2E con tramos por rol", () => {
    const role = "PRINT_WORKSHOP" as const;
    render(
      <HelpCenterWorkspace
        actualRole={role}
        effectiveRole={role}
        initialTab="dia-1"
        initialQuery=""
        onboarding={getOnboardingForRole(role)}
        dailyRoutine={getDailyRoutineForRole(role)}
        playbooks={getAvailablePlaybooks(role)}
        guides={getAvailableModuleGuides(role)}
        quickRules={getQuickRulesForRole(role)}
        roleMatrix={getRoleMatrixForRole(role)}
        shortcuts={ADMIN_SHORTCUTS}
        glossary={getConsolidatedGlossary(role)}
        initialProgress={[]}
      />,
    );

    expect(screen.queryByLabelText("Ver ayuda como rol:")).toBeNull();

    const playbook = getPlaybookById("playbook-pedido-web-300dpi", role)!;
    render(
      <AdminPlaybookView
        playbook={playbook}
        role={role}
        relatedGuides={[{ id: "pedidos", title: "Pedidos" }]}
      />,
    );

    expect(screen.getAllByText("Tu rol ejecuta este tramo").length).toBeGreaterThan(0);
    expect(screen.getByText("Casos borde frecuentes y cómo destrabarlos")).toBeInTheDocument();
  });
});
