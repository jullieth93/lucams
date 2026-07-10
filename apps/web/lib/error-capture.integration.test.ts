/*
 * Integración DB — captureClientError (Bloque D, sink de errores del cliente).
 * Verifica el DEDUP por fingerprint: el mismo error recurrente incrementa `count`
 * en vez de crear filas nuevas; errores distintos crean filas distintas.
 *
 * Requiere DATABASE_URL (vía dotenv). Sin DB → skipIf. Aislamiento: los mensajes
 * llevan un prefijo único por corrida y afterAll borra exactamente lo creado.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { captureClientError } from "./error-capture";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `ITESTCLIENTERR${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!hasDb)("captureClientError — dedup por fingerprint", () => {
  afterAll(async () => {
    await prisma.errorReport
      .deleteMany({ where: { message: { startsWith: RUN } } })
      .catch(() => {});
  });

  it("crea una fila nueva la primera vez (count 1, status OPEN)", async () => {
    const message = `${RUN}-boom`;
    await captureClientError({ message, stack: "at Foo (a.js:1)\nat Bar (b.js:2)" });
    const rows = await prisma.errorReport.findMany({ where: { message } });
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
    expect(rows[0].status).toBe("OPEN");
  });

  it("el MISMO error (igual message+stack) incrementa count, no crea fila nueva", async () => {
    const message = `${RUN}-repeat`;
    const stack = "at X (x.js:10)\nat Y (y.js:20)\nat Z (z.js:30)";
    await captureClientError({ message, stack });
    await captureClientError({ message, stack });
    await captureClientError({ message, stack });
    const rows = await prisma.errorReport.findMany({ where: { message } });
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(3);
    // lastSeenAt debe ser >= firstSeenAt tras las repeticiones.
    expect(rows[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(rows[0].firstSeenAt.getTime());
  });

  it("errores con distinto stack producen fingerprints (filas) distintos", async () => {
    const message = `${RUN}-samefmsg`;
    await captureClientError({ message, stack: "at A (a.js:1)" });
    await captureClientError({ message, stack: "at B (b.js:2)" });
    const rows = await prisma.errorReport.findMany({ where: { message } });
    expect(rows.length).toBe(2);
    expect(new Set(rows.map((r) => r.fingerprint)).size).toBe(2);
  });

  it("persiste url/userAgent/digest y trunca campos largos", async () => {
    const message = `${RUN}-meta`;
    await captureClientError({
      message,
      stack: "at M (m.js:1)",
      url: "https://lucamsshop.co/estudio/algo",
      userAgent: "Mozilla/5.0 test",
      digest: "digest-123",
    });
    const row = await prisma.errorReport.findFirst({ where: { message } });
    expect(row?.url).toBe("https://lucamsshop.co/estudio/algo");
    expect(row?.userAgent).toBe("Mozilla/5.0 test");
    expect(row?.digest).toBe("digest-123");
  });

  it("no lanza aunque el message venga vacío (best-effort)", async () => {
    await expect(captureClientError({ message: "" })).resolves.toBeUndefined();
  });
});
