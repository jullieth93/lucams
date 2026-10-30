/*
 * Tests para validatePhotoQuality — lib/photo-validation.ts
 *
 * Tipo: PURO. No toca DB, cookies ni red. Usa `sharp` real (la misma lib
 * que usa el módulo) para construir buffers PNG deterministas cuyas stats
 * conocemos exactamente, y así aislar cada uno de los 3 checks
 * (resolución / brillo / blur) y sus bordes de umbral.
 *
 * Hechos verificados con probes contra sharp real (node v22, sharp 0.34):
 *
 *   - Imagen RAW gris sólido valor G:
 *       meanLuminance === G   (grayscale conserva el valor exacto)
 *       laplacianStdev === 0  (sin bordes → Laplaciano plano)
 *
 *   - Tablero (checker) lo/hi período 2:
 *       meanLuminance === (lo + hi) / 2
 *       laplacianStdev === (hi - lo) / 2
 *     → control INDEPENDIENTE de brillo (vía media) y nitidez (vía contraste).
 *
 *   - Buffer basura (no es imagen) → sharp.stats() lanza → el módulo entra
 *     al catch y devuelve brightness/blur OK con valores fallback 128/50.
 *
 *   - Resolución: PX_PER_CM_300DPI = 300/2.54 = 118.1102…
 *       requiredPx(5cm)  = ceil(5  * 118.1102) = 591
 *       requiredPx(7cm)  = ceil(7  * 118.1102) = 827
 *       requiredPx(15cm) = ceil(15 * 118.1102) = 1772
 */

import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { validatePhotoQuality } from "./photo-validation";

// ──────────────────────────────────────────────────────────────────
//  Helpers para construir buffers deterministas
// ──────────────────────────────────────────────────────────────────

/** Gris sólido → meanLuminance = gray, laplacianStdev = 0 (siempre "muy borrosa"). */
async function solidGray(side: number, gray: number): Promise<Buffer> {
  const buf = Buffer.alloc(side * side * 3, gray);
  return sharp(buf, { raw: { width: side, height: side, channels: 3 } })
    .png()
    .toBuffer();
}

/**
 * Tablero período 2 con valores `lo`/`hi` en los 3 canales (gris).
 *   meanLuminance = (lo + hi) / 2     → controla brillo
 *   laplacianStdev = (hi - lo) / 2    → controla nitidez (blur)
 */
async function checker(side: number, lo: number, hi: number): Promise<Buffer> {
  const channels = 3;
  const buf = Buffer.alloc(side * side * channels);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const on = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
      const v = on ? hi : lo;
      const i = (y * side + x) * channels;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    }
  }
  return sharp(buf, { raw: { width: side, height: side, channels } })
    .png()
    .toBuffer();
}

// ──────────────────────────────────────────────────────────────────
//  Buffers compartidos (construidos una vez)
// ──────────────────────────────────────────────────────────────────

// Imagen "buena" universal: nítida (stdev 30) y brillo medio (130).
let goodImg: Buffer;
// Brillo controlado, blur SIEMPRE OK (nítido), para aislar el check de brillo.
let darkStrongImg: Buffer; // mean 15  → too dark (warning-strong)
let darkSoftImg: Buffer; //   mean 35  → dark    (warning-soft)
let brightSoftImg: Buffer; // mean 237.5 → over-bright (warning-soft)
// Blur controlado, brillo SIEMPRE OK (~130), para aislar el check de blur.
// Umbrales 2026-10-29: strong < 4, soft < 10 (antes 5/15 — falsos positivos
// con retratos de fondo desenfocado y fotos de celular apenas suaves).
let blurStrongImg: Buffer; // stdev 3  → very blurry (warning-strong)
let blurSoftImg: Buffer; //   stdev 8  → blurry    (warning-soft)
// Gris sólido brillo OK → blur stdev 0 (very blurry).
let solidOkBrightnessImg: Buffer;
// Basura para forzar el catch de sharp.
const garbageImg = Buffer.from("definitely-not-an-image-just-text-bytes");

beforeAll(async () => {
  goodImg = await checker(120, 100, 160); // mean 130, stdev 30
  darkStrongImg = await checker(120, 0, 30); // mean 15, stdev 15 (blur ok)
  darkSoftImg = await checker(120, 20, 50); // mean 35, stdev 15 (blur ok, en el límite)
  brightSoftImg = await checker(120, 220, 255); // mean 237.5, stdev 17.5 (blur ok)
  blurStrongImg = await checker(120, 125, 131); // mean 128, stdev 3
  blurSoftImg = await checker(120, 122, 138); // mean 130, stdev 8
  solidOkBrightnessImg = await solidGray(100, 128); // mean 128, stdev 0
});

// ──────────────────────────────────────────────────────────────────
//  1. RESOLUCIÓN — DPI check
// ──────────────────────────────────────────────────────────────────

describe("validatePhotoQuality · resolución (DPI)", () => {
  it("calcula requiredPx = ceil(minCm * 300/2.54): 5cm → 591", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 600,
      height: 600,
      productSizeCm: "5×5",
    });
    expect(r.resolution.requiredPx).toBe(591);
    expect(r.resolution.actualMinPx).toBe(600);
  });

  it("usa la dimensión física MÍNIMA para requiredPx (5×7 → toma 5cm)", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 1000,
      height: 1000,
      productSizeCm: "5×7",
    });
    // min(5,7)=5 → 591, NO 7cm→827
    expect(r.resolution.requiredPx).toBe(591);
  });

  it("usa la dimensión de imagen MÍNIMA para actualMinPx", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 2000,
      height: 700,
      productSizeCm: "5×5",
    });
    expect(r.resolution.actualMinPx).toBe(700);
    expect(r.resolution.ratio).toBeCloseTo(700 / 591, 6);
  });

  it("ratio >= 1.0 → resolución OK (passed)", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 591, // exactamente requiredPx → ratio 1.0
      height: 591,
      productSizeCm: "5×5",
    });
    expect(r.resolution.passed).toBe(true);
    expect(r.resolution.level).toBe("ok");
    expect(r.resolution.message).toBeUndefined();
  });

  it("0.8 <= ratio < 1.0 → OK (la barra soft bajó a 240 DPI el 2026-10-29)", async () => {
    // requiredPx 591; 590/591 = 0.9983 — entre 240 y 300 DPI ya NO se avisa:
    // a la distancia de lectura del producto se ve nítido (falso positivo).
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 590,
      height: 590,
      productSizeCm: "5×5",
    });
    expect(r.resolution.level).toBe("ok");
    expect(r.resolution.passed).toBe(true);
  });

  it("borde: ratio apenas >= 0.8 (240 DPI efectivos) pasa limpio", async () => {
    // 473/591 = 0.80033 → OK (la barra soft es < 0.8).
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 473,
      height: 473,
      productSizeCm: "5×5",
    });
    expect(r.resolution.ratio).toBeGreaterThanOrEqual(0.8);
    expect(r.resolution.level).toBe("ok");
  });

  it("0.67 <= ratio < 0.8 → warning-soft (suficiente, cerca del límite)", async () => {
    // 472/591 = 0.7986 (< 0.8, >= 0.67)
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 472,
      height: 472,
      productSizeCm: "5×5",
    });
    expect(r.resolution.level).toBe("warning-soft");
    expect(r.resolution.passed).toBe(false);
    expect(r.resolution.message).toContain("suficiente");
  });

  it("0.5 <= ratio < 0.67 → warning-strong (pixelada)", async () => {
    // 360/591 = 0.609 (< 0.67, >= 0.5)
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 360,
      height: 360,
      productSizeCm: "5×5",
    });
    expect(r.resolution.level).toBe("warning-strong");
    expect(r.resolution.passed).toBe(false);
    expect(r.resolution.message).toContain("pixelada");
  });

  it("borde inferior de warning-strong: ratio == 0.5 exacto NO es error", async () => {
    // requiredPx 591 no da 0.5 entero (295.5). Construimos un caso con ratio
    // exactamente 0.5 vía 15cm→1772; 1772/2 = 886 (entero).
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 886,
      height: 886,
      productSizeCm: "15×15",
    });
    expect(r.resolution.requiredPx).toBe(1772);
    expect(r.resolution.ratio).toBe(0.5);
    // 0.5 NO es < 0.5 → no error; cae en warning-strong.
    expect(r.resolution.level).toBe("warning-strong");
  });

  it("ratio < 0.5 → error (bloqueante)", async () => {
    // 885/1772 = 0.4994 (< 0.5)
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 885,
      height: 885,
      productSizeCm: "15×15",
    });
    expect(r.resolution.level).toBe("error");
    expect(r.resolution.passed).toBe(false);
    expect(r.resolution.message).toContain("Resolución muy baja");
    expect(r.resolution.message).toContain("885px");
    expect(r.resolution.message).toContain("1772px");
  });

  it("sin productSizeCm → salta DPI check, resolución OK con requiredPx 0 y ratio 1", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 10,
      height: 10,
      // productSizeCm omitido
    });
    expect(r.resolution.passed).toBe(true);
    expect(r.resolution.level).toBe("ok");
    expect(r.resolution.requiredPx).toBe(0);
    expect(r.resolution.ratio).toBe(1);
    expect(r.resolution.actualMinPx).toBe(10);
  });

  it("productSizeCm con formato inválido → tratado como sin tamaño (salta DPI)", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 10,
      height: 10,
      productSizeCm: "grande",
    });
    expect(r.resolution.requiredPx).toBe(0);
    expect(r.resolution.ratio).toBe(1);
    expect(r.resolution.level).toBe("ok");
  });

  it("acepta separador 'x' ASCII además de '×' unicode", async () => {
    const rUnicode = await validatePhotoQuality({
      buffer: goodImg,
      width: 600,
      height: 600,
      productSizeCm: "5×5",
    });
    const rAscii = await validatePhotoQuality({
      buffer: goodImg,
      width: 600,
      height: 600,
      productSizeCm: "5x5",
    });
    expect(rAscii.resolution.requiredPx).toBe(591);
    expect(rAscii.resolution.requiredPx).toBe(rUnicode.resolution.requiredPx);
  });

  it("acepta tamaños decimales en sizeCm (4.5×4.5)", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 600,
      height: 600,
      productSizeCm: "4.5×4.5",
    });
    // ceil(4.5 * 118.1102) = ceil(531.49) = 532
    expect(r.resolution.requiredPx).toBe(532);
  });

  it("string vacío como sizeCm → salta DPI (requiredPx 0)", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 600,
      height: 600,
      productSizeCm: "",
    });
    expect(r.resolution.requiredPx).toBe(0);
    expect(r.resolution.level).toBe("ok");
  });
});

// ──────────────────────────────────────────────────────────────────
//  2. BRILLO
// ──────────────────────────────────────────────────────────────────

describe("validatePhotoQuality · brillo", () => {
  it("foto oscura (cualquier nivel) → OK: la oscuridad es decisión estética, no se advierte", async () => {
    const r = await validatePhotoQuality({ buffer: darkStrongImg, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBeCloseTo(15, 5);
    expect(r.brightness.level).toBe("ok");
    expect(r.brightness.passed).toBe(true);
    expect(r.brightness.message).toBeUndefined();
  });

  it("borde: meanLuminance muy baja (19) sigue OK", async () => {
    const img = await solidGray(50, 19);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(19);
    expect(r.brightness.level).toBe("ok");
  });

  it("meanLuminance media (35-40) → OK", async () => {
    const r = await validatePhotoQuality({ buffer: darkSoftImg, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBeCloseTo(35, 5);
    expect(r.brightness.level).toBe("ok");
    expect(r.brightness.passed).toBe(true);
  });

  it("meanLuminance > 235 → warning-soft (zonas quemadas de luz)", async () => {
    const r = await validatePhotoQuality({ buffer: brightSoftImg, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBeCloseTo(237.5, 4);
    expect(r.brightness.level).toBe("warning-soft");
    // 2026-10-19 — el aviso dice lo que el check mide (zonas quemadas, casi
    // blancas, que se imprimen sin detalle); NADA de "sobreexpuesta" (se leía
    // como que la foto se sale del recuadro).
    expect(r.brightness.message).toContain("quemadas de luz");
    expect(r.brightness.message).not.toContain("sobreexpuesta");
  });

  it("borde: meanLuminance == 235 NO dispara el aviso de brillo → OK", async () => {
    const img = await solidGray(50, 235);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(235);
    expect(r.brightness.passed).toBe(true);
    expect(r.brightness.level).toBe("ok");
  });

  it("borde: meanLuminance == 236 SÍ dispara el aviso de brillo (warning-soft)", async () => {
    const img = await solidGray(50, 236);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(236);
    expect(r.brightness.level).toBe("warning-soft");
    expect(r.brightness.message).toContain("quemadas de luz");
  });

  it("brillo medio (40..235) → OK sin mensaje", async () => {
    const r = await validatePhotoQuality({ buffer: solidOkBrightnessImg, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(128);
    expect(r.brightness.passed).toBe(true);
    expect(r.brightness.message).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
//  3. BLUR
// ──────────────────────────────────────────────────────────────────

describe("validatePhotoQuality · blur (Laplacian stdev)", () => {
  it("stdev < 4 → warning-strong (muy borrosa)", async () => {
    const r = await validatePhotoQuality({ buffer: blurStrongImg, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBeCloseTo(3, 3);
    expect(r.blur.level).toBe("warning-strong");
    expect(r.blur.passed).toBe(false);
    expect(r.blur.message).toContain("muy borrosa");
  });

  it("imagen de color sólido (sin bordes) → stdev 0 → muy borrosa", async () => {
    const r = await validatePhotoQuality({ buffer: solidOkBrightnessImg, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBe(0);
    expect(r.blur.level).toBe("warning-strong");
  });

  it("4 <= stdev < 10 → warning-soft (poca nitidez)", async () => {
    const r = await validatePhotoQuality({ buffer: blurSoftImg, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBeCloseTo(8, 3);
    expect(r.blur.level).toBe("warning-soft");
    expect(r.blur.message).toContain("poca nitidez");
  });

  it("stdev >= 10 → OK (nítida)", async () => {
    const r = await validatePhotoQuality({ buffer: goodImg, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBeCloseTo(30, 2);
    expect(r.blur.passed).toBe(true);
    expect(r.blur.level).toBe("ok");
    expect(r.blur.message).toBeUndefined();
  });

  it("borde: stdev == 10 exacto NO es borroso → OK (checker(115,135) da stdev 10)", async () => {
    // checker(115,135) → stdev (135-115)/2 ≈ 10 (apenas >= 10, umbral 2026-10-29).
    const img = await checker(120, 115, 135);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBeGreaterThanOrEqual(10);
    expect(r.blur.level).toBe("ok");
  });
});

// ──────────────────────────────────────────────────────────────────
//  4. AGREGACIÓN (pickWorst) + mensaje/recomendación
// ──────────────────────────────────────────────────────────────────

describe("validatePhotoQuality · agregación de nivel", () => {
  it("imagen perfecta (resolución, brillo y blur OK) → level 'ok' sin mensaje", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 600,
      height: 600,
      productSizeCm: "5×5",
    });
    expect(r.resolution.level).toBe("ok");
    expect(r.brightness.level).toBe("ok");
    expect(r.blur.level).toBe("ok");
    expect(r.level).toBe("ok");
    expect(r.message).toBeUndefined();
    expect(r.recommendation).toBeUndefined();
  });

  it("toma el PEOR nivel: resolución error domina sobre brillo/blur OK", async () => {
    const r = await validatePhotoQuality({
      buffer: goodImg, // brillo+blur ok
      width: 100, // 100/591 = 0.169 → error
      height: 100,
      productSizeCm: "5×5",
    });
    expect(r.resolution.level).toBe("error");
    expect(r.level).toBe("error");
    expect(r.message).toBe(r.resolution.message);
    expect(r.message).toContain("Resolución muy baja");
    expect(r.recommendation).toBe("Por favor sube una foto de mayor resolución.");
  });

  it("foto oscura con resolución OK → level ok (la oscuridad ya no se advierte)", async () => {
    const r = await validatePhotoQuality({
      buffer: darkStrongImg, // brillo bajo, blur ok
      width: 600,
      height: 600,
      productSizeCm: "5×5", // resolución ok
    });
    expect(r.level).toBe("ok");
    expect(r.message).toBeUndefined();
    expect(r.recommendation).toBeUndefined();
  });

  it("warning-strong de blur con resolución OK → recommendation de nitidez", async () => {
    const r = await validatePhotoQuality({
      buffer: blurStrongImg, // blur strong, brillo ok
      width: 600,
      height: 600,
      productSizeCm: "5×5",
    });
    expect(r.level).toBe("warning-strong");
    expect(r.message).toBe(r.blur.message);
    expect(r.message).toContain("muy borrosa");
    expect(r.recommendation).toBe("Prueba con una foto más nítida si la tienes.");
  });

  it("mensaje prioriza resolución sobre blur cuando ambos son warning", async () => {
    // resolución warning-soft (450px → ratio 0.761, banda 0.67-0.8 del ajuste
    // 2026-10-29) + blur warning-soft (blurSoftImg, stdev 8).
    // message = resolution.message ?? blur.message → debe ser el de resolución.
    const r = await validatePhotoQuality({
      buffer: blurSoftImg, // blur soft, brillo ok
      width: 450,
      height: 450,
      productSizeCm: "5×5", // resolución soft
    });
    expect(r.resolution.level).toBe("warning-soft");
    expect(r.blur.level).toBe("warning-soft");
    expect(r.level).toBe("warning-soft");
    expect(r.message).toBe(r.resolution.message);
    expect(r.message).toContain("suficiente");
    // recommendation prioriza resolución también.
    expect(r.recommendation).toBe("Una foto más grande va a quedar mejor al imprimir.");
  });

  it("recommendation cae a blur cuando resolución OK pero blur warning (con brillo también warning)", async () => {
    // blurSoftImg es brillo ok; necesitamos blur warning + brillo warning + resolución ok.
    // checker(0,30): mean 15 (antes brillo strong) y stdev 15 (blur OK) — no sirve.
    // Construimos uno: blur soft + brillo soft (zonas quemadas de luz — el
    // aviso de oscura se eliminó 2026-10). Contraste pequeño Y media alta:
    // lo=230 hi=245 → mean 237.5 (soft bright), stdev bajo (soft blur).
    const img = await checker(120, 230, 245); // mean ~237.5 (soft bright), stdev ~7 (soft blur)
    const r = await validatePhotoQuality({
      buffer: img,
      width: 600,
      height: 600,
      productSizeCm: "5×5", // resolución ok
    });
    expect(r.resolution.level).toBe("ok");
    expect(r.brightness.level).toBe("warning-soft");
    expect(r.blur.level).toBe("warning-soft");
    expect(r.level).toBe("warning-soft");
    // message: resolution(undef) ?? blur.message → blur.
    expect(r.message).toBe(r.blur.message);
    // recommendation: resolución ok → blur tiene prioridad sobre brillo.
    expect(r.recommendation).toBe("Prueba con una foto más nítida si la tienes.");
  });
});

// ──────────────────────────────────────────────────────────────────
//  5. SEGURIDAD / ROBUSTEZ — buffers inválidos
// ──────────────────────────────────────────────────────────────────

describe("validatePhotoQuality · robustez frente a buffers inválidos", () => {
  it("buffer basura → sharp lanza → brightness/blur caen a fallback OK (no rompe)", async () => {
    const r = await validatePhotoQuality({
      buffer: garbageImg,
      width: 600,
      height: 600,
      productSizeCm: "5×5",
    });
    // El catch devuelve valores fallback explícitos.
    expect(r.brightness.meanLuminance).toBe(128);
    expect(r.brightness.level).toBe("ok");
    expect(r.brightness.passed).toBe(true);
    expect(r.blur.laplacianStdev).toBe(50);
    expect(r.blur.level).toBe("ok");
    expect(r.blur.passed).toBe(true);
  });

  it("buffer vacío → mismo fallback, sin lanzar (resolución sí se evalúa)", async () => {
    const r = await validatePhotoQuality({
      buffer: Buffer.alloc(0),
      width: 100, // resolución error (100/591)
      height: 100,
      productSizeCm: "5×5",
    });
    // brillo/blur fallback OK pese al buffer vacío.
    expect(r.brightness.level).toBe("ok");
    expect(r.blur.level).toBe("ok");
    // pero la resolución se calcula desde width/height (no del buffer) → error.
    expect(r.resolution.level).toBe("error");
    expect(r.level).toBe("error");
  });

  it("buffer basura pero resolución error → el nivel agregado sigue siendo error", async () => {
    const r = await validatePhotoQuality({
      buffer: garbageImg,
      width: 50,
      height: 50,
      productSizeCm: "5×5",
    });
    expect(r.resolution.level).toBe("error");
    expect(r.level).toBe("error");
    expect(r.recommendation).toBe("Por favor sube una foto de mayor resolución.");
  });
});
