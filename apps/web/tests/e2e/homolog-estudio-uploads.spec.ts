/*
 * HOMOLOGACIÓN E2E — matriz de uploads del Estudio (docs/TESTING.md +
 * regresiones permanentes: HEIC iPhone, compresión cliente >4.5 MB, UI muda
 * ante fallos):
 *
 *   consentimiento Ley 1581 OBLIGATORIO para subir → JPG / PNG / WebP / HEIC
 *   (transcodifica a JPEG server-side) / >4.5 MB (compresión cliente → JPEG
 *   ≤2400px y <4 MB en DB) / >10 MB (rechazo visible, sin asset) / no-imagen
 *   renombrada (rechazo por magic bytes con mensaje, sin asset).
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (crea assets y
 * objetos en storage). Producto real de fotos leído de la DB del ambiente
 * (primer PHOTO_PACK activo). Assets/objetos generados se borran en afterAll
 * (los paths exactos salen de las filas DesignAsset creadas en la ventana de
 * la corrida). Evidencia: JSON + screenshots por corrida.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { strip } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");
const HEIC_FIXTURE = resolve(__dirname, "../fixtures/sample.heic");

const MB = 1024 * 1024;
const run = newRunId("upload");
const uploadsDir = resolve(EVIDENCE_DIR, "uploads", run);

let slug = "";
let windowStart = 0;
/** Paths de storage creados en la corrida (se borran en afterAll). */
const createdAssetIds: string[] = [];
const createdStoragePaths: string[] = [];

type Generated = {
  smallJpg: string;
  smallPng: string;
  smallWebp: string;
  bigJpg: string;
  bigJpgBytes: number;
  bigHeic: { name: string; mimeType: string; buffer: Buffer };
  bigHeicBytes: number;
  fakeJpg: { name: string; mimeType: string; buffer: Buffer };
};

test.skip(E2E_ENV === "prd", "La matriz de uploads crea assets/objetos: prohibida en PRD.");
test.setTimeout(300_000);

async function generateFixtures(): Promise<Generated> {
  mkdirSync(uploadsDir, { recursive: true });
  // Rasters válidos (~800×600, <1 MB) en los 3 formatos soportados.
  const base = {
    create: {
      width: 800,
      height: 600,
      channels: 3 as const,
      background: { r: 160, g: 110, b: 90 },
    },
  };
  const smallJpg = resolve(uploadsDir, "foto-ok.jpg");
  const smallPng = resolve(uploadsDir, "foto-ok.png");
  const smallWebp = resolve(uploadsDir, "foto-ok.webp");
  await sharp(base).jpeg({ quality: 85 }).toFile(smallJpg);
  await sharp(base).png().toFile(smallPng);
  await sharp(base).webp({ quality: 85 }).toFile(smallWebp);

  // Foto "full-res" >4.5 MB: píxeles aleatorios son incompresibles → JPEG
  // grande (mimo del caso real iPhone 8.23 MB del bug 2026-08-05).
  const bigJpg = resolve(uploadsDir, "foto-grande.jpg");
  const { randomBytes } = await import("node:crypto");
  const bigW = 4200;
  const bigH = 3200;
  const pixels = randomBytes(bigW * bigH * 3);
  await sharp(pixels, { raw: { width: bigW, height: bigH, channels: 3 } })
    .jpeg({ quality: 92 })
    .toFile(bigJpg);
  const bigJpgBytes = readFileSync(bigJpg).length;
  if (bigJpgBytes <= 4.5 * MB) {
    throw new Error(`fixture big.jpg quedó en ${bigJpgBytes} bytes (se esperaba >4.5 MB)`);
  }

  // HEIC >10 MB: el fixture real sample.heic + padding (el cliente NO comprime
  // HEIC → llega entero al servidor → metadata Zod lo rechaza por tamaño).
  const heicBuf = readFileSync(HEIC_FIXTURE);
  const pad = Buffer.alloc(11 * MB - heicBuf.length, 0);
  const bigHeicBuffer = Buffer.concat([heicBuf, pad]);

  // No-imagen renombrada: texto con nombre .jpg (magic bytes delatan).
  const fakeJpg = {
    name: "foto-falsa.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("esto NO es una imagen — es un archivo de texto renombrado", "utf8"),
  };

  return {
    smallJpg,
    smallPng,
    smallWebp,
    bigJpg,
    bigJpgBytes,
    bigHeic: { name: "foto-iphone-heic.heic", mimeType: "image/heic", buffer: bigHeicBuffer },
    bigHeicBytes: bigHeicBuffer.length,
    fakeJpg,
  };
}

test.beforeAll(async () => {
  // Producto real de fotos desde la DB del ambiente (nada hardcodeado).
  const product = await db().product.findFirst({
    where: { personalizationKind: "PHOTO_PACK", isActive: true, deletedAt: null },
    select: { slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!product) throw new Error(`no hay producto PHOTO_PACK activo en la DB de ${E2E_ENV}`);
  slug = product.slug;
  console.log(`[uploads] producto del ambiente: ${slug} (${product.name})`);
});

test.afterAll(async () => {
  // Limpieza exacta: los assets/objetos creados en la ventana de la corrida.
  if (createdAssetIds.length > 0) {
    await db()
      .designAsset.deleteMany({ where: { id: { in: createdAssetIds } } })
      .catch(() => {});
  }
  if (createdStoragePaths.length > 0) {
    const storage = createClient(
      strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      strip(process.env.SUPABASE_SECRET_KEY)!,
      { auth: { persistSession: false } },
    );
    await storage.storage
      .from("customer-uploads")
      .remove(createdStoragePaths)
      .catch(() => {});
  }
  await disconnectDb();
});

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

test("matriz de uploads del Estudio: consent + JPG/PNG/WebP/HEIC/>4.5MB/>10MB/no-imagen", async ({
  anonPage,
}, testInfo) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shotsDir = resolve(EVIDENCE_DIR, "shots");
  mkdirSync(shotsDir, { recursive: true });
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const steps: Step[] = [];
  const record = (step: string, ok: boolean, detail?: string, screenshot?: string) =>
    steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
  const shot = async (page: Page, name: string) => {
    const path = resolve(shotsDir, `${E2E_ENV}-${testInfo.project.name}-${run}-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
  };

  const fx = await generateFixtures();
  windowStart = Date.now();

  try {
    // 0. Estudio carga (Konva monta canvas) con el onboarding ya resuelto.
    await anonPage.addInitScript(() => {
      try {
        window.localStorage.setItem("lucams_studio_onboarded", "v1");
      } catch {
        /* noop */
      }
    });
    await anonPage.goto(`/estudio/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(anonPage.locator("canvas").first()).toBeVisible({ timeout: 60_000 });

    // Banner de cookies (Ley 1581): en mobile queda fijo abajo y TAPA el FAB de
    // edición (click interceptado hasta timeout — reproducido 2026-08-06). Se
    // cierra por la vía del usuario si aparece.
    const cookieReject = anonPage.getByRole("button", { name: /solo necesarias/i });
    if (await cookieReject.isVisible().catch(() => false)) {
      await cookieReject.click();
      record(
        "cookie-banner-dismissed",
        true,
        "banner cerrado con 'Solo necesarias' (tapaba el FAB en mobile)",
      );
    }

    // Panel de edición: desktop = sidebar aside; mobile = el MISMO StudioSidebar
    // dentro de un Sheet que abre el FAB "Editar" (studio-editor.tsx A2.8).
    let panel = anonPage.locator('aside[aria-label="Herramientas del Estudio"]');
    if (!(await panel.isVisible())) {
      await anonPage
        .getByRole("button", { name: /abre las herramientas de plantillas y fotos/i })
        .click();
      panel = anonPage.locator('[role="dialog"]');
      await expect(panel).toBeVisible({ timeout: 10_000 });
      record("studio-sheet-mobile", true, "sidebar abierto vía FAB + Sheet (mobile)");
    }
    record("studio-loaded", true, slug, await shot(anonPage, "0-studio"));

    // 1. Consentimiento Ley 1581 OBLIGATORIO: el CTA de subir está deshabilitado
    // hasta marcar la casilla de derechos de imagen.
    const uploadBtn = panel.getByLabel("Subir foto desde el dispositivo");
    const fileInput = panel.locator('input[type="file"]').first();
    const rightsCheckbox = panel.locator('input[type="checkbox"]').first();
    await expect(uploadBtn).toBeDisabled();
    await rightsCheckbox.check();
    await expect(uploadBtn).toBeEnabled();
    record("consent-required", true, "CTA subir deshabilitado hasta aceptar derechos de imagen");

    const assetsList = panel.locator('div[role="list"]');
    const alert = panel.locator('p[role="alert"]');
    const thumbCount = async () =>
      (await assetsList.count()) === 0 ? 0 : assetsList.locator("img").count();

    /** Sube un archivo y verifica el thumbnail nuevo. Un banner de CALIDAD
     * (DPI/brillo) puede aparecer legítimamente: se registra, no es rechazo. */
    async function uploadOk(
      payload: string | { name: string; mimeType: string; buffer: Buffer },
      label: string,
    ) {
      const before = await thumbCount();
      await fileInput.setInputFiles(payload as string);
      await expect(async () => {
        expect(await thumbCount(), `thumbnail nuevo tras subir ${label}`).toBe(before + 1);
      }).toPass({ timeout: 30_000 });
      // Nivel píxel: el <img> existe Y carga (naturalWidth > 0). Contar solo el
      // elemento dejaba pasar la CSP-bloqueada de 2026-08-07 (img-src sin el
      // origen del stack local: el thumb estaba en el DOM pero en blanco).
      const thumb = assetsList.locator("img").first();
      await expect(async () => {
        const w = await thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth);
        expect(w, `el thumbnail ${label} carga píxeles (no bloqueado por CSP)`).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000 });
      const warn = (await alert.count()) > 0 ? (await alert.innerText()).trim() : null;
      if (warn) record(`upload-quality-warning-${label}`, true, warn);
    }

    /** Verifica un rechazo visible y que NO apareció thumbnail. */
    async function uploadRejected(
      payload: { name: string; mimeType: string; buffer: Buffer },
      label: string,
      expectMessage?: RegExp,
    ) {
      const before = await thumbCount();
      await fileInput.setInputFiles(payload);
      await expect(alert, `alerta visible tras subir ${label}`).toBeVisible({ timeout: 30_000 });
      const msg = (await alert.innerText()).trim();
      if (expectMessage) expect(msg).toMatch(expectMessage);
      expect(await thumbCount(), `sin thumbnail nuevo tras rechazar ${label}`).toBe(before);
      return msg;
    }

    // 2. JPG válido.
    await uploadOk(fx.smallJpg, "JPG");
    record("upload-jpg", true);

    // 3. PNG válido.
    await uploadOk(fx.smallPng, "PNG");
    record("upload-png", true);

    // 4. WebP válido.
    await uploadOk(fx.smallWebp, "WebP");
    record("upload-webp", true);

    // 5. HEIC de iPhone (fixture real) → el server transcodifica (regresión §4b).
    // El payload lleva mime explícito: el browser no infiere image/heic por extensión.
    await uploadOk(
      {
        name: "IMG_2026.heic",
        mimeType: "image/heic",
        buffer: readFileSync(HEIC_FIXTURE),
      },
      "HEIC",
    );
    record("upload-heic", true, undefined, await shot(anonPage, "1-heic-thumb"));

    // 6. >4.5 MB → compresión cliente (regresión §4c): en DB JPEG ≤2400px y <4 MB.
    await uploadOk(fx.bigJpg, ">4.5MB");
    record("upload-big-compressed", true, `original ${(fx.bigJpgBytes / MB).toFixed(2)} MB`);

    // 7. >10 MB (HEIC sin compresión cliente) → rechazo visible, sin asset.
    const bigMsg = await uploadRejected(fx.bigHeic, ">10MB");
    record(
      "reject-over-10mb",
      true,
      `${(fx.bigHeicBytes / MB).toFixed(1)} MB → mensaje: "${bigMsg}"`,
      await shot(anonPage, "2-reject-10mb"),
    );

    // 8. No-imagen renombrada → rechazo por magic bytes, con mensaje claro.
    const fakeMsg = await uploadRejected(fx.fakeJpg, "no-imagen", /no es una imagen válida/i);
    record(
      "reject-non-image",
      true,
      `mensaje: "${fakeMsg}"`,
      await shot(anonPage, "3-reject-fake"),
    );

    // 9. Verificación DB de la ventana de la corrida: exactamente 5 assets,
    // en orden, con los formatos esperados (HEIC→JPEG transcodificado) y la
    // compresión del grande aplicada (≤2400px, <4 MB).
    const assets = await db().designAsset.findMany({
      where: { createdAt: { gte: new Date(windowStart) } },
      orderBy: { createdAt: "asc" },
    });
    expect(assets, "5 assets en la ventana de la corrida (ni más ni menos)").toHaveLength(5);
    createdAssetIds.push(...assets.map((a) => a.id));
    createdStoragePaths.push(...assets.map((a) => a.storageUrl));

    const [jpg, png, webp, heic, big] = assets;
    expect(jpg!.mimeType).toBe("image/jpeg");
    expect(png!.mimeType).toBe("image/png");
    expect(webp!.mimeType).toBe("image/webp");
    expect(heic!.mimeType, "el HEIC quedó transcodificado a JPEG").toBe("image/jpeg");
    record(
      "db-formats",
      true,
      `jpg=${jpg!.mimeType} png=${png!.mimeType} webp=${webp!.mimeType} heic→${heic!.mimeType}`,
    );
    expect(big!.mimeType).toBe("image/jpeg");
    expect(Math.max(big!.width, big!.height)).toBeLessThanOrEqual(2400);
    expect(big!.sizeBytes).toBeLessThan(4 * MB);
    record(
      "db-compression",
      true,
      `${(fx.bigJpgBytes / MB).toFixed(2)} MB → ${(big!.sizeBytes / MB).toFixed(2)} MB · ${big!.width}×${big!.height}px`,
      await shot(anonPage, "4-assets-list"),
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-estudio-uploads",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          product: slug,
          status: "pass",
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia uploads: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-estudio-uploads",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          product: slug,
          status: "fail",
          error: String(err),
          steps,
        },
        null,
        2,
      ),
    );
    throw err;
  }
});
