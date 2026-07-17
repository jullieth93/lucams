/*
 * Smoke LIVE de Wompi contra la API de SANDBOX (ADR-067). No-destructivo: no crea cobros.
 *
 * Prueba que nuestra integración habla de verdad con Wompi (no solo con mocks): la public key es
 * válida y el merchant/acceptance token es alcanzable, y el endpoint autenticado de transacciones
 * responde. Complementa los unit/integración (que mockean fetch).
 *
 * SEGURIDAD: corre SOLO con credenciales de SANDBOX reales (public key `pub_test_…` larga, no el
 * dummy `pub_test_ci` de CI) y WOMPI_ENV=sandbox — NUNCA contra producción, ni en CI sin secrets.
 * Localmente se ejecuta sourceando el .env.local; en CI se salta (skipIf) salvo que se carguen los
 * WOMPI_* como GitHub Secrets en el job de nightly.
 */

import { describe, it, expect } from "vitest";
import { getWompiConfig, getTransaction } from "./wompi";

const cfg = (() => {
  try {
    return getWompiConfig();
  } catch {
    return null;
  }
})();

// Gate estricto: sandbox real, no el placeholder de CI (pub_test_ci), jamás producción.
const liveSandbox =
  !!cfg &&
  cfg.env === "sandbox" &&
  cfg.publicKey.startsWith("pub_test_") &&
  cfg.publicKey.length > 20;

describe.skipIf(!liveSandbox)("Wompi — smoke LIVE sandbox (no-destructivo)", () => {
  it("la public key es válida: el merchant + acceptance token es alcanzable", async () => {
    const c = getWompiConfig();
    const res = await fetch(`${c.apiUrl}/merchants/${c.publicKey}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data?: { presigned_acceptance?: { acceptance_token?: string } };
    };
    // Una public key válida devuelve el merchant + el token de aceptación de términos.
    expect(body?.data?.presigned_acceptance?.acceptance_token).toBeTruthy();
  });

  it("el endpoint autenticado de transacciones responde (id inexistente → error 4xx, no crash)", async () => {
    // GET read-only con la private key; un id inexistente devuelve 4xx → getTransaction rechaza.
    await expect(getTransaction("00000000-0000-0000-0000-000000000000")).rejects.toBeTruthy();
  });
});
