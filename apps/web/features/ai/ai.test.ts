import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DesignSuggestInputSchema,
  BRAND_COLORS,
  sanitizeOccasion,
  NEUTRAL_OCCASION,
} from "./schemas";
import { AiUnavailableError } from "./provider";

// Guard de etapa: suggestDesignAction debe rechazar en modo catálogo (la UI la oculta,
// pero una Server Action es un POST endpoint invocable por un request crafteado).
// El guard es lo PRIMERO de la acción → el mock basta; no se toca rate-limit/DB/Gemini.
vi.mock("@/lib/store-mode", () => ({ isCatalogMode: () => true, STORE_MODE: "catalog" }));

const VALID_INPUT = {
  occasion: "cumpleaños de mi mamá",
  productName: "Fotoimanes Cuadrados",
  slotCount: 6,
  allowText: true,
};

function okResponse(payload: object) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}
function errResponse(status: number) {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}
function geminiPayload(obj: object) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] };
}

describe("IA — validación de entrada", () => {
  it("rechaza ocasión demasiado corta", () => {
    expect(DesignSuggestInputSchema.safeParse({ ...VALID_INPUT, occasion: "x" }).success).toBe(
      false,
    );
  });
  it("acepta entrada válida", () => {
    expect(DesignSuggestInputSchema.safeParse(VALID_INPUT).success).toBe(true);
  });
});

describe("IA — filtro PII de la ocasión (auditoría E-2)", () => {
  it("sustituye un número de documento por el texto neutro", () => {
    const out = sanitizeOccasion({ ...VALID_INPUT, occasion: "cumple de mi mamá, cc 1023456789" });
    expect(out.occasion).toBe(NEUTRAL_OCCASION);
    expect(out.productName).toBe(VALID_INPUT.productName); // el resto del input no cambia
  });
  it("sustituye un email", () => {
    const out = sanitizeOccasion({
      ...VALID_INPUT,
      occasion: "aniversario, escríbeme a ana@correo.com",
    });
    expect(out.occasion).toBe(NEUTRAL_OCCASION);
  });
  it("sustituye un celular colombiano", () => {
    const out = sanitizeOccasion({
      ...VALID_INPUT,
      occasion: "fiesta sorpresa, llámame 3001234567",
    });
    expect(out.occasion).toBe(NEUTRAL_OCCASION);
  });
  it("no toca una ocasión normal (devuelve el mismo objeto)", () => {
    const input = { ...VALID_INPUT, occasion: "bautizo de mi sobrina" };
    expect(sanitizeOccasion(input)).toBe(input);
  });
});

describe("IA — Gemini con fallback entre modelos", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL_PRIMARY", "gemini-2.5-flash-lite");
    vi.stubEnv("GEMINI_MODEL_FALLBACK", "gemini-2.5-flash");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("si el modelo primario falla (500), usa el de respaldo", async () => {
    const suggestion = {
      colorName: "morado",
      layout: "Foto grande al centro.",
      tip: "Usa fotos claras.",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(500)) // primario falla
      .mockResolvedValueOnce(okResponse(geminiPayload(suggestion))); // respaldo responde
    vi.stubGlobal("fetch", fetchMock);

    const { geminiProvider } = await import("./gemini-provider");
    const raw = await geminiProvider.suggestDesign(VALID_INPUT);

    expect(raw.colorName).toBe("morado");
    expect(fetchMock).toHaveBeenCalledTimes(2); // intentó primario y luego respaldo
    // el segundo intento fue al modelo de respaldo
    expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-2.5-flash:");
  });

  it("si AMBOS modelos fallan, lanza AiUnavailableError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errResponse(503)));
    const { geminiProvider } = await import("./gemini-provider");
    await expect(geminiProvider.suggestDesign(VALID_INPUT)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it("sin GEMINI_API_KEY → AiUnavailableError sin llamar a la red", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { geminiProvider } = await import("./gemini-provider");
    await expect(geminiProvider.suggestDesign(VALID_INPUT)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("IA — guard de modo catálogo (suggestDesignAction)", () => {
  it("en modo catálogo la Server Action rechaza con el shape de error habitual", async () => {
    const { suggestDesignAction } = await import("./actions");
    const res = await suggestDesignAction(VALID_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("no está disponible");
  });
});

describe("IA — service resuelve color de marca", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("mapea colorName → hex de marca y omite frase si allowText=false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse(
          geminiPayload({
            phrase: "¡Feliz cumple! 💜",
            colorName: "turquesa",
            layout: "L",
            tip: "T",
          }),
        ),
      ),
    );
    const { getDesignSuggestion } = await import("./service");
    const s = await getDesignSuggestion({ ...VALID_INPUT, allowText: false });
    expect(s.colorHex).toBe(BRAND_COLORS.turquesa.hex);
    expect(s.phrase).toBeNull(); // allowText false → sin frase
  });
});
