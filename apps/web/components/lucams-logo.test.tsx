// @vitest-environment jsdom

/*
 * LucamsLogo (Fase 3 · 3.9) — prop `src` para logo del CMS con el MISMO
 * fallback RaccoonFace de siempre cuando la imagen no carga.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as Record<string, string>)} />,
}));

import { LucamsLogo } from "./lucams-logo";

afterEach(cleanup);

describe("LucamsLogo — src administrable", () => {
  it("sin src usa el asset estático de /public/brand", () => {
    render(<LucamsLogo variant="full" size={96} />);
    expect(screen.getByAltText("Logo Lucams_shop")).toHaveAttribute(
      "src",
      "/brand/lucams-logo.png",
    );
  });

  it("con src del CMS renderiza esa URL", () => {
    render(<LucamsLogo variant="full" size={96} src="https://cdn.example.com/logo.webp" />);
    expect(screen.getByAltText("Logo Lucams_shop")).toHaveAttribute(
      "src",
      "https://cdn.example.com/logo.webp",
    );
  });

  it("si el src del CMS falla, cae al fallback RaccoonFace (no queda roto)", () => {
    const { container } = render(
      <LucamsLogo variant="full" size={96} src="https://cdn.example.com/roto.webp" />,
    );
    fireEvent.error(screen.getByAltText("Logo Lucams_shop"));
    // El badge fallback es aria-hidden y ya no hay <img>.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
