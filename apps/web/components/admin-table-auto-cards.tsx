"use client";

/*
 * <AdminTableAutoCards> — tablas del admin como TARJETAS apiladas en móvil
 * (<640px). Backlog del punto 5: pendiente deliberado de E2 ("el scroll con
 * pista es el piso usable; las tarjetas son el salto de comodidad").
 *
 * Cómo funciona: al montar, lee los encabezados del <thead> de la tabla
 * hermana y etiqueta cada <td> del <tbody> con `data-label` (columna a
 * columna). Luego activa `.admin-cards-on` en el wrapper `[data-admin-table]`
 * y el CSS de globals.css hace el resto (tabla → bloques, cada fila = tarjeta,
 * cada celda muestra su rótulo vía `td::before { content: attr(data-label) }`).
 *
 * Filas "raras" (celdas ≠ columnas, ej. colspan de empty-state) quedan marcadas
 * con `data-cells-unlabeled` y el CSS las muestra a ancho completo sin rótulo.
 *
 * Un MutationObserver re-etiqueta si las filas cambian en cliente (navegación
 * RSC al ordenar/filtrar, editores inline). Los data-* que React no conoce
 * sobreviven a re-renders de las celdas.
 *
 * Sin JS (SSR sin hidratar, o fallo) nada se activa: queda la tabla con el
 * scroll horizontal + pista de E2 — el piso usable de siempre.
 */

import { useEffect, useRef } from "react";

export function AdminTableAutoCards() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrapper = ref.current?.closest<HTMLElement>("[data-admin-table]");
    const table = wrapper?.querySelector("table");
    if (!wrapper || !table) return;

    const labels = Array.from(table.querySelectorAll("thead th")).map(
      (th) => th.textContent?.trim() ?? "",
    );
    if (labels.length === 0) return;

    const labelRows = () => {
      for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
        const cells = Array.from(row.querySelectorAll(":scope > td"));
        if (cells.length !== labels.length) {
          row.setAttribute("data-cells-unlabeled", "");
          continue;
        }
        row.removeAttribute("data-cells-unlabeled");
        cells.forEach((td, i) => td.setAttribute("data-label", labels[i] ?? ""));
      }
    };

    labelRows();
    wrapper.classList.add("admin-cards-on");

    const observer = new MutationObserver(labelRows);
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <span ref={ref} hidden />;
}
