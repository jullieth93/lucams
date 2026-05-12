/*
 * Calculador de fuerza de contraseña custom.
 *
 * Por qué no zxcvbn:
 *   - zxcvbn-ts core pesa ~30 KB minified + gzipped (++ con diccionarios).
 *   - Para nuestro caso (e-commerce general, no banking) un heurístico
 *     simple es suficiente. Si se vuelve relevante, migramos.
 *
 * Reglas (0-4):
 *   0 muy débil:      < 8 chars (no llega al mínimo legal del schema Zod)
 *   1 débil:          ≥ 8 chars pero sin variedad (solo letras o solo números)
 *   2 razonable:      ≥ 8 chars + 2 clases (mayús/minús/dígito/símbolo)
 *   3 fuerte:         ≥ 10 chars + 3 clases, O ≥ 14 chars + 2 clases
 *   4 muy fuerte:     ≥ 12 chars + 4 clases, O ≥ 16 chars + 3 clases
 *
 * Penalizaciones:
 *   - Repeticiones largas (aaaa, 1111) bajan 1 nivel.
 *   - Secuencias comunes ("123", "abc", "qwerty") bajan 1 nivel.
 *   - Contiene "password", "lucams", "contraseña" baja 1 nivel.
 *
 * El resultado nunca baja de 0 ni sube de 4.
 */

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export type PasswordStrength = {
  score: PasswordScore;
  label: string;
  color: string;
  suggestion: string;
};

const LABELS: Record<PasswordScore, string> = {
  0: "Muy débil",
  1: "Débil",
  2: "Razonable",
  3: "Fuerte",
  4: "Muy fuerte",
};

const COLORS: Record<PasswordScore, string> = {
  0: "bg-error",
  1: "bg-warning",
  2: "bg-brand-yellow",
  3: "bg-brand-turquoise",
  4: "bg-success",
};

const SUGGESTIONS: Record<PasswordScore, string> = {
  0: "Muy corta — usa al menos 8 caracteres.",
  1: "Agrega mayúsculas, números o símbolos para reforzarla.",
  2: "Buen comienzo — más caracteres la harían fuerte.",
  3: "Excelente. Difícil de adivinar.",
  4: "Inquebrantable. Bien hecho.",
};

const COMMON_SEQUENCES = ["123", "234", "345", "456", "567", "678", "789", "abc", "qwerty", "asdf"];

const COMMON_TERMS = ["password", "contrasena", "contraseña", "lucams", "admin"];

function countClasses(pwd: string): number {
  let classes = 0;
  if (/[a-z]/.test(pwd)) classes++;
  if (/[A-Z]/.test(pwd)) classes++;
  if (/[0-9]/.test(pwd)) classes++;
  if (/[^A-Za-z0-9]/.test(pwd)) classes++;
  return classes;
}

function hasLongRepetition(pwd: string): boolean {
  return /(.)\1{3,}/.test(pwd);
}

function hasCommonSequence(pwd: string): boolean {
  const lower = pwd.toLowerCase();
  return COMMON_SEQUENCES.some((seq) => lower.includes(seq));
}

function containsCommonTerm(pwd: string): boolean {
  const lower = pwd.toLowerCase();
  return COMMON_TERMS.some((t) => lower.includes(t));
}

export function calculatePasswordStrength(pwd: string): PasswordStrength {
  if (!pwd) {
    return {
      score: 0,
      label: LABELS[0],
      color: COLORS[0],
      suggestion: "",
    };
  }

  const length = pwd.length;
  const classes = countClasses(pwd);

  let raw: number;

  if (length < 8) raw = 0;
  else if (length >= 16 && classes >= 3) raw = 4;
  else if (length >= 12 && classes >= 4) raw = 4;
  else if (length >= 14 && classes >= 2) raw = 3;
  else if (length >= 10 && classes >= 3) raw = 3;
  else if (length >= 8 && classes >= 2) raw = 2;
  else raw = 1;

  if (hasLongRepetition(pwd)) raw -= 1;
  if (hasCommonSequence(pwd)) raw -= 1;
  if (containsCommonTerm(pwd)) raw -= 1;

  const score = Math.max(0, Math.min(4, raw)) as PasswordScore;

  return {
    score,
    label: LABELS[score],
    color: COLORS[score],
    suggestion: SUGGESTIONS[score],
  };
}
