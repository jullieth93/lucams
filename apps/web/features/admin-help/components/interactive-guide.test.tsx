// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModuleGuideById, getOnboardingForRole, getPlaybookById } from "../registry";
import { AdminInteractiveGuide } from "./interactive-guide";

const saveHelpProgressAction = vi.fn();
vi.mock("../actions", () => ({
  saveHelpProgressAction: (...args: unknown[]) => saveHelpProgressAction(...args),
}));

beforeEach(() => {
  saveHelpProgressAction.mockResolvedValue({
    ok: true,
    progress: {
      guideId: "pedidos",
      version: 4,
      currentStep: 1,
      completedAt: null,
      dismissedAt: null,
    },
    message: "Avance guardado.",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminInteractiveGuide", () => {
  it("avanza el checklist sin ejecutar acciones de negocio y guarda cada paso", async () => {
    const guide = getModuleGuideById("pedidos", "SUPERADMIN")!;
    render(<AdminInteractiveGuide guide={guide} role="SUPERADMIN" />);

    fireEvent.click(screen.getByRole("button", { name: "Iniciar recorrido interactivo" }));
    expect(screen.getByText("Paso 1 de 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(screen.getByText("Paso 2 de 4")).toBeInTheDocument());
    expect(saveHelpProgressAction).toHaveBeenCalledWith({
      guideId: "pedidos",
      currentStep: 1,
      intent: "progress",
    });
  });

  it("permite practicar un Playbook E2E paso a paso con enlaces directos", () => {
    const playbook = getPlaybookById("playbook-pedido-web-300dpi", "SUPERADMIN")!;
    render(<AdminInteractiveGuide guide={playbook} role="SUPERADMIN" />);

    fireEvent.click(screen.getByRole("button", { name: "Practicar flujo paso a paso" }));
    expect(screen.getByText("Paso 1 de 5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir Pedidos/i })).toHaveAttribute(
      "href",
      "/admin/pedidos",
    );
  });

  it("permite descartar la tarjeta flotante de bienvenida sin completarla", async () => {
    const guide = getOnboardingForRole("CMS_EDITOR");
    render(
      <AdminInteractiveGuide
        guide={guide}
        role="CMS_EDITOR"
        variant="welcome-floating"
        autoStart
      />,
    );

    expect(screen.getByRole("region", { name: `Recorrido: ${guide.title}` })).toHaveClass("left-4");
    fireEvent.click(screen.getByRole("button", { name: "No mostrar automáticamente esta ruta" }));
    await waitFor(() =>
      expect(saveHelpProgressAction).toHaveBeenCalledWith({
        guideId: "onboarding-cms-editor",
        currentStep: 0,
        intent: "dismiss",
      }),
    );
  });
});
