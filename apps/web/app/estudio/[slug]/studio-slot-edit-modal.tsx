"use client";

/*
 * StudioSlotEditModal — Ola 6 (2026-07-23).
 *
 * Modal unificado de edición por slot. Reemplaza los botones separados
 * "Ajustar Foto" y "Editar texto" por un único punto de acceso con tabs:
 *
 *   - Foto: zoom, pan, rotar, filtros y reset (reutiliza StudioPhotoAdjustForm).
 *   - Texto: editor de cada text layer editable del slot (reutiliza
 *     StudioTextEditorForm).
 *
 * Accesible: Radix Dialog con role=dialog, cierre con Escape, foco inicial
 * y trap. En móvil el modal ocupa casi toda la pantalla; en desktop es un
 * modal centrado compacto.
 */

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ImageIcon, Type, ChevronLeft } from "lucide-react";
import { StudioPhotoAdjustForm } from "./studio-photo-adjust-modal";
import { StudioPhotoPreview } from "./studio-photo-preview";
import { StudioTextEditorForm } from "./studio-text-editor-modal";
import type { CanvasDataV1, PhotoFilterPreset, TextLayer, TextOverride } from "./types";

type PhotoTransform = { offsetX: number; offsetY: number; scale: number; rotation?: number };

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
  onNudge: (dx: number, dy: number) => void;
  onRotate: () => void;
  onApplyTextOverride: (layerId: string, override: TextOverride | null) => void;
  /** Text layer a preseleccionar al abrir la pestaña Texto (ej. al tocar un texto en el canvas). */
  focusTextLayerId?: string;
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
    calendarCard: { year: number; monthIndex0: number } | null;
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
  onNudge,
  onRotate,
  onApplyTextOverride,
  focusTextLayerId,
  preview,
}: StudioSlotEditModalProps) {
  // Tab activa: Foto por default si hay foto; si no, Texto (si aplica).
  const defaultTab = hasPhoto ? "photo" : "text";
  const [activeTab, setActiveTab] = useState(defaultTab);

  const title = slotLabel
    ? `Editar ${slotLabel}`
    : slotIndex !== null
      ? `Editar espacio ${slotIndex + 1}`
      : "Editar";

  return (
    <Dialog key={slotIndex ?? "closed"} open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[95vh] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        <div className="border-brand-purple/10 flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex flex-col">
            <DialogTitle className="text-brand-purple-dark text-base font-bold sm:text-lg">
              {title}
            </DialogTitle>
            <DialogDescription className="text-brand-muted text-xs sm:text-sm">
              Ajusta la foto y el texto de este espacio
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-brand-purple-dark/70 hover:text-brand-purple-dark"
          >
            <span className="sr-only">Cerrar</span>
            <span aria-hidden className="text-lg leading-none">
              ×
            </span>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="bg-brand-cream/50 mx-4 mt-3 grid w-auto grid-cols-2">
            <TabsTrigger value="photo" disabled={!hasPhoto} className="gap-1.5">
              <ImageIcon className="h-4 w-4" />
              Foto
            </TabsTrigger>
            <TabsTrigger value="text" disabled={!hasText} className="gap-1.5">
              <Type className="h-4 w-4" />
              Texto
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
                  <StudioPhotoAdjustForm
                    photoUrl={photoUrl}
                    currentFilter={currentFilter}
                    currentTransform={currentTransform}
                    onApplyFilter={onApplyFilter}
                    onResetTransform={onResetTransform}
                    onNudge={onNudge}
                    onRotate={onRotate}
                    allowFilters={allowFilters}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="text" className="mt-0 focus-visible:outline-none">
              {hasText && (
                <TextLayersEditor
                  layers={textLayers}
                  currentOverrides={currentTextOverrides}
                  onApply={onApplyTextOverride}
                  focusTextLayerId={focusTextLayerId}
                />
              )}
            </TabsContent>
          </div>
        </Tabs>

        <div className="border-brand-purple/10 bg-brand-cream/30 shrink-0 flex justify-end border-t px-4 py-3">
          <Button
            type="button"
            onClick={onClose}
            className="bg-brand-purple hover:bg-brand-purple-dark text-white"
          >
            Listo
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
}: {
  layers: TextLayer[];
  currentOverrides: Record<string, TextOverride> | undefined;
  onApply: (layerId: string, override: TextOverride | null) => void;
  focusTextLayerId?: string;
}) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(() => {
    // Si se tocó un texto específico, empezar editándolo directamente.
    if (focusTextLayerId && layers.some((l) => l.id === focusTextLayerId)) {
      return focusTextLayerId;
    }
    return layers.length === 1 ? (layers[0]?.id ?? null) : null;
  });

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
              Volver a capas
            </button>
          )}
        </div>
      )}

      {selectedLayerId === null || layers.length === 1 ? (
        <div className="space-y-2">
          <p className="text-brand-purple-dark/80 text-xs font-semibold">Elige un texto para editar</p>
          <div className="grid gap-2">
            {layers.map((layer) => {
              const override = currentOverrides?.[layer.id];
              const displayText = override?.text ?? layer.text;
              const hasOverride = !!override && Object.keys(override).length > 0;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setSelectedLayerId(layer.id)}
                  className="border-brand-purple/15 hover:border-brand-purple/40 hover:bg-brand-cream/50 flex items-center justify-between rounded-lg border p-3 text-left transition-colors"
                >
                  <span className="text-brand-purple-dark truncate text-sm font-medium">
                    {displayText || <span className="italic opacity-50">Sin texto</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    {hasOverride && (
                      <span className="bg-brand-turquoise/10 text-brand-turquoise shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                        editado
                      </span>
                    )}
                    <span className="text-brand-muted text-xs">Editar</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : selectedLayer ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedLayerId(null)}
              className="text-brand-purple-dark/70 hover:text-brand-purple-dark flex items-center gap-1 text-xs font-semibold underline"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Volver
            </button>
            <span className="text-brand-muted text-xs">
              Editando: {selectedLayer.text || "Sin texto"}
            </span>
          </div>
          <StudioTextEditorForm
            layer={selectedLayer}
            currentOverride={currentOverrides?.[selectedLayer.id]}
            onApply={(override) => {
              onApply(selectedLayer.id, override);
              setSelectedLayerId(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
