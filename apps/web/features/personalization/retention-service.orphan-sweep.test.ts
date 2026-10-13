/*
 * Barrido de huérfanos de Storage (2026-10-12 — fuga de ~316 MB en PRD: objetos cuyo Design
 * ya no existe, invisibles para las purgas por-diseño).
 *
 * FOCO:
 *  - classifyStorageOrphan: las reglas del one-shot purge-orphan-storage-20261012.mjs —
 *    production-assets/design-previews `<designId>/…`, customer-uploads `<ownerId>/<designId>/…`
 *    con gracia de 7 días para `<ownerId>/pending/…`.
 *  - sweepOrphanStorageObjects: doble verificación (el SQL propone candidatos; JS relee los
 *    Design y solo borra lo confirmado), borrado por bucket en lotes, conteo de fallos y
 *    batch acotado.
 *
 * Sin DB: Prisma y Storage mockeados (mismo patrón que retention-service.idle-ready.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const removeMock = vi.hoisted(() =>
  vi.fn(async (_paths: string[]) => ({ error: null as { message: string } | null })),
);
const queryRawMock = vi.hoisted(() => vi.fn());
const designFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: () => ({ remove: removeMock }) } },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: queryRawMock,
    design: { findMany: designFindManyMock },
  },
}));

import {
  classifyStorageOrphan,
  ORPHAN_PENDING_AFTER_DAYS,
  sweepOrphanStorageObjects,
} from "./retention-service";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

describe("classifyStorageOrphan (reglas del one-shot 2026-10-12)", () => {
  const live = new Set(["d-live"]);

  it("production-assets / design-previews: huérfano si el designId del path no existe", () => {
    for (const bucket of ["production-assets", "design-previews"]) {
      expect(classifyStorageOrphan(bucket, "d-gone/file.png", daysAgo(1), live, NOW)).toBe(
        "design-inexistente",
      );
      expect(classifyStorageOrphan(bucket, "d-live/file.png", daysAgo(400), live, NOW)).toBeNull();
      // El área de paso _client/ cuelga del designId: misma regla.
      expect(
        classifyStorageOrphan(bucket, "d-gone/_client/slot-01.png", daysAgo(1), live, NOW),
      ).toBe("design-inexistente");
    }
  });

  it("customer-uploads: el designId es el SEGUNDO segmento (ownerId/designId/…)", () => {
    expect(
      classifyStorageOrphan("customer-uploads", "owner1/d-gone/foto.jpg", daysAgo(1), live, NOW),
    ).toBe("design-inexistente");
    expect(
      classifyStorageOrphan("customer-uploads", "owner1/d-live/foto.jpg", daysAgo(400), live, NOW),
    ).toBeNull();
  });

  it("customer-uploads pending/: solo huérfano si venció la gracia de 7 días", () => {
    const fresh = daysAgo(ORPHAN_PENDING_AFTER_DAYS - 1);
    const stale = daysAgo(ORPHAN_PENDING_AFTER_DAYS + 1);
    expect(
      classifyStorageOrphan("customer-uploads", "owner1/pending/tmp.jpg", fresh, live, NOW),
    ).toBeNull();
    expect(
      classifyStorageOrphan("customer-uploads", "owner1/pending/tmp.jpg", stale, live, NOW),
    ).toBe("pending-vencido");
  });

  it("bucket desconocido nunca es huérfano", () => {
    expect(classifyStorageOrphan("cms-media", "x/y.jpg", daysAgo(999), new Set(), NOW)).toBeNull();
  });
});

describe("sweepOrphanStorageObjects", () => {
  const obj = (bucket: string, name: string, createdAt: Date) => ({ bucket, name, createdAt });

  beforeEach(() => {
    vi.clearAllMocks();
    removeMock.mockResolvedValue({ error: null });
    designFindManyMock.mockResolvedValue([]);
  });

  it("borra solo lo que la doble verificación confirma (un candidato del SQL con Design vivo NO se borra)", async () => {
    // El SQL (mockeado) propone 4 candidatos; la relectura dice que d-alive SÍ existe.
    queryRawMock.mockResolvedValue([
      obj("production-assets", "d-gone/render-1.png", daysAgo(100)),
      obj("design-previews", "d-gone/preview.png", daysAgo(100)),
      obj("customer-uploads", "owner1/d-gone/foto.jpg", daysAgo(100)),
      obj("production-assets", "d-alive/render-1.png", daysAgo(100)), // falso positivo del SQL
    ]);
    designFindManyMock.mockResolvedValue([{ id: "d-alive" }]);

    const res = await sweepOrphanStorageObjects({ now: NOW });

    expect(res).toEqual({ scanned: 4, orphansDeleted: 3, orphansFailed: 0 });
    // La relectura pidió los designIds referenciados (sin "pending" ni vacíos).
    expect(designFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["d-gone", "d-alive"] } },
      select: { id: true },
    });
    const removed = removeMock.mock.calls.flatMap((c) => (c as unknown as [string[]])[0]);
    expect(removed).toContain("d-gone/render-1.png");
    expect(removed).toContain("owner1/d-gone/foto.jpg");
    expect(removed).not.toContain("d-alive/render-1.png");
  });

  it("un pending/ reciente propuesto por el SQL NO se borra (la gracia se re-verifica en JS)", async () => {
    queryRawMock.mockResolvedValue([
      obj("customer-uploads", "owner1/pending/tmp.jpg", daysAgo(2)), // < 7d
      obj("customer-uploads", "owner2/pending/tmp.jpg", daysAgo(30)), // > 7d
    ]);

    const res = await sweepOrphanStorageObjects({ now: NOW });

    expect(res.orphansDeleted).toBe(1);
    const removed = removeMock.mock.calls.flatMap((c) => (c as unknown as [string[]])[0]);
    expect(removed).toEqual(["owner2/pending/tmp.jpg"]);
    // Los pending no generan relectura de Designs (no referencian designId).
    expect(designFindManyMock).not.toHaveBeenCalled();
  });

  it("sin candidatos no toca Storage ni Design", async () => {
    queryRawMock.mockResolvedValue([]);

    const res = await sweepOrphanStorageObjects({ now: NOW });

    expect(res).toEqual({ scanned: 0, orphansDeleted: 0, orphansFailed: 0 });
    expect(removeMock).not.toHaveBeenCalled();
    expect(designFindManyMock).not.toHaveBeenCalled();
  });

  it("si falla el borrado de un bucket lo cuenta como fallido y sigue con los demás", async () => {
    queryRawMock.mockResolvedValue([
      obj("production-assets", "d-gone/a.png", daysAgo(100)),
      obj("customer-uploads", "o/d-gone/b.jpg", daysAgo(100)),
    ]);
    removeMock
      .mockResolvedValueOnce({ error: { message: "storage caído" } }) // production-assets
      .mockResolvedValueOnce({ error: null }); // customer-uploads

    const res = await sweepOrphanStorageObjects({ now: NOW });

    expect(res).toEqual({ scanned: 2, orphansDeleted: 1, orphansFailed: 1 });
  });

  it("pasa el batchSize al SQL (acotado por corrida)", async () => {
    queryRawMock.mockResolvedValue([]);

    await sweepOrphanStorageObjects({ now: NOW, batchSize: 50 });

    const call = queryRawMock.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    // Tagged template: los valores interpolados son (pendingCutoff, batchSize).
    expect(call[call.length - 1]).toBe(50);
  });
});
