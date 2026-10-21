/*
 * Tipo de destino de la dirección urbana (anti-devoluciones, 2026-10):
 * capturar la dirección ESTRUCTURADA según el tipo de lugar reduce las
 * novedades del carrier («dirección errónea», «cliente ausente»).
 *
 * Fuente ÚNICA compartida por:
 *   - el schema Zod (schemas.ts — superRefine de obligatoriedad por tipo),
 *   - el form del checkout (datos-form.tsx — selector + campos condicionales),
 *   - /mi-cuenta/direcciones (components/address/structured-address-fields.tsx).
 *
 * El copy visible vive acá (archivo .ts, mismo patrón que CRUCE_HINT en
 * lib/colombia-validators.ts): los fallbacks CMS del checkout
 * (DEFAULT_CHECKOUT_TEXTS) referencian estas constantes y el form de
 * /mi-cuenta las usa directo, así ambos dicen EXACTAMENTE lo mismo.
 */

export const DESTINATION_TYPES = [
  "casa",
  "edificio",
  "conjunto_torres",
  "conjunto_casas",
  "oficina",
] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];

/** Campos estructurados del destino (todos opcionales en el schema; la
 *  obligatoriedad la pone DESTINATION_CONFIG.required vía superRefine). */
export type DestinationField =
  | "apartment"
  | "tower"
  | "houseNumber"
  | "blockCode"
  | "complexName"
  | "floor"
  | "buildingName"
  | "officeNumber"
  | "companyName"
  | "referencePoint";

/** Obligatoriedad y campos visibles por tipo (regla del owner 2026-10):
 *  - casa: ninguno obligatorio (referencia opcional)
 *  - edificio: apartamento obligatorio
 *  - conjunto_torres: torre + apartamento obligatorios
 *  - conjunto_casas: número de casa obligatorio
 *  - oficina: número de oficina obligatorio */
export const DESTINATION_CONFIG: Record<
  DestinationType,
  { label: string; required: DestinationField[]; optional: DestinationField[] }
> = {
  casa: { label: "🏠 Casa", required: [], optional: ["referencePoint"] },
  edificio: {
    label: "🏢 Edificio / Apartamento",
    required: ["apartment"],
    optional: ["floor", "buildingName", "referencePoint"],
  },
  conjunto_torres: {
    label: "🏘️ Conjunto de torres",
    required: ["tower", "apartment"],
    optional: ["complexName", "referencePoint"],
  },
  conjunto_casas: {
    label: "🏘️ Conjunto de casas",
    required: ["houseNumber"],
    optional: ["blockCode", "complexName", "referencePoint"],
  },
  oficina: {
    label: "🏬 Oficina / Empresa",
    required: ["officeNumber"],
    optional: ["floor", "companyName", "referencePoint"],
  },
};

/** Labels SIN emoji (texto plano) del tipo de destino — para el nombre
 *  derivado de la dirección guardada (Address.name, puramente display) y
 *  títulos donde el emoji no aplica. */
export const DESTINATION_PLAIN_LABELS: Record<DestinationType, string> = {
  casa: "Casa",
  edificio: "Edificio / Apartamento",
  conjunto_torres: "Conjunto de torres",
  conjunto_casas: "Conjunto de casas",
  oficina: "Oficina / Empresa",
};

/** Type guard para leer `destinationType` desde JSON (structured de una
 *  dirección guardada): null si el valor no es un tipo válido (legacy/tampered). */
export function asDestinationType(value: unknown): DestinationType | null {
  return typeof value === "string" && (DESTINATION_TYPES as readonly string[]).includes(value)
    ? (value as DestinationType)
    : null;
}

/** Nombre derivado para Address.name (obligatoria en DB, solo display — ya no
 *  se captura una etiqueta libre): label limpio del tipo de destino si la
 *  dirección urbana lo tiene; si no (rural/legacy), «Mi dirección en {city}». */
export function deriveAddressName(structured: {
  destinationType?: string | null;
  city: string;
}): string {
  const type = asDestinationType(structured.destinationType);
  if (type) return DESTINATION_PLAIN_LABELS[type];
  return `Mi dirección en ${structured.city}`;
}

/** Selector del form: 4 opciones visibles; «Conjunto residencial» abre el
 *  sub-toggle Torres | Casas que resuelve a conjunto_torres / conjunto_casas. */
export const DESTINATION_TYPE_LABEL = "Tipo de destino";
export const DESTINATION_GROUPS = [
  { id: "casa", label: "🏠 Casa" },
  { id: "edificio", label: "🏢 Edificio / Apartamento" },
  { id: "conjunto", label: "🏘️ Conjunto residencial" },
  { id: "oficina", label: "🏬 Oficina / Empresa" },
] as const;
export type DestinationGroupId = (typeof DESTINATION_GROUPS)[number]["id"];
export const DESTINATION_SUBTOGGLE = {
  torres: "Torres / apartamentos",
  casas: "Casas",
} as const;

export const DESTINATION_TYPE_ERROR =
  "Elige el tipo de destino — así el mensajero sabe a qué tipo de lugar llega";

// Los campos opcionales EN TODOS los tipos llevan «(opcional)» en la etiqueta;
// los que son requeridos según el tipo (apto, torre, casa, oficina) van sin
// sufijo y la UI les pone el asterisco rojo.
export const DESTINATION_FIELD_LABELS: Record<DestinationField, string> = {
  apartment: "Apartamento",
  tower: "Torre",
  houseNumber: "Número de casa",
  blockCode: "Manzana / bloque (opcional)",
  complexName: "Nombre del conjunto (opcional)",
  floor: "Piso (opcional)",
  buildingName: "Nombre del edificio (opcional)",
  officeNumber: "Número de oficina",
  companyName: "Nombre de la empresa (opcional)",
  referencePoint: "Punto de referencia (opcional)",
};

export const DESTINATION_FIELD_PLACEHOLDERS: Record<DestinationField, string> = {
  apartment: "Ej. 401",
  tower: "Ej. 2, B",
  houseNumber: "Ej. 15",
  blockCode: "Ej. C, 4",
  complexName: "Ej. Conjunto Lucams",
  floor: "Ej. 4",
  buildingName: "Ej. Edificio Alameda",
  officeNumber: "Ej. 302",
  companyName: "Ej. Lucams",
  referencePoint: "Ej. portería norte, frente al parque",
};

/** Espejo de los max() del schema (schemas.ts) para los maxLength de los inputs. */
export const DESTINATION_FIELD_MAX: Record<DestinationField, number> = {
  apartment: 20,
  tower: 20,
  houseNumber: 20,
  blockCode: 20,
  complexName: 100,
  floor: 10,
  buildingName: 100,
  officeNumber: 20,
  companyName: 120,
  referencePoint: 200,
};

/** Mensajes de obligatoriedad (es-CO específicos) — los mismos emite el
 *  superRefine del schema (server) y la validación cliente del checkout. */
export const DESTINATION_REQUIRED_ERRORS: Record<DestinationField, string> = {
  apartment: "Falta el número de apartamento (ej. 401)",
  tower: "Falta la torre del conjunto (ej. 2, B)",
  houseNumber: "Falta el número de casa dentro del conjunto (ej. 15)",
  blockCode: "Falta la manzana o bloque",
  complexName: "Falta el nombre del conjunto",
  floor: "Falta el piso",
  buildingName: "Falta el nombre del edificio",
  officeNumber: "Falta el número de oficina (ej. 302)",
  companyName: "Falta el nombre de la empresa",
  referencePoint: "Falta el punto de referencia",
};

/** Campos requeridos del tipo que quedaron vacíos (espejo cliente del
 *  superRefine del schema — mismo orden = mismo primer error). */
export function missingDestinationFields(
  type: DestinationType,
  values: Partial<Record<DestinationField, string>>,
): DestinationField[] {
  return DESTINATION_CONFIG[type].required.filter((f) => !values[f]?.trim());
}

// ─── Rural (refuerzo anti-devoluciones, 2026-10) ───
// La causa #1 de devolución rural es que el mensajero no localiza a nadie:
// finca re-etiquetada a «Finca / negocio / lugar», teléfono alternativo de la
// zona (va en la guía como «Tel. zona: …») y referencia con ejemplo concreto.
export const FINCA_LABEL = "Finca / negocio / lugar (opcional)";
export const ALT_PHONE_LABEL = "Teléfono alternativo en la zona (opcional)";
export const ALT_PHONE_HINT =
  "Si el mensajero no te encuentra, llama a este número (un familiar, un vecino, la tienda de la vereda…)";
export const RURAL_REF_PLACEHOLDER =
  "Ej.: a 200 m del puente sobre el río, casa azul de portón negro, al lado de la tienda de Doña Mary";
export const RURAL_REF_MIN_LENGTH = 20;
