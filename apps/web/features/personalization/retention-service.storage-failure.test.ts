/*
 * Purga de retención (Ley 1581) — camino de FALLO de storage (audit v3 · #8).
 *
 * Invariante crítico: si la remoción de los BYTES de las fotos crudas falla, la purga NO borra las
 * filas del Design → el próximo ciclo reintenta y nunca quedan bytes sin registro (ni al revés).
 * Sin este test, un cambio que borrara las filas aun con storage caído perdería la referencia.
 *
 * Se mockea SOLO el I/O de Storage (supabaseService) y se usa Prisma real → corre en el gate por-PR
 * (DATABASE_URL sí está; SUPABASE_SECRET_KEY no hace falta porque no se tocan bytes de verdad). El
 * mock es por-archivo (vi.mock hoisted), por eso vive en un archivo aparte del integration existente.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { removeMock, fromMock } = vi.hoisted(() => {
  const removeMock = vi.fn();
  // `list` lo necesita la purga para descubrir el área de paso `{designId}/_client/` (ADR-081):
  // esos PNG no viven en ninguna columna, así que se encuentran listando el prefijo. Acá no hay
  // ninguno, que es el caso normal.
  const listMock = vi.fn(async () => ({ data: [] as { name: string }[], error: null }));
  const fromMock = vi.fn(() => ({ remove: removeMock, list: listMock }));
  return { removeMock, fromMock };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: fromMock } },
}));

import { prisma } from "@/lib/db";
import { purgeAbandonedAnonymousDesigns } from "./retention-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `retfail${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
let productId = "";

async function seedAnonDesignWithAsset(): Promise<string> {
  const designId = (
    await prisma.design.create({
      data: {
        sessionId: `${RUN}-${Math.random().toString(36).slice(2, 8)}`,
        customerId: null, // anónimo
        productId,
        status: "DRAFT",
        canvasData: {},
      },
      select: { id: true },
    })
  ).id;
  await prisma.designAsset.create({
    data: {
      designId,
      sessionId: `${RUN}-a`,
      storageUrl: `${RUN}/pending/${Math.random().toString(36).slice(2)}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1,
      width: 1,
      height: 1,
    },
  });
  return designId;
}

const designExists = async (id: string) =>
  (await prisma.design.findUnique({ where: { id }, select: { id: true } })) !== null;

describe.skipIf(!hasDb)(
  "purgeAbandonedAnonymousDesigns — fallo de storage (#8)",
  { timeout: 30_000 },
  () => {
    beforeAll(async () => {
      const categoryId = (
        await prisma.category.create({
          data: { slug: `${RUN}-c`, name: "c" },
          select: { id: true },
        })
      ).id;
      productId = (
        await prisma.product.create({
          data: {
            slug: `${RUN}-p`,
            name: `Imán ${RUN}`,
            description: "x",
            basePrice: 1000,
            sku: `${RUN}-P`.toUpperCase(),
            categoryId,
            isPersonalizable: true,
            personalizationKind: "PHOTO_PACK",
          },
          select: { id: true },
        })
      ).id;
    });

    afterAll(async () => {
      const safe = (p: Promise<unknown>) => p.catch(() => {});
      await safe(prisma.designAsset.deleteMany({ where: { sessionId: { startsWith: RUN } } }));
      await safe(prisma.design.deleteMany({ where: { productId } }));
      await safe(prisma.product.deleteMany({ where: { id: productId } }));
      await safe(prisma.category.deleteMany({ where: { slug: { startsWith: RUN } } }));
    });

    it("si falla la remoción de los bytes de subidas, NO borra las filas (reintento en el próximo ciclo)", async () => {
      removeMock.mockResolvedValue({ error: { message: "storage caído" } });
      const id = await seedAnonDesignWithAsset();

      const res = await purgeAbandonedAnonymousDesigns({ sessionIdPrefix: RUN, olderThanDays: -1 });

      // El Design NO se borró (bytes fallaron → preservar para reintentar).
      expect(await designExists(id)).toBe(true);
      expect(res.designsPurged).toBe(0);
    });

    it("si la remoción de bytes tiene éxito, SÍ borra las filas", async () => {
      removeMock.mockResolvedValue({ error: null });
      const id = await seedAnonDesignWithAsset();

      const res = await purgeAbandonedAnonymousDesigns({ sessionIdPrefix: RUN, olderThanDays: -1 });

      expect(await designExists(id)).toBe(false);
      expect(res.designsPurged).toBeGreaterThanOrEqual(1);
    });
  },
);
