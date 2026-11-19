// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getGuideAndSubrouteForPath,
  getHelpRouteIndex,
  getOnboardingForRole,
  getPlaybookIndex,
} from "../registry";
import { AdminHelpLauncher } from "./help-launcher";

let mockPathname = "/admin/dashboard";
let mockSearch = "";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const getContextualHelpAction = vi.fn();
const saveHelpProgressAction = vi.fn();
const submitHelpFeedbackAction = vi.fn();

vi.mock("../actions", () => ({
  getContextualHelpAction: (...args: unknown[]) => getContextualHelpAction(...args),
  saveHelpProgressAction: (...args: unknown[]) => saveHelpProgressAction(...args),
  submitHelpFeedbackAction: (...args: unknown[]) => submitHelpFeedbackAction(...args),
}));

beforeEach(() => {
  mockPathname = "/admin/dashboard";
  mockSearch = "";
  getContextualHelpAction.mockImplementation(async ({ pathname }: { pathname: string }) => {
    const resolved = getGuideAndSubrouteForPath(pathname, "SUPERADMIN");
    if (!resolved.guide) return { ok: false, message: "Sin guía" };
    return {
      ok: true,
      guide: resolved.guide,
      subroute: resolved.subroute,
      progress: null,
      feedback: null,
    };
  });
  saveHelpProgressAction.mockResolvedValue({ ok: true, message: "Avance guardado." });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminHelpLauncher contextual reactivity", () => {
  const routeIndex = getHelpRouteIndex("SUPERADMIN");
  const playbookIndex = getPlaybookIndex("SUPERADMIN");
  const onboarding = getOnboardingForRole("SUPERADMIN");
  const dismissedProgress = [
    {
      guideId: onboarding.id,
      version: onboarding.version,
      currentStep: 0,
      completedAt: null,
      dismissedAt: "2026-11-18T12:00:00.000Z",
    },
  ];

  it("actualiza el botón en tiempo real al navegar entre módulos y subrutas en cliente", async () => {
    const { rerender } = render(
      <AdminHelpLauncher
        routeIndex={routeIndex}
        playbookIndex={playbookIndex}
        onboarding={onboarding}
        role="SUPERADMIN"
        initialProgress={dismissedProgress}
      />,
    );

    expect(screen.getByRole("button", { name: "Abrir ayuda de Dashboard" })).toBeInTheDocument();

    // Simula navegación cliente sin desmontar el layout hacia /admin/pedidos/LCM-2026-0009
    mockPathname = "/admin/pedidos/LCM-2026-0009";
    rerender(
      <AdminHelpLauncher
        routeIndex={routeIndex}
        playbookIndex={playbookIndex}
        onboarding={onboarding}
        role="SUPERADMIN"
        initialProgress={dismissedProgress}
      />,
    );

    const subrouteBtn = screen.getByRole("button", {
      name: "Abrir ayuda de Pedidos: Detalle operativo 360° del pedido",
    });
    expect(subrouteBtn).toBeInTheDocument();

    fireEvent.click(subrouteBtn);
    expect(await screen.findByRole("heading", { name: "Ayuda de Pedidos" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Detalle operativo 360° del pedido" }),
    ).toBeInTheDocument();
  });

  it("se oculta en la portada de /admin/ayuda y cambia a Índice rápido al leer una guía o flujo", () => {
    mockPathname = "/admin/ayuda";
    mockSearch = "";
    const { rerender } = render(
      <AdminHelpLauncher
        routeIndex={routeIndex}
        playbookIndex={playbookIndex}
        onboarding={onboarding}
        role="SUPERADMIN"
        initialProgress={dismissedProgress}
      />,
    );

    expect(screen.queryByRole("button", { name: /ayuda|índice/i })).toBeNull();

    mockSearch = "guia=pedidos";
    rerender(
      <AdminHelpLauncher
        routeIndex={routeIndex}
        playbookIndex={playbookIndex}
        onboarding={onboarding}
        role="SUPERADMIN"
        initialProgress={dismissedProgress}
      />,
    );

    const indexBtn = screen.getByRole("button", {
      name: "Abrir índice y buscador rápido de ayuda",
    });
    expect(indexBtn).toBeInTheDocument();
    fireEvent.click(indexBtn);
    expect(screen.getByRole("heading", { name: "Índice rápido y buscador" })).toBeInTheDocument();
  });
});
