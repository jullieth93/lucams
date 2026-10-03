/*
 * Unit tests — features/products/personalization-schema (módulo puro, sin DB).
 *
 * La config de personalización del admin (tab "Personalización", 2026-10-02)
 * se traduce acá al personalizationSchema JSON que esperan
 * resolvePersonalizationSurface y PhotoProductConfigSchema. Cobertura:
 *   - buildPersonalizationSchemaFromInput: shape producido por kind (foto
 *     completo, TEXT_ONLY nombre/frase/set fijo, evento, logo, letterset,
 *     NONE → undefined).
 *   - mergePersonalizationAdminInput: null = borrar key, keys no gestionadas
 *     preservadas, cambio de kind limpia las keys del panel anterior,
 *     photoSlots garantizado en kinds de foto.
 *   - readPersonalizationAdminConfig: lectura defensiva por-key (una key
 *     inválida no apaga las demás), fallback nameMaxLength, derivación del
 *     subtipo TEXT_ONLY.
 */

import { describe, expect, it } from "vitest";
import { resolvePersonalizationSurface } from "@/features/personalization/surface";
import {
  buildPersonalizationSchemaFromInput,
  mergePersonalizationAdminInput,
  readPersonalizationAdminConfig,
} from "./personalization-schema";

describe("buildPersonalizationSchemaFromInput (crear)", () => {
  it("kind NONE sin campos → undefined (columna queda null)", () => {
    expect(buildPersonalizationSchemaFromInput({ personalizationKind: "NONE" })).toBeUndefined();
    expect(buildPersonalizationSchemaFromInput({})).toBeUndefined();
  });

  it("foto completo: photoSlots + caras + aspect + galleryTag + overrides de lienzo", () => {
    const schema = buildPersonalizationSchemaFromInput({
      personalizationKind: "PHOTO_GRID",
      photoSlots: 6,
      facesPerUnit: 2,
      aspectRatio: "4:5",
      galleryTag: "separadores-magneticos",
      canvasBaseScale: 0.8,
      gridColsOverride: 3,
    });
    expect(schema).toEqual({
      photoSlots: 6,
      facesPerUnit: 2,
      aspectRatio: "4:5",
      galleryTag: "separadores-magneticos",
      canvasBaseScale: 0.8,
      gridColsOverride: 3,
    });
  });

  it("kind foto sin photoSlots explícito → garantiza photoSlots:1 (PhotoProductConfigSchema lo exige)", () => {
    const schema = buildPersonalizationSchemaFromInput({
      personalizationKind: "CUSTOM_DECOR",
      canvasBaseScale: 1.5,
    });
    expect(schema).toEqual({ canvasBaseScale: 1.5, photoSlots: 1 });
  });

  it("TEXT_ONLY nombre → variant name + límites de letras + idioma", () => {
    const schema = buildPersonalizationSchemaFromInput({
      personalizationKind: "TEXT_ONLY",
      textOnlyVariant: "name",
      letterCountMin: 3,
      letterCountMax: 10,
      language: "es",
    });
    expect(schema).toEqual({
      variant: "name",
      letterCountMin: 3,
      letterCountMax: 10,
      language: "es",
    });
  });

  it("TEXT_ONLY frase → variant phrase + maxChars + fontOptions", () => {
    const schema = buildPersonalizationSchemaFromInput({
      personalizationKind: "TEXT_ONLY",
      textOnlyVariant: "phrase",
      maxChars: 120,
      fontOptions: ["fredoka", "baloo"],
    });
    expect(schema).toEqual({
      variant: "phrase",
      maxChars: 120,
      fontOptions: ["fredoka", "baloo"],
    });
  });

  it("TEXT_ONLY set fijo (vocales) → variant vowels (compra directa)", () => {
    expect(
      buildPersonalizationSchemaFromInput({
        personalizationKind: "TEXT_ONLY",
        textOnlyVariant: "vowels",
      }),
    ).toEqual({ variant: "vowels" });
  });

  it("EVENT_FAVOR → eventFields + allowPhoto true; allowPhoto apagado no se escribe", () => {
    expect(
      buildPersonalizationSchemaFromInput({
        personalizationKind: "EVENT_FAVOR",
        eventFields: ["coupleNames", "date", "venue"],
        allowPhoto: true,
      }),
    ).toEqual({ eventFields: ["coupleNames", "date", "venue"], allowPhoto: true });
    expect(
      buildPersonalizationSchemaFromInput({
        personalizationKind: "EVENT_FAVOR",
        eventFields: ["babyName"],
        allowPhoto: null,
      }),
    ).toEqual({ eventFields: ["babyName"] });
  });

  it("BUSINESS_LOGO → logoFields se persiste como key `fields` + requiresVectorFile", () => {
    expect(
      buildPersonalizationSchemaFromInput({
        personalizationKind: "BUSINESS_LOGO",
        logoFields: ["logo", "phone", "email"],
        requiresVectorFile: true,
      }),
    ).toEqual({ fields: ["logo", "phone", "email"], requiresVectorFile: true });
  });

  it("set de letras: kind NONE + letterSet + language (el marcador manda sobre el kind)", () => {
    expect(
      buildPersonalizationSchemaFromInput({
        personalizationKind: "NONE",
        letterSet: "full",
        language: "es",
      }),
    ).toEqual({ letterSet: "full", language: "es" });
  });

  it("arrays vacíos y false equivalen a no declarar (no se escriben)", () => {
    expect(
      buildPersonalizationSchemaFromInput({
        personalizationKind: "EVENT_FAVOR",
        eventFields: [],
        allowPhoto: false,
      }),
    ).toBeUndefined();
  });
});

describe("mergePersonalizationAdminInput (editar)", () => {
  it("null = borrar la key; undefined = no tocar", () => {
    const merged = mergePersonalizationAdminInput(
      { photoSlots: 6, galleryTag: "imanes", canvasBaseScale: 0.8 },
      { photoSlots: 4, galleryTag: null }, // canvasBaseScale undefined → intacto
    );
    expect(merged).toEqual({ photoSlots: 4, canvasBaseScale: 0.8 });
  });

  it("preserva keys NO gestionadas por el form (shape, minQuantity, year…)", () => {
    const merged = mergePersonalizationAdminInput(
      { shape: "heart", minQuantity: 50, photoSlots: 9 },
      { photoSlots: 6, aspectRatio: "1:1" },
    );
    expect(merged).toEqual({ shape: "heart", minQuantity: 50, photoSlots: 6, aspectRatio: "1:1" });
  });

  it("cambio de kind foto → TEXT_ONLY limpia las keys de foto (llegan null del form)", () => {
    const merged = mergePersonalizationAdminInput(
      { photoSlots: 6, galleryTag: "imanes", canvasBaseScale: 1.2 },
      {
        personalizationKind: "TEXT_ONLY",
        textOnlyVariant: "name",
        letterCountMax: 12,
        photoSlots: null,
        facesPerUnit: null,
        aspectRatio: null,
        galleryTag: null,
        canvasBaseScale: null,
        gridColsOverride: null,
      },
    );
    expect(merged).toEqual({ variant: "name", letterCountMax: 12 });
  });

  it("cambio dentro de TEXT_ONLY: nombre → frase (variant se pisa, se escribe maxChars)", () => {
    const merged = mergePersonalizationAdminInput(
      { variant: "name", letterCountMin: 3, letterCountMax: 10 },
      {
        textOnlyVariant: "phrase",
        maxChars: 80,
        letterCountMin: null,
        letterCountMax: null,
        language: null,
      },
    );
    expect(merged).toEqual({ variant: "phrase", maxChars: 80 });
  });

  it("salir del set de letras borra el marcador letterSet", () => {
    const merged = mergePersonalizationAdminInput(
      { letterSet: "full", language: "es" },
      { personalizationKind: "PHOTO_PACK", photoSlots: 4, letterSet: null, language: null },
    );
    expect(merged).toEqual({ photoSlots: 4 });
  });

  it("logoFields null borra la key `fields`; requiresVectorFile false borra la key", () => {
    const merged = mergePersonalizationAdminInput(
      { fields: ["logo"], requiresVectorFile: true, minQuantity: 50 },
      { logoFields: null, requiresVectorFile: false },
    );
    expect(merged).toEqual({ minQuantity: 50 });
  });

  it("kind foto garantiza photoSlots aunque el caller lo borre (default seguro 1)", () => {
    const merged = mergePersonalizationAdminInput(
      { photoSlots: 12 },
      { personalizationKind: "CALENDAR_PHOTO_MONTH", photoSlots: null },
    );
    expect(merged).toEqual({ photoSlots: 1 });
  });
});

describe("readPersonalizationAdminConfig (precarga del form)", () => {
  it("round-trip: lo que build produce, read lo devuelve para el form", () => {
    const built = buildPersonalizationSchemaFromInput({
      personalizationKind: "PHOTO_PACK",
      photoSlots: 4,
      facesPerUnit: 2,
      aspectRatio: "1:1",
      galleryTag: "fotoimanes",
      canvasBaseScale: 0.75,
      gridColsOverride: 2,
    });
    expect(readPersonalizationAdminConfig(built)).toMatchObject({
      photoSlots: 4,
      facesPerUnit: 2,
      aspectRatio: "1:1",
      galleryTag: "fotoimanes",
      canvasBaseScale: 0.75,
      gridColsOverride: 2,
    });
  });

  it("schema null / no-objeto → defaults seguros (subtipo name, idioma es)", () => {
    const cfg = readPersonalizationAdminConfig(null);
    expect(cfg).toMatchObject({
      photoSlots: null,
      galleryTag: null,
      textOnlyVariant: "name",
      language: "es",
      allowPhoto: false,
      requiresVectorFile: false,
      letterSet: null,
    });
    expect(readPersonalizationAdminConfig("no-objeto")).toEqual(cfg);
  });

  it("lectura por-key tolerante: una key inválida no apaga las demás", () => {
    // Caso real 2026-09-25: finish:"glass" (fuera del enum) tumbaba el safeParse
    // completo y los campos se veían vacíos aunque el valor sí estaba guardado.
    const cfg = readPersonalizationAdminConfig({
      photoSlots: 6,
      finish: "glass",
      canvasBaseScale: 0.5,
      galleryTag: 42, // inválido (no string) → null, sin arrastrar al resto
    });
    expect(cfg.photoSlots).toBe(6);
    expect(cfg.canvasBaseScale).toBe(0.5);
    expect(cfg.galleryTag).toBeNull();
  });

  it("letterCountMax cae a nameMaxLength (key legada del seed del abecedario)", () => {
    expect(readPersonalizationAdminConfig({ nameMaxLength: 10 }).letterCountMax).toBe(10);
    expect(
      readPersonalizationAdminConfig({ nameMaxLength: 10, letterCountMax: 8 }).letterCountMax,
    ).toBe(8);
  });

  it("deriva el subtipo TEXT_ONLY como surface.ts: variant fijo / frase / nombre", () => {
    expect(readPersonalizationAdminConfig({ variant: "full" }).textOnlyVariant).toBe("full");
    expect(readPersonalizationAdminConfig({ variant: "vowels" }).textOnlyVariant).toBe("vowels");
    expect(readPersonalizationAdminConfig({ maxChars: 80 }).textOnlyVariant).toBe("phrase");
    expect(readPersonalizationAdminConfig({ fontOptions: ["fredoka"] }).textOnlyVariant).toBe(
      "phrase",
    );
    // variant "name" explícito gana sobre un maxChars residual.
    expect(readPersonalizationAdminConfig({ variant: "name", maxChars: 80 }).textOnlyVariant).toBe(
      "name",
    );
    expect(readPersonalizationAdminConfig({ letterCountMax: 10 }).textOnlyVariant).toBe("name");
  });

  it("letterSet full/vowels se lee; cualquier otro valor → null", () => {
    expect(readPersonalizationAdminConfig({ letterSet: "vowels" }).letterSet).toBe("vowels");
    expect(readPersonalizationAdminConfig({ letterSet: "consonantes" }).letterSet).toBeNull();
  });
});

/*
 * Loop completo form → schema → Estudio: lo que el builder produce para cada
 * kind debe rutar a la superficie correcta en resolvePersonalizationSurface
 * (es lo que hace que el producto sea funcional en el Estudio y, vía
 * listGalleryTagOptions, aparezca en /admin/disenos — el bug original era que
 * un producto creado desde el form quedaba NONE/null e invisible ahí).
 */
describe("el schema producido ruta a la superficie correcta (surface.ts)", () => {
  it("foto (PHOTO_GRID) → superficie photo con el config persistido", () => {
    const schema = buildPersonalizationSchemaFromInput({
      personalizationKind: "PHOTO_GRID",
      photoSlots: 6,
      facesPerUnit: 2,
      galleryTag: "separadores",
    })!;
    const s = resolvePersonalizationSurface("PHOTO_GRID", schema);
    expect(s.surface).toBe("photo");
    if (s.surface === "photo") {
      expect(s.config.photoSlots).toBe(6);
      expect(s.config.facesPerUnit).toBe(2);
    }
  });

  it("TEXT_ONLY nombre/frase/set fijo → name / phrase / direct-cart", () => {
    const name = buildPersonalizationSchemaFromInput({
      personalizationKind: "TEXT_ONLY",
      textOnlyVariant: "name",
      letterCountMin: 3,
      letterCountMax: 10,
    })!;
    const sName = resolvePersonalizationSurface("TEXT_ONLY", name);
    expect(sName).toMatchObject({ surface: "name", config: { min: 3, max: 10 } });

    const phrase = buildPersonalizationSchemaFromInput({
      personalizationKind: "TEXT_ONLY",
      textOnlyVariant: "phrase",
      maxChars: 120,
      fontOptions: ["fredoka"],
    })!;
    expect(resolvePersonalizationSurface("TEXT_ONLY", phrase)).toMatchObject({
      surface: "phrase",
      config: { maxChars: 120, fontOptions: ["fredoka"] },
    });

    const fixed = buildPersonalizationSchemaFromInput({
      personalizationKind: "TEXT_ONLY",
      textOnlyVariant: "full",
    })!;
    expect(resolvePersonalizationSurface("TEXT_ONLY", fixed)).toEqual({
      surface: "direct-cart",
      reason: "fixed-variant",
    });
  });

  it("EVENT_FAVOR / BUSINESS_LOGO → event / logo con sus campos", () => {
    const event = buildPersonalizationSchemaFromInput({
      personalizationKind: "EVENT_FAVOR",
      eventFields: ["coupleNames", "date"],
      allowPhoto: true,
    })!;
    expect(resolvePersonalizationSurface("EVENT_FAVOR", event)).toEqual({
      surface: "event",
      config: { fields: ["coupleNames", "date"], allowPhoto: true },
    });

    const logo = buildPersonalizationSchemaFromInput({
      personalizationKind: "BUSINESS_LOGO",
      logoFields: ["logo", "phone"],
      requiresVectorFile: true,
    })!;
    expect(resolvePersonalizationSurface("BUSINESS_LOGO", logo)).toEqual({
      surface: "logo",
      config: { fields: ["logo", "phone"], requiresVectorFile: true },
    });
  });

  it("set de letras: kind NONE + letterSet → superficie letterset (el marcador manda)", () => {
    const schema = buildPersonalizationSchemaFromInput({
      personalizationKind: "NONE",
      letterSet: "vowels",
      language: "en",
    })!;
    expect(resolvePersonalizationSurface("NONE", schema)).toEqual({
      surface: "letterset",
      config: { letterSet: "vowels", language: "en" },
    });
  });

  it("NONE sin campos → direct-cart not-personalizable", () => {
    expect(resolvePersonalizationSurface("NONE", null)).toEqual({
      surface: "direct-cart",
      reason: "not-personalizable",
    });
  });
});
