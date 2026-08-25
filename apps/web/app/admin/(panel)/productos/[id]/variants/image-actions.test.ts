/*
 * Unit tests — image-actions de variantes: portadas compartidas por DISEÑO
 * (reporte Lucy 2026-08-25, separadores-magneticos: 12 opciones = 2 diseños ×
 * 6 cantidades; las fotos de portada se gestionan por diseño, no por cantidad).
 *
 * No hay harness de integración para estas server actions (los .integration
 * del repo cubren services de features/*, no actions de imágenes del admin),
 * así que se prueba la LÓGICA de propagación con prisma/storage/audit/guard
 * mockeados — patrón de features/admin-users/service.test.ts (vi.hoisted +
 * vi.mock("@/lib/db")); el gate MFA/RBAC real se cubre aparte en
 * app/admin/(panel)/productos/product-actions-aal2.test.ts.
 *
 * Escenario base tipo separadores: v1/v2/v3 son el MISMO diseño
 * (sizeCm "4×4.2", distinta quantity/photoSlots); "otra" es OTRO diseño
 * (sizeCm "6x2") y nunca debe entrar al grupo de portada de v1.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockStorage, auditSpy, mockLogger } = vi.hoisted(() => ({
  mockPrisma: {
    productVariant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    product: { count: vi.fn() },
  },
  mockStorage: {
    uploadProductImage: vi.fn(),
    deleteProductImage: vi.fn(),
  },
  auditSpy: { recordAdminAction: vi.fn(async () => {}) },
  mockLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/storage", () => ({
  uploadProductImage: mockStorage.uploadProductImage,
  deleteProductImage: mockStorage.deleteProductImage,
  StorageError: class StorageError extends Error {},
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: auditSpy.recordAdminAction }));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async () => ({
    user: { id: "user1" },
    admin: { id: "admin1", role: "SUPERADMIN" },
  })),
}));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  deleteVariantImageAction,
  reorderVariantImagesAction,
  unifyVariantCoverGroupAction,
  uploadVariantImagesAction,
} from "./image-actions";

const PRODUCT_ID = "prod1";
const ADMIN_ID = "admin1";

/** Mismo diseño (sizeCm fijo); solo cambia la cantidad — NO cambia la firma. */
const attrsDisenoA = (n: number) => ({ sizeCm: "4×4.2", quantity: n, photoSlots: n });

/** Fila con la forma del select de loadVariant (la opción editada). */
function editedVariant(id: string, images: string[], attributes: unknown) {
  return {
    id,
    productId: PRODUCT_ID,
    images,
    name: `Opción ${id}`,
    attributes,
    product: { slug: "separadores-magneticos" },
  };
}

/** Fila con la forma del select de siblings de loadCoverGroup. */
function sibling(id: string, images: string[], attributes: unknown) {
  return { id, images, attributes };
}

/** Deja findFirst/findMany apuntando a la editada y a TODAS las activas del producto. */
function setupGroup(opts: {
  edited: ReturnType<typeof editedVariant>;
  siblings: Array<ReturnType<typeof sibling>>;
}) {
  mockPrisma.productVariant.findFirst.mockResolvedValue(opts.edited);
  mockPrisma.productVariant.findMany.mockResolvedValue(opts.siblings);
}

function uploadForm(...fileNames: string[]): FormData {
  const fd = new FormData();
  fd.set("variantId", "v1");
  for (const name of fileNames) {
    fd.append("files", new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" }));
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.productVariant.update.mockResolvedValue({});
  mockPrisma.productVariant.updateMany.mockResolvedValue({ count: 0 });
  // Nadie referencia nada por defecto (ni product.images ni otras variantes).
  mockPrisma.product.count.mockResolvedValue(0);
  mockPrisma.productVariant.count.mockResolvedValue(0);
  mockStorage.uploadProductImage.mockImplementation(async ({ file }: { file: File }) => ({
    publicUrl: `https://cdn.test/${file.name}`,
  }));
  mockStorage.deleteProductImage.mockResolvedValue(undefined);
});

describe("uploadVariantImagesAction — propagación por diseño", () => {
  it("grupo UNIFICADO (mismo diseño, mismas fotos) → propaga el array resultante a TODAS las opciones", async () => {
    setupGroup({
      edited: editedVariant("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
      siblings: [
        sibling("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
        sibling("v2", ["https://cdn.test/a.jpg"], attrsDisenoA(2)),
        sibling("v3", ["https://cdn.test/a.jpg"], attrsDisenoA(3)),
        // Otro diseño (sizeCm distinto): NO entra al grupo.
        sibling("otra", ["https://cdn.test/z.jpg"], { sizeCm: "6x2", quantity: 1, photoSlots: 1 }),
      ],
    });

    const res = await uploadVariantImagesAction(uploadForm("nueva.jpg"));

    expect(res).toEqual({});
    // La URL se subió UNA sola vez a Storage…
    expect(mockStorage.uploadProductImage).toHaveBeenCalledTimes(1);
    // …y el array resultante se escribió en las 3 opciones del diseño (no en "otra").
    expect(mockPrisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["v1", "v2", "v3"] } },
      data: {
        images: ["https://cdn.test/a.jpg", "https://cdn.test/nueva.jpg"],
        updatedBy: ADMIN_ID,
      },
    });
    expect(mockPrisma.productVariant.update).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "variant.images.upload",
        metadata: expect.objectContaining({ coverGroupSize: 3 }),
      }),
    );
  });

  it("grupo DIVERGENTE (fotos distintas entre opciones, datos viejos) → solo toca la opción editada", async () => {
    setupGroup({
      edited: editedVariant("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
      siblings: [
        sibling("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
        sibling("v2", ["https://cdn.test/otra.jpg"], attrsDisenoA(2)),
      ],
    });

    const res = await uploadVariantImagesAction(uploadForm("nueva.jpg"));

    expect(res).toEqual({});
    expect(mockPrisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: {
        images: ["https://cdn.test/a.jpg", "https://cdn.test/nueva.jpg"],
        updatedBy: ADMIN_ID,
      },
    });
    expect(mockPrisma.productVariant.updateMany).not.toHaveBeenCalled();
  });

  it("grupo de 1 (diseño sin hermanas) → comportamiento clásico: update de una sola opción", async () => {
    setupGroup({
      edited: editedVariant("v1", [], attrsDisenoA(1)),
      siblings: [sibling("v1", [], attrsDisenoA(1))],
    });

    const res = await uploadVariantImagesAction(uploadForm("nueva.jpg"));

    expect(res).toEqual({});
    expect(mockPrisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { images: ["https://cdn.test/nueva.jpg"], updatedBy: ADMIN_ID },
    });
    expect(mockPrisma.productVariant.updateMany).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ coverGroupSize: 1 }),
      }),
    );
  });
});

describe("reorderVariantImagesAction — propagación por diseño", () => {
  it("grupo UNIFICADO → el nuevo orden aplica a todas las opciones del diseño", async () => {
    const fd = new FormData();
    fd.set("variantId", "v1");
    fd.set("order", JSON.stringify(["https://cdn.test/b.jpg", "https://cdn.test/a.jpg"]));
    setupGroup({
      edited: editedVariant(
        "v1",
        ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
        attrsDisenoA(1),
      ),
      siblings: [
        sibling("v1", ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"], attrsDisenoA(1)),
        sibling("v2", ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"], attrsDisenoA(2)),
      ],
    });

    const res = await reorderVariantImagesAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["v1", "v2"] } },
      data: {
        images: ["https://cdn.test/b.jpg", "https://cdn.test/a.jpg"],
        updatedBy: ADMIN_ID,
      },
    });
  });

  it("grupo DIVERGENTE → reordena solo la opción editada", async () => {
    const fd = new FormData();
    fd.set("variantId", "v1");
    fd.set("order", JSON.stringify(["https://cdn.test/b.jpg", "https://cdn.test/a.jpg"]));
    setupGroup({
      edited: editedVariant(
        "v1",
        ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
        attrsDisenoA(1),
      ),
      siblings: [
        sibling("v1", ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"], attrsDisenoA(1)),
        sibling("v2", ["https://cdn.test/x.jpg"], attrsDisenoA(2)),
      ],
    });

    const res = await reorderVariantImagesAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.productVariant.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.productVariant.updateMany).not.toHaveBeenCalled();
  });
});

describe("deleteVariantImageAction — propagación por diseño", () => {
  it("grupo UNIFICADO → quita la foto de todo el diseño y la borra del Storage si nadie la referencia", async () => {
    const fd = new FormData();
    fd.set("variantId", "v1");
    fd.set("url", "https://cdn.test/a.jpg");
    setupGroup({
      edited: editedVariant(
        "v1",
        ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
        attrsDisenoA(1),
      ),
      siblings: [
        sibling("v1", ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"], attrsDisenoA(1)),
        sibling("v2", ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"], attrsDisenoA(2)),
      ],
    });

    const res = await deleteVariantImageAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["v1", "v2"] } },
      data: { images: ["https://cdn.test/b.jpg"], updatedBy: ADMIN_ID },
    });
    // Tras quitarla de TODO el grupo ya nadie la referencia → se borra del Storage.
    expect(mockStorage.deleteProductImage).toHaveBeenCalledWith("https://cdn.test/a.jpg");
  });

  it("NO borra del Storage una URL que otra opción del producto aún referencia", async () => {
    const fd = new FormData();
    fd.set("variantId", "v1");
    fd.set("url", "https://cdn.test/a.jpg");
    setupGroup({
      edited: editedVariant("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
      siblings: [sibling("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1))],
    });
    // Otra variante activa del producto (p.ej. otro diseño) aún la tiene.
    mockPrisma.productVariant.count.mockResolvedValue(1);

    const res = await deleteVariantImageAction(fd);

    expect(res).toEqual({});
    expect(mockStorage.deleteProductImage).not.toHaveBeenCalled();
  });
});

describe("unifyVariantCoverGroupAction — unificar portadas del diseño", () => {
  it("copia el array de la editada a TODO el grupo y borra del Storage las URLs huérfanas", async () => {
    setupGroup({
      edited: editedVariant("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
      siblings: [
        sibling("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
        sibling("v2", ["https://cdn.test/b.jpg"], attrsDisenoA(2)),
        sibling("v3", ["https://cdn.test/b.jpg", "https://cdn.test/c.jpg"], attrsDisenoA(3)),
        // Otro diseño: ni se unifica ni se le tocan las fotos.
        sibling("otra", ["https://cdn.test/z.jpg"], { sizeCm: "6x2", quantity: 1, photoSlots: 1 }),
      ],
    });
    const fd = new FormData();
    fd.set("variantId", "v1");

    const res = await unifyVariantCoverGroupAction(fd);

    expect(res).toEqual({});
    expect(mockPrisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["v1", "v2", "v3"] } },
      data: { images: ["https://cdn.test/a.jpg"], updatedBy: ADMIN_ID },
    });
    // b.jpg y c.jpg quedaron huérfanas (1 llamada por URL única); z.jpg intacta.
    expect(mockStorage.deleteProductImage).toHaveBeenCalledTimes(2);
    expect(mockStorage.deleteProductImage).toHaveBeenCalledWith("https://cdn.test/b.jpg");
    expect(mockStorage.deleteProductImage).toHaveBeenCalledWith("https://cdn.test/c.jpg");
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "variant.images.unify_cover_group",
        metadata: { unified: 3, droppedUrls: 2 },
      }),
    );
  });

  it("conserva una huérfana que el PRODUCTO aún referencia en product.images", async () => {
    setupGroup({
      edited: editedVariant("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
      siblings: [
        sibling("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
        sibling("v2", ["https://cdn.test/b.jpg"], attrsDisenoA(2)),
        sibling("v3", ["https://cdn.test/c.jpg"], attrsDisenoA(3)),
      ],
    });
    // b.jpg sigue siendo foto del producto → no se borra del Storage.
    mockPrisma.product.count.mockImplementation(
      async ({ where }: { where: { images: { has: string } } }) =>
        where.images.has === "https://cdn.test/b.jpg" ? 1 : 0,
    );
    const fd = new FormData();
    fd.set("variantId", "v1");

    const res = await unifyVariantCoverGroupAction(fd);

    expect(res).toEqual({});
    expect(mockStorage.deleteProductImage).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteProductImage).toHaveBeenCalledWith("https://cdn.test/c.jpg");
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { unified: 3, droppedUrls: 1 } }),
    );
  });

  it("un fallo de Storage en una huérfana deja warn pero la acción completa", async () => {
    setupGroup({
      edited: editedVariant("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
      siblings: [
        sibling("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
        sibling("v2", ["https://cdn.test/b.jpg"], attrsDisenoA(2)),
        sibling("v3", ["https://cdn.test/c.jpg"], attrsDisenoA(3)),
      ],
    });
    mockStorage.deleteProductImage.mockImplementation(async (url: string) => {
      if (url === "https://cdn.test/b.jpg") throw new Error("storage caído");
    });
    const fd = new FormData();
    fd.set("variantId", "v1");

    const res = await unifyVariantCoverGroupAction(fd);

    expect(res).toEqual({});
    expect(mockLogger.warn).toHaveBeenCalled();
    // Solo c.jpg se borró; b.jpg quedó huérfana en Storage (no rompe la acción).
    expect(auditSpy.recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { unified: 3, droppedUrls: 1 } }),
    );
  });

  it("grupo de 1 → error claro y no escribe ni audita", async () => {
    setupGroup({
      edited: editedVariant("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1)),
      siblings: [sibling("v1", ["https://cdn.test/a.jpg"], attrsDisenoA(1))],
    });
    const fd = new FormData();
    fd.set("variantId", "v1");

    const res = await unifyVariantCoverGroupAction(fd);

    expect(res.error).toBeTruthy();
    expect(mockPrisma.productVariant.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.productVariant.update).not.toHaveBeenCalled();
    expect(auditSpy.recordAdminAction).not.toHaveBeenCalled();
  });
});
