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
