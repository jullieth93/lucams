"use client";

/*
 * StudioSlot — 1 mini-canvas Konva = 1 imán físico del pack.
 *
 * El componente core del editor multi-slot (M.3.b Capa 2). Cada slot
 * tiene 6 estados visuales distintos (empty / hover / dropping / filled
 * / selected / error) definidos en README del estudio.
 *
 * Interacciones soportadas:
 *   - Click / tap → abre el modal de asset picker (selección de foto)
 *   - Drag-over con asset desde sidebar → estado "dropping"
 *   - Drop con asset → assignAssetToSlot
 *   - Keyboard:
 *       Tab          → focus next/prev slot
 *       Enter / Space → abre asset picker
 *       Delete       → quitarle la foto (clearSlot)
 *       Arrows       → navegar entre slots adyacentes en el grid
 *
 * Accessibility:
 *   - role="button" con aria-label dinámico ("Slot 1 de 6, vacío" /
 *     "Slot 3 de 6, con foto cargada")
 *   - aria-pressed cuando está selected
 *   - Focus visible siempre con ring brand-turquoise
 *
 * El Konva Stage se monta solo cuando el slot está visible (lazy via
 * IntersectionObserver del padre — Capa 2.5 si performance lo pide).
 * Por ahora todos los slots se montan al inicio.
 */

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, RotateCcw, Pencil } from "lucide-react";
import { LucamsLogo } from "@/components/lucams-logo";
import { Stage, Layer, Rect, Image as KonvaImage, Group, Text, Circle, Path } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { FilterFunction } from "konva/lib/Node";
// Import filters específicos (no `import Konva from "konva"` que duplica instancia
// y dispara warning "Several Konva instances detected" rompiendo useImage).
// react-konva ya carga Konva runtime; acá solo necesitamos las funciones filter.
import { Brighten } from "konva/lib/filters/Brighten";
import { Contrast } from "konva/lib/filters/Contrast";
import { Grayscale } from "konva/lib/filters/Grayscale";
import { HSL } from "konva/lib/filters/HSL";
import type {
  CanvasDataV1,
  CanvasLayer,
  FrameCardLayer,
  ImagePlaceholderLayer,
  ProfilePhotoLayer,
  SlotState,
  StudioAsset,
  TextLayer,
} from "./types";
import {
  isDarkColor,
  defaultTextFillOnCard,
  frameBleedMargin,
  insetToMinMargin,
  isSimpleCardTemplate,
  simpleCardPhotoRect,
  isStripTemplate,
  stripPhotoRect,
  stripPositionOf,
  isStripBorderless,
  isInstagramTemplate,
  instagramBackgroundHex,
  noBorderChromeSrc,
  isInstagramNoBorder,
  photoBackingHexFor,
} from "@/features/personalization/frame-palette";
import { igTextFill } from "@/features/personalization/instagram-template-spec";
import { RealismShadowLayer, RealismOverlayLayer } from "./studio-realism-overlay";
import { CalendarCardLayer } from "./studio-calendar-card-layer";
import type { CalendarLayoutKey } from "@/features/personalization/calendar-layout";
import type { CalendarFontKey } from "@/features/personalization/schemas";

import { getFilterParams } from "./lib/photo-filters";
import { analyzeSmartCrop, checkPhotoQuality } from "./lib/smart-crop";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";
import { PLACEHOLDER_GUIDE_OPACITY, SLOT_GUIDE_COLORS } from "./studio-brand";

const FOCUS_RING = "0 0 0 3px rgb(93 217 209)"; // brand-turquoise

// Ola 24 (Lucy 2026-09-09) — zoom "milimétrico" de la foto: paso multiplicativo FINO
// por notch de rueda (×1.04 ≈ 4% por tick; antes ×1.15 — saltos toscos que no dejaban
// afinar el encuadre). Compartido por el slot (handler Konva + listener nativo) y el
// preview del modal de edición (studio-photo-preview) → misma sensación en ambas
// superficies. El pinch sigue continuo (ratio de distancia entre dedos) — no tiene paso.
export const WHEEL_ZOOM_STEP = 1.04;

/** Próximo scale de la foto tras un evento de rueda (deltaY > 0 = alejar), clampado. */
export function nextWheelScale(current: number, deltaY: number, min = 0.5, max = 3): number {
  const factor = deltaY > 0 ? 1 / WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
  return Math.max(min, Math.min(max, current * factor));
}

// Ola 24 (Lucy 2026-09-09) — bandeja cuadriculada gris/blanco (el patrón de
// "transparencia" de los editores de foto) para que la tarjeta BLANCA se lea
// sobre el lienzo claro del Estudio (white-on-white). Adorno 100% de pantalla:
// vive en el DOM alrededor del Stage, nunca entra al snapshot de producción.
// Ola 25 — exportados para reutilizar la MISMA bandeja en el preview del modal
// de edición (studio-photo-preview): la tarjeta blanca también se perdía contra
// el fondo blanco del modal.
// Ola 26 (Lucy 2026-09-09) — "muy leve": cuadrados más oscuros (#CDC7DB, antes
// #ECE9F1 — casi indistinguible del blanco) y un poco más grandes (16px, antes
// 12px), con la bandeja un poco más ancha (8px) → la tarjeta blanca se lee de
// inmediato sobre el crema del Estudio y el blanco del modal.
export const WHITE_CARD_CHECKER = "repeating-conic-gradient(#CDC7DB 0% 25%, #FFFFFF 0% 50%)";
export const WHITE_CARD_CHECKER_SIZE = "16px 16px";
export const WHITE_CARD_TRAY_PAD = 8;

type StudioSlotProps = {
  slotState: SlotState;
  unitTemplate: CanvasDataV1;
  /** Ancho lógico del slot en pantalla. Si no se pasa displayHeight, se usa
   * el aspect ratio del unitTemplate.stage para calcular height (FIX-1). */
  displaySize: number;
  /** Alto lógico del slot en pantalla. Si se omite, deriva del aspect ratio
   * del unitTemplate. Importante: el slot DEBE respetar el aspect físico
   * del producto (7×9 cm = vertical, no cuadrado). */
  displayHeight?: number;
  isSelected: boolean;
  totalSlots: number;
  /** ADR-057 Fase D — etiqueta del slot (ej. "Enero" para calendarios). Si se pasa, reemplaza
   * "Imán #N" para que el cliente sepa qué foto va en qué mes. */
  slotLabel?: string;
  /** #14 — sustantivo del slot según el producto: "imán" por defecto, "separador" en separadores de
   * libros (pantalla=físico). Solo aplica al fallback "{Noun} #N" y al aria-label; el slotLabel
   * explícito (calendario) manda sobre él. */
  slotNoun?: string;
  /** M.3.b.A2.5 — Tamaño físico del imán (ej "5×5 cm") leído del product.personalizationSchema.sizeCm. */
  sizeCm?: string;
  /** M.3.b.B.1 — forma física del imán para overlay realismo. */
  shape?: "rectangle" | "circle" | "heart" | "custom";
  /** M.3.b.B.1 — acabado físico para overlay glossy. */
  finish?: "matte" | "glossy" | "soft-touch" | "glass";
  /** M.3.b.B.1 — cornerRadius en px del imán físico (solo aplica si shape=rectangle). */
  cornerRadiusPx?: number;
  /** M.3.b.B.1 — toggle global para mostrar bleed + safe guides. */
  showRealismGuides?: boolean;
  /** Ola 2A — color del marco alrededor de la foto (hex #RRGGBB). null = sin marco. */
  borderColor?: string | null;
  /**
   * Ola 3b (Lucy 2026-07-22) — el producto ofrece marcos de color (frameOptions).
   * Con borderColor la tarjeta completa se pinta del color y la foto va INSERTA
   * (frame-card full-bleed, "el color llega al fin del papel"), en vez del stroke
   * sobre tarjeta blanca de Ola 2A. Producción replica la misma regla (WYSIWYG).
   */
  frameFullBleed?: boolean;
  /**
   * Ola 3c — modo TIRA (gridGap=0): las celdas se tocan para leerse como UNA pieza
   * continua; la barra de acciones flota SOBRE la foto en vez de reservar una franja
   * blanca entre celdas (rompería la continuidad de la tira). Regla 2026-09-08: la
   * separación visible ENTRE fotos (canaleta del color del marco) vive DENTRO de
   * cada celda vía stripPhotoRect — las celdas siguen pegadas entre sí.
   */
  overlayActions?: boolean;
  /**
   * Ola 3 — ¿el producto admite texto editable? Default false (el texto es de la
   * Polaroid; Fotoimanes Cuadrados y separadores no llevan). Cuando es false, las
   * capas de texto de la plantilla NO se dibujan (el render de producción hace lo
   * mismo vía includeText → WYSIWYG).
   */
  allowText?: boolean;
  /**
   * Ola 4 (Lucy 2026-07-23) — CALENDARIO: el slot muestra la TARJETA COMPUESTA del mes
   * (foto + "ENE 2027" + grilla real, mismo drawCalendarPage que producción) en vez de
   * la foto a sangre sobre fondo blanco. Cuando está set, reemplaza las capas del
   * unitTemplate (background + image-placeholder) por el canvas compuesto.
   */
  calendarCard?: {
    year: number;
    monthIndex0: number;
    layout?: CalendarLayoutKey;
    /** Lucy 2026-09-07 — tipo de letra del título/mes (default "fredoka"). */
    font?: CalendarFontKey;
  } | null;
  onClick: () => void;
  onClear: () => void;
  /**
   * Ola 6 — Abrir el modal unificado de edición de este slot.
   * `tab` indica qué pestaña abrir por defecto.
   */
  onEdit?: (tab: "photo" | "text") => void;
  /** M.3.b.D — Click sobre text layer editable abre el editor inline. */
  onTextEdit?: (textLayerId: string) => void;
  /**
   * Ola 22 (Lucy 2026-09-08) — Tap/click sobre el AVATAR del header del post
   * (capa `profile-photo`, ej. Polaroid Instagram) abre directo el picker de
   * foto de perfil, sin pasar por el modal genérico.
   */
  onProfilePhotoEdit?: () => void;
  /**
   * FB4 — si es false, la grilla no captura gestos inline (drag/pinch/wheel);
   * el dedo scrollea la página. El callback de transform sigue disponible
   * para el preview interactivo del modal de edición (Ola 9).
   */
  interactiveSlots?: boolean;
  /** M.3.b.UX.v9 — Aplicar transform parcial a la foto del slot.
   *  Acepta cualquier combinación de { offsetX, offsetY, scale }. Útil para:
   *    - drag → { offsetX, offsetY }
   *    - wheel/pinch zoom → { scale }
   *    - tap/dblclick reset → null (manejado por onCenterPhoto) */
  onPhotoTransformChange?: (
    transform: Partial<{ offsetX: number; offsetY: number; scale: number }>,
  ) => void;
  /** M.3.b.UX.v6 — Reset transform (centra foto + scale=1). Solo se muestra
   *  si la foto fue transformada (offset != 0 o scale != 1). */
  onCenterPhoto?: () => void;
  onAssetDrop: (asset: StudioAsset) => void;
  onKeyboardNav: (direction: "up" | "down" | "left" | "right") => void;
  onRegisterStage?: (stage: Konva.Stage | null) => void;
};

function StudioSlotImpl({
  slotState,
  unitTemplate,
  displaySize,
  displayHeight,
  isSelected,
  totalSlots,
  slotLabel,
  slotNoun = "imán",
  sizeCm,
  shape,
  finish,
  cornerRadiusPx,
  showRealismGuides,
  borderColor,
  frameFullBleed = false,
  overlayActions = false,
  allowText = false,
  calendarCard = null,
  onClick,
  onClear,
  onEdit,
  onTextEdit,
  onProfilePhotoEdit,
  onPhotoTransformChange,
  onCenterPhoto,
  onAssetDrop,
  onKeyboardNav,
  onRegisterStage,
  interactiveSlots = true,
}: StudioSlotProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [isDropping, setIsDropping] = useState(false);
  // C1 (owner 2026-09-15) — delimitaciones progresivas del slot vacío: reposo
  // (morado sutil siempre visible) → hover (intensidad media) → drag-over
  // (turquesa pleno, vía isDropping). Colores centralizados en studio-brand.
  const [isSlotHovered, setIsSlotHovered] = useState(false);
  const texts = useStudioTexts();
  // M.3.b.UX.v5 (Lucy 2026-05-15) — flag para evitar que el drag de la foto
  // dispare el picker modal al soltar el click. Cuando Konva detecta drag,
  // se setea wasDraggingPhoto=true; el click handler del wrapper div verifica
  // este flag y aborta si está activo. Se libera 100ms después del drag end
  // para que el mouseup nativo subsequente no dispare el click.
  // Usamos useState (no ref) por la regla `react-hooks/refs` de React 19:
  // refs no se pueden leer durante render; los closures de los handlers
  // capturaban el ref. State es seguro y el extra rerender por drag start/end
  // es aceptable (1 vez por drag).
  const [wasDraggingPhoto, setWasDraggingPhoto] = useState(false);
  // Ola 3c (Lucy 2026-07-22) — guard del doble disparo táctil de acciones del CANVAS:
  // el tap sobre un elemento interactivo de Konva (texto editable, avatar de perfil)
  // dispara su acción vía onTap/onClick, pero el browser sintetiza ADEMÁS un click que
  // burbujea al wrapper → abriría el picker/foco de foto encima y cerraría el panel al
  // instante ("no deja modificar texto"). Marcamos el tap y el click sintético
  // subsiguiente (<400ms) se ignora. useState (no ref) por la regla `react-hooks/refs`
  // (mismo patrón que wasDraggingPhoto arriba).
  const [canvasActionTapAt, setCanvasActionTapAt] = useState(0);
  const handleTextEdit = useCallback(
    (textLayerId: string) => {
      setCanvasActionTapAt(Date.now());
      onTextEdit?.(textLayerId);
    },
    [onTextEdit],
  );
  // Ola 22 — mismo guard que el texto editable: el tap/click sobre el avatar del
  // header abre el picker de foto de perfil directo (patrón anti-doble-panel).
  const handleProfilePhotoEdit = useCallback(() => {
    setCanvasActionTapAt(Date.now());
    onProfilePhotoEdit?.();
  }, [onProfilePhotoEdit]);

  // M.3.b.UX.v13 (Lucy 2026-05-15) — CSS clip-path para que el slot wrapper
  // SE VEA con el shape físico del imán (heart/circle/rect). useId genera
  // un ID único por slot para el SVG clipPath inline (objectBoundingBox 0-1
  // → escala automática al tamaño del wrapper).
  const heartClipId = useId();
  const slotClipPath =
    shape === "circle"
      ? "circle(50% at 50% 50%)"
      : shape === "heart"
        ? `url(#${heartClipId})`
        : undefined;

  // M.3.b.UX.v11 — Quality check de la foto al cargar.
  // El slot también carga la image (además del ImagePlaceholder interno) para
  // poder calcular quality vs sizeCm. Browser cachea — no impact performance.
  const [photoImage] = useImage(slotState.assetUrl ?? "", "anonymous");
  const photoQuality = useMemo(() => {
    if (!photoImage || !slotState.assetUrl) return null;
    return checkPhotoQuality(photoImage, sizeCm);
  }, [photoImage, slotState.assetUrl, sizeCm]);

  // Expose Konva stage to parent (para snapshot al finalizar)
  useEffect(() => {
    if (onRegisterStage) onRegisterStage(stageRef.current);
    return () => {
      if (onRegisterStage) onRegisterStage(null);
    };
  }, [onRegisterStage]);

  // FIX-1 — Aspect ratio físico del slot.
  // El motion.div + Konva Stage DEBEN respetar las proporciones físicas del
  // producto (7×9 cm = vertical), no forzar cuadrado. Antes el container
  // CSS era `width=height=displaySize` lo que generaba padding interno
  // visible cuando el unitTemplate no era cuadrado.
  const aspect = unitTemplate.stage.height / unitTemplate.stage.width;
  const slotWidth = displaySize;
  const slotHeight = displayHeight ?? displaySize * aspect;
  // Ola 6 — capas de texto editables del template para decidir si mostrar
  // el botón "Editar" en slots vacíos (productos con texto opcional).
  const editableTextLayers = useMemo(() => {
    if (!allowText) return [];
    return unitTemplate.layers.filter(
      (l): l is TextLayer => l.type === "text" && (l as TextLayer).editable === true,
    );
  }, [unitTemplate.layers, allowText]);
  const hasEditableText = editableTextLayers.length > 0;
  // Ola 2A — slots angostos (grids de 12-20 miniaturas): la barra de acciones se
  // compacta (sin chip de tamaño, calidad solo icono, botones h-8) para que
  // Centrar/Filtros/Eliminar no se desborden ni se pierdan entre las miniaturas.
  const compact = slotWidth < 170;
  // Scale Konva: misma proporción horizontal y vertical (no distorsiona)
  const scale = slotWidth / unitTemplate.stage.width;

  // Ola 2A — MARCO de color alrededor de la foto (estilo visual elegido en el Estudio;
  // viaja en canvasData.borderColor). Se dibuja como un Rect de stroke ancho centrado en
  // el borde de la ventana de foto → queda mitad dentro de la foto y mitad sobre el fondo,
  // como el marco impreso del imán físico. Heart/circle no llevan marco (la silueta manda).
  // Ola 3 — con capa "frame-card" (Polaroid Clásica) tampoco: la tarjeta entera ES el marco.
  const hasFrameCard = useMemo(
    () => unitTemplate.layers.some((l) => l.type === "frame-card"),
    [unitTemplate],
  );
  // Ola 3b — full-bleed: la tarjeta entera toma borderColor y la foto va inserta.
  // Misma condición que production-render-canvas (WYSIWYG).
  const fullBleed =
    !!borderColor && frameFullBleed && !hasFrameCard && shape !== "heart" && shape !== "circle";
  // Ola 4 (Lucy 2026-07-23) — clasificación de la tarjeta, compartida con producción:
  //  - "tarjeta simple" (Cuadrados): sin chrome ni texto visible → sin borde = foto a
  //    sangre TOTAL; con borde = franja UNIFORME de color.
  //  - Instagram (chrome SVG): fondo BINARIO blanco/negro + textos en contraste auto.
  //  - Tira photobooth (gridCols=1 + gridGap=0): pieza continua; CON borde = borde
  //    exterior por posición + canaleta del color del marco ENTRE fotos; SIN borde
  //    (Ola 25) = fotos pegadas sin líneas (stripPhotoRect, misma matemática en
  //    producción).
  const isIg = useMemo(() => isInstagramTemplate(unitTemplate.layers), [unitTemplate]);
  const simpleCard = useMemo(
    () =>
      isSimpleCardTemplate(unitTemplate.layers, {
        hasFrameCard,
        textIsVisible: allowText && unitTemplate.layers.some((l) => l.type === "text"),
      }),
    [unitTemplate, hasFrameCard, allowText],
  );
  const isStrip = useMemo(
    () => isStripTemplate(unitTemplate as { gridCols?: unknown; gridGap?: unknown }),
    [unitTemplate],
  );
  const stripPosition = isStrip ? stripPositionOf(slotState.slotIndex, totalSlots) : null;
  // Color de la capa background de la plantilla (blanco en todas las activas).
  const bgLayerHex = useMemo(() => {
    const bgLayer = unitTemplate.layers.find((l) => l.type === "background") as
      { color?: string } | undefined;
    return bgLayer?.color ?? "#FFFFFF";
  }, [unitTemplate]);
  // Fondo efectivo de la tarjeta → contraste automático del texto (blanco si es oscuro).
  const cardBgHex = useMemo(() => {
    const bgHex = bgLayerHex;
    const fcLayer = unitTemplate.layers.find((l) => l.type === "frame-card") as
      { fill?: string } | undefined;
    if (isIg) return instagramBackgroundHex(borderColor ?? null, bgHex);
    if (fullBleed && borderColor) return borderColor;
    if (hasFrameCard) return borderColor ?? fcLayer?.fill ?? "#FFFFFF";
    return bgHex;
  }, [unitTemplate, isIg, fullBleed, borderColor, hasFrameCard, bgLayerHex]);
  const darkCardBg = isDarkColor(cardBgHex);
  // Ola 21 — Instagram: detectar modo SIN BORDE por el rect del placeholder
  // (foto a sangre total x=0 y=0 w=450 h=600 en el stage 450×600).
  const noBorder = useMemo(() => {
    if (!isIg) return false;
    const ph = unitTemplate.layers.find((l) => l.type === "image-placeholder") as
      ImagePlaceholderLayer | undefined;
    return isInstagramNoBorder(ph, unitTemplate.stage);
  }, [unitTemplate, isIg]);
  // Ola 23/24 — respaldo neutro de la ventana de foto bajo zoom-out/pan ("el marco
  // es MARCO, no fondo"): la DECISIÓN vive en photoBackingHexFor (frame-palette),
  // compartida con el preview del modal y con producción → WYSIWYG por construcción.
  // Ola 24: la Instagram CON borde también lleva respaldo (su ventana se inundaba del
  // color del borde al alejar la foto con tarjeta oscura); en SIN BORDE no aplica.
  const photoBackingHex = photoBackingHexFor({
    borderColor,
    backgroundHex: bgLayerHex,
    hasFrameCard,
    fullBleed,
    isIg,
    igNoBorder: noBorder,
    useFullStage: shape === "heart" || shape === "circle",
  });
  // Ola 23 (Lucy 2026-09-08) — tarjeta CLARA no-blanca (pasteles) sobre el lienzo claro
  // del Estudio: filete de contraste sutil alrededor del slot para que el borde de la
  // tarjeta se lea en pantalla. Es adorno de PANTALLA a nivel DOM — el snapshot de
  // producción (stage.toDataURL) captura solo el canvas Konva → NUNCA se hornea en el
  // PNG de imprenta (lo impreso no cambia). En modo tira se omite por celda (dibujaría
  // costuras entre fotos; la sombra de la pieza continua la pone el contenedor del
  // grid) y en heart/circle la silueta ya va recortada.
  // Ola 24 (Lucy 2026-09-09) — para la tarjeta BLANCA el filete solo no bastaba
  // (white-on-white): el dueño eligió la BANDEJA CUADRICULADA (abajo) en su lugar.
  const cardContrastEdge = !darkCardBg && !isStrip && !slotClipPath;
  // Ola 24 (Lucy 2026-09-09) — tarjeta BLANCA: el Stage se monta unos px más chico
  // DENTRO del mismo footprint del slot y alrededor queda la bandeja cuadriculada
  // gris/blanco (WHITE_CARD_CHECKER) → la tarjeta blanca se ve sobre el lienzo claro.
  // Adorno de PANTALLA a nivel DOM: el snapshot de producción captura solo el canvas
  // Konva → la bandeja NUNCA se hornea (lo impreso no cambia). Mismas exclusiones
  // que el filete: tira (costuras entre celdas) y heart/circle (silueta recortada).
  const whiteCardTray = cardBgHex.toUpperCase() === "#FFFFFF" && !isStrip && !slotClipPath;
  // Tamaño/escala EFECTIVOS del Stage: con bandeja, la tarjeta se dibuja inset; sin
  // ella, llena el slot como siempre. El aspect y el contenido no cambian (todo el
  // dibujo interno es proporcional vía scale → WYSIWYG intacto).
  const stageSlotWidth = whiteCardTray ? slotWidth - WHITE_CARD_TRAY_PAD * 2 : slotWidth;
  const stageSlotHeight = whiteCardTray ? slotHeight - WHITE_CARD_TRAY_PAD * 2 : slotHeight;
  const stageScale = stageSlotWidth / unitTemplate.stage.width;
  const frameStyle = useMemo(() => {
    if (!borderColor || shape === "heart" || shape === "circle" || hasFrameCard || fullBleed)
      return null;
    const ph = unitTemplate.layers.find((l) => l.type === "image-placeholder") as
      ImagePlaceholderLayer | undefined;
    if (!ph) return null;
    const w = Math.max(6, Math.round(unitTemplate.stage.width * 0.04));
    return {
      x: ph.x + w / 2,
      y: ph.y + w / 2,
      width: Math.max(0, ph.width - w),
      height: Math.max(0, ph.height - w),
      strokeWidth: w,
      cornerRadius: Math.max(0, (ph.cornerRadius ?? 0) - w / 2),
      color: borderColor,
    };
  }, [borderColor, shape, unitTemplate, hasFrameCard, fullBleed]);

  // ──────────── Drag & drop nativo ────────────
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("application/lucams-asset")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDropping(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => setIsDropping(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDropping(false);
      const raw = e.dataTransfer.getData("application/lucams-asset");
      if (!raw) return;
      try {
        const asset = JSON.parse(raw) as StudioAsset;
        onAssetDrop(asset);
      } catch {
        // Asset payload inválido, ignorar
      }
    },
    [onAssetDrop],
  );

  // ──────────── Keyboard ────────────
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          onClick();
          break;
        case "Delete":
        case "Backspace":
          if (slotState.assetUrl) {
            e.preventDefault();
            onClear();
          }
          break;
        // #17 — atajos scoped-al-foco (WCAG 2.1.4 excepción "component focus") para las acciones
        // del slot: A = Ajustar foto (abre modal unificado en pestaña Foto),
        // C = Centrar foto y abrir la pestaña Foto.
        case "a":
        case "A":
          if (slotState.assetUrl && onEdit) {
            e.preventDefault();
            onEdit("photo");
          }
          break;
        case "c":
        case "C":
          if (slotState.assetUrl && onEdit) {
            e.preventDefault();
            onEdit("photo");
            if (onCenterPhoto && slotState.photoTransform) onCenterPhoto();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          onKeyboardNav("up");
          break;
        case "ArrowDown":
          e.preventDefault();
          onKeyboardNav("down");
          break;
        case "ArrowLeft":
          e.preventDefault();
          onKeyboardNav("left");
          break;
        case "ArrowRight":
          e.preventDefault();
          onKeyboardNav("right");
          break;
      }
    },
    [
      onClick,
      onClear,
      onKeyboardNav,
      slotState.assetUrl,
      onEdit,
      onCenterPhoto,
      slotState.photoTransform,
    ],
  );

  // ──────────── Photo drag flag (M.3.b.UX.v5) ────────────
  const handlePhotoDragStart = useCallback(() => {
    setWasDraggingPhoto(true);
  }, []);
  const handlePhotoDragEnd = useCallback(() => {
    // 100ms post-dragend para que el mouseup del browser que llegue al
    // wrapper NO dispare el picker. Konva drag termina con mouseup nativo.
    setTimeout(() => {
      setWasDraggingPhoto(false);
    }, 100);
  }, []);

  // ──────────── Photo zoom helpers (M.3.b.UX.v10) ────────────
  // Constantes compartidas entre wheel (desktop) y pinch (mobile).
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 3.0;
  const clampScale = useCallback((s: number) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, s)), []);

  // Pinch state — distance entre 2 touches al inicio + scale al inicio.
  const pinchInitialDistRef = useRef<number | null>(null);
  const pinchInitialScaleRef = useRef<number>(1);

  // Wheel handler: scroll up → zoom in, scroll down → zoom out.
  // Solo aplica en slots interactivos (desktop) y si la foto ya está cargada.
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      if (!interactiveSlots || !slotState.assetUrl || !onPhotoTransformChange) return;
      e.evt.preventDefault();
      const current = slotState.photoTransform?.scale ?? 1;
      const next = nextWheelScale(current, e.evt.deltaY, SCALE_MIN, SCALE_MAX);
      if (Math.abs(next - current) > 0.001) {
        onPhotoTransformChange({ scale: next });
      }
    },
    [interactiveSlots, slotState.assetUrl, slotState.photoTransform?.scale, onPhotoTransformChange],
  );

  // Native wheel listener — backup que SIEMPRE puede preventDefault
  // independiente del estado del cache de Konva o de Radix Dialog.
  // Solo en slots interactivos; en táctil el dedo scrollea la página.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !interactiveSlots || !slotState.assetUrl || !onPhotoTransformChange) return;
    function onWheelNative(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const current = slotState.photoTransform?.scale ?? 1;
      const next = nextWheelScale(current, e.deltaY, SCALE_MIN, SCALE_MAX);
      if (Math.abs(next - current) > 0.001) {
        onPhotoTransformChange?.({ scale: next });
      }
    }
    // passive: false es clave — sin esto, React/browser puede ignorar
    // preventDefault() y la página termina scrolleando.
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [
    interactiveSlots,
    slotState.assetUrl,
    slotState.photoTransform?.scale,
    onPhotoTransformChange,
  ]);

  // Pinch handlers — usan touchstart/move/end del Stage Konva.
  // Ola 6: solo activos cuando interactiveSlots=true; en táctil la grilla
  // no captura pinch inline (el zoom se hace en el editor a pantalla completa)
  // para no bloquear el scroll de la página.
  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (!interactiveSlots || !slotState.assetUrl || !onPhotoTransformChange) return;
      if (e.evt.touches.length === 2) {
        e.evt.preventDefault();
        // Ola 3c (Lucy 2026-07-22, "pellizcar la foto es casi imposible"): con 1 dedo
        // la foto ya estaba en DRAG de Konva; al caer el 2º dedo el drag seguía activo
        // y la foto saltaba (pan errático) mientras el pinch intentaba escalar — los
        // dos gestos peleaban. El pinch MANDA: cortar cualquier drag activo del stage.
        const stageNode = e.target.getStage();
        stageNode?.find("Image").forEach((n) => {
          if (n.isDragging()) n.stopDrag();
        });
        const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        pinchInitialDistRef.current = Math.sqrt(dx * dx + dy * dy);
        pinchInitialScaleRef.current = slotState.photoTransform?.scale ?? 1;
      }
    },
    [interactiveSlots, slotState.assetUrl, slotState.photoTransform?.scale, onPhotoTransformChange],
  );

  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (!interactiveSlots || !onPhotoTransformChange || pinchInitialDistRef.current === null)
        return;
      if (e.evt.touches.length !== 2) return;
      if (pinchInitialDistRef.current <= 0) return; // dedos superpuestos → ratio inválido
      e.evt.preventDefault();
      const [t1, t2] = [e.evt.touches[0], e.evt.touches[1]];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Ola 10 — pinch más directo (respuesta lineal) para que en móvil el zoom
      // con dos dedos se sienta inmediato, sin "maña".
      const rawRatio = dist / pinchInitialDistRef.current;
      const next = clampScale(pinchInitialScaleRef.current * rawRatio);
      onPhotoTransformChange({ scale: next });
    },
    [interactiveSlots, onPhotoTransformChange, clampScale],
  );

  const handleTouchEnd = useCallback(() => {
    pinchInitialDistRef.current = null;
  }, []);

  // Doble click/tap → reset transform (= centrar + scale 1).
  const handleDblClick = useCallback(() => {
    if (!interactiveSlots || !slotState.assetUrl || !onCenterPhoto) return;
    onCenterPhoto();
  }, [interactiveSlots, slotState.assetUrl, onCenterPhoto]);

  // ──────────── ARIA label ────────────
  // #14 — "Imán" era fijo; ahora deriva del producto (imán/separador). Capitalizado para inicio de
  // frase. Ola 3 — el slotLabel explícito (calendario: "Enero"; separadores 2-caras: "1A"/"1B")
  // manda en el aria cuando existe (la unidad "Separador N" la anuncia la tarjeta del grid).
  const nounCap = slotNoun.charAt(0).toUpperCase() + slotNoun.slice(1);
  const slotName = slotLabel ?? `${nounCap} ${slotState.slotIndex + 1} de ${totalSlots}`;
  // #17 — anunciar solo los atajos que existen para este slot (honesto).
  const filledHints = ["Enter para cambiar foto", "Delete para quitar"];
  if (onEdit) filledHints.push("A para ajustar la foto");
  if (onEdit && hasEditableText) filledHints.push("Tab para editar el texto");
  if (onCenterPhoto && slotState.photoTransform) filledHints.push("C para centrar");
  const ariaLabel = slotState.assetUrl
    ? `${slotName}, con foto cargada. ${filledHints.join(", ")}.`
    : `${slotName}, vacío. Enter para subir foto.`;

  // C1 — guía del slot vacío en 3 niveles (reposo → hover → drag-over).
  const slotGuideStroke = isDropping
    ? SLOT_GUIDE_COLORS.dropping
    : isSlotHovered
      ? SLOT_GUIDE_COLORS.hover
      : SLOT_GUIDE_COLORS.rest;
  const slotGuideFill = isDropping
    ? SLOT_GUIDE_COLORS.droppingFill
    : isSlotHovered
      ? SLOT_GUIDE_COLORS.hoverFill
      : SLOT_GUIDE_COLORS.restFill;

  return (
    <div className="group/wrapper relative flex flex-col items-center gap-1.5">
      {/* M.3.b.UX.v13 — SVG clipPath inline para shape heart. objectBoundingBox
        (0-1 normalized) escala automáticamente al tamaño del slot. */}
      {shape === "heart" && (
        <svg width="0" height="0" aria-hidden style={{ position: "absolute", overflow: "hidden" }}>
          <defs>
            <clipPath id={heartClipId} clipPathUnits="objectBoundingBox">
              <path d="M0.5,0.82 C0.28,0.68 0.06,0.52 0.06,0.32 C0.06,0.18 0.16,0.08 0.28,0.08 C0.38,0.08 0.44,0.12 0.5,0.22 C0.56,0.12 0.62,0.08 0.72,0.08 C0.84,0.08 0.94,0.18 0.94,0.32 C0.94,0.52 0.72,0.68 0.5,0.82 Z" />
            </clipPath>
          </defs>
        </svg>
      )}
      <div className="relative">
        <motion.div
          ref={containerRef}
          role="button"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-pressed={isSelected}
          onClick={(e: ReactMouseEvent) => {
            // M.3.b.UX.v5 (Lucy 2026-05-15) — si el cliente acaba de arrastrar
            // la foto, NO abrir el picker modal. El drag termina con un mouseup
            // nativo que el browser propaga al wrapper div y dispararía
            // onClick() inadvertidamente.
            if (wasDraggingPhoto) {
              e.preventDefault();
              return;
            }
            // Ola 3c / Ola 22 — click sintético tras un tap de elemento interactivo
            // del canvas (texto editable, avatar de perfil): la acción ya se abrió
            // vía Konva onTap; este click abriría el picker/foco encima y lo cerraría
            // al instante. Ignorarlo.
            if (Date.now() - canvasActionTapAt < 400) {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            onClick();
          }}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onMouseEnter={() => setIsSlotHovered(true)}
          onMouseLeave={() => setIsSlotHovered(false)}
          data-slot-index={slotState.slotIndex}
          data-state={
            isDropping
              ? "dropping"
              : slotState.assetUrl
                ? isSelected
                  ? "selected"
                  : "filled"
                : "empty"
          }
          className={[
            // Foco visible DISTINTO al de selección (turquesa): el ring de foco va en
            // púrpura para no confundir "tiene foco de teclado" con "está seleccionado".
            "group relative cursor-pointer overflow-hidden bg-white outline-none",
            "focus-visible:ring-brand-purple focus-visible:ring-2 focus-visible:ring-offset-2",
            "transition-shadow duration-200",
            // Ola 24 — con bandeja cuadriculada (tarjeta blanca), el Stage va centrado
            // e inset dentro del footprint del slot.
            whiteCardTray ? "flex items-center justify-center" : "",
            isSelected ? "ring-brand-turquoise ring-2 ring-offset-2" : "",
            isDropping ? "ring-brand-turquoise ring-2 ring-offset-2" : "",
          ].join(" ")}
          style={{
            width: slotWidth,
            height: slotHeight,
            // Ola 24 — bandeja cuadriculada gris/blanco bajo la tarjeta BLANCA (patrón
            // "transparencia" de los editores de foto). Adorno DOM de pantalla: el
            // snapshot de producción captura solo el canvas Konva → no se hornea.
            ...(whiteCardTray
              ? { backgroundImage: WHITE_CARD_CHECKER, backgroundSize: WHITE_CARD_CHECKER_SIZE }
              : {}),
            // M.3.b.UX.v13 — borderRadius solo aplica si shape rectangle.
            // Para heart/circle, el clipPath define la silueta y borderRadius
            // sería ignorado igualmente.
            // Ola 3 — si el producto declara cornerRadiusPx (separadores: troquel
            // REDONDO real), la silueta en pantalla usa ese radio escalado al
            // tamaño del slot en vez del 8px genérico (WYSIWYG con el troquel).
            // Ola 4 — modo TIRA: solo la punta de arriba (first) y la de abajo
            // (last) se redondean; las celdas del medio van cuadradas para que
            // la tira se lea como UNA pieza continua.
            borderRadius: slotClipPath
              ? 0
              : isStrip
                ? stripPosition === "single"
                  ? 8
                  : stripPosition === "first"
                    ? "8px 8px 0 0"
                    : stripPosition === "last"
                      ? "0 0 8px 8px"
                      : 0
                : cornerRadiusPx
                  ? Math.max(2, cornerRadiusPx * scale)
                  : 8,
            clipPath: slotClipPath,
            // Ola 23 — filete de contraste para tarjetas claras no-blancas (pasteles);
            // adorno DOM de pantalla: no entra al snapshot de producción.
            // Ola 24 — para la tarjeta BLANCA la reemplaza la bandeja cuadriculada.
            outline:
              cardContrastEdge && !whiteCardTray
                ? "1px solid rgba(124, 106, 173, 0.35)"
                : undefined,
            // Pinch-zoom (WCAG 1.4.4): la página NUNCA bloquea el zoom a nivel viewport;
            // solo el canvas INTERACTIVO captura el gesto (touch-action:none) para que el
            // pellizco/arrastre actúe sobre la foto y no dispare zoom/scroll de la página
            // a la vez. Ola 3c / Ola 6: en la grilla táctil (slot NO interactivo) queda "pan-y"
            // EXPLÍCITO → el dedo scrollea la página vertical con normalidad; el zoom de foto
            // se hace con pellizco en el preview del modal de edición (Ola 9). Además las capas
            // Konva no-interactivas van con preventDefault={false} para no matar el inicio
            // del scroll (ver ImagePlaceholder).
            touchAction: onPhotoTransformChange && interactiveSlots ? "none" : "pan-y",
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          animate={{ scale: isDropping ? 1.04 : 1 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          onFocus={(e) => {
            if (e.currentTarget instanceof HTMLElement) {
              e.currentTarget.style.boxShadow = FOCUS_RING;
            }
          }}
          onBlur={(e) => {
            if (e.currentTarget instanceof HTMLElement) {
              e.currentTarget.style.boxShadow = "";
            }
          }}
        >
          {/* Konva Stage — 3 layers stacked:
          1. RealismShadowLayer (bottom) — sombra del imán físico
          2. Content Layer (middle)      — unit template del seed
          3. RealismOverlayLayer (top)   — acabado glossy + bleed/safe guides
          Ola 4 — modo TIRA: sin sombra POR CELDA (separaba las fotos); la sombra
          única de la pieza continua la pone el contenedor del grid (CSS). */}
          <Stage
            width={stageSlotWidth}
            height={stageSlotHeight}
            scaleX={stageScale}
            scaleY={stageScale}
            ref={(s: Konva.Stage | null) => {
              stageRef.current = s;
            }}
            // M.3.b.D — Stage debe escuchar eventos para captar clicks sobre
            // text layers editables. M.3.b.UX.v4+: también si hay drag/zoom de foto
            // y el slot es interactivo (desktop). En táctil la grilla no captura
            // gestos inline, salvo taps sobre textos editables.
            listening={!!onTextEdit || (!!onPhotoTransformChange && interactiveSlots)}
            // M.3.b.UX.v10 (Lucy 2026-05-15) — gestos de zoom:
            //   Desktop: wheel sobre la foto → zoom in/out
            //   Mobile:  pinch 2 dedos → zoom
            //   Both:    doble click/tap → reset (centrar + scale 100%)
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDblClick={handleDblClick}
            onDblTap={handleDblClick}
          >
            {!isStrip && (
              <RealismShadowLayer
                stage={unitTemplate.stage}
                shape={shape}
                cornerRadiusPx={cornerRadiusPx}
              />
            )}
            <Layer name="content">
              {/* M.3.b.UX.v13 (Lucy 2026-05-15) — Layer único sin Group clipFunc.
              El CSS clip-path del wrapper HTML recorta visualmente al shape
              físico del imán (heart/circle/rect). La sombra Konva + edge stroke
              también respetan el shape via RealismShadowLayer/Overlay.
              Para products heart/circle el text layer del template NO se
              renderea (renderLayer "text" returns null). */}
              {calendarCard ? (
                // Ola 4 — calendario: tarjeta COMPUESTA (foto + mes/año + grilla real,
                // mismo dibujo que producción). Reemplaza background + image-placeholder
                // de la plantilla; el drag de la foto vive dentro de CalendarCardLayer.
                <CalendarCardLayer
                  assetUrl={slotState.assetUrl}
                  photoTransform={slotState.photoTransform ?? null}
                  year={calendarCard.year}
                  monthIndex0={calendarCard.monthIndex0}
                  layout={calendarCard.layout}
                  calendarFont={calendarCard.font ?? "fredoka"}
                  templateStageWidth={unitTemplate.stage.width}
                  stageWidth={unitTemplate.stage.width}
                  stageHeight={unitTemplate.stage.height}
                  onPhotoTransformChange={interactiveSlots ? onPhotoTransformChange : undefined}
                  onPhotoDragStart={handlePhotoDragStart}
                  onPhotoDragEnd={handlePhotoDragEnd}
                />
              ) : (
                unitTemplate.layers.map((layer) =>
                  renderLayer(
                    layer,
                    slotState,
                    unitTemplate.stage,
                    handleTextEdit,
                    shape,
                    onPhotoTransformChange,
                    handlePhotoDragStart,
                    handlePhotoDragEnd,
                    interactiveSlots,
                    // Ola 3 — color del borde (tarjeta frame-card + texto claro si es
                    // oscura) y bandera de texto del producto (Cuadrados: sin texto).
                    // Ola 3b — fullBleed: tarjeta entera del color + foto inserta.
                    // Ola 4 — tarjeta simple (sangre/franja uniforme), IG (fondo binario +
                    // chrome oscuro), tira (borde exterior por posición), texto opcional.
                    {
                      borderColor: borderColor ?? null,
                      allowText,
                      hasFrameCard,
                      fullBleed,
                      cardBgHex,
                      darkCardBg,
                      simpleCard,
                      isIg,
                      frameFullBleed,
                      noBorder,
                      stripPosition,
                      // Ola 23 — color del hueco de la ventana cuando la foto no la
                      // cubre (zoom-out/pan): la tarjeta SIN marco, para que el marco
                      // no "crezca" al alejar la foto (marco constante).
                      photoBackingHex,
                      // Ola 22 — el avatar del header (capa profile-photo) abre el
                      // picker de foto de perfil al tocarlo, directo. Solo cuando el
                      // padre cablea el flujo (la vista previa del modal no lo hace).
                      onProfilePhotoEdit: onProfilePhotoEdit ? handleProfilePhotoEdit : undefined,
                      profilePhotoHint: texts.texto.perfilAvatarHint,
                    },
                  ),
                )
              )}
              {/* Ola 2A — marco de color: ENCIMA de la foto (stroke centrado en el borde de la
              ventana). Es contenido del diseño: se hornea en el snapshot de producción (no es
              "realism" ni "edit-indicator"). */}
              {frameStyle && (
                <Rect
                  name="frame-border"
                  x={frameStyle.x}
                  y={frameStyle.y}
                  width={frameStyle.width}
                  height={frameStyle.height}
                  stroke={frameStyle.color}
                  strokeWidth={frameStyle.strokeWidth}
                  cornerRadius={frameStyle.cornerRadius}
                  listening={false}
                />
              )}
            </Layer>
            <RealismOverlayLayer
              stage={unitTemplate.stage}
              shape={shape}
              finish={finish}
              cornerRadiusPx={cornerRadiusPx}
              showGuides={showRealismGuides}
            />
          </Stage>

          {/* P0.1 — Slot vacío con mascote Lucams + microcopy emocional tuteo.
          Anti-patrón: NO usar "Photo here" / "Click para subir" (Shutterfly).
          Mensaje emocional + mascote como guía → es la mascota la que invita. */}
          <AnimatePresence>
            {!slotState.assetUrl && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={[
                  "absolute inset-0 flex flex-col items-center justify-center gap-1 transition-colors",
                  isDropping
                    ? "from-brand-turquoise/35 to-brand-turquoise/15 bg-gradient-to-br"
                    : "from-brand-cream/95 to-brand-cream/80 bg-gradient-to-br backdrop-blur-[1px]",
                ].join(" ")}
                aria-hidden="true"
              >
                {/* Borde punteado interno con la FORMA FÍSICA del imán (WYSIWYG, Lucy
                2026-07-13): corazón/círculo trazan su silueta punteada + relleno sutil;
                el rectángulo mantiene el rect redondeado. Así el slot VACÍO ya "se ve"
                como el producto real, no como un cuadrado genérico.
                C1 (owner 2026-09-15) — delimitación progresiva: el contorno es
                SIEMPRE visible (morado sutil en reposo, medio en hover, turquesa
                pleno al arrastrar) — colores de studio-brand. */}
                {shape === "heart" || shape === "circle" ? (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="xMidYMid meet"
                    aria-hidden
                  >
                    {shape === "heart" ? (
                      <path
                        d={HEART_PATH_DATA}
                        fill={slotGuideFill}
                        stroke={slotGuideStroke}
                        strokeWidth={2.5}
                        strokeDasharray="5 3"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill={slotGuideFill}
                        stroke={slotGuideStroke}
                        strokeWidth={2.5}
                        strokeDasharray="5 3"
                      />
                    )}
                  </svg>
                ) : (
                  <motion.div
                    animate={{
                      borderColor: slotGuideStroke,
                      scale: isDropping ? 1.02 : 1,
                    }}
                    transition={{ duration: 0.2 }}
                    className="pointer-events-none absolute inset-2 rounded-md border-2 border-dashed"
                  />
                )}

                {/* Mascote Lucams bobbing — invita al cliente.
                Al drop: bounce + wiggle excitado. */}
                <motion.div
                  animate={{
                    y: isDropping ? -4 : [0, -3, 0],
                    rotate: isDropping ? [0, -8, 8, 0] : 0,
                  }}
                  transition={{
                    y: {
                      duration: isDropping ? 0.3 : 2.4,
                      repeat: isDropping ? 0 : Infinity,
                      ease: "easeInOut",
                    },
                    rotate: { duration: 0.4, ease: "easeInOut" },
                  }}
                >
                  <LucamsLogo variant="mascot" size={44} />
                </motion.div>

                {/* Microcopy emocional tuteo — cambia según estado drop */}
                <span
                  className={[
                    "mt-0.5 px-2 text-center text-[11px] leading-tight font-semibold transition-colors",
                    isDropping ? "text-brand-turquoise" : "text-brand-purple-dark/75",
                  ].join(" ")}
                >
                  {isDropping ? texts.lienzo.slotEmptyDrop : texts.lienzo.slotEmptyInvite}
                </span>

                {/* Indicador del slot: mes (calendario) o "Imán #N". */}
                <span className="text-brand-muted text-[9px] font-medium tracking-wider uppercase">
                  {slotLabel ??
                    fillStudioText(texts.lienzo.slotIndicator, {
                      sustantivo: nounCap,
                      n: slotState.slotIndex + 1,
                    })}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Glassmorphism overlay sutil cuando hover sobre foto (solo decorativo) */}
          {slotState.assetUrl && (
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/10 opacity-0 transition-opacity duration-200 group-hover/wrapper:opacity-100"
              aria-hidden
            />
          )}

          {/* Ola 22 (Lucy 2026-09-08) — YA NO hay badge flotante dentro del slot.
              Antes el número (y en modo tira / calendario también) flotaba
              top-left SOBRE la plantilla y tapaba el avatar del chrome de la
              Polaroid Instagram (que vive en (34,34) r=16). Ahora el número/mes
              va SIEMPRE en la barra de acciones de ABAJO (chip, fuera del
              template) — ver el chip al inicio de la action bar. */}

          {/* M.3.b.UX.v10 — chip de zoom visible cuando scale != 100% (foto fue
          modificada). Feedback al cliente de cuánto zoom tiene actualmente.
          Top-right del slot para no chocar con la action bar (Ola 22: ya no
          existe badge flotante # dentro del slot).
          Solo se muestra si fluctúa del default — si está en 100%, no estorba. */}
          {slotState.assetUrl &&
            slotState.photoTransform?.scale &&
            Math.abs(slotState.photoTransform.scale - 1) > 0.001 && (
              <div
                // A11Y — el % iba en blanco sobre turquesa: 1.62:1 con la mezcla /90 sobre foto
                // clara (WCAG 1.4.3 AA pide 4.5:1). Sin tocar la paleta, el TEXTO pasa a
                // brand-purple-dark → 7.43:1.
                className="bg-brand-turquoise/90 text-brand-purple-dark absolute top-1.5 right-1.5 flex h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold shadow-sm"
                aria-label={fillStudioText(texts.lienzo.zoomAria, {
                  pct: Math.round(slotState.photoTransform.scale * 100),
                })}
                title={fillStudioText(texts.lienzo.slotZoomTitle, {
                  pct: Math.round(slotState.photoTransform.scale * 100),
                })}
              >
                {Math.round(slotState.photoTransform.scale * 100)}%
              </div>
            )}
        </motion.div>
      </div>

      {/* FIX-2 — Footer bar de acciones FUERA del slot.
        Visible siempre que el slot está lleno O seleccionado (no solo hover),
        para que el cliente vea claramente qué puede hacer.
        Anti-patrón superpuesto adentro: tapaba la foto en slots chicos.
        Patrón Casetify/Mixbook: action bar inferior fuera del canvas.
        Ola 2A — el padre (StudioCanvasGrid) RESERVA este alto en el grid para
        que la barra no se solape con la fila de abajo; en slots angostos se
        compacta para que los 3 botones quepan sin desbordarse. */}
      {(slotState.assetUrl || isSelected) && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={
            overlayActions
              ? // Ola 3c — modo TIRA (gridGap=0): la barra flota sobre la foto (fondo
                // blanco translúcido) para no romper la continuidad de la tira con
                // una franja vacía entre celdas.
                "absolute bottom-1 z-20 flex items-center justify-center gap-1.5 rounded-full bg-white/90 px-1.5 py-0.5 shadow-md ring-1 ring-black/5 backdrop-blur-sm"
              : "flex items-center gap-1.5"
          }
          style={overlayActions ? undefined : { width: slotWidth }}
        >
          {/* Identificador del slot — chip al inicio de la barra (Lucy 2026-09-07,
              extendido Ola 22 2026-09-08 a TODOS los modos). Muestra el número de
              slot, o el mes abreviado para calendario (slotLabel). Antes el número
              era un badge absoluto top-left DENTRO del slot (tapaba el avatar del
              chrome de la Polaroid Instagram) y en modo tira / calendario seguía
              flotando sobre la plantilla. Acuerdo con Lucy: el identificador vive
              SIEMPRE en esta barra, FUERA del template — incluido el modo tira
              (overlayActions), donde la barra flota sobre la foto como unidad. */}
          {slotState.assetUrl && (
            <span
              className="text-brand-purple-dark/70 bg-brand-cream/90 ring-brand-purple/10 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[9px] font-bold ring-1"
              aria-label={
                slotLabel ??
                fillStudioText(texts.lienzo.slotIndicator, {
                  sustantivo: nounCap,
                  n: slotState.slotIndex + 1,
                })
              }
              title={
                slotLabel ??
                fillStudioText(texts.lienzo.slotIndicator, {
                  sustantivo: nounCap,
                  n: slotState.slotIndex + 1,
                })
              }
            >
              {slotLabel ? slotLabel.slice(0, 3) : slotState.slotIndex + 1}
            </span>
          )}

          {/* Tamaño físico — chip a la izquierda con orientación explícita.
              En slots angostos se omite: el tamaño ya lo muestra el toolbar.
              En modo tira (overlay) también: estorbaría sobre la foto. */}
          {sizeCm && !compact && !overlayActions && (
            <span
              className="text-brand-purple-dark/70 bg-brand-cream/90 ring-brand-purple/10 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1"
              aria-label={fillStudioText(texts.lienzo.slotTamanoAria, { size: sizeCm })}
              title={fillStudioText(texts.lienzo.slotSizeTitle, { sizeCm })}
            >
              📐 {sizeCm}
            </span>
          )}

          {/* M.3.b.UX.v11 — Warning de calidad si la foto es de baja resolución
            para imprimir al tamaño físico. Detección automática al cargar foto
            (checkPhotoQuality calcula DPI efectivo a 300 DPI estándar imprenta).
            Ola 2A — en slots angostos solo el icono (el detalle va en el title). */}
          {photoQuality && !photoQuality.ok && (
            <span
              className={[
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1",
                photoQuality.severity === "error"
                  ? "bg-red-50 text-red-700 ring-red-200"
                  : "bg-amber-50 text-amber-800 ring-amber-200",
              ].join(" ")}
              aria-label={
                photoQuality.severity === "error"
                  ? "Foto demasiado chica para imprimir bien"
                  : "Foto al límite de resolución"
              }
              title={
                photoQuality.severity === "error"
                  ? fillStudioText(texts.lienzo.qualityErrorTitle, {
                      ancho: photoQuality.actualPx?.w ?? "",
                      alto: photoQuality.actualPx?.h ?? "",
                      sizeCm: sizeCm ?? "",
                      anchoMin: photoQuality.requiredPx?.w ?? "",
                      altoMin: photoQuality.requiredPx?.h ?? "",
                    })
                  : fillStudioText(texts.lienzo.qualityWarnTitle, {
                      sizeCm: sizeCm ?? "",
                      anchoMin: photoQuality.requiredPx?.w ?? "",
                      altoMin: photoQuality.requiredPx?.h ?? "",
                    })
              }
            >
              {photoQuality.severity === "error" ? "⚠" : "ⓘ"}
              {compact ? "" : ` ${texts.lienzo.slotQualityChip}`}
            </span>
          )}

          {/* Acciones secundarias derecha.
              Ola 6 — Botón unificado "Editar" (lápiz) que abre el modal de edición
              por slot (tabs Foto + Texto). Solo aparece si hay algo editable.
              M.3.b.UX.2 — Action buttons 50% más grandes (h-6 → h-8, icons h-3 → h-4)
              Tap target compliant Material/HIG con wrapper padding. */}
          {(slotState.assetUrl || hasEditableText) && (
            <div className="ml-auto flex items-center gap-2">
              {/* M.3.b.UX.v6 — Botón Centrar: visible solo si transform aplicado.
                Resetea offsetX/Y a 0 + scale a 1 (cover overscan default). */}
              {onCenterPhoto && slotState.photoTransform && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCenterPhoto();
                  }}
                  aria-label={fillStudioText(texts.lienzo.slotCentrarAria, {
                    n: slotState.slotIndex + 1,
                  })}
                  title={texts.lienzo.slotTooltipCentrar}
                  className={`text-brand-purple-dark/70 ring-brand-purple/15 hover:bg-brand-purple/5 hover:text-brand-purple-dark focus:ring-brand-turquoise hover:ring-brand-purple/30 relative flex items-center justify-center rounded-md bg-white shadow-sm ring-1 before:absolute before:content-[''] focus:ring-2 focus:outline-none ${
                    compact ? "h-8 w-8 before:-inset-1.5" : "h-9 w-9 before:-inset-1"
                  }`}
                  tabIndex={-1}
                >
                  <RotateCcw className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                </motion.button>
              )}
              {onEdit && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(slotState.assetUrl ? "photo" : "text");
                  }}
                  aria-label={fillStudioText(texts.lienzo.slotEditarAria, { nombre: slotName })}
                  title={
                    slotState.assetUrl && hasEditableText
                      ? texts.lienzo.slotTooltipEditarAmbos
                      : slotState.assetUrl
                        ? texts.lienzo.slotTooltipEditarFoto
                        : texts.texto.editorTitulo
                  }
                  className={`text-brand-purple ring-brand-purple/20 hover:bg-brand-purple/5 focus:ring-brand-turquoise hover:ring-brand-purple/40 relative flex items-center justify-center rounded-md bg-white shadow-sm ring-1 before:absolute before:content-[''] focus:ring-2 focus:outline-none ${
                    compact ? "h-8 w-8 before:-inset-1.5" : "h-9 w-9 before:-inset-1"
                  }`}
                  tabIndex={-1}
                >
                  <Pencil className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                </motion.button>
              )}
              {slotState.assetUrl && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear();
                  }}
                  aria-label={fillStudioText(texts.lienzo.slotQuitarAria, {
                    n: slotState.slotIndex + 1,
                  })}
                  title={texts.lienzo.slotTooltipQuitar}
                  className={`relative flex items-center justify-center rounded-md bg-white text-red-600 shadow-sm ring-1 ring-red-200 before:absolute before:content-[''] hover:bg-red-50 hover:ring-red-400 focus:ring-2 focus:ring-red-500 focus:outline-none ${
                    compact ? "h-8 w-8 before:-inset-1.5" : "h-9 w-9 before:-inset-1"
                  }`}
                  tabIndex={-1}
                >
                  <Trash2 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                </motion.button>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

export const StudioSlot = memo(StudioSlotImpl, (prev, next) => {
  return (
    prev.slotState.slotIndex === next.slotState.slotIndex &&
    prev.slotState.assetUrl === next.slotState.assetUrl &&
    prev.slotState.assetId === next.slotState.assetId &&
    prev.slotState.profileAssetUrl === next.slotState.profileAssetUrl &&
    prev.slotState.filter === next.slotState.filter &&
    prev.slotState.textOverrides === next.slotState.textOverrides &&
    prev.slotState.photoTransform === next.slotState.photoTransform &&
    prev.isSelected === next.isSelected &&
    prev.displaySize === next.displaySize &&
    prev.displayHeight === next.displayHeight &&
    prev.unitTemplate === next.unitTemplate &&
    prev.sizeCm === next.sizeCm &&
    prev.shape === next.shape &&
    prev.finish === next.finish &&
    prev.cornerRadiusPx === next.cornerRadiusPx &&
    prev.showRealismGuides === next.showRealismGuides &&
    prev.borderColor === next.borderColor &&
    prev.frameFullBleed === next.frameFullBleed &&
    prev.overlayActions === next.overlayActions &&
    prev.allowText === next.allowText &&
    prev.interactiveSlots === next.interactiveSlots &&
    prev.calendarCard?.year === next.calendarCard?.year &&
    prev.calendarCard?.monthIndex0 === next.calendarCard?.monthIndex0 &&
    prev.calendarCard?.layout === next.calendarCard?.layout &&
    prev.calendarCard?.font === next.calendarCard?.font
  );
});
StudioSlot.displayName = "StudioSlot";

// ──────────────────────────────────────────────────────────────────
//  Layer rendering — replica del unitTemplate dentro de cada slot
// ──────────────────────────────────────────────────────────────────

// Exportado para reuso en <StudioPreviewModal>.
export function renderLayer(
  layer: CanvasLayer,
  slotState: SlotState,
  stage: { width: number; height: number },
  onTextEdit: ((layerId: string) => void) | undefined,
  shape?: "rectangle" | "circle" | "heart" | "custom",
  onPhotoTransformChange?: (
    transform: Partial<{ offsetX: number; offsetY: number; scale: number }>,
  ) => void,
  onPhotoDragStart?: () => void,
  onPhotoDragEnd?: () => void,
  interactiveSlots?: boolean,
  /**
   * Ola 3 — contexto de estilo del producto:
   *  - borderColor: color del borde elegido (la tarjeta frame-card lo toma; si la
   *    tarjeta es oscura, el texto por defecto sale claro).
   *  - allowText: false → las capas de texto NO se dibujan (Cuadrados/separadores).
   *  - hasFrameCard: la plantilla trae tarjeta de color (Polaroid Clásica).
   *  - fullBleed (Ola 3b): la tarjeta entera se pinta de borderColor y la foto va
   *    inserta con franja mínima de color (productos con frameOptions sin frame-card).
   *
   * Ola 4 (Lucy 2026-07-23):
   *  - cardBgHex / darkCardBg: fondo efectivo de la tarjeta y su contraste (texto
   *    automático blanco/negro — Instagram binario; frame-card oscura → texto claro).
   *  - simpleCard + frameFullBleed: "tarjeta simple" (Cuadrados) → sin borde = foto a
   *    sangre total; con borde = franja uniforme (simpleCardPhotoRect).
   *  - isIg: plantilla Instagram → fondo binario blanco/negro + chrome SVG variante oscura.
   *  - stripPosition: posición en la tira (first/last llevan borde exterior).
   */
  opts?: {
    borderColor?: string | null;
    allowText?: boolean;
    hasFrameCard?: boolean;
    fullBleed?: boolean;
    cardBgHex?: string;
    darkCardBg?: boolean;
    simpleCard?: boolean;
    isIg?: boolean;
    frameFullBleed?: boolean;
    noBorder?: boolean;
    stripPosition?: import("@/features/personalization/frame-palette").StripPosition | null;
    /**
     * Ola 23 (Lucy 2026-09-08) — color de respaldo de la ventana de foto cuando hay
     * tarjeta de color (frame-card / full-bleed; Ola 24: también Instagram CON
     * borde): el hueco que deja la foto al alejarla (zoom-out) o moverla se pinta
     * de este color (la tarjeta SIN marco) en vez del color del marco → el ancho
     * del marco/canaleta queda CONSTANTE bajo cualquier zoom/pan. La decisión la
     * toma photoBackingHexFor (frame-palette) en las 3 superficies. null = sin
     * respaldo (el hueco muestra lo que haya debajo).
     */
    photoBackingHex?: string | null;
    /**
     * Ola 22 (Lucy 2026-09-08) — tap/click sobre el AVATAR del header del post
     * (capa `profile-photo`) abre directo el picker de foto de perfil. Sin
     * callback la capa queda no interactiva (vista previa del modal).
     */
    onProfilePhotoEdit?: () => void;
    /** Tooltip del avatar (copy CMS) — solo se usa cuando onProfilePhotoEdit está set. */
    profilePhotoHint?: string;
  },
) {
  const borderColor = opts?.borderColor ?? null;
  const allowText = opts?.allowText ?? false;
  const fullBleed = opts?.fullBleed ?? false;
  const isIg = opts?.isIg ?? false;
  const cardBgHex = opts?.cardBgHex ?? null;
  const darkCardBg = opts?.darkCardBg ?? false;
  const simpleCard = opts?.simpleCard ?? false;
  const frameFullBleed = opts?.frameFullBleed ?? false;
  const noBorder = opts?.noBorder ?? false;
  const stripPosition = opts?.stripPosition ?? null;
  const photoBackingHex = opts?.photoBackingHex ?? null;
  switch (layer.type) {
    case "background":
      return (
        <Rect
          key={layer.id}
          x={0}
          y={0}
          width={stage.width}
          height={stage.height}
          // Ola 3b — "el color llega al fin del papel": con full-bleed la tarjeta
          // entera es borderColor (el marco ES la tarjeta), no un stroke sobre blanco.
          // Ola 4 — Instagram: fondo BINARIO blanco/negro (cardBgHex ya resuelto).
          fill={
            isIg && cardBgHex
              ? cardBgHex
              : fullBleed && borderColor
                ? borderColor
                : (layer as { color: string }).color
          }
          listening={false}
          preventDefault={false}
        />
      );
    case "frame-card": {
      // Ola 3 — TARJETA de color de la Polaroid Clásica: rect redondeado a todo el
      // stage relleno del color de borde elegido (blanco/negro/pasteles de la paleta
      // frame-palette). Va debajo de la foto y del texto (orden de capas de la
      // plantilla). El marco-stroke de Ola 2A se omite en estas plantillas (la
      // tarjeta ES el marco). Mismo dibujo en production-render-canvas (WYSIWYG).
      const card = layer as FrameCardLayer;
      return (
        <Rect
          key={layer.id}
          x={0}
          y={0}
          width={stage.width}
          height={stage.height}
          cornerRadius={card.cornerRadius ?? 0}
          fill={borderColor ?? card.fill ?? "#FFFFFF"}
          listening={false}
        />
      );
    }
    case "image-placeholder": {
      // M.3.b.UX.v13 (Lucy 2026-05-15) — Para products heart/circle, el image
      // cubre TODO el stage. El stage para products heart/circle es cuadrado
      // (definido en la plantilla / forzado al cargar). El Konva clipFunc
      // adicional ya no es necesario porque el slot wrapper HTML clipPath
      // recorta visualmente — pero lo mantenemos para que la sombra Konva
      // también respete el shape físico.
      const useFullStage = shape === "heart" || shape === "circle";
      const baseLayer = useFullStage
        ? ({
            ...(layer as ImagePlaceholderLayer),
            x: 0,
            y: 0,
            width: stage.width,
            height: stage.height,
            cornerRadius: 0,
          } as ImagePlaceholderLayer)
        : (layer as ImagePlaceholderLayer);
      // Ola 4 — ventana de foto según el tipo de tarjeta (misma geometría que producción):
      //  1. "tarjeta simple" (Cuadrados) con frameOptions: sin borde → foto a sangre TOTAL;
      //     con borde → franja UNIFORME de color (simpleCardPhotoRect).
      //  2. Ola 3b resto de plantillas full-bleed: inserta respetando márgenes mayores
      //     (Instagram conserva la geometría de su chrome: sin inset).
      //  3. Tira photobooth: la ventana se inserta por posición (stripPhotoRect):
      //     borde exterior first/last + media canaleta entre fotos (2026-09-08).
      //     Ola 25 — si el placeholder quedó a sangre total (toggle "Sin borde" de
      //     la toolbar), la celda va CONTINUA: sin marco exterior ni canaletas.
      let photoRect = {
        x: baseLayer.x,
        y: baseLayer.y,
        width: baseLayer.width,
        height: baseLayer.height,
      };
      let photoCornerRadius = baseLayer.cornerRadius;
      if (frameFullBleed && simpleCard && !useFullStage) {
        const r = simpleCardPhotoRect(stage, borderColor, frameBleedMargin(stage));
        photoRect = r;
        photoCornerRadius = 0;
      } else if (fullBleed && borderColor && !useFullStage && !isIg) {
        photoRect = insetToMinMargin(photoRect, stage, frameBleedMargin(stage));
      }
      if (stripPosition) {
        photoRect = stripPhotoRect(photoRect, stage, stripPosition, {
          borderless: isStripBorderless(photoRect, stage),
        });
      }
      const effectiveLayer = {
        ...baseLayer,
        ...photoRect,
        cornerRadius: photoCornerRadius,
      } as ImagePlaceholderLayer;
      return (
        <ImagePlaceholder
          key={layer.id}
          layer={effectiveLayer}
          slotState={slotState}
          backingColor={photoBackingHex}
          onPhotoTransformChange={onPhotoTransformChange}
          onPhotoDragStart={onPhotoDragStart}
          onPhotoDragEnd={onPhotoDragEnd}
          interactiveSlots={interactiveSlots}
        />
      );
    }
    case "text": {
      // M.3.b.UX.v13 (Lucy 2026-05-15) — Para products heart/circle, el imán
      // físico ES esa silueta. No hay zona "abajo del corazón" donde imprimir
      // texto. Por lo tanto omitimos el render de text layers en heart/circle.
      // Si la plantilla tiene textos (como Polaroid Instagram), aplican solo
      // a products rectangulares.
      // Ola 3 — además: si el producto NO admite texto (allowText=false, ej.
      // Fotoimanes Cuadrados — "el texto es de la Polaroid"), la capa no se dibuja.
      if (shape === "heart" || shape === "circle") return null;
      if (!allowText) return null;
      const textLayer = layer as TextLayerData;
      const override = slotState.textOverrides?.[textLayer.id];
      // Ola 4 — contraste AUTOMÁTICO del texto por el fondo efectivo de la tarjeta
      // (generaliza el darkCard de Ola 3: Instagram fondo negro → textos blancos;
      // frame-card oscura → texto claro; el override de color del cliente manda).
      // Ola 26 (Lucy 2026-09-09) — Instagram: el default se decide POR CAPA
      // (igTextFill): usuario/ubicación/likes/título siguen el contraste de la
      // tarjeta, pero los hashtags SIEMPRE salen azul link IG (legible sobre
      // tarjeta clara u oscura) — nunca caen al blanco del contraste.
      // Ola 28 (owner 2026-09-11) / B4 (owner 2026-09-15): el default de la
      // plantilla sale como GUÍA atenuada en la grilla para TODAS las
      // plantillas (Clásica e Instagram iguales — la excepción Ola 28 de
      // dibujarlo a opacidad plena quedó reemplazada); el fill por capa de IG
      // se conserva en la guía.
      // Ola 29 (owner 2026-09-11, ronda 5 — 1.2.1.A): fuera de IG el default
      // sale de defaultTextFillOnCard (frame-palette, compartida con producción):
      // tarjeta rosada/oscura → letra BLANCA; blanca/pastel → el oscuro de la
      // plantilla ("que visualmente se vea" sobre el color de la tarjeta).
      const defaultFill = isIg
        ? igTextFill(textLayer.id, textLayer.fill, darkCardBg)
        : defaultTextFillOnCard(cardBgHex, textLayer.fill);
      return renderText(textLayer, stage, override, onTextEdit, false, defaultFill);
    }
    case "shape":
      return renderShape(layer as never);
    case "asset":
      return (
        <AssetLayerRenderer
          key={layer.id}
          layer={layer as never}
          // Ola 4 — Instagram con fondo negro: el chrome SVG usa su variante oscura
          // (íconos/textos blancos), igual que los textos pasan a blanco (contraste).
          darkBackground={isIg && darkCardBg}
          // Ola 16 — Instagram sin borde: chrome sobre la foto (sin tarjeta/marco).
          noBorder={isIg && noBorder}
        />
      );
    case "profile-photo":
      // Ola 17 (Lucy 2026-09-07) — foto de perfil del header del post de Instagram.
      // Cubre el avatar placeholder horneado del chrome SVG (mismo centro/radio) con
      // la foto del cliente recortada a círculo; el anillo de historia queda visible
      // alrededor. Sin foto elegida no dibuja la imagen → se ve el placeholder del SVG.
      // Ola 22 (Lucy 2026-09-08) — el círculo ES tappeable: abre directo el picker de
      // foto de perfil (hit region + anillo turquesa + tooltip, todo `edit-indicator`
      // → nunca se hornea en el PNG de producción).
      return (
        <ProfilePhotoLayerRenderer
          key={layer.id}
          layer={layer as ProfilePhotoLayer}
          profileAssetUrl={slotState.profileAssetUrl ?? null}
          stageWidth={stage.width}
          onEdit={opts?.onProfilePhotoEdit}
          hint={opts?.profilePhotoHint}
        />
      );
    default:
      return null;
  }
}

/**
 * Ola 17 — Renderer de la capa `profile-photo`. La imagen la aporta el slot
 * (slotState.profileAssetUrl, subida/elegida con el control "Foto de perfil" del
 * modal de edición). Recorte circular con clipFunc (ctx.arc) en coords del Group,
 * igual que el rounded-rect de ImagePlaceholder.
 *
 * Ola 22 (Lucy 2026-09-08) — el círculo del avatar ES tappeable: tocarlo abre
 * directo el picker de foto de perfil (sin pasar por el modal genérico). Hit
 * region = círculo transparente un poco mayor que el avatar (target cómodo),
 * con anillo turquesa punteado PERMANENTE (mismo lenguaje que los textos
 * editables: "esto se puede tocar") que se refuerza en hover + tooltip. Todo el
 * adorno va marcado `name="edit-indicator"` → NUNCA se hornea en el snapshot de
 * producción/preview. Funciona también SIN foto elegida (ahí es el uso principal:
 * elegirla por primera vez) — el placeholder horneado del SVG queda visible.
 */
function ProfilePhotoLayerRenderer({
  layer,
  profileAssetUrl,
  stageWidth,
  onEdit,
  hint,
}: {
  layer: ProfilePhotoLayer;
  profileAssetUrl: string | null;
  stageWidth: number;
  /** Ola 22 — si viene, el avatar abre el picker de foto de perfil al tocarlo. */
  onEdit?: () => void;
  /** Tooltip de hover (copy CMS estudio.texto.perfil-avatar-hint). */
  hint?: string;
}) {
  const [image] = useImage(profileAssetUrl ?? "", "anonymous");
  const [hover, setHover] = useState(false);
  const interactive = !!onEdit;
  // Sin foto y sin interactividad no hay NADA que pintar (contrato Ola 17: el
  // placeholder horneado del SVG se ve intacto y el árbol Konva queda vacío).
  if ((!profileAssetUrl || !image) && !interactive) return null;

  const d = layer.radius * 2;
  // Cover dentro del círculo: la foto más chica se agrupa hasta cubrirlo y se
  // centra (misma matemática cover que el image-placeholder, sin overscan).
  const scale = image ? Math.max(d / image.width, d / image.height) : 1;
  const w = image ? image.width * scale : 0;
  const h = image ? image.height * scale : 0;

  // Tooltip bajo el avatar (el header no tiene aire arriba: el anillo de historia
  // llega a y≈14). Se clampa al ancho del stage para no cortarse en el borde.
  const hintText = interactive ? (hint ?? "") : "";
  const hintFont = 11;
  const hintW = Math.max(90, Math.min(stageWidth - 8, hintText.length * hintFont * 0.55 + 16));
  const hintH = hintFont * 1.3 + 8;
  const hintX = Math.max(4, Math.min(stageWidth - hintW - 4, layer.x - hintW / 2));

  return (
    <Group x={layer.x - layer.radius} y={layer.y - layer.radius}>
      {/* Foto del cliente recortada a círculo (Ola 17). Sin foto → solo el hit. */}
      {profileAssetUrl && image && (
        <Group
          clipFunc={(ctx: Konva.Context) => {
            ctx.beginPath();
            ctx.arc(layer.radius, layer.radius, layer.radius, 0, Math.PI * 2);
            ctx.closePath();
          }}
          listening={false}
        >
          <KonvaImage image={image} x={(d - w) / 2} y={(d - h) / 2} width={w} height={h} />
        </Group>
      )}
      {/* Anillo de affordance PERMANENTE (punteado turquesa, como los textos
        editables) — refuerzo sólido en hover. `edit-indicator` → no se hornea. */}
      {interactive && (
        <Circle
          name="edit-indicator"
          x={layer.radius}
          y={layer.radius}
          radius={layer.radius + 3.5}
          stroke="#5DD9D1"
          strokeWidth={hover ? 2.5 : 1.5}
          dash={hover ? undefined : [4, 3]}
          opacity={hover ? 1 : 0.75}
          listening={false}
        />
      )}
      {/* Hit region: círculo transparente un poco mayor que el avatar. Escucha
        click/tap SOLO cuando hay callback; preventDefault={false} para no matar
        el scroll táctil de la página sobre el avatar (mismo criterio que los
        textos editables). */}
      {interactive && (
        <Circle
          x={layer.radius}
          y={layer.radius}
          radius={layer.radius + 8}
          fill="rgba(0,0,0,0)"
          preventDefault={false}
          onMouseEnter={(e) => {
            setHover(true);
            const stageNode = e.target.getStage();
            if (stageNode) stageNode.container().style.cursor = "pointer";
          }}
          onMouseLeave={(e) => {
            setHover(false);
            const stageNode = e.target.getStage();
            if (stageNode) stageNode.container().style.cursor = "";
          }}
          onClick={(e) => {
            e.cancelBubble = true;
            // Mismo anti-doble-panel que los textos: cortar la propagación al
            // wrapper DOM (que abriría el picker de foto genérico encima).
            e.evt.stopPropagation();
            onEdit?.();
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            e.evt.stopPropagation();
            onEdit?.();
          }}
        />
      )}
      {/* Tooltip de hover — hint para descubrir el atajo (solo desktop; en
        táctil el primer tap ya abre el picker). `edit-indicator` → no se hornea. */}
      {interactive && hover && hintText && (
        <Group
          name="edit-indicator"
          x={hintX}
          y={Math.max(4, layer.y + layer.radius + 10)}
          listening={false}
        >
          <Rect
            width={hintW}
            height={hintH}
            fill="rgba(61, 46, 92, 0.92)"
            cornerRadius={hintH / 2}
          />
          <Text
            text={hintText}
            x={0}
            y={4}
            width={hintW}
            align="center"
            fontSize={hintFont}
            fontStyle="bold"
            fill="#FFFFFF"
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
}

type AssetLayerData = {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
};

/**
 * M.3.b.A2 — Renderea un asset SVG/PNG externo como capa visual.
 * Paradigma pacdora: el asset tiene transparencia y se superpone al
 * image-placeholder (la foto del cliente queda visible por el hueco).
 *
 * useImage("anonymous") permite cargar SVG via fetch + decode, listo para
 * stage.toDataURL() al finalize.
 */
function AssetLayerRenderer({
  layer,
  darkBackground = false,
  noBorder = false,
}: {
  layer: AssetLayerData;
  /** Ola 4 — fondo oscuro (Instagram negro): usa la variante `_dark` del chrome SVG. */
  darkBackground?: boolean;
  /** Ola 16 — modo sin borde (Instagram): usa la variante `_noborder` (solo chrome sobre la foto). */
  noBorder?: boolean;
}) {
  const [image] = useImage(noBorderChromeSrc(layer.src, noBorder, darkBackground), "anonymous");
  if (!image) {
    // Fallback rect transparente mientras carga (no se ve, evita layout shift)
    return null;
  }
  return (
    <KonvaImage
      image={image}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation ?? 0}
      opacity={layer.opacity ?? 1}
      listening={false}
    />
  );
}

type TextLayerData = {
  id: string;
  x: number;
  y: number;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: string;
  align?: "left" | "center" | "right";
  editable?: boolean;
};

/**
 * M.3.b.D — Render de text layer con soporte para overrides del slot.
 * Si el layer es editable y hay onTextEdit callback, el texto recibe
 * cursor pointer + click handler que abre el editor inline.
 */
function renderText(
  layer: TextLayerData,
  stage: { width: number; height: number },
  override: import("./types").TextOverride | undefined,
  onTextEdit: ((layerId: string) => void) | undefined,
  // M.3.b.UX.bug v4 — el texto se renderea ENCIMA de la foto cliente (shape
  // heart/circle). Aplica stroke blanco + shadow para legibilidad sobre
  // cualquier color de fondo.
  onPhoto: boolean = false,
  // Color de letra por defecto cuando NO hay override de color del cliente.
  // Lo decide el call-site (renderLayer): contraste con la tarjeta (Ola 3/4;
  // Ola 26 — en Instagram, por capa vía igTextFill: hashtags siempre azules).
  // Ausente → el fill de la plantilla (o el morado oscuro de marca).
  defaultFill?: string,
) {
  // Combinar layer base + override del slot. Cada campo del override
  // sobrescribe el layer base si está definido.
  //
  // REGLA GLOBAL DE PLACEHOLDERS (Ola 4 2026-07-23, reforzada Ola 23 2026-09-08,
  // endurecida Ola 25 2026-09-09, unificada B4 owner 2026-09-15): el texto por
  // defecto de TODA capa editable de CUALQUIER plantilla ("Escribe tu mensaje",
  // "@tu_usuario", "362 me gusta", "Bogotá, Colombia"…) es un PLACEHOLDER,
  // nunca contenido de la tarjeta:
  //   - En la GRILLA del Estudio (superficie editable, onTextEdit presente) el
  //     default de la plantilla SÍ se dibuja como GUÍA atenuada
  //     (PLACEHOLDER_GUIDE_OPACITY ≈ 40%, estilo "así se verá") dentro de la
  //     zona de edición punteada — B4: Clásica e Instagram se comportan IGUAL
  //     (reemplaza la excepción Ola 28 de dibujar el default IG a opacidad
  //     plena). La guía va marcada name="placeholder-guide edit-indicator":
  //     es adorno de PANTALLA y se oculta antes de cada stage.toDataURL, igual
  //     que el recuadro/dot → NUNCA se hornea en snapshots de producción ni en
  //     el preview de confirmación.
  //   - En las demás superficies (preview del modal, texturas 3D, confirmación)
  //     no se dibuja NADA mientras el cliente no escribe su texto.
  //   - La vía principal de edición es la pestaña Texto del modal de edición
  //     del slot; el input ahí muestra el default como placeholder gris
  //     (atributo HTML), no como valor precargado.
  //   - En PRODUCCIÓN (renderTextLayer) una capa editable imprime SOLO el override
  //     del cliente; sin override.text no se imprime nada.
  //   - Ojo WYSIWYG: un override SIN texto (ej. solo cambió el color) sigue siendo
  //     placeholder — la tarjeta queda vacía y no se imprime nada.
  // Las capas NO editables (texto fijo decorativo de la plantilla) sí imprimen su
  // texto base: no son placeholder de nada (no hay forma de editarlas).
  const customerText =
    typeof override?.text === "string" && override.text.trim() !== "" ? override.text : undefined;
  const isPlaceholderGuide = layer.editable === true && customerText === undefined;
  const finalText = customerText ?? layer.text;
  const fontSize = override?.fontSize ?? layer.fontSize ?? 48;
  const fontFamily = override?.fontFamily ?? layer.fontFamily ?? "Fredoka, Inter, sans-serif";
  const fill = override?.fill ?? defaultFill ?? layer.fill ?? "#3D2E5C";
  const fontStyle = override?.fontWeight ?? layer.fontWeight;
  const align = layer.align ?? "center";

  // Styling adicional cuando el texto va sobre foto.
  const onPhotoStyling = onPhoto
    ? {
        stroke: "rgba(255, 255, 255, 0.92)",
        strokeWidth: Math.max(2, fontSize * 0.08),
        fillAfterStrokeEnabled: true,
        shadowColor: "rgba(0, 0, 0, 0.55)",
        shadowBlur: 6,
        shadowOffsetY: 2,
        shadowOpacity: 1,
      }
    : null;

  const isEditable = layer.editable === true && onTextEdit !== undefined;

  // M.3.b.D — Bounding box aproximado para el indicador dashed visual.
  // Solo aplica si el text es editable — el cliente VE el rect dashed sutil
  // alrededor del texto que indica "esto se puede editar".
  // El cálculo es aproximado (text.length × fontSize × 0.55) — Konva no
  // expone bounding box exacto sin medirlo. Funciona OK para textos cortos.
  // Ola 25 — para la ZONA VACÍA (placeholder) el ancho se estima con el texto
  // base de la plantilla: la zona queda donde aparecerá el texto al escribirlo.
  const textY = layer.y - fontSize / 2;
  const textX = align === "center" ? 0 : layer.x;
  const guideLength = (isPlaceholderGuide ? layer.text : finalText).length;
  const estWidth = align === "center" ? stage.width : Math.max(60, guideLength * fontSize * 0.55);
  const estHeight = fontSize * 1.2;
  const padding = Math.max(2, fontSize * 0.1);

  // B4 (owner 2026-09-15) — PLACEHOLDER (capa editable sin texto del cliente):
  // la tarjeta NO imprime contenido de texto, pero en la GRILLA el default de
  // la plantilla se dibuja como GUÍA atenuada ("así se verá") para TODAS las
  // plantillas con texto editable. En superficies no editables (preview del
  // modal, texturas 3D, confirmación) no se dibuja NADA. La guía + la ZONA DE
  // EDICIÓN (recuadro punteado turquesa + dot + hit invisible que abre el
  // editor) van marcadas `edit-indicator` → jamás se hornean en el snapshot
  // (studio-editor las oculta antes de toDataURL con find(".edit-indicator")).
  if (isPlaceholderGuide) {
    if (!isEditable) return null;
    const zone = {
      x: textX - padding,
      y: textY - padding,
      width: estWidth + padding * 2,
      height: estHeight + padding * 2,
    };
    return (
      <Group key={layer.id} listening={true}>
        {/* Guía "así se verá": default de la plantilla atenuado. Adorno de
            pantalla — name="placeholder-guide edit-indicator": se oculta en
            snapshots (producción + confirmación) igual que la zona dashed. */}
        <Text
          key={`${layer.id}-guide`}
          name="placeholder-guide edit-indicator"
          x={textX}
          y={textY}
          width={align === "center" ? stage.width : undefined}
          text={layer.text}
          fontFamily={fontFamily}
          fontSize={fontSize}
          fill={fill}
          fontStyle={fontStyle}
          align={align}
          opacity={PLACEHOLDER_GUIDE_OPACITY}
          listening={false}
          preventDefault={false}
        />
        <Rect
          name="edit-indicator"
          {...zone}
          fill="rgba(93, 217, 209, 0.10)"
          stroke="#5DD9D1"
          strokeWidth={1.5}
          dash={[5, 3]}
          cornerRadius={4}
          opacity={0.85}
          listening={false}
        />
        <Circle
          name="edit-indicator"
          x={zone.x + zone.width - 2}
          y={zone.y + 2}
          radius={3.5}
          fill="#5DD9D1"
          stroke="#FFFFFF"
          strokeWidth={1.5}
          listening={false}
        />
        {/* Hit invisible sobre la zona vacía: tocarla abre el editor de texto.
            Mismo patrón anti-doble-panel que el texto real (stopPropagation al DOM;
            el wrapper filtra el click sintético con canvasActionTapAt). */}
        <Rect
          {...zone}
          fill="rgba(0, 0, 0, 0)"
          preventDefault={false}
          onMouseEnter={(e) => {
            const stageNode = e.target.getStage();
            if (stageNode) stageNode.container().style.cursor = "text";
          }}
          onMouseLeave={(e) => {
            const stageNode = e.target.getStage();
            if (stageNode) stageNode.container().style.cursor = "";
          }}
          onClick={(e) => {
            e.cancelBubble = true;
            e.evt.stopPropagation();
            onTextEdit?.(layer.id);
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            e.evt.stopPropagation();
            onTextEdit?.(layer.id);
          }}
        />
      </Group>
    );
  }

  const textNode = (
    <Text
      key={`${layer.id}-text`}
      x={textX}
      y={textY}
      width={align === "center" ? stage.width : undefined}
      text={finalText}
      fontFamily={fontFamily}
      fontSize={fontSize}
      fill={fill}
      fontStyle={fontStyle}
      align={align}
      listening={isEditable}
      // Ola 3c — NO bloquear el scroll táctil sobre la franja de texto (Konva haría
      // preventDefault en el touchstart). El click sintético subsiguiente al tap lo
      // filtra el wrapper con el guard de lastTextEditTapRef.
      preventDefault={false}
      {...(onPhotoStyling ?? {})}
      onMouseEnter={(e) => {
        if (isEditable) {
          const stageNode = e.target.getStage();
          if (stageNode) stageNode.container().style.cursor = "text";
        }
      }}
      onMouseLeave={(e) => {
        if (isEditable) {
          const stageNode = e.target.getStage();
          if (stageNode) stageNode.container().style.cursor = "";
        }
      }}
      onClick={(e) => {
        if (isEditable && onTextEdit) {
          e.cancelBubble = true;
          // Exclusión mutua de paneles (bug Lucy 2026-07-22): cancelBubble solo frena
          // la propagación INTERNA de Konva; el evento nativo seguía subiendo del
          // <canvas> al wrapper div → su onClick abría ADEMÁS el picker/editor de foto
          // y quedaban dos paneles encimados. stopPropagation lo corta en el DOM.
          e.evt.stopPropagation();
          onTextEdit(layer.id);
        }
      }}
      onTap={(e) => {
        if (isEditable && onTextEdit) {
          e.cancelBubble = true;
          e.evt.stopPropagation(); // ver onClick: evita el doble panel picker/foco + texto
          onTextEdit(layer.id);
        }
      }}
    />
  );

  // Si NO es editable: render del text plano (texto fijo de la plantilla o texto
  // del cliente en superficies sin edición, como el preview del modal).
  if (!isEditable) {
    return textNode;
  }

  // Si editable, envolver con un Group y agregar Rect dashed visible ALREDEDOR
  // que indica al cliente "este texto se puede editar" + dot turquoise en corner
  // como hint visual extra. M.3.b.UX.3 — más visible que la versión inicial.
  // Auditoría v3 · H6 — el recuadro punteado + el dot son HINTS DE PANTALLA ("este texto se edita").
  // Van marcados `name="edit-indicator"` para ocultarlos en el snapshot de PRODUCCIÓN y en el preview
  // compositado (antes se horneaban en el PNG de imprenta y en la vista de confirmación). Es distinto
  // de `name="realism"` (sombra/glossy), que SÍ se conserva en el preview.
  return (
    <Group key={layer.id} listening={true}>
      <Rect
        name="edit-indicator"
        x={textX - padding}
        y={textY - padding}
        width={estWidth + padding * 2}
        height={estHeight + padding * 2}
        fill="rgba(93, 217, 209, 0.10)"
        stroke="#5DD9D1"
        strokeWidth={1.5}
        dash={[5, 3]}
        cornerRadius={4}
        opacity={0.85}
        listening={false}
      />
      {/* Dot turquesa en corner top-right indicando "editable" — diferenciador
          visual evidente vs textos no editables del template */}
      <Circle
        name="edit-indicator"
        x={textX + estWidth + padding - 2}
        y={textY - padding + 2}
        radius={3.5}
        fill="#5DD9D1"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        listening={false}
      />
      {textNode}
    </Group>
  );
}

type ShapeLayerData = {
  id: string;
  kind: "rect" | "circle" | "heart";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
};

// SVG path data normalizado para heart shape — bezier curves clásica.
// ViewBox 0 0 100 100, centro en (50, 50). Lo escalamos al width/height del layer.
//
// Path inspirado en SVG estándar de heart icon (Wikimedia commons CC0).
const HEART_PATH_DATA =
  "M50,82 C28,68 6,52 6,32 C6,18 16,8 28,8 C38,8 44,12 50,22 C56,12 62,8 72,8 C84,8 94,18 94,32 C94,52 72,68 50,82 Z";

function renderShape(layer: ShapeLayerData) {
  // M.3.b.A2.1 — Switch real por kind (antes siempre Rect, bug del heart "cuadrado")
  // Convención del seed: shapes usan x/y como CENTER.

  if (layer.kind === "circle") {
    return (
      <Circle
        key={layer.id}
        x={layer.x}
        y={layer.y}
        radius={Math.min(layer.width, layer.height) / 2}
        fill={layer.fill}
        stroke={layer.stroke}
        strokeWidth={layer.strokeWidth ?? 0}
      />
    );
  }

  if (layer.kind === "heart") {
    // Path está definido en viewBox 100×100. Scale al width/height del layer.
    // x/y del Path en Konva representan top-left de un bounding box implícito.
    return (
      <Path
        key={layer.id}
        x={layer.x - layer.width / 2}
        y={layer.y - layer.height / 2}
        scaleX={layer.width / 100}
        scaleY={layer.height / 100}
        data={HEART_PATH_DATA}
        fill={layer.fill}
        stroke={layer.stroke}
        strokeWidth={(layer.strokeWidth ?? 0) / (layer.width / 100)}
      />
    );
  }

  // Default: rect (con cornerRadius opcional)
  return (
    <Rect
      key={layer.id}
      x={layer.x - layer.width / 2}
      y={layer.y - layer.height / 2}
      width={layer.width}
      height={layer.height}
      fill={layer.fill}
      stroke={layer.stroke}
      strokeWidth={layer.strokeWidth ?? 0}
      cornerRadius={layer.cornerRadius ?? 0}
    />
  );
}

// ──────────────────────────────────────────────────────────────────
//  ImagePlaceholder — renderiza el slot Konva con foto o placeholder
// ──────────────────────────────────────────────────────────────────

// M.3.b.UX.v5 (Lucy 2026-05-15) — `shape` del producto controla SOLO el clipping
// del área de foto, NO la silueta del producto físico. El producto físico es
// siempre rectangular (más cornerRadius si aplica) — patrón de la industria
// de imanes magnéticos. Por eso:
//   - El heart/circle clip se aplica en una zona CUADRADA centrada del stage
//     (para que el shape no quede estirado en aspect 3:4 del template).
//   - El texto editable queda fuera de este clipping → visible en el rectángulo
//     del producto, abajo del heart, donde se va a imprimir realmente.
//   - El background del template también queda fuera del clipping → llena el
//     rectángulo entero (= silueta del producto).
//
// Exportado para reuso en <StudioPreviewModal>.
export function makeShapeClipFunc(
  shape: "heart" | "circle",
  stageWidth: number,
  stageHeight: number,
): (ctx: Konva.Context) => void {
  // Bounding box CUADRADO centrado en el stage. El heart/circle se renderea
  // dentro de este cuadrado sin estirar. El cuadrado se coloca pegado al
  // borde superior con padding leve (8% del lado) — coincide con la zona de
  // foto que da espacio para texto abajo (≈25% inferior del stage).
  const size = Math.min(stageWidth, stageHeight) * 0.92;
  const offsetX = (stageWidth - size) / 2;
  const offsetY = stageHeight * 0.04; // pegado arriba con padding pequeño
  return (ctx) => {
    ctx.beginPath();
    if (shape === "heart") {
      const sx = size / 100;
      const sy = size / 100;
      ctx.moveTo(offsetX + 50 * sx, offsetY + 82 * sy);
      ctx.bezierCurveTo(
        offsetX + 28 * sx,
        offsetY + 68 * sy,
        offsetX + 6 * sx,
        offsetY + 52 * sy,
        offsetX + 6 * sx,
        offsetY + 32 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 6 * sx,
        offsetY + 18 * sy,
        offsetX + 16 * sx,
        offsetY + 8 * sy,
        offsetX + 28 * sx,
        offsetY + 8 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 38 * sx,
        offsetY + 8 * sy,
        offsetX + 44 * sx,
        offsetY + 12 * sy,
        offsetX + 50 * sx,
        offsetY + 22 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 56 * sx,
        offsetY + 12 * sy,
        offsetX + 62 * sx,
        offsetY + 8 * sy,
        offsetX + 72 * sx,
        offsetY + 8 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 84 * sx,
        offsetY + 8 * sy,
        offsetX + 94 * sx,
        offsetY + 18 * sy,
        offsetX + 94 * sx,
        offsetY + 32 * sy,
      );
      ctx.bezierCurveTo(
        offsetX + 94 * sx,
        offsetY + 52 * sy,
        offsetX + 72 * sx,
        offsetY + 68 * sy,
        offsetX + 50 * sx,
        offsetY + 82 * sy,
      );
    } else {
      // circle — radio = size/2 (cuadrado centrado)
      const r = size / 2;
      ctx.arc(offsetX + r, offsetY + r, r, 0, Math.PI * 2);
    }
    ctx.closePath();
  };
}

// Helper para que image-placeholder y otras zonas que dependen del bounding
// box del heart/circle conozcan dónde está exactamente.
export function getShapeBoundingBox(
  stageWidth: number,
  stageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const size = Math.min(stageWidth, stageHeight) * 0.92;
  return {
    x: (stageWidth - size) / 2,
    y: stageHeight * 0.04,
    width: size,
    height: size,
  };
}

function ImagePlaceholder({
  layer,
  slotState,
  backingColor,
  onPhotoTransformChange,
  onPhotoDragStart,
  onPhotoDragEnd,
  interactiveSlots = true,
}: {
  layer: ImagePlaceholderLayer;
  slotState: SlotState;
  /**
   * Ola 23 (Lucy 2026-09-08) — color del RESPALDO de la ventana de foto. Con tarjeta
   * de color (frame-card/full-bleed; Ola 24: también Instagram CON borde) el hueco
   * que deja la foto al alejarla (zoom-out < 100% del cover) o al hacer pan se pinta
   * de este color (la tarjeta SIN marco) en vez de dejar ver el borderColor de
   * debajo — el marco/canal queda de ancho CONSTANTE bajo cualquier zoom/pan ("el
   * marco es marco, no fondo"). Es CONTENIDO del diseño (no edit-indicator): SÍ se
   * hornea en el snapshot de producción, igual que el fillRect equivalente de
   * production-render-canvas (ambos deciden con photoBackingHexFor).
   */
  backingColor?: string | null;
  /** M.3.b.UX.v9+ — callback parcial: drag manda offsetX/Y, zoom manda scale.
   * `undefined` = drag deshabilitado (modo vista previa). */
  onPhotoTransformChange?: (
    transform: Partial<{ offsetX: number; offsetY: number; scale: number }>,
  ) => void;
  /** M.3.b.UX.v5 — callbacks para que el wrapper sepa si el cliente está/estuvo
   * arrastrando la foto, y aborte el picker modal en ese caso. */
  onPhotoDragStart?: () => void;
  onPhotoDragEnd?: () => void;
  interactiveSlots?: boolean;
}) {
  const [image] = useImage(slotState.assetUrl ?? "", "anonymous");
  const imageNodeRef = useRef<Konva.Image | null>(null);
  // Convención del seed (verificada): image-placeholder usa x/y como TOP-LEFT
  // del slot (esquina superior izquierda). Ej. polaroid-clasico tiene
  // x=60, y=60, width=600, height=700 sobre stage 720x920 → slot va de
  // (60,60) a (660,760). NO restar width/2 ni height/2.
  const x = layer.x;
  const y = layer.y;

  // M.3.b.B.3 — Calcular Konva filters según slotState.filter preset.
  const { filtersArray, filterParams } = useMemo(() => {
    const params = getFilterParams(slotState.filter);
    if (!params) return { filtersArray: [] as FilterFunction[], filterParams: null };
    const f: FilterFunction[] = [];
    // Filters importados directamente del paquete (evita duplicar Konva runtime).
    if (params.grayscale) f.push(Grayscale as FilterFunction);
    if (params.brightness !== 0) f.push(Brighten as FilterFunction);
    if (params.contrast !== 0) f.push(Contrast as FilterFunction);
    if (params.saturation !== 0 || params.hue !== 0) f.push(HSL as FilterFunction);
    return { filtersArray: f, filterParams: params };
  }, [slotState.filter]);

  // M.3.b.B.3 — Konva filters requieren image.cache() para aplicarse.
  //
  // Lucy 2026-05-21 round 4 — bug: tras aplicar filtro, el zoom dejaba de
  // funcionar visualmente. Causa: node.cache() captura el bitmap al tamaño
  // CURRENT del node. Al cambiar `width`/`height` por scroll-zoom, el cache
  // queda fijo y la imagen no re-renderea al nuevo tamaño con el filter.
  // Fix: re-cache también cuando cambian las dimensiones renderizadas
  // (renderedW/H se calculan de photoTransform.scale + filtersArray).
  useEffect(() => {
    const node = imageNodeRef.current;
    if (!node || !image) return;
    if (filtersArray.length > 0) {
      // pixelRatio 2 = bitmap a 2x del tamaño visible (calidad nítida sin
      // que el cache sea desproporcionado en memoria).
      node.cache({ pixelRatio: 2 });
      node.getLayer()?.batchDraw();
    } else {
      node.clearCache();
      node.getLayer()?.batchDraw();
    }
  }, [image, filtersArray.length, slotState.filter, slotState.photoTransform?.scale]);

  // M.3.b.UX.v11 (Lucy 2026-05-15) — Smart auto-crop al cargar foto NUEVA.
  // Solo aplica si:
  //   1. Imagen cargada
  //   2. NO hay photoTransform persistido (foto recién subida, no editada)
  //   3. Hay callback para persistir el offset
  //
  // El algoritmo usa smartcrop.js (heurística contraste + saturación + bordes,
  // similar a Cloudinary / Apple Photos) para detectar el área más interesante
  // de la foto y centrar esa zona en el slot. Si el cliente carga una foto
  // familiar con caras descentradas a la derecha, el smart crop moverá la foto
  // a la izquierda para centrar las caras en el corazón/círculo/etc.
  //
  // El cliente puede sobreescribir manualmente con drag/zoom igual que antes.
  // La sugerencia es solo el punto inicial, no permanente.
  useEffect(() => {
    if (!image || !onPhotoTransformChange) return;
    if (slotState.photoTransform) return; // ya editada, no auto-aplicar
    const coverScale = Math.max(
      layer.width / image.naturalWidth,
      layer.height / image.naturalHeight,
    );
    let cancelled = false;
    analyzeSmartCrop(image, layer.width, layer.height, coverScale).then((result) => {
      if (cancelled || !result) return;
      // Solo aplicar si el offset es significativo (>5% del slot). Si el centro
      // de la imagen ya está bien encuadrado, no molestar.
      const minOffset = Math.min(layer.width, layer.height) * 0.05;
      if (Math.abs(result.offsetX) < minOffset && Math.abs(result.offsetY) < minOffset) return;
      onPhotoTransformChange({ offsetX: result.offsetX, offsetY: result.offsetY });
    });
    return () => {
      cancelled = true;
    };
  }, [image, slotState.photoTransform, onPhotoTransformChange, layer.width, layer.height]);

  if (slotState.assetUrl && image) {
    // M.3.b.UX.v9 (Lucy 2026-05-15) — Approach industria-estándar (Mixbook, Canva,
    // Vistaprint). Después de iteraciones v6-v8 con overscan automático invisible,
    // Lucy señaló correctamente que esos approaches "macheteaban" la solución.
    //
    // Approach correcto:
    //   1. Default scale = cover EXACTO sin overscan invisible. Cliente ve cover
    //      por default, sin sorpresas.
    //   2. Zoom AMPLIO (50%-300%) con GESTOS directos (Ola 9: rueda del mouse en
    //      desktop, pellizco en táctil dentro del preview del modal; el slider
    //      se eliminó porque se montaba sobre la foto). Cliente DECIDE el zoom:
    //      - 50%: foto más chica que slot, padding visible. Útil para encuadrar
    //        toda la foto sin recorte.
    //      - 100%: cover exacto (default).
    //      - 200-300%: zoom-in fuerte para acercar a un detalle.
    //   3. Drag SIN bounds: el cliente puede mover la foto libremente. Sin
    //      limitaciones artificiales. Si la mueve fuera, ve el background y
    //      entiende.
    //   4. Warning visual sutil si la foto no cubre el slot completo.
    //
    // Es lo que hacen los editores reales. Modular, transparente, sin algoritmos
    // ocultos que limiten al cliente.

    // Ola 3c — rotación de la foto (pasos de 90° desde "Ajustar foto"). Con 90/270
    // el cover se calcula con las dimensiones INTERCAMBIADAS: la foto girada cubre
    // la ventana sin huecos (misma matemática en production-render-canvas).
    const rotation = (((slotState.photoTransform?.rotation ?? 0) % 360) + 360) % 360;
    const swapDims = rotation === 90 || rotation === 270;
    const srcW = swapDims ? image.height : image.width;
    const srcH = swapDims ? image.width : image.height;

    const coverScaleBase = Math.max(layer.width / srcW, layer.height / srcH);
    const userScale = slotState.photoTransform?.scale ?? 1; // Permite zoom-out hasta 0.5 (foto 50% del cover). Floor para evitar
    // tamaños absurdos (foto < 10% del slot).
    const effectiveScale = Math.max(0.5, Math.min(3, userScale));
    const finalScale = coverScaleBase * effectiveScale;

    const renderedW = image.width * finalScale;
    const renderedH = image.height * finalScale;

    // v9 — offset directo del transform persistido. Sin clamping artificial.
    const photoOffset = slotState.photoTransform
      ? { x: slotState.photoTransform.offsetX, y: slotState.photoTransform.offsetY }
      : { x: 0, y: 0 };

    const isDraggable = !!onPhotoTransformChange && interactiveSlots;

    // Clip del Group local: rounded rect cuando cornerRadius, rect plano resto.
    // Para heart/circle no hace falta acá porque el Layer-level clipFunc del
    // Stage ya recorta a la silueta (este Group queda dentro del heart).
    const cornerR = layer.cornerRadius ?? 0;
    const groupClipFunc =
      cornerR > 0
        ? (ctx: Konva.Context) => {
            ctx.beginPath();
            const r = Math.min(cornerR, layer.width / 2, layer.height / 2);
            ctx.moveTo(r, 0);
            ctx.lineTo(layer.width - r, 0);
            ctx.quadraticCurveTo(layer.width, 0, layer.width, r);
            ctx.lineTo(layer.width, layer.height - r);
            ctx.quadraticCurveTo(layer.width, layer.height, layer.width - r, layer.height);
            ctx.lineTo(r, layer.height);
            ctx.quadraticCurveTo(0, layer.height, 0, layer.height - r);
            ctx.lineTo(0, r);
            ctx.quadraticCurveTo(0, 0, r, 0);
            ctx.closePath();
          }
        : undefined;

    return (
      <Group
        x={x + layer.width / 2}
        y={y + layer.height / 2}
        offsetX={layer.width / 2}
        offsetY={layer.height / 2}
        rotation={layer.rotation ?? 0}
        {...(groupClipFunc
          ? { clipFunc: groupClipFunc }
          : { clip: { x: 0, y: 0, width: layer.width, height: layer.height } })}
      >
        {/* Ola 23 — respaldo de la ventana: si la foto no la cubre (zoom-out/pan),
          el hueco sale del color de la tarjeta SIN marco, no del color del marco
          → el marco no "crece" al alejar la foto. Misma regla en producción. */}
        {backingColor && (
          <Rect
            x={0}
            y={0}
            width={layer.width}
            height={layer.height}
            fill={backingColor}
            listening={false}
            preventDefault={false}
          />
        )}
        <KonvaImage
          ref={(n) => {
            imageNodeRef.current = n;
          }}
          image={image}
          width={renderedW}
          height={renderedH}
          x={layer.width / 2 + photoOffset.x}
          y={layer.height / 2 + photoOffset.y}
          offsetX={renderedW / 2}
          offsetY={renderedH / 2}
          rotation={rotation}
          draggable={isDraggable}
          // Ola 3c / Ola 6 — slot NO interactivo (grilla táctil): Konva hace
          // preventDefault en shapes con preventDefault default true, bloqueando
          // el SCROLL de la página. Sin gestos inline (interactiveSlots=false)
          // dejamos preventDefault={false} y el dedo scrollea libre (pan-y).
          // En desktop interactivo el wheel/pinch necesita capturar el evento.
          preventDefault={isDraggable}
          // M.3.b.UX.v9 — drag SIN bounds (libre). El cliente decide dónde
          // poner la foto. Si la mueve fuera del slot, ve el background (warning
          // visible). Patrón industria: Mixbook, Canva, Vistaprint.
          onDragStart={() => {
            if (onPhotoDragStart) onPhotoDragStart();
          }}
          onDragEnd={(e) => {
            if (!onPhotoTransformChange) return;
            onPhotoTransformChange({
              offsetX: e.target.x() - layer.width / 2,
              offsetY: e.target.y() - layer.height / 2,
            });
            if (onPhotoDragEnd) onPhotoDragEnd();
          }}
          onMouseEnter={(e) => {
            if (isDraggable) {
              const s = e.target.getStage();
              if (s) s.container().style.cursor = "grab";
            }
          }}
          onMouseLeave={(e) => {
            if (isDraggable) {
              const s = e.target.getStage();
              if (s) s.container().style.cursor = "";
            }
          }}
          onMouseDown={(e) => {
            if (isDraggable) {
              const s = e.target.getStage();
              if (s) s.container().style.cursor = "grabbing";
            }
          }}
          onMouseUp={(e) => {
            if (isDraggable) {
              const s = e.target.getStage();
              if (s) s.container().style.cursor = "grab";
            }
          }}
          // M.3.b.B.3 — filters + params (no-op si sin filter)
          filters={filtersArray.length > 0 ? filtersArray : undefined}
          brightness={filterParams?.brightness ?? 0}
          contrast={filterParams?.contrast ?? 0}
          saturation={filterParams?.saturation ?? 0}
          hue={filterParams?.hue ?? 0}
        />
      </Group>
    );
  }

  // Placeholder cuando vacío o foto cargando
  return (
    <Rect
      x={x}
      y={y}
      width={layer.width}
      height={layer.height}
      fill="#F4ECFF"
      stroke="#7C6AAD"
      strokeWidth={2}
      dash={[12, 8]}
      cornerRadius={layer.cornerRadius ?? 0}
      // Ola 3c — decorativo (el overlay HTML del estado vacío lo tapa): no escuchar
      // ni bloquear el scroll táctil de la página.
      listening={false}
      preventDefault={false}
    />
  );
}
