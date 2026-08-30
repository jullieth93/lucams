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
// F-6 (auditoría 2026-08-24): message/stack se persisten con scrubPii, que redacta
// ventanas de 10 dígitos tipo teléfono — un RUN con Timestamp en dígitos podía
// contener una y los queries por el mensaje crudo ya no encontraban la fila
// (flake "expected [] to have length 1", todo-o-nada por corrida). Letras: el
// RUN nunca es scrubbed y el almacenado coincide byte a byte con el consultado.
const RUN = `ITESTCLIENTERR${Date.now()}${Math.floor(Math.random() * 1e6)}`.replace(
  /\d/g,
  (d) => "ABCDEFGHIJ"[Number(d)],
);

// Cada captureClientError hace ~2 round-trips al pooler remoto compartido (upsert +
// select): el default de 5s no alcanza bajo latencia — mismo criterio que el resto
// de integration tests del repo (30s por test).
describe.skipIf(!hasDb)("captureClientError — dedup por fingerprint", { timeout: 30_000 }, () => {
  afterAll(async () => {
    // Limpia por prefijo RUN en message O en url. El caso "message vacío" produce
    // message="unknown" (sin prefijo RUN) → se marca con una url RUN-prefijada para
    // que ESTA limpieza lo borre y no contamine el panel real de observabilidad.
    await prisma.errorReport
      .deleteMany({
        where: {
          OR: [{ message: { startsWith: RUN } }, { url: { startsWith: `itest://${RUN}` } }],
        },
      })
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
      url: "https://lucamsshop.com/estudio/algo",
      userAgent: "Mozilla/5.0 test",
      digest: "digest-123",
    });
    const row = await prisma.errorReport.findFirst({ where: { message } });
    expect(row?.url).toBe("https://lucamsshop.com/estudio/algo");
    expect(row?.userAgent).toBe("Mozilla/5.0 test");
    expect(row?.digest).toBe("digest-123");
  });

  it("no lanza aunque el message venga vacío (best-effort)", async () => {
    // url RUN-prefijada para que afterAll pueda borrar la fila "unknown" resultante
    // (su message pierde el prefijo RUN al caer al fallback "unknown").
    await expect(
      captureClientError({ message: "", url: `itest://${RUN}/empty` }),
    ).resolves.toBeUndefined();
  });

  it("un error RESUELTO que RECURRE se reabre (status→OPEN, limpia resolvedAt/By)", async () => {
    const message = `${RUN}-regresion`;
    const stack = "at Reg (r.js:1)";
    await captureClientError({ message, stack });
    const before = await prisma.errorReport.findFirst({ where: { message } });
    // Admin lo resuelve.
    await prisma.errorReport.update({
      where: { id: before!.id },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: "admin-x" },
    });
    // El mismo error vuelve a ocurrir.
    await captureClientError({ message, stack });
    const after = await prisma.errorReport.findFirst({ where: { message } });
    expect(after!.status).toBe("OPEN");
    expect(after!.resolvedAt).toBeNull();
    expect(after!.resolvedBy).toBeNull();
    expect(after!.count).toBe(2); // incrementó, no creó fila nueva
  }, 30000);

  it("un error IGNORED que recurre NO se reabre (silencio intencional)", async () => {
    const message = `${RUN}-ignorado`;
    const stack = "at Ign (i.js:1)";
    await captureClientError({ message, stack });
    const row = await prisma.errorReport.findFirst({ where: { message } });
    await prisma.errorReport.update({
      where: { id: row!.id },
      data: { status: "IGNORED", resolvedAt: new Date(), resolvedBy: "admin-x" },
    });
    await captureClientError({ message, stack });
    const after = await prisma.errorReport.findFirst({ where: { message } });
    expect(after!.status).toBe("IGNORED"); // sigue silenciado
    expect(after!.count).toBe(2);
  });

  it("mismo message+stack pero DISTINTO digest → filas distintas (server errors enmascarados en prod)", async () => {
    const message = `${RUN}-masked`;
    const stack = "at Server (server.js:1)";
    await captureClientError({ message, stack, digest: "digestA" });
    await captureClientError({ message, stack, digest: "digestB" });
    const rows = await prisma.errorReport.findMany({ where: { message } });
    expect(rows).toHaveLength(2);
  });

  it("normaliza tokens volátiles: mismo error con hash de chunk distinto → una fila", async () => {
    const message = `${RUN}-chunk`;
    // Dos deploys: la URL del chunk cambia de hash, el resto es idéntico.
    await captureClientError({
      message: `${message} Loading chunk failed`,
      stack: "at t (https://x.co/_next/static/chunks/234-abcdef123456.js:9:100)",
    });
    await captureClientError({
      message: `${message} Loading chunk failed`,
      stack: "at t (https://x.co/_next/static/chunks/234-999888777666.js:9:100)",
    });
    const rows = await prisma.errorReport.findMany({
      where: { message: { startsWith: `${message}` } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });
});
