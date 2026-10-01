/*
 * Layout del Estudio (/estudio/*).
 *
 * Define las CSS vars `--font-*` de las 6 tipografías del selector del
 * calendario (declaradas en ./fonts.ts — antes en el root layout; ver ahí el
 * porqué del movimiento, 2026-10-01). Van en un wrapper con `data-studio-fonts`
 * porque el canvas resuelve los nombres hasheados de next/font leyendo
 * `getComputedStyle` de ESE elemento (calendar-card-preview.ts), con fallback
 * a document.documentElement.
 *
 * `contents` (display: contents): el wrapper no genera caja propia — no altera
 * el layout flex/min-h-screen de la página del Estudio; solo porta las vars.
 */
import { baloo2, caveat, dancing, nunito, patrick, playfair } from "./fonts";

export default function EstudioLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      data-studio-fonts
      className={`${caveat.variable} ${baloo2.variable} ${nunito.variable} ${patrick.variable} ${playfair.variable} ${dancing.variable} contents`}
    >
      {children}
    </div>
  );
}
