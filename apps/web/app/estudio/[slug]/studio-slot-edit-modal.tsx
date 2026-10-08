"use client";

/*
 * StudioSlotEditModal — Ola 6 (2026-07-23).
 *
 * Modal unificado de edición por slot. Reemplaza los botones separados
 * "Ajustar Foto" y "Editar texto" por un único punto de acceso con tabs:
 *
 *   - Foto: zoom, pan, rotar, filtros y reset (reutiliza StudioPhotoAdjustForm).
 *   - Texto: editor de cada text layer editable del slot (reutiliza
 *     StudioTextEditorForm). QA ronda 2 (owner 2026-10-07): con plantilla
 *     Polaroid Instagram, la pestaña suma la sección «Campos de Instagram»
 *     (StudioIgSlotFields) — los 5 campos asistidos del post editando el
 *     override INDIVIDUAL de este canvas.
 *
 * Accesible: Radix Dialog con role=dialog, cierre con Escape, foco inicial
 * y trap. En móvil el modal ocupa casi toda la pantalla; en desktop es un
 * modal centrado compacto.
 */

import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { ImageIcon, Type, ChevronLeft, Copy } from "lucide-react";
import { StudioPhotoAdjustForm } from "./studio-photo-adjust-modal";
import { StudioPhotoPreview } from "./studio-photo-preview";
import { StudioTextEditorForm } from "./studio-text-editor-modal";
import { StudioIgSlotFields } from "./studio-ig-slot-fields";
import type { CanvasDataV1, PhotoFilterPreset, TextLayer, TextOverride } from "./types";
import type { CalendarLayoutKey } from "@/features/personalization/calendar-layout";
import { CALENDAR_FONT_OPTIONS, type CalendarFontKey } from "@/features/personalization/schemas";
import { IG_PROFILE_PHOTO_LAYER } from "@/features/personalization/instagram-template-spec";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

type PhotoTransform = { offsetX: number; offsetY: number; scale: number; rotation?: number };
/** Fase 1B — encuadre del avatar IG (zoom/pan; sin rotación: es un círculo). */
type ProfileTransform = { offsetX: number; offsetY: number; scale: number };

type StudioSlotEditModalProps = {
  isOpen: boolean;
  slotIndex: number | null;
  slotLabel?: string;
  hasPhoto: boolean;
  hasText: boolean;
  photoUrl: string | null;
  currentFilter: PhotoFilterPreset | null;
  currentTransform: PhotoTransform | null;
  currentTextOverrides: Record<string, TextOverride> | undefined;
  textLayers: TextLayer[];
  allowFilters: boolean;
  onClose: () => void;
  onApplyFilter: (filter: PhotoFilterPreset | null) => void;
  onResetTransform: () => void;
  onRotate: () => void;
  /** null = limpiar el override de la capa; undefined = sin cambios (no-op). */
  onApplyTextOverride: (layerId: string, override: TextOverride | null | undefined) => void;
  /** Text layer a preseleccionar al abrir la pestaña Texto (ej. al tocar un texto en el canvas). */
  focusTextLayerId?: string;
  /**
   * Ola 28 (owner 2026-09-11, 1.2.1.A) — color de la tarjeta sobre la que se
   * imprime el texto (borderColor del canvas): el preview de la pestaña Texto
   * pinta ese fondo y avisa cuando la letra elegida casi no contrasta.
   */
  cardColor?: string | null;
  /**
   * Ola 29 (owner 2026-09-11, ronda 5) — color de letra POR DEFECTO por capa
   * sobre la tarjeta actual (el host lo calcula con la regla compartida del
   * lienzo: igTextFill en IG / defaultTextFillOnCard en el resto). El editor de
   * texto arranca con ese color → preview y lienzo nunca divergen.
   */
  textDefaultFills?: Record<string, string>;
  /** Ola 10 — solicitud de cambiar la foto: cierra el editor y abre el picker. */
  onChangePhoto?: () => void;
  /**
   * Ola 17 — control de FOTO DE PERFIL del header del post (plantilla Polaroid
   * Instagram, capa `profile-photo` del unitTemplate). Solo se muestra cuando la
   * plantilla trae esa capa. `onChangeProfilePhoto` cierra el editor y abre el
   * picker en modo profile; `onClearProfilePhoto` quita la foto.
   */
  hasProfilePhoto?: boolean;
  profilePhotoUrl?: string | null;
  onChangeProfilePhoto?: () => void;
  onClearProfilePhoto?: () => void;
  /**
   * Fase 1B — encuadre (zoom/pan) de la foto de perfil IG dentro de su círculo.
   * Persiste en SlotState.profileTransform vía store.setSlotProfileTransform.
   */
  profileTransform?: ProfileTransform | null;
  onProfileTransformChange?: (t: Partial<ProfileTransform>) => void;
  /**
   * Fase 1B — «Aplicar a todas» POR CAPA de texto (Polaroid Instagram: replica
   * el override de ESA capa en todos los slots vía setTextOverrideAllSlots).
   * Ausente → no se muestra el botón (packs de 1 solo imán).
   */
  onApplyTextToAll?: (layerId: string, override: TextOverride) => void;
  /**
   * Lucy 2026-09-08 — tipo de letra del calendario DENTRO de "Ajustar Foto".
   * Solo se pasa para productos calendario (el wrapper lo cablea al store).
   * Persiste en canvasData.calendarFont, igual que el selector del banner, y
   * aplica a classic y split (ambos consumen la misma clave).
   */
  calendarFont?: CalendarFontKey;
  onCalendarFontChange?: (font: CalendarFontKey) => void;
  /**
   * Modelo multi-unidad (owner 2026-09-09) — atajo "Aplicar este diseño a todas"
   * para productos de imán suelto (unitSlots = 1, polaroid/cuadrados: el slot ES
   * la unidad). Con unidades multi-slot el mismo atajo vive en el header de la
   * sección de la unidad. Ausente → no se muestra.
   */
  applyToAll?: {
    label: string;
    ariaLabel: string;
    title: string;
    onApply: () => void;
  };
  /**
   * Ola 9 — datos para el preview interactivo de la pestaña Foto (gestos de
   * zoom/pan directos sobre la foto; reemplaza al slider eliminado).
   */
  preview?: {
    unitTemplate: CanvasDataV1;
    totalSlots: number;
    borderColor: string | null;
    allowText: boolean;
    frameFullBleed: boolean;
    calendarCard: {
      year: number;
      monthIndex0: number;
      layout?: CalendarLayoutKey;
      /** Lucy 2026-09-07 — tipo de letra del título/mes (default "fredoka"). */
      font?: CalendarFontKey;
    } | null;
    onTransformChange: (t: Partial<{ offsetX: number; offsetY: number; scale: number }>) => void;
  };
};

export function StudioSlotEditModal({
  isOpen,
  slotIndex,
  slotLabel,
  hasPhoto,
  hasText,
  photoUrl,
  currentFilter,
  currentTransform,
  currentTextOverrides,
  textLayers,
  allowFilters,
  onClose,
  onApplyFilter,
  onResetTransform,
  onRotate,
  onApplyTextOverride,
  focusTextLayerId,
  cardColor = null,
  textDefaultFills,
  preview,
  onChangePhoto,
  hasProfilePhoto = false,
  profilePhotoUrl = null,
  onChangeProfilePhoto,
  onClearProfilePhoto,
  profileTransform = null,
  onProfileTransformChange,
  onApplyTextToAll,
  calendarFont = "fredoka",
  onCalendarFontChange,
  applyToAll,
}: StudioSlotEditModalProps) {
  // Tab activa: Foto por default si hay foto; si no, Texto (si aplica).
  const defaultTab = hasPhoto ? "photo" : "text";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const texts = useStudioTexts();

  // Bug 2026-09-07 — este componente está SIEMPRE montado (el wrapper del grid lo
  // renderiza aunque el diálogo esté cerrado), así que useState(defaultTab) se
  // inicializa UNA vez con hasPhoto=false (slot vacío en el primer render) y
  // nunca se actualizaba: al abrir el editor de un slot LLENO la pestaña activa
  // quedaba en Texto en vez de Foto. Se re-sincroniza al abrir el diálogo (y si
  // cambia hasPhoto mientras está abierto) ajustando el estado DURANTE el render
  // (patrón oficial de React para "derive el estado de las props"), porque
  // react-hooks/set-state-in-effect prohíbe el setState sincrónico en efectos.
  const [tabSync, setTabSync] = useState({ open: isOpen, hasPhoto });
  if (tabSync.open !== isOpen || tabSync.hasPhoto !== hasPhoto) {
    setTabSync({ open: isOpen, hasPhoto });
    if (isOpen) setActiveTab(hasPhoto ? "photo" : "text");
  }

  const title = slotLabel
    ? fillStudioText(texts.texto.slotEditTitulo, { etiqueta: slotLabel })
    : slotIndex !== null
      ? fillStudioText(texts.texto.slotEditTituloIndice, { n: slotIndex + 1 })
      : texts.comun.editar;

  // Labels de las 8 opciones de letra del calendario (mismas keys CMS que el banner).
  const calendarFontLabels: Record<string, string> = {
    fredoka: texts.lienzo.calFontOptionFredoka,
    inter: texts.lienzo.calFontOptionInter,
    caveat: texts.lienzo.calFontOptionCaveat,
    baloo2: texts.lienzo.calFontOptionBaloo2,
    nunito: texts.lienzo.calFontOptionNunito,
    patrick: texts.lienzo.calFontOptionPatrick,
    playfair: texts.lienzo.calFontOptionPlayfair,
    dancing: texts.lienzo.calFontOptionDancing,
  };

  return (
    <Dialog key={slotIndex ?? "closed"} open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        // Paquete B (2026-10-02) — en móvil/tablet el modal se sobre-dimensionaba:
        // `95vh` no refleja la barra del navegador ni el teclado virtual (comen
        // viewport) y la ventana excedía la pantalla visible. Mismo patrón del
        // preview modal (studio-preview-modal):
        //   - alto capado por dvh (viewport dinámico real);
        //   - en móvil (<sm) comportamiento tipo sheet: anclado abajo, ancho
        //     completo, max 92dvh, sin borde redondeado inferior;
        //   - en sm+ centrado como siempre;
        //   - el scroll vive en el contenido (overflow-y-auto abajo): cabecera
        //     (título + cerrar) y acciones (footer) quedan siempre visibles.
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 max-sm:top-auto max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[92dvh] max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-2xl"
        showCloseButton={false}
      >
        <div className="border-brand-purple/10 flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex flex-col">
            <DialogTitle className="text-brand-purple-dark text-base font-bold sm:text-lg">
              {title}
            </DialogTitle>
            <DialogDescription className="text-brand-muted text-xs sm:text-sm">
              {texts.texto.slotEditDesc}
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={texts.comun.cerrar}
            className="text-brand-purple-dark/70 hover:text-brand-purple-dark"
          >
            <span className="sr-only">{texts.comun.cerrar}</span>
            <span aria-hidden className="text-lg leading-none">
              ×
            </span>
          </Button>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="bg-brand-cream/50 mx-4 mt-3 grid w-auto grid-cols-2">
            <TabsTrigger value="photo" disabled={!hasPhoto} className="gap-1.5">
              <ImageIcon className="h-4 w-4" />
              {texts.texto.tabFoto}
            </TabsTrigger>
            <TabsTrigger value="text" disabled={!hasText} className="gap-1.5">
              <Type className="h-4 w-4" />
              {texts.texto.tabTexto}
            </TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <TabsContent value="photo" className="mt-0 focus-visible:outline-none">
              {hasPhoto && photoUrl && (
                <div className="space-y-4">
                  {/* Ola 9 — preview interactivo WYSIWYG: acá van los gestos de
                    encuadre (arrastre = pan, rueda/pellizco = zoom, doble toque
                    = centrar). Sin slider: el control es directo sobre la foto. */}
                  {preview && (
                    <StudioPhotoPreview
                      unitTemplate={preview.unitTemplate}
                      slotState={{
                        slotIndex: slotIndex ?? 0,
                        assetId: null,
                        assetUrl: photoUrl,
                        filter: currentFilter,
                        photoTransform: currentTransform ?? undefined,
                        textOverrides: currentTextOverrides,
                        // Ola 17 — la vista previa del editor muestra la foto de perfil.
                        profileAssetUrl: profilePhotoUrl ?? undefined,
                        // Fase 1B — y su encuadre (WYSIWYG con la grilla).
                        profileTransform: profileTransform ?? undefined,
                      }}
                      totalSlots={preview.totalSlots}
                      borderColor={preview.borderColor}
                      allowText={preview.allowText}
                      frameFullBleed={preview.frameFullBleed}
                      calendarCard={preview.calendarCard}
                      onTransformChange={preview.onTransformChange}
                      onResetTransform={onResetTransform}
                    />
                  )}
                  {/* Ola 10 — desde el editor unificado se puede reemplazar la foto sin
                      volver a la grilla. Mantiene el flujo de 2 tabs unificado. */}
                  {onChangePhoto && (
                    <button
                      type="button"
                      onClick={onChangePhoto}
                      className="text-brand-purple-dark hover:text-brand-purple w-full text-xs font-semibold underline"
                    >
                      {texts.texto.cambiarFoto}
                    </button>
                  )}
                  {/* Lucy 2026-09-08 — bug reportado por Lucy: en "Calendario Set 12
                      Tarjetas" el tipo de letra NO se podía elegir desde "Ajustar
                      Foto". Root cause: el selector solo existía en el banner del
                      Estudio (studio-editor.tsx), inalcanzable mientras esta ventana
                      está abierta. Acá va el MISMO selector, cableado al store
                      (canvasData.calendarFont) → aplica a los 12 meses y a ambos
                      layouts (classic y split consumen la misma clave). */}
                  {onCalendarFontChange && (
                    <div className="border-brand-purple/15 rounded-xl border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor="cal-font-select"
                          className="text-brand-purple-dark text-sm font-semibold"
                        >
                          {texts.lienzo.calFontLabel}
                        </label>
                        <select
                          id="cal-font-select"
                          value={calendarFont}
                          onChange={(e) => onCalendarFontChange(e.target.value as CalendarFontKey)}
                          className="border-brand-purple/50 focus-visible:ring-brand-purple/40 text-brand-purple-dark cursor-pointer rounded-xl border-2 bg-white px-3 py-1.5 text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
                          // Nombre accesible vía el <label htmlFor> visible ("Tipo de letra:").
                          // Sin aria-label propio: duplicaba el del banner del editor
                          // ("Tipo de letra del título del calendario") cuando ambos
                          // selects coexisten (modal abierto sobre el lienzo) — nombre
                          // ambiguo para SR y locator ambiguo en e2e.
                        >
                          {CALENDAR_FONT_OPTIONS.map((key) => (
                            <option key={key} value={key}>
                              {calendarFontLabels[key] ?? key}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-brand-muted mt-1.5 text-xs leading-snug">
                        {texts.texto.calFontModalHint}
                      </p>
                    </div>
                  )}
                  {/* Ola 17 — foto de perfil del header del post (solo plantillas con
                      la capa `profile-photo`, ej. Polaroid Instagram). El avatar se ve
                      en círculo dentro del anillo del encabezado del post. */}
                  {hasProfilePhoto && (
                    <div className="border-brand-purple/15 rounded-xl border p-3">
                      <div className="flex items-center gap-3">
                        {profilePhotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={profilePhotoUrl}
                            alt={texts.texto.perfilTitulo}
                            className="border-brand-purple/20 h-12 w-12 rounded-full border-2 object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="border-brand-purple/20 bg-brand-cream/60 flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed"
                          >
                            <ImageIcon className="text-brand-muted h-5 w-5" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-brand-purple-dark text-sm font-semibold">
                            {texts.texto.perfilTitulo}
                          </p>
                          <p className="text-brand-muted text-xs leading-snug">
                            {texts.texto.perfilHint}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        {onChangeProfilePhoto && (
                          // Lucy 2026-09-09 — la acción principal de la sección es un
                          // BOTÓN de marca (pill sólido, como los demás botones de la
                          // ventana), no un texto subrayado: se leía como hint, no como
                          // acción. «Quitar» queda como acción secundaria destructiva.
                          <button
                            type="button"
                            onClick={onChangeProfilePhoto}
                            className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/20 hover:shadow-brand-purple/30 focus-visible:ring-brand-turquoise inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98]"
                          >
                            <ImageIcon className="h-4 w-4" aria-hidden />
                            {profilePhotoUrl
                              ? texts.texto.perfilCambiar
                              : texts.texto.perfilPickerTitulo}
                          </button>
                        )}
                        {profilePhotoUrl && onClearProfilePhoto && (
                          <button
                            type="button"
                            onClick={onClearProfilePhoto}
                            className="text-xs font-semibold text-red-600 underline hover:text-red-700"
                          >
                            {texts.texto.perfilQuitar}
                          </button>
                        )}
                      </div>
                      {/* Fase 1B — encuadre del avatar (zoom/pan dentro del círculo),
                          mismo lenguaje de gestos del preview principal. */}
                      {profilePhotoUrl && onProfileTransformChange && (
                        <ProfilePhotoFramer
                          photoUrl={profilePhotoUrl}
                          transform={profileTransform}
                          onChange={onProfileTransformChange}
                        />
                      )}
                    </div>
                  )}
                  <StudioPhotoAdjustForm
                    photoUrl={photoUrl}
                    currentFilter={currentFilter}
                    currentTransform={currentTransform}
                    onApplyFilter={onApplyFilter}
                    onResetTransform={onResetTransform}
                    onRotate={onRotate}
                    allowFilters={allowFilters}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="text" className="mt-0 focus-visible:outline-none">
              {hasText && (
                <div className="space-y-5">
                  {/* QA ronda 2 (owner 2026-10-07, F3) — los 5 campos de la
                      Polaroid Instagram también en la edición INDIVIDUAL de este
                      canvas (escribe el override del slot vía onApplyTextOverride;
                      no toca los demás). Solo se renderiza con plantilla IG. */}
                  <StudioIgSlotFields
                    slotIndex={slotIndex}
                    currentOverrides={currentTextOverrides}
                    onApply={onApplyTextOverride}
                  />
                  <TextLayersEditor
                    layers={textLayers}
                    currentOverrides={currentTextOverrides}
                    onApply={onApplyTextOverride}
                    focusTextLayerId={focusTextLayerId}
                    cardColor={cardColor}
                    textDefaultFills={textDefaultFills}
                    onApplyToAll={onApplyTextToAll}
                  />
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <div className="border-brand-purple/10 bg-brand-cream/30 flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3">
          {/* Multi-unidad (2026-09-09) — con imán suelto, el atajo "Aplicar este
              diseño a todas" copia este slot (foto + encuadre + filtro + textos)
              a todos los demás. */}
          <div>
            {applyToAll && (
              <Hint content={applyToAll.title}>
                <button
                  type="button"
                  onClick={applyToAll.onApply}
                  aria-label={applyToAll.ariaLabel}
                  className="border-brand-purple/30 text-brand-purple-dark hover:border-brand-purple/60 hover:bg-brand-purple/5 focus-visible:ring-brand-turquoise inline-flex items-center gap-1.5 rounded-full border-2 bg-white px-3.5 py-2 text-xs font-bold transition-all focus-visible:ring-2 focus-visible:outline-none active:scale-95"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {applyToAll.label}
                </button>
              </Hint>
            )}
          </div>
          {/* Owner 2026-10-05 — jerarquía de primarios: «Aplicar» (arriba en el
              formulario de texto) es la acción principal de la edición; «Listo»
              solo CIERRA el modal → baja a estilo secundario (outline) para que
              los dos primarios no compitan. */}
          <Button type="button" variant="outline" onClick={onClose}>
            {texts.texto.slotEditListo}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TextLayersEditor({
  layers,
  currentOverrides,
  onApply,
  focusTextLayerId,
  cardColor = null,
  textDefaultFills,
  onApplyToAll,
}: {
  layers: TextLayer[];
  currentOverrides: Record<string, TextOverride> | undefined;
  onApply: (layerId: string, override: TextOverride | null | undefined) => void;
  focusTextLayerId?: string;
  cardColor?: string | null;
  textDefaultFills?: Record<string, string>;
  /** Fase 1B — «Aplicar a todas» por capa (replica el override de la capa en
   *  todos los slots). Ausente → el botón no se muestra. */
  onApplyToAll?: (layerId: string, override: TextOverride) => void;
}) {
  const texts = useStudioTexts();
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(() => {
    // Si se tocó un texto específico, empezar editándolo directamente.
    if (focusTextLayerId && layers.some((l) => l.id === focusTextLayerId)) {
      return focusTextLayerId;
    }
    return layers.length === 1 ? (layers[0]?.id ?? null) : null;
  });
  // Feedback aria-live tras «Aplicar a todas» (mismo patrón sr-only del grid).
  const [appliedLayerId, setAppliedLayerId] = useState<string | null>(null);

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) ?? layers[0] ?? null,
    [layers, selectedLayerId],
  );

  if (layers.length === 0) return null;

  // Si solo hay una capa, mostrar el editor directamente.
  if (layers.length === 1 && selectedLayer) {
    return (
      <StudioTextEditorForm
        layer={selectedLayer}
        currentOverride={currentOverrides?.[selectedLayer.id]}
        onApply={(override) => onApply(selectedLayer.id, override)}
        cardColor={cardColor}
        cardDefaultFill={textDefaultFills?.[selectedLayer.id]}
      />
    );
  }

  return (
    <div className="space-y-4">
      {selectedLayer && layers.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {selectedLayerId !== null && (
            <button
              type="button"
              onClick={() => setSelectedLayerId(null)}
              className="text-brand-purple-dark/70 hover:text-brand-purple-dark flex items-center gap-1 text-xs font-semibold underline"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {texts.texto.capasVolver}
            </button>
          )}
        </div>
      )}

      {selectedLayerId === null || layers.length === 1 ? (
        <div className="space-y-2">
          <p className="text-brand-purple-dark/80 text-xs font-semibold">
            {texts.texto.capasElegir}
          </p>
          <div className="grid gap-2">
            {layers.map((layer) => {
              const override = currentOverrides?.[layer.id];
              const displayText = override?.text ?? layer.text;
              const hasOverride = !!override && Object.keys(override).length > 0;
              // Fase 1B — «Aplicar a todas» por capa: solo cuando hay un override
              // con texto del cliente en ESTE slot (no tiene sentido propagar el
              // placeholder vacío) y el host cableó la acción (pack > 1 unidad).
              const canApplyToAll = !!onApplyToAll && !!override && !!override.text?.trim();
              return (
                <div
                  key={layer.id}
                  className="border-brand-purple/15 flex items-center gap-2 rounded-lg border p-1.5 pl-3"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedLayerId(layer.id)}
                    className="hover:bg-brand-cream/50 flex flex-1 items-center justify-between gap-2 rounded-md p-1.5 text-left transition-colors"
                  >
                    <span className="text-brand-purple-dark truncate text-sm font-medium">
                      {displayText || (
                        <span className="italic opacity-50">{texts.texto.sinTexto}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {hasOverride && (
                        <span className="bg-brand-turquoise/10 text-brand-turquoise shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                          {texts.texto.capaEditadaBadge}
                        </span>
                      )}
                      <span className="text-brand-muted text-xs">{texts.comun.editar}</span>
                    </div>
                  </button>
                  {canApplyToAll && (
                    <Hint content={texts.texto.capaAplicarATodas}>
                      <button
                        type="button"
                        onClick={() => {
                          onApplyToAll(layer.id, override);
                          setAppliedLayerId(layer.id);
                        }}
                        aria-label={fillStudioText(texts.texto.capaAplicarATodasAria, {
                          texto: displayText,
                        })}
                        className="border-brand-purple/30 text-brand-purple-dark hover:border-brand-purple/60 hover:bg-brand-purple/5 focus-visible:ring-brand-turquoise inline-flex shrink-0 items-center gap-1 rounded-full border-2 bg-white px-2.5 py-1.5 text-[11px] font-bold transition-all focus-visible:ring-2 focus-visible:outline-none active:scale-95"
                      >
                        <Copy className="h-3 w-3" aria-hidden />
                        {texts.texto.capaAplicarATodas}
                      </button>
                    </Hint>
                  )}
                </div>
              );
            })}
          </div>
          {/* Feedback aria-live del «Aplicar a todas» por capa (patrón sr-only). */}
          <span aria-live="polite" role="status" className="sr-only">
            {appliedLayerId ? texts.texto.capaAplicadaFeedback : ""}
          </span>
        </div>
      ) : selectedLayer ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedLayerId(null)}
              className="bg-brand-purple hover:bg-brand-purple-dark shadow-brand-purple/20 hover:shadow-brand-purple/30 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {texts.comun.volver}
            </button>
            <span className="text-brand-muted text-xs">
              {fillStudioText(texts.texto.capaEditando, {
                texto: selectedLayer.text || texts.texto.sinTexto,
              })}
            </span>
          </div>
          <StudioTextEditorForm
            layer={selectedLayer}
            currentOverride={currentOverrides?.[selectedLayer.id]}
            onApply={(override) => {
              onApply(selectedLayer.id, override);
              setSelectedLayerId(null);
            }}
            cardColor={cardColor}
            cardDefaultFill={textDefaultFills?.[selectedLayer.id]}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Fase 1B — Encuadre de la FOTO DE PERFIL de la Polaroid Instagram (zoom/pan del
 * avatar dentro de su círculo). El preview principal (`StudioPhotoPreview`) está
 * atado al `photoTransform` de la foto grande y no es reutilizable acá, así que
 * este control compacto replica su lenguaje de gestos en DOM puro: arrastre = pan,
 * slider = zoom, doble clic = centrar. La matemática es la MISMA del renderer
 * Konva (`ProfilePhotoLayerRenderer`): cover × scale, centro + offset en coords
 * del stage (radio del spec IG_PROFILE_PHOTO_LAYER) — WYSIWYG con la grilla.
 * Accesible: el círculo es focusable y las flechas del teclado hacen pan.
 */
const PROFILE_FRAMER_SIZE = 128; // px de display del círculo de encuadre

function ProfilePhotoFramer({
  photoUrl,
  transform,
  onChange,
}: {
  photoUrl: string;
  transform: ProfileTransform | null;
  onChange: (t: Partial<ProfileTransform>) => void;
}) {
  const texts = useStudioTexts();
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const t = transform ?? { offsetX: 0, offsetY: 0, scale: 1 };
  const D = PROFILE_FRAMER_SIZE;
  const stageDiameter = IG_PROFILE_PHOTO_LAYER.radius * 2;
  // Los offsets viven en coords del stage (igual que photoTransform); el display
  // los escala por D / diámetro-del-círculo-en-el-stage.
  const displayScale = D / stageDiameter;
  const base = imgSize ? Math.max(D / imgSize.w, D / imgSize.h) : 1;
  const w = imgSize ? imgSize.w * base * t.scale : 0;
  const h = imgSize ? imgSize.h * base * t.scale : 0;
  const left = (D - w) / 2 + t.offsetX * displayScale;
  const top = (D - h) / 2 + t.offsetY * displayScale;

  return (
    <div className="border-brand-purple/10 mt-3 border-t pt-3">
      <p className="text-brand-purple-dark text-xs font-semibold">
        {texts.texto.perfilEncuadreTitulo}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <div
          role="application"
          tabIndex={0}
          aria-label={`${texts.texto.perfilEncuadreTitulo}. ${texts.texto.perfilEncuadreHint}`}
          className="border-brand-purple/20 focus-visible:ring-brand-turquoise relative shrink-0 cursor-grab touch-none overflow-hidden rounded-full border-2 select-none focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
          style={{ width: D, height: D }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              baseX: t.offsetX,
              baseY: t.offsetY,
            };
          }}
          onPointerMove={(e) => {
            const d0 = dragRef.current;
            if (!d0) return;
            onChange({
              offsetX: d0.baseX + (e.clientX - d0.startX) / displayScale,
              offsetY: d0.baseY + (e.clientY - d0.startY) / displayScale,
            });
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onDoubleClick={() => onChange({ offsetX: 0, offsetY: 0, scale: 1 })}
          onKeyDown={(e) => {
            // Pan por teclado (alternativa al arrastre): paso de 4px de display.
            const step = 4 / displayScale;
            if (e.key === "ArrowLeft") onChange({ offsetX: t.offsetX - step });
            else if (e.key === "ArrowRight") onChange({ offsetX: t.offsetX + step });
            else if (e.key === "ArrowUp") onChange({ offsetY: t.offsetY - step });
            else if (e.key === "ArrowDown") onChange({ offsetY: t.offsetY + step });
            else return;
            e.preventDefault();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- preview local del avatar */}
          <img
            src={photoUrl}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            className="pointer-events-none absolute max-w-none"
            style={{ left, top, width: w, height: h }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Slider
            min={1}
            max={3}
            step={0.05}
            value={[Math.max(1, t.scale)]}
            onValueChange={(v) => onChange({ scale: v[0] })}
            aria-label={texts.texto.perfilZoomAria}
          />
          <p className="text-brand-muted mt-1.5 text-[11px] leading-snug">
            {texts.texto.perfilEncuadreHint}
          </p>
        </div>
      </div>
    </div>
  );
}
