"use client";

/*
 * StudioStyleToolbar — Ola 10 (Lucy 2026-07-24).
 *
 * Muestra los controles de ESTILO de la tarjeta justo ARRIBA del canvas, para que
 * el cliente vea el cambio en vivo mientras edita. Reemplaza la ubicación de los
 * controles en el sidebar (donde la acción y el resultado quedaban separados).
 *
 * Controles que se muestran según el producto/plantilla:
 *   - Borde de foto: con borde / sin borde. PRIMERO (Ola 24). En Instagram el
 *     modo sin-borde (rediseño owner 2026-10-05) pone la foto A LO ANCHO
 *     COMPLETO conservando las franjas blancas de header/footer (antes: foto a
 *     sangre total) y el modo viaja como FLAG explícito en canvasData.igNoBorder.
 *   - Color de tarjeta / marco (paleta completa o binario blanco/negro para Instagram).
 *     DEBAJO del borde (Ola 24) y DESACTIVADO cuando el borde es «Sin borde» en la
 *     Polaroid Clásica (la foto cubre toda la tarjeta → el color no aplica), en las
 *     TIRAS photobooth (sin borde ya no hay canaletas entre fotos → borderColor no
 *     pinta nada) y en los CUADRADOS (tarjeta simple: sin borderColor la foto va a
 *     sangre total y el color no pinta nada) — mismo patrón que los sets de letras:
 *     sección visible pero inerte (aria-disabled + atenuada + aviso del porqué).
 *     En Clásica/tiras/cuadrados el estado de color NO se resetea: al volver a
 *     «Con borde» el color elegido sigue ahí.
 *     Instagram SIN BORDE quedó HABILITADA (owner 2026-10-06 — antes se forzaba la
 *     tarjeta blanca al entrar al modo y la paleta quedaba inerte): el color pinta
 *     las franjas de arriba/abajo de la foto (fondo binario blanco/negro con
 *     contraste automático de textos y chrome `_dark_noborder`, la misma maquinaria
 *     del modo con borde) y la tarjeta ya NO se fuerza a blanco al entrar.
 *
 * Presentación por viewport (Fase 2 UX, 2026-10-13):
 *   - <sm: un BOTÓN RESUMEN siempre visible (swatch + nombre del color elegido +
 *     estado del borde) que abre un bottom-sheet (Sheet Radix) con las dos
 *     secciones en grilla (sin scroll horizontal) y un «Listo» sticky que solo
 *     cierra — la selección escribe al MISMO store y aplica en vivo al canvas.
 *   - ≥sm: el apilado de siempre («Borde de foto» arriba, «Color de tarjeta»
 *     debajo), intacto.
 *   El nombre del color elegido queda SIEMPRE visible (junto al título en
 *   desktop, bajo la grilla en el sheet) — refuerzo del indicador de selección.
 *
 * El componente es store-aware: lee la plantilla activa, el color actual y el
 * rect base del placeholder, y escribe en canvasData.borderColor y
 * canvasData.unitTemplate.layers (image-placeholder) via setBorderColor y
 * setImagePlaceholderRect.
 */

import { useRef, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { Frame, Image as ImageIcon, Check, ChevronUp } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { CustomColorPicker } from "@/components/color-picker";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  frameColorById,
  isInstagramTemplate,
  isSimpleCardTemplate,
} from "@/features/personalization/frame-palette";
import type { StudioStoreState } from "./lib/store";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

const LIGHT_HEXES = new Set(["#FFFFFF", "#FFD93D"]);

/** Check legible sobre cualquier color. */
function ActiveCheck({ dark, large = false }: { dark: boolean; large?: boolean }) {
  return (
    <Check
      className={`absolute inset-0 m-auto ${large ? "h-5 w-5" : "h-3.5 w-3.5"}`}
      strokeWidth={3}
      style={{
        color: dark ? "#3D2E5C" : "#FFFFFF",
        filter: "drop-shadow(0 0 2px rgba(0,0,0,0.35))",
      }}
      aria-hidden
    />
  );
}

type StudioStyleToolbarProps = {
  store: StoreApi<StudioStoreState>;
  /** Opciones de marco declaradas por el producto. */
  frameOptions?: string[];
};

export function StudioStyleToolbar({ store, frameOptions = [] }: StudioStyleToolbarProps) {
  const selectedTemplateId = useStore(store, (s) => s.selectedTemplateId);
  const templates = useStore(store, (s) => s.templates);
  const canvasData = useStore(store, (s) => s.canvasData);
  const borderColor = useStore(store, (s) => s.canvasData?.borderColor ?? null);
  const setBorderColor = useStore(store, (s) => s.setBorderColor);
  const setImagePlaceholderRect = useStore(store, (s) => s.setImagePlaceholderRect);
  const texts = useStudioTexts();
  // Cuadrados — último color de marco elegido: «Sin borde» pone borderColor en null
  // SIN perder la elección (regla de no-reset de Clásica/tiras) y «Con borde» la
  // restaura (o cae al primer color de la paleta si nunca hubo una).
  const lastFrameColorRef = useRef<string | null>(null);
  // Fase 2 UX (2026-10-13) — apertura del bottom-sheet de estilo (solo se usa
  // en la rama <sm; la rama ≥sm no lo toca). Declarado antes de los early
  // returns para no romper el orden de hooks.
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);

  if (!canvasData) return null;

  const unitTemplate = canvasData.unitTemplate;
  const isIg = isInstagramTemplate(unitTemplate.layers);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const isPolaroidClasica = selectedTemplate?.slug === "photo-pack-polaroid-clasica";
  // Tira = 1 columna + gap 0 + varios slots (misma detección que isStripPreview del editor).
  const isStrip =
    canvasData.gridLayout.cols === 1 && canvasData.gridLayout.gap === 0 && canvasData.slotCount > 1;
  // Tarjeta simple (Fotoimanes Cuadrados): fondo + foto, sin chrome propio. En estas
  // plantillas el render RECALCULA la ventana de foto con simpleCardPhotoRect a partir
  // de borderColor e ignora el rect del placeholder → el toggle con/sin borde debe
  // escribir borderColor, no la geometría (antes solo movía el rect y el canvas no
  // cambiaba: bug «la variante Con/Sin Borde no hace nada»).
  const isSimpleCard =
    !isIg &&
    !isPolaroidClasica &&
    !isStrip &&
    frameOptions.length > 0 &&
    isSimpleCardTemplate(unitTemplate.layers);

  // Solo mostrar la barra si hay algo configurable.
  const hasConfigurableFrame = frameOptions.length > 0 || isIg || isPolaroidClasica;
  if (!hasConfigurableFrame) return null;

  const stageW = unitTemplate.stage.width;
  const stageH = unitTemplate.stage.height;

  // Rect base "con borde" = el que trae la plantilla original seleccionada.
  const baseRect = (() => {
    if (!selectedTemplate) return null;
    const ph = selectedTemplate.canvasData?.layers?.find((l) => l.type === "image-placeholder") as
      { x: number; y: number; width: number; height: number } | undefined;
    if (!ph) return null;
    const scaleX = stageW / selectedTemplate.canvasData.stage.width;
    const scaleY = stageH / selectedTemplate.canvasData.stage.height;
    return {
      x: Math.round(ph.x * scaleX),
      y: Math.round(ph.y * scaleY),
      width: Math.round(ph.width * scaleX),
      height: Math.round(ph.height * scaleY),
    };
  })();

  // Rect "sin borde":
  //  - Instagram (rediseño owner 2026-10-05): la foto va A LO ANCHO COMPLETO
  //    (sin bordes laterales) pero conserva las franjas blancas superior
  //    (header: usuario/ubicación) e inferior (iconos + likes/título/hashtags),
  //    como un post real de IG → se toma la y/altura de la ventana base y solo
  //    se estira al ancho del stage. El chrome SVG `_noborder` (cabecera +
  //    iconos) queda dentro de las franjas, sin solaparse con la foto.
  //  - Resto (Polaroid Clásica, tiras): la foto cubre TODA la tarjeta/celda y
  //    el chrome se dibuja encima.
  const fullBleedRect =
    isIg && baseRect
      ? { x: 0, y: baseRect.y, width: stageW, height: baseRect.height }
      : { x: 0, y: 0, width: stageW, height: stageH };

  const photoPlaceholder = unitTemplate.layers.find((l) => l.type === "image-placeholder") as
    { x?: number; y?: number; width?: number; height?: number } | undefined;
  const geometryFullBleed =
    !!photoPlaceholder &&
    !!baseRect &&
    ((photoPlaceholder.x ?? 0) !== baseRect.x ||
      (photoPlaceholder.y ?? 0) !== baseRect.y ||
      (photoPlaceholder.width ?? 0) !== baseRect.width ||
      (photoPlaceholder.height ?? 0) !== baseRect.height);
  // Rediseño IG (2026-10-05) — el modo sin-borde de Instagram viaja como FLAG
  // EXPLÍCITO en canvasData.igNoBorder (lo escribe este mismo toggle); la
  // comparación de rects queda como fallback para diseños creados antes del flag.
  // Tarjeta simple (Cuadrados): el modo lo define borderColor — null = foto a
  // sangre total (simpleCardPhotoRect), set = tarjeta de color con franja.
  const isFullBleed = isIg
    ? (canvasData.igNoBorder ?? geometryFullBleed)
    : isSimpleCard
      ? borderColor === null
      : geometryFullBleed;

  // Paleta efectiva: Instagram solo blanco/negro; el resto todas las opciones válidas.
  const frameColors = (frameOptions ?? [])
    .map((id) => frameColorById(id))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .filter((c) => (isIg ? c.id === "blanco" || c.id === "negro" : true));

  const handleBorderChange = (hex: string | null) => {
    setBorderColor(hex);
  };

  const handleBorderToggle = (fullBleed: boolean) => {
    // Tarjeta simple (Cuadrados): el modo vive en borderColor (la geometría la
    // recalcula el render) → «Sin borde» = borderColor null (foto a sangre total);
    // «Con borde» restaura el último color elegido o el primero de la paleta.
    if (isSimpleCard) {
      if (fullBleed) {
        if (borderColor) lastFrameColorRef.current = borderColor;
        setBorderColor(null);
      } else {
        setBorderColor(lastFrameColorRef.current ?? frameColors[0]?.hex ?? null);
      }
      return;
    }
    if (fullBleed) {
      setImagePlaceholderRect(fullBleedRect, isIg ? { igNoBorder: true } : undefined);
      // Owner 2026-10-06 — IG sin borde YA NO fuerza la tarjeta blanca: el color
      // elegido pinta las franjas de arriba/abajo (paleta blanco/negro habilitada
      // en el modo). Clásica y tiras conservan la regla de no-reset intacta.
    } else if (baseRect) {
      setImagePlaceholderRect(baseRect, isIg ? { igNoBorder: false } : undefined);
    }
  };

  // Ola 24 (Lucy 2026-09-09) — en la Polaroid Clásica Y en las TIRAS photobooth, con
  // «Sin borde» la paleta queda desactivada (visible pero inerte, con aviso) hasta
  // volver a «Con borde»: en la Clásica la foto cubre TODA la tarjeta (el color no
  // pinta nada) y en la tira ya no hay canaletas entre fotos (la separación era lo
  // único que pintaba borderColor). El estado de color NO se resetea: al volver a
  // «Con borde» el color elegido sigue ahí (y en la tira vuelve a pintar las
  // canaletas).
  // Instagram SIN BORDE quedó FUERA del apagado (owner 2026-10-06): sus franjas
  // SIGUEN visibles en el modo y el color las pinta (misma regla binaria
  // blanco/negro + contraste automático del modo con borde).
  // CUADRADOS (tarjeta simple) entran al apagado (bug fix 2026-10-12): con «Sin
  // borde» borderColor es null y la foto va a sangre total — el color no pinta
  // nada. En este modo el toggle escribe borderColor (no el rect del placeholder,
  // que el render ignora) y conserva el color elegido para restaurarlo al volver.
  const colorDisabled = (isPolaroidClasica || isStrip || isSimpleCard) && isFullBleed;

  const showBorderSection = isIg || isPolaroidClasica || frameColors.length > 0;
  const showColorSection = frameColors.length > 0;
  // Fase 2 UX (2026-10-13) — nombre del color elegido, SIEMPRE visible: el
  // anillo + check del swatch no bastaban para saber cuál es el color activo.
  // Un hex fuera de la paleta se anuncia como «Personalizado #RRGGBB».
  const selectedColorLabel =
    borderColor === null
      ? texts.texto.estiloSinColor
      : (frameColors.find((c) => c.hex.toUpperCase() === borderColor.toUpperCase())?.label ??
        `${texts.texto.estiloColorPersonalizado} ${borderColor.toUpperCase()}`);
  const borderStateLabel = isFullBleed ? texts.texto.estiloSinBorde : texts.texto.estiloConBorde;
  const styleSummaryText = [
    showColorSection ? selectedColorLabel : null,
    showBorderSection ? borderStateLabel : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const styleSummaryAria = fillStudioText(texts.texto.estiloResumenAria, {
    borde: borderStateLabel,
    color: selectedColorLabel,
  });

  return (
    <>
      {/* ── Móvil (<sm) — botón resumen SIEMPRE visible + bottom-sheet (Fase 2
          UX 2026-10-13). Reemplaza la fila única con scroll horizontal de Ola
          32: no se veía el estado elegido y los labels quedaban apretados. El
          sheet escribe al MISMO store (aplica en vivo al canvas); «Listo» solo
          cierra, no es un wizard con apply. */}
      <div className="mb-3 w-full max-w-xl sm:hidden">
        <button
          type="button"
          onClick={() => setStyleSheetOpen(true)}
          aria-label={styleSummaryAria}
          className="border-brand-purple/10 focus:ring-brand-turquoise flex w-full items-center gap-3 rounded-2xl border bg-white/95 px-4 py-3 text-left shadow-sm transition-colors focus:ring-2 focus:outline-none"
        >
          {showColorSection && (
            <span
              aria-hidden
              className="ring-brand-purple/20 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1"
              style={borderColor ? { backgroundColor: borderColor } : { background: "white" }}
            >
              {borderColor === null && (
                <span className="text-brand-muted text-sm leading-none">∅</span>
              )}
            </span>
          )}
          <span className="min-w-0 flex-1">
            {showColorSection && (
              <span className="text-brand-purple-dark block truncate text-sm font-semibold">
                {selectedColorLabel}
              </span>
            )}
            {showBorderSection && (
              <span className="text-brand-muted block text-xs">{borderStateLabel}</span>
            )}
          </span>
          <ChevronUp className="text-brand-purple h-4 w-4 shrink-0" aria-hidden />
        </button>

        <Sheet open={styleSheetOpen} onOpenChange={setStyleSheetOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[85vh] gap-0 rounded-t-3xl bg-white px-5 pt-3 pb-0"
          >
            {/* Handle de arrastre (adorno visual del bottom-sheet). */}
            <div aria-hidden className="bg-brand-purple/15 mx-auto mb-3 h-1.5 w-10 rounded-full" />
            <SheetHeader className="p-0 pb-3 text-left">
              <SheetTitle className="text-brand-purple-dark font-display text-lg">
                {texts.texto.estiloSheetTitulo}
              </SheetTitle>
              <SheetDescription className="text-brand-muted text-xs">
                {styleSummaryText}
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 overflow-y-auto">
              {/* Borde de foto — mismas opciones Con/Sin de la barra desktop,
                  en grilla de 2 con targets táctiles ≥44px. */}
              {showBorderSection && (
                <section>
                  <span className="text-brand-purple-dark text-sm font-semibold">
                    {texts.texto.estiloBordeTitulo}
                  </span>
                  <div
                    role="radiogroup"
                    aria-label={texts.texto.estiloBordeAria}
                    className="ring-brand-purple/15 mt-2 grid grid-cols-2 gap-2 rounded-xl p-1.5 ring-1"
                  >
                    <BorderOption
                      large
                      active={!isFullBleed}
                      label={texts.texto.estiloConBorde}
                      icon={<Frame className="h-4 w-4" aria-hidden />}
                      onClick={() => handleBorderToggle(false)}
                    />
                    <BorderOption
                      large
                      active={isFullBleed}
                      label={texts.texto.estiloSinBorde}
                      icon={<ImageIcon className="h-4 w-4" aria-hidden />}
                      onClick={() => handleBorderToggle(true)}
                    />
                  </div>
                </section>
              )}

              {/* Color de tarjeta — grilla que envuelve (sin scroll horizontal)
                  + nombre del elegido siempre visible bajo la grilla. */}
              {showColorSection && (
                <div
                  aria-disabled={colorDisabled || undefined}
                  className={["mt-5", colorDisabled ? "opacity-60" : ""].join(" ")}
                >
                  <span className="text-brand-purple-dark text-sm font-semibold">
                    {texts.texto.estiloColorTitulo}
                  </span>
                  <div
                    role="radiogroup"
                    aria-label={texts.texto.estiloColorAria}
                    className="mt-3 grid grid-cols-4 justify-items-center gap-3"
                  >
                    {isIg ? null : (
                      <ColorButton
                        large
                        active={borderColor === null}
                        label={texts.texto.estiloSinColor}
                        onClick={() => handleBorderChange(null)}
                        kind="none"
                        disabled={colorDisabled}
                      />
                    )}
                    {frameColors.map((c) => (
                      <ColorButton
                        large
                        key={c.id}
                        active={borderColor?.toUpperCase() === c.hex.toUpperCase()}
                        color={c.hex}
                        label={c.label}
                        onClick={() => handleBorderChange(c.hex)}
                        disabled={colorDisabled}
                      />
                    ))}
                    {/* Mismo «Personalizado» de la barra desktop (picker propio);
                        su panel inline ocupa toda la fila de la grilla. */}
                    {!isIg && (
                      <CustomColorButton
                        value={borderColor}
                        paletteHexes={frameColors.map((c) => c.hex)}
                        label={texts.texto.estiloColorPersonalizado}
                        onChange={handleBorderChange}
                        disabled={colorDisabled}
                        triggerClassName="h-11 w-11"
                        panelClassName="col-span-full"
                      />
                    )}
                  </div>
                  <p className="text-brand-purple-dark mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold">
                    <Check className="text-brand-turquoise h-4 w-4" strokeWidth={3} aria-hidden />
                    {fillStudioText(texts.texto.estiloColorElegido, {
                      color: selectedColorLabel,
                    })}
                  </p>
                  {colorDisabled ? (
                    <p role="note" className="text-brand-muted mt-2 text-center text-xs">
                      {isStrip
                        ? texts.texto.estiloColorDeshabilitadoHintTira
                        : texts.texto.estiloColorDeshabilitadoHint}
                    </p>
                  ) : (
                    isIg &&
                    isFullBleed && (
                      <p role="note" className="text-brand-muted mt-2 text-center text-xs">
                        {texts.texto.estiloColorSinBordeHintIg}
                      </p>
                    )
                  )}
                </div>
              )}
            </div>

            {/* «Listo» sticky — cierra el sheet (la selección ya aplicó en vivo). */}
            <div className="border-brand-purple/10 sticky bottom-0 -mx-5 mt-4 border-t bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => setStyleSheetOpen(false)}
                className="bg-brand-purple hover:bg-brand-purple-dark focus:ring-brand-purple flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-white transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none"
              >
                {texts.texto.estiloSheetListo}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Desktop (≥sm) — apilado de siempre, SIN cambios de layout (Fase 2 UX:
          solo se agrega el nombre del color elegido junto al título). Las clases
          móviles del contenedor interno quedan inertes (el padre se oculta <sm). */}
      <div className="border-brand-purple/10 mb-3 hidden w-full max-w-xl rounded-2xl border bg-white/95 px-2.5 py-2 shadow-sm sm:mb-4 sm:block sm:px-4 sm:py-3">
        {/* Ola 24 — «Borde de foto» PRIMERO y «Color de tarjeta» DEBAJO (apilados en ≥sm). */}
        <div className="flex items-center gap-3 overflow-x-auto sm:flex-col sm:gap-3 sm:overflow-visible">
          {/* Borde de foto */}
          {showBorderSection && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-brand-purple-dark text-xs font-semibold whitespace-nowrap">
                {texts.texto.estiloBordeTitulo}
              </span>
              <div
                role="radiogroup"
                aria-label={texts.texto.estiloBordeAria}
                className="ring-brand-purple/15 flex gap-1 rounded-lg p-1 ring-1"
              >
                <BorderOption
                  active={!isFullBleed}
                  label={texts.texto.estiloConBorde}
                  icon={<Frame className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => handleBorderToggle(false)}
                />
                <BorderOption
                  active={isFullBleed}
                  label={texts.texto.estiloSinBorde}
                  icon={<ImageIcon className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => handleBorderToggle(true)}
                />
              </div>
            </div>
          )}

          {/* Color de tarjeta */}
          {showColorSection && (
            <div
              aria-disabled={colorDisabled || undefined}
              className={[
                "flex shrink-0 flex-col items-center gap-1",
                colorDisabled ? "opacity-60" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className="text-brand-purple-dark text-xs font-semibold whitespace-nowrap">
                  {texts.texto.estiloColorTitulo}
                </span>
                {/* Fase 2 UX (2026-10-13) — el nombre del color elegido siempre
                    visible junto al título (refuerzo del indicador). */}
                <span className="text-brand-muted text-xs whitespace-nowrap">
                  ·{" "}
                  {fillStudioText(texts.texto.estiloColorElegido, {
                    color: selectedColorLabel,
                  })}
                </span>
                <div
                  role="radiogroup"
                  aria-label={texts.texto.estiloColorAria}
                  // flex-wrap: el panel inline del «Personalizado» cae debajo de
                  // la fila de swatches (basis-full) en vez de ensanchar la fila.
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {isIg ? null : (
                    <ColorButton
                      active={borderColor === null}
                      label={texts.texto.estiloSinColor}
                      onClick={() => handleBorderChange(null)}
                      kind="none"
                      disabled={colorDisabled}
                    />
                  )}
                  {frameColors.map((c) => (
                    <ColorButton
                      key={c.id}
                      active={borderColor?.toUpperCase() === c.hex.toUpperCase()}
                      color={c.hex}
                      label={c.label}
                      onClick={() => handleBorderChange(c.hex)}
                      disabled={colorDisabled}
                    />
                  ))}
                  {/* Color libre (picker propio, paridad en todas las plataformas):
                      solo donde el producto permite color libre (NO en Instagram:
                      blanco/negro por diseño) y sujeto a la misma desactivación
                      por «Sin borde» que los swatches. */}
                  {!isIg && (
                    <CustomColorButton
                      value={borderColor}
                      paletteHexes={frameColors.map((c) => c.hex)}
                      label={texts.texto.estiloColorPersonalizado}
                      onChange={handleBorderChange}
                      disabled={colorDisabled}
                    />
                  )}
                </div>
              </div>
              {colorDisabled ? (
                <p role="note" className="text-brand-muted text-center text-xs">
                  {isStrip
                    ? texts.texto.estiloColorDeshabilitadoHintTira
                    : texts.texto.estiloColorDeshabilitadoHint}
                </p>
              ) : (
                isIg &&
                isFullBleed && (
                  // Owner 2026-10-06 — en IG «Sin borde» la paleta queda ACTIVA:
                  // el aviso explica qué pinta el color (las franjas del post).
                  <p role="note" className="text-brand-muted text-center text-xs">
                    {texts.texto.estiloColorSinBordeHintIg}
                  </p>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function BorderOption({
  active,
  label,
  icon,
  onClick,
  large = false,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Fase 2 UX (2026-10-13) — variante del bottom-sheet móvil (target táctil ≥44px). */
  large?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={[
        "focus:ring-brand-turquoise flex items-center justify-center gap-1.5 rounded-md font-semibold transition-all focus:ring-2 focus:outline-none",
        large ? "min-h-11 px-4 py-3 text-sm" : "px-2.5 py-1.5 text-xs",
        active
          ? "bg-brand-purple text-white shadow-sm"
          : "text-brand-purple-dark/70 hover:bg-brand-purple/10",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function ColorButton({
  active,
  color,
  label,
  onClick,
  kind = "color",
  disabled = false,
  large = false,
}: {
  active: boolean;
  color?: string;
  label: string;
  onClick: () => void;
  kind?: "color" | "none";
  /** Ola 24 — paleta desactivada por «Sin borde» (queda visible pero inerte). */
  disabled?: boolean;
  /** Fase 2 UX (2026-10-13) — variante del bottom-sheet móvil (44px táctil). */
  large?: boolean;
}) {
  return (
    <Hint content={label}>
      {/* Wrapper focusable: el botón disabled no recibe hover/foco (el tooltip
          explica por qué la paleta está apagada con «Sin borde»). */}
      <span tabIndex={0} className="inline-flex">
        <button
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={[
            "focus:ring-brand-turquoise relative flex cursor-pointer items-center justify-center rounded-full transition-all focus:ring-2 focus:outline-none",
            large ? "h-11 w-11" : "h-8 w-8",
            "disabled:cursor-not-allowed",
            active
              ? "ring-brand-turquoise shadow-md ring-2 ring-offset-2"
              : "ring-brand-purple/20 hover:ring-brand-purple/50 ring-1",
          ].join(" ")}
          style={kind === "none" ? { background: "white" } : { backgroundColor: color }}
        >
          {kind === "none" ? (
            <span className="text-brand-muted text-lg leading-none" aria-hidden>
              ∅
            </span>
          ) : active ? (
            <ActiveCheck large={large} dark={LIGHT_HEXES.has(color?.toUpperCase() ?? "")} />
          ) : null}
        </button>
      </span>
    </Hint>
  );
}

/**
 * Opción «Personalizado» de la paleta de tarjeta: picker propio
 * (components/color-picker.tsx, paridad en todas las plataformas). El hex entra
 * al mismo estado `borderColor` que un swatch (persiste en el diseño y viaja a
 * producción igual). El panel inline cae DEBAJO de la fila de swatches
 * (basis-full en el radiogroup flex-wrap; col-span-full en la grilla del sheet).
 */
function CustomColorButton({
  value,
  paletteHexes,
  label,
  onChange,
  disabled = false,
  triggerClassName = "h-8 w-8",
  panelClassName = "w-full basis-full",
}: {
  /** borderColor actual (null = sin color). */
  value: string | null;
  /** Hexes de la paleta curada — un valor fuera de ella es el "personalizado". */
  paletteHexes: string[];
  label: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  /** Tamaño del swatch trigger (el sheet móvil usa "h-11 w-11", ≥44px táctil). */
  triggerClassName?: string;
  /** Colocación del panel inline en el contenedor padre. */
  panelClassName?: string;
}) {
  const palette = new Set(paletteHexes.map((h) => h.toUpperCase()));
  const customValue = value && !palette.has(value.toUpperCase()) ? value : null;
  return (
    <CustomColorPicker
      value={customValue}
      onChange={onChange}
      label={label}
      disabled={disabled}
      active={customValue !== null}
      hint={label}
      className={triggerClassName}
      panelClassName={panelClassName}
    />
  );
}
