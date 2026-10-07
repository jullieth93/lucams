// @vitest-environment jsdom

/*
 * Test del bloque de diligenciamiento MASIVO de la Polaroid Instagram (Fase 1B,
 * owner 2026-09; REDISEÑO ASISTIDO owner 2026-10-05): la sección "Datos de la
 * publicación" del sidebar es el equivalente multi-campo de "Tu mensaje"
 * (Polaroid Clásica) — un CONTROL ASISTIDO por capa editable IG que escribe el
 * override en TODOS los slots vía setTextOverrideAllSlots:
 *  - @usuario: "@" fija fuera del input, sanitización en vivo.
 *  - Ubicación: combobox con búsqueda (2.7b — antes datalist nativo): filtra
 *    «Ciudad, País» por ciudad y país, teclado accesible y texto libre.
 *  - «Me gusta»: OBLIGATORIO (rediseño), solo numérico, miles es-CO, sufijo fijo.
 *  - Título: contador n/140.
 *  - Hashtags: chips agregar/quitar, máximo 3, "#" fija.
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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    for (const label of ["@usuario", "«Me gusta»", "Título", "Hashtags"]) {
      expect(screen.getByRole("textbox", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
    // La ubicación es un combobox con búsqueda (2.7b; antes datalist).
    expect(screen.getByRole("combobox", { name: /ubicación/i })).toBeInTheDocument();
    expect(screen.getByRole("note").textContent).toMatch(/TODAS las fotos del set/i);
  });

  it("las 5 capas se anuncian como obligatorias (rediseño: «me gusta» ya no es opcional)", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    expect(screen.getByRole("combobox", { name: /ubicación.*obligatorio/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /me gusta.*obligatorio/i })).toBeInTheDocument();
    expect(screen.queryByText(/no se imprime\)/i)).toBeNull();
  });

  it("usuario: «@» fija visible, sanitiza en vivo y guarda SIEMPRE con «@»; vacío → null", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /@usuario/i }) as HTMLInputElement;
    expect(input.value).toBe("");

    // Espacios y caracteres inválidos se eliminan; la "@" pegada se normaliza.
    fireEvent.change(input, { target: { value: "@lucy fotos!_26" } });
    expect(overrides(store, "user_name")).toEqual(["@lucyfotos_26", "@lucyfotos_26"]);
    expect(input.value).toBe("lucyfotos_26"); // sin "@" (es adorno fijo)

    fireEvent.change(input, { target: { value: "" } });
    expect(overrides(store, "user_name")).toEqual([undefined, undefined]);
  });

  it("ubicación: combobox con búsqueda — filtra por ciudad Y país (insensible a tildes) y escribe en todos los slots", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("combobox", { name: /ubicación/i }) as HTMLInputElement;
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");

    // Al enfocar se abre el listbox con TODAS las sugerencias.
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    const allOptions = screen.getAllByRole("option");
    expect(allOptions.length).toBeGreaterThan(20);
    expect(allOptions.map((o) => o.textContent)).toContain("Medellín, Colombia");

    // Filtra por ciudad sin tildes ("medellin" ≈ "Medellín")…
    fireEvent.change(input, { target: { value: "medellin" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Medellín, Colombia"]);
    // …y el tipeo también compromete el texto libre en TODOS los slots.
    expect(overrides(store, "location")).toEqual(["medellin", "medellin"]);

    // Filtra por PAÍS ("españa" → las dos ciudades de España).
    fireEvent.change(input, { target: { value: "españa" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Madrid, España",
      "Barcelona, España",
    ]);
  });

  it("ubicación: teclado accesible — flechas mueven aria-activedescendant, Enter elige, Escape cierra", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("combobox", { name: /ubicación/i }) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "bogo" } });

    // Flecha abajo activa la primera opción y la referencia vía aria-activedescendant.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    const active = document.getElementById(activeId!)!;
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active.textContent).toBe("Bogotá, Colombia");

    // Enter compromete la sugerencia activa en TODOS los slots y cierra el listbox.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(overrides(store, "location")).toEqual(["Bogotá, Colombia", "Bogotá, Colombia"]);
    expect(input.value).toBe("Bogotá, Colombia");
    expect(screen.queryByRole("option")).toBeNull();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("ubicación: Escape cierra el listbox sin comprometer la opción activa", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("combobox", { name: /ubicación/i }) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cali" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("option")).toBeNull();
    // El texto libre se conserva (no se reemplazó por la sugerencia activa).
    expect(input.value).toBe("cali");
    expect(overrides(store, "location")).toEqual(["cali", "cali"]);
  });

  it("ubicación: click en una opción la compromete; texto libre sin coincidencias avisa pero vale", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("combobox", { name: /ubicación/i }) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "cart" } });
    fireEvent.click(screen.getByRole("option", { name: "Cartagena, Colombia" }));
    expect(overrides(store, "location")).toEqual(["Cartagena, Colombia", "Cartagena, Colombia"]);
    expect(screen.queryByRole("option")).toBeNull();

    // Texto libre sin coincidencias: se guarda tal cual y avisa que igual se imprime.
    fireEvent.change(input, { target: { value: "Mi vereda del campo" } });
    expect(overrides(store, "location")).toEqual(["Mi vereda del campo", "Mi vereda del campo"]);
    expect(screen.getByRole("status").textContent).toMatch(/Sin coincidencias/);
  });

  it("«me gusta»: solo numérico con miles es-CO, sufijo fijo fuera del input", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /me gusta/i }) as HTMLInputElement;
    expect(input).toHaveAttribute("inputMode", "numeric");

    fireEvent.change(input, { target: { value: "1234" } });
    // El override guarda el post completo ("1.234 me gusta") — se imprime tal cual.
    expect(overrides(store, "likes_count")).toEqual(["1.234 me gusta", "1.234 me gusta"]);
    expect(input.value).toBe("1.234");
  });

  it("título: contador de caracteres con límite y placeholder con ejemplo", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);

    const input = screen.getByRole("textbox", { name: /título/i }) as HTMLInputElement;
    expect(input.placeholder).toMatch(/^Ej:/);

    fireEvent.change(input, { target: { value: "Domingo de playa" } });
    expect(overrides(store, "caption")).toEqual(["Domingo de playa", "Domingo de playa"]);
    expect(screen.getByText("16/140")).toBeInTheDocument();
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
    expect(overrides(store, "caption")).toEqual(["Título único", "Título único"]);
    expect(screen.queryByText("Varía por foto")).toBeNull();
    expect(input.value).toBe("Título único");
  });

  it("QA 1.2: masivo → edición individual de UNA foto — el campo conserva el valor pack-level (sin chip) y al escribir se unifica", () => {
    const store = makeStore();
    render(<StudioIgPostFields store={store} />);
    const input = screen.getByRole("textbox", { name: /título/i }) as HTMLInputElement;

    // Masivo "Hola" → todos los slots.
    fireEvent.change(input, { target: { value: "Hola" } });
    expect(overrides(store, "caption")).toEqual(["Hola", "Hola"]);

    // Edición individual de la foto 2 (camino del modal del canvas): los demás
    // conservan "Hola" y el campo masivo NO salta ni muestra «Varía por foto».
    store.getState().setSlotTextOverride(1, "caption", { text: "Chao" });
    expect(overrides(store, "caption")).toEqual(["Hola", "Chao"]);
    expect(input.value).toBe("Hola");
    expect(screen.queryByText("Varía por foto")).toBeNull();

    // Escribir de nuevo en el masivo unifica todo a la primera.
    fireEvent.change(input, { target: { value: "Título único" } });
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
