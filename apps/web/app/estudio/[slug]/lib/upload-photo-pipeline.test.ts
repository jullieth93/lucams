// @vitest-environment jsdom

/*
 * Tests del pipeline unificado de subida de fotos (fix STG 2026-10-05).
 *
 * La Server Action se INYECTA (fake acá) — el módulo no importa código de
 * servidor. El upscale/compresión quedan en early-exit con estos archivos
 * (sin productSizeCm → upscalePhotoForPrint devuelve null sin decodificar;
 * archivos de 1 byte → bajo el umbral del compresor), así que los tests
 * ejercitan la orquestación real sin canvas.
 */

import { describe, expect, it, vi } from "vitest";
import { UPLOAD_PAYLOAD_BUDGET_BYTES } from "@/lib/client-image-compress";
import {
  buildAssetFormData,
  DIRECT_UPLOAD_MAX_BYTES,
  isTooBigUploadError,
  processPhotoFiles,
  UPLOAD_PIPELINE_CONCURRENCY,
  type DirectUploadFn,
  type ProcessedPhoto,
  type UploadAssetFn,
} from "./upload-photo-pipeline";

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/jpeg" });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function okResult(id: string) {
  return {
    ok: true as const,
    assetId: id,
    signedUrl: `https://x/${id}.webp`,
    width: 2000,
    height: 1500,
  };
}

describe("isTooBigUploadError — clasificación de errores del framework", () => {
  it("el 413 traducido por Next (sin '413' en el texto) cuenta como tamaño", () => {
    expect(isTooBigUploadError(1024, "An unexpected response was received from the server")).toBe(
      true,
    );
  });

  it("un archivo sobre el tope del server es tamaño aunque el error no lo diga", () => {
    expect(isTooBigUploadError(11 * 1024 * 1024, "Failed to fetch")).toBe(true);
  });

  it("un corte de red genérico NO es tamaño", () => {
    expect(isTooBigUploadError(1024, "Failed to fetch")).toBe(false);
  });
});

describe("buildAssetFormData", () => {
  it("arma los mismos campos en ambos caminos (sidebar/picker)", () => {
    const fd = buildAssetFormData(makeFile("a.jpg"), {
      designId: "d1",
      rightsAccepted: true,
      productSlug: "fotoimanes-polaroid",
      productSizeCm: "7x9",
    });
    expect(fd.get("file")).toBeInstanceOf(File);
    expect(fd.get("designId")).toBe("d1");
    expect(fd.get("productSlug")).toBe("fotoimanes-polaroid");
    expect(fd.get("productSizeCm")).toBe("7x9");
    expect(fd.get("rightsAccepted")).toBe("true");
  });

  it("sin designId no se adjunta designId pero sí propaga productSlug/productSizeCm para validar 300 DPI en el primer upload ([STU-02])", () => {
    const fd = buildAssetFormData(makeFile("a.jpg"), {
      designId: null,
      rightsAccepted: false,
      productSlug: "calendario-magnetico",
      productSizeCm: "10x15",
    });
    expect(fd.get("designId")).toBeNull();
    expect(fd.get("productSlug")).toBe("calendario-magnetico");
    expect(fd.get("productSizeCm")).toBe("10x15");
    expect(fd.get("rightsAccepted")).toBe("false");
  });
});

describe("processPhotoFiles — orden, concurrencia y aislamiento de fallos", () => {
  it("entrega los resultados EN ORDEN de selección aunque terminen fuera de orden", async () => {
    const files = [makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")];
    const deferreds = files.map(() => deferred<ReturnType<typeof okResult>>());
    const upload = vi.fn<UploadAssetFn>((fd) => {
      const name = (fd.get("file") as File).name;
      const index = files.findIndex((f) => f.name === name);
      return deferreds[index]!.promise;
    });
    const delivered: string[] = [];
    const pending = processPhotoFiles(files, {
      designId: null,
      rightsAccepted: true,
      upload,
      onReady: (o) => delivered.push(o.fileName),
    });
    // Terminan en orden inverso: b y c no se PUBLICAN antes que a.
    deferreds[2]!.resolve(okResult("c"));
    await Promise.resolve();
    deferreds[1]!.resolve(okResult("b"));
    await Promise.resolve();
    expect(delivered).toEqual([]);
    deferreds[0]!.resolve(okResult("a"));
    const outcomes = await pending;
    expect(delivered).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(outcomes.map((o) => o.fileName)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(outcomes.every((o) => o.ok)).toBe(true);
  });

  it("no hay más de UPLOAD_PIPELINE_CONCURRENCY archivos en vuelo", async () => {
    const files = Array.from({ length: 7 }, (_, i) => makeFile(`f${i}.jpg`));
    let inFlight = 0;
    let maxInFlight = 0;
    const upload: UploadAssetFn = async (fd) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return okResult((fd.get("file") as File).name);
    };
    await processPhotoFiles(files, {
      designId: null,
      rightsAccepted: true,
      upload,
      onReady: () => {},
    });
    expect(maxInFlight).toBeLessThanOrEqual(UPLOAD_PIPELINE_CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(1); // de verdad hubo paralelismo
  });

  it("un archivo que falla NO frena a los demás y llega como outcome de error", async () => {
    const files = [makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")];
    const upload: UploadAssetFn = async (fd) => {
      const name = (fd.get("file") as File).name;
      if (name === "b.jpg") throw new TypeError("Failed to fetch");
      return okResult(name);
    };
    const delivered: ProcessedPhoto[] = [];
    const outcomes = await processPhotoFiles(files, {
      designId: null,
      rightsAccepted: true,
      upload,
      onReady: (o) => delivered.push(o),
    });
    expect(delivered).toHaveLength(3);
    expect(outcomes[0]!.ok).toBe(true);
    expect(outcomes[1]).toMatchObject({ ok: false, fileName: "b.jpg", kind: "network" });
    expect(outcomes[2]!.ok).toBe(true);
  });

  it("el 413 del framework (respuesta no-RSC) se clasifica como too-big", async () => {
    const upload: UploadAssetFn = async () => {
      throw new Error("An unexpected response was received from the server");
    };
    const [outcome] = await processPhotoFiles([makeFile("grande.jpg")], {
      designId: null,
      rightsAccepted: true,
      upload,
      onReady: () => {},
    });
    expect(outcome).toMatchObject({ ok: false, kind: "too-big", fileName: "grande.jpg" });
  });

  it("un ok:false de la acción llega como kind 'server' con su mensaje", async () => {
    const upload: UploadAssetFn = async () => ({ ok: false, message: "Metadata inválida" });
    const [outcome] = await processPhotoFiles([makeFile("a.jpg")], {
      designId: null,
      rightsAccepted: true,
      upload,
      onReady: () => {},
    });
    expect(outcome).toMatchObject({
      ok: false,
      kind: "server",
      serverMessage: "Metadata inválida",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reducción obligatoria al presupuesto del payload + fail-closed (2026-10-13).
//
// En jsdom no existe createImageBitmap ni canvas 2D: cualquier archivo sobre el
// presupuesto NO se puede reducir acá (compress fail-open al original, shrink
// devuelve null), así que estos tests ejercitan el camino FAIL-CLOSED real —
// el mismo que toma un HEIC >4 MB en Chrome/Firefox en producción.
// ─────────────────────────────────────────────────────────────────────────────

describe("processPhotoFiles — presupuesto del payload (fail-closed honesto)", () => {
  const overBudget = UPLOAD_PAYLOAD_BUDGET_BYTES + 1;

  it("un archivo que no cabe NI reducido NO se sube: outcome too-big sin llamar la acción", async () => {
    // HEIC grande (el caso real del bug): jsdom no lo decodifica, igual que
    // Chrome/Firefox → shrink imposible → fail-closed ANTES del 413 de Vercel.
    const big = new File([new Uint8Array(overBudget)], "foto-heic-grande.heic", {
      type: "image/heic",
    });
    const upload = vi.fn<UploadAssetFn>();

    const [outcome] = await processPhotoFiles([big], {
      designId: null,
      rightsAccepted: true,
      upload,
      onReady: () => {},
    });

    expect(outcome).toMatchObject({
      ok: false,
      kind: "too-big",
      fileName: "foto-heic-grande.heic",
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("un JPEG sobre el presupuesto e irreductible acá también cae fail-closed (no 413)", async () => {
    const big = new File([new Uint8Array(overBudget)], "grande.jpg", { type: "image/jpeg" });
    const upload = vi.fn<UploadAssetFn>();

    const [outcome] = await processPhotoFiles([big], {
      designId: null,
      rightsAccepted: true,
      productSizeCm: "15×15", // con contexto de producto: el piso DPI no salva lo indecodificable
      upload,
      onReady: () => {},
    });

    expect(outcome).toMatchObject({ ok: false, kind: "too-big" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("los archivos que SÍ caben en el mismo lote se suben igual (aislamiento de fallos)", async () => {
    const big = new File([new Uint8Array(overBudget)], "grande.heic", { type: "image/heic" });
    const ok = makeFile("chica.jpg");
    const upload = vi.fn<UploadAssetFn>(async (fd) => okResult((fd.get("file") as File).name));

    const outcomes = await processPhotoFiles([big, ok], {
      designId: null,
      rightsAccepted: true,
      upload,
      onReady: () => {},
    });

    expect(outcomes[0]).toMatchObject({ ok: false, kind: "too-big" });
    expect(outcomes[1]).toMatchObject({ ok: true, fileName: "chica.jpg" });
    // Solo se subió la que cabe.
    expect(upload).toHaveBeenCalledTimes(1);
    expect(((upload.mock.calls[0]![0] as FormData).get("file") as File).name).toBe("chica.jpg");
  });

  it("un archivo justo EN el presupuesto pasa sin reducción obligatoria", async () => {
    const exact = new File([new Uint8Array(UPLOAD_PAYLOAD_BUDGET_BYTES)], "exacta.jpg", {
      type: "image/jpeg",
    });
    const upload = vi.fn<UploadAssetFn>(async () => okResult("exacta.jpg"));

    const [outcome] = await processPhotoFiles([exact], {
      designId: null,
      rightsAccepted: true,
      upload,
      onReady: () => {},
    });

    expect(outcome.ok).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fallback de subida DIRECTA a Storage (auditoría 2026-11-08): un HEIC
// ~4.5–10 MB que el navegador no decodifica (jsdom = mismo comportamiento) ya
// no muere fail-closed: viaja ORIGINAL por ticket firmado + PUT + ingest.
// ─────────────────────────────────────────────────────────────────────────────

describe("processPhotoFiles — fallback HEIC de subida directa (2026-11-08)", () => {
  const overBudget = UPLOAD_PAYLOAD_BUDGET_BYTES + 1;

  it("un HEIC que no cabe ni se reduce va por la subida directa con el archivo ORIGINAL", async () => {
    const big = new File([new Uint8Array(overBudget)], "foto.heic", { type: "image/heic" });
    const upload = vi.fn<UploadAssetFn>();
    const uploadDirect = vi.fn<DirectUploadFn>(async () => okResult("direct-1"));

    const [outcome] = await processPhotoFiles([big], {
      designId: "d1",
      rightsAccepted: true,
      upload,
      uploadDirect,
      onReady: () => {},
    });

    expect(outcome).toMatchObject({ ok: true, fileName: "foto.heic", improved: false });
    expect(upload).not.toHaveBeenCalled();
    expect(uploadDirect).toHaveBeenCalledTimes(1);
    // El archivo ORIGINAL, sin preparar (el servidor lo normaliza al ingerir).
    expect((uploadDirect.mock.calls[0]![0] as File).size).toBe(overBudget);
    expect(uploadDirect.mock.calls[0]![1]).toMatchObject({ designId: "d1", rightsAccepted: true });
  });

  it("HEIC por extensión (file.type vacío de iOS) también toma la subida directa", async () => {
    const big = new File([new Uint8Array(overBudget)], "IMG_1234.HEIC", { type: "" });
    const upload = vi.fn<UploadAssetFn>();
    const uploadDirect = vi.fn<DirectUploadFn>(async () => okResult("direct-2"));

    const [outcome] = await processPhotoFiles([big], {
      designId: null,
      rightsAccepted: true,
      upload,
      uploadDirect,
      onReady: () => {},
    });

    expect(outcome.ok).toBe(true);
    expect(uploadDirect).toHaveBeenCalledTimes(1);
  });

  it("un HEIC sobre el tope del bucket (10 MB) NO usa la subida directa: fail-closed", async () => {
    const huge = new File([new Uint8Array(DIRECT_UPLOAD_MAX_BYTES + 1)], "enorme.heic", {
      type: "image/heic",
    });
    const upload = vi.fn<UploadAssetFn>();
    const uploadDirect = vi.fn<DirectUploadFn>();

    const [outcome] = await processPhotoFiles([huge], {
      designId: null,
      rightsAccepted: true,
      upload,
      uploadDirect,
      onReady: () => {},
    });

    expect(outcome).toMatchObject({ ok: false, kind: "too-big" });
    expect(upload).not.toHaveBeenCalled();
    expect(uploadDirect).not.toHaveBeenCalled();
  });

  it("un JPEG grande irreductible NO usa la subida directa (fail-closed como antes)", async () => {
    const big = new File([new Uint8Array(overBudget)], "grande.jpg", { type: "image/jpeg" });
    const upload = vi.fn<UploadAssetFn>();
    const uploadDirect = vi.fn<DirectUploadFn>();

    const [outcome] = await processPhotoFiles([big], {
      designId: null,
      rightsAccepted: true,
      upload,
      uploadDirect,
      onReady: () => {},
    });

    expect(outcome).toMatchObject({ ok: false, kind: "too-big" });
    expect(upload).not.toHaveBeenCalled();
    expect(uploadDirect).not.toHaveBeenCalled();
  });

  it("ok:false de la subida directa llega como kind server; una excepción, como network", async () => {
    const big = new File([new Uint8Array(overBudget)], "foto.heic", { type: "image/heic" });
    const upload = vi.fn<UploadAssetFn>();
    const rejected = vi.fn<DirectUploadFn>(async () => ({ ok: false, message: "rate limit" }));
    const crashed = vi.fn<DirectUploadFn>(async () => {
      throw new TypeError("Failed to fetch");
    });

    const [serverOutcome] = await processPhotoFiles([big], {
      designId: null,
      rightsAccepted: true,
      upload,
      uploadDirect: rejected,
      onReady: () => {},
    });
    expect(serverOutcome).toMatchObject({ ok: false, kind: "server", serverMessage: "rate limit" });

    const [networkOutcome] = await processPhotoFiles([big], {
      designId: null,
      rightsAccepted: true,
      upload,
      uploadDirect: crashed,
      onReady: () => {},
    });
    expect(networkOutcome).toMatchObject({ ok: false, kind: "network" });
    expect(upload).not.toHaveBeenCalled();
  });
});
