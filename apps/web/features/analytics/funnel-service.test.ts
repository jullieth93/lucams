/*
 * Unit — esquema cerrado de privacidad `FunnelPayloadSchema`, detección gruesa de
 * dispositivo, resolución de superficie y endpoint `POST /api/funnel` ([ANA-01]).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRateLimit, mockRecordFunnelEvents } = vi.hoisted(() => ({
  mockRateLimit: vi.fn(),
  mockRecordFunnelEvents: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: mockRateLimit }));
vi.mock("@/features/analytics/funnel-service", () => ({
  recordFunnelEvents: mockRecordFunnelEvents,
}));

import {
  bogotaDayUtcDate,
  detectFunnelDeviceCategory,
  FunnelPayloadSchema,
  resolveFunnelEditorKind,
} from "./funnel-schema";
import { POST as postFunnelRoute } from "@/app/api/funnel/route";

describe("FunnelPayloadSchema — lista cerrada anti-PII (Ley 1581)", () => {
  it("acepta evento simple válido y lote de hasta 8 eventos", () => {
    const single = FunnelPayloadSchema.safeParse({
      eventName: "studio_asset_upload_failed",
      productSlug: "fotoimanes-polaroid",
      editorKind: "photo",
      deviceCategory: "mobile",
      errorCode: "low_quality",
    });
    expect(single.success).toBe(true);

    const batch = FunnelPayloadSchema.safeParse({
      events: [
        { eventName: "purchase_completed", productSlug: "_all", editorKind: "all" },
        {
          eventName: "purchase_completed",
          productSlug: "fotoimanes-polaroid",
          editorKind: "photo",
        },
      ],
    });
    expect(batch.success).toBe(true);
  });

  it("rechaza emails, teléfonos, mayúsculas, rutas con tokens, eventos desconocidos y lotes > 8", () => {
    for (const badSlug of [
      "cliente@correo.com",
      "3001234567-",
      "Fotoimanes-Polaroid",
      "/pedido/tok123",
      "slug con espacios",
      "",
    ]) {
      const res = FunnelPayloadSchema.safeParse({
        eventName: "product_view",
        productSlug: badSlug,
      });
      expect(res.success).toBe(false);
    }

    expect(
      FunnelPayloadSchema.safeParse({
        eventName: "evento_inventado",
        productSlug: "fotoimanes-polaroid",
      }).success,
    ).toBe(false);

    expect(
      FunnelPayloadSchema.safeParse({
        eventName: "studio_finalize_failed",
        productSlug: "fotoimanes-polaroid",
        errorCode: "stack trace con email ana@x.co",
      }).success,
    ).toBe(false);

    expect(
      FunnelPayloadSchema.safeParse({
        events: Array.from({ length: 9 }, () => ({
          eventName: "product_view",
          productSlug: "fotoimanes-polaroid",
        })),
      }).success,
    ).toBe(false);
  });
});

describe("detectFunnelDeviceCategory / bogotaDayUtcDate / resolveFunnelEditorKind", () => {
  it("prioriza ancho de viewport y cae a patrones gruesos de User-Agent sin guardar UA", () => {
    expect(detectFunnelDeviceCategory({ viewportWidth: 390 })).toBe("mobile");
    expect(detectFunnelDeviceCategory({ viewportWidth: 820 })).toBe("tablet");
    expect(detectFunnelDeviceCategory({ viewportWidth: 1440 })).toBe("desktop");

    expect(
      detectFunnelDeviceCategory({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      }),
    ).toBe("mobile");
    expect(
      detectFunnelDeviceCategory({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
      }),
    ).toBe("tablet");
    expect(detectFunnelDeviceCategory({ userAgent: "" })).toBe("unknown");
  });

  it("bogotaDayUtcDate convierte medianoche UTC-5 correctamente al día calendario de Bogotá", () => {
    // 2026-11-04T02:30:00Z = 2026-11-03 21:30 en Bogotá
    expect(bogotaDayUtcDate(new Date("2026-11-04T02:30:00.000Z")).toISOString()).toBe(
      "2026-11-03T00:00:00.000Z",
    );
    // 2026-11-04T06:00:00Z = 2026-11-04 01:00 en Bogotá
    expect(bogotaDayUtcDate(new Date("2026-11-04T06:00:00.000Z")).toISOString()).toBe(
      "2026-11-04T00:00:00.000Z",
    );
  });

  it("resolveFunnelEditorKind respeta designMetadata.surface y productos de catálogo", () => {
    expect(
      resolveFunnelEditorKind({
        isPersonalizable: false,
        personalizationKind: "NONE",
      }),
    ).toBe("catalog");

    expect(
      resolveFunnelEditorKind({
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
        designMetadata: { surface: "letterset" },
      }),
    ).toBe("letterset");

    expect(
      resolveFunnelEditorKind({
        isPersonalizable: true,
        personalizationKind: "PHOTO_PACK",
      }),
    ).toBe("photo");
  });
});

describe("POST /api/funnel — validación, límites y rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ allowed: true });
    mockRecordFunnelEvents.mockResolvedValue(1);
  });

  it("responde 429 cuando el rate-limit por IP bloquea", async () => {
    mockRateLimit.mockResolvedValueOnce({ allowed: false });
    const req = new Request("http://localhost:4000/api/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventName: "product_view", productSlug: "tiras-magneticas" }),
    });
    const res = await postFunnelRoute(req);
    expect(res.status).toBe(429);
    expect(mockRecordFunnelEvents).not.toHaveBeenCalled();
  });

  it("responde 413 si el payload supera 4 KB", async () => {
    const huge = "a".repeat(5000);
    const req = new Request("http://localhost:4000/api/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventName: "product_view", productSlug: huge }),
    });
    const res = await postFunnelRoute(req);
    expect(res.status).toBe(413);
    expect(mockRecordFunnelEvents).not.toHaveBeenCalled();
  });

  it("responde 400 ante payload inválido y 200 ante evento válido resolviendo categoría de equipo", async () => {
    const badReq = new Request("http://localhost:4000/api/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventName: "product_view", productSlug: "correo@invalido.com" }),
    });
    expect((await postFunnelRoute(badReq)).status).toBe(400);

    const okReq = new Request("http://localhost:4000/api/funnel", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      },
      body: JSON.stringify({
        eventName: "studio_open",
        productSlug: "tiras-magneticas",
        editorKind: "photo",
      }),
    });
    const okRes = await postFunnelRoute(okReq);
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ ok: true });
    expect(mockRecordFunnelEvents).toHaveBeenCalledWith([
      {
        eventName: "studio_open",
        productSlug: "tiras-magneticas",
        editorKind: "photo",
        deviceCategory: "mobile",
        errorCode: "",
      },
    ]);
  });
});
