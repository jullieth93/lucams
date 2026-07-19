/*
 * Opciones del wizard recomendador — compartidas entre el client component
 * (components/wizard-recomendador.tsx) y el server component que rehidrata el
 * estado desde searchParams (app/recomendador/page.tsx, #10).
 *
 * Datos planos (sin "use client") para que el servidor valide los searchParams
 * contra exactamente la misma whitelist que renderiza la UI, sin drift.
 */

export const DESTINATARIOS = [
  { value: "mi", label: "Para mí mismo/a" },
  { value: "pareja", label: "Mi pareja" },
  { value: "familia", label: "Familiar" },
  { value: "amigo", label: "Un amigo/a" },
  { value: "empresa", label: "Cliente de mi empresa" },
  { value: "nino", label: "Un niño/a" },
  { value: "adolescente", label: "Un/a adolescente" },
] as const;

export const PRICE_RANGES = [
  { value: "0:3000000", label: "Menos de $30k", min: 0, max: 3000000 },
  { value: "3000000:8000000", label: "$30k – $80k", min: 3000000, max: 8000000 },
  { value: "8000000:20000000", label: "$80k – $200k", min: 8000000, max: 20000000 },
  { value: "20000000:99999999", label: "Más de $200k", min: 20000000, max: 99999999 },
] as const;

export const PERSONALIZATION = [
  { value: "any", label: "Cualquiera está bien" },
  { value: "personalizable", label: "Personalizable (subir foto / editar)" },
  { value: "premade", label: "Listo para enviar (sin personalizar)" },
] as const;

/** Estado del wizard rehidratado desde la URL (#10). */
export type WizardInitial = {
  step: number;
  ocasionSlugs: string[];
  destinatario: string | null;
  priceRange: { min: number; max: number } | null;
  pers: string;
  view: "results" | null;
};
