// @vitest-environment jsdom
/*
 * Test de componente — ProductsFilters + ActiveFilterChips (Lucy 2026-07-03).
 *
 * Filtros del catálogo /productos. El estado vive en la URL: cada interacción
 * arma un URLSearchParams y hace router.push. Aquí MOCKEAMOS next/navigation
 * (useRouter/useSearchParams) para (a) inyectar params iniciales y verificar el
 * estado activo reflejado, y (b) capturar EXACTAMENTE la URL que empuja al router.
 *
 * Gotchas heredados de product-card.test.tsx:
 *  - jest-dom/vitest para matchers; cleanup() en afterEach (globals:false → sin
 *    auto-cleanup los renders se acumulan y los tests se contaminan).
 *  - Queries accesibles (getByRole/getByLabelText), no selectores de clase.
 * Gotchas propios de este componente:
 *  - apply() usa window.setTimeout (debounce 300ms búsqueda / 0ms el resto /
 *    500ms slider) y router.push corre dentro de startTransition → usamos
 *    fake timers + act(vi.runAllTimers()) para vaciar el debounce y la
 *    transición antes de asertar sobre push.
 *  - El <Slider> de Radix necesita ResizeObserver, ausente en jsdom → stub.
 *  - El <select> "Ordenar por" NO tiene htmlFor/id → se consulta por rol
 *    combobox (getByLabelText no lo encontraría).
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

// Radix Slider observa el tamaño del track; jsdom no trae ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// Mock de next/navigation: push capturable + searchParams inyectables por test.
const push = vi.fn();
let currentParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => currentParams,
}));

import { ProductsFilters, ActiveFilterChips } from "./products-filters";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  push.mockClear();
  currentParams = new URLSearchParams();
});

const categories = [
  { id: "c1", slug: "fotoimanes", name: "Fotoimanes", parentId: null, _count: { products: 5 } },
  { id: "c2", slug: "llaveros", name: "Llaveros", parentId: null, _count: { products: 3 } },
  // sub-categoría de fotoimanes (c1) → solo visible con el padre activo.
  { id: "c3", slug: "corazon", name: "Corazón", parentId: "c1", _count: { products: 2 } },
];
const priceRange = { min: 1000, max: 100000 };

/** Renderiza los filtros, opcionalmente con params iniciales en la URL. */
function renderFilters(initialSearch?: string) {
  if (initialSearch) currentParams = new URLSearchParams(initialSearch);
  return render(<ProductsFilters categories={categories} priceRange={priceRange} />);
}

/** Vacía el debounce (setTimeout) + la startTransition pendiente. */
function flush() {
  act(() => {
    vi.runAllTimers();
  });
}

// ─── Empuje de parámetros al router ──────────────────────────────────────────

describe("ProductsFilters — push de parámetros a la URL", () => {
  it("búsqueda empuja q trimmeado tras el debounce de 300ms", () => {
    vi.useFakeTimers();
    renderFilters();
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "  fotoiman  " } });

    // Antes de vaciar el timer no debe haber navegado (debounce).
    expect(push).not.toHaveBeenCalled();

    flush();
    expect(push).toHaveBeenCalledWith("/productos?q=fotoiman");
  });

  it("seleccionar categoría empuja ?categoria=<slug>", () => {
    vi.useFakeTimers();
    renderFilters();
    fireEvent.click(screen.getByRole("radio", { name: /Fotoimanes/ }));
    flush();
    expect(push).toHaveBeenCalledWith("/productos?categoria=fotoimanes");
  });

  it("cambiar el orden empuja ?orden=<valor> (recent es el default y se omite)", () => {
    vi.useFakeTimers();
    renderFilters();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "price-asc" } });
    flush();
    expect(push).toHaveBeenCalledWith("/productos?orden=price-asc");
  });

  it("marcar 'Personalizable' empuja ?personalizable=1", () => {
    vi.useFakeTimers();
    renderFilters();
    fireEvent.click(screen.getByRole("checkbox", { name: "Personalizable" }));
    flush();
    expect(push).toHaveBeenCalledWith("/productos?personalizable=1");
  });

  it("varios checkboxes se combinan en un solo query string", () => {
    vi.useFakeTimers();
    renderFilters();
    fireEvent.click(screen.getByRole("checkbox", { name: "Personalizable" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Con descuento" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Destacados" }));
    flush();
    // El último push refleja el estado acumulado de los tres flags.
    expect(push).toHaveBeenLastCalledWith("/productos?personalizable=1&descuento=1&destacados=1");
  });

  it("'Aplicar' re-empuja el estado actual conservando la categoría preseleccionada", () => {
    vi.useFakeTimers();
    renderFilters("categoria=llaveros");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    flush();
    expect(push).toHaveBeenCalledWith("/productos?categoria=llaveros");
  });
});

// ─── Limpiar filtros ─────────────────────────────────────────────────────────

describe("ProductsFilters — limpiar filtros", () => {
  it("'Reiniciar' empuja /productos sin query string y no espera al debounce", () => {
    vi.useFakeTimers();
    renderFilters("categoria=fotoimanes&personalizable=1&q=hola");
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar" }));
    // clearAll navega dentro de startTransition; runAllTimers vacía la transición.
    flush();
    expect(push).toHaveBeenCalledWith("/productos");
  });

  it("'Reiniciar' está deshabilitado cuando no hay filtros activos", () => {
    renderFilters();
    expect(screen.getByRole("button", { name: "Reiniciar" })).toBeDisabled();
  });

  it("'Reiniciar' se habilita cuando hay al menos un filtro activo", () => {
    renderFilters("personalizable=1");
    expect(screen.getByRole("button", { name: "Reiniciar" })).toBeEnabled();
  });
});

// ─── Estado activo reflejado desde la URL ────────────────────────────────────

describe("ProductsFilters — estado activo reflejado desde searchParams", () => {
  it("hidrata q, categoría (aria-checked), personalizable y orden desde la URL", () => {
    renderFilters("categoria=fotoimanes&personalizable=1&q=hola&orden=name");

    expect(screen.getByLabelText<HTMLInputElement>("Buscar")).toHaveValue("hola");
    expect(screen.getByRole("radio", { name: /Fotoimanes/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // "Todas" (slug vacío) queda inactiva cuando hay categoría seleccionada.
    expect(screen.getByRole("radio", { name: "Todas" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: "Personalizable" })).toBeChecked();
    expect(screen.getByRole("combobox")).toHaveValue("name");
  });

  it("sin params: 'Todas' activa, checkboxes sin marcar y orden en 'recent'", () => {
    renderFilters();
    expect(screen.getByRole("radio", { name: "Todas" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "Personalizable" })).not.toBeChecked();
    expect(screen.getByRole("combobox")).toHaveValue("recent");
  });

  it("la sub-categoría se muestra solo al activar su categoría padre", () => {
    vi.useFakeTimers();
    renderFilters();
    // 'Corazón' (hija de fotoimanes) no está listada mientras el padre no esté activo.
    expect(screen.queryByRole("radio", { name: /Corazón/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Fotoimanes/ }));
    flush();
    expect(screen.getByRole("radio", { name: /Corazón/ })).toBeInTheDocument();
  });

  it("muestra el conteo de productos por categoría", () => {
    renderFilters();
    // Fotoimanes tiene _count.products = 5.
    expect(screen.getByRole("radio", { name: /Fotoimanes/ })).toHaveTextContent("5");
  });
});

// ─── ActiveFilterChips ───────────────────────────────────────────────────────

describe("ActiveFilterChips", () => {
  it("no renderiza nada cuando no hay filtros en la URL", () => {
    currentParams = new URLSearchParams();
    const { container } = render(<ActiveFilterChips categories={categories} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza un chip por filtro activo, usando el nombre de la categoría", () => {
    currentParams = new URLSearchParams("categoria=fotoimanes&q=hola&personalizable=1");
    render(<ActiveFilterChips categories={categories} />);

    // La búsqueda se muestra entre comillas; la categoría por su name (no su slug).
    expect(screen.getByRole("button", { name: /"hola"/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fotoimanes/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Personalizable/ })).toBeInTheDocument();
  });

  it("chips de precio muestran 'Desde'/'Hasta' con el valor de minPrice/maxPrice", () => {
    currentParams = new URLSearchParams("minPrice=5000&maxPrice=90000");
    render(<ActiveFilterChips categories={categories} />);
    // #7 — los chips muestran el precio formateado en COP ($ 50 / $ 900), no los
    // centavos crudos (5000/90000). El valor en la URL sigue en centavos:
    // 5000 centavos = $ 50, 90000 centavos = $ 900.
    expect(screen.getByRole("button", { name: /Desde\s*\$\s*50\b/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hasta\s*\$\s*900\b/ })).toBeInTheDocument();
  });

  it("click en un chip remueve SOLO ese param y conserva el resto", () => {
    currentParams = new URLSearchParams("categoria=fotoimanes&q=hola&personalizable=1");
    render(<ActiveFilterChips categories={categories} />);

    fireEvent.click(screen.getByRole("button", { name: /Fotoimanes/ }));
    // categoria eliminado; q y personalizable preservados.
    expect(push).toHaveBeenCalledWith("/productos?q=hola&personalizable=1");
  });

  it("remover el último filtro navega a /productos sin query string", () => {
    currentParams = new URLSearchParams("personalizable=1");
    render(<ActiveFilterChips categories={categories} />);
    fireEvent.click(screen.getByRole("button", { name: /Personalizable/ }));
    expect(push).toHaveBeenCalledWith("/productos");
  });
});
