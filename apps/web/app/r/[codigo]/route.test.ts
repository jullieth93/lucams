/*
 * Unit — GET /r/[codigo] (short-link de referidos, T8 2026-10-01):
 *  - Código válido → 307 a /registro?ref=<CODIGO> (uppercase, mismo
 *    saneamiento que /registro).
 *  - Código inválido → 307 a /registro SIN ref (sin error feo).
 */

import { describe, expect, it } from "vitest";

import { GET } from "./route";

function call(codigo: string): Promise<Response> {
  return GET(new Request(`https://lucamsshop.com/r/${codigo}`), {
    params: Promise.resolve({ codigo }),
  });
}

describe("GET /r/[codigo] — short-link de referidos", () => {
  it("código válido: 307 a /registro?ref=<CODIGO> en mayúsculas", async () => {
    const res = await call("lcs-ab12cd");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://lucamsshop.com/registro?ref=LCS-AB12CD");
  });

  it("respeta el mismo regex que /registro (4-20, letras/números/guion)", async () => {
    // Límite inferior: 4 chars válidos.
    const ok = await call("AB12");
    expect(ok.headers.get("location")).toContain("/registro?ref=AB12");
    // 3 chars → inválido → /registro pelado.
    const short = await call("AB1");
    expect(short.headers.get("location")).toBe("https://lucamsshop.com/registro");
    // 21 chars → inválido.
    const long = await call("A".repeat(21));
    expect(long.headers.get("location")).toBe("https://lucamsshop.com/registro");
  });

  it("código con caracteres inválidos: /registro sin ref (sin error)", async () => {
    for (const bad of ["codigo raro", "a_b_c_9", "%%%%", "ref=otra"]) {
      const res = await call(bad);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://lucamsshop.com/registro");
    }
  });
});
