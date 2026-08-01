// @vitest-environment jsdom
/*
 * Test de componente — AdminTableAutoCards (backlog punto 5: tablas admin
 * como tarjetas en móvil).
 *
 * El componente etiqueta cada <td> del tbody con el texto de su columna del
 * thead (data-label, lo usa el CSS para el rótulo de la tarjeta), activa
 * .admin-cards-on en el wrapper y re-etiqueta si cambian las filas
 * (MutationObserver — navegación RSC al ordenar/filtrar).
 */

import { describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

import { AdminTableAutoCards } from "./admin-table-auto-cards";

afterEach(cleanup);

function renderTable() {
  return render(
    <div data-admin-table="">
      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Cliente</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>LC-1001</td>
            <td>Ana</td>
          </tr>
          <tr>
            <td colSpan={2}>Sin resultados</td>
          </tr>
        </tbody>
      </table>
      <AdminTableAutoCards />
    </div>,
  );
}

describe("AdminTableAutoCards", () => {
  it("etiqueta cada td con el encabezado de su columna y activa el modo tarjetas", () => {
    const { container } = renderTable();

    const cells = container.querySelectorAll("tbody tr:first-child > td");
    expect(cells[0]).toHaveAttribute("data-label", "Número");
    expect(cells[1]).toHaveAttribute("data-label", "Cliente");
    expect(container.querySelector("[data-admin-table]")).toHaveClass("admin-cards-on");
  });

  it("marca como no-etiquetadas las filas con celdas ≠ columnas (colspan) y no les pone rótulo", () => {
    const { container } = renderTable();

    const colspanRow = container.querySelector("tbody tr:nth-child(2)");
    expect(colspanRow).toHaveAttribute("data-cells-unlabeled");
    expect(colspanRow!.querySelector("td")).not.toHaveAttribute("data-label");
  });

  it("re-etiqueta cuando cambian las filas en cliente (MutationObserver)", async () => {
    const { container } = renderTable();

    const tbody = container.querySelector("tbody")!;
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>LC-1002</td><td>Beto</td>";
    tbody.appendChild(tr);

    await waitFor(() => {
      expect(tbody.querySelector("tr:last-child > td")).toHaveAttribute("data-label", "Número");
    });
  });

  it("sin thead no activa nada (degrada a la tabla normal de E2)", () => {
    const { container } = render(
      <div data-admin-table="">
        <table>
          <tbody>
            <tr>
              <td>huérfana</td>
            </tr>
          </tbody>
        </table>
        <AdminTableAutoCards />
      </div>,
    );

    expect(container.querySelector("[data-admin-table]")).not.toHaveClass("admin-cards-on");
    expect(container.querySelector("td")).not.toHaveAttribute("data-label");
  });
});
