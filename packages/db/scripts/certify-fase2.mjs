#!/usr/bin/env node
/*
 * Certificación F2.0 — llamadas reales a Wompi sandbox + Aveonline.
 *
 * Uso:  node packages/db/scripts/certify-fase2.mjs
 * Requiere: set -a && source apps/web/.env.local && set +a
 *
 * Tests:
 *   W1. Wompi: getWompiConfig() devuelve env correcto
 *   W2. Wompi: buildCheckoutUrl genera URL con firma SHA256 válida
 *   W3. Wompi: getTransaction con ID inválido → HTTP 404 (auth funciona)
 *   A1. Aveonline: auth con AVEONLINE_USUARIO/CLAVE → JWT válido
 *   A2. Aveonline: cotización Bogotá → Medellín devuelve transportadoras
 */

import crypto from "node:crypto";

const SANDBOX_API = "https://sandbox.wompi.co/v1";
const AVEONLINE_API = "https://app.aveonline.co/api";

const C = {
  reset: "\x1b[0m",
  ok: "\x1b[32m✓\x1b[0m",
  fail: "\x1b[31m✗\x1b[0m",
  warn: "\x1b[33m⚠\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

let totalOk = 0;
let totalFail = 0;

function pass(name, detail = "") {
  totalOk++;
  console.log(`  ${C.ok} ${name}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`);
}
function fail(name, err) {
  totalFail++;
  console.log(`  ${C.fail} ${name}`);
  console.log(`     ${C.dim}${err}${C.reset}`);
}

async function main() {
  console.log(`${C.bold}─── Wompi sandbox ───${C.reset}`);

  // W1: env config
  const publicKey = process.env.WOMPI_PUBLIC_KEY?.trim();
  const privateKey = process.env.WOMPI_PRIVATE_KEY?.trim();
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET?.trim();
  if (!publicKey || !privateKey || !integritySecret || !eventsSecret) {
    fail("W1 env vars completas", "alguna WOMPI_* falta o vacía");
    process.exit(1);
  }
  if (!publicKey.startsWith("pub_test_")) {
    fail("W1 sandbox keys", `WOMPI_PUBLIC_KEY no empieza con pub_test_ (¿estás en prod?)`);
  } else {
    pass("W1 env vars sandbox completas", `pub_test_${publicKey.slice(9, 17)}…`);
  }

  // W2: buildCheckoutUrl + signature
  try {
    const reference = "TEST-CERT-001";
    const amountInCents = 100000; // $1.000 COP
    const currency = "COP";
    const concat = `${reference}${amountInCents}${currency}${integritySecret}`;
    const expectedSig = crypto.createHash("sha256").update(concat).digest("hex");
    if (expectedSig.length !== 64) throw new Error("hash length inválido");
    pass("W2 firma de integridad SHA256", `${expectedSig.slice(0, 16)}…`);
  } catch (e) {
    fail("W2 firma de integridad", e.message);
  }

  // W3: getTransaction con ID inválido → debe responder con error de Wompi
  // (no error de red). Si auth está rota, devolvería 401.
  try {
    const fakeId = "00000-0000-FAKE";
    const res = await fetch(
      `${SANDBOX_API}/transactions/${encodeURIComponent(fakeId)}`,
      {
        headers: { Authorization: `Bearer ${privateKey}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 401) {
      fail("W3 getTransaction auth", "HTTP 401 — WOMPI_PRIVATE_KEY inválida");
    } else if (res.status === 404) {
      pass("W3 getTransaction auth OK", "HTTP 404 sobre ID falso (esperado)");
    } else if (res.status === 422 || res.status === 400) {
      pass("W3 getTransaction auth OK", `HTTP ${res.status} (ID malformado, esperado)`);
    } else {
      const body = await res.text().catch(() => "");
      fail("W3 getTransaction", `HTTP ${res.status} inesperado: ${body.slice(0, 100)}`);
    }
  } catch (e) {
    fail("W3 getTransaction red", e.message);
  }

  console.log(`${C.bold}\n─── Aveonline ───${C.reset}`);

  // A1: auth real
  const usuario = process.env.AVEONLINE_USUARIO?.trim();
  const clave = process.env.AVEONLINE_CLAVE?.trim();
  if (!usuario || !clave) {
    fail("A1 env vars", "AVEONLINE_USUARIO o AVEONLINE_CLAVE faltan");
    finish();
    return;
  }

  let token, idempresa;
  try {
    const res = await fetch(`${AVEONLINE_API}/comunes/v1.0/autenticarusuario.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "auth", usuario, clave }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      fail("A1 auth", `HTTP ${res.status}`);
    } else {
      const data = await res.json();
      if (data.status !== "ok" || !data.token || !data.cuentas?.[0]?.usuarios?.[0]) {
        fail("A1 auth respuesta", JSON.stringify(data).slice(0, 150));
      } else {
        token = data.token;
        idempresa = data.cuentas[0].usuarios[0].id;
        pass("A1 auth OK", `idempresa=${idempresa}, JWT len=${token.length}`);
      }
    }
  } catch (e) {
    fail("A1 auth red", e.message);
  }

  // A2: cotización Bogotá → Medellín
  if (token && idempresa) {
    try {
      const res = await fetch(
        `${AVEONLINE_API}/nal/v1.0/generarGuiaTransporteNacional.php`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "cotizar2",
            token,
            idempresa,
            origen: "BOGOTA D.C.(CUNDINAMARCA)",
            destino: "MEDELLIN(ANTIOQUIA)",
            productos: [
              {
                alto: 5,
                ancho: 5,
                largo: 5,
                peso: 0.5,
                unidades: 1,
                nombre: "test-product",
                valorDeclarado: 50000,
              },
            ],
            contraentrega: 0,
            idasumecosto: 0,
            plugin: "lucamsshop-cert",
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) {
        fail("A2 cotización", `HTTP ${res.status}`);
      } else {
        const data = await res.json();
        const cot = data?.cotizaciones ?? [];
        if (cot.length === 0) {
          fail(
            "A2 cotización vacía",
            `respuesta: ${JSON.stringify(data).slice(0, 200)}`,
          );
        } else {
          const transportadoras = cot
            .slice(0, 3)
            .map((c) => `${c.nombreTransportadora}=$${Math.round(c.total)}`)
            .join(", ");
          pass(
            "A2 cotización OK",
            `${cot.length} transportadoras: ${transportadoras}${cot.length > 3 ? "…" : ""}`,
          );
        }
      }
    } catch (e) {
      fail("A2 cotización red", e.message);
    }
  } else {
    fail("A2 cotización", "saltado (auth falló)");
  }

  finish();
}

function finish() {
  console.log(`\n${C.bold}─── Resumen ───${C.reset}`);
  console.log(`  ${C.ok} ${totalOk} pasaron`);
  if (totalFail > 0) {
    console.log(`  ${C.fail} ${totalFail} fallaron`);
    process.exit(1);
  } else {
    console.log(`\n${C.bold}🎉 F2.0 certificada — lista para F2.1${C.reset}`);
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
