// @vitest-environment jsdom

/*
 * Test del bloque de diligenciamiento MASIVO de la Polaroid Instagram (Fase 1B,
 * owner 2026-09; REDISEÑO ASISTIDO owner 2026-10-05): la sección "Datos de la
 * publicación" del sidebar es el equivalente multi-campo de "Tu mensaje"
 * (Polaroid Clásica) — un CONTROL ASISTIDO por capa editable IG que escribe el
 * override en TODOS los slots vía setTextOverrideAllSlots:
 *  - @usuario: "@" fija fuera del input, sanitización en vivo.
 *  - Ubicación: INPUT DE TEXTO simple (owner 2026-10-12 — se retiró el
 *    combobox con sugerencias): máximo 2 palabras, inicial mayúscula y el
 *    separador se imprime como ", " ("bogotá colombia" → "Bogotá, Colombia").
 *  - «Me gusta»: OBLIGATORIO (rediseño), solo numérico, miles es-CO, sufijo fijo.
 *  - Título: contador n/140.
 *  - Hashtags: chips agregar/quitar, máximo 3, "#" fija.
 *
 * Los campos de texto comprometen al store con DEBOUNCE (IgDebouncedInput →
 * lib/use-debounced-commit.ts): el draft es inmediato y el commit ocurre al
 * BLUR (o tras ~350ms sin teclear). Por eso los tests hacen fireEvent.blur
 * después de escribir para forzar el commit.
 *
 * Contrato blindado:
 *  1. Solo se monta con plantilla Instagram (isInstagramTemplate); en Clásica y
 *     demás no aparece.
 *  2. Cada campo escribe en TODOS los slots; vacío → override null.
 *  3. Valor mostrado = el texto compartido; si las unidades difieren, el campo
 *     queda vacío con chip "Varía por foto" y al escribir se unifica.
 *  4. Las 5 capas se anuncian como obligatorias (likes dejó de ser opcional).
 *  5. Aviso pack-level visible (misma caja que "Tu mensaje").
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { StudioIgPostFields } from "./studio-ig-post-fields";
import { createStudioStore } from "./lib/store";
import type { CanvasDataV2 } from "./types";

function igCanvas(): CanvasDataV2 {
  return {
    version: 2,
    unitTemplate: {
      version: 1,
      stage: { width: 450, height: 600, dpiPreview: 90, dpiProduction: 300 },
      layers: [
        { id: "bg", type: "background", color: "#FFFFFF" },
        // El asset con src "ig_post" es lo que marca la plantilla como Instagram
        // (isInstagramTemplate, frame-palette).
        { id: "frame", type: "asset", src: "/templates/ig_post_3x4.svg", x: 0, y: 0 },
        {
          id: "p1",
          type: "image-placeholder",
          x: 29,
          y: 58,
          width: 392,
          height: 392,
          label: "Tu foto",
        },
        { id: "user_name", type: "text", x: 60, y: 34, text: "@tu_usuario", editable: true },
        { id: "location", type: "text", x: 60, y: 48, text: "Bogotá, Colombia", editable: true },
        { id: "likes_count", type: "text", x: 25, y: 510, text: "362 me gusta", editable: true },
        { id: "caption", type: "text", x: 25, y: 526, text: "Tu título acá", editable: true },
        {
          id: "hashtags",
          type: "text",
          x: 25,
          y: 542,
          text: "#mirecuerdo #lucamsshop",
          editable: true,
        },
      ],
    },
    slotCount: 2,
    slots: [
      { slotIndex: 0, assetId: null, assetUrl: null },
      { slotIndex: 1, assetId: null, assetUrl: null },
    ],
    gridLayout: { cols: 2, rows: 1, gap: 24 },
    borderColor: null,
  };
}

function makeStore(canvas: CanvasDataV2 = igCanvas()) {
  const store = createStudioStore();
  store.getState().init({
    designId: "d1",
    productSlug: "set-fotoimanes-polaroid-instagram",
    canvasData: canvas,
    templates: [],
  });
  return store;
}

function overrides(store: ReturnType<typeof makeStore>, layerId: string) {
  return store.getState().canvasData!.slots.map((s) => s.textOverrides?.[layerId]?.text);
}

afterEach(cleanup);

describe("StudioIgPostFields — diligenciamiento masivo IG (rediseño asistido 2026-10-05)", () => {
  it("renderiza UN control por capa editable IG con el aviso pack-level", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    expect(screen.getByText("Datos de la publicación")).toBeInTheDocument();
    for (const label of ["@usuario", "Ubicación", "«Me gusta»", "Título", "Hashtags"]) {
      expect(screen.getByRole("textbox", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
    // La ubicación es un input de texto simple (owner 2026-10-12: sin sugerencias).
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("note").textContent).toMatch(/TODAS las fotos del set/i);
  });

  it("las 5 capas se anuncian como obligatorias (rediseño: «me gusta» ya no es opcional)", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    expect(screen.getByRole("textbox", { name: /ubicación.*obligatorio/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /me gusta.*obligatorio/i })).toBeInTheDocument();
    expect(screen.queryByText(/no se imprime\)/i)).toBeNull();
  });

  it("usuario: «@» fija visible, sanitiza en vivo y guarda SIEMPRE con «@»; vacío → null", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /@usuario/i }) as HTMLInputElement;
    expect(input.value).toBe("");

    // Espacios y caracteres inválidos se eliminan; la "@" pegada se normaliza.
    // El draft responde al instante; el commit al store ocurre al blur.
    fireEvent.change(input, { target: { value: "@lucy fotos!_26" } });
    expect(input.value).toBe("lucyfotos_26"); // sin "@" (es adorno fijo)
    expect(overrides(store, "user_name")).toEqual([undefined, undefined]); // aún sin commit
    fireEvent.blur(input);
    expect(overrides(store, "user_name")).toEqual(["@lucyfotos_26", "@lucyfotos_26"]);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(overrides(store, "user_name")).toEqual([undefined, undefined]);
  });

  it("ubicación: input de texto simple — el espacio se imprime como «, » y cada palabra con inicial mayúscula", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /ubicación/i }) as HTMLInputElement;
    expect(input.value).toBe("");
    // El hint explica la regla de máximo 2 palabras.
    expect(screen.getByText(/Máximo 2 palabras/)).toBeInTheDocument();

    // El draft es inmediato; al blur se transforma y compromete en TODOS los slots.
    fireEvent.change(input, { target: { value: "bogotá colombia" } });
    expect(input.value).toBe("bogotá colombia");
    expect(overrides(store, "location")).toEqual([undefined, undefined]);

    fireEvent.blur(input);
    expect(overrides(store, "location")).toEqual(["Bogotá, Colombia", "Bogotá, Colombia"]);
    // Tras el commit el input muestra el valor transformado (como se imprime).
    expect(input.value).toBe("Bogotá, Colombia");
  });

  it("ubicación: máximo 2 palabras en vivo (la tercera no entra) y una sola palabra queda sin coma", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /ubicación/i }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "mi vereda del campo" } });
    expect(input.value).toBe("mi vereda");
    fireEvent.blur(input);
    expect(overrides(store, "location")).toEqual(["Mi, Vereda", "Mi, Vereda"]);

    fireEvent.change(input, { target: { value: "colombia" } });
    fireEvent.blur(input);
    expect(overrides(store, "location")).toEqual(["Colombia", "Colombia"]);

    // Vacío → override null (lo cobra el guard de requeridos).
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(overrides(store, "location")).toEqual([undefined, undefined]);
  });

  it("«me gusta»: solo numérico con miles es-CO, sufijo fijo fuera del input", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /me gusta/i }) as HTMLInputElement;
    expect(input).toHaveAttribute("inputMode", "numeric");

    fireEvent.change(input, { target: { value: "1234" } });
    fireEvent.blur(input);
    // El override guarda el post completo ("1.234 me gusta") — se imprime tal cual.
    expect(overrides(store, "likes_count")).toEqual(["1.234 me gusta", "1.234 me gusta"]);
    expect(input.value).toBe("1.234");
  });

  it("título: contador de caracteres con límite y placeholder con ejemplo", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /título/i }) as HTMLInputElement;
    expect(input.placeholder).toMatch(/^Ej:/);

    // El contador sigue el draft vivo (inmediato, sin esperar el commit).
    fireEvent.change(input, { target: { value: "Domingo de playa" } });
    expect(screen.getByText("16/140")).toBeInTheDocument();
    expect(overrides(store, "caption")).toEqual([undefined, undefined]);

    fireEvent.blur(input);
    expect(overrides(store, "caption")).toEqual(["Domingo de playa", "Domingo de playa"]);
  });

  it("hashtags: chips con «#» fija, agregar con Enter, quitar con × y máximo 3 con aviso", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /hashtags/i }) as HTMLInputElement;
    const add = (tag: string) => {
      fireEvent.change(input, { target: { value: tag } });
      fireEvent.keyDown(input, { key: "Enter" });
    };

    add("playa");
    expect(overrides(store, "hashtags")).toEqual(["#playa", "#playa"]);
    expect(screen.getByText("playa")).toBeInTheDocument();

    add("familia");
    add("viaje2026");
    expect(overrides(store, "hashtags")).toEqual([
      "#playa #familia #viaje2026",
      "#playa #familia #viaje2026",
    ]);

    // 4º hashtag → no entra y avisa claro.
    add("demas");
    expect(screen.getByRole("alert").textContent).toMatch(/Máximo 3 hashtags/i);
    expect(overrides(store, "hashtags")).toEqual([
      "#playa #familia #viaje2026",
      "#playa #familia #viaje2026",
    ]);

    // Quitar un chip con su ×.
    fireEvent.click(screen.getByRole("button", { name: /quitar hashtag playa/i }));
    expect(overrides(store, "hashtags")).toEqual(["#familia #viaje2026", "#familia #viaje2026"]);
  });

  it("muestra el valor compartido cuando TODAS las unidades coinciden", () => {
    const store = makeStore();
    store.getState().setTextOverrideAllSlots("caption", { text: "Domingo de playa" });
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /título/i }) as HTMLInputElement;
    expect(input.value).toBe("Domingo de playa");
    expect(screen.queryByText("Varía por foto")).toBeNull();
  });

  it("estado «Varía por foto»: valores distintos entre unidades → campo vacío con chip, y al escribir se unifica", () => {
    const store = makeStore();
    // Edición individual posterior (modal): las unidades difieren en el título.
    store.getState().setSlotTextOverride(0, "caption", { text: "Cumple de Ana" });
    store.getState().setSlotTextOverride(1, "caption", { text: "Vacaciones 2026" });
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /título/i }) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Varía por foto — escribe para unificar");
    expect(screen.getByText("Varía por foto")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Título único" } });
    fireEvent.blur(input);
    expect(overrides(store, "caption")).toEqual(["Título único", "Título único"]);
    expect(screen.queryByText("Varía por foto")).toBeNull();
    expect(input.value).toBe("Título único");
  });

  it("QA 1.2: masivo → edición individual de UNA foto — el campo conserva el valor pack-level (sin chip) y al escribir se unifica", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);
    const input = screen.getByRole("textbox", { name: /título/i }) as HTMLInputElement;

    // Masivo "Hola" → todos los slots (commit al blur por el debounce).
    fireEvent.change(input, { target: { value: "Hola" } });
    fireEvent.blur(input);
    expect(overrides(store, "caption")).toEqual(["Hola", "Hola"]);

    // Edición individual de la foto 2 (camino del modal del canvas): los demás
    // conservan "Hola" y el campo masivo NO salta ni muestra «Varía por foto».
    act(() => {
      store.getState().setSlotTextOverride(1, "caption", { text: "Chao" });
    });
    expect(overrides(store, "caption")).toEqual(["Hola", "Chao"]);
    expect(input.value).toBe("Hola");
    expect(screen.queryByText("Varía por foto")).toBeNull();

    // Escribir de nuevo en el masivo unifica todo a la primera.
    fireEvent.change(input, { target: { value: "Título único" } });
    fireEvent.blur(input);
    expect(overrides(store, "caption")).toEqual(["Título único", "Título único"]);
    expect(input.value).toBe("Título único");
  });

  it("NO se muestra con otras plantillas (Polaroid Clásica: 1 capa editable, sin asset ig_post)", () => {
    const store = makeStore({
      ...igCanvas(),
      unitTemplate: {
        version: 1,
        stage: { width: 450, height: 600, dpiPreview: 90, dpiProduction: 300 },
        layers: [
          { id: "bg", type: "background", color: "#FFFFFF" },
          {
            id: "message",
            type: "text",
            x: 225,
            y: 512,
            text: "Escribe tu mensaje",
            editable: true,
          },
        ],
      },
    });
    render(<StudioIgPostFields store={store} />);
    expect(screen.queryByText("Datos de la publicación")).toBeNull();
  });
});

describe("StudioIgPostFields — re-aplicado EXPLÍCITO a todos los slots (2026-10-19)", () => {
  // Bug: con un pack ya lleno masivamente, agregar OTRO pack dejaba los slots
  // nuevos sin los textos y el campo masivo no se podía re-aplicar (el commit
  // debounced es no-op cuando el texto no cambió). Solución: los slots nuevos
  // heredan el valor pack-level al crearse (store) + botón «Aplicar estos datos
  // a todas las fotos» que re-escribe todos los slots actuales SIEMPRE.
  it("sin datos llenos el botón NO aparece; con al menos un dato, sí", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);
    expect(screen.queryByRole("button", { name: /aplicar estos datos/i })).toBeNull();

    const userInput = screen.getByRole("textbox", { name: /@usuario/i });
    fireEvent.change(userInput, { target: { value: "lucy" } });
    fireEvent.blur(userInput); // commit debounced → al blur
    expect(screen.getByRole("button", { name: /aplicar estos datos/i })).toBeInTheDocument();
  });

  it("re-aplica el valor pack-level a los slots que quedaron atrás (pack nuevo / edición individual)", () => {
    const store = makeStore(); // 2 slots
    render(<StudioIgPostFields store={store} />);

    // Llenado masivo del título.
    const caption = screen.getByRole("textbox", { name: /título/i });
    fireEvent.change(caption, { target: { value: "Nuestro paseo" } });
    fireEvent.blur(caption);
    expect(overrides(store, "caption")).toEqual(["Nuestro paseo", "Nuestro paseo"]);

    // Se agrega un pack (4 slots) y uno se edita individual (diverge).
    act(() => {
      store.getState().setPhotoSlotsPerUnit(4, { facesPerUnit: 1, max: 6 });
    });
    // Los slots nuevos YA heredaron el valor pack-level (fix del store).
    expect(overrides(store, "caption")).toEqual([
      "Nuestro paseo",
      "Nuestro paseo",
      "Nuestro paseo",
      "Nuestro paseo",
    ]);
    act(() => {
      store.getState().setSlotTextOverride(2, "caption", { text: "Solo esta foto" });
    });
    expect(overrides(store, "caption")[2]).toBe("Solo esta foto");

    // Re-aplicado explícito: el MISMO texto vuelve a TODOS los slots actuales.
    fireEvent.click(screen.getByRole("button", { name: /aplicar estos datos/i }));
    expect(overrides(store, "caption")).toEqual([
      "Nuestro paseo",
      "Nuestro paseo",
      "Nuestro paseo",
      "Nuestro paseo",
    ]);
  });

  it("las capas que «varían por foto» sin valor pack-level no se tocan al re-aplicar", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);
    // Solo se llena el título masivamente; la ubicación queda divergente a mano.
    const caption = screen.getByRole("textbox", { name: /título/i });
    fireEvent.change(caption, { target: { value: "Nuestro paseo" } });
    fireEvent.blur(caption);
    act(() => {
      store.getState().setSlotTextOverride(0, "location", { text: "Bogotá" });
      store.getState().setSlotTextOverride(1, "location", { text: "Medellín" });
    });
    fireEvent.click(screen.getByRole("button", { name: /aplicar estos datos/i }));
    // Ubicación sin valor pack-level (y "varía por foto") → intacta.
    expect(overrides(store, "location")).toEqual(["Bogotá", "Medellín"]);
    expect(overrides(store, "caption")).toEqual(["Nuestro paseo", "Nuestro paseo"]);
  });
});
