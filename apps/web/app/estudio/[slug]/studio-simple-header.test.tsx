// @vitest-environment jsdom

/*
 * Test de componente — StudioSimpleHeader: desglose de la variante en el
 * header (2026-10-12).
 *
 * Blinda la prop OPCIONAL `variantLabel` (la pasan name-editor y
 * letter-set-editor con describeVariantAttributes / la misma etiqueta de la
 * Vista Previa):
 *   1. Con variantLabel: visible bajo el nombre del producto en el hero
 *      desktop (md+) Y en la fila móvil (<md).
 *   2. Sin variantLabel: el header se renderiza igual que antes (sin línea
 *      extra, sin hueco).
 *   3. El resto del chrome (pill «Salir», CTA) no se ve afectado.
 *
 * Los textos CMS caen al DEFAULT_STUDIO_TEXTS sin provider (mismo patrón que
 * studio-toolbar.test.tsx) y el Hint (radix) exige TooltipProvider.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StudioSimpleHeader } from "./studio-simple-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactElement } from "react";

function renderStudio(ui: ReactElement) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

afterEach(() => cleanup());

function setup(opts?: { variantLabel?: string }) {
  const onCta = vi.fn();
  renderStudio(
    <StudioSimpleHeader
      productName="Set de letras ABC"
      productSlug="set-letras-abc"
      {...(opts?.variantLabel ? { variantLabel: opts.variantLabel } : {})}
      ctaLabel="Ver diseño"
      onCta={onCta}
    />,
  );
  return { onCta };
}

describe("StudioSimpleHeader — desglose de la variante (2026-10-12)", () => {
  it("con variantLabel: visible junto al nombre en desktop y en la fila móvil", () => {
    setup({ variantLabel: "5×7 cm · Sin imán · Español" });
    // Hero md+ (línea propia bajo el nombre) y fila móvil ("Nombre · label").
    expect(screen.getAllByText(/5×7 cm · Sin imán · Español/).length).toBeGreaterThanOrEqual(2);
    // El nombre del producto sigue en ambas superficies.
    expect(screen.getAllByText(/Set de letras ABC/).length).toBeGreaterThanOrEqual(2);
  });

  it("sin variantLabel: no se renderiza el desglose y el chrome queda intacto", () => {
    const { onCta } = setup();
    expect(screen.queryByText(/Sin imán/)).not.toBeInTheDocument();
    const cta = screen.getByRole("button", { name: "Ver diseño" });
    expect(cta).toBeEnabled();
    cta.click();
    expect(onCta).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /Salir/ })).toBeInTheDocument();
  });
});
