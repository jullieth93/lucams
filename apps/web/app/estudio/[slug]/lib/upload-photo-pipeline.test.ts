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
import {
  buildAssetFormData,
  isTooBigUploadError,
  processPhotoFiles,
  UPLOAD_PIPELINE_CONCURRENCY,
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
    const fd = buildAssetFormData(makeFile("a.jpg"), { designId: "d1", rightsAccepted: true });
    expect(fd.get("file")).toBeInstanceOf(File);
    expect(fd.get("designId")).toBe("d1");
    expect(fd.get("rightsAccepted")).toBe("true");
  });

  it("sin designId no se adjunta el campo", () => {
    const fd = buildAssetFormData(makeFile("a.jpg"), { designId: null, rightsAccepted: false });
    expect(fd.get("designId")).toBeNull();
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
