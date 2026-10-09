// @vitest-environment jsdom

/*
 * BrandMark (Fase 3 · 3.9) — logo administrable con fallback al asset estático.
 *
 * Contrato:
 *  - Sin prop `logo`: el asset oficial del repo (/brand/lucams-logo.png).
 *  - Con `logo` (CMS setting `site.logo` → Mediateca): la URL configurada y
 *    su alt. La lectura (getCmsImage, cache tag "cms") vive en los callers
 *    server-side (site-header, layouts) — este componente solo renderiza.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as Record<string, string>)} />,
}));

import { BrandMark } from "./brand-mark";

afterEach(cleanup);

describe("BrandMark — logo administrable", () => {
  it("sin logo configurado usa el asset estático del repo", () => {
    render(<BrandMark size="sm" />);
    const img = screen.getByAltText("Lucams_shop");
    expect(img).toHaveAttribute("src", "/brand/lucams-logo.png");
  });

  it("con logo del CMS renderiza la URL configurada y su alt", () => {
    render(
      <BrandMark
        size="sm"
        logo={{
          url: "https://cdn.example.com/storage/v1/object/public/cms-media/media/logo.webp",
          alt: "Logo Lucams navideño",
        }}
      />,
    );
    const img = screen.getByAltText("Logo Lucams navideño");
    expect(img).toHaveAttribute(
      "src",
      "https://cdn.example.com/storage/v1/object/public/cms-media/media/logo.webp",
    );
  });

  it("logo=null explícito equivale al fallback estático", () => {
    render(<BrandMark size="sm" logo={null} />);
    expect(screen.getByAltText("Lucams_shop")).toHaveAttribute("src", "/brand/lucams-logo.png");
  });

  it("siempre enlaza al inicio con su nombre accesible", () => {
    render(<BrandMark size="md" />);
    expect(screen.getByRole("link", { name: "Inicio Lucams_shop" })).toHaveAttribute("href", "/");
  });
});
