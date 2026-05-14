/*
 * Size comparator — P0.5 (2026-05-14).
 *
 * Mapea el tamaño físico del imán (sizeCm como "5×5", "7×9", "15×15") a un
 * objeto cotidiano colombiano comparable. El cliente entiende "5×5 cm" mejor
 * cuando se le dice "como una galleta Oreo" que con la cifra abstracta.
 *
 * Diferenciador de "tienda que envidiar": Casetify/Mixbook/Shutterfly no
 * hacen esto. Reduce devoluciones por "llegó más chico de lo esperado".
 *
 * Referencias colombianas:
 *   - Moneda de $1.000 → 26.6 mm diámetro
 *   - Galleta Oreo → 45 mm diámetro
 *   - Tarjeta de crédito → 85.6 × 53.98 mm
 *   - Polaroid clásica → 88 × 108 mm
 *   - CD → 120 mm diámetro
 *   - Servilleta cuadrada → ~150 mm
 *   - Posavasos → ~95 mm
 */

export type SizeComparison = {
  /** Emoji visual del objeto */
  emoji: string;
  /** Nombre del objeto en es-CO tuteo */
  name: string;
  /** Frase corta tipo "como una X" */
  phrase: string;
};

/**
 * Parsea "5×5", "5x5", "7×9", "15" → { widthCm, heightCm }.
 * Si solo viene un número (ej circular "6"), asume cuadrado.
 */
function parseSize(sizeCm: string): { widthCm: number; heightCm: number } | null {
  const m = sizeCm.match(/^(\d+(?:\.\d+)?)(?:\s*[×x]\s*(\d+(?:\.\d+)?))?$/i);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = m[2] ? parseFloat(m[2]) : w;
  return { widthCm: w, heightCm: h };
}

/**
 * Devuelve el objeto cotidiano más cercano al tamaño del imán.
 * Para imanes rectangulares usa la dimensión MAYOR como referencia.
 * Para cuadrados/circulares usa el lado.
 */
export function compareSizeToObject(sizeCm: string | undefined): SizeComparison | null {
  if (!sizeCm) return null;
  const parsed = parseSize(sizeCm);
  if (!parsed) return null;
  const maxDim = Math.max(parsed.widthCm, parsed.heightCm);
  const minDim = Math.min(parsed.widthCm, parsed.heightCm);
  const isSquare = Math.abs(parsed.widthCm - parsed.heightCm) < 0.5;

  // 3 cm o menos
  if (maxDim <= 3.5) {
    return {
      emoji: "🪙",
      name: "Moneda de $1.000",
      phrase: "como una moneda de mil",
    };
  }

  // 4-5 cm cuadrado
  if (maxDim <= 5.5 && isSquare) {
    return {
      emoji: "🍪",
      name: "Galleta Oreo",
      phrase: "como una galleta Oreo",
    };
  }

  // 5-6 cm con relación tarjeta
  if (maxDim <= 6 && minDim >= 4) {
    return {
      emoji: "💳",
      name: "Mitad de tarjeta de crédito",
      phrase: "como media tarjeta de crédito",
    };
  }

  // 7-9 cm tipo polaroid
  if (maxDim <= 10 && minDim >= 5) {
    return {
      emoji: "📸",
      name: "Polaroid clásica",
      phrase: "como una polaroid clásica",
    };
  }

  // 10-13 cm cuadrado tipo CD
  if (maxDim <= 13 && isSquare) {
    return {
      emoji: "💿",
      name: "CD",
      phrase: "como un CD",
    };
  }

  // 10-13 cm rectangular tipo billete
  if (maxDim <= 13) {
    return {
      emoji: "💵",
      name: "Billete de $5.000",
      phrase: "como un billete de cinco mil",
    };
  }

  // 14-17 cm tipo posavasos grande / servilleta
  if (maxDim <= 17) {
    return {
      emoji: "🍽️",
      name: "Posavasos grande",
      phrase: "como un posavasos grande",
    };
  }

  // 18-22 cm tipo platillo
  if (maxDim <= 22) {
    return {
      emoji: "🥖",
      name: "Plato pequeño",
      phrase: "como un plato pequeño",
    };
  }

  // Más grande → cuaderno / hoja
  return {
    emoji: "📓",
    name: "Cuaderno A5",
    phrase: "como un cuaderno A5",
  };
}
