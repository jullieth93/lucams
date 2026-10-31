/*
 * LUC-SEC-001 — matriz de autorización de previews de diseños.
 *
 * El bucket design-previews deja de ser público: los bytes solo salen por
 * /api/design-preview/*, que delega TODA la decisión en canAccessDesignPreview
 * (función pura — la matriz completa se certifica acá, sin HTTP).
 *
 * Reglas:
 *   - Admin activo → todo.
 *   - Dueño (customerId autenticado o sessionId anónimo que coincide) → todo.
 *   - Capacidades por token (share /d/, quote, order) → SOLO variantes
 *     watermark: jamás el preview limpio, las páginas limpias ni borradores.
 *   - Cualquier otro caso → denegado (el handler responde 404, sin oráculo).
 */

import { describe, expect, it } from "vitest";
import { hashBearerToken } from "@/lib/token-hash";
import {
  canAccessDesignPreview,
  parsePreviewStoragePath,
  previewStoragePathFromRef,
  PREVIEW_ROUTE_PREFIX,
} from "./preview-access";

const DESIGN = {
  customerId: "cust-owner",
  sessionId: "sess-owner",
  shareTokenHash: hashBearerToken("share-token-valido"),
};

const NOBODY = { customerId: null, sessionId: null, isAdmin: false };

describe("parsePreviewStoragePath — allowlist estricta de paths", () => {
  it.each([
    ["ckdesign1/preview.png", "clean"],
    ["ckdesign1/preview.jpg", "clean"],
    ["ckdesign1/preview.webp", "clean"],
    ["ckdesign1/pages/01.webp", "clean"],
    ["ckdesign1/draft-preview.webp", "clean"],
    ["ckdesign1/preview-wm.webp", "watermark"],
    ["ckdesign1/thumb.webp", "watermark"],
    ["ckdesign1/wm/pages/03.webp", "watermark"],
  ])("acepta %s como %s", (path, klass) => {
    expect(parsePreviewStoragePath(path)).toEqual({ designId: "ckdesign1", variantClass: klass });
  });

  it.each([
    "../design-previews/x/preview.png", // traversal
    "ckdesign1/../../buckets", // traversal encubierto
    "ckdesign1", // sin archivo
    "ckdesign1/", // vacío
    "ckdesign1/preview.gif", // formato fuera de allowlist
    "ckdesign1/preview-wm.png", // watermark siempre webp
    "ckdesign1/pages/1.webp", // sin pad 2
    "ckdesign1/wm/pages/99.png", // ext equivocada
    "ckdesign1/pages/01.webp/extra", // segmentos de más
    "ckdesign1/preview.png?x=1", // query en el path
    "CK DESIGN/preview.png", // espacio en el id
    "", // vacío
  ])("rechaza %s", (path) => {
    expect(parsePreviewStoragePath(path)).toBeNull();
  });
});

describe("previewStoragePathFromRef — convierte refs viejas y nuevas a path de Storage", () => {
  it("handler URL nueva → path intacto", () => {
    expect(previewStoragePathFromRef(`${PREVIEW_ROUTE_PREFIX}ck1/preview.webp`)).toBe(
      "ck1/preview.webp",
    );
    expect(previewStoragePathFromRef(`${PREVIEW_ROUTE_PREFIX}ck1/wm/pages/02.webp?st=abc`)).toBe(
      "ck1/wm/pages/02.webp",
    );
  });

  it("URL pública legacy (bucket público) → path", () => {
    expect(
      previewStoragePathFromRef(
        "https://xyz.supabase.co/storage/v1/object/public/design-previews/ck1/preview.png",
      ),
    ).toBe("ck1/preview.png");
  });

  it("cualquier otra cosa → null", () => {
    expect(previewStoragePathFromRef("https://evil.com/ck1/preview.png")).toBeNull();
    expect(previewStoragePathFromRef("ck1/preview.png")).toBeNull(); // path pelado no es una ref válida
    expect(previewStoragePathFromRef(`${PREVIEW_ROUTE_PREFIX}ck1/malicious.exe`)).toBeNull();
  });
});

describe("canAccessDesignPreview — matriz completa", () => {
  it("anónimo sin relación → denegado en todas las variantes", () => {
    expect(
      canAccessDesignPreview({ design: DESIGN, variantClass: "clean", caller: NOBODY }),
    ).toBe(false);
    expect(
      canAccessDesignPreview({ design: DESIGN, variantClass: "watermark", caller: NOBODY }),
    ).toBe(false);
  });

  it("dueño por sessionId anónimo → acceso total (incluido borrador limpio)", () => {
    const caller = { customerId: null, sessionId: "sess-owner", isAdmin: false };
    expect(canAccessDesignPreview({ design: DESIGN, variantClass: "clean", caller })).toBe(true);
    expect(canAccessDesignPreview({ design: DESIGN, variantClass: "watermark", caller })).toBe(
      true,
    );
  });

  it("dueño por customerId autenticado → acceso total", () => {
    const caller = { customerId: "cust-owner", sessionId: null, isAdmin: false };
    expect(canAccessDesignPreview({ design: DESIGN, variantClass: "clean", caller })).toBe(true);
  });

  it("OTRA sesión anónima → denegado (A no ve el diseño de B aun conociendo el id)", () => {
    const caller = { customerId: null, sessionId: "sess-ajena", isAdmin: false };
    expect(canAccessDesignPreview({ design: DESIGN, variantClass: "clean", caller })).toBe(false);
    expect(canAccessDesignPreview({ design: DESIGN, variantClass: "watermark", caller })).toBe(
      false,
    );
  });

  it("admin → acceso total aunque no sea dueño", () => {
    const caller = { customerId: null, sessionId: null, isAdmin: true };
    expect(canAccessDesignPreview({ design: DESIGN, variantClass: "clean", caller })).toBe(true);
  });

  it("share token válido → SOLO watermark; el limpio y borradores quedan fuera", () => {
    expect(
      canAccessDesignPreview({
        design: DESIGN,
        variantClass: "watermark",
        caller: NOBODY,
        shareToken: "share-token-valido",
      }),
    ).toBe(true);
    expect(
      canAccessDesignPreview({
        design: DESIGN,
        variantClass: "clean",
        caller: NOBODY,
        shareToken: "share-token-valido",
      }),
    ).toBe(false);
  });

  it("share token incorrecto o revocado → denegado", () => {
    expect(
      canAccessDesignPreview({
        design: DESIGN,
        variantClass: "watermark",
        caller: NOBODY,
        shareToken: "token-equivocado",
      }),
    ).toBe(false);
    expect(
      canAccessDesignPreview({
        design: { ...DESIGN, shareTokenHash: null }, // revocado
        variantClass: "watermark",
        caller: NOBODY,
        shareToken: "share-token-valido",
      }),
    ).toBe(false);
  });

  it("quote/order token válidos → solo watermark", () => {
    expect(
      canAccessDesignPreview({
        design: DESIGN,
        variantClass: "watermark",
        caller: NOBODY,
        quoteTokenOk: true,
      }),
    ).toBe(true);
    expect(
      canAccessDesignPreview({
        design: DESIGN,
        variantClass: "clean",
        caller: NOBODY,
        orderTokenOk: true,
      }),
    ).toBe(false);
  });

  it("diseño huérfano (sin customerId/sessionId) solo lo abre admin o token watermark", () => {
    const huesrfano = { customerId: null, sessionId: null, shareTokenHash: null };
    expect(
      canAccessDesignPreview({ design: huesrfano, variantClass: "clean", caller: NOBODY }),
    ).toBe(false);
    expect(
      canAccessDesignPreview({
        design: huesrfano,
        variantClass: "watermark",
        caller: NOBODY,
        orderTokenOk: true,
      }),
    ).toBe(true);
  });
});
