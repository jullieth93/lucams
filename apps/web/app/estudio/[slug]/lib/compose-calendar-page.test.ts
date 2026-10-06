/*
 * Tests del cache de páginas de calendario compuestas (fix STG 2026-10-05).
 *
 * Lo que se congela acá es la CLAVE y el DESALOJO — el riesgo real del cache:
 * una página vieja en la vista previa/3D sería un bug de fidelidad de
 * imprenta. La composición en sí (canvas 2D) no es testeable en jsdom; la
 * clave cubre TODO lo que afecta el píxel final, así que "misma clave → misma
 * referencia" y "cambio de entrada → clave distinta" son el contrato.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  CALENDAR_PAGE_CACHE_LIMIT,
  calendarPageCacheKey,
  calendarPageCacheSize,
  clearCalendarPageCache,
  getCachedCalendarPage,
  setCachedCalendarPage,
  type CalendarPageInput,
} from "./compose-calendar-page";

function makePage(extra: Partial<CalendarPageInput> = {}): CalendarPageInput {
  return {
    assetUrl: "https://x/foto.jpg",
    photoTransform: { offsetX: 10, offsetY: -5, scale: 1.25 },
    monthIndex0: 3,
    ...extra,
  };
}

describe("calendarPageCacheKey — cobertura de la entrada", () => {
  it("misma entrada (aunque sea OTRO objeto) → misma clave", () => {
    // El photoTransform se reconstruye en cada llamada al compositor
    // (scalePhotoTransformToPage): la invalidación es por VALOR, no referencia.
    expect(calendarPageCacheKey(makePage(), 2027)).toBe(calendarPageCacheKey(makePage(), 2027));
  });

  it("cambio de encuadre (transform) → clave distinta", () => {
    const base = calendarPageCacheKey(makePage(), 2027);
    expect(
      calendarPageCacheKey(
        makePage({ photoTransform: { offsetX: 11, offsetY: -5, scale: 1.25 } }),
        2027,
      ),
    ).not.toBe(base);
    expect(calendarPageCacheKey(makePage({ photoTransform: null }), 2027)).not.toBe(base);
  });

  it("cambio de foto, mes, año, layout o fuente → clave distinta", () => {
    const base = calendarPageCacheKey(makePage(), 2027, "classic", "fredoka");
    expect(calendarPageCacheKey(makePage({ assetUrl: "https://x/otra.jpg" }), 2027)).not.toBe(base);
    expect(calendarPageCacheKey(makePage({ assetUrl: null }), 2027)).not.toBe(base);
    expect(calendarPageCacheKey(makePage({ monthIndex0: 4 }), 2027)).not.toBe(base);
    expect(calendarPageCacheKey(makePage(), 2028)).not.toBe(base);
    expect(calendarPageCacheKey(makePage(), 2027, "split")).not.toBe(base);
    expect(calendarPageCacheKey(makePage(), 2027, "classic", "caveat")).not.toBe(base);
  });
});

describe("cache de páginas — misma referencia y desalojo acotado", () => {
  beforeEach(() => clearCalendarPageCache());

  it("misma clave → misma referencia almacenada", () => {
    const key = calendarPageCacheKey(makePage(), 2027);
    setCachedCalendarPage(key, "data:image/webp;base64,pagina");
    expect(getCachedCalendarPage(key)).toBe("data:image/webp;base64,pagina");
    expect(calendarPageCacheSize()).toBe(1);
  });

  it("desaloja FIFO al superar el tope (memoria acotada)", () => {
    for (let i = 0; i < CALENDAR_PAGE_CACHE_LIMIT + 1; i++) {
      setCachedCalendarPage(`k${i}`, `page-${i}`);
    }
    expect(calendarPageCacheSize()).toBe(CALENDAR_PAGE_CACHE_LIMIT);
    expect(getCachedCalendarPage("k0")).toBeUndefined(); // el más viejo salió
    expect(getCachedCalendarPage(`k${CALENDAR_PAGE_CACHE_LIMIT}`)).toBeDefined();
  });

  it("leer refresca la posición (LRU liviano): el recién leído no se desaloja", () => {
    for (let i = 0; i < CALENDAR_PAGE_CACHE_LIMIT; i++) {
      setCachedCalendarPage(`k${i}`, `page-${i}`);
    }
    getCachedCalendarPage("k0"); // k0 vuelve al fondo de la cola
    setCachedCalendarPage("nueva", "page-nueva"); // desaloja k1, no k0
    expect(getCachedCalendarPage("k0")).toBe("page-0");
    expect(getCachedCalendarPage("k1")).toBeUndefined();
  });
});
