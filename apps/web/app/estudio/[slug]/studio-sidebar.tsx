"use client";

/*
 * StudioSidebar — Mis fotos + Plantillas + Auto-fill (M.3.b Capa 2).
 *
 * Diferencias vs sidebar M.3:
 *   - Progress bar X/N + indicador visual completo
 *   - Botón "🪄 Llenar slots con mis fotos" con stagger animation
 *   - Lista assets con drag handle nativo + click-to-assign al slot seleccionado
 *   - Plantillas con preview card + ring on selected + click apply
 *
 * El sidebar es store-aware: lee de zustand selectivamente.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Image as ImageIcon,
  Sparkles,
  Wand2,
  Loader2,
  Check,
  ChevronDown,
  Eye,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";
import { uploadDesignAssetAction } from "@/features/personalization/actions";
import {
  applyPredesignedToSlot,
  applyPredesignedVarietyToEmptySlots,
  firstFreeSlotOfFace,
  PREDESIGNED_DRAG_MIME,
} from "./lib/apply-predesigned";
import { predesignedFaceBadge } from "./lib/predesigned-variety";
import { StudioFaceChoiceModal } from "./studio-face-choice-modal";
import { StudioReplaceSlotModal, type ReplaceSlotOption } from "./studio-replace-slot-modal";
import { PredesignedHoverPreview } from "./predesigned-hover-preview";
import { PredesignedViewDialog } from "./predesigned-view-dialog";
import { StudioMessageField } from "./studio-message-field";
import { ConsentText } from "./studio-consent-text";
import {
  StudioChecklist,
  useStudioChecklist,
  type StudioChecklistStepId,
} from "./studio-checklist";
import {
  selectAssetIsUsed,
  selectFilledSlotCount,
  selectTotalSlotCount,
  type StudioStoreState,
} from "./lib/store";
import { STUDIO_ACCEPTED_IMAGE_TYPES, uploadGuidanceText } from "./lib/upload-guidance";
import { processPhotoFiles } from "./lib/upload-photo-pipeline";
import type { StudioAsset, StudioTemplate } from "./types";
import { PhotoQualityModal } from "./photo-quality-modal";
import { Hint } from "@/components/ui/tooltip";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText } from "./studio-texts";

/** Fase 2 · 2.5 (2026-10-07) — con más de este número de diseños prediseñados
 *  la sección arranca COLAPSADA (cerrada), para no sepultar «Mis fotos». */
const PREDESIGNED_COLLAPSE_THRESHOLD = 6;

type StudioSidebarProps = {
  store: StoreApi<StudioStoreState>;
  productName: string;
  productSku: string;
  /** P0.7 — tamaño físico del producto para mostrar bajo cada plantilla. */
  productSizeCm?: string;
  /** P0.7 — forma física para borde redondeado realista de la card. */
  productShape?: "rectangle" | "circle" | "heart" | "custom";
  /** Ola 3 — el producto admite texto editable (Polaroid). Habilita el campo "Tu mensaje". */
  allowText?: boolean;
  /** Ola 21 — diseños prediseñados aplicables por slot (galería admin). */
  predesigned?: import("./studio-asset-picker-modal").PredesignedItem[];
  /** Paquete A (2026-10-02) — caras del producto: badges 1/2 caras de los
   *  prediseñados y llenado variado por pares A/B (default 1). */
  facesPerUnit?: number;
  /** Separadores: la cara B es opcional — el paso «fotos» del checklist solo
   *  exige las caras A (mismo criterio que «Ver diseño»). Default false. */
  backOptional?: boolean;
  /**
   * Ola 2 (2026-10-26) — densidad del panel: "compact" es la instancia del
   * SHEET móvil (full-width: las miniaturas crecían a ~110px — owner las quiere
   * más pequeñas en celular, "cargadas o prediseñadas"): grilla de 4 columnas,
   * gaps y paddings menores. El aside desktop ("default") no cambia en nada.
   */
  density?: "default" | "compact";
  /**
   * Ola 2 (2026-10-26) — señal del bloqueo GUIADO de plantilla (timestamp del
   * intento de «Ver diseño» sin plantilla elegida): la sección de plantillas se
   * scrollea a la vista y se RESALTA ~1.8 s. 0 = sin nudge.
   */
  templateNudgeSignal?: number;
};

export function StudioSidebar({
  store,
  productName,
  productSku,
  productSizeCm,
  productShape,
  allowText = false,
  predesigned = [],
  facesPerUnit = 1,
  backOptional = false,
  density = "default",
  templateNudgeSignal = 0,
}: StudioSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Consentimiento de derechos de imagen (Ley 1581): obligatorio antes de subir.
  const [rightsAccepted, setRightsAccepted] = useState(false);
  // P0.2 — Toggle "ocultar usadas" tipo Mixbook Hide Used.
  const [hideUsed, setHideUsed] = useState(false);
  // C2 (owner 2026-09-15) — fotos ajustadas automáticamente al subir (upscale
  // local, client-photo-upscale): Set de assetIds para el badge "✨ Optimizada"
  // del thumb (el servidor recibe la versión ya ajustada y no puede saberlo).
  // Alcance de sesión del Estudio, suficiente para el badge.
  const [improvedAssetIds, setImprovedAssetIds] = useState<ReadonlySet<string>>(new Set());
  const texts = useStudioTexts();

  // Suscripciones selectivas zustand
  const assets = useStore(store, (s) => s.assets);
  const templates = useStore(store, (s) => s.templates);
  const selectedTemplateId = useStore(store, (s) => s.selectedTemplateId);
  const designId = useStore(store, (s) => s.designId);
  // Suscripciones atómicas — evita re-render infinito por shallow compare de array nested.
  const filledSlots = useStore(store, selectFilledSlotCount);
  const totalSlots = useStore(store, selectTotalSlotCount);
  const addAsset = useStore(store, (s) => s.addAsset);
  const autoFillSlots = useStore(store, (s) => s.autoFillSlots);
  const applyTemplate = useStore(store, (s) => s.applyTemplate);
  // 2026-10-19 — el clic en prediseñados YA NO usa selectedSlotIndex (pregunta
  // siempre el destino); solo queda la acción para limpiar la selección tras
  // aplicar (ver applyPredesigned).
  const selectSlot = useStore(store, (s) => s.selectSlot);
  const [applyingPredesignedId, setApplyingPredesignedId] = useState<string | null>(null);
  // Regla de caras (2026-10-12) — diseño de 1 cara esperando la elección de
  // cara (modal "¿En qué cara quieres aplicarlo?"). null = modal cerrada.
  const [faceChoiceItem, setFaceChoiceItem] = useState<
    import("./studio-asset-picker-modal").PredesignedItem | null
  >(null);
  // Reemplazo explícito (2026-10-19) — prediseñado esperando la elección del
  // lienzo OCUPADO a reemplazar (modal StudioReplaceSlotModal). `face` filtra
  // la lista a la cara elegida cuando viene del modal de cara; null = todas
  // las candidatas (cara A si el diseño trae imageUrlB — necesita ancla A).
  const [replaceChoice, setReplaceChoice] = useState<{
    item: import("./studio-asset-picker-modal").PredesignedItem;
    face: "A" | "B" | null;
  } | null>(null);
  // Fase 2 · 2.5 — sección de prediseñados COLAPSABLE: con muchos diseños
  // sepultaba el resto de la sidebar («Mis fotos» quedaba lejos). Cerrada por
  // defecto cuando supera el umbral; el contador queda visible en el header.
  const [predesignedOpen, setPredesignedOpen] = useState(
    () => predesigned.length <= PREDESIGNED_COLLAPSE_THRESHOLD,
  );
  // 2026-10-26 — prediseñado en preview «Ver» (Dialog): la ÚNICA vía de ver el
  // diseño en grande en táctil (el HoverCard es hover-only); en desktop
  // coexiste con el hover.
  const [viewingItem, setViewingItem] = useState<
    import("./studio-asset-picker-modal").PredesignedItem | null
  >(null);

  // 5.1 (2026-10-22) — checklist persistente «Tu diseño» al tope del sidebar
  // (mismo componente en el aside desktop y el sheet móvil). El badge del FAB
  // «Editar» usa el mismo hook desde studio-editor.
  const { steps: checklistSteps } = useStudioChecklist(store, {
    allowText,
    hasPredesigned: predesigned.length > 0,
    backOptional,
  });
  // La sidebar se monta DOS veces (aside desktop + sheet móvil) con los mismos
  // ids de sección: la navegación del checklist se resuelve dentro de ESTA
  // instancia vía rootRef (un getElementById global podría caer en la copia
  // oculta y no hacer nada).
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollToSection = (selector: string) => {
    rootRef.current
      ?.querySelector(selector)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Ola 2 (2026-10-26) — bloqueo GUIADO de la plantilla: «Ver diseño» sin
  // plantilla elegida (con >1) emite templateNudgeSignal (timestamp) → la
  // sección de plantillas se scrollea a la vista y se resalta ~1.8 s. El guard
  // de frescura cubre la carrera de montaje del sheet móvil (el nudge abre el
  // sheet y ESTA instancia monta unos cientos de ms después: un nudge reciente
  // sigue contando). El setState va DIFERIDO en callbacks (regla
  // react-hooks/set-state-in-effect: nunca síncrono en el cuerpo del effect).
  const [flashSignal, setFlashSignal] = useState(0);
  useEffect(() => {
    if (!templateNudgeSignal || templateNudgeSignal <= flashSignal) return;
    if (Date.now() - templateNudgeSignal > 2500) return;
    rootRef.current
      ?.querySelector("#sidebar-plantillas")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    const on = window.setTimeout(() => setFlashSignal(templateNudgeSignal), 0);
    const off = window.setTimeout(() => setFlashSignal(0), 1850);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [templateNudgeSignal, flashSignal]);
  const flashTemplates = flashSignal !== 0;
  const handleChecklistSelect = (id: StudioChecklistStepId) => {
    if (id === "plantillas") {
      scrollToSection("#sidebar-plantillas");
    } else if (id === "fotos") {
      scrollToSection("#sidebar-mis-fotos");
    } else if (id === "predisenados") {
      setPredesignedOpen(true);
      // Tras expandir, la sección cambia de alto: el scroll espera un frame.
      requestAnimationFrame(() => scrollToSection("#sidebar-predisenados"));
    } else if (id === "mensaje") {
      const input = rootRef.current?.querySelector<HTMLInputElement>("#studio-message-input");
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus({ preventScroll: true });
    } else if (id === "publicacion") {
      scrollToSection("#sidebar-ig-datos");
    }
  };

  // Ola 21 — aplicar un diseño prediseñado al slot seleccionado (o al primer slot vacío).
  // 2026-09-22 — la aplicación vive en applyPredesignedToSlot (helper compartido
  // con el drop del lienzo): misma vía para clic y drag & drop.
  const applyPredesigned = async (
    item: import("./studio-asset-picker-modal").PredesignedItem,
    targetSlot: number,
    forceTargetSlot = false,
    // 2026-10-26 — reemplazo del PAR completo (modal de reemplazo en modo par):
    // la cara B del diseño también reemplaza la B ocupada (elección explícita).
    replacePair = false,
  ) => {
    setApplyingPredesignedId(item.id);
    try {
      const res = await applyPredesignedToSlot({
        store,
        item,
        targetSlot,
        facesPerUnit,
        forceTargetSlot,
        replacePair,
      });
      if (!res.ok) {
        // Fix STG 2026-10-06 — "no-free-slot" no es un error: todos los
        // lienzos ya tienen diseño y nunca se pisa contenido para abrir sitio.
        // 2026-10-19 — este toast queda como FALLBACK (carrera: el estado pudo
        // cambiar entre abrir el modal de reemplazo y aplicar); el camino
        // normal sin slot libre abre StudioReplaceSlotModal.
        toast.error(
          res.reason === "no-free-slot"
            ? texts.plantillas.toastSinLienzoLibre
            : res.message || texts.plantillas.toastError,
        );
        return;
      }
      // 2026-10-26 — el reemplazo por par anuncia lo que pasó de verdad:
      // las 2 caras del separador N cambiaron (nunca A nueva + B vieja).
      if (replacePair) {
        toast.success(
          fillStudioText(texts.plantillas.toastReemplazoPar, {
            n: Math.floor(targetSlot / 2) + 1,
          }),
        );
      } else {
        toast.success(fillStudioText(texts.plantillas.toastPredisenado, { nombre: item.name }));
      }
      // Paquete A — la cara B no se descarta en silencio: si su slot estaba
      // ocupado se avisa (no se pisa el contenido del usuario). En modo par la
      // B ocupada se reemplaza a propósito (bReplaced), así que no aplica.
      if (res.bBlocked) toast.warning(texts.plantillas.toastCaraBOcupada);
      // Tarea "pregunta siempre" (owner 2026-10-19) — assignAssetToSlot
      // AUTO-SELECCIONA el slot recién asignado (feedback visual en el lienzo);
      // si esa selección sobrevive, el siguiente CLIC en un prediseñado la
      // tomaría como destino y sobrescribiría sin preguntar. Se limpia acá:
      // la selección vuelve a null y cada clic vuelve a preguntar destino.
      // (El auto-select global de store.ts NO se toca: otros flujos —fotos,
      // drag & drop— dependen de él.)
      selectSlot(null);
    } catch (err) {
      toast.error(texts.plantillas.toastError);
      void err;
    } finally {
      setApplyingPredesignedId(null);
    }
  };

  // 2026-10-19 — opciones del modal de reemplazo: lienzos OCUPADOS candidatos,
  // filtrados por la cara elegida (flujo cara → reemplazo) o, para diseños con
  // imageUrlB (2 caras), UNIDADES completas (anclas de cara A): elegir un
  // separador reemplaza sus 2 caras (2026-10-26 — antes solo se cambiaba la
  // cara A y el par quedaba mezclado A nueva + B vieja).
  const buildReplaceOptions = (
    item: import("./studio-asset-picker-modal").PredesignedItem,
    face: "A" | "B" | null,
  ): ReplaceSlotOption[] => {
    const slots = store.getState().canvasData?.slots ?? [];
    // Modo PAR: prediseñado de 2 caras en producto de 2 caras, sin cara
    // pre-fijada (vino directo del clic, no del modal de cara).
    if (face === null && facesPerUnit === 2 && item.imageUrlB) {
      return slots
        .filter((s) => s.slotIndex % 2 === 0 && !!s.assetUrl)
        .map((s) => {
          const unitNumber = Math.floor(s.slotIndex / 2) + 1;
          return {
            slotIndex: s.slotIndex,
            label: fillStudioText(texts.plantillas.reemplazoParNombre, { n: unitNumber }),
            faceLabel: texts.plantillas.badgeDosCaras,
            thumbUrl: s.assetUrl,
            ariaLabel: fillStudioText(texts.plantillas.reemplazoParAria, { n: unitNumber }),
          };
        });
    }
    const parity = face !== null ? (face === "A" ? 0 : 1) : null;
    return slots
      .filter((s) => !!s.assetUrl)
      .filter((s) => parity === null || s.slotIndex % 2 === parity)
      .map((s) => ({
        slotIndex: s.slotIndex,
        label: fillStudioText(texts.plantillas.reemplazoLienzoNombre, { n: s.slotIndex + 1 }),
        faceLabel:
          facesPerUnit === 2
            ? s.slotIndex % 2 === 0
              ? texts.lienzo.unitCaraA
              : texts.lienzo.unitCaraB
            : null,
        thumbUrl: s.assetUrl,
      }));
  };

  const openReplaceModal = (
    item: import("./studio-asset-picker-modal").PredesignedItem,
    face: "A" | "B" | null,
  ) => {
    // Defensa: si no hay NADA ocupado que reemplazar (carrera rara), conserva
    // el aviso anterior en vez de abrir una lista vacía.
    if (buildReplaceOptions(item, face).length === 0) {
      toast.error(texts.plantillas.toastSinLienzoLibre);
      return;
    }
    setReplaceChoice({ item, face });
  };

  const handleApplyPredesigned = async (
    item: import("./studio-asset-picker-modal").PredesignedItem,
  ) => {
    // 2026-10-22 — SIN guard de designId: el draft es LAZY y se crea en el
    // momento dentro de applyPredesignedToSlot (store.ensureDesignId). Antes
    // este guard mataba el primer clic en silencio hasta que una foto subida
    // marcaba el canvas dirty y el auto-save creaba el draft.
    if (applyingPredesignedId) return;
    // Regla de caras (2026-10-12) + "pregunta SIEMPRE" (owner 2026-10-19): el
    // clic en la grilla de prediseñados NUNCA toma el selectedSlotIndex como
    // destino — assignAssetToSlot auto-selecciona el slot recién asignado, así
    // que tras la primera aplicación los clics siguientes sobrescribían el
    // mismo lienzo sin preguntar. Ahora el clic siempre arranca el flujo de
    // destino: cara (si es ambigua) → primer lienzo libre → o reemplazo.
    // Sin pregunta de cara: prediseños con imageUrlB (llenan ambas caras) y
    // productos de 1 cara. El destino EXPLÍCITO sigue existiendo vía tap en la
    // grilla del lienzo y drag & drop (esos flujos no pasan por acá).
    if (facesPerUnit === 2 && !item.imageUrlB) {
      setFaceChoiceItem(item);
      return;
    }
    const slots = store.getState().canvasData?.slots ?? [];
    // Diseño de 2 caras: el ancla debe ser una cara A libre (resolveFaceAAnchor
    // re-ancla igual, pero el primer par libre es el destino natural).
    const anchorParity = facesPerUnit === 2 && item.imageUrlB ? 0 : null;
    const targetSlot =
      slots.find((s) => !s.assetUrl && (anchorParity === null || s.slotIndex % 2 === 0))
        ?.slotIndex ?? null;
    if (targetSlot === null) {
      // Sin lienzo libre: en vez del toast de error, el cliente elige cuál
      // lienzo ocupado reemplazar (StudioReplaceSlotModal).
      openReplaceModal(item, null);
      return;
    }
    await applyPredesigned(item, targetSlot);
  };

  // Regla de caras (2026-10-12) — respuesta del modal "¿En qué cara…?": el
  // diseño va al primer slot LIBRE de la cara elegida (firstFreeSlotOfFace).
  // 2026-10-19 — si la cara elegida NO tiene slot libre ya no hay toast: se
  // abre el modal de reemplazo filtrado a los lienzos ocupados DE ESA cara
  // (nunca se pisa contenido en silencio; el reemplazo es decisión explícita).
  const handleFaceChoice = async (face: "A" | "B") => {
    const item = faceChoiceItem;
    setFaceChoiceItem(null);
    if (!item) return;
    const target = firstFreeSlotOfFace(store.getState().canvasData?.slots ?? [], face);
    if (target === null) {
      openReplaceModal(item, face);
      return;
    }
    // Cara B: destino EXACTO (diseño de 1 cara) — sin el re-anclaje a cara A.
    await applyPredesigned(item, target, face === "B");
  };

  // Reemplazo explícito (2026-10-19) — el cliente eligió el lienzo ocupado a
  // reemplazar: aplicación con destino EXACTO (forceTargetSlot) sobre ese slot.
  // 2026-10-26 — en modo par (prediseñado de 2 caras + todo lleno) la opción es
  // la UNIDAD completa: se reemplazan las 2 caras (replacePair).
  const handleReplacePick = async (slotIndex: number) => {
    const choice = replaceChoice;
    setReplaceChoice(null);
    if (!choice) return;
    const pairMode = choice.face === null && facesPerUnit === 2 && !!choice.item.imageUrlB;
    await applyPredesigned(choice.item, slotIndex, true, pairMode);
  };

  // Paquete A (2026-10-02) — llenado VARIADO: recorre el catálogo del tag sin
  // repetir diseño mientras haya variedad (bug: 20 slots con el mismo diseño).
  // Las caras B ocupadas se respetan y se avisan en una sola pasada.
  const [applyingVariety, setApplyingVariety] = useState(false);
  const handleFillWithVariety = async () => {
    // 2026-10-22 — sin guard de designId (draft LAZY): el primer uso crea el
    // borrador en el momento vía store.ensureDesignId (dentro del helper).
    if (applyingVariety || applyingPredesignedId) return;
    setApplyingVariety(true);
    try {
      const res = await applyPredesignedVarietyToEmptySlots({
        store,
        items: predesigned,
        facesPerUnit,
      });
      if (res.failed) toast.error(texts.plantillas.toastError);
      if (res.applied > 0) {
        toast.success(fillStudioText(texts.plantillas.toastPredisenadoVarios, { n: res.applied }));
      }
      if (res.bBlockedCount > 0) toast.warning(texts.plantillas.toastCaraBOcupada);
    } catch {
      toast.error(texts.plantillas.toastError);
    } finally {
      setApplyingVariety(false);
    }
  };

  // Fix STG (2026-10-05, "subir fotos es demorado") — pipeline UNIFICADO con el
  // picker modal (lib/upload-photo-pipeline): misma secuencia upscale →
  // compresión → upload por archivo, con hasta 3 archivos en vuelo (antes era
  // estrictamente secuencial). Los resultados se publican EN ORDEN de selección:
  // el orden de "Mis fotos" define la asignación de «Llenar slots», así que no
  // puede depender de cuál foto terminó primero.
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(files.length);
    setUploadError(null);
    try {
      await processPhotoFiles(Array.from(files), {
        productSizeCm,
        designId,
        rightsAccepted,
        upload: uploadDesignAssetAction,
        onReady: (outcome) => {
          setUploading((n) => Math.max(0, n - 1));
          if (!outcome.ok) {
            setUploadError(
              outcome.kind === "too-big"
                ? // Fail-closed (robustez 2026-10-13): el pipeline YA intentó reducirla
                  // (compresión progresiva con piso de 300 DPI); llegar acá significa que
                  // no cupo ni así, o que el navegador no puede leer el formato (HEIC
                  // grande en Chrome/Firefox). Mensaje honesto, no el 413 genérico.
                  `No pudimos subir "${outcome.fileName}": pesa demasiado y no pudimos reducirla en este dispositivo. Si es una foto HEIC de iPhone, conviértela a JPG (Ajustes → Cámara → Formatos → «Más compatible») o usa una foto más liviana.`
                : outcome.kind === "server"
                  ? (outcome.serverMessage ?? texts.fotos.errorCalidad)
                  : `No pudimos subir "${outcome.fileName}". Revisa tu conexión e inténtalo de nuevo.`,
            );
            return;
          }
          addAsset(outcome.asset);
          // C2 — la foto se re-muestreó en el navegador antes de subir: marcarla
          // para el badge "✨ Optimizada" del thumb (el servidor recibe la versión
          // ya ajustada y no puede saberlo).
          if (outcome.improved) {
            const { id } = outcome.asset;
            setImprovedAssetIds((prev) => new Set(prev).add(id));
          }
          // M.3.b.B.2 — Si la foto subió con calidad insuficiente, mostrar
          // banner naranja persistente con el mensaje (cliente decide si usarla).
          // C2 — si ya la mejoramos automáticamente y AÚN así quedó bajo el
          // mínimo para imprimir, el aviso lo explica (mensaje mejorado).
          if (outcome.improvedButLow) {
            setUploadError(
              fillStudioText(texts.fotos.avisoMejoraAuto, { size: productSizeCm ?? "" }),
            );
          } else if (
            outcome.asset.validationLevel === "warning-strong" ||
            outcome.asset.validationLevel === "error"
          ) {
            setUploadError(outcome.asset.validationMessage ?? texts.fotos.errorCalidad);
          }
        },
      });
    } finally {
      setUploading(0);
    }
  };

  const onDragStartAsset = (e: React.DragEvent<HTMLDivElement>, asset: StudioAsset) => {
    e.dataTransfer.setData("application/lucams-asset", JSON.stringify(asset));
    e.dataTransfer.effectAllowed = "copy";
  };

  const emptySlots = totalSlots - filledSlots;
  // Ola 2 (2026-10-26) — densidad compacta (sheet móvil): grillas de 4 columnas
  // y paddings/gaps menores; desktop conserva los valores de siempre.
  const compact = density === "compact";
  // Botón mágico: con 1+ fotos alcanza para mostrarlo — autoFillSlots llena los slots
  // vacíos que pueda priorizando las fotos NUNCA usadas (en este diseño ni en otras
  // líneas del carrito del mismo producto), luego las de otras líneas del carrito y
  // al final las ya usadas acá (menos usadas primero; dentro de cada grupo manda el
  // orden de «Mis fotos»). La regla Ola 21 (exigir fotos para TODOS los vacíos) se
  // retiró: en un calendario de 12 slots obligaba a subir las 12 fotos antes de
  // siquiera ver el botón.
  const canAutoFill = assets.length > 0 && emptySlots > 0;

  return (
    <div ref={rootRef} className={`flex h-full flex-col ${compact ? "gap-4 p-4" : "gap-6 p-5"}`}>
      {/* Producto info */}
      <div>
        <p className="text-brand-purple-dark text-sm font-semibold">{productName}</p>
        <p className="text-brand-muted mt-0.5 text-xs">SKU {productSku}</p>
      </div>

      {/* 5.1 — checklist «Tu diseño»: pasos con estado + atajo a su sección. */}
      <StudioChecklist steps={checklistSteps} onSelect={handleChecklistSelect} />

      {/* Progress bar X/N — el feedback más importante del editor */}
      <ProgressBar filled={filledSlots} total={totalSlots} />

      {/* ──────── Plantillas ────────
          Ola 2 (2026-10-26, owner): la sección SUBE de orden (antes iba tras
          «Mis fotos») — elegir plantilla es el primer paso del checklist y
          «Ver diseño» se bloquea con guía mientras falte. Con >1 plantillas y
          sin elección lleva el chip «Pendiente»; tras un intento de finalizar
          (templateNudgeSignal) la sección se resalta ~1.8 s. */}
      <section
        aria-labelledby="sidebar-plantillas"
        className={[
          "border-brand-purple/10 rounded-xl border-t pt-5 transition-shadow duration-300",
          flashTemplates ? "ring-brand-turquoise ring-2 ring-offset-2 ring-offset-white" : "",
        ].join(" ")}
      >
        <div
          id="sidebar-plantillas"
          className="text-brand-purple-dark mb-3 flex items-center gap-2 text-sm font-semibold"
        >
          <Sparkles className="text-brand-purple h-4 w-4" />
          {texts.plantillas.titulo}
          <span className="text-brand-muted text-xs font-normal">({templates.length})</span>
          {templates.length > 1 && !selectedTemplateId && (
            <span className="bg-brand-yellow/40 text-brand-purple-dark rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
              {texts.checklist.pendiente}
            </span>
          )}
        </div>

        {templates.length === 0 ? (
          <p className="text-brand-muted text-xs italic">{texts.plantillas.vacio}</p>
        ) : (
          <div
            role="radiogroup"
            aria-label={texts.plantillas.elegirAria}
            className="grid grid-cols-2 gap-2"
          >
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                isSelected={tpl.id === selectedTemplateId}
                productSizeCm={productSizeCm}
                productShape={productShape}
                onClick={() => {
                  if (tpl.id === selectedTemplateId) return; // no-op si ya está
                  applyTemplate(tpl);
                  // A2.7 — Toast premium feedback
                  toast.success(
                    fillStudioText(texts.plantillas.toastAplicada, { nombre: tpl.name }),
                    {
                      duration: 2200,
                      icon: "✨",
                    },
                  );
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ──────── Mis fotos ──────── */}
      <section aria-labelledby="sidebar-mis-fotos">
        <div
          id="sidebar-mis-fotos"
          className="text-brand-purple-dark mb-3 flex items-center justify-between gap-2 text-sm font-semibold"
        >
          <span className="flex items-center gap-2">
            <ImageIcon className="text-brand-purple h-4 w-4" />
            {texts.fotos.titulo}
            {assets.length > 0 && (
              <span className="text-brand-muted text-[10px] font-medium tabular-nums">
                ({assets.length})
              </span>
            )}
          </span>
          {/* P0.2 — Toggle "Solo no usadas" (Mixbook Hide Used) — solo visible si hay fotos */}
          {assets.length > 1 && (
            <Hint
              content={hideUsed ? texts.fotos.toggleTitleTodas : texts.fotos.toggleTitleOcultar}
            >
              <button
                type="button"
                onClick={() => setHideUsed((v) => !v)}
                aria-pressed={hideUsed}
                className={[
                  "text-[10px] font-bold tracking-wide uppercase transition-colors",
                  hideUsed
                    ? "text-brand-turquoise"
                    : "text-brand-muted hover:text-brand-purple-dark/70",
                ].join(" ")}
              >
                {hideUsed ? texts.fotos.toggleOcultar : texts.fotos.toggleTodas}
              </button>
            </Hint>
          )}
        </div>

        <label className="text-brand-purple-dark/80 mb-2 flex items-start gap-2 text-xs leading-snug">
          <input
            type="checkbox"
            checked={rightsAccepted}
            onChange={(e) => setRightsAccepted(e.target.checked)}
            className="accent-brand-purple mt-0.5 h-4 w-4 flex-shrink-0"
          />
          <span>
            <ConsentText template={texts.fotos.consentimiento} />
          </span>
        </label>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading > 0 || !rightsAccepted}
          aria-label={texts.fotos.subirAria}
          className={`border-brand-purple/30 bg-brand-purple/5 text-brand-purple hover:bg-brand-purple/10 focus:ring-brand-purple flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:opacity-60 ${compact ? "py-3" : "py-4"}`}
        >
          {uploading > 0 ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {fillStudioText(texts.fotos.subiendo, { n: uploading })}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {texts.fotos.subirCta}
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={STUDIO_ACCEPTED_IMAGE_TYPES}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {/* Ola 4 (Lucy 2026-07-23) — formatos y resolución recomendada, visibles junto
            al punto de subida (texto centralizado en lib/upload-guidance.ts). */}
        <p className="text-brand-muted mt-2 text-[11px] leading-snug">
          {uploadGuidanceText(productSizeCm, {
            formats: texts.fotos.formatos,
            withPx: texts.fotos.guiaPx,
            generic: texts.fotos.guiaGenerica,
          })}
        </p>

        {uploadError && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            ⚠️ {uploadError}
          </p>
        )}

        {/* Auto-fill button — superhero del editor */}
        {canAutoFill && (
          <motion.button
            type="button"
            onClick={autoFillSlots}
            aria-label={fillStudioText(texts.fotos.autofillAria, {
              n: Math.min(emptySlots, assets.length),
            })}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-brand-turquoise/15 text-brand-purple-dark hover:bg-brand-turquoise/25 focus:ring-brand-turquoise mt-3 flex w-full items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none"
          >
            <Wand2 className="text-brand-purple h-4 w-4" />
            {texts.fotos.autofillCta}
          </motion.button>
        )}

        {/* Lista de assets con drag handle + checkmark "usada" + filtro Hide Used */}
        {assets.length > 0 && (
          <div
            role="list"
            aria-label={texts.fotos.listaAria}
            className={`grid ${compact ? "mt-2 grid-cols-4 gap-1.5" : "mt-3 grid-cols-3 gap-2"}`}
          >
            <AnimatePresence>
              {assets.map((asset, idx) => (
                <AssetThumb
                  key={asset.id}
                  store={store}
                  asset={asset}
                  idx={idx}
                  hideUsed={hideUsed}
                  autoImproved={improvedAssetIds.has(asset.id)}
                  onDragStart={(e) => onDragStartAsset(e, asset)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {assets.length === 0 && uploading === 0 && (
          <p className="text-brand-muted mt-3 text-xs italic">{texts.fotos.tipVacio}</p>
        )}

        {/* M.3.b.UX.6 — Microcopy cuando todos los slots están llenos pero
            hay fotos sin asignar: explicar que se pueden cambiar arrastrando. */}
        {assets.length > 0 && emptySlots === 0 && totalSlots > 0 && (
          <p className="text-brand-muted bg-brand-turquoise/10 mt-3 rounded-md px-2.5 py-2 text-xs">
            {texts.fotos.todoLleno}
          </p>
        )}
      </section>

      {/* ──────── Tu mensaje (Ola 3c — Polaroid Clásica: campo directo en la sidebar;
          tocar el texto del canvas sigue abriendo el editor completo como atajo) ──────── */}
      {allowText && <StudioMessageField store={store} />}

      {/* ──────── Diseños prediseñados (galería admin) ──────── */}
      {predesigned.length > 0 && (
        <section
          aria-labelledby="sidebar-predisenados"
          className="border-brand-purple/10 border-t pt-5"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div
              id="sidebar-predisenados"
              className="text-brand-purple-dark flex items-center gap-2 text-sm font-semibold"
            >
              <Sparkles className="text-brand-purple h-4 w-4" />
              {texts.plantillas.predisenadosTitulo}
              <span className="text-brand-muted text-xs font-normal">({predesigned.length})</span>
            </div>
            {/* Fase 2 · 2.5 — colapsable: cerrada por defecto cuando hay muchos
                (> PREDESIGNED_COLLAPSE_THRESHOLD), para que «Mis fotos» no quede
                sepultada. El contador del header sigue visible estando cerrada. */}
            <button
              type="button"
              onClick={() => setPredesignedOpen((v) => !v)}
              aria-expanded={predesignedOpen}
              aria-controls="sidebar-predisenados-panel"
              aria-label={texts.fotos.predisenadosToggleAria}
              // Fase 2 UX (2026-10-13) — presencia de marca: el toggle discreto
              // (texto muted) pasaba desapercibido y la sección quedaba sin uso.
              className="bg-brand-purple hover:bg-brand-purple-dark focus:ring-brand-purple rounded-md p-2 text-white shadow-sm transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${predesignedOpen ? "" : "-rotate-90"}`}
                aria-hidden
              />
            </button>
          </div>
          {predesignedOpen && (
            <div id="sidebar-predisenados-panel">
              <p className="text-brand-muted mb-2 text-[11px]">
                {texts.plantillas.predisenadosHint}
              </p>
              {/* Paquete A — llenado VARIADO de los slots vacíos (round-robin del
              catálogo: nunca N slots con el mismo diseño habiendo variedad). */}
              {emptySlots > 0 && (
                <button
                  type="button"
                  onClick={handleFillWithVariety}
                  disabled={applyingVariety || applyingPredesignedId !== null}
                  aria-label={texts.plantillas.predisenadosLlenarAria}
                  className="bg-brand-turquoise/15 text-brand-purple-dark hover:bg-brand-turquoise/25 focus:ring-brand-turquoise mb-2 flex w-full items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none disabled:opacity-60"
                >
                  {applyingVariety ? (
                    <Loader2 className="text-brand-purple h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="text-brand-purple h-4 w-4" />
                  )}
                  {texts.plantillas.predisenadosLlenarCta}
                </button>
              )}
              <div className={`grid ${compact ? "grid-cols-4 gap-1.5" : "grid-cols-3 gap-2"}`}>
                {predesigned.map((item) => {
                  const faceBadge = predesignedFaceBadge(facesPerUnit, item.imageUrlB);
                  return (
                    // Preview emergente (owner 2026-10-19): sostener el mouse
                    // ~400 ms sobre la tarjeta abre el diseño en grande (imageUrl,
                    // no el thumb) con su nombre — reemplaza al tooltip de solo
                    // texto. En táctil el HoverCard NO se monta (2026-10-26: el
                    // tap enfoca el trigger y radix abriría la tarjeta SOBRE el
                    // modal que el tap abre); ahí el preview lo da el botón «Ver».
                    <div key={item.id} className="relative">
                      <PredesignedHoverPreview name={item.name} imageUrl={item.imageUrl}>
                        <button
                          type="button"
                          onClick={() => handleApplyPredesigned(item)}
                          disabled={applyingPredesignedId !== null || applyingVariety}
                          aria-label={fillStudioText(texts.plantillas.aplicarDisenoAria, {
                            nombre: item.name,
                          })}
                          // 2026-09-22 — drag & drop al lienzo (desktop): la tarjeta se
                          // arrastra hasta un slot (highlight de drop target ya existe en
                          // el slot). El clic sigue aplicando al slot seleccionado/vacío.
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              PREDESIGNED_DRAG_MIME,
                              JSON.stringify({ id: item.id, name: item.name }),
                            );
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          className="border-brand-purple/20 hover:border-brand-purple focus:border-brand-turquoise focus:ring-brand-turquoise relative aspect-square w-full cursor-grab overflow-hidden rounded-md border-2 transition-all hover:scale-105 focus:ring-2 focus:outline-none active:cursor-grabbing disabled:opacity-50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.thumbUrl ?? item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            // La imagen interna no debe secuestrar el drag del botón.
                            // 3.10 — disuasión anti-copia: sin menú contextual
                            // ("Guardar imagen como…") sobre la miniatura.
                            draggable={false}
                            onContextMenu={(e) => e.preventDefault()}
                          />
                          {/* Paquete A — badge 1/2 caras (solo productos de 2 caras):
                      "1 cara" = el respaldo se imprime EN BLANCO (regla única de
                      cara B vacía, owner 2026-10-07 — ver predesigned-variety.ts). */}
                          {faceBadge && (
                            <Hint
                              content={
                                faceBadge === "two"
                                  ? texts.plantillas.badgeDosCarasTitle
                                  : texts.plantillas.badgeUnaCaraTitle
                              }
                            >
                              {/* stopPropagation: el badge vive DENTRO del botón con su
                            propio Hint — sin esto el hover abriría ambos tooltips. */}
                              <span
                                onPointerMove={(e) => e.stopPropagation()}
                                className="text-brand-purple-dark absolute top-1 left-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold shadow"
                              >
                                {faceBadge === "two"
                                  ? texts.plantillas.badgeDosCaras
                                  : texts.plantillas.badgeUnaCara}
                              </span>
                            </Hint>
                          )}
                          {applyingPredesignedId === item.id && (
                            <div className="bg-brand-purple-dark/40 absolute inset-0 flex items-center justify-center">
                              <Loader2 className="h-5 w-5 animate-spin text-white" />
                            </div>
                          )}
                        </button>
                      </PredesignedHoverPreview>
                      {/* 2026-10-26 — «Ver» (ojo): abre el preview en Dialog
                        (PredesignedViewDialog). Única vía en táctil (sin hover);
                        en desktop coexiste con el HoverCard. Vive FUERA del
                        botón de aplicar (HTML válido) y con stopPropagation +
                        área 44×44 para no disparar la aplicación al tocarlo. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingItem(item);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label={fillStudioText(texts.plantillas.verDisenoAria, {
                          nombre: item.name,
                        })}
                        className="focus:ring-brand-turquoise absolute right-0 bottom-0 z-10 flex h-11 w-11 items-center justify-center rounded-full focus:ring-2 focus:outline-none"
                      >
                        <span className="text-brand-purple-dark flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow">
                          <Eye className="h-4 w-4" aria-hidden />
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Regla de caras (2026-10-12) — pregunta la cara destino al aplicar
          GLOBALMENTE un diseño de 1 cara en un producto de 2 caras. */}
      <StudioFaceChoiceModal
        open={faceChoiceItem !== null}
        designName={faceChoiceItem?.name ?? ""}
        onPick={(face) => void handleFaceChoice(face)}
        onClose={() => setFaceChoiceItem(null)}
      />
      {/* Reemplazo explícito (2026-10-19) — sin lienzo libre, el cliente elige
          cuál lienzo ocupado reemplazar (se compone con el modal de cara:
          primero cara, luego reemplazo si la cara elegida está llena). */}
      <StudioReplaceSlotModal
        open={replaceChoice !== null}
        designName={replaceChoice?.item.name ?? ""}
        options={replaceChoice ? buildReplaceOptions(replaceChoice.item, replaceChoice.face) : []}
        pairMode={
          replaceChoice !== null &&
          replaceChoice.face === null &&
          facesPerUnit === 2 &&
          !!replaceChoice.item.imageUrlB
        }
        onPick={(slotIndex) => void handleReplacePick(slotIndex)}
        onClose={() => setReplaceChoice(null)}
      />
      {/* 2026-10-26 — preview «Ver» del prediseñado (única vía en táctil).
          «Usar este diseño» = la MISMA acción del click de la tarjeta. */}
      <PredesignedViewDialog
        item={viewingItem}
        onUse={(item) => {
          setViewingItem(null);
          void handleApplyPredesigned(item);
        }}
        onClose={() => setViewingItem(null)}
      />
    </div>
  );
}

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const texts = useStudioTexts();
  const pct = total > 0 ? (filled / total) * 100 : 0;
  const isComplete = filled === total && total > 0;
  const isEmpty = filled === 0;
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-brand-purple-dark text-xs font-semibold tracking-wider uppercase">
          {texts.fotos.progresoTitulo}
        </span>
        <span
          className={[
            "text-sm font-bold tabular-nums",
            // red-600 (#dc2626 ≈ 4.8:1 sobre crema) en vez de red-500 (#ef4444 ≈ 3.9:1):
            // el contador de progreso vacío no cumplía AA de contraste (auditoría experto 2026-07-26).
            isComplete ? "text-emerald-600" : isEmpty ? "text-red-600" : "text-brand-purple-dark",
          ].join(" ")}
        >
          {filled}/{total} {isComplete && <Check className="ml-0.5 inline h-4 w-4" aria-hidden />}
        </span>
      </div>
      <div className="bg-brand-purple/10 relative h-2 overflow-hidden rounded-full">
        <motion.div
          className={[
            "absolute inset-y-0 left-0 rounded-full",
            isComplete ? "bg-emerald-500" : "bg-brand-purple",
          ].join(" ")}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <p className="text-brand-muted mt-1.5 text-xs">
        {isComplete
          ? texts.fotos.progresoCompleto
          : isEmpty
            ? texts.fotos.progresoVacio
            : fillStudioText(texts.fotos.progresoFaltan, {
                n: total - filled,
                fotos: total - filled === 1 ? "foto" : "fotos",
              })}
      </p>
    </div>
  );
}

function TemplateCard({
  template,
  isSelected,
  productSizeCm,
  productShape,
  onClick,
}: {
  template: StudioTemplate;
  isSelected: boolean;
  productSizeCm?: string;
  productShape?: "rectangle" | "circle" | "heart" | "custom";
  onClick: () => void;
}) {
  const texts = useStudioTexts();
  // P0.7 — Card que renderea el imán físico real con la plantilla aplicada,
  // no un SVG plano flotando. Patrón Casetify: el cliente ve EXACTAMENTE cómo
  // se verá el producto físico (proporción real + sombra de grosor + forma).
  //
  // Mejoras vs A1.3:
  // - cornerRadius según productShape (rectangle = 8%, circle = full)
  // - Sombra exterior realista (multi-layer) simulando grosor 3mm
  // - Medida física visible bajo el nombre
  // - Aspect ratio del thumb deriva del aspect ratio del template (no siempre cuadrado)

  // Derivar aspect del template canvasData
  const templateAspect =
    template.canvasData?.stage?.width && template.canvasData.stage.height
      ? template.canvasData.stage.width / template.canvasData.stage.height
      : 1;
  const aspectClass =
    templateAspect > 1.1 ? "aspect-[4/3]" : templateAspect < 0.9 ? "aspect-[3/4]" : "aspect-square";

  // cornerRadius según shape físico
  const shapeRadiusClass =
    productShape === "circle"
      ? "rounded-full"
      : productShape === "rectangle"
        ? "rounded-md"
        : "rounded-md";

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={`${fillStudioText(texts.plantillas.itemAria, { nombre: template.name })}${isSelected ? ` ${texts.plantillas.itemSeleccionada}` : ""}${productSizeCm ? ` ${fillStudioText(texts.plantillas.itemTamano, { size: productSizeCm })}` : ""}`}
      onClick={onClick}
      whileHover={{ scale: isSelected ? 1 : 1.03, y: isSelected ? 0 : -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className={[
        "group relative flex flex-col gap-1.5 overflow-hidden rounded-lg p-2 text-left transition-shadow focus:outline-none",
        isSelected
          ? "from-brand-turquoise/10 to-brand-purple/10 ring-brand-turquoise bg-gradient-to-br shadow-md ring-2"
          : "ring-brand-purple/15 hover:ring-brand-purple/40 focus-visible:ring-brand-turquoise ring-1 hover:shadow-md focus-visible:ring-2",
      ].join(" ")}
    >
      {/* Stage cream que simula la superficie sobre la que reposa el imán */}
      <div className="from-brand-cream/40 to-brand-cream/80 relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-gradient-to-br p-2">
        {/* "Imán físico" — thumb del SVG con sombra realista + cornerRadius físico */}
        <div
          className={[
            "relative overflow-hidden bg-white transition-transform duration-300 group-hover:scale-105",
            aspectClass,
            shapeRadiusClass,
          ].join(" ")}
          style={{
            maxWidth: "92%",
            maxHeight: "92%",
            // Sombra multi-capa simulando grosor 3mm del imán físico
            boxShadow:
              "0 1px 2px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.10), 0 8px 16px rgba(124,106,173,0.12)",
          }}
        >
          {/* FIX-4 — Dummy photo placeholder DEBAJO del SVG asset.
              Sin esto, plantillas tipo "Polaroid Romántica" (marco blanco
              sobre fondo blanco) eran invisibles en la card. El gradient
              pastel simula que hay una foto ahí. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, #F4ECFF 0%, #FFE5EC 35%, #FFF2D9 70%, #DDF5F3 100%)",
            }}
            aria-hidden
          />
          {/* Silueta pequeña tipo mascote en el centro del placeholder */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30">
            <span className="text-3xl" aria-hidden>
              💜
            </span>
          </div>
          {/* SVG marco — va ENCIMA del placeholder */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={template.previewUrl}
            alt=""
            aria-hidden
            className="relative h-full w-full object-contain"
            loading="lazy"
          />
          {/* Glossy overlay sutil simulando laminado del imán */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%)",
            }}
            aria-hidden
          />
        </div>

        {/* Check ✓ overlay al seleccionar */}
        {isSelected && (
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
            className="bg-brand-turquoise absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full shadow-md ring-2 ring-white"
            aria-hidden
          >
            {/* A11Y — el ✓ es el único indicador de "elegida": blanco sobre turquesa daba 1.71:1
              y WCAG 1.4.11 (no-text contrast) pide 3:1. En brand-purple-dark queda 7.06:1. */}
            <Check className="text-brand-purple-dark h-3.5 w-3.5" strokeWidth={3} />
          </motion.div>
        )}
      </div>

      {/* Nombre + medida física */}
      <div className="flex flex-col gap-0.5 px-0.5">
        <p
          className={[
            "line-clamp-2 text-xs leading-tight font-semibold transition-colors",
            isSelected ? "text-brand-purple-dark" : "text-brand-purple-dark/80",
          ].join(" ")}
        >
          {template.name}
        </p>
        {productSizeCm && (
          <p className="text-brand-muted text-[10px] font-medium tabular-nums">
            📐 {productSizeCm} cm
          </p>
        )}
      </div>
    </motion.button>
  );
}

// ──────────────────────────────────────────────────────────────────
//  P0.2 — AssetThumb: thumb + green checkmark "usada" + hide filter
// ──────────────────────────────────────────────────────────────────
//
// Patrón Mixbook: cada foto del tray muestra un check verde si ya está pegada
// en algún slot. Filtro "Solo no usadas" oculta las usadas para que el cliente
// se enfoque solo en las pendientes. Reduce fricción y confusión.
//
// Implementación con selector ATÓMICO `selectAssetIsUsed(id)` (memoria
// feedback_react_atomic_selectors_no_arrays): cada thumb se suscribe solo a
// su propio bit boolean → no re-render cuando otro slot cambia.

function AssetThumb({
  store,
  asset,
  idx,
  hideUsed,
  autoImproved = false,
  onDragStart,
}: {
  store: StoreApi<StudioStoreState>;
  asset: StudioAsset;
  idx: number;
  hideUsed: boolean;
  /** C2 — la foto se mejoró automáticamente al subir (upscale local): badge "✨ Mejorada". */
  autoImproved?: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const isUsed = useStore(store, selectAssetIsUsed(asset.id));
  // P0.3 — Estado del modal de warning calidad (al click sobre thumb problemático)
  const [showQualityModal, setShowQualityModal] = useState(false);
  const texts = useStudioTexts();
  const hasWarning =
    asset.validationLevel === "warning-strong" || asset.validationLevel === "warning-soft";

  // Hide Used filter
  if (hideUsed && isUsed) return null;

  return (
    <>
      <Hint
        content={
          isUsed
            ? texts.fotos.thumbUsada
            : hasWarning
              ? texts.fotos.thumbAviso
              : texts.fotos.thumbArrastrar
        }
      >
        {/* 2026-10-02 — los badges de texto ("⚠️ Revisar" / "✨ Optimizada" /
          "✓ Agregada") ya NO flotan absolute sobre la imagen: el thumb es ~77px
          y los cubrían. El elemento animado del grid es ahora un wrapper
          vertical (conserva role="listitem", drag y las animaciones de
          AnimatePresence); la imagen queda limpia (solo el drag-handle
          hover-only dentro) y los chips viven en una fila-caption debajo.
          El click-to-quality-modal sigue en el wrapper: cubre el thumb Y los
          chips (click en "Revisar" también abre el modal por burbuja). */}
        <motion.div
          role="listitem"
          draggable
          onDragStart={(e) => onDragStart(e as unknown as React.DragEvent<HTMLDivElement>)}
          onClick={hasWarning ? () => setShowQualityModal(true) : undefined}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.2, delay: idx * 0.04 }}
          className="group/thumb flex cursor-grab flex-col gap-1 active:cursor-grabbing"
        >
          <div
            className={[
              "relative aspect-square overflow-hidden rounded-md border-2 transition-all focus-within:ring-2 hover:shadow-md",
              asset.validationLevel === "warning-strong"
                ? "border-red-300/70 focus-within:ring-red-400 hover:border-red-500"
                : asset.validationLevel === "warning-soft"
                  ? "border-amber-300/70 focus-within:ring-amber-400 hover:border-amber-500"
                  : isUsed
                    ? "border-emerald-400/70 focus-within:ring-emerald-400 hover:border-emerald-500"
                    : "border-brand-purple/20 hover:border-brand-purple focus-within:ring-brand-turquoise",
            ].join(" ")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.canvasUrl ?? asset.signedUrl}
              alt={`Foto subida ${idx + 1}`}
              className={[
                "h-full w-full object-cover transition-opacity",
                isUsed ? "opacity-75" : "",
              ].join(" ")}
              draggable={false}
            />

            {/* M.3.b.UX.6 — Drag handle visual top-left, sutil, visible solo en hover.
              Indica al cliente "esta foto se puede arrastrar al imán". */}
            <div
              className="bg-brand-purple/85 pointer-events-none absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-md text-white opacity-0 shadow-sm transition-opacity group-hover/thumb:opacity-100"
              aria-hidden
            >
              <GripVertical className="h-3 w-3" />
            </div>
          </div>

          {/* Fila-caption de chips (text-[9px], fondos suaves con texto oscuro —
            A11Y: contraste sobre fondo claro, decisión Paquete C de badges
            legibles se mantiene; solo cambian de lugar). */}
          {(hasWarning || autoImproved || isUsed) && (
            <div className="flex flex-wrap items-center gap-1">
              {asset.validationLevel === "warning-strong" && (
                <span
                  className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-800"
                  aria-label={texts.fotos.resolucionBajaAria}
                >
                  ⚠️ {texts.fotos.badgeRevisar}
                </span>
              )}
              {asset.validationLevel === "warning-soft" && (
                <span
                  className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900"
                  aria-label={texts.fotos.avisoCalidadAria}
                >
                  ⚠️ {texts.fotos.badgeRevisar}
                </span>
              )}

              {/* C2 (owner 2026-09-15) — "✨ Optimizada": la foto se re-muestreó
                en el navegador al subir (NO crea detalle — el título lo dice
                explícito, auditoría 2026-09-24). */}
              {autoImproved && (
                <Hint content={texts.fotos.badgeMejoradaTitle}>
                  {/* stopPropagation: el chip tiene su propio Hint — sin esto el
                      hover abriría ambos tooltips. */}
                  <span
                    onPointerMove={(e) => e.stopPropagation()}
                    className="bg-brand-turquoise/20 text-brand-purple-dark rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    aria-label={texts.fotos.badgeMejoradaTitle}
                  >
                    {texts.fotos.badgeMejorada}
                  </span>
                </Hint>
              )}

              {/* P0.2 — la foto ya está asignada a al menos 1 slot (antes un
                check ✓ flotante bottom-left sobre la imagen). */}
              {isUsed && (
                <span
                  className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800"
                  aria-label={texts.fotos.usadaAria}
                >
                  {texts.fotos.badgeAgregada}
                </span>
              )}
            </div>
          )}
        </motion.div>
      </Hint>

      {/* P0.3 — Modal de calidad: explica el problema + sugerencia accionable */}
      <PhotoQualityModal
        open={showQualityModal}
        onClose={() => setShowQualityModal(false)}
        asset={asset}
      />
    </>
  );
}
