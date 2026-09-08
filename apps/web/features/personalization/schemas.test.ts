/*
 * ADR-057 Fase A — El SlotStateSchema debe PRESERVAR el encuadre del usuario
 * (photoTransform: pan/zoom) y el texto editado (textOverrides). Antes los descartaba
 * (Zod v4 strip) → el encuadre se perdía al guardar/recargar y el servidor no podía
 * reconstruir el render fiel. Este test es el gate de regresión de ese bug.
 */

import { describe, expect, it } from "vitest";
import {
  SlotStateSchema,
  CanvasDataV2Schema,
  UploadAssetMetadataSchema,
  PhotoProductConfigSchema,
  parsePhotoProductConfig,
  calendarFontOrDefault,
} from "./schemas";

describe("SlotStateSchema — encuadre + texto del usuario sobreviven (ADR-057 Fase A)", () => {
  it("conserva photoTransform (offsetX/offsetY/scale) — antes se descartaba", () => {
    const parsed = SlotStateSchema.parse({
      slotIndex: 0,
      assetId: "asset_1",
      assetUrl: "https://x/y.png",
      photoTransform: { offsetX: -42.5, offsetY: 18, scale: 1.35 },
    });
    expect(parsed.photoTransform).toEqual({ offsetX: -42.5, offsetY: 18, scale: 1.35 });
  });

  it("conserva textOverrides indexados por layerId", () => {
    const parsed = SlotStateSchema.parse({
      slotIndex: 2,
      assetId: null,
      assetUrl: null,
      textOverrides: {
        caption: { text: "Mi recuerdo", fill: "#E85B9F", fontSize: 48 },
        date: { text: "Dic 2026" },
      },
    });
    expect(parsed.textOverrides?.caption).toEqual({
      text: "Mi recuerdo",
      fill: "#E85B9F",
      fontSize: 48,
    });
    expect(parsed.textOverrides?.date?.text).toBe("Dic 2026");
  });

  it("rechaza scale fuera de rango (anti-tamper del render)", () => {
    expect(
      SlotStateSchema.safeParse({
        slotIndex: 0,
        assetId: null,
        assetUrl: null,
        photoTransform: { offsetX: 0, offsetY: 0, scale: 999 },
      }).success,
    ).toBe(false);
  });

  it("rechaza offset absurdo (anti-tamper)", () => {
    expect(
      SlotStateSchema.safeParse({
        slotIndex: 0,
        assetId: null,
        assetUrl: null,
        photoTransform: { offsetX: 999999, offsetY: 0, scale: 1 },
      }).success,
    ).toBe(false);
  });

  it("photoTransform es opcional (slot sin encuadre manual sigue siendo válido)", () => {
    const parsed = SlotStateSchema.parse({ slotIndex: 0, assetId: "a", assetUrl: "u" });
    expect(parsed.photoTransform).toBeUndefined();
  });

  it("Ola 17 — conserva la foto de perfil (profileAssetId/profileAssetUrl) por slot", () => {
    const parsed = SlotStateSchema.parse({
      slotIndex: 0,
      assetId: "a",
      assetUrl: "u",
      profileAssetId: "pa-1",
      profileAssetUrl: "https://x/avatar.png",
    });
    expect(parsed.profileAssetId).toBe("pa-1");
    expect(parsed.profileAssetUrl).toBe("https://x/avatar.png");
  });

  it("Ola 17 — profileAssetId admite null y ambos campos son opcionales (retrocompatible)", () => {
    expect(
      SlotStateSchema.parse({ slotIndex: 0, assetId: "a", assetUrl: "u", profileAssetId: null })
        .profileAssetId,
    ).toBeNull();
    const parsed = SlotStateSchema.parse({ slotIndex: 0, assetId: "a", assetUrl: "u" });
    expect(parsed.profileAssetId).toBeUndefined();
    expect(parsed.profileAssetUrl).toBeUndefined();
  });

  it("Ola 17 — rechaza profileAssetUrl absurdamente larga (anti-tamper)", () => {
    expect(
      SlotStateSchema.safeParse({
        slotIndex: 0,
        assetId: "a",
        assetUrl: "u",
        profileAssetId: "pa-1",
        profileAssetUrl: `https://x/${"a".repeat(2100)}`,
      }).success,
    ).toBe(false);
  });

  it("un canvasData V2 completo round-trips el encuadre de cada slot", () => {
    const canvas = {
      version: 2 as const,
      unitTemplate: {
        version: 1 as const,
        stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
        layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
      },
      slotCount: 2,
      slots: [
        {
          slotIndex: 0,
          assetId: "a0",
          assetUrl: "u0",
          photoTransform: { offsetX: 10, offsetY: -5, scale: 1.2 },
        },
        { slotIndex: 1, assetId: "a1", assetUrl: "u1", filter: "vivid" as const },
      ],
      gridLayout: { cols: 2, rows: 1, gap: 8 },
    };
    const parsed = CanvasDataV2Schema.parse(canvas);
    expect(parsed.slots[0].photoTransform).toEqual({ offsetX: 10, offsetY: -5, scale: 1.2 });
    expect(parsed.slots[1].filter).toBe("vivid");
  });
});

describe("CanvasDataV2Schema — calendarFont (Lucy 2026-09-07, selector de tipo de letra)", () => {
  const base = {
    version: 2 as const,
    unitTemplate: {
      version: 1 as const,
      stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    },
    slotCount: 1,
    slots: [{ slotIndex: 0, assetId: null, assetUrl: null }],
    gridLayout: { cols: 1, rows: 1, gap: 8 },
  };

  it("acepta las 3 claves curadas del selector", () => {
    for (const font of ["fredoka", "inter", "caveat"] as const) {
      const parsed = CanvasDataV2Schema.parse({ ...base, calendarFont: font });
      expect(parsed.calendarFont).toBe(font);
    }
  });

  it("rechaza una fuente fuera de la lista blanca (Zod nunca la persiste)", () => {
    expect(CanvasDataV2Schema.safeParse({ ...base, calendarFont: "Comic Sans MS" }).success).toBe(
      false,
    );
    expect(CanvasDataV2Schema.safeParse({ ...base, calendarFont: "system-ui" }).success).toBe(
      false,
    );
  });

  it("retrocompatible: canvasData sin la clave sigue siendo válido (= fredoka implícito)", () => {
    const parsed = CanvasDataV2Schema.parse(base);
    expect(parsed.calendarFont).toBeUndefined();
    expect(calendarFontOrDefault(parsed.calendarFont)).toBe("fredoka");
  });

  it("calendarFontOrDefault: ausente/inválido → fredoka, nunca un string libre", () => {
    expect(calendarFontOrDefault(undefined)).toBe("fredoka");
    expect(calendarFontOrDefault(null)).toBe("fredoka");
    expect(calendarFontOrDefault("caveat")).toBe("caveat");
    expect(calendarFontOrDefault("inter")).toBe("inter");
    expect(calendarFontOrDefault("Papyrus")).toBe("fredoka");
    expect(calendarFontOrDefault({ family: "Fredoka" })).toBe("fredoka");
  });
});

describe("UploadAssetMetadataSchema — consentimiento de derechos de imagen (Ley 1581 · plan de producción)", () => {
  const base = { mimeType: "image/jpeg" as const, sizeBytes: 1000 };

  it("acepta la subida cuando rightsAccepted === true", () => {
    const r = UploadAssetMetadataSchema.safeParse({ ...base, rightsAccepted: true });
    expect(r.success).toBe(true);
  });

  it("rechaza rightsAccepted === false con mensaje sobre el derecho", () => {
    const r = UploadAssetMetadataSchema.safeParse({ ...base, rightsAccepted: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain("derecho");
  });

  it("rechaza la subida sin declaración (rightsAccepted ausente = no se sube)", () => {
    const r = UploadAssetMetadataSchema.safeParse(base);
    expect(r.success).toBe(false);
  });
});

describe("PhotoProductConfigSchema — flags Ola 3 (allowText / facesPerUnit)", () => {
  it("acepta allowText (texto del producto) y facesPerUnit (caras por unidad)", () => {
    const parsed = PhotoProductConfigSchema.parse({
      photoSlots: 3,
      allowText: true,
      facesPerUnit: 2,
    });
    expect(parsed.allowText).toBe(true);
    expect(parsed.facesPerUnit).toBe(2);
  });

  it("son opcionales: un schema de foto normal sigue parseando sin ellos", () => {
    const parsed = PhotoProductConfigSchema.parse({ photoSlots: 6 });
    expect(parsed.allowText).toBeUndefined();
    expect(parsed.facesPerUnit).toBeUndefined();
  });

  it("facesPerUnit solo admite 1 o 2 (3+ indicaría config corrupta)", () => {
    expect(PhotoProductConfigSchema.safeParse({ photoSlots: 1, facesPerUnit: 3 }).success).toBe(
      false,
    );
    expect(PhotoProductConfigSchema.safeParse({ photoSlots: 1, facesPerUnit: 0 }).success).toBe(
      false,
    );
  });

  it("parsePhotoProductConfig degrada con seguridad cuando el schema no matchea", () => {
    expect(parsePhotoProductConfig(null)).toEqual({ photoSlots: 1 });
    expect(parsePhotoProductConfig({ photoSlots: 99 })).toEqual({ photoSlots: 1 }); // >50 inválido
    expect(parsePhotoProductConfig({ photoSlots: 2, facesPerUnit: 2 }).facesPerUnit).toBe(2);
  });

  it("noFold (Ola 17 — marcapáginas plano Alargados): opcional, booleano", () => {
    const parsed = PhotoProductConfigSchema.parse({ photoSlots: 1, facesPerUnit: 2, noFold: true });
    expect(parsed.noFold).toBe(true);
    expect(PhotoProductConfigSchema.parse({ photoSlots: 1 }).noFold).toBeUndefined();
    expect(PhotoProductConfigSchema.safeParse({ photoSlots: 1, noFold: "si" }).success).toBe(false);
  });
});
