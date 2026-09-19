// @vitest-environment jsdom
/*
 * Test de componente — MfaEnroll (flujo de enrolamiento TOTP admin).
 *
 * Fija el contrato de la Fase 3B (feedback Lucy 2026-09-18): tras verificar el
 * código TOTP, el flujo NO termina — genera los códigos de respaldo
 * INMEDIATAMENTE y los muestra una sola vez, y "Finalizar" solo se habilita
 * cuando Lucy confirma que los guardó.
 *
 * Todo mockeado (browser client de Supabase + server action + router): el
 * componente es pura orquestación de UI. Setup heredado de
 * cookies-banner.test.tsx (globals:false → cleanup manual).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// --- Mocks de dependencias ---------------------------------------------------

const { listFactors, unenroll, enroll, challengeAndVerify, generateRecoveryCodesAction, refresh } =
  vi.hoisted(() => ({
    listFactors: vi.fn(async () => ({ data: { all: [] } })),
    unenroll: vi.fn(async () => ({})),
    enroll: vi.fn(async () => ({
      data: {
        id: "factor_1",
        totp: { qr_code: "data:image/svg+xml;utf8,<svg/>", secret: "SECRETOTOTP" },
      },
      error: null,
    })),
    challengeAndVerify: vi.fn(async () => ({ error: null })),
    generateRecoveryCodesAction: vi.fn(async () => ({ codes: [] as string[] })),
    refresh: vi.fn(),
  }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { mfa: { listFactors, unenroll, enroll, challengeAndVerify } },
  }),
}));
// Server action ("use server": next/cache, prisma, etc.) → vi.fn() para aislar la UI.
vi.mock("./actions", () => ({ generateRecoveryCodesAction }));

import { MfaEnroll } from "./mfa-enroll";

// --- Helpers -----------------------------------------------------------------

const CODES = Array.from({ length: 10 }, (_, i) => `CODE-${String(i).padStart(2, "0")}-XXXX-YYYY`);

/** Lleva el componente hasta el paso "codes": enroll → QR → código → verify. */
async function llegarAlPasoDeCodigos() {
  fireEvent.click(screen.getByRole("button", { name: /activar verificación en 2 pasos/i }));
  const input = await screen.findByLabelText(/código de 6 dígitos/i);
  fireEvent.change(input, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /verificar y activar/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  generateRecoveryCodesAction.mockResolvedValue({ codes: CODES });
});

afterEach(cleanup);

describe("MfaEnroll — códigos de respaldo inmediatos tras enrolar (Fase 3B)", () => {
  it("tras verificar el TOTP genera los códigos y los muestra una vez, con copiar y descargar", async () => {
    render(<MfaEnroll />);
    await llegarAlPasoDeCodigos();

    await waitFor(() => expect(generateRecoveryCodesAction).toHaveBeenCalledTimes(1));

    // Los 10 códigos en claro + advertencia de una sola vista + acciones.
    for (const c of CODES) {
      expect(await screen.findByText(c)).toBeInTheDocument();
    }
    expect(screen.getByText(/una sola vez/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copiar todos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /descargar \.txt/i })).toBeInTheDocument();
    // Todavía NO hubo refresh: el flujo no terminó.
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Finalizar queda bloqueado hasta marcar 'Ya guardé mis códigos'; al finalizar refresca", async () => {
    render(<MfaEnroll />);
    await llegarAlPasoDeCodigos();

    const finalizar = await screen.findByRole("button", { name: /finalizar/i });
    expect(finalizar).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /ya guardé mis códigos/i }));
    expect(finalizar).toBeEnabled();

    fireEvent.click(finalizar);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/quedó activada/i)).toBeInTheDocument();
  });

  it("si la generación falla muestra error y permite reintentar SIN re-enrolar", async () => {
    generateRecoveryCodesAction.mockRejectedValueOnce(new Error("db caída"));

    render(<MfaEnroll />);
    await llegarAlPasoDeCodigos();

    expect(await screen.findByText(/no se pudieron generar/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    // El reintento solo regenera códigos: ni enroll ni challengeAndVerify de nuevo.
    await waitFor(() => expect(generateRecoveryCodesAction).toHaveBeenCalledTimes(2));
    expect(enroll).toHaveBeenCalledTimes(1);
    expect(challengeAndVerify).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(CODES[0])).toBeInTheDocument();
  });
});
