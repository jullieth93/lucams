// @vitest-environment jsdom

/*
 * Test de componente — EstudioCtaLink (Lucy 2026-09-05).
 *
 * "Las fotos se eligen en el Estudio": el CTA al Estudio ya NO exige la variante
 * completa para los packs. Contrato por `requiredSelection`:
 *   - "variant" (default, comportamiento clásico): sin selección → deshabilitado
 *     con "Elige las opciones primero ↑"; con selección → ?variant=<id>.
 *   - "size" (packs con >1 tamaño): exige SOLO el tamaño (el selector quedó
 *     reducido a Tamaño; las fotos se eligen en el Estudio). Sin selección →
 *     "Elige el tamaño primero ↑".
 *   - "none" (packs de 1 tamaño): habilitado siempre, abre SIN ?variant=.
 * Las copias (>1) viajan como ?copies=N en todos los modos.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

// next/link como anchor plano: el test verifica el href compuesto, no la navegación.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { EstudioCtaLink, SelectedVariantProvider, useSelectedVariant } from "./variant-actions";

afterEach(() => cleanup());
beforeEach(() => replace.mockClear());

/** Harness: permite fijar las copias del Context para probar ?copies=N. */
function Harness({
  requiredSelection,
  withSelection,
  slug = "set-fotoimanes-polaroid",
}: {
  requiredSelection?: "variant" | "size" | "none";
  withSelection?: boolean;
  slug?: string;
}) {
  return (
    <SelectedVariantProvider variantIds={["v1", "v2"]} initialId={withSelection ? "v1" : null}>
      <CopiesSetter />
      <EstudioCtaLink slug={slug} ctaNoun="producto" requiredSelection={requiredSelection} />
    </SelectedVariantProvider>
  );
}

function CopiesSetter() {
  const { setCopies } = useSelectedVariant();
  return <button onClick={() => setCopies(3)}>copias-3</button>;
}

describe("EstudioCtaLink — requiredSelection", () => {
  it('"variant" (default): sin selección deshabilita con "Elige las opciones primero ↑"', () => {
    render(<Harness requiredSelection="variant" />);
    expect(screen.getByText("Personalizar producto →")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Elige las opciones primero ↑")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it('"variant": con selección linkea ?variant=<id>', () => {
    render(<Harness requiredSelection="variant" withSelection />);
    const link = screen.getByRole("link", { name: /Personalizar producto/ });
    expect(link).toHaveAttribute("href", "/estudio/set-fotoimanes-polaroid?variant=v1");
  });

  it('"size" (packs multi-tamaño): sin selección pide SOLO el tamaño', () => {
    render(<Harness requiredSelection="size" />);
    expect(screen.getByText("Personalizar producto →")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Elige el tamaño primero ↑")).toBeInTheDocument();
    expect(screen.queryByText("Elige las opciones primero ↑")).not.toBeInTheDocument();
  });

  it('"size": con tamaño elegido pasa la variante (fija tamaño + N inicial en el Estudio)', () => {
    render(<Harness requiredSelection="size" withSelection />);
    expect(screen.getByRole("link", { name: /Personalizar producto/ })).toHaveAttribute(
      "href",
      "/estudio/set-fotoimanes-polaroid?variant=v1",
    );
  });

  it('"none" (pack de 1 tamaño): habilitado sin selección y abre SIN ?variant=', () => {
    render(<Harness requiredSelection="none" />);
    expect(screen.getByRole("link", { name: /Personalizar producto/ })).toHaveAttribute(
      "href",
      "/estudio/set-fotoimanes-polaroid",
    );
  });

  it("las copias (>1) viajan como ?copies=N en cualquier modo", () => {
    render(<Harness requiredSelection="none" />);
    fireEvent.click(screen.getByText("copias-3"));
    expect(screen.getByRole("link", { name: /Personalizar producto/ })).toHaveAttribute(
      "href",
      "/estudio/set-fotoimanes-polaroid?copies=3",
    );
  });

  it("con tamaño seleccionado y copias, el deep-link combina ambos params", () => {
    render(<Harness requiredSelection="size" withSelection />);
    fireEvent.click(screen.getByText("copias-3"));
    expect(screen.getByRole("link", { name: /Personalizar producto/ })).toHaveAttribute(
      "href",
      "/estudio/set-fotoimanes-polaroid?variant=v1&copies=3",
    );
  });
});
