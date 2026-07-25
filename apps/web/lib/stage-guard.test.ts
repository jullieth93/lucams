/*
 * Guard de etapa — frontera server-side catálogo/transaccional.
 *
 * Regresión de la auditoría 2026-07-21 (hallazgo A3): el modo catálogo solo gateaba en las
 * `page.tsx`, pero las Server Actions de Next son endpoints POST cuyos IDs viven en el bundle
 * desplegado → seguían siendo invocables aunque la UI no las mostrara. Estos tests fijan que en
 * modo catálogo se corte, y —tan importante como eso— que en modo full NO se estorbe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    // Imita a next/navigation: redirect() nunca retorna, lanza NEXT_REDIRECT.
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw err;
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("server-only", () => ({}));

/** El módulo lee STORE_MODE al importarse (const evaluada en import) → import fresco por caso. */
async function loadFresh(mode: string | undefined) {
  vi.resetModules();
  if (mode === undefined) delete process.env.NEXT_PUBLIC_STORE_MODE;
  else process.env.NEXT_PUBLIC_STORE_MODE = mode;
  return import("./stage-guard");
}

const savedMode = process.env.NEXT_PUBLIC_STORE_MODE;

beforeEach(() => {
  redirectMock.mockClear();
});

afterEach(() => {
  if (savedMode === undefined) delete process.env.NEXT_PUBLIC_STORE_MODE;
  else process.env.NEXT_PUBLIC_STORE_MODE = savedMode;
});

describe("guardTransactionalAction (Server Actions)", () => {
  it("en modo catálogo CORTA la acción con redirect al formulario de cotización", async () => {
    const { guardTransactionalAction, CATALOG_FALLBACK_PATH } = await loadFresh("catalog");

    expect(() => guardTransactionalAction("payCodAction")).toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledWith(CATALOG_FALLBACK_PATH);
  });

  it("en modo full es un no-op: no redirige ni lanza", async () => {
    const { guardTransactionalAction } = await loadFresh("full");

    expect(() => guardTransactionalAction("payCodAction")).not.toThrow();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("sin la variable seteada NO bloquea (el default de store-mode es 'full')", async () => {
    const { guardTransactionalAction } = await loadFresh(undefined);

    expect(() => guardTransactionalAction("payWompiAction")).not.toThrow();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("assertTransactionalAllowed (capa de servicio)", () => {
  it("en modo catálogo lanza StageError nombrando la operación", async () => {
    const { assertTransactionalAllowed, StageError } = await loadFresh("catalog");

    try {
      assertTransactionalAllowed("createOrderFromCart");
      expect.unreachable("debió lanzar StageError");
    } catch (err) {
      expect(err).toBeInstanceOf(StageError);
      expect((err as Error).message).toContain("createOrderFromCart");
      expect((err as Error).message).toContain("catálogo");
    }
  });

  it("NO redirige: el servicio no conoce el transporte", async () => {
    const { assertTransactionalAllowed } = await loadFresh("catalog");

    expect(() => assertTransactionalAllowed("finalizeCheckout")).toThrow();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("en modo full deja pasar la operación", async () => {
    const { assertTransactionalAllowed } = await loadFresh("full");

    expect(() => assertTransactionalAllowed("finalizeCheckout")).not.toThrow();
  });

  // Un typo en la env NO debe apagar el checkout de una tienda que sí vende (fail-open a full
  // por diseño de store-mode.ts). El riesgo inverso lo cubre la assertion de arranque en env.ts.
  it("un valor inválido cae a 'full' y no bloquea", async () => {
    const { assertTransactionalAllowed } = await loadFresh("catalogue");

    expect(() => assertTransactionalAllowed("finalizeCheckout")).not.toThrow();
  });
});
