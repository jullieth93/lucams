// @vitest-environment jsdom
/*
 * Test de componente — RastrearForm (prefill por query, fix QA STG 2026-10).
 *
 * El link "Seguir estado en LUCAMS" de /pedido/[token] lleva a
 * /rastrear?number=LCM-2026-0001: la página (server) pasa el número como
 * initialNumber y el form lo prellena. El CORREO nunca viaja en la URL
 * (PII): el campo de correo siempre arranca vacío.
 *
 * `./actions` se mockea: es un módulo "use server" (db, rate-limit) que no
 * aplica a un render unitario.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RastrearForm, type RastrearTexts } from "./rastrear-form";

vi.mock("./actions", () => ({
  rastrearAction: vi.fn(async () => null),
}));

afterEach(cleanup);

const TEXTS: RastrearTexts = {
  numberLabel: "Número de pedido",
  numberHelp: "Lo encuentras en tu correo de confirmación.",
  emailLabel: "Correo del pedido",
  submit: "Ver mi pedido",
};

describe("RastrearForm — prefill del número por query (?number=)", () => {
  it("prellena el número cuando llega initialNumber", () => {
    render(<RastrearForm texts={TEXTS} initialNumber="LCM-2026-0011" />);
    expect(screen.getByLabelText("Número de pedido")).toHaveValue("LCM-2026-0011");
  });

  it("sin initialNumber el campo arranca vacío", () => {
    render(<RastrearForm texts={TEXTS} />);
    expect(screen.getByLabelText("Número de pedido")).toHaveValue("");
  });

  it("el correo SIEMPRE arranca vacío (nunca viaja en la URL por PII)", () => {
    render(<RastrearForm texts={TEXTS} initialNumber="LCM-2026-0011" />);
    expect(screen.getByLabelText("Correo del pedido")).toHaveValue("");
  });
});
