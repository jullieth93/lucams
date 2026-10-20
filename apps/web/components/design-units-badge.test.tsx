// @vitest-environment jsdom

/*
 * DesignUnitsBadge (2026-10-13) — solo aparece con 2+ unidades (con 1 el
 * preview no pagina y el badge sería ruido) y muestra «N <rótulo CMS>».
 */

import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DesignUnitsBadge } from "./design-units-badge";

describe("DesignUnitsBadge", () => {
  it("con 2+ unidades muestra el conteo y el rótulo", () => {
    render(<DesignUnitsBadge count={5} label="unidades" />);
    expect(screen.getByText("5 unidades")).toBeInTheDocument();
  });

  it("con 1 o 0 unidades no se renderiza", () => {
    const { container, rerender } = render(<DesignUnitsBadge count={1} label="unidades" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DesignUnitsBadge count={0} label="unidades" />);
    expect(container).toBeEmptyDOMElement();
  });
});
