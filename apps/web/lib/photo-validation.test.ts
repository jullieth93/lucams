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
let darkStrongImg: Buffer; // mean 20  → too dark (warning-strong)
let darkSoftImg: Buffer; //   mean 35  → dark    (warning-soft)
let brightSoftImg: Buffer; // mean 237.5 → over-bright (warning-soft)
// Blur controlado, brillo SIEMPRE OK (~130), para aislar el check de blur.
let blurStrongImg: Buffer; // stdev 4  → very blurry (warning-strong)
let blurSoftImg: Buffer; //   stdev 10 → blurry    (warning-soft)
// Gris sólido brillo OK → blur stdev 0 (very blurry).
let solidOkBrightnessImg: Buffer;
// Basura para forzar el catch de sharp.
const garbageImg = Buffer.from("definitely-not-an-image-just-text-bytes");

beforeAll(async () => {
  goodImg = await checker(120, 100, 160); // mean 130, stdev 30
  darkStrongImg = await checker(120, 0, 40); // mean 20, stdev 20 (blur ok)
  darkSoftImg = await checker(120, 20, 50); // mean 35, stdev 15 (blur ok, en el límite)
  brightSoftImg = await checker(120, 220, 255); // mean 237.5, stdev 17.5 (blur ok)
  blurStrongImg = await checker(120, 126, 134); // mean 130, stdev 4
  blurSoftImg = await checker(120, 120, 140); // mean 130, stdev 10
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

  it("0.8 <= ratio < 1.0 → warning-soft (justa)", async () => {
    // requiredPx 591; 590/591 = 0.9983 (<1, >=0.8)
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 590,
      height: 590,
      productSizeCm: "5×5",
    });
    expect(r.resolution.level).toBe("warning-soft");
    expect(r.resolution.passed).toBe(false);
    expect(r.resolution.message).toContain("justa");
  });

  it("borde: ratio == 0.8 exacto NO es warning-strong, es warning-soft", async () => {
    // Necesitamos actualMinPx/requiredPx == 0.8 exacto. requiredPx 591 no da
    // entero a 0.8 (472.8). Usamos 15cm → requiredPx 1772; 1772*0.8 = 1417.6.
    // En su lugar elegimos un requiredPx divisible: 7cm → 827; 827*0.8=661.6.
    // Más simple: el código usa "< WARNING_STRONG_BELOW (0.8)" para strong.
    // ratio exactamente 0.8 cae en la rama soft. Probamos con un requiredPx
    // que dé 0.8 entero: requiredPx debe ser múltiplo de 5. 591 no lo es,
    // pero podemos verificar la semántica con ratio apenas >= 0.8.
    // 473/591 = 0.80033 → soft (>= 0.8).
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 473,
      height: 473,
      productSizeCm: "5×5",
    });
    expect(r.resolution.ratio).toBeGreaterThanOrEqual(0.8);
    expect(r.resolution.level).toBe("warning-soft");
  });

  it("0.5 <= ratio < 0.8 → warning-strong (pixelada)", async () => {
    // 472/591 = 0.7986 (< 0.8, >= 0.5)
    const r = await validatePhotoQuality({
      buffer: goodImg,
      width: 472,
      height: 472,
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
  it("meanLuminance < 25 → warning-strong (muy oscura)", async () => {
    const r = await validatePhotoQuality({ buffer: darkStrongImg, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBeCloseTo(20, 5);
    expect(r.brightness.level).toBe("warning-strong");
    expect(r.brightness.passed).toBe(false);
    expect(r.brightness.message).toContain("muy oscura");
  });

  it("borde: meanLuminance == 25 NO es muy oscura, es oscura soft", async () => {
    // solid 25 → mean exactamente 25. 25 NO es < 25 → cae a la rama < 50 (soft).
    const img = await solidGray(50, 25);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(25);
    expect(r.brightness.level).toBe("warning-soft");
    expect(r.brightness.message).toContain("algo oscura");
  });

  it("borde: meanLuminance == 24 SÍ es muy oscura (warning-strong)", async () => {
    const img = await solidGray(50, 24);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(24);
    expect(r.brightness.level).toBe("warning-strong");
  });

  it("25 <= meanLuminance < 50 → warning-soft (oscura)", async () => {
    const r = await validatePhotoQuality({ buffer: darkSoftImg, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBeCloseTo(35, 5);
    expect(r.brightness.level).toBe("warning-soft");
    expect(r.brightness.message).toContain("algo oscura");
  });

  it("borde: meanLuminance == 50 NO es oscura → OK", async () => {
    const img = await solidGray(50, 50);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(50);
    expect(r.brightness.passed).toBe(true);
    expect(r.brightness.level).toBe("ok");
  });

  it("borde: meanLuminance == 49 SÍ es oscura (warning-soft)", async () => {
    const img = await solidGray(50, 49);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(49);
    expect(r.brightness.level).toBe("warning-soft");
  });

  it("meanLuminance > 235 → warning-soft (sobreexpuesta)", async () => {
    const r = await validatePhotoQuality({ buffer: brightSoftImg, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBeCloseTo(237.5, 4);
    expect(r.brightness.level).toBe("warning-soft");
    expect(r.brightness.message).toContain("sobreexpuesta");
  });

  it("borde: meanLuminance == 235 NO es sobreexpuesta → OK", async () => {
    const img = await solidGray(50, 235);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(235);
    expect(r.brightness.passed).toBe(true);
    expect(r.brightness.level).toBe("ok");
  });

  it("borde: meanLuminance == 236 SÍ es sobreexpuesta (warning-soft)", async () => {
    const img = await solidGray(50, 236);
    const r = await validatePhotoQuality({ buffer: img, width: 600, height: 600 });
    expect(r.brightness.meanLuminance).toBe(236);
    expect(r.brightness.level).toBe("warning-soft");
    expect(r.brightness.message).toContain("sobreexpuesta");
  });

  it("brillo medio (50..235) → OK sin mensaje", async () => {
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
  it("stdev < 5 → warning-strong (muy borrosa)", async () => {
    const r = await validatePhotoQuality({ buffer: blurStrongImg, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBeCloseTo(4, 3);
    expect(r.blur.level).toBe("warning-strong");
    expect(r.blur.passed).toBe(false);
    expect(r.blur.message).toContain("muy borrosa");
  });

  it("imagen de color sólido (sin bordes) → stdev 0 → muy borrosa", async () => {
    const r = await validatePhotoQuality({ buffer: solidOkBrightnessImg, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBe(0);
    expect(r.blur.level).toBe("warning-strong");
  });

  it("5 <= stdev < 15 → warning-soft (poca nitidez)", async () => {
    const r = await validatePhotoQuality({ buffer: blurSoftImg, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBeCloseTo(10, 3);
    expect(r.blur.level).toBe("warning-soft");
    expect(r.blur.message).toContain("poca nitidez");
  });

  it("stdev >= 15 → OK (nítida)", async () => {
    const r = await validatePhotoQuality({ buffer: goodImg, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBeCloseTo(30, 2);
    expect(r.blur.passed).toBe(true);
    expect(r.blur.level).toBe("ok");
    expect(r.blur.message).toBeUndefined();
  });

  it("borde: stdev == 15 exacto NO es borroso → OK (darkSoftImg tiene stdev 15)", async () => {
    // darkSoftImg = checker(20,50) → stdev (50-20)/2 ≈ 15.0005 (apenas >= 15).
    const r = await validatePhotoQuality({ buffer: darkSoftImg, width: 600, height: 600 });
    expect(r.blur.laplacianStdev).toBeCloseTo(15, 2);
    expect(r.blur.laplacianStdev).toBeGreaterThanOrEqual(15);
    // 15 NO es < 15 → blur OK.
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

  it("warning-strong de brillo domina sobre resolución OK → level warning-strong", async () => {
    const r = await validatePhotoQuality({
      buffer: darkStrongImg, // brillo strong, blur ok
      width: 600,
      height: 600,
      productSizeCm: "5×5", // resolución ok
    });
    expect(r.level).toBe("warning-strong");
    // resolución ok (sin mensaje) y blur ok (sin mensaje) → message cae a brightness.
    expect(r.message).toBe(r.brightness.message);
    expect(r.message).toContain("muy oscura");
    expect(r.recommendation).toBe("Una foto con más luz va a verse mejor.");
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
    // resolución warning-soft (590px) + blur warning-soft (blurSoftImg).
    // message = resolution.message ?? blur.message → debe ser el de resolución.
    const r = await validatePhotoQuality({
      buffer: blurSoftImg, // blur soft, brillo ok
      width: 590,
      height: 590,
      productSizeCm: "5×5", // resolución soft
    });
    expect(r.resolution.level).toBe("warning-soft");
    expect(r.blur.level).toBe("warning-soft");
    expect(r.level).toBe("warning-soft");
    expect(r.message).toBe(r.resolution.message);
    expect(r.message).toContain("justa");
    // recommendation prioriza resolución también.
    expect(r.recommendation).toBe("Una foto más grande va a quedar mejor al imprimir.");
  });

  it("recommendation cae a blur cuando resolución OK pero blur warning (con brillo también warning)", async () => {
    // blurSoftImg es brillo ok; necesitamos blur warning + brillo warning + resolución ok.
    // checker(0,40): mean 20 (brillo strong) y stdev 20 (blur OK) — no sirve.
    // Construimos uno: blur soft + brillo soft. checker brillo oscuro soft (mean 35)
    // implica lo=20 hi=50 → stdev 15 (blur ok). Para blur soft Y brillo soft a la vez
    // se necesita contraste pequeño Y media baja: lo=30 hi=40 → mean 35, stdev 5.
    const img = await checker(120, 30, 40); // mean 35 (soft dark), stdev 5 (soft blur)
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
