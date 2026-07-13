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
} from "./design-gallery";

const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `gal${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

afterAll(async () => {
  await prisma.designGalleryImage.deleteMany({ where: { tag: TAG } }).catch(() => {});
});

describe.skipIf(!hasDb)("design-gallery — integración", { timeout: 30000 }, () => {
  it("create → list → get → delete (con filtro por tag/activo)", async () => {
    const a = await createGalleryImage({ tag: TAG, name: "Flores", imageUrl: "https://x/1.png", adminId: "admin_test" });
    const b = await createGalleryImage({ tag: TAG, name: "Corazón", imageUrl: "https://x/2.png", adminId: "admin_test" });

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
    await createGalleryImage({ tag: `${TAG}-x`, name: "Ajeno", imageUrl: "https://x/z.png", adminId: "admin_test" });
    const list = await listGalleryImages(TAG);
    expect(list.every((i) => i.name !== "Ajeno")).toBe(true);
    await prisma.designGalleryImage.deleteMany({ where: { tag: `${TAG}-x` } });
  });
});
