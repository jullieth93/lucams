/*
 * Test de SEGURIDAD para lib/storage.ts — validación de MIME por magic bytes
 * (Bloque C / F1). El cliente puede falsificar `file.type`; la defensa real es
 * leer los magic bytes del archivo (`sniffImageMime`) y FORZARLOS como
 * contentType en el upload (anti-polyglot / anti-XSS). Si los bytes reales no
 * corresponden a una imagen permitida, el upload se rechaza con INVALID_TYPE.
 *
 * FOCO:
 *  - Bytes reales de JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A),
 *    WebP (RIFF....WEBP), AVIF (....ftyp + brand avif/avis) → ACEPTADOS, y el
 *    contentType del upload se fuerza al MIME REAL detectado (no al declarado).
 *  - Mismatch peligroso: `file.type` declarado permitido (ej image/png) pero los
 *    bytes son HTML / GIF / SVG / WAV / MP4-isom → RECHAZADO en el magic gate.
 *  - Mismatch benigno: declarado image/png pero bytes JPEG reales → ACEPTADO,
 *    porque ambos están en la allow-list; el código confía en los bytes (ext y
 *    contentType salen del MIME real = image/jpeg). Comportamiento documentado.
 *  - Archivo vacío → EMPTY_FILE (antes de mirar MIME).
 *  - Archivo demasiado grande → FILE_TOO_LARGE (antes de mirar MIME).
 *  - Archivo truncado/corrupto (<12 bytes, o header parcial) → INVALID_TYPE.
 *
 * ESTRATEGIA: mock de fetch NO aplica aquí. La única dependencia de red es
 * Supabase Storage; la mockeamos (`@/lib/supabase/service`) para aislar la
 * validación PURA de bytes y NO tocar ningún bucket real. `server-only` lo
 * stubea vitest.config.ts. No es DB-coupled.
 *
 * Comportamiento verificado contra el código real con probes temporales antes
 * de fijar las aserciones (mensajes de error y contentType forzado incluidos).
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock de Supabase Storage ────────────────────────────────────────────────
// Capturamos las llamadas a upload/getPublicUrl/remove para afirmar el
// contentType FORZADO y los paths, sin tocar Supabase real. Usamos vi.hoisted
// para que los mocks existan ANTES de que la factory de vi.mock (hoisteada) los
// referencie, y a la vez sean accesibles desde el cuerpo del test.
const { uploadMock, getPublicUrlMock, removeMock, createSignedUrlMock, fromMock } = vi.hoisted(
  () => {
    const uploadMock = vi.fn(
      async (
        _path: string,
        _body: Buffer,
        _opts?: { contentType?: string; upsert?: boolean; metadata?: Record<string, unknown> },
      ) => ({ error: null as { message: string } | null }),
    );
    const getPublicUrlMock = vi.fn((path: string) => ({
      data: {
        publicUrl: `https://ref.supabase.co/storage/v1/object/public/product-images/${path}`,
      },
    }));
    const removeMock = vi.fn(async (_paths: string[]) => ({
      error: null as { message: string } | null,
    }));
    // createSignedUrl: el happy path de uploadCustomerPhoto / refresh lo invoca
    // para devolver una URL firmada (TTL 1h). Sin esto, la función lanzaba un
    // TypeError ("createSignedUrl is not a function") y su camino feliz NUNCA se
    // ejercitaba. Devolvemos data.signedUrl derivada del path para poder afirmar
    // que el resultado expone exactamente la URL que vino del backend.
    const createSignedUrlMock = vi.fn(
      async (
        path: string,
        _expiresIn: number,
      ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }> => ({
        data: { signedUrl: `https://ref.supabase.co/sign/${path}?token=tok` },
        error: null,
      }),
    );
    const fromMock = vi.fn(() => ({
      upload: uploadMock,
      getPublicUrl: getPublicUrlMock,
      remove: removeMock,
      createSignedUrl: createSignedUrlMock,
    }));
    return { uploadMock, getPublicUrlMock, removeMock, createSignedUrlMock, fromMock };
  },
);

vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: fromMock } },
}));

import sharp from "sharp";
import {
  StorageError,
  deleteProductImage,
  refreshCustomerUploadSignedUrl,
  uploadCustomerPhoto,
  uploadProductImage,
} from "./storage";

// ── Builders de magic bytes ─────────────────────────────────────────────────
// El sniffer requiere >= 12 bytes, así que rellenamos con padding tras el header.

function pad(header: number[] | Buffer, totalLen = 32): Buffer {
  const head = Buffer.isBuffer(header) ? header : Buffer.from(header);
  if (head.length >= totalLen) return head;
  return Buffer.concat([head, Buffer.alloc(totalLen - head.length)]);
}

/** JPEG: FF D8 FF E0 (JFIF) */
const JPEG_BYTES = pad([0xff, 0xd8, 0xff, 0xe0]);
/** PNG: 89 50 4E 47 0D 0A 1A 0A */
const PNG_BYTES = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** WebP: "RIFF" <4 bytes size> "WEBP" */
const WEBP_BYTES = pad(
  Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0x00, 0x00, 0x00]), Buffer.from("WEBP")]),
);
/** AVIF: <4 bytes> "ftyp" "avif" */
const AVIF_BYTES = pad(
  Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x20]), Buffer.from("ftyp"), Buffer.from("avif")]),
);
/** AVIF brand "avis" (image sequence) — también aceptado. */
const AVIS_BYTES = pad(
  Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x20]), Buffer.from("ftyp"), Buffer.from("avis")]),
);

// Bytes NO permitidos (polyglots / disfraces).
const HTML_BYTES = pad(Buffer.from("<!DOCTYPE html><script>alert(1)</script>"));
const SVG_BYTES = pad(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'));
const GIF_BYTES = pad(Buffer.from("GIF89a")); // GIF está fuera de la allow-list
/** RIFF pero NO WebP (ej WAV: "RIFF"...."WAVE") → debe rechazarse. */
const WAV_BYTES = pad(
  Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0x00, 0x00, 0x00]), Buffer.from("WAVE")]),
);
/** ftyp con brand de video (isom) → NO es avif/avis/heic → rechazado. */
const MP4_BYTES = pad(
  Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x20]), Buffer.from("ftyp"), Buffer.from("isom")]),
);
/** HEIC (foto iPhone): ftyp + brand "heic" → reconocido en customer-uploads. */
const HEIC_BYTES = pad(
  Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x20]), Buffer.from("ftyp"), Buffer.from("heic")]),
);

function asFile(bytes: Buffer, type: string, name = "upload"): File {
  // new Uint8Array(bytes): Buffer<ArrayBufferLike> no es BlobPart válido en TS
  // estricto; un Uint8Array sí lo es.
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Helper: corre uploadProductImage y devuelve el StorageError esperado. */
async function expectStorageError(promise: Promise<unknown>): Promise<StorageError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof StorageError) return err;
    throw new Error(`Esperaba StorageError, recibí ${String(err)}`);
  }
  throw new Error("Esperaba que lanzara StorageError, pero resolvió");
}

beforeEach(() => {
  uploadMock.mockClear();
  getPublicUrlMock.mockClear();
  removeMock.mockClear();
  createSignedUrlMock.mockClear();
  fromMock.mockClear();
  uploadMock.mockResolvedValue({ error: null });
  removeMock.mockResolvedValue({ error: null });
  createSignedUrlMock.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://ref.supabase.co/sign/${path}?token=tok` },
    error: null,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadProductImage — magic-byte acceptance (happy paths)
// ─────────────────────────────────────────────────────────────────────────────
describe("uploadProductImage — formatos válidos por magic bytes", () => {
  it("acepta JPEG real (FF D8 FF), sube con ext .jpg y contentType image/jpeg", async () => {
    const result = await uploadProductImage({
      productId: "prod-jpeg",
      file: asFile(JPEG_BYTES, "image/jpeg"),
    });

    expect(result.path).toMatch(/^prod-jpeg\/[0-9a-f-]{36}\.jpg$/);
    expect(result.publicUrl).toBe(
      `https://ref.supabase.co/storage/v1/object/public/product-images/${result.path}`,
    );
    // El contentType se fuerza al MIME REAL (anti-polyglot), no al declarado.
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [uploadedPath, uploadedBuffer, opts] = uploadMock.mock.calls[0];
    expect(uploadedPath).toBe(result.path);
    expect(Buffer.isBuffer(uploadedBuffer)).toBe(true);
    expect(opts).toMatchObject({ contentType: "image/jpeg", upsert: false });
  });

  it("acepta PNG real (89 50 4E 47 0D 0A 1A 0A) con ext .png", async () => {
    const result = await uploadProductImage({
      productId: "prod-png",
      file: asFile(PNG_BYTES, "image/png"),
    });

    expect(result.path).toMatch(/^prod-png\/[0-9a-f-]{36}\.png$/);
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ contentType: "image/png" });
  });

  it("acepta WebP real (RIFF....WEBP) con ext .webp", async () => {
    const result = await uploadProductImage({
      productId: "prod-webp",
      file: asFile(WEBP_BYTES, "image/webp"),
    });

    expect(result.path).toMatch(/^prod-webp\/[0-9a-f-]{36}\.webp$/);
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ contentType: "image/webp" });
  });

  it("acepta AVIF real (ftyp + brand avif) con ext .avif", async () => {
    const result = await uploadProductImage({
      productId: "prod-avif",
      file: asFile(AVIF_BYTES, "image/avif"),
    });

    expect(result.path).toMatch(/^prod-avif\/[0-9a-f-]{36}\.avif$/);
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ contentType: "image/avif" });
  });

  it("acepta AVIF con brand 'avis' (secuencia de imagen)", async () => {
    const result = await uploadProductImage({
      productId: "prod-avis",
      file: asFile(AVIS_BYTES, "image/avif"),
    });
    expect(result.path).toMatch(/\.avif$/);
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ contentType: "image/avif" });
  });

  it("usa cacheControl de 1 año y upsert:false (nombres con UUID son inmutables)", async () => {
    await uploadProductImage({ productId: "p", file: asFile(JPEG_BYTES, "image/jpeg") });
    expect(uploadMock.mock.calls[0][2]).toMatchObject({
      cacheControl: "31536000",
      upsert: false,
    });
  });

  it("genera paths únicos (UUID) para subidas repetidas del mismo producto", async () => {
    const a = await uploadProductImage({ productId: "p", file: asFile(PNG_BYTES, "image/png") });
    const b = await uploadProductImage({ productId: "p", file: asFile(PNG_BYTES, "image/png") });
    expect(a.path).not.toBe(b.path);
    expect(a.path.startsWith("p/")).toBe(true);
    expect(b.path.startsWith("p/")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadProductImage — mismatch MIME declarado vs bytes reales (SEGURIDAD F1)
// ─────────────────────────────────────────────────────────────────────────────
describe("uploadProductImage — mismatch declarado vs bytes reales (F1)", () => {
  it("RECHAZA HTML disfrazado de image/png (polyglot/XSS)", async () => {
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(HTML_BYTES, "image/png") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    // Mensaje del MAGIC gate (distinto del gate de tipo declarado).
    expect(err.message).toBe("El archivo no es una imagen válida (jpg/png/webp/avif).");
    // Nunca llegó a subir nada.
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("RECHAZA SVG disfrazado de image/png (SVG no está en la allow-list de bytes)", async () => {
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(SVG_BYTES, "image/png") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("RECHAZA GIF disfrazado de image/webp (GIF fuera de la allow-list)", async () => {
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(GIF_BYTES, "image/webp") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("RECHAZA WAV (RIFF pero NO WEBP) disfrazado de image/webp", async () => {
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(WAV_BYTES, "image/webp") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("RECHAZA MP4 (ftyp con brand isom, no avif) disfrazado de image/avif", async () => {
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(MP4_BYTES, "image/avif") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("DOCUMENTA: mismatch benigno (declarado png, bytes JPEG) se ACEPTA y gana el byte real", async () => {
    // Ambos MIME están en la allow-list, así que el magic gate no bloquea. El
    // código confía en los BYTES: ext y contentType salen del MIME real
    // (image/jpeg), no del declarado (image/png). Esto es seguro (sirve la
    // imagen como lo que realmente es) y es el comportamiento intencionado.
    const result = await uploadProductImage({
      productId: "p",
      file: asFile(JPEG_BYTES, "image/png"),
    });
    expect(result.path).toMatch(/\.jpg$/); // ext del MIME real, no del declarado
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ contentType: "image/jpeg" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadProductImage — declared-type gate (corre ANTES del magic gate)
// ─────────────────────────────────────────────────────────────────────────────
describe("uploadProductImage — gate de tipo declarado", () => {
  it("RECHAZA tipo declarado fuera de la allow-list (image/gif) aun con bytes JPEG válidos", async () => {
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(JPEG_BYTES, "image/gif") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    // Mensaje del DECLARED gate — incluye el tipo declarado.
    expect(err.message).toBe('Tipo "image/gif" no permitido (jpg/png/webp/avif)');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("RECHAZA tipo declarado vacío ('') antes de leer bytes", async () => {
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(JPEG_BYTES, "") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    expect(err.message).toBe('Tipo "" no permitido (jpg/png/webp/avif)');
  });

  it("RECHAZA application/octet-stream declarado", async () => {
    const err = await expectStorageError(
      uploadProductImage({
        productId: "p",
        file: asFile(JPEG_BYTES, "application/octet-stream"),
      }),
    );
    expect(err.code).toBe("INVALID_TYPE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadProductImage — archivo vacío / demasiado grande / corrupto
// ─────────────────────────────────────────────────────────────────────────────
describe("uploadProductImage — tamaño y corrupción", () => {
  it("RECHAZA archivo vacío con EMPTY_FILE (antes de evaluar MIME)", async () => {
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(Buffer.alloc(0), "image/png") }),
    );
    expect(err.code).toBe("EMPTY_FILE");
    expect(err.message).toBe("Archivo vacío");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("RECHAZA archivo > 5 MB con FILE_TOO_LARGE (antes de evaluar MIME)", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(big, "image/png") }),
    );
    expect(err.code).toBe("FILE_TOO_LARGE");
    expect(err.message).toBe("El archivo excede 5 MB");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("ACEPTA archivo exactamente en el límite (5 MB) con bytes JPEG válidos", async () => {
    const exact = Buffer.alloc(5 * 1024 * 1024);
    JPEG_BYTES.copy(exact, 0); // header JPEG + relleno hasta 5 MB exactos
    const result = await uploadProductImage({
      productId: "p",
      file: asFile(exact, "image/jpeg"),
    });
    expect(result.path).toMatch(/\.jpg$/);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("RECHAZA archivo truncado (<12 bytes) aunque empiece con magic de PNG", async () => {
    // Header PNG completo son 8 bytes; el sniffer exige >=12, así que 11 bytes
    // se rechaza incluso si los primeros 8 son el magic correcto.
    const short = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);
    expect(short.length).toBe(11);
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(short, "image/png") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    expect(err.message).toBe("El archivo no es una imagen válida (jpg/png/webp/avif).");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("RECHAZA archivo de 12 bytes en cero (sin magic reconocible)", async () => {
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(Buffer.alloc(12), "image/png") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
  });

  it("RECHAZA JPEG con header parcial (FF D8 sin el tercer FF)", async () => {
    const partial = pad([0xff, 0xd8, 0x00, 0x00]); // tercer byte != 0xFF
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(partial, "image/jpeg") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
  });

  it("RECHAZA PNG con un byte corrupto en el header (89 50 4E 00 ...)", async () => {
    const corrupt = pad([0x89, 0x50, 0x4e, 0x00, 0x0d, 0x0a, 0x1a, 0x0a]);
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(corrupt, "image/png") }),
    );
    expect(err.code).toBe("INVALID_TYPE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadProductImage — propagación de errores del backend
// ─────────────────────────────────────────────────────────────────────────────
describe("uploadProductImage — error del backend de Storage", () => {
  it("envuelve un error de Supabase upload en UPLOAD_FAILED preservando el mensaje", async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: "bucket policy denied" } });
    const err = await expectStorageError(
      uploadProductImage({ productId: "p", file: asFile(JPEG_BYTES, "image/jpeg") }),
    );
    expect(err.code).toBe("UPLOAD_FAILED");
    expect(err.message).toContain("bucket policy denied");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteProductImage — extracción pura de path desde URL pública
// ─────────────────────────────────────────────────────────────────────────────
describe("deleteProductImage — extracción de path y no-op para URLs ajenas", () => {
  it("extrae el path tras el marker del bucket y llama remove con él", async () => {
    await deleteProductImage(
      "https://ref.supabase.co/storage/v1/object/public/product-images/abc/def.jpg",
    );
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock.mock.calls[0][0]).toEqual(["abc/def.jpg"]);
  });

  it("no-op silencioso para URL que NO pertenece al bucket (no llama remove)", async () => {
    await deleteProductImage("https://example.com/imagen.jpg");
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("no-op para URL de OTRO bucket de supabase (customer-uploads)", async () => {
    await deleteProductImage(
      "https://ref.supabase.co/storage/v1/object/public/customer-uploads/x/y.jpg",
    );
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("propaga error de remove como DELETE_FAILED", async () => {
    removeMock.mockResolvedValueOnce({ error: { message: "object not found" } });
    const err = await expectStorageError(
      deleteProductImage(
        "https://ref.supabase.co/storage/v1/object/public/product-images/abc/def.jpg",
      ),
    );
    expect(err.code).toBe("DELETE_FAILED");
    expect(err.message).toContain("object not found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadCustomerPhoto — gate de tamaño + MIME declarado (pre-sharp)
// ─────────────────────────────────────────────────────────────────────────────
// Cubre las ramas que corren ANTES de sharp: tamaño y MIME DECLARADO. El gate de
// magic bytes (MIME REAL) tiene su propio bloque más abajo.
describe("uploadCustomerPhoto — gates previos a sharp", () => {
  const ownerId = "owner-123";

  it("RECHAZA buffer vacío con EMPTY_FILE", async () => {
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.alloc(0),
        originalMimeType: "image/jpeg",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("EMPTY_FILE");
    expect(err.message).toBe("Archivo vacío");
  });

  it("RECHAZA buffer > 10 MB con FILE_TOO_LARGE", async () => {
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
        originalMimeType: "image/jpeg",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("FILE_TOO_LARGE");
    expect(err.message).toBe("El archivo excede 10 MB");
  });

  it("RECHAZA MIME declarado fuera de la allow-list (image/gif) con INVALID_TYPE", async () => {
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.from(JPEG_BYTES),
        originalMimeType: "image/gif",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    expect(err.message).toBe('Tipo "image/gif" no permitido (jpg/png/webp/heic/heif)');
  });

  it("RECHAZA application/pdf declarado con INVALID_TYPE", async () => {
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.from(JPEG_BYTES),
        originalMimeType: "application/pdf",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("INVALID_TYPE");
  });

  it("la allow-list de customer-uploads acepta heic/heif (no presentes en product-images)", async () => {
    // HEIC con magic bytes reales: pasa el gate declarado Y el de magic bytes, y
    // llega a sharp, que falla al decodificar el cuerpo dummy → UPLOAD_FAILED (NO
    // INVALID_TYPE). Prueba que heic está reconocido y ruteado a sharp.
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.from(HEIC_BYTES),
        originalMimeType: "image/heic",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("UPLOAD_FAILED");
    expect(err.code).not.toBe("INVALID_TYPE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadCustomerPhoto — gate de MIME REAL por magic bytes (SEGURIDAD, ruta pública)
// ─────────────────────────────────────────────────────────────────────────────
// La ruta del cliente es pública (usuarios anónimos suben con sessionId). Igual que
// uploadProductImage, ahora verifica el MIME REAL por magic bytes ANTES de sharp:
// rechaza polyglots (.html/.svg/GIF/WAV/MP4 disfrazados de imagen) con INVALID_TYPE,
// y usa el formato real como contentType (no el declarado por el cliente).
describe("uploadCustomerPhoto — mismatch declarado vs bytes reales (magic gate)", () => {
  const ownerId = "owner-123";

  it("RECHAZA HTML disfrazado de image/png (polyglot/XSS)", async () => {
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.from(HTML_BYTES),
        originalMimeType: "image/png",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("INVALID_TYPE");
    expect(err.message).toContain("no es una imagen válida");
    // Rechazado en el gate de bytes → nunca tocó Supabase.
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("RECHAZA SVG disfrazado de image/webp (SVG fuera de la allow-list de bytes)", async () => {
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.from(SVG_BYTES),
        originalMimeType: "image/webp",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("INVALID_TYPE");
  });

  it("RECHAZA GIF disfrazado de image/png (GIF no es imagen permitida)", async () => {
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.from(GIF_BYTES),
        originalMimeType: "image/png",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("INVALID_TYPE");
  });

  it("RECHAZA WAV (RIFF pero NO WEBP) disfrazado de image/webp", async () => {
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.from(WAV_BYTES),
        originalMimeType: "image/webp",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("INVALID_TYPE");
  });

  it("RECHAZA MP4/video (ftyp brand isom) disfrazado de image/png", async () => {
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: Buffer.from(MP4_BYTES),
        originalMimeType: "image/png",
        ownerId,
        designId: null,
      }),
    );
    expect(err.code).toBe("INVALID_TYPE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadCustomerPhoto — happy path + ramas post-sharp (createSignedUrl)
// ─────────────────────────────────────────────────────────────────────────────
// FIX adversarial: hasta ahora el camino feliz NUNCA corría porque el mock de
// from() no exponía createSignedUrl → TypeError antes de llegar a las
// aserciones. Con createSignedUrl en el mock cubrimos el pipeline completo:
// strip EXIF (sharp real sobre un buffer de imagen REAL generado por sharp),
// upload con metadata.owner_id, firma de URL y forma del resultado.
//
// Usamos sharp REAL con imágenes REALES generadas en memoria (no el binario
// nativo de forma frágil): sharp decodifica PNG/JPEG estándar de forma
// determinista y offline. Para el caso HEIC NO dependemos de libheif: feedeamos
// un JPEG real declarándolo image/heic, lo que dispara la rama HEIC→JPEG (esa
// rama se decide por el MIME DECLARADO, no por los bytes), evitando exigir
// soporte heif en el binario de CI.
describe("uploadCustomerPhoto — camino feliz + firma de URL", () => {
  const ownerId = "owner-123";
  let realPng: Buffer;
  let realJpeg: Buffer;

  beforeAll(async () => {
    // Imágenes REALES (sharp las decodifica sin tocar disco ni red). El borde
    // 120×90 / 80×60 nos da width/height verificables en el resultado.
    realPng = await sharp({
      create: { width: 120, height: 90, channels: 3, background: { r: 100, g: 110, b: 120 } },
    })
      .png()
      .toBuffer();
    realJpeg = await sharp({
      create: { width: 80, height: 60, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .toBuffer();
  });

  it("happy path: sube con metadata.owner_id, path '<ownerId>/<designId>/<uuid>.<ext>', y expone el resultado completo", async () => {
    const result = await uploadCustomerPhoto({
      buffer: realPng,
      originalMimeType: "image/png",
      ownerId,
      designId: "design-7",
    });

    // ── Path scheme: <ownerId>/<designId>/<uuid>.<ext> ──
    expect(result.path).toMatch(/^owner-123\/design-7\/[0-9a-f-]{36}\.png$/);

    // ── upload() recibió path, buffer procesado y opts correctos ──
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [uploadedPath, uploadedBuffer, opts] = uploadMock.mock.calls[0];
    expect(uploadedPath).toBe(result.path);
    expect(Buffer.isBuffer(uploadedBuffer)).toBe(true);
    // metadata.owner_id DEBE coincidir con ownerId (lo verifican las RLS policies).
    expect(opts).toMatchObject({
      contentType: "image/png",
      cacheControl: "3600",
      upsert: false,
      metadata: { owner_id: ownerId },
    });

    // ── createSignedUrl se firmó sobre el MISMO path, TTL 1h (3600s) ──
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(createSignedUrlMock.mock.calls[0][0]).toBe(result.path);
    expect(createSignedUrlMock.mock.calls[0][1]).toBe(3600);

    // ── El resultado expone la URL firmada que vino del backend ──
    expect(result.signedUrl).toBe(`https://ref.supabase.co/sign/${result.path}?token=tok`);

    // ── Dimensiones REALES leídas por sharp ──
    expect(result.width).toBe(120);
    expect(result.height).toBe(90);

    // ── sizeBytes = longitud del buffer PROCESADO (post-sharp), no del original ──
    expect(result.sizeBytes).toBe(uploadedBuffer.length);
    expect(result.sizeBytes).toBeGreaterThan(0);

    // ── exifStripped siempre true (sharp.rotate() descarta EXIF) ──
    expect(result.exifStripped).toBe(true);
    expect(result.mimeType).toBe("image/png");

    // ── validation presente y bien formada (no bloquea, solo informa) ──
    expect(result.validation).toBeDefined();
    expect(["ok", "warning-soft", "warning-strong", "error"]).toContain(result.validation?.level);
  });

  it("designId=null → segmento 'pending' en el path", async () => {
    const result = await uploadCustomerPhoto({
      buffer: realPng,
      originalMimeType: "image/png",
      ownerId,
      designId: null,
    });
    expect(result.path).toMatch(/^owner-123\/pending\/[0-9a-f-]{36}\.png$/);
    // El path firmado y el subido comparten el segmento "pending".
    expect(uploadMock.mock.calls[0][0]).toContain("/pending/");
  });

  it("error de createSignedUrl (signErr) → UPLOAD_FAILED 'Subió pero no pudimos firmar URL'", async () => {
    // El upload tuvo éxito, pero firmar la URL falla → el código lo envuelve en
    // UPLOAD_FAILED con mensaje específico (distinto del error de upload).
    createSignedUrlMock.mockResolvedValueOnce({
      data: null,
      error: { message: "signing key revoked" },
    });
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: realPng,
        originalMimeType: "image/png",
        ownerId,
        designId: "design-7",
      }),
    );
    expect(err.code).toBe("UPLOAD_FAILED");
    expect(err.message).toContain("Subió pero no pudimos firmar URL");
    expect(err.message).toContain("signing key revoked");
    // El upload SÍ se intentó (la firma corre después).
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("error de upload (uploadErr) en customer → UPLOAD_FAILED y nunca firma URL", async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: "rls: owner_id mismatch" } });
    const err = await expectStorageError(
      uploadCustomerPhoto({
        buffer: realPng,
        originalMimeType: "image/png",
        ownerId,
        designId: "design-7",
      }),
    );
    expect(err.code).toBe("UPLOAD_FAILED");
    expect(err.message).toContain("Error subiendo");
    expect(err.message).toContain("rls: owner_id mismatch");
    // Falló el upload → no se intenta firmar la URL.
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("el MIME REAL manda sobre el declarado: JPEG declarado image/heic se guarda como image/jpeg", async () => {
    // El sniff de magic bytes gana: un JPEG real declarado image/heic se detecta
    // como jpeg (no dispara la rama HEIC), y el contentType/mimeType/ext salen del
    // formato REAL, no del declarado. Corrige el bug de metadata (antes guardaba el
    // MIME declarado por el cliente).
    const result = await uploadCustomerPhoto({
      buffer: realJpeg,
      originalMimeType: "image/heic",
      ownerId,
      designId: "design-heic",
    });
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.path).toMatch(/^owner-123\/design-heic\/[0-9a-f-]{36}\.jpg$/);
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ contentType: "image/jpeg" });
    expect(result.width).toBe(80);
    expect(result.height).toBe(60);
  });

  it("PNG real declarado image/webp se guarda como image/png (metadata correcta)", async () => {
    // Mismatch benigno (imagen real, tipo declarado equivocado): se acepta usando el
    // formato REAL. No rompemos subidas legítimas por un content-type mal etiquetado.
    const result = await uploadCustomerPhoto({
      buffer: realPng,
      originalMimeType: "image/webp",
      ownerId,
      designId: "design-mismatch",
    });
    expect(result.mimeType).toBe("image/png");
    expect(result.path).toMatch(/\.png$/);
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ contentType: "image/png" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refreshCustomerUploadSignedUrl — re-firma de URL existente
// ─────────────────────────────────────────────────────────────────────────────
describe("refreshCustomerUploadSignedUrl", () => {
  it("camino feliz: devuelve la signedUrl re-firmada sobre el path dado (TTL 1h)", async () => {
    const url = await refreshCustomerUploadSignedUrl("owner-123/design-7/abc.jpg");
    expect(url).toBe("https://ref.supabase.co/sign/owner-123/design-7/abc.jpg?token=tok");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(createSignedUrlMock.mock.calls[0][0]).toBe("owner-123/design-7/abc.jpg");
    expect(createSignedUrlMock.mock.calls[0][1]).toBe(3600);
  });

  it("error de createSignedUrl → UPLOAD_FAILED 'No pudimos refirmar URL'", async () => {
    createSignedUrlMock.mockResolvedValueOnce({
      data: null,
      error: { message: "object not found" },
    });
    const err = await expectStorageError(
      refreshCustomerUploadSignedUrl("owner-123/design-7/abc.jpg"),
    );
    expect(err.code).toBe("UPLOAD_FAILED");
    expect(err.message).toContain("No pudimos refirmar URL");
    expect(err.message).toContain("object not found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// StorageError — forma del error
// ─────────────────────────────────────────────────────────────────────────────
describe("StorageError", () => {
  it("es una Error con name='StorageError' y conserva code", () => {
    const e = new StorageError("INVALID_TYPE", "nope");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("StorageError");
    expect(e.code).toBe("INVALID_TYPE");
    expect(e.message).toBe("nope");
  });
});
