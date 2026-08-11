/*
 * SONDA LIVE de cobertura Aveonline (guardada por AVEONLINE_LIVE_TEST — no corre
 * en CI). Diagnóstico permanente: cotiza contra la API REAL con la cuenta
 * configurada hacia destinos "difíciles" para observar la forma real de los
 * errores de cobertura (numbererror/dataerror por transportadora). Sus
 * hallazgos de 2026-08-08 motivaron el all_failed → [] del provider:
 * un destino INEXISTENTE devuelve 16 carriers con numbererror="999".
 *
 *   cd apps/web && AVEONLINE_LIVE_TEST=1 npx vitest run \
 *     features/shipping/aveonline.coverage-probe.live.test.ts
 */

import { describe, expect, it } from "vitest";
import { buildCotizarProductos } from "./aveonline";
import type { ShipmentItem } from "./provider";

const live = Boolean(process.env.AVEONLINE_LIVE_TEST && process.env.AVEONLINE_USUARIO);
const BASE_URL = "https://app.aveonline.co/api";

const fotoiman = (qty: number): ShipmentItem => ({
  productSlug: "fotoimanes-cuadrados",
  qty,
  weightGrams: 30,
  widthCm: 15,
  heightCm: 10,
  depthCm: 3,
  declaredValueCop: 4_500_000,
});

type CotizacionRow = {
  numbererror?: string;
  dataerror?: string;
  nombreTransportadora?: string;
  codTransportadora?: string;
  total?: number;
  diasentrega?: number | string;
};

async function auth(): Promise<{ token: string; idempresa: number }> {
  const res = await fetch(`${BASE_URL}/comunes/v1.0/autenticarusuario.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: "auth",
      usuario: process.env.AVEONLINE_USUARIO,
      clave: process.env.AVEONLINE_CLAVE,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as {
    status?: string;
    token?: string;
    cuentas?: Array<{ usuarios: Array<{ id: number }> }>;
  };
  if (data.status !== "ok" || !data.token) throw new Error("auth falló en la sonda");
  return { token: data.token, idempresa: data.cuentas![0].usuarios[0].id };
}

async function probe(destino: string) {
  const { token, idempresa } = await auth();
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/nal/v1.0/generarGuiaTransporteNacional.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: "cotizarDoble",
      access: "",
      token,
      idempresa,
      origen: "BOGOTA(CUNDINAMARCA)",
      destino,
      productos: buildCotizarProductos([fotoiman(5)]),
      contraentrega: 0,
      contraentregaPayment: 0,
      valorrecaudo: 0,
      valorMinimo: 0,
      idasumecosto: 0,
      plugin: "apiave",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const data = (await res.json()) as {
    status?: string;
    message?: string;
    cotizaciones?: CotizacionRow[];
  };
  console.log(`\n=== ${destino} (HTTP ${res.status}, ${elapsed}s) ===`);
  console.log(`top-level: status=${data.status} message=${data.message ?? "(sin message)"}`);
  const rows = data.cotizaciones ?? [];
  console.log(`cotizaciones: ${rows.length}`);
  for (const c of rows) {
    console.log(
      `  [${c.nombreTransportadora ?? "?"}] numbererror=${JSON.stringify(c.numbererror)} ` +
        `dataerror=${JSON.stringify(c.dataerror)} total=${c.total ?? "-"} dias=${c.diasentrega ?? "-"}`,
    );
  }
  return data;
}

describe.skipIf(!live)("SONDA cobertura Aveonline (destinos difíciles)", () => {
  it("SINCELEJO(SUCRE)", async () => {
    const d = await probe("SINCELEJO(SUCRE)");
    expect(d).toBeTruthy();
  }, 35_000);

  it("FLORENCIA(CAQUETA)", async () => {
    const d = await probe("FLORENCIA(CAQUETA)");
    expect(d).toBeTruthy();
  }, 35_000);

  it("SAN ANDRES(SAN ANDRES Y PROVIDENCIA)", async () => {
    const d = await probe("SAN ANDRES(SAN ANDRES Y PROVIDENCIA)");
    expect(d).toBeTruthy();
  }, 35_000);

  it("PUERTO CARRENO(VICHADA)", async () => {
    const d = await probe("PUERTO CARRENO(VICHADA)");
    expect(d).toBeTruthy();
  }, 35_000);

  it("LETICIA(AMAZONAS)", async () => {
    const d = await probe("LETICIA(AMAZONAS)");
    expect(d).toBeTruthy();
  }, 35_000);

  it("NARNIA(CUNDINAMARCA) — destino inexistente", async () => {
    const d = await probe("NARNIA(CUNDINAMARCA)");
    expect(d).toBeTruthy();
  }, 35_000);
});
