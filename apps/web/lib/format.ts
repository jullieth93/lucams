/*
 * Helpers de formateo compartidos.
 *
 * Precios en DB siempre en centavos COP (Int) — mandato CLAUDE.md.
 * `formatCOP(450000)` → "$ 4.500" (4500 pesos colombianos).
 */

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCOP(centavos: number): string {
  return copFormatter.format(centavos / 100);
}

const copExactFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Como formatCOP pero muestra los centavos cuando los hay (2026-10-29 —
 * conciliación Wompi: una diferencia de $0,50 importa; `$ 26.410,50`).
 * formatCOP sigue siendo el default de vitrina (precios redondos).
 */
export function formatCOPExact(centavos: number): string {
  return copExactFormatter.format(centavos / 100);
}

const relativeFormatter = new Intl.RelativeTimeFormat("es-CO", { numeric: "auto" });

/**
 * Tiempo relativo corto para feeds admin ("hace 5 min", "ayer", "hace 2 sem.").
 * Escala: minuto → hora → día → semana → fecha absoluta no (eso lo decide el
 * caller si lo quiere de tooltip). Futuros leves (skew de reloj) → "ahora".
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const absMin = Math.abs(diffMs) / 60_000;
  if (absMin < 1) return "ahora";
  if (absMin < 60) return relativeFormatter.format(Math.trunc(diffMs / 60_000), "minute");
  const absHours = absMin / 60;
  if (absHours < 24) return relativeFormatter.format(Math.trunc(diffMs / 3_600_000), "hour");
  const absDays = absHours / 24;
  if (absDays < 7) return relativeFormatter.format(Math.trunc(diffMs / 86_400_000), "day");
  return relativeFormatter.format(Math.trunc(diffMs / 604_800_000), "week");
}

/** Slug URL-safe (minúsculas, sin tildes, guiones, tope 80 chars). Única fuente: admin productos/categorías. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Convierte un input en PESOS (lo que teclea el operador) a centavos COP; vacío → null. */
export function pesosToCents(raw: FormDataEntryValue | null): number | null {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const pesos = Number.parseInt(digits, 10);
  return Number.isFinite(pesos) ? pesos * 100 : null;
}

/**
 * #30 — Ciudad + departamento sin repetición. En Colombia, Bogotá D.C. es a la vez ciudad (DANE
 * 11001) y departamento (DANE 11) con el mismo nombre → "{city}, {department}" daba "Bogotá D.C.,
 * Bogotá D.C.". Cuando coinciden (sin distinguir mayúsculas ni tildes) devolvemos solo la ciudad.
 */
export function formatCityDept(city: string, department: string): string {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const c = (city ?? "").trim();
  const d = (department ?? "").trim();
  if (!d || norm(c) === norm(d)) return c;
  return `${c}, ${d}`;
}

/**
 * Enmascara un email para vistas públicas/compartibles (minimización PII, Ley 1581).
 * "lucia.perez@gmail.com" → "lu•••@gmail.com". Conserva 1-2 letras del local-part + el dominio.
 * Si no hay "@" o el local-part es muy corto, enmascara de forma segura sin romper.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}•••${domain}`;
}

/**
 * Token `{{ciudad}}` en textos CMS (Ruta A, 2026-07-29): bloques como
 * `checkout.envio.subtext` llevan el placeholder y el render lo sustituye
 * por la ciudad real. Devuelve [antes, después] del token para poder
 * envolver la ciudad en <strong>; si el texto no trae el token, va entero
 * en `pre` y `post` queda vacío.
 */
export function splitCityTemplate(template: string): { pre: string; post: string } {
  const idx = template.indexOf("{{ciudad}}");
  if (idx === -1) return { pre: template, post: "" };
  return {
    pre: template.slice(0, idx),
    post: template.slice(idx + "{{ciudad}}".length),
  };
}

/**
 * % de descuento sobre el compareAt del precio REALMENTE mostrado (#20: que el badge
 * coincida con la cifra visible). Única fuente — cards de listado, recomendador y PDP.
 */
export function computeDiscountPct(compareAtPrice: number, displayPrice: number): number {
  return Math.round(((compareAtPrice - displayPrice) / compareAtPrice) * 100);
}
