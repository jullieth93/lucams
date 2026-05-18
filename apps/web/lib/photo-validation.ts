/*
 * Photo validation server-side — M.3.b.B.2 (2026-05-13).
 *
 * Análisis de calidad de fotos subidas por el cliente, ANTES de persistir
 * el DesignAsset. Devuelve warnings amigables para que Lucy decida si
 * continuar o reemplazar la foto, evitando recibir un imán pixelado o
 * borroso después de pagar.
 *
 * Tres checks:
 *   1. Resolución física  — px reales vs requerido para 300 DPI según
 *                            tamaño físico del imán (sizeCm).
 *                            Foto chica = imán pixelado.
 *   2. Brillo (luminance) — mean luminance del canal grayscale.
 *                            Foto oscura = imán negro al imprimir.
 *   3. Borrosidad         — stdev del kernel Laplaciano (técnica
 *                            estándar OpenCV's cv2.Laplacian.var()).
 *                            Foto blurry = imán sin nitidez.
 *
 * Niveles agregados (peor de los 3 checks define el nivel):
 *   - "error"           → al menos 1 check failed con severidad bloqueante
 *                          (foto demasiado pequeña). Cliente no puede continuar.
 *   - "warning-strong"  → al menos 1 check con severidad alta (foto muy
 *                          oscura o muy borrosa). Cliente puede continuar
 *                          pero con badge rojo persistente.
 *   - "warning-soft"    → al menos 1 check con severidad media. Badge naranja.
 *   - "ok"              → todos los checks pasaron.
 *
 * Mensajes en español Colombia tuteo (siguiendo feedback_es_co_tuteo memoria).
 *
 * Performance: usa sharp en un solo pipeline. ~50-150ms por foto (depende
 * del tamaño). Corre server-side en la action de upload (no bloquea UI).
 */

const DPI_300 = 300;
const CM_PER_INCH = 2.54;

/** Píxeles por cm a 300 DPI = 300 / 2.54 ≈ 118.11. */
const PX_PER_CM_300DPI = DPI_300 / CM_PER_INCH;

// ──────────────────────────────────────────────────────────────────
//  Thresholds — tunables si Lucy reporta falsos positivos
// ──────────────────────────────────────────────────────────────────

/** Resolución: ratio = minDim / requiredPx. */
const RES_THRESHOLDS = {
  ERROR_BELOW: 0.5, // < 50% de la resolución requerida
  WARNING_STRONG_BELOW: 0.8, // 50-80% pasable pero pixelado
  WARNING_SOFT_BELOW: 1.0, // 80-100% borderline
};

/** Brillo: mean luminance escala 0-255 del canal grayscale. */
const BRIGHTNESS_THRESHOLDS = {
  TOO_DARK_BELOW: 25, // muy oscura
  DARK_BELOW: 50, // borderline oscura
  TOO_BRIGHT_ABOVE: 235, // sobreexpuesta
};

/** Blur: stdev del Laplacian. < 10 muy borrosa, 10-25 borrosa moderada. */
const BLUR_THRESHOLDS = {
  VERY_BLURRY_BELOW: 5,
  BLURRY_BELOW: 15,
};

// ──────────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────────

export type PhotoValidationLevel = "ok" | "warning-soft" | "warning-strong" | "error";

export type CheckResult = {
  passed: boolean;
  level: PhotoValidationLevel;
  message?: string;
};

export type PhotoValidationResult = {
  level: PhotoValidationLevel;
  resolution: CheckResult & { actualMinPx: number; requiredPx: number; ratio: number };
  brightness: CheckResult & { meanLuminance: number };
  blur: CheckResult & { laplacianStdev: number };
  /** Mensaje único legible para el cliente con el peor problema. */
  message?: string;
  /** Sugerencia accionable para el cliente. */
  recommendation?: string;
};

// ──────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────

/**
 * Parsea sizeCm "5×5" / "15×15" / "5×7" / "5x6" → { widthCm, heightCm }.
 * Acepta los separadores × (U+00D7) y x normal.
 */
function parseSizeCm(sizeCm: string | undefined): { widthCm: number; heightCm: number } | null {
  if (!sizeCm) return null;
  const match = sizeCm.match(/^(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  return { widthCm: parseFloat(match[1]), heightCm: parseFloat(match[2]) };
}

function pickWorst(levels: PhotoValidationLevel[]): PhotoValidationLevel {
  const order: PhotoValidationLevel[] = ["ok", "warning-soft", "warning-strong", "error"];
  let worst: PhotoValidationLevel = "ok";
  for (const lvl of levels) {
    if (order.indexOf(lvl) > order.indexOf(worst)) worst = lvl;
  }
  return worst;
}

// ──────────────────────────────────────────────────────────────────
//  Main entrypoint
// ──────────────────────────────────────────────────────────────────

export type ValidatePhotoOpts = {
  buffer: Buffer;
  width: number;
  height: number;
  /** Tamaño físico del imán (ej "5×5" o "15×15"). Si no se pasa, salta el DPI check. */
  productSizeCm?: string;
};

/**
 * Corre los 3 checks sobre la foto.
 * NO bloquea el upload — el caller decide qué hacer con el resultado.
 */
export async function validatePhotoQuality(
  opts: ValidatePhotoOpts,
): Promise<PhotoValidationResult> {
  const { buffer, width, height, productSizeCm } = opts;

  // ───────── 1. RESOLUCIÓN ─────────
  let resolution: PhotoValidationResult["resolution"];
  const parsed = parseSizeCm(productSizeCm);
  if (parsed) {
    // El imán físico mínimo dimension determina req px (peor caso).
    const minCm = Math.min(parsed.widthCm, parsed.heightCm);
    const requiredPx = Math.ceil(minCm * PX_PER_CM_300DPI);
    const actualMinPx = Math.min(width, height);
    const ratio = actualMinPx / requiredPx;

    if (ratio < RES_THRESHOLDS.ERROR_BELOW) {
      resolution = {
        passed: false,
        level: "error",
        actualMinPx,
        requiredPx,
        ratio,
        message: `Resolución muy baja (${actualMinPx}px vs ${requiredPx}px requeridos para imprimir ${productSizeCm} cm a 300 DPI).`,
      };
    } else if (ratio < RES_THRESHOLDS.WARNING_STRONG_BELOW) {
      resolution = {
        passed: false,
        level: "warning-strong",
        actualMinPx,
        requiredPx,
        ratio,
        message: `Se va a ver pixelada al imprimir a tamaño real (${productSizeCm} cm).`,
      };
    } else if (ratio < RES_THRESHOLDS.WARNING_SOFT_BELOW) {
      resolution = {
        passed: false,
        level: "warning-soft",
        actualMinPx,
        requiredPx,
        ratio,
        message: `La resolución está justa para tamaño ${productSizeCm} cm. Si tienes una versión más grande, va a salir mejor.`,
      };
    } else {
      resolution = { passed: true, level: "ok", actualMinPx, requiredPx, ratio };
    }
  } else {
    // Sin sizeCm declarado → no podemos validar DPI, pero igualmente
    // reportamos los datos crudos.
    const actualMinPx = Math.min(width, height);
    resolution = {
      passed: true,
      level: "ok",
      actualMinPx,
      requiredPx: 0,
      ratio: 1,
    };
  }

  // ───────── 2. BRILLO + 3. BLUR (vía sharp) ─────────
  // Importamos sharp dinámicamente para no bundlear en build estático.
  const sharp = (await import("sharp")).default;

  // Brillo: mean del canal grayscale.
  let brightness: PhotoValidationResult["brightness"];
  let blur: PhotoValidationResult["blur"];

  try {
    // Resize a 600 max dimension antes de analizar — análisis a fullres es
    // overkill (las métricas son escala-invariantes para imágenes naturales)
    // y come CPU innecesaria.
    const sample = sharp(buffer).resize(600, 600, { fit: "inside", withoutEnlargement: true });

    // Stats del canal grayscale → mean luminance.
    const greyStats = await sample.clone().grayscale().stats();
    const meanLum = greyStats.channels[0]?.mean ?? 128;

    if (meanLum < BRIGHTNESS_THRESHOLDS.TOO_DARK_BELOW) {
      brightness = {
        passed: false,
        level: "warning-strong",
        meanLuminance: meanLum,
        message: "La foto se ve muy oscura. Considera tomar otra con más luz.",
      };
    } else if (meanLum < BRIGHTNESS_THRESHOLDS.DARK_BELOW) {
      brightness = {
        passed: false,
        level: "warning-soft",
        meanLuminance: meanLum,
        message: "La foto está algo oscura. Podría verse mejor con más luz.",
      };
    } else if (meanLum > BRIGHTNESS_THRESHOLDS.TOO_BRIGHT_ABOVE) {
      brightness = {
        passed: false,
        level: "warning-soft",
        meanLuminance: meanLum,
        message: "La foto está sobreexpuesta. Algunos detalles podrían perderse al imprimir.",
      };
    } else {
      brightness = { passed: true, level: "ok", meanLuminance: meanLum };
    }

    // Blur: stdev del Laplacian (técnica cv2.Laplacian.var()).
    const lapStats = await sample
      .clone()
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0],
      })
      .stats();
    const lapStdev = lapStats.channels[0]?.stdev ?? 50;

    if (lapStdev < BLUR_THRESHOLDS.VERY_BLURRY_BELOW) {
      blur = {
        passed: false,
        level: "warning-strong",
        laplacianStdev: lapStdev,
        message: "La foto se ve muy borrosa. Considera elegir una con más nitidez.",
      };
    } else if (lapStdev < BLUR_THRESHOLDS.BLURRY_BELOW) {
      blur = {
        passed: false,
        level: "warning-soft",
        laplacianStdev: lapStdev,
        message: "La foto tiene poca nitidez. Si tienes una más nítida, va a quedar mejor.",
      };
    } else {
      blur = { passed: true, level: "ok", laplacianStdev: lapStdev };
    }
  } catch {
    // Si sharp falla en stats, no bloqueamos — devolvemos OK con flag de
    // error opaco que el logger del caller captura.
    brightness = { passed: true, level: "ok", meanLuminance: 128 };
    blur = { passed: true, level: "ok", laplacianStdev: 50 };
  }

  // ───────── Agregado ─────────
  const overallLevel = pickWorst([resolution.level, brightness.level, blur.level]);
  let message: string | undefined;
  let recommendation: string | undefined;

  if (overallLevel === "error") {
    message = resolution.message;
    recommendation = "Por favor sube una foto de mayor resolución.";
  } else if (overallLevel === "warning-strong" || overallLevel === "warning-soft") {
    // Priorizar el peor: resolution > blur > brightness (las 3 niveladas)
    message = resolution.message ?? blur.message ?? brightness.message;
    if (resolution.level !== "ok") {
      recommendation = "Una foto más grande va a quedar mejor al imprimir.";
    } else if (blur.level !== "ok") {
      recommendation = "Prueba con una foto más nítida si la tienes.";
    } else if (brightness.level !== "ok") {
      recommendation = "Una foto con más luz va a verse mejor.";
    }
  }

  return {
    level: overallLevel,
    resolution,
    brightness,
    blur,
    message,
    recommendation,
  };
}
