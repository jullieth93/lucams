/*
 * Integración — Retención de fotos del Estudio (Ley 1581). Verifica que la purga:
 *   - BORRA diseños DRAFT anónimos abandonados (y sus assets), y
 *   - CONSERVA READY / con customerId / referenciados por carrito / recientes.
 *
 * Comparte la Supabase de dev; fixtures RUN-prefijados. La purga se ACOTA con sessionIdPrefix=RUN
 * para no tocar datos reales ni de otras corridas. TODOS los tests exigen Supabase real: aunque un
 * diseño no tenga assets, la purga barre el área de paso de Storage (staged slots) y eso necesita
 * el cliente de Storage. En CI (vars de Supabase vacías a propósito, ver ci.yml) el archivo se
 * salta entero; en local corre completo vía .env.local.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { purgeAbandonedAnonymousDesigns } from "./retention-service";

const RUN = `ret${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const hasStorage = !!process.env.SUPABASE_SECRET_KEY;
let categoryId = "";
let productId = "";
let variantId = "";
let customerId = "";

// Purga acotada a ESTA corrida; cutoff en el futuro (olderThanDays negativo) → la edad no filtra,
// así probamos las demás condiciones sin backdatear updatedAt.
function purgeThisRun(olderThanDays = -1) {
  return purgeAbandonedAnonymousDesigns({ sessionIdPrefix: RUN, olderThanDays });
}

async function makeDesign(opts: {
  status?: "DRAFT" | "READY" | "USED_IN_ORDER" | "ARCHIVED";
  anon?: boolean;
  previewUrl?: string | null;
}) {
  return (
    await prisma.design.create({
      data: {
        sessionId: `${RUN}-${Math.random().toString(36).slice(2, 8)}`,
        customerId: opts.anon === false ? customerId : null,
        productId,
        status: opts.status ?? "DRAFT",
        canvasData: {},
        previewUrl: opts.previewUrl ?? null,
      },
      select: { id: true },
    })
  ).id;
}

const designExists = async (id: string) =>
  (await prisma.design.findUnique({ where: { id }, select: { id: true } })) !== null;

beforeAll(async () => {
  categoryId = (
    await prisma.category.create({ data: { slug: `${RUN}-c`, name: "c" }, select: { id: true } })
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
  variantId = (
    await prisma.productVariant.create({
      data: {
        productId,
        name: "u",
        sku: `${RUN}-V`.toUpperCase(),
        price: 1000,
        stock: 5,
        attributes: {},
      },
      select: { id: true },
    })
  ).id;
  customerId = (
    await prisma.customer.create({
      data: {
        email: `${RUN}@lucams.test`,
        supabaseUserId: `${RUN}-sub`,
        referralCode: `${RUN}-ref`,
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  await safe(prisma.designAsset.deleteMany({ where: { sessionId: { startsWith: RUN } } }));
  await safe(prisma.cartItem.deleteMany({ where: { cart: { sessionId: { startsWith: RUN } } } }));
  await safe(prisma.cart.deleteMany({ where: { sessionId: { startsWith: RUN } } }));
  await safe(prisma.design.deleteMany({ where: { productId } }));
  await safe(prisma.productVariant.deleteMany({ where: { productId } }));
  await safe(prisma.product.deleteMany({ where: { id: productId } }));
  await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
  await safe(prisma.customer.deleteMany({ where: { id: customerId } }));
});

describe.skipIf(!process.env.DATABASE_URL || !hasStorage)(
  "retención — purga de diseños anónimos",
  () => {
    it("purga un diseño DRAFT anónimo abandonado (sin assets)", async () => {
      const id = await makeDesign({ status: "DRAFT", anon: true });
      const res = await purgeThisRun();
      expect(res.designsPurged).toBeGreaterThanOrEqual(1);
      expect(await designExists(id)).toBe(false);
    });

    it("CONSERVA un DRAFT reciente (dentro de la ventana de 30 días)", async () => {
      const id = await makeDesign({ status: "DRAFT", anon: true });
      // olderThanDays=30 → cutoff hace 30 días; el diseño recién creado NO califica.
      await purgeThisRun(30);
      expect(await designExists(id)).toBe(true);
    });

    it(
      "CONSERVA READY, con customerId, y referenciado por un carrito (aunque califiquen por edad)",
      { timeout: 30000 },
      async () => {
        const ready = await makeDesign({ status: "READY", anon: true });
        const owned = await makeDesign({ status: "DRAFT", anon: false });
        const inCart = await makeDesign({ status: "DRAFT", anon: true });
        // Referenciar `inCart` desde un CartItem vivo (sessionId aleatorio para no colisionar en retries).
        await prisma.cart.create({
          data: {
            sessionId: `${RUN}-cart-${Math.random().toString(36).slice(2, 8)}`,
            currency: "COP",
            items: { create: [{ variantId, qty: 1, unitPrice: 1000, designId: inCart }] },
          },
        });

        await purgeThisRun();

        expect(await designExists(ready)).toBe(true);
        expect(await designExists(owned)).toBe(true);
        expect(await designExists(inCart)).toBe(true);
      },
    );

    it.skipIf(!hasStorage)(
      "purga el diseño DRAFT anónimo y sus DesignAsset (borra bytes)",
      { timeout: 30000 },
      async () => {
        const id = await makeDesign({ status: "DRAFT", anon: true });
        await prisma.designAsset.create({
          data: {
            designId: id,
            sessionId: `${RUN}-a`,
            storageUrl: `${RUN}/pending/${Math.random().toString(36).slice(2)}.jpg`,
            mimeType: "image/jpeg",
            sizeBytes: 1,
            width: 1,
            height: 1,
          },
        });
        const res = await purgeThisRun();
        expect(res.assetsPurged).toBeGreaterThanOrEqual(1);
        expect(await designExists(id)).toBe(false);
        expect(
          await prisma.designAsset.findFirst({ where: { designId: id }, select: { id: true } }),
        ).toBeNull();
      },
    );

    it.skipIf(!hasStorage)(
      "purga un DesignAsset anónimo huérfano (designId null) viejo",
      { timeout: 30000 },
      async () => {
        const asset = await prisma.designAsset.create({
          data: {
            designId: null,
            customerId: null,
            sessionId: `${RUN}-orphan`,
            storageUrl: `${RUN}/pending/${Math.random().toString(36).slice(2)}.jpg`,
            mimeType: "image/jpeg",
            sizeBytes: 1,
            width: 1,
            height: 1,
          },
          select: { id: true },
        });
        await purgeThisRun();
        expect(
          await prisma.designAsset.findUnique({ where: { id: asset.id }, select: { id: true } }),
        ).toBeNull();
      },
    );
  },
);
