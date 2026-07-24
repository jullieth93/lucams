/*
 * probeAveonlineHealth — diagnóstico de la integración de envíos sin generar guías.
 *
 * El caso que motiva el chequeo: `AVEONLINE_ENV=production` hace que la app genere guías REALES
 * y facture (`bloquegenerarguia=1`). Si las credenciales quedaron apuntando a la cuenta DEMO
 * pública, la tienda cree que despacha y no despacha — y las credenciales viven cifradas en
 * Vercel, así que el error no se puede ver leyéndolas. Estos tests fijan que cada combinación
 * (modo × credenciales × cuenta que responde) se reporte y no se silencie.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const AUTH_URL = "comunes/v1.0/autenticarusuario.php";

/** Respuesta de auth de Aveonline: HTTP 200 y el `idempresa` dentro de cuentas[0].usuarios[0]. */
function mockAuthOk(idempresa: number) {
  return vi.fn(async (url: string) => {
    if (String(url).includes(AUTH_URL)) {
      return new Response(
        JSON.stringify({
          status: "ok",
          token: "tok",
          cuentas: [{ usuarios: [{ id: idempresa }] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
}

/** Credenciales malas: la API responde 200 con status "ok" pero cuentas vacío (doc oficial). */
function mockAuthBadCredentials() {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ status: "ok", token: "tok", cuentas: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

/** Import fresco: el módulo cachea el token en memoria entre llamadas. */
async function loadFresh() {
  vi.resetModules();
  return (await import("./aveonline")).probeAveonlineHealth;
}

beforeEach(() => {
  vi.stubEnv("AVEONLINE_ENV", "");
  vi.stubEnv("AVEONLINE_USUARIO", "");
  vi.stubEnv("AVEONLINE_CLAVE", "");
  vi.stubEnv("AVEONLINE_DEMO_USUARIO", "");
  vi.stubEnv("AVEONLINE_DEMO_CLAVE", "");
  vi.stubEnv("AVEONLINE_DEMO_IDEMPRESA", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("probeAveonlineHealth", () => {
  it("modo test contra la cuenta demo: ok, y lo declara como demo", async () => {
    vi.stubEnv("AVEONLINE_DEMO_USUARIO", "demointegracion");
    vi.stubEnv("AVEONLINE_DEMO_CLAVE", "demointegra2021");
    vi.stubEnv("AVEONLINE_DEMO_IDEMPRESA", "15289");
    vi.stubGlobal("fetch", mockAuthOk(15289));
    const probe = await loadFresh();

    const r = await probe();
    expect(r.mode).toBe("test");
    expect(r.authenticated).toBe(true);
    expect(r.isDemoAccount).toBe(true);
    expect(r.ok).toBe(true); // en test, usar la demo es lo CORRECTO
  });

  it("modo production con cuenta real: ok", async () => {
    vi.stubEnv("AVEONLINE_ENV", "production");
    vi.stubEnv("AVEONLINE_USUARIO", "usuario-real");
    vi.stubEnv("AVEONLINE_CLAVE", "clave-real");
    vi.stubGlobal("fetch", mockAuthOk(98765));
    const probe = await loadFresh();

    const r = await probe();
    expect(r.mode).toBe("production");
    expect(r.idempresa).toBe(98765);
    expect(r.isDemoAccount).toBe(false);
    expect(r.ok).toBe(true);
  });

  // El fallo caro: la tienda cree que genera guías reales y está hablando con la cuenta de pruebas.
  it("modo production pero responde la cuenta DEMO: NO es ok y lo dice explícito", async () => {
    vi.stubEnv("AVEONLINE_ENV", "production");
    vi.stubEnv("AVEONLINE_USUARIO", "demointegracion");
    vi.stubEnv("AVEONLINE_CLAVE", "demointegra2021");
    vi.stubGlobal("fetch", mockAuthOk(15289));
    const probe = await loadFresh();

    const r = await probe();
    expect(r.authenticated).toBe(true);
    expect(r.isDemoAccount).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("DEMO");
  });

  it("modo production sin credenciales: no intenta autenticar y nombra las que faltan", async () => {
    vi.stubEnv("AVEONLINE_ENV", "production");
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    const probe = await loadFresh();

    const r = await probe();
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("AVEONLINE_USUARIO");
    expect(r.detail).toContain("AVEONLINE_CLAVE");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("credenciales inválidas (200 con cuentas vacío): reporta el fallo, no un falso ok", async () => {
    vi.stubEnv("AVEONLINE_ENV", "production");
    vi.stubEnv("AVEONLINE_USUARIO", "usuario");
    vi.stubEnv("AVEONLINE_CLAVE", "clave-mala");
    vi.stubGlobal("fetch", mockAuthBadCredentials());
    const probe = await loadFresh();

    const r = await probe();
    expect(r.ok).toBe(false);
    expect(r.authenticated).toBe(false);
    expect(r.detail).toContain("credenciales inválidas");
  });
});
