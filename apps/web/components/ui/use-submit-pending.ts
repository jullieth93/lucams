"use client";

/*
 * Estado "enviando" de un botón de submit, tomado del formulario que lo contiene.
 *
 * Por qué existe (reporte de Lucy, 2026-07-25): los botones que disparan una Server Action no daban
 * ninguna señal al pulsarlos. La acción tarda —hay ida y vuelta al servidor— y el botón se veía
 * igual que antes, así que la reacción natural es volver a pulsarlo. En el mejor caso es una
 * sensación de que "no cogió"; en el peor, la acción se ejecuta varias veces.
 *
 * `useFormStatus` lee el estado del `<form>` ANCESTRO, así que el botón se entera solo: no hay que
 * cablear un `loading` a mano en cada sitio ni acordarse de hacerlo en los que se agreguen mañana.
 * Requisito del hook: el componente que lo llama debe estar DENTRO del form, nunca ser el form.
 */

import { useFormStatus } from "react-dom";

export function useSubmitPending(): boolean {
  return useFormStatus().pending;
}
