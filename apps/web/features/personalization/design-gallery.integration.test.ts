/*
 * ADR-057 Fase B2 — Integración del servicio de galería de diseños prediseñados contra la DB real.
 * Certifica el CRUD + el filtrado por tag/activo. Fixtures RUN-prefijados + cleanup scoped.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  listGalleryImages,
  getGalleryImageUrl,
  listGalleryAdmin,
  createGalleryImage,
  deleteGalleryImage,
  listGalleryTagOptions,
} from "./design-gallery";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `gal${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

afterAll(async () => {
  await prisma.designGalleryImage.deleteMany({ where: { tag: TAG } }).catch(() => {});
});

describe.skipIf(!hasDb)("design-gallery — integración", { timeout: 30000 }, () => {
  it("create → list → get → delete (con filtro por tag/activo)", async () => {
    const a = await createGalleryImage({
      tag: TAG,
      name: "Flores",
      imageUrl: "https://x/1.png",
      adminId: "admin_test",
    });
    const b = await createGalleryImage({
      tag: TAG,
      name: "Corazón",
      imageUrl: "https://x/2.png",
      adminId: "admin_test",
    });

    // list público: ambos, ordenados por order (0,1)
    const list = await listGalleryImages(TAG);
    expect(list.map((i) => i.name)).toEqual(["Flores", "Corazón"]);

    // getUrl del activo
    expect(await getGalleryImageUrl(a.id)).toBe("https://x/1.png");

    // admin list del tag
    const adminList = await listGalleryAdmin(TAG);
    expect(adminList).toHaveLength(2);

    // borrar (soft) → desaparece del list público y del getUrl
    await deleteGalleryImage(a.id);
    const after = await listGalleryImages(TAG);
    expect(after.map((i) => i.id)).toEqual([b.id]);
    expect(await getGalleryImageUrl(a.id)).toBeNull();
  });

  it("no filtra diseños de otro tag", async () => {
    await createGalleryImage({
      tag: `${TAG}-x`,
      name: "Ajeno",
      imageUrl: "https://x/z.png",
      adminId: "admin_test",
    });
    const list = await listGalleryImages(TAG);
    expect(list.every((i) => i.name !== "Ajeno")).toBe(true);
    await prisma.designGalleryImage.deleteMany({ where: { tag: `${TAG}-x` } });
  });

  // Lucy 2026-09-08 — el opt-in de la galería es `personalizationSchema.galleryTag`
  // (convención: el slug del producto). Este test blinda que los separadores lo declaran
  // y que el admin (/admin/disenos) los ofrece con cara B (facesPerUnit=2): es el cable
  // que una corrida vieja de un seed histórico podría romper en silencio (tag compartido
  // "separadores" → uploads del admin con "Producto inválido" y estudio sin diseños).
  it("los separadores declaran galleryTag = su slug y el admin los lista con cara B", async (ctx) => {
    const products = await prisma.product.findMany({
      where: {
        slug: { in: ["separadores-magneticos", "separadores-alargados"] },
        isActive: true,
        deletedAt: null,
      },
      select: { slug: true, personalizationSchema: true },
    });
    if (products.length === 0) return ctx.skip();

    const options = await listGalleryTagOptions();
    for (const p of products) {
      const schema = p.personalizationSchema as { galleryTag?: unknown } | null;
      expect(schema?.galleryTag, p.slug).toBe(p.slug);
      const option = options.find((o) => o.tag === p.slug);
      expect(option, p.slug).toBeDefined();
      expect(option?.needsFaceB, p.slug).toBe(true);
    }
  });
});
