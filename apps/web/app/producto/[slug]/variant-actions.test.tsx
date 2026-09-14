// @vitest-environment jsdom

/*
 * Test de componente — EstudioCtaLink (Lucy 2026-09-05).
 *
 * Contrato por `requiredSelection`:
 *   - "variant" (default, comportamiento clásico): sin selección → deshabilitado
 *     con "Elige las opciones primero ↑"; con selección → ?variant=<id>.
 *   - "size"/"none": modos legacy de cuando el N del pack se elegía en el
 *     Estudio (2026-09-05→2026-09-08); ninguna PDP activa los usa hoy.
 * Regla 2026-09-08b: las copias (stepper "Unidades" de los productos de
 * composición fija) viajan como ?copies=N SOLO cuando N>1 — con el default
 * (1) la URL queda limpia (cubierto en copies-qty-input.test.tsx).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, cleanup } from "@testing-library/react";

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

import { EstudioCtaLink, SelectedVariantProvider } from "./variant-actions";

afterEach(() => cleanup());
beforeEach(() => replace.mockClear());

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
      <EstudioCtaLink slug={slug} ctaNoun="producto" requiredSelection={requiredSelection} />
    </SelectedVariantProvider>
  );
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
});
