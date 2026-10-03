/*
 * Paquete C (2026-10-02) — persistencia de la aceptación explícita de calidad
 * de fotos: `finalizeDesign` sella `Design.qualityAcknowledgedAt` SOLO cuando el
 * caller (server action) recibió el checkbox marcado de la Vista Previa.
 *
 * Se prueba el camino feliz completo del finalize con un canvas V1 (evita el
 * render server-side, que no es lo que se está midiendo) y snapshots inline:
 * prisma y Supabase Storage mockeados; se inspecciona el `data` del update.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    updateData: null as Record<string, unknown> | null,
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    design: {
      findUnique: async () => ({
        id: "design_1",
        customerId: null,
        sessionId: "sess_test",
        productId: "prod_1",
        status: "DRAFT",
        canvasData: { version: 1, stage: { width: 1080, height: 1080 }, layers: [] },
        previewUrl: null,
        productionUrl: null,
        productionUrls: [],
        metadata: {},
      }),
      update: async (args: { data: Record<string, unknown> }) => {
        state.updateData = args.data;
        return { id: "design_1", status: "READY", ...args.data };
      },
    },
    product: {
      findUnique: async () => ({ personalizationSchema: {} }),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/supabase/service", () => ({
  supabaseService: {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  },
}));

import { finalizeDesign } from "./service";

const BASE_OPTS = {
  designId: "design_1",
  previewBuffer: Buffer.from([1, 2, 3]),
  previewMime: "image/png",
  productionBuffers: [Buffer.from([4, 5, 6])],
  customerId: null,
  sessionId: "sess_test",
};

beforeEach(() => {
  state.updateData = null;
});

describe("finalizeDesign · sello de aceptación de calidad (Paquete C)", () => {
  it("con qualityAcknowledged=true escribe qualityAcknowledgedAt (timestamp) en el update", async () => {
    const before = Date.now();
    await finalizeDesign({ ...BASE_OPTS, qualityAcknowledged: true });
    expect(state.updateData).not.toBeNull();
    const ack = state.updateData!.qualityAcknowledgedAt;
    expect(ack).toBeInstanceOf(Date);
    expect((ack as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(state.updateData).toMatchObject({ status: "READY", productionUrl: null });
  });

  it("sin la aceptación, el update NO toca qualityAcknowledgedAt (queda null en DB)", async () => {
    await finalizeDesign({ ...BASE_OPTS });
    expect(state.updateData).not.toBeNull();
    expect(state.updateData).not.toHaveProperty("qualityAcknowledgedAt");
  });

  it("qualityAcknowledged=false explícito tampoco sella nada", async () => {
    await finalizeDesign({ ...BASE_OPTS, qualityAcknowledged: false });
    expect(state.updateData).not.toHaveProperty("qualityAcknowledgedAt");
  });
});
