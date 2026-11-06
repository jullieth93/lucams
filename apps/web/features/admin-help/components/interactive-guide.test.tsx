// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModuleGuideById, getOnboardingForRole } from "../registry";
import { AdminInteractiveGuide } from "./interactive-guide";

const saveHelpProgressAction = vi.fn();
vi.mock("../actions", () => ({
  saveHelpProgressAction: (...args: unknown[]) => saveHelpProgressAction(...args),
}));

beforeEach(() => {
  saveHelpProgressAction.mockResolvedValue({ ok: true, message: "Avance guardado." });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminInteractiveGuide", () => {
  it("avanza sin ejecutar acciones de negocio y guarda cada paso", async () => {
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

  it("permite descartar el onboarding automático sin completarlo", async () => {
    const guide = getOnboardingForRole("CMS_EDITOR");
    render(<AdminInteractiveGuide guide={guide} role="CMS_EDITOR" autoStart />);

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
