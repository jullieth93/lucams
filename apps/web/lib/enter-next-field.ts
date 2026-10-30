/*
 * Enter → siguiente campo (2026-10-29, owner): en móvil no hay TAB; el teclado
 * virtual muestra la tecla de acción y el cliente quiere «pasar al siguiente
 * dato» como en PC (ejemplo del owner: formulario de checkout, datos de
 * publicación de la Polaroid Instagram).
 *
 * Dos piezas:
 *  - `focusNextFieldOnEnter`: handler de onKeyDown para el CONTENEDOR del
 *    formulario (burbuja): un Enter sobre un input de texto mueve el foco al
 *    siguiente control editable visible del contenedor; en el último cierra el
 *    teclado (blur). Respeta los campos que usan Enter con otro sentido
 *    (textarea = salto de línea; inputs con Enter propio que ya llamaron
 *    preventDefault — p.ej. el input de hashtags que crea el tag).
 *  - `tagEnterKeyHints`: pone enterkeyhint="next" a los inputs de texto del
 *    contenedor que no declaren uno (la tecla del teclado virtual se rotula
 *    «siguiente»). Se corre tras cada render del contenedor (campos
 *    condicionales del checkout aparecen/desaparecen según el tipo de destino).
 */

import type { KeyboardEvent } from "react";

const TEXT_LIKE_INPUT_TYPES = new Set([
  "text",
  "email",
  "tel",
  "number",
  "url",
  "search",
  "password",
]);

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="file"]), select, textarea';

export function focusNextFieldOnEnter(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter" || e.defaultPrevented) return;
  const target = e.target as HTMLElement;
  if (target.tagName !== "INPUT") return; // textarea: Enter = salto de línea
  const input = target as HTMLInputElement;
  if (!TEXT_LIKE_INPUT_TYPES.has(input.type)) return;
  const focusables = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
  const idx = focusables.indexOf(input);
  if (idx === -1) return;
  e.preventDefault();
  const next = focusables[idx + 1];
  if (next) next.focus();
  else input.blur(); // último campo: Enter cierra el teclado virtual
}

/** enterkeyhint="next" a los inputs de texto que no declaren uno propio. */
export function tagEnterKeyHints(root: HTMLElement | null) {
  if (!root) return;
  for (const el of root.querySelectorAll<HTMLInputElement>("input")) {
    if (!TEXT_LIKE_INPUT_TYPES.has(el.type)) continue;
    if (!el.getAttribute("enterkeyhint")) el.setAttribute("enterkeyhint", "next");
  }
}
