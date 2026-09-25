/*
 * ADR-057 Fase A — El SlotStateSchema debe PRESERVAR el encuadre del usuario
 * (photoTransform: pan/zoom) y el texto editado (textOverrides). Antes los descartaba
 * (Zod v4 strip) → el encuadre se perdía al guardar/recargar y el servidor no podía
 * reconstruir el render fiel. Este test es el gate de regresión de ese bug.
 */

import { describe, expect, it } from "vitest";
import {
  SlotStateSchema,
  CanvasDataV1Schema,
  CanvasDataV2Schema,
  SaveCanvasSchema,
  FinalizeDesignSchema,
  UploadAssetMetadataSchema,
  PhotoProductConfigSchema,
  parsePhotoProductConfig,
  parseStudioCanvasOverrides,
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

  it("2026-09-24 — conserva originalWidth/originalHeight (dims de la foto ORIGINAL pre-upscale)", () => {
    const parsed = SlotStateSchema.parse({
      slotIndex: 0,
      assetId: "a",
      assetUrl: "u",
      originalWidth: 3024,
      originalHeight: 4032,
    });
    expect(parsed.originalWidth).toBe(3024);
    expect(parsed.originalHeight).toBe(4032);
  });

  it("2026-09-24 — originalWidth/originalHeight opcionales y con rangos sanos (anti-tamper)", () => {
    const parsed = SlotStateSchema.parse({ slotIndex: 0, assetId: "a", assetUrl: "u" });
    expect(parsed.originalWidth).toBeUndefined();
    expect(parsed.originalHeight).toBeUndefined();
    for (const bad of [0, -10, 1.5, 99999, "3024"]) {
      expect(
        SlotStateSchema.safeParse({
          slotIndex: 0,
          assetId: "a",
          assetUrl: "u",
          originalWidth: bad,
        }).success,
      ).toBe(false);
    }
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

  it("acepta las 8 claves curadas del selector (owner 2026-09-14)", () => {
    for (const font of [
      "fredoka",
      "inter",
      "caveat",
      "baloo2",
      "nunito",
      "patrick",
      "playfair",
      "dancing",
    ] as const) {
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
    expect(calendarFontOrDefault("baloo2")).toBe("baloo2");
    expect(calendarFontOrDefault("playfair")).toBe("playfair");
    expect(calendarFontOrDefault("Papyrus")).toBe("fredoka");
    expect(calendarFontOrDefault({ family: "Fredoka" })).toBe("fredoka");
  });
});

describe("CanvasDataV2Schema — magnet (Lucy 2026-09-08, «¿Con imán?» en los packs de foto)", () => {
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

  it("acepta true y false y los conserva en el parse (sobrevive el auto-save)", () => {
    expect(CanvasDataV2Schema.parse({ ...base, magnet: true }).magnet).toBe(true);
    expect(CanvasDataV2Schema.parse({ ...base, magnet: false }).magnet).toBe(false);
  });

  it("retrocompatible: canvasData sin la clave sigue siendo válido (ausente = legacy)", () => {
    expect(CanvasDataV2Schema.parse(base).magnet).toBeUndefined();
  });

  it("rechaza valores no booleanos (Zod nunca los persiste)", () => {
    expect(CanvasDataV2Schema.safeParse({ ...base, magnet: "si" }).success).toBe(false);
    expect(CanvasDataV2Schema.safeParse({ ...base, magnet: 1 }).success).toBe(false);
  });
});

describe("CanvasDataV2Schema — multi-unidad (owner 2026-09-09: unitCount/unitSlots)", () => {
  const base = {
    version: 2 as const,
    unitTemplate: {
      version: 1 as const,
      stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    },
    slotCount: 6,
    slots: Array.from({ length: 6 }, (_, i) => ({ slotIndex: i, assetId: null, assetUrl: null })),
    gridLayout: { cols: 1, rows: 3, gap: 0 },
  };

  it("acepta el modelo multi-unidad y lo conserva en el parse (sobrevive el auto-save)", () => {
    const parsed = CanvasDataV2Schema.parse({ ...base, unitCount: 2, unitSlots: 3 });
    expect(parsed.unitCount).toBe(2);
    expect(parsed.unitSlots).toBe(3);
  });

  it("retrocompatible: diseños sin las claves siguen siendo válidos (ausente = 1 unidad)", () => {
    const parsed = CanvasDataV2Schema.parse(base);
    expect(parsed.unitCount).toBeUndefined();
    expect(parsed.unitSlots).toBeUndefined();
  });

  it("rechaza unidades fuera de rango (0, >50, no enteras)", () => {
    expect(CanvasDataV2Schema.safeParse({ ...base, unitCount: 0 }).success).toBe(false);
    expect(CanvasDataV2Schema.safeParse({ ...base, unitCount: 51 }).success).toBe(false);
    expect(CanvasDataV2Schema.safeParse({ ...base, unitSlots: 0 }).success).toBe(false);
    expect(CanvasDataV2Schema.safeParse({ ...base, unitSlots: 1.5 }).success).toBe(false);
  });

  it("sin catchall: claves desconocidas se stripean pero unitCount/unitSlots sobreviven", () => {
    const parsed = CanvasDataV2Schema.parse({
      ...base,
      unitCount: 2,
      unitSlots: 3,
      claveAjena: "fuera",
    } as Record<string, unknown>);
    expect(parsed.unitCount).toBe(2);
    expect((parsed as Record<string, unknown>).claveAjena).toBeUndefined();
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

describe("CanvasLayerSchema — validación defensiva del src de AssetLayer (M.3.b.A2)", () => {
  it("rechaza src que no sea path local /templates/<slug> (URL externa = XSS via SVG)", () => {
    const layer = { id: "a", type: "asset", src: "https://evil.example/x.svg" };
    const parsed = CanvasDataV1Schema.safeParse({
      version: 1,
      stage: { width: 450, height: 600 },
      layers: [layer],
    });
    expect(parsed.success).toBe(false);
  });

  it("rechaza asset layer sin src", () => {
    const parsed = CanvasDataV1Schema.safeParse({
      version: 1,
      stage: { width: 450, height: 600 },
      layers: [{ id: "a", type: "asset" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("acepta paths locales con guion bajo (ig_post_3x4.svg) y otras extensiones válidas", () => {
    for (const src of [
      "/templates/ig_post_3x4.svg",
      "/templates/polaroid-clasico.png",
      "/templates/foto.jpg",
      "/templates/mia.webp",
    ]) {
      const parsed = CanvasDataV1Schema.safeParse({
        version: 1,
        stage: { width: 450, height: 600 },
        layers: [{ id: "a", type: "asset", src }],
      });
      expect(parsed.success, src).toBe(true);
    }
  });

  it("rechaza path con .. (directory traversal) y subcarpetas", () => {
    for (const src of ["/templates/../secret.svg", "/templates/sub/x.svg", "templates/x.svg"]) {
      const parsed = CanvasDataV1Schema.safeParse({
        version: 1,
        stage: { width: 450, height: 600 },
        layers: [{ id: "a", type: "asset", src }],
      });
      expect(parsed.success, src).toBe(false);
    }
  });

  it("capas no-asset no exigen src (superRefine solo mira type === 'asset')", () => {
    const parsed = CanvasDataV1Schema.safeParse({
      version: 1,
      stage: { width: 450, height: 600 },
      layers: [{ id: "bg", type: "background", color: "#FFF" }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("SaveCanvasSchema — cap defensivo de tamaño del canvasData", () => {
  it("rechaza un canvasData > 1 MB (posible payload corrupto con dataURL base64)", () => {
    const bigLayer = { id: "x", type: "text", text: "a".repeat(1_100_000) };
    const result = SaveCanvasSchema.safeParse({
      designId: "d1",
      canvasData: {
        version: 1,
        stage: { width: 450, height: 600 },
        layers: [bigLayer],
      },
    });
    expect(result.success).toBe(false);
  });

  it("canvasData típico (< 1 MB) pasa", () => {
    const result = SaveCanvasSchema.safeParse({
      designId: "d1",
      canvasData: {
        version: 1,
        stage: { width: 450, height: 600 },
        layers: [{ id: "bg", type: "background", color: "#FFF" }],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("FinalizeDesignSchema — cap del tamaño TOTAL de producción", () => {
  const png = (kb: number) => `data:image/png;base64,${"A".repeat(kb * 1024)}`;

  it("rechaza cuando la suma de slots supera 120 MB", () => {
    // 7 × 18 MB = 126 MB > 120 MB (cada url < 20 MB individual → pasa el cap por elemento).
    const result = FinalizeDesignSchema.safeParse({
      designId: "d1",
      previewDataUrl: png(100),
      productionDataUrls: Array.from({ length: 7 }, () => png(18 * 1024)),
    });
    expect(result.success).toBe(false);
  });

  it("suma bajo el cap pasa", () => {
    const result = FinalizeDesignSchema.safeParse({
      designId: "d1",
      previewDataUrl: png(100),
      productionDataUrls: [png(1024), png(1024)],
    });
    expect(result.success).toBe(true);
  });
});

/*
 * parseStudioCanvasOverrides (2026-09-25 — fix admin, owner STG): lectura
 * DEFENSIVA por-key de canvasBaseScale/gridColsOverride para el form de
 * producto. Bug que blinda: leerlos con PhotoProductConfigSchema.partial()
 * .safeParse() fallaba ENTERO si cualquier OTRA key del JSON era inválida
 * (caso real del seed: finish:"glass" fuera del enum) → el form mostraba los
 * campos vacíos aunque el valor sí estaba guardado en BD.
 */
describe("parseStudioCanvasOverrides — lectura defensiva por-key (fix admin 2026-09-25)", () => {
  it("lee ambos overrides guardados", () => {
    expect(
      parseStudioCanvasOverrides({ photoSlots: 6, canvasBaseScale: 0.5, gridColsOverride: 3 }),
    ).toEqual({ canvasBaseScale: 0.5, gridColsOverride: 3 });
  });

  it("sin overrides → null/null (defaults del Estudio); tolera null y no-objetos", () => {
    expect(parseStudioCanvasOverrides({ photoSlots: 6 })).toEqual({
      canvasBaseScale: null,
      gridColsOverride: null,
    });
    expect(parseStudioCanvasOverrides(null)).toEqual({
      canvasBaseScale: null,
      gridColsOverride: null,
    });
    expect(parseStudioCanvasOverrides("no-objeto")).toEqual({
      canvasBaseScale: null,
      gridColsOverride: null,
    });
  });

  it("REGRESIÓN: otra key inválida (finish:'glass' del seed) NO oculta los overrides guardados", () => {
    // Con el safeParse del schema completo esto fallaba entero → campos vacíos.
    const schemaConGlass = {
      photoSlots: 6,
      shape: "circle",
      finish: "glass", // fuera del enum ["matte","glossy","soft-touch"]
      sizeCm: "3",
      canvasBaseScale: 0.75,
      gridColsOverride: 2,
    };
    // El parse completo sigue fallando (contrato del schema)…
    expect(PhotoProductConfigSchema.safeParse(schemaConGlass).success).toBe(false);
    // …pero la lectura por-key recupera los valores.
    expect(parseStudioCanvasOverrides(schemaConGlass)).toEqual({
      canvasBaseScale: 0.75,
      gridColsOverride: 2,
    });
  });

  it("un override inválido → null para ESA key, sin arrastrar la otra", () => {
    expect(parseStudioCanvasOverrides({ canvasBaseScale: 99, gridColsOverride: 4 })).toEqual({
      canvasBaseScale: null, // fuera de [0.5, 2.5]
      gridColsOverride: 4,
    });
    expect(parseStudioCanvasOverrides({ canvasBaseScale: 1.5, gridColsOverride: 0 })).toEqual({
      canvasBaseScale: 1.5,
      gridColsOverride: null, // fuera de [1, 6]
    });
  });
});
