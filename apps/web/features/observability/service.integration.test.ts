/*
 * Integración DB — panel de salud técnica (Bloque D). getTechHealth agrega
 * conteos GLOBALES (no scopeados), así que verificamos con umbrales (>=) sobre
 * filas que insertamos, no igualdades exactas.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getTechHealth, setErrorReportStatus } from "./service";

const hasDb = !!process.env.DATABASE_URL;
const RUN = `obs${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const MSG = `${RUN} error de prueba`;

describe.skipIf(!hasDb)("observability/service — integración DB", { timeout: 30_000 }, () => {
  afterAll(async () => {
    await prisma.errorLog.deleteMany({ where: { message: { startsWith: RUN } } }).catch(() => {});
    await prisma.errorReport
      .deleteMany({ where: { message: { startsWith: RUN } } })
      .catch(() => {});
    await prisma.$disconnect();
  });

  it("getTechHealth cuenta los errores insertados y los lista en top", async () => {
    await prisma.errorLog.createMany({
      data: [
        { message: MSG, routePath: "/checkout/pago", digest: `${RUN}-d` },
        { message: MSG, routePath: "/checkout/pago", digest: `${RUN}-d` },
        { message: MSG, routePath: "/checkout/pago", digest: `${RUN}-d` },
      ],
    });

    const h = await getTechHealth();
    // Al menos nuestros 3 (global, puede haber más de otras corridas).
    expect(h.errors.last24h).toBeGreaterThanOrEqual(3);
    expect(h.errors.last7d).toBeGreaterThanOrEqual(3);
    // Nuestro mensaje aparece agrupado con count >= 3.
    const mine = h.errors.top.find((e) => e.message === MSG);
    expect(mine).toBeDefined();
    expect(mine!.count).toBeGreaterThanOrEqual(3);
    expect(mine!.routePath).toBe("/checkout/pago");
  });

  it("devuelve la forma completa (webhooks, reconciliación, vitals, clientErrors)", async () => {
    const h = await getTechHealth();
    expect(typeof h.webhooks.total7d).toBe("number");
    expect(typeof h.webhooks.processed7d).toBe("number");
    expect(typeof h.reconciliation.count).toBe("number");
    expect(Array.isArray(h.reconciliation.orders)).toBe(true);
    expect(typeof h.stockReverts7d).toBe("number");
    expect(typeof h.vitals7d.good).toBe("number");
    expect(typeof h.clientErrors.openCount).toBe("number");
    expect(Array.isArray(h.clientErrors.top)).toBe(true);
  });

  it("setErrorReportStatus resuelve un reporte: sale de OPEN y sella resolvedBy/resolvedAt", async () => {
    const report = await prisma.errorReport.create({
      data: { fingerprint: `${RUN}-fp`, message: `${RUN} client boom` },
    });
    expect(report.status).toBe("OPEN");

    // Aparece en el listado de abiertos del panel.
    const before = await getTechHealth();
    expect(before.clientErrors.top.some((e) => e.id === report.id)).toBe(true);

    await setErrorReportStatus(report.id, "RESOLVED", `${RUN}-admin`);

    const updated = await prisma.errorReport.findUnique({ where: { id: report.id } });
    expect(updated?.status).toBe("RESOLVED");
    expect(updated?.resolvedBy).toBe(`${RUN}-admin`);
    expect(updated?.resolvedAt).not.toBeNull();

    // Ya NO aparece entre los abiertos.
    const after = await getTechHealth();
    expect(after.clientErrors.top.some((e) => e.id === report.id)).toBe(false);
  });

  it("reabrir un reporte (status OPEN) limpia resolvedBy/resolvedAt", async () => {
    const report = await prisma.errorReport.create({
      data: {
        fingerprint: `${RUN}-fp2`,
        message: `${RUN} reopen`,
        status: "IGNORED",
        resolvedBy: "x",
        resolvedAt: new Date(),
      },
    });
    await setErrorReportStatus(report.id, "OPEN", `${RUN}-admin`);
    const updated = await prisma.errorReport.findUnique({ where: { id: report.id } });
    expect(updated?.status).toBe("OPEN");
    expect(updated?.resolvedBy).toBeNull();
    expect(updated?.resolvedAt).toBeNull();
  });
});
