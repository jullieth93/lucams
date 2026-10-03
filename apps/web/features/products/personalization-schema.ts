/*
 * Config de personalización administrable desde el form de producto (2026-10-02).
 *
 * Hasta hoy `Product.personalizationKind` / `personalizationSchema` solo los
 * escribían los scripts de seed (packages/db/scripts/) — un producto creado
 * desde /admin/productos/nuevo quedaba NONE/null y NUNCA aparecía en el módulo
 * "Diseños prediseñados" (/admin/disenos) ni abría el Estudio. Este módulo
 * concentra la lógica PURA (sin Prisma, sin next/*) que traduce los campos del
 * form al personalizationSchema JSON que esperan resolvePersonalizationSurface
 * (features/personalization/surface.ts) y PhotoProductConfigSchema
 * (features/personalization/schemas.ts):
 *
 *   - buildPersonalizationSchemaFromInput: schema a persistir al CREAR.
 *   - mergePersonalizationAdminInput:     merge al EDITAR (null = borrar key,
 *     mismo patrón que physicalSpecs; las keys que el form NO gestiona —
 *     shape, minQuantity, frameOptions, year, monthLabels… — se preservan).
 *   - readPersonalizationAdminConfig:     lectura defensiva por-key para
 *     precargar el form en edición (mismo criterio que
 *     parseStudioCanvasOverrides: una key inválida no debe apagar las demás).
 */

/** Kinds persistidos en el enum Prisma PersonalizationKind (schema.prisma).
 *  Array local (no import runtime de @prisma/client) para que este módulo
 *  siga siendo puro e importable desde client components. */
export const PERSONALIZATION_KINDS = [
  "NONE",
  "PHOTO_PACK",
  "PHOTO_GRID",
  "CALENDAR_PHOTO_MONTH",
  "CALENDAR_PHOTO_HERO",
  "CUSTOM_DECOR",
  "TEXT_ONLY",
  "EVENT_FAVOR",
  "BUSINESS_LOGO",
] as const;

export type ProductPersonalizationKind = (typeof PERSONALIZATION_KINDS)[number];

/** Kinds cuya superficie del Estudio es el editor de FOTO (surface.ts PHOTO_KINDS). */
export const PHOTO_SURFACE_KINDS: ReadonlySet<ProductPersonalizationKind> = new Set([
  "PHOTO_PACK",
  "PHOTO_GRID",
  "CALENDAR_PHOTO_MONTH",
  "CALENDAR_PHOTO_HERO",
  "CUSTOM_DECOR",
]);

/** Subtipos de TEXT_ONLY que el form deja elegir (surface.ts los deriva del
 *  schema: variant "full"/"vowels" → compra directa; maxChars/fontOptions →
 *  frase; si no → nombre con fichas). */
export const TEXT_ONLY_VARIANTS = ["name", "phrase", "full", "vowels"] as const;
export type TextOnlyVariant = (typeof TEXT_ONLY_VARIANTS)[number];

/**
 * Keys del personalizationSchema que el form gestiona. En el merge de UPDATE,
 * cualquiera de estas que llegue en null se BORRA del JSON (ej. cambiar de
 * PHOTO_PACK a TEXT_ONLY limpia photoSlots/galleryTag del schema viejo).
 */
export const ADMIN_MANAGED_PERSONALIZATION_KEYS = [
  "photoSlots",
  "facesPerUnit",
  "aspectRatio",
  "galleryTag",
  "canvasBaseScale",
  "gridColsOverride",
  "variant",
  "letterCountMin",
  "letterCountMax",
  "maxChars",
  "fontOptions",
  "language",
  "eventFields",
  "allowPhoto",
  "fields",
  "requiresVectorFile",
  "letterSet",
] as const;

/** Campos de personalización tal como llegan del form (ya validados por Zod).
 *  Convención: undefined = no vino en el submit (no tocar); null = el admin lo
 *  vació / el panel no aplica al kind elegido (borrar la key en el merge). */
export type PersonalizationFieldsInput = {
  personalizationKind?: ProductPersonalizationKind | null;
  // Superficie foto (PHOTO_PACK, PHOTO_GRID, CALENDAR_*, CUSTOM_DECOR)
  photoSlots?: number | null;
  facesPerUnit?: number | null;
  aspectRatio?: string | null;
  /** Tag de la galería de diseños prediseñados. null = no declarar (el
   *  Estudio y /admin/disenos caen al slug del producto — design-gallery.ts). */
  galleryTag?: string | null;
  canvasBaseScale?: number | null;
  gridColsOverride?: number | null;
  // TEXT_ONLY — subtipo elegido en el form
  textOnlyVariant?: TextOnlyVariant | null;
  letterCountMin?: number | null;
  letterCountMax?: number | null;
  language?: "es" | "en" | null;
  maxChars?: number | null;
  fontOptions?: string[] | null;
  // EVENT_FAVOR
  eventFields?: string[] | null;
  allowPhoto?: boolean | null;
  // BUSINESS_LOGO (schema key = "fields", surface.ts LogoSurfaceConfig)
  logoFields?: string[] | null;
  requiresVectorFile?: boolean | null;
  // Set de letras (abecedario/vocales): kind NONE + letterSet en el schema —
  // el marcador tiene prioridad sobre el kind (surface.ts:98).
  letterSet?: "full" | "vowels" | null;
};

function setOrDelete(out: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) return;
  // false y [] equivalen a "no declarar": los defaults del router
  // (allowPhoto=false, fontOptions=[]) ya cubren ese caso.
  if (value === null || value === false || (Array.isArray(value) && value.length === 0)) {
    delete out[key];
  } else {
    out[key] = value;
  }
}

/**
 * Aplica los campos del form sobre un personalizationSchema existente.
 * `current` son las keys ya guardadas ({} al crear). Devuelve un objeto nuevo;
 * las keys NO gestionadas por el form sobreviven intactas.
 */
export function mergePersonalizationAdminInput(
  current: Record<string, unknown>,
  input: PersonalizationFieldsInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };

  // Foto
  setOrDelete(out, "photoSlots", input.photoSlots);
  setOrDelete(out, "facesPerUnit", input.facesPerUnit);
  setOrDelete(out, "aspectRatio", input.aspectRatio);
  setOrDelete(out, "galleryTag", input.galleryTag);
  setOrDelete(out, "canvasBaseScale", input.canvasBaseScale);
  setOrDelete(out, "gridColsOverride", input.gridColsOverride);

  // TEXT_ONLY — el subtipo del form se persiste como `variant` (la key que
  // surface.ts lee). "name" se escribe explícito para que cambiar de
  // full/vowels → nombre no deje el variant fijo viejo activo.
  setOrDelete(out, "variant", input.textOnlyVariant);
  setOrDelete(out, "letterCountMin", input.letterCountMin);
  setOrDelete(out, "letterCountMax", input.letterCountMax);
  setOrDelete(out, "language", input.language);
  setOrDelete(out, "maxChars", input.maxChars);
  setOrDelete(out, "fontOptions", input.fontOptions);

  // EVENT_FAVOR
  setOrDelete(out, "eventFields", input.eventFields);
  setOrDelete(out, "allowPhoto", input.allowPhoto);

  // BUSINESS_LOGO — el input se llama logoFields pero la key del schema es
  // "fields" (contrato de surface.ts LogoSurfaceConfig).
  setOrDelete(out, "fields", input.logoFields);
  setOrDelete(out, "requiresVectorFile", input.requiresVectorFile);

  // Set de letras
  setOrDelete(out, "letterSet", input.letterSet);

  // PhotoProductConfigSchema exige photoSlots (parsePhotoProductConfig cae a
  // {photoSlots:1} entero si falta, ignorando el resto del config). Para los
  // kinds de foto garantizamos la key aunque el caller no la haya mandado.
  if (
    input.personalizationKind != null &&
    PHOTO_SURFACE_KINDS.has(input.personalizationKind) &&
    typeof out.photoSlots !== "number"
  ) {
    out.photoSlots = 1;
  }

  return out;
}

/**
 * Schema a persistir al CREAR. undefined = nada que guardar (columna queda
 * null) — ej. kind NONE sin set de letras ni ningún campo de foto.
 */
export function buildPersonalizationSchemaFromInput(
  input: PersonalizationFieldsInput,
): Record<string, unknown> | undefined {
  const built = mergePersonalizationAdminInput({}, input);
  return Object.keys(built).length > 0 ? built : undefined;
}

// ─────────────── lectura defensiva (precarga del form en edición) ───────────────

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function strArrOrNull(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const arr = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return arr.length > 0 ? arr : null;
}

export type PersonalizationAdminConfig = {
  photoSlots: number | null;
  facesPerUnit: number | null;
  aspectRatio: string | null;
  galleryTag: string | null;
  canvasBaseScale: number | null;
  gridColsOverride: number | null;
  textOnlyVariant: TextOnlyVariant;
  letterCountMin: number | null;
  letterCountMax: number | null;
  language: "es" | "en";
  maxChars: number | null;
  fontOptions: string[] | null;
  eventFields: string[] | null;
  allowPhoto: boolean;
  logoFields: string[] | null;
  requiresVectorFile: boolean;
  letterSet: "full" | "vowels" | null;
};

/**
 * Lee el personalizationSchema guardado para PRECARGAR el form de edición.
 * Por-key y tolerante (caso real 2026-09-25: un safeParse del schema completo
 * fallaba entero si otra key era inválida, ej. finish:"glass" del seed, y los
 * campos se veían vacíos aunque el valor sí estaba guardado).
 *
 * textOnlyVariant replica la subdivisión de surface.ts para TEXT_ONLY:
 * variant full/vowels → set fijo; maxChars/fontOptions (y variant ≠ "name")
 * → frase; si no → nombre.
 */
export function readPersonalizationAdminConfig(raw: unknown): PersonalizationAdminConfig {
  const s = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const variant = typeof s.variant === "string" ? s.variant : undefined;
  const maxChars = numOrNull(s.maxChars);
  const fontOptions = strArrOrNull(s.fontOptions);
  const textOnlyVariant: TextOnlyVariant =
    variant === "full" || variant === "vowels"
      ? variant
      : variant !== "name" && (maxChars !== null || fontOptions !== null)
        ? "phrase"
        : "name";
  return {
    photoSlots: numOrNull(s.photoSlots),
    facesPerUnit: numOrNull(s.facesPerUnit),
    aspectRatio: strOrNull(s.aspectRatio),
    galleryTag: strOrNull(s.galleryTag),
    canvasBaseScale: numOrNull(s.canvasBaseScale),
    gridColsOverride: numOrNull(s.gridColsOverride),
    textOnlyVariant,
    letterCountMin: numOrNull(s.letterCountMin),
    // Fallback a nameMaxLength (key legada del seed del abecedario; surface.ts
    // lee letterCountMax primero y nameMaxLength después — mismo orden acá).
    letterCountMax: numOrNull(s.letterCountMax) ?? numOrNull(s.nameMaxLength),
    language: s.language === "en" ? "en" : "es",
    maxChars,
    fontOptions,
    eventFields: strArrOrNull(s.eventFields),
    allowPhoto: s.allowPhoto === true,
    logoFields: strArrOrNull(s.fields),
    requiresVectorFile: s.requiresVectorFile === true,
    letterSet: s.letterSet === "full" || s.letterSet === "vowels" ? s.letterSet : null,
  };
}
