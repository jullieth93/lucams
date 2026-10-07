/*
 * Unit — label-archive (fix 1.8, copia propia del PDF de la etiqueta).
 *
 * Cubre el contrato BEST-EFFORT (NUNCA lanza; null = fallback a URLs externas)
 * y las validaciones de la cadena de fuentes:
 *   1. labelPdfBase64 (archivorotulo de Aveonline) — la más confiable.
 *   2. Descarga de labelUrl, luego trackingUrl — con timeout, tope de tamaño y
 *      validación %PDF por magic bytes (el rotulador PHP de Aveonline puede
 *      responder 200 con HTML de error).
 *
 * Mocks: @/lib/supabase/service (upload spy), fetch global stubbed, logger
 * silenciado. Nunca pega a red ni a Storage reales.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock, fromMock } = vi.hoisted(() => {
  const uploadMock = vi.fn(
    async (
      _path: string,
      _body: Buffer,
      _opts?: unknown,
    ): Promise<{ data: { path: string } | null; error: { message: string } | null }> => ({
      data: { path: "ok" },
      error: null,
    }),
  );
  const fromMock = vi.fn(() => ({ upload: uploadMock }));
  return { uploadMock, fromMock };
});

vi.mock("@/lib/supabase/service", () => ({
  supabaseService: { storage: { from: fromMock } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { archiveShipmentLabel, isPdfBuffer, shipmentLabelPath } from "./label-archive";

const PDF_BYTES = Buffer.from("%PDF-1.4\ncontenido-falso\n%%EOF");
const PDF_B64 = PDF_BYTES.toString("base64");
const HTML_BYTES = Buffer.from("<html><body>Guia anulada</body></html>");

function makeResp(
  body: Buffer,
  init: { ok?: boolean; status?: number; headers?: Record<string, string> } = {},
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers(init.headers ?? {}),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

function fetchOnce(
  body: Buffer,
  init: { ok?: boolean; status?: number; headers?: Record<string, string> } = {},
) {
  return vi.fn(async () => makeResp(body, init));
}

describe("isPdfBuffer", () => {
  it("reconoce el header %PDF- en offset 0", () => {
    expect(isPdfBuffer(PDF_BYTES)).toBe(true);
  });
  it("tolera whitespace/BOM antes del header (spec PDF: primeros 1024 bytes)", () => {
    expect(isPdfBuffer(Buffer.concat([Buffer.from("\uFEFF  \n"), PDF_BYTES]))).toBe(true);
  });
  it("rechaza HTML y buffers cortos", () => {
    expect(isPdfBuffer(HTML_BYTES)).toBe(false);
    expect(isPdfBuffer(Buffer.from("%PD"))).toBe(false);
  });
});

describe("shipmentLabelPath", () => {
  it("es determinista por orden (upsert seguro en reintentos)", () => {
    expect(shipmentLabelPath("ord_123")).toBe("shipping-labels/ord_123.pdf");
  });
});

describe("archiveShipmentLabel", () => {
  beforeEach(() => {
    uploadMock.mockClear();
    fromMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("base64 válido (archivorotulo): sube sin llamar fetch y devuelve el path", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const path = await archiveShipmentLabel({
      orderId: "ord_1",
      labelUrl: "https://label.test/x.pdf",
      labelPdfBase64: PDF_B64,
    });

    expect(path).toBe("shipping-labels/ord_1.pdf");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(uploadMock).toHaveBeenCalledOnce();
    const [uploadPath, body, opts] = uploadMock.mock.calls[0];
    expect(uploadPath).toBe("shipping-labels/ord_1.pdf");
    expect(Buffer.compare(body as Buffer, PDF_BYTES)).toBe(0);
    expect(opts).toMatchObject({ contentType: "application/pdf", upsert: true });
  });

  it("base64 que NO es PDF: cae a la descarga de labelUrl", async () => {
    vi.stubGlobal("fetch", fetchOnce(PDF_BYTES));

    const path = await archiveShipmentLabel({
      orderId: "ord_2",
      labelUrl: "https://label.test/x.pdf",
      labelPdfBase64: HTML_BYTES.toString("base64"),
    });

    expect(path).toBe("shipping-labels/ord_2.pdf");
    expect(uploadMock).toHaveBeenCalledOnce();
  });

  it("labelUrl responde 200 con HTML (sesión expirada Aveonline): intenta trackingUrl", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(makeResp(HTML_BYTES))
      .mockResolvedValueOnce(makeResp(PDF_BYTES));
    vi.stubGlobal("fetch", fetchSpy);

    const path = await archiveShipmentLabel({
      orderId: "ord_3",
      labelUrl: "https://label.test/rotilo.php?x=1",
      trackingUrl: "https://track.test/guia.pdf",
    });

    expect(path).toBe("shipping-labels/ord_3.pdf");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("content-length declarado excede el tope: no sube y devuelve null", async () => {
    vi.stubGlobal(
      "fetch",
      fetchOnce(PDF_BYTES, { headers: { "content-length": String(20 * 1024 * 1024) } }),
    );

    const path = await archiveShipmentLabel({
      orderId: "ord_4",
      labelUrl: "https://label.test/grande.pdf",
    });

    expect(path).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("HTTP no-ok y red caída: null sin lanzar (best-effort)", async () => {
    vi.stubGlobal("fetch", fetchOnce(PDF_BYTES, { ok: false, status: 403 }));
    await expect(
      archiveShipmentLabel({ orderId: "ord_5", labelUrl: "https://label.test/403.pdf" }),
    ).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ENOTFOUND app.aveonline.co");
      }),
    );
    await expect(
      archiveShipmentLabel({ orderId: "ord_6", labelUrl: "https://label.test/x.pdf" }),
    ).resolves.toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("sin base64 y sin URLs http(s) (caso tcc-sa sin URL): null sin llamar fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const path = await archiveShipmentLabel({
      orderId: "ord_7",
      labelUrl: "",
      trackingUrl: "",
    });

    expect(path).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("falla el upload a Storage: null sin lanzar (la orden sigue con URLs externas)", async () => {
    uploadMock.mockResolvedValueOnce({ data: null, error: { message: "bucket full" } });

    const path = await archiveShipmentLabel({
      orderId: "ord_8",
      labelPdfBase64: PDF_B64,
    });

    expect(path).toBeNull();
  });
});
