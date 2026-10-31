"use client";

/*
 * StudioEditor — orquestador client del Estudio v2 (M.3.b Capa 2).
 *
 * Responsabilidades:
 *   1. Crear/recuperar Design + canvasData V2 al montar
 *   2. Inicializar el zustand store del editor
 *   3. Coordinar auto-save 2s debounce (effect observa store.isDirty)
 *   4. Manejar finalize: snapshots por slot via Konva stage.toDataURL +
 *      preview compositado via canvas API + llamada server action
 *   5. Conectar modal asset picker
 *   6. Add-to-cart redirect post-finalize
 *
 * Lo que NO hace este componente:
 *   - Render del canvas (delegado a StudioCanvasGrid)
 *   - Render de sidebar (delegado a StudioSidebar)
 *   - Render de toolbar (delegado a StudioToolbar)
 *   - State management (delegado al zustand store interno)
 *
 * Bloqueado-en-construcción: no renderea hasta tener canvasData válido del
 * server. Show loading skeleton.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Side-effect PRIMERO: cap de pixelRatio de los stages Konva (debe quedar
// fijado antes de montar cualquier <Stage> del editor).
import "./lib/konva-pixel-ratio";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDialogA11y } from "./use-dialog-a11y";
import { CLOSE_X_CLASS, CloseXButton } from "@/components/ui/close-x-button";
import { Hint } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import { useStore } from "zustand";
import type Konva from "konva";
import {
  createDraftDesignAction,
  finalizeDesignAction,
  reopenDesignForEditAction,
  saveCanvasAction,
} from "@/features/personalization/actions";
import { uploadPreviewPagesWithRetry } from "./preview-pages-upload";
import {
  parsePhotoProductConfig,
  readBorderWidthConfig,
  CALENDAR_FONT_OPTIONS,
} from "@/features/personalization/schemas";
import { addPersonalizedToCartAction } from "@/app/carrito/actions";
import { StudioCanvasGrid, StudioStageZoomControl } from "./studio-canvas-grid";
import { stepStageZoom } from "./studio-canvas-grid-size";
import { StudioSidebar } from "./studio-sidebar";
import { useStudioChecklist } from "./studio-checklist";
import { StudioToolbar, StudioFinalizeFab } from "./studio-toolbar";
import { StudioStyleToolbar } from "./studio-style-toolbar";
import { StudioOnboarding } from "./studio-onboarding";
import { StudioTextEditHint } from "./studio-text-edit-hint";
import { StudioGesturesHint, GESTURES_HINT_STORAGE_KEY } from "./studio-gestures-hint";
import { StudioAssetPickerModal } from "./studio-asset-picker-modal";
import { readClientCookiePreferences } from "@/lib/cookie-consent";
import { StudioPreviewModal } from "./studio-preview-modal";
import { studioPreviewVariantLabel } from "./lib/preview-variant-label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsTouch } from "./use-is-touch";
import { toast } from "sonner";
import { Sparkles, Box, X, CalendarDays, Loader2, Trash2 } from "lucide-react";
import nextDynamic from "next/dynamic";
import type { Magnet3D } from "./fridge-3d-view";
import { StudioAiPanel } from "./studio-ai-panel";
import { isCatalogMode } from "@/lib/store-mode";
import {
  composeCalendarPages,
  buildCalendarPageInputs,
  buildCalendarPreviewMontage,
} from "./lib/compose-calendar-page";
import {
  CALENDAR_PAGE,
  calendarLayoutFromUnitTemplate,
} from "@/features/personalization/calendar-layout";
import { SceneGallery, type SceneKind } from "./scene-gallery";
import {
  initialFrameColorFromSchema,
  isInstagramTemplate,
  resolveBorderWidthFactor,
} from "@/features/personalization/frame-palette";
import { igMissingRequiredTextLayerIds } from "@/features/personalization/instagram-template-spec";
import { resolveTourSurface } from "./lib/studio-tour";
import {
  gridSlotCountForLayout,
  maxUnitsForProduct,
  photosPerUnitForEditor,
  designUnitPriceMultiplier,
} from "@/features/personalization/design-units";
import { faceSlotLabels, deployedSizeCm } from "./lib/faces";
import { previewUnitRanges } from "./lib/preview-units";
import {
  readStudioDraftMarker,
  writeStudioDraftId,
  clearStudioDraftId,
  shouldOfferDraftResume,
  studioDraftHasRealProgress,
  readStudioCanvasSnapshot,
  writeStudioCanvasSnapshot,
  clearStudioCanvasSnapshot,
  shouldUseCanvasSnapshot,
} from "./lib/draft-marker";
import { isBookmarkGalleryTag, resolveGalleryTag } from "./lib/product-kind";
import { remapCanvasAssetUrls } from "./lib/remap-canvas-assets";
import { resolveBootTemplate } from "./lib/boot-template";
import {
  fitPreviewToBudget,
  fitDraftThumbnail,
  previewFileExtension,
  reencodePreviewDataUrl,
} from "./lib/preview-encode";
import {
  buildBookmarkStripPreview,
  buildCompositedPreview,
  buildMagnetTextures,
  clipProductionSnapshotToShape,
  combineStripTextures,
  rotateTextures90,
} from "./lib/production-preview-render";
import { dataUrlToBlob } from "./lib/image-utils";
import {
  isNetworkError,
  isServerActionCrash,
  uploadAllWithRetry,
  type StoragePutRequest,
} from "./lib/upload-with-retry";
import { PHOTO_PACK_UNITS_PER_PACK } from "@/features/products/variant-schemas";

// FOTO4 — la galería de escenas del fotoimán (nevera/mural/repisa/regalo). Las vistas 3D pesadas
// (three.js) van diferidas DENTRO de SceneGallery, así que este import estático no infla el bundle
// del editor con WebGL.
// CAL4 (rediseño 2026-07-22) — el calendario-de-pared quedó ARCHIVADO para este producto (Lucy):
// el set de 12 tarjetas 7.5×10 se muestra como imanes en la galería (kind="calendar"), no en la
// pared. CalendarView3D sigue vivo solo en /internal/3d-preview.
// SEP1 — preview inmersivo de separadores en un libro (los separadores no son imanes → su hogar es
// un libro, no la nevera). Client-only, diferido.
const BookView3D = nextDynamic(() => import("./book-view-3d"), {
  ssr: false,
  loading: () => <Book3DLoadingFallback />,
});
import { createStudioStore } from "./lib/store";
import { createSerialTaskQueue } from "./lib/serial-task-queue";
import { waitForSlotPhotosReady } from "./lib/slot-photo-readiness";
import { runWithPrintMasters } from "./lib/print-master-mode";
import { resolveSlotNoun, type SlotNoun, type StudioSlotProductKind } from "./lib/slot-noun";
import { collectQualityWarnings, qualityWarningsKey } from "./lib/quality-warnings";
import type { CanvasData, CanvasDataV2, StudioAsset, StudioProduct, StudioTemplate } from "./types";
import { ensureCanvasV2 } from "./lib/canvas-migrate";
import { magnetTextureWidth } from "./lib/texture-resolution";
import { useStudioTexts } from "./studio-texts-provider";
import { fillStudioText, type StudioTexts } from "./studio-texts";

const AUTO_SAVE_DELAY_MS = 2000;
// 2026-10-13 — miniatura del DRAFT para "Mis diseños": se compone y sube como
// MÁXIMO una por minuto dentro del auto-save (no en cada guardado de 2 s — el
// montaje cuesta CPU y el thumbnail cambia poco entre saves vecinos). El path
// server-side es fijo por diseño (upsert), así que no se acumulan archivos.
const DRAFT_THUMB_INTERVAL_MS = 60_000;

/**
 * Ola 26 (owner 2026-09-09) — mensaje del guard de finalización de la Polaroid
 * Instagram: nombra los campos de texto requeridos que faltan (etiquetas CMS
 * estudio.texto.campo-ig-*) con el patrón del tooltip de «Vista previa»
 * bloqueado. null = nada falta (guard en verde).
 */
function igBlockMessage(missingIds: string[], texts: StudioTexts): string | null {
  if (missingIds.length === 0) return null;
  const labels: Record<string, string> = {
    user_name: texts.texto.campoIgUsuario,
    location: texts.texto.campoIgUbicacion,
    likes_count: texts.texto.campoIgLikes,
    caption: texts.texto.campoIgTitulo,
    hashtags: texts.texto.campoIgHashtags,
  };
  const campos = missingIds.map((id) => labels[id] ?? id).join(", ");
  return fillStudioText(texts.lienzo.finalizeTooltipTextos, { campos });
}

// Roadmap B1 — el "Cargando tu libro 3D…" del dynamic import es texto CMS
// (estudio.lienzo.loading-libro); sin provider cae al default exacto pre-CMS.
function Book3DLoadingFallback() {
  const texts = useStudioTexts();
  return (
    <div className="text-brand-muted flex h-full items-center justify-center text-sm">
      {texts.lienzo.loadingLibro}
    </div>
  );
}

export type StudioEditorProps = {
  product: StudioProduct;
  templates: StudioTemplate[];
  /**
   * N-08 (2026-09-11) — plantilla pre-elegida por deep-link (`?template=<slug>`
   * desde el TemplatesStrip de la PDP), ya resuelta contra la lista visible del
   * producto en `page.tsx`. Solo aplica al boot de un draft NUEVO (el recover
   * flow ?designId= manda: su canvas guardado es la SoT). El servidor la
   * re-valida en createDraftDesign; null → SIN selección inicial (5.1,
   * 2026-10-22: el checklist pide elegir plantilla; la primera solo presta
   * geometría de render).
   */
  initialTemplateId?: string | null;
  /**
   * 2026-10-12 — recover (?designId=): plantilla PERSISTIDA del diseño
   * (Design.templateId — la copia cloneDesignForEdit y la refleja cada
   * auto-save). Manda sobre el match best-effort por dimensiones
   * (findTemplateIdForCanvas); solo se acepta si sigue en la lista visible.
   */
  initialDesignTemplateId?: string | null;
  initialDesignId: string | null;
  initialDesignCanvas: CanvasData | null;
  initialDesignAssets: StudioAsset[];
  /**
   * 2026-10-21 — «Continuar donde quedaste» SOLO para clientes autenticados
   * (decisión del owner; ver lib/draft-marker.ts): page.tsx lo activa cuando hay
   * Customer en sesión. Apagado, el editor no lee ni escribe el marcador local
   * del draft y nunca muestra el interstitial; el invitado queda protegido por
   * los auto-saves, el flush sendBeacon y el recover explícito por ?designId=.
   */
  draftResumeEnabled?: boolean;
  photoSlots: number;
  /**
   * Lucy 2026-09-05 — packs de fotoimanes: catálogo elegible {photoSlots, price}
   * YA FILTRADO al tamaño físico elegido (PDP o diseño recuperado). Solo se pasa
   * para PHOTO_PACK con variantes que declaran photoSlots. Alimenta el stepper
   * "¿Cuántas fotos lleva tu imán?" y el precio vivo de la modal de confirmación.
   * El cobro final lo resuelve el SERVIDOR desde el canvasData guardado — esto
   * es solo vista.
   */
  packVariants?: PhotoPackVariantOption[];
  /**
   * Variant ID elegido en PDP (`/estudio/[slug]?variant=X`). Se propaga
   * al cart al finalizar para que el CartItem use la variant correcta
   * (cantidad/tamaño/etc.) — antes de M.3.b.CAT había siempre 1 variant
   * "-DEFAULT" por producto, ahora hay N por size/qty.
   *
   * Lucy 2026-09-05 — packs: NO se propaga (el Estudio elige el N de fotos y
   * el servidor resuelve la variante desde el diseño). Queda para name/letterset
   * y deep-links legacy de otros productos.
   */
  variantId?: string;
  /** Precio (centavos COP) de la variante elegida — se muestra en la vista previa pre-carrito. */
  unitPriceCents: number;
  /**
   * Lucy 2026-09-08 — "¿Con imán?" en los packs de foto: la elección de la PDP
   * (dimensión `magnet` de la variante, o la guardada en el diseño recuperado).
   * El Estudio la PERSISTE en el canvasData (el carrito la usa para resolver la
   * variante server-side) y la MUESTRA read-only junto al stepper de fotos — no
   * se cambia acá: una sola fuente de verdad (la PDP). undefined = catálogo sin
   * la dimensión (seed de imán no corrido) → no se escribe ni se muestra.
   */
  initialMagnet?: boolean;
  /**
   * Modelo MULTI-UNIDAD (owner 2026-09-09 — regla general): unidades a DISEÑAR
   * elegidas en la PDP con el stepper "Unidades" (`?copies=N` — se conserva el
   * nombre del parámetro por compat de deep-links, pero su significado cambió:
   * ya no son "copias idénticas", son N unidades del producto, CADA UNA
   * diseñable por separado). El Estudio abre con N unidades (2 tiras = 2 ×
   * unitSlots; 2 calendarios = 2 × 12), la Vista previa las muestra TODAS y el
   * carrito recibe UNA línea con qty=1 (el diseño contiene las N unidades; el
   * precio = variante × N lo deriva el servidor — design-units.ts). undefined → 1.
   */
  initialUnits?: number;
  /** Edición desde el carrito: id del diseño original a reemplazar al finalizar (no duplicar). */
  replacesCartDesignId?: string | null;
  /** ADR-057 B2 — diseños prediseñados aplicables por slot (galería). */
  predesigned?: import("./studio-asset-picker-modal").PredesignedItem[];
  /** ADR-057 Fase D — etiquetas por slot (meses del calendario). */
  slotLabels?: string[];
  /** ADR-057 Fase D — año del calendario (para el badge del editor). */
  calendarYear?: number;
  /**
   * 2026-10-26 — assetIds usados en OTRAS líneas del carrito del mismo
   * producto (los resuelve page.tsx server-side): «Llenar slots con mis
   * fotos» los usa DESPUÉS de los nunca-usados (bug del segundo pack).
   */
  cartAssetIdsInUse?: string[];
};

/** Variante elegible de un pack: N de fotos por imán + precio (centavos, ya resuelto). */
export type PhotoPackVariantOption = {
  /** Id de la variante del catálogo (2026-10-12): se persiste en
   *  Design.metadata.variantId para que el recover reabra con ELLA. */
  id: string;
  photoSlots: number;
  /** "¿Con imán?" (2026-09-08): el par Con/Sin imán comparte photoSlots — el precio
   *  vivo se lee de la opción que coincide con el magnet del diseño. */
  magnet?: boolean;
  price: number;
};

/**
 * 2026-10-12 — variante EFECTIVA del pack para el N de fotos + magnet vigentes
 * (mismo criterio de match que el precio vivo: magnet exacto primero, fallback
 * al primero con ese N). Es la que se persiste en Design.metadata.variantId
 * para el recover — el COBRO sigue derivándose del canvasData en el servidor.
 */
function packVariantIdFor(
  packVariants: readonly PhotoPackVariantOption[],
  photoSlots: number | undefined,
  magnet: boolean | undefined,
): string | undefined {
  if (photoSlots == null) return undefined;
  return (
    packVariants.find((v) => v.photoSlots === photoSlots && v.magnet === magnet)?.id ??
    packVariants.find((v) => v.photoSlots === photoSlots)?.id
  );
}

function studioDraftScope(productSlug: string, variantId: string | undefined): string {
  return `${productSlug}:${variantId ?? "default"}`;
}

export function StudioEditor({
  product,
  templates,
  initialTemplateId,
  initialDesignTemplateId,
  initialDesignId,
  initialDesignCanvas,
  initialDesignAssets,
  draftResumeEnabled = false,
  photoSlots,
  packVariants = [],
  variantId,
  unitPriceCents,
  initialMagnet,
  initialUnits,
  replacesCartDesignId,
  predesigned = [],
  slotLabels,
  calendarYear,
  cartAssetIdsInUse,
}: StudioEditorProps) {
  const router = useRouter();
  const store = useMemo(() => createStudioStore(), []);
  // Roadmap B1 — textos CMS del Estudio (fallback exacto pre-CMS vía contexto).
  const texts = useStudioTexts();
  // DEBUG e2e: exponer el store en dev para que Playwright pueda inspeccionar/auto-fill sin depender de clicks frágiles.
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __studioStore?: typeof store }).__studioStore = store;
      return () => {
        delete (window as unknown as { __studioStore?: typeof store }).__studioStore;
      };
    }
  }, [store]);
  // Ola 17 — el picker ahora tiene PROPÓSITO: "photo" asigna la foto principal del
  // slot; "profile" asigna la foto de perfil del header del post (Polaroid Instagram).
  const [pickerRequest, setPickerRequest] = useState<{
    slotIndex: number;
    purpose: "photo" | "profile";
  } | null>(null);
  // Ola 8 — Modal unificado de edición por slot (tabs Foto/Texto). Se abre desde el
  // clic en un slot lleno o desde el botón lápiz de la action bar del slot.
  const [openEditSlot, setOpenEditSlot] = useState<{
    slotIndex: number;
    tab: "photo" | "text";
  } | null>(null);
  // M.3.b.UX.v12 (Lucy 2026-05-15) — Banner de gestos: open controlado +
  // flag persistent (no auto-dismiss cuando se abre manualmente con "?").
  const [gesturesHintOpen, setGesturesHintOpen] = useState(false);
  const [gesturesHintPersistent, setGesturesHintPersistent] = useState(false);
  // Fase 2 · item 2.8 (2026-10-07) — tour por producto: mientras el onboarding
  // está abierto se suprime el auto-trigger del banner de gestos (convivencia:
  // el tour es un overlay z-50; el banner aparecería debajo compitiendo).
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const initialDraftScope = studioDraftScope(product.slug, variantId);
  // Fase 2 · item 2.4 (2026-10-07) — "Continuar donde quedaste": si hay un
  // marcador de draft para ESTE producto (localStorage) y la URL no trae
  // ?designId= (un recover explícito manda sobre el marcador), se ofrece el
  // interstitial ANTES de bootear. El editor carga ssr:false → window existe
  // en el primer render (initializer lazy, una sola vez).
  // Endurecido 2026-10-13: readStudioDraftMarker solo devuelve marcadores con
  // PROGRESO REAL (se escriben tras el primer auto-save exitoso o al recuperar
  // un draft con avance — nunca al montar un draft vacío), vigentes (≤30 d) y
  // bien formados; los huérfanos/legacy se auto-limpian al leer. El marcador
  // trae savedAt para que el interstitial diga QUÉ se va a retomar.
  // 2026-10-21 — SOLO con `draftResumeEnabled` (cliente autenticado; decisión
  // del owner): el invitado no lee marcador ni ve el interstitial.
  const [resumeOffer, setResumeOffer] = useState<{ designId: string; savedAt: number } | null>(
    () => {
      if (!draftResumeEnabled) return null;
      const marker = readStudioDraftMarker(initialDraftScope);
      const urlHasDesignId =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("designId");
      const eligible = shouldOfferDraftResume({
        savedDesignId: marker?.designId ?? null,
        urlHasDesignId,
        hasInitialDesign: !!initialDesignId,
      });
      if (!eligible || !marker) return null;
      // 2026-10-19 — guardia de CONTENIDO REAL: si existe el snapshot local del
      // draft (ADR-133) y NO tiene progreso visible (cambio deshecho: asignar y
      // quitar la única foto, o solo cambiar la plantilla), el marcador apunta
      // a un canvas vacío → limpiar marcador + snapshot y arrancar fresco SIN
      // preguntar. Sin snapshot local no se puede verificar en cliente (el
      // contenido vive server-side): se ofrece y el recover/boot aplica la
      // misma guardia al escribir el marcador (ver boot y runSave).
      const snapshot = readStudioCanvasSnapshot(marker.designId);
      if (snapshot && !studioDraftHasRealProgress(snapshot.canvasData)) {
        clearStudioDraftId(initialDraftScope);
        clearStudioCanvasSnapshot(marker.designId);
        return null;
      }
      return marker;
    },
  );
  // Item 2.4 — continuar: navegar al recover flow con resume=1 (el server
  // valida ownership y exige DRAFT — sin clonar READY como el "Editar" del
  // carrito; si ya no es válido, arranca draft nuevo y el boot LIMPIA el
  // marcador huérfano). Navegación DURA (no router.replace):
  // una soft navigation conserva el estado del client component y el
  // `resumeOffer` vigente bloquearía el boot del diseño recuperado; con la
  // recarga completa el mount nuevo lee ?designId= de la URL y bootea limpio.
  const handleResumeDraft = useCallback(() => {
    if (!resumeOffer) return;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- navegación DURA a propósito (ver nota arriba): el remount completo es lo que garantiza que el boot lea el recover de la URL sin estado cliente viejo.
    window.location.assign(
      `/estudio/${product.slug}?designId=${encodeURIComponent(resumeOffer.designId)}&resume=1`,
    );
  }, [product.slug, resumeOffer]);
  // Item 2.4 — descartar: limpiar el marcador y bootear un draft nuevo.
  const handleDiscardDraft = useCallback(() => {
    clearStudioDraftId(initialDraftScope);
    // ADR-133 — también el snapshot de recuperación del draft descartado.
    if (resumeOffer) clearStudioCanvasSnapshot(resumeOffer.designId);
    setResumeOffer(null);
  }, [initialDraftScope, resumeOffer]);
  // PR A.3 (Lucy 2026-05-21) — Vista previa pre-carrito: al click «Vista
  // previa» (antes «¡Listo!») generamos preview compositado client-side y
  // abrimos modal. El upload real (production PNGs + finalize + addToCart)
  // solo se dispara si el cliente confirma "Sí, agregar al carrito" desde
  // el modal.
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  // Fase 2 · item 2.2 (2026-10-07) — Vista Previa PAGINADA por unidad: una página
  // por set/tira/separador/pack a tamaño legible (la modal pone flechas + dots +
  // swipe). El previewDataUrl (montaje único) sigue siendo el que se SUBE al
  // confirmar — el pager es solo UX de la modal, el contrato no cambia.
  // PERF (2026-10-07) — páginas PEREZOSAS: `dataUrl: null` = pendiente; el editor
  // genera la página de cada unidad solo cuando el cliente NAVEGA a ella en la
  // modal (handleRequestPreviewPage, con cache local en este mismo array). Antes
  // se generaban TODAS en el click de «Vista previa» (Canvas2D main thread — el
  // long task que disparaba el INP del botón).
  const [previewPages, setPreviewPages] = useState<
    { dataUrl: string | null; label: string }[] | null
  >(null);
  // Señal de REGENERACIÓN del set de páginas: se incrementa SOLO al armar una
  // vista previa nueva (click en «Vista previa»), no cuando una página perezosa
  // se cachea — el pager la usa para NO resetear la navegación en cada cacheo
  // (bug: pedir la página 2 devolvía a la 1 por el array nuevo).
  const [previewPagesGeneration, setPreviewPagesGeneration] = useState(0);
  // Generador perezoso de la página de una unidad (lo siembra handleFinalize al
  // abrir la modal; null = preview de una sola unidad, sin pager) + dedupe de
  // generaciones en vuelo (doble swipe rápido a la misma página pendiente).
  const previewPageLoaderRef = useRef<((unitIndex: number) => Promise<string>) | null>(null);
  const previewPageInflightRef = useRef<Set<number>>(new Set());
  const [previewError, setPreviewError] = useState<string | null>(null);
  // ADR-131 — progreso real del RenderJob durante el confirmar (polling de
  // /api/designs/<id>/render-status mientras finalize + add-to-cart completan).
  const [renderProgress, setRenderProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  // Lucy 2026-09-09 — feedback de PROCESAMIENTO del botón «Vista previa»:
  // componer el preview (snapshots Konva o páginas del calendario) tarda un
  // tramo perceptible y antes el click no mostraba NADA. Mientras corre, el
  // botón del toolbar y el FAB muestran spinner + disabled (patrón Loader2).
  const [previewBuilding, setPreviewBuilding] = useState(false);
  // Lucy 2026-05-21 round 4: guías eliminadas. La línea punteada del
  // "safe area" confundía al cliente porque no matcheaba visualmente la
  // silueta del corazón/círculo. La silueta del producto ya define el
  // borde de impresión, no necesitamos UI adicional.
  // Hardcoded false; el código de overlay las ignora.
  const showRealismGuides = false;
  // A2.8 — Sheet drawer mobile state (sidebar bottom slide-up).
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  // Ola 2 (2026-10-26) — bloqueo GUIADO de la plantilla: con >1 plantillas y
  // sin elección, «Ver diseño» no procede (handleFinalize): se abre el panel de
  // Personalizar en móvil (o scroll en desktop) y la sección de plantillas se
  // RESALTA. Esta señal (timestamp) la consumen ambas instancias del sidebar.
  const [templateNudgeAt, setTemplateNudgeAt] = useState(0);
  // H8 (2026-08-06) — el banner de cookies (fixed bottom z-[9000]) tapa el FAB
  // de edición en mobile hasta que el visitante elige. Mientras no haya
  // consentimiento persistido, el FAB sube por encima del banner; el evento
  // "cookie-consent-changed" lo devuelve a su sitio.
  const [fabRaisedForCookies, setFabRaisedForCookies] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setFabRaisedForCookies(!readClientCookiePreferences()));
    const handler = () => setFabRaisedForCookies(false);
    window.addEventListener("cookie-consent-changed", handler);
    return () => window.removeEventListener("cookie-consent-changed", handler);
  }, []);
  const slotStagesRef = useRef<Map<number, Konva.Stage | null>>(new Map());
  // 2026-10-19 — «Borrar el diseño»: resetea TODOS los slots (fotos + textos)
  // con confirmación. Vive en la fila de acciones globales (junto a Ideas/3D —
  // «Llenar slots con mis fotos» está en la sidebar, fuera de este archivo).
  // Boolean primitivo → suscripción atómica (patrón del resto del editor).
  const hasDesignContent = useStore(store, (s) => {
    const cd = s.canvasData;
    if (!cd) return false;
    if (Object.keys(s.packTextValues).length > 0) return true;
    return cd.slots.some(
      (sl) =>
        sl.assetId ||
        sl.assetUrl ||
        sl.profileAssetId ||
        sl.filter ||
        sl.photoTransform ||
        (sl.textOverrides && Object.keys(sl.textOverrides).length > 0),
    );
  });
  const [clearDesignOpen, setClearDesignOpen] = useState(false);
  const handleClearDesign = useCallback(() => {
    store.getState().clearAllSlots();
    setClearDesignOpen(false);
  }, [store]);
  // 2026-10-29 (owner) — con >1 plantillas y SIN elección, el LIENZO queda
  // deshabilitado (overlay guía): editar slots sin plantilla era trabajo
  // perdido (el boot solo presta la geometría de render, ADR-167). El bloqueo
  // de «Ver diseño» (templateNudge) sigue como segunda red.
  const selectedTemplateId = useStore(store, (s) => s.selectedTemplateId);
  const templatePending = templates.length > 1 && !selectedTemplateId;
  // Si el finalize ya pasó pero el CARRITO falló, reintentar desde la modal no puede volver a
  // finalizar: el diseño quedó en READY y `finalizeDesign` solo acepta borradores, así que el
  // reintento moría con «Design is READY — only DRAFT can be finalized» y no había salida. Se
  // limpia al volver a editar, que es cuando el diseño puede cambiar de verdad.
  const finalizedRef = useRef(false);
  const flushCanvasSaveRef = useRef<
    (() => Promise<Awaited<ReturnType<typeof saveCanvasAction>>>) | null
  >(null);
  // ADR-063 T5 — cuando hay muchos slots, el grid monta solo los cercanos al viewport (lazy). Antes
  // de CUALQUIER snapshot (preview, producción, 3D) forzamos el montaje de todos y esperamos a que
  // Konva registre sus stages, para no snapshotear un slot vacío.
  const [forceMountAll, setForceMountAll] = useState(false);
  const ensureAllStagesMounted = useCallback(async () => {
    const expected = store.getState().canvasData?.slotCount ?? 0;
    const allPresent = () => {
      if (expected <= 0) return true;
      for (let i = 0; i < expected; i++) if (!slotStagesRef.current.get(i)) return false;
      return true;
    };
    if (allPresent()) return;
    setForceMountAll(true);
    await new Promise<void>((resolve) => {
      const deadline = performance.now() + 2000;
      const tick = () => {
        if (allPresent() || performance.now() > deadline) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, [store]);
  // FOTO4/CAL4 — galería de escenas "en tu espacio". null = cerrada; objeto = texturas por pieza +
  // columnas del grid (se calculan una vez al abrir). kind/sizeCm (ola 2B): selección de escenas
  // por tipo de producto y escala física real en nevera/tablero.
  const [sceneMagnets, setSceneMagnets] = useState<{
    magnets: Magnet3D[];
    cols: number;
    kind?: SceneKind;
    sizeCm?: string;
    isPolaroid?: boolean;
    facesPerUnit?: number;
    flat?: boolean;
    /** 2026-10-23 — calendario multi-set: tarjetas por set + labels de mes (pager de
     *  dos niveles del visor de detalle). Solo las llena handleOpenCalendar3D. */
    cardsPerSet?: number;
    cardLabels?: readonly string[];
  } | null>(null);
  const [sceneBuilding, setSceneBuilding] = useState(false);
  // CAL4 — construcción perezosa de las tarjetas mes para la galería (botón "Ver mi calendario").
  const [calendarBuilding, setCalendarBuilding] = useState(false);
  // SEP1 — preview inmersivo de separadores en un libro. null = cerrado; array = texturas de marcador.
  const [book3D, setBook3D] = useState<Magnet3D[] | null>(null);
  // Lucy 2026-09-09 — el libro 3D tarda en ARMAR las texturas (snapshot por
  // slot): el botón necesita spinner + disabled como los de escena/calendario.
  const [bookBuilding, setBookBuilding] = useState(false);
  // #15 — a11y del overlay 3D del libro (foco inicial + trap + Escape + retorno). onClose estable
  // (useCallback) para no re-armar el trap en cada render. La galería maneja la suya internamente.
  const book3DRef = useRef<HTMLDivElement>(null);
  const closeBook3D = useCallback(() => setBook3D(null), []);
  useDialogA11y(book3DRef, { onClose: closeBook3D, active: book3D !== null });
  // P1.5 — Asistente IA de ideas (ADR-058).
  const [aiOpen, setAiOpen] = useState(false);
  // Etapa 1 (modo catálogo): el asistente IA queda APAGADO — ni el botón
  // "Ideas" ni el panel se renderizan; el resto del Estudio sigue intacto.
  const aiEnabled = !isCatalogMode();

  // M.3.b.A2.5 — Lee `sizeCm` del producto para badge visual en cada slot.
  // Producto config viene como JSON unknown, parsePhotoProductConfig hace
  // safeParse Zod con fallback a {photoSlots: 1}.
  const productConfig = useMemo(
    () => parsePhotoProductConfig(product.personalizationSchema),
    [product.personalizationSchema],
  );

  // Ola 22 (Lucy 2026-09-09) — zoom de LIENZO: el valor crudo vive ACÁ porque el
  // control (− / % / + / reset) se renderiza en la fila de pills superior (junto a
  // «Ideas» / «Ver en tu espacio»), nunca flotando sobre el canvas ("invadía el
  // lienzo"). El grid lo clampa contra el tope por ancho y reporta el estado
  // efectivo (zoom real + cap) para el % y los disabled de −/+.
  // 2026-09-24 v2 (owner, tras prueba STG) — el "tamaño base" del admin
  // (canvasBaseScale) NO es el zoom del cliente: el grid lo aplica como factor
  // de escala del sizing y el zoom del cliente siempre abre en 1 (= "100%" =
  // el tamaño base definido por el admin) y su reset vuelve a 1.
  const [stageZoomRaw, setStageZoomRaw] = useState(1);
  const [stageZoomState, setStageZoomState] = useState({ zoom: 1, cap: 1 });
  // Ola 3 (Lucy 2026-07-22) — flags del producto, via schema (NO por slug):
  //  - allowText: el texto editable es de la Polaroid; Fotoimanes Cuadrados y
  //    separadores NO dibujan las capas de texto de la plantilla.
  //  - facesPerUnit=2 (separadores): cada unidad física es una tira doblada con
  //    2 caras de diseño → el Estudio trabaja con 2N slots (slot 2k=cara A,
  //    2k+1=cara B) y la grilla los agrupa por unidad.
  const allowText = productConfig.allowText === true;
  // Ola 3b (Lucy 2026-07-22) — productos con marcos de color: con borderColor la
  // tarjeta se pinta ENTERA del color y la foto va inserta ("fin del papel"), no un
  // stroke sobre blanco. Misma regla en producción (service.ts → frameFullBleed).
  const frameFullBleed = (productConfig.frameOptions?.length ?? 0) > 0;
  const facesPerUnit = productConfig.facesPerUnit === 2 ? 2 : 1;
  // Cara B OPCIONAL (2026-09-22) — lo declara el personalizationSchema del
  // producto (backOptional: true vía script de BD). Se lee crudo como
  // galleryTag/startMonth porque el schema Zod (PhotoProductConfigSchema) aún
  // no lo conoce; solo tiene sentido con productos de 2 caras (separadores).
  const backOptional =
    facesPerUnit === 2 &&
    (product.personalizationSchema as { backOptional?: boolean } | null)?.backOptional === true;
  // Lucy 2026-09-05 — packs de fotoimanes: el N de fotos por imán se elige en el
  // Estudio (prop packVariants). Los demás productos foto mantienen N fijo del
  // schema/variante (packVariants vacío → isPhotoPack false → cero cambios).
  const isPhotoPack = packVariants.length > 0;
  // Tipo de producto calendario — lo usa el modelo multi-unidad de abajo
  // (photosPerUnitForEditor) y las ramas de calendario del editor. Declarado
  // antes del bloque multi-unidad (2026-09-09) para no usarlo antes de tiempo.
  const isCalendarMonth = product.personalizationKind === "CALENDAR_PHOTO_MONTH";
  // ── Modelo MULTI-UNIDAD (owner 2026-09-09) ──
  // Fotos por unidad física: calendario → 12; tira photobooth → photoSlots de la
  // composición; separador → 1 por cara (los slots son las caras); imán suelto
  // (polaroid/cuadrados) → 1 (cada imán ES su unidad — la grilla plana intacta).
  const photosPerUnit = photosPerUnitForEditor({
    isCalendarMonth,
    facesPerUnit,
    photoSlots,
    unitTemplate: templates[0]?.canvasData ?? null,
  });
  const bootUnitSlots = photosPerUnit * facesPerUnit;
  // Unidades a diseñar: con composición multi-foto (tiras, calendario) vienen de la
  // PDP (?copies=N → initialUnits); con unidad de 1 foto (separadores/polaroid) el
  // N ya ES photoSlots (el pack size de la variante — comportamiento histórico).
  const requestedUnits = photosPerUnit > 1 ? (initialUnits ?? 1) : Math.max(1, photoSlots);
  const bootUnitCount = Math.min(
    maxUnitsForProduct(bootUnitSlots),
    Math.max(1, Math.trunc(requestedUnits) || 1),
  );
  // slotCount INICIAL (boot del canvasData). Durante la sesión el vivo sale del
  // store (canvasData.slotCount) porque el stepper de fotos lo reconstruye.
  // Multi-unidad: unitCount × unitSlots (2 tiras = 2 × 3; 2 calendarios = 2 × 12;
  // separadores/polaroid = el pack de siempre, sin cambios).
  const initialSlotCount = bootUnitSlots * bootUnitCount;
  // Tamaño físico efectivo (PDP o diseño recuperado — la página ya lo resolvió).
  const packSizeCm = productConfig.sizeCm;
  // Mín/máx de fotos del tamaño actual (catálogo ya filtrado por tamaño en la página).
  const packMinSlots = isPhotoPack ? Math.min(...packVariants.map((v) => v.photoSlots)) : 1;
  const packMaxSlots = isPhotoPack ? Math.max(...packVariants.map((v) => v.photoSlots)) : 1;
  // Ola 2A — marco inicial del Estudio: la variante elegida en la PDP aún trae
  // "Estilo"/"Marco" como dato (ya no es dimensión visible) → preselecciona el
  // color equivalente de la paleta; el cliente lo cambia libre en la sidebar.
  const initialBorderColor = useMemo(
    () => initialFrameColorFromSchema(product.personalizationSchema),
    [product.personalizationSchema],
  );
  // Grosor del borde (owner 2026-10-26) — rango habilitado por el admin
  // (personalizationSchema.borderWidth), leído defensivo por-key. null = el
  // producto no ofrece el slider y todo rinde con el grosor base (factor 1).
  const borderWidthConfig = useMemo(
    () => readBorderWidthConfig(product.personalizationSchema),
    [product.personalizationSchema],
  );

  // ── Valores VIVOS del canvasData (Lucy 2026-09-05, packs) ──
  // Mientras no hay canvasData (boot) caen al inicial de la prop. Selectores
  // atómicos (primitivos) → sin re-render en cascada.
  const livePhotoSlots = useStore(store, (s) => s.canvasData?.photoSlots ?? photoSlots);
  const liveSlotCount = useStore(store, (s) => s.canvasData?.slotCount ?? initialSlotCount);
  // Multi-unidad (2026-09-09): unidades y slots por unidad VIVOS del diseño.
  const liveUnitCount = useStore(store, (s) => s.canvasData?.unitCount ?? 1);
  const liveUnitSlots = useStore(store, (s) => s.canvasData?.unitSlots ?? bootUnitSlots);
  // ¿Tira photobooth multi-foto? (plantilla 1 col / gap 0 con unidad multi-slot).
  // Define el sustantivo de la unidad ("Tira") y la rama "strips" de la modal.
  const liveIsStrip = useStore(store, (s) => {
    const gl = s.canvasData?.gridLayout;
    return !!gl && gl.cols === 1 && gl.gap === 0 && (s.canvasData?.unitSlots ?? 1) > 1;
  });
  // Lucy 2026-09-08 — "¿Con imán?" del pack: vivo del canvasData (persistido en el
  // auto-save → el carrito resuelve la variante con él). Read-only: lo fija la PDP.
  const liveMagnet = useStore(store, (s) => s.canvasData?.magnet ?? initialMagnet);
  // Multiplicador de precio VIVO (2026-09-22) — el MISMO cálculo del servidor
  // (design-units.ts, módulo puro compartido): ceil(slotCount / lo que cubre la
  // variante). CRÍTICO cuando la variante YA es el pack (separadores: la variante
  // de 5 unidades cuesta $12.500 en total → multiplicador 1, no 5). La modal de
  // confirmación lo usa en vez del unitCount crudo (bug: mostraba $62.500).
  const livePriceMultiplier = useStore(store, (s) =>
    s.canvasData ? designUnitPriceMultiplier(s.canvasData, facesPerUnit) : 1,
  );
  // "Sin imán" (2026-09-22 → Paquete D 2026-10-02 → REVERTIDO por el owner 2026-10-07):
  // la variante sin imán NO esconde el BOTÓN, pero la galería filtra las escenas que
  // afirman imán (nevera/tablero/memo) para TODOS los kinds — si no queda ninguna,
  // la modal muestra un estado vacío explicado (ver MAGNET_SCENES en scene-gallery.tsx).
  // Precio VIVO del pack para el N actual (vista de la modal; el cobro lo
  // resuelve el servidor al agregar al carrito — nunca se confía en este valor).
  const effectiveUnitPrice = useMemo(() => {
    if (!isPhotoPack) return unitPriceCents;
    // Con el par Con/Sin imán (2026-09-08) el mismo N existe dos veces: se lee el
    // precio de la opción que coincide con el magnet elegido (fallback: la primera
    // con ese N — precios espejo mientras Lucy no los diferencie en el admin).
    return (
      packVariants.find((v) => v.photoSlots === livePhotoSlots && v.magnet === liveMagnet)?.price ??
      packVariants.find((v) => v.photoSlots === livePhotoSlots)?.price ??
      unitPriceCents
    );
  }, [isPhotoPack, packVariants, livePhotoSlots, liveMagnet, unitPriceCents]);

  // Fase 2 · item 2.3 (2026-10-07) — desglose COMPLETO de la variante efectiva
  // para la Vista Previa (antes solo `{ magnet }`): mismo helper
  // describeVariantAttributes que name/letterset. El personalizationSchema ya
  // llega mergeado variante-sobre-producto desde page.tsx; en packs mandan los
  // valores VIVOS del canvas (N de fotos del stepper, tamaño efectivo, imantado
  // persistido). Se omiten las dimensiones que la modal YA enuncia en su propio
  // resumen (conteos: "12 páginas"; tamaño: "📐 7.5×10") para no duplicarlas en
  // líneas contiguas — el resto (imán, idioma, estilo, marco, forma, acabado,
  // tema) ahora sí aparece en TODAS las superficies foto.
  const previewVariantLabel = useMemo(
    () =>
      studioPreviewVariantLabel({
        mergedSchema: product.personalizationSchema,
        live: isPhotoPack
          ? {
              photoSlots: livePhotoSlots,
              ...(packSizeCm ? { sizeCm: packSizeCm } : {}),
              ...(typeof liveMagnet === "boolean" ? { magnet: liveMagnet } : {}),
            }
          : undefined,
        omit: ["quantity", "photoSlots", ...(productConfig.sizeCm ? (["sizeCm"] as const) : [])],
      }),
    [
      product.personalizationSchema,
      isPhotoPack,
      livePhotoSlots,
      packSizeCm,
      liveMagnet,
      productConfig.sizeCm,
    ],
  );

  // 4.5 (2026-10-22) — chip de variante/tamaño del header de CADA sección de
  // unidad (multi-unidad): el owner quiere el tamaño visible en el lienzo, no
  // solo en la modal — acá NO se omite sizeCm (sí los conteos: la sección ya
  // dice "Tira 1 de 2" y su chip de progreso). En single-unidad basta el
  // header del toolbar (chip 📐 + variante) — este label solo alimenta las
  // secciones.
  const unitVariantLabel = useMemo(
    () =>
      studioPreviewVariantLabel({
        mergedSchema: product.personalizationSchema,
        live: isPhotoPack
          ? {
              photoSlots: livePhotoSlots,
              ...(packSizeCm ? { sizeCm: packSizeCm } : {}),
              ...(typeof liveMagnet === "boolean" ? { magnet: liveMagnet } : {}),
            }
          : undefined,
        omit: ["quantity", "photoSlots"],
      }),
    [product.personalizationSchema, isPhotoPack, livePhotoSlots, packSizeCm, liveMagnet],
  );

  // ADR-063 CAL2 — el año del calendario lo ELIGE el cliente (antes era un badge fijo del schema
  // del producto, y podía venir vacío). Default = año del producto → próximo año. Se ofrece un
  // rango seguro (nunca un año pasado) y se persiste por-diseño en el finalize.
  // (`isCalendarMonth` se declara junto al bloque multi-unidad, más arriba.)
  // SEP1 — separadores (galleryTag "separadores" o "separadores-magneticos" / "separadores-alargados"):
  // su vista inmersiva es un LIBRO, no la nevera. Paquete D (2026-10-02): el tag se resuelve con
  // el MISMO helper de la página (resolveGalleryTag — explícito o fallback al slug): un producto
  // separador sin galleryTag explícito en BD igual se detecta por su slug y conserva su 3D.
  const isBookmark = isBookmarkGalleryTag(
    resolveGalleryTag(product.personalizationSchema, product.slug),
  );
  // #14 — sustantivo del slot: Fase 1A (2026-09-27) lo centraliza en
  // resolveSlotNoun (lib/slot-noun) — usa el productKind REAL (el calendario
  // dice "tarjetas", no "imanes"; las tiras cuentan "fotos") y una variante
  // SIN IMÁN (magnet === false) NUNCA dice "imán" (dice "ficha"). El par
  // { one, many } lo consume el chip del toolbar; el singular alimenta los
  // aria/fallback de slots y el onboarding (pantalla=físico).
  const slotProductKind: StudioSlotProductKind = isCalendarMonth
    ? "calendar"
    : isBookmark
      ? "bookmarks"
      : liveIsStrip
        ? "strips"
        : "magnets";
  const slotNounPair = resolveSlotNoun(slotProductKind, liveMagnet, texts);
  // Fase 2 · item 2.8 (2026-10-07) — superficie del TOUR por producto: decide
  // las features del onboarding (lib/studio-tour) y su clave de localStorage.
  const isIgTemplate = useStore(store, (s) =>
    s.canvasData ? isInstagramTemplate(s.canvasData.unitTemplate.layers) : false,
  );
  // Ola 2 (2026-10-26) — la pista «toca un texto para editarlo» solo aplica si
  // el PRODUCTO admite texto (allowText) Y la plantilla vigente tiene capas de
  // texto editables (polaroid). Misma regla que el render del lienzo: sin
  // allowText las capas no se dibujan → no hay nada que tappear (Cuadrados).
  const hasEditableTextLayers = useStore(store, (s) =>
    allowText
      ? (s.canvasData?.unitTemplate.layers ?? []).some(
          (l) => l.type === "text" && (l as { editable?: boolean }).editable === true,
        )
      : false,
  );
  const tourSurface = resolveTourSurface({
    isInstagramTemplate: isIgTemplate,
    isCalendarMonth,
    isBookmark,
    isStrip: liveIsStrip,
    hasFrameOptions: frameFullBleed,
  });
  // Labels por slot compartidas por la grilla, el toolbar y el FAB (popover de
  // faltantes de «Vista previa», Fase 1A): calendario → meses ("Ene"…, repetidos
  // por unidad cuando hay N sets); separadores 2 caras → "1A","1B"…; el resto
  // undefined → se cae al número de slot.
  const resolvedSlotLabels = isCalendarMonth
    ? slotLabels && liveUnitCount > 1
      ? Array.from({ length: liveSlotCount }, (_, i) => slotLabels[i % slotLabels.length])
      : slotLabels
    : faceSlotLabels(livePhotoSlots, facesPerUnit);
  // Multi-unidad (2026-09-09) — sustantivo de la UNIDAD para el pager y los
  // headers de sección del lienzo ("Tira 1 de 2", "Set 1 de 2"…).
  // Delimitación de PACKS en el lienzo (owner 2026-09-15, ADR-101): familias
  // vendidas por packs de unidades sueltas (fotoimanes: packs de 6). MISMA
  // regla "packMode" del stepper de fotos (studio-photo-count-control): el
  // catálogo del tamaño (min/max) y el N vivo son todos múltiplos del pack.
  // Un diseño legacy (9/20 unidades) cae a null → grilla plana de siempre.
  const packUnitsPerGroup =
    isPhotoPack &&
    packMinSlots >= PHOTO_PACK_UNITS_PER_PACK &&
    packMinSlots % PHOTO_PACK_UNITS_PER_PACK === 0 &&
    packMaxSlots % PHOTO_PACK_UNITS_PER_PACK === 0 &&
    livePhotoSlots % PHOTO_PACK_UNITS_PER_PACK === 0
      ? PHOTO_PACK_UNITS_PER_PACK
      : null;
  const unitNoun = isCalendarMonth
    ? // Owner 2026-09-15: el calendario multi-set se nombra «Set» ("Set 1", "Set 2").
      texts.unidades.nombreSet
    : isBookmark
      ? texts.unidades.nombreSeparador
      : liveIsStrip
        ? texts.unidades.nombreTira
        : packUnitsPerGroup
          ? texts.unidades.nombrePack
          : texts.unidades.nombrePieza;
  // 2026-10-12 — el MISMO sustantivo como par {one, many, feminine} en
  // minúsculas para la línea de la Vista Previa ("1 separador", "3 separadores
  // — cada uno con su propio diseño"; antes "N unidades" para todo). El
  // singular sale del texto CMS del pager (va a mitad de frase); el plural y
  // el género son explícitos por rama (set→sets y pack→packs llevan +"s", no
  // la regla general +"es" de separador→separadores).
  const unitNounPair: SlotNoun = isCalendarMonth
    ? { one: texts.unidades.nombreSet.toLowerCase(), many: "sets" }
    : isBookmark
      ? { one: texts.unidades.nombreSeparador.toLowerCase(), many: "separadores" }
      : liveIsStrip
        ? { one: texts.unidades.nombreTira.toLowerCase(), many: "tiras", feminine: true }
        : packUnitsPerGroup
          ? { one: texts.unidades.nombrePack.toLowerCase(), many: "packs" }
          : { one: texts.unidades.nombrePieza.toLowerCase(), many: "piezas", feminine: true };
  const isTouch = useIsTouch(); // #9 — copy del gesto de zoom del libro 3D según táctil vs mouse.
  // FOTO4 — la galería de escenas "en tu espacio" (nevera/mural/repisa/regalo) es la vista por
  // defecto del fotoimán: se muestra cuando NO es calendario ni separador (el `else` del botón).
  const defaultCalendarYear = calendarYear ?? new Date().getFullYear() + 1;
  const [selectedYear, setSelectedYear] = useState(defaultCalendarYear);
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const set = new Set<number>([now, now + 1, now + 2, defaultCalendarYear]);
    return [...set].filter((y) => y >= now).sort((a, b) => a - b);
  }, [defaultCalendarYear]);

  // Subscribir reactivamente al modal — assets/designId del store, no snapshot
  const modalAssets = useStore(store, (s) => s.assets);
  const modalDesignId = useStore(store, (s) => s.designId);
  // Draft LAZY (2026-10-22) — el picker crea el draft en el momento si el
  // prediseñado es la primera acción del cliente (la registra el efecto de
  // auto-save; null antes de eso o si la creación falla).
  const ensureDesignIdForPicker = useCallback(
    () => store.getState().ensureDesignId?.() ?? Promise.resolve(null),
    [store],
  );
  // 5.1 (2026-10-22) — checklist «Tu diseño»: el badge de pendientes del FAB
  // «Editar» (móvil) comunica cuántos pasos bloqueantes faltan sin abrir el
  // sheet (la sección del sidebar usa el mismo hook).
  const { pendingCount: checklistPendingCount } = useStudioChecklist(store, {
    allowText,
    hasPredesigned: predesigned.length > 0,
    backOptional,
  });
  // Paquete C (2026-10-02) — fotos con aviso de calidad ASIGNADAS al diseño: las
  // lista la Vista Previa con checkbox de aceptación obligatorio. Suscripción
  // atómica por clave primitiva (patrón del store), detalle memoizado.
  const qualityWarningsKeyStr = useStore(store, (s) => qualityWarningsKey(s.assets, s.canvasData));
  const qualityWarnings = useMemo(
    () => collectQualityWarnings(store.getState().assets, store.getState().canvasData),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave resume el contenido
    [store, qualityWarningsKeyStr],
  );
  // PR A.3 — Subscribir reactivamente al flag de finalizing del store
  // para que el modal preview muestre el spinner durante upload.
  const isFinalizingFlag = useStore(store, (s) => s.isFinalizing);
  // Layout de la tarjeta de calendario ("classic" | "split") — lo declara la plantilla activa
  // (unitTemplate.calendarLayout); default "classic" si la plantilla no lo trae.
  const calendarLayout = useStore(store, (s) =>
    calendarLayoutFromUnitTemplate(s.canvasData?.unitTemplate),
  );
  // Lucy 2026-09-07 — tipo de letra del título/mes del calendario (selector del banner).
  // Vivo del canvasData (persistido en el auto-save → producción lo usa tal cual).
  const liveCalendarFont = useStore(store, (s) => s.canvasData?.calendarFont ?? "fredoka");
  const setCalendarFont = useStore(store, (s) => s.setCalendarFont);
  // Labels de las 8 opciones del selector (textos CMS).
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

  // ── Ola 26 (owner 2026-09-09) — GUARD DE FINALIZACIÓN: textos requeridos IG ──
  // La Polaroid Instagram exige TODOS sus textos editables con contenido del
  // cliente (usuario, ubicación, título y hashtags; el contador "362 me gusta"
  // queda decorativo). Con la tarjeta que nace VACÍA (Ola 25), una polaroid IG
  // podía finalizarse en blanco → «Vista previa» queda bloqueado (mismo patrón
  // de tooltip del bloqueo por fotos) hasta que cada capa requerida tenga un
  // override con texto en TODOS los slots del pack. Selector atómico (string
  // primitivo) → sin re-render en cascada por edits de foto.
  const igMissingTextKey = useStore(store, (s) =>
    s.canvasData ? igMissingRequiredTextLayerIds(s.canvasData).join(",") : "",
  );
  const igFinalizeBlockReason = useMemo(
    () => igBlockMessage(igMissingTextKey ? igMissingTextKey.split(",") : [], texts),
    [igMissingTextKey, texts],
  );

  // ──────────── Boot: crear draft (o recuperar existente) ────────────
  useEffect(() => {
    // Guard: el boot corre una vez por mount real del editor, también cuando el
    // diseño nuevo aún no tiene fila server-side.
    if (store.getState().booted) return;
    // Item 2.4 — con el interstitial "Continuar donde quedaste" pendiente el
    // boot ESPERA: crear un draft nuevo ahora dejaría dos drafts vivos (el del
    // marcador y este). Al descartar, resumeOffer → null y el boot corre.
    if (resumeOffer) return;
    let cancelled = false;
    const boot = async () => {
      try {
        let designId = initialDesignId;
        let canvasData: CanvasDataV2;
        let templateId: string | null = null;

        if (designId && initialDesignCanvas) {
          // Design existente: asegurar V2 (migrar V1 si hace falta)
          canvasData = ensureCanvasV2(initialDesignCanvas, initialSlotCount);
          // 2026-10-12 — la plantilla PERSISTIDA del diseño manda sobre el match
          // por dimensiones (findTemplateIdForCanvas): es la que el cliente eligió
          // de verdad (auto-save la refleja en Design.templateId y el clon la
          // hereda). Solo se acepta si sigue en la lista visible del producto.
          templateId =
            initialDesignTemplateId && templates.some((t) => t.id === initialDesignTemplateId)
              ? initialDesignTemplateId
              : null;
          // Multi-unidad (2026-09-09): normalizar diseños legacy (sin unitSlots)
          // al modelo del producto — la unidad se deriva de la plantilla del propio
          // diseño (tira, calendario, separador). unitSlots = 1 (polaroid) no se
          // declara: cada imán es su unidad desde siempre, grilla plana intacta.
          const legacyUnitSlots =
            photosPerUnitForEditor({
              isCalendarMonth,
              facesPerUnit,
              photoSlots: canvasData.photoSlots ?? photoSlots,
              unitTemplate: canvasData.unitTemplate,
            }) * facesPerUnit;
          if (legacyUnitSlots > 1) {
            const legacyUnitCount = Math.max(1, Math.round(canvasData.slotCount / legacyUnitSlots));
            canvasData = {
              ...canvasData,
              unitSlots: canvasData.unitSlots ?? legacyUnitSlots,
              unitCount: canvasData.unitCount ?? legacyUnitCount,
            };
          }
        } else {
          // 5.1 (owner 2026-10-22) — SIN plantilla seleccionada por defecto:
          // la primera plantilla solo presta su GEOMETRÍA para dibujar el
          // lienzo; la selección (selectedTemplateId) arranca en null y la
          // pide el checklist «Tu diseño». Excepciones dentro de
          // resolveBootTemplate: deep-link ?template= (elección explícita) y
          // producto de 1 sola plantilla (elección trivial → auto-selección).
          const bootTemplate = resolveBootTemplate(templates, initialTemplateId);
          designId = null;
          const unitTemplate = bootTemplate.geometry?.canvasData ?? {
            version: 1 as const,
            stage: { width: 1080, height: 1080, dpiPreview: 90, dpiProduction: 300 },
            layers: [
              { id: "background", type: "background", color: "#FFF8F0" },
              {
                id: "photo",
                type: "image-placeholder",
                x: 0,
                y: 0,
                width: 1080,
                height: 1080,
                cornerRadius: 0,
              },
            ],
          };
          templateId = bootTemplate.templateId;
          canvasData = {
            version: 2,
            unitTemplate,
            // Ola 3 — con facesPerUnit=2 (separadores) hay 2 slots de diseño por
            // unidad física: slot 2k = cara A, slot 2k+1 = cara B (convención
            // compartida con producción y con el frente 3D).
            // Multi-unidad (2026-09-09): slotCount = unitCount × unitSlots.
            slotCount: initialSlotCount,
            // Multi-unidad: declarar el modelo solo cuando la unidad tiene >1 slot
            // (tiras, calendario, separadores). unitSlots = 1 (polaroid/cuadrados)
            // no se declara — la variante YA es el pack (design-units.ts).
            ...(bootUnitSlots > 1 ? { unitCount: bootUnitCount, unitSlots: bootUnitSlots } : {}),
            // Lucy 2026-09-05 — packs: el canvasData nuevo ya declara el N de
            // fotos y el tamaño en raíz (fuente de la resolución server-side
            // de la variante en el carrito). Los demás productos no lo llevan.
            // Lucy 2026-09-08 — también el magnet ("¿Con imán?" de la PDP): la
            // resolución del carrito lo incluye para que el par Con/Sin imán
            // del catálogo no vuelva ambiguo el match.
            ...(isPhotoPack
              ? {
                  photoSlots,
                  ...(packSizeCm ? { sizeCm: packSizeCm } : {}),
                  ...(typeof initialMagnet === "boolean" ? { magnet: initialMagnet } : {}),
                }
              : {}),
            slots: Array.from({ length: initialSlotCount }, (_, idx) => ({
              slotIndex: idx,
              assetId: null,
              assetUrl: null,
            })),
            // Multi-unidad: con N unidades multi-slot el gridLayout describe la
            // grilla de UNA unidad (los separadores agrupados y las unidades
            // sueltas siguen con el layout del diseño completo).
            gridLayout: defaultGridFor(
              gridSlotCountForLayout({
                unitCount: bootUnitCount,
                unitSlots: bootUnitSlots,
                slotCount: initialSlotCount,
                facesPerUnit,
              }),
              unitTemplate.stage,
              // Ola 2A — la plantilla puede fijar las columnas (tira fotobooth: gridCols=1).
              typeof (unitTemplate as { gridCols?: unknown }).gridCols === "number"
                ? (unitTemplate as { gridCols?: number }).gridCols
                : undefined,
              // Ola 3c — y el gap (tira photobooth: gridGap=0 → tira continua).
              typeof (unitTemplate as { gridGap?: unknown }).gridGap === "number"
                ? (unitTemplate as { gridGap?: number }).gridGap
                : undefined,
            ),
          };
        }

        if (cancelled) return;

        // ADR-133 — reconciliación con el snapshot LOCAL de recuperación: si el
        // flush durante unload se perdió (sendBeacon descartado en el teardown —
        // verificado en STG), el server tiene un canvas más viejo que el
        // localStorage de este navegador. Gana el snapshot (rev del cliente más
        // nueva) y el boot arranca dirty para re-guardarlo en cuanto corra el
        // auto-save. Empate o server más nuevo → el snapshot sobra y se limpia.
        let recoveredFromLocalSnapshot = false;
        if (initialDesignId && initialDesignCanvas) {
          const snapshot = readStudioCanvasSnapshot(designId!);
          if (
            snapshot &&
            shouldUseCanvasSnapshot({
              snapshotRev: snapshot.rev,
              serverClientRev: canvasData.clientRev ?? null,
            })
          ) {
            try {
              canvasData = ensureCanvasV2(snapshot.canvasData as CanvasData, initialSlotCount);
              recoveredFromLocalSnapshot = true;
            } catch {
              // snapshot corrupto/manipulado → gana el canvas del server
            }
          } else if (snapshot) {
            clearStudioCanvasSnapshot(designId!);
          }
        }

        // Lucy 2026-09-05 — packs: el canvasData recuperado (edición desde
        // carrito/diseños) puede ser de ANTES del control de N fotos y no
        // declarar photoSlots en raíz → se fija con el N inicial del deep-link
        // /schema. El guard del N del diseño: si ya lo trae, se respeta
        // (el stepper arranca con el N guardado — flujo "Editar").
        // Lucy 2026-09-08 — misma regla para `magnet` ("¿Con imán?"): un diseño
        // de antes de la ola no la declara → se fija con la elección de la PDP;
        // si ya la trae, se respeta (una sola fuente de verdad al cobrar).
        if (isPhotoPack) {
          const normalized: number = canvasData.photoSlots ?? photoSlots;
          const normalizedSize = canvasData.sizeCm ?? packSizeCm;
          const normalizedMagnet = canvasData.magnet ?? initialMagnet;
          if (
            canvasData.photoSlots !== normalized ||
            canvasData.sizeCm !== normalizedSize ||
            canvasData.magnet !== normalizedMagnet
          ) {
            canvasData = {
              ...canvasData,
              photoSlots: normalized,
              ...(normalizedSize ? { sizeCm: normalizedSize } : {}),
              ...(typeof normalizedMagnet === "boolean" ? { magnet: normalizedMagnet } : {}),
            };
          }
        }

        // Ola 2A — preselección del marco: solo si el diseño no trae uno ya elegido
        // (un diseño recuperado conserva la elección del cliente).
        if (!canvasData.borderColor && initialBorderColor) {
          canvasData = { ...canvasData, borderColor: initialBorderColor };
        }

        // Grosor del borde (2026-10-26) — pre-siembra del DEFAULT del producto:
        // un diseño sin el campo (creado antes de la ola o con el feature
        // recién habilitado) arranca en el default del rango; uno persistido se
        // respeta, clampado al rango vigente (el admin pudo haberlo estrechado).
        // Retrocompat total: con el feature apagado (borderWidthConfig null) no
        // se escribe nada y el render cae a 1 (grosor histórico).
        if (borderWidthConfig) {
          const resolved = resolveBorderWidthFactor(
            canvasData.borderWidthFactor,
            borderWidthConfig,
          );
          if (canvasData.borderWidthFactor !== resolved) {
            canvasData = { ...canvasData, borderWidthFactor: resolved };
          }
        }

        // Recover (?designId= — «Editar» desde carrito/Mis diseños) — las signed
        // URLs persistidas en los slots caducan a 1 h (lib/storage): se re-mapean
        // por assetId con las FRESCAS del boot (initialDesignAssets). Sin esto el
        // render usaba la URL vencida del slot → placeholder lila eterno. Un asset
        // que ya no existe en el servidor queda como slot vacío (re-subida) y se
        // avisa con un toast tras hidratar.
        let missingBootAssets: string[] = [];
        if (initialDesignId) {
          const remapped = remapCanvasAssetUrls(canvasData, initialDesignAssets);
          canvasData = remapped.canvasData;
          missingBootAssets = remapped.missingAssetIds;
        }

        store.getState().init({
          designId,
          productSlug: product.slug,
          canvasData,
          templates,
          // 5.1 (owner 2026-10-22) — un draft NUEVO sin elección explícita NO
          // "matchea" plantilla por dimensiones (arranca sin selección y el
          // checklist la pide). El match best-effort queda SOLO como fallback
          // del recover (?designId=) para diseños legacy de antes de persistir
          // Design.templateId (2026-10-12): ese diseño YA tenía una plantilla
          // vigente — reconocerla no es un default, es continuidad.
          selectedTemplateId:
            templateId ?? (initialDesignId ? findTemplateIdForCanvas(canvasData, templates) : null),
          // ADR-133 — canvas recuperado del snapshot local: arrancar dirty para
          // que el auto-save lo suba sin esperar un cambio nuevo del cliente.
          startDirty: recoveredFromLocalSnapshot,
          cartAssetIdsInUse,
        });

        // Item 2.4 (endurecido 2026-10-13) — el marcador del retomador solo se
        // escribe con PROGRESO REAL:
        //  · Recover OK (?designId= → draft existente, con avance guardado por
        //    definición): se escribe acá para que una recarga posterior sin
        //    ?designId= lo ofrezca. 2026-10-19 — solo si el canvas recuperado
        //    tiene CONTENIDO REAL visible (studioDraftHasRealProgress): un
        //    recover de un draft vacío (p.ej. resume=1 de un marcador viejo,
        //    o un cambio deshecho ya guardado) NO rearma el marcador — se
        //    limpia y la próxima entrada arranca fresco sin preguntar.
        //  · Draft NUEVO: NO se escribe en el boot — un canvas vacío no es
        //    "donde quedaste" (ese era el bug: el retomador salía siempre).
        //    Lo escribe el primer auto-save exitoso (ver runSave).
        //  · Recover FALLIDO con resume=1 (el server arrancó un draft nuevo
        //    porque el diseño del marcador fue purgado, es de otro owner o ya
        //    no es DRAFT): el marcador quedó huérfano → se AVISA al cliente
        //    (antes se limpiaba en silencio y arrancaba vacío sin más) y solo
        //    entonces se limpia; no se pisa con el id del draft vacío (eso
        //    rearmaba la mentira).
        if (initialDesignId) {
          // 2026-10-21 — el marcador solo se toca con el retomador habilitado
          // (cliente autenticado); el invitado recupera por ?designId= sin
          // rearmar nada en localStorage.
          if (draftResumeEnabled) {
            if (studioDraftHasRealProgress(canvasData)) {
              writeStudioDraftId(initialDraftScope, initialDesignId);
            } else {
              clearStudioDraftId(initialDraftScope);
            }
          }
        } else if (typeof window !== "undefined") {
          const bootParams = new URLSearchParams(window.location.search);
          if (bootParams.has("designId") && bootParams.get("resume") === "1") {
            toast.warning(texts.errores.borradorPerdido);
            clearStudioDraftId(initialDraftScope);
          }
        }

        // Hidratar assets pre-existentes (Design recuperado)
        for (const asset of initialDesignAssets) {
          store.getState().addAsset(asset);
        }

        // Recover — aviso VISIBLE de fotos que ya no existen en el servidor
        // (antes fallaba en silencio: placeholder lila eterno en sus slots).
        if (missingBootAssets.length > 0) {
          toast.warning(
            fillStudioText(texts.errores.assetsFaltantes, { n: missingBootAssets.length }),
          );
        }

        setBooting(false);
      } catch (err) {
        if (cancelled) return;
        // #14 — el detalle técnico (inglés/stack) va al log; al cliente un mensaje claro es-CO.
        console.error("[studio.boot]", err);
        setBootError(texts.errores.boot);
        setBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [
    initialDesignId,
    initialDesignCanvas,
    initialDesignAssets,
    initialTemplateId,
    initialDesignTemplateId,
    initialDraftScope,
    product.slug,
    photoSlots,
    initialSlotCount,
    bootUnitSlots,
    bootUnitCount,
    isPhotoPack,
    packSizeCm,
    initialMagnet,
    templates,
    store,
    initialBorderColor,
    borderWidthConfig,
    texts,
    isCalendarMonth,
    facesPerUnit,
    resumeOffer,
    draftResumeEnabled,
    cartAssetIdsInUse,
  ]);

  // ──────────── Auto-save 2s debounce ────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastChangeRev = 0;
    let lastDraftThumbAt = 0;
    const queue = createSerialTaskQueue();

    // Draft LAZY (2026-10-22) — creación del draft COMPARTIDA entre el
    // auto-save y las vías que necesitan el designId antes del primer cambio
    // (aplicar un prediseñado como primera acción: sidebar, picker modal y
    // drag & drop llegan acá vía store.ensureDesignId). La promesa en vuelo se
    // DEDUPLICA: un doble-clic (o un auto-save concurrente) no crea 2 drafts.
    type EnsureResult = { ok: true; designId: string } | { ok: false; message: string };
    let ensureInFlight: Promise<EnsureResult> | null = null;
    const ensureDesign = (): Promise<EnsureResult> => {
      const current = store.getState();
      if (current.designId) return Promise.resolve({ ok: true, designId: current.designId });
      if (!ensureInFlight) {
        ensureInFlight = (async (): Promise<EnsureResult> => {
          const cur = store.getState();
          const canvasData = cur.canvasData;
          const saveVariantId =
            isPhotoPack && canvasData
              ? packVariantIdFor(packVariants, canvasData.photoSlots, canvasData.magnet)
              : variantId;
          const created = await createDraftDesignAction({
            productId: product.id,
            templateId: cur.selectedTemplateId ?? undefined,
            ...(saveVariantId ? { variantId: saveVariantId } : {}),
          });
          if (!created.ok) return { ok: false, message: created.message };
          store.getState().setDesignId(created.designId);
          return { ok: true, designId: created.designId };
        })().finally(() => {
          ensureInFlight = null;
        });
      }
      return ensureInFlight;
    };
    store.getState().setDesignEnsurer(async () => {
      const res = await ensureDesign();
      return res.ok ? res.designId : null;
    });

    const performSave = async (): Promise<Awaited<ReturnType<typeof saveCanvasAction>>> => {
      const current = store.getState();
      if (!current.isDirty || !current.canvasData) return { ok: true };
      let designId = current.designId;
      const canvasData = current.canvasData;
      const savedRev = Math.max(lastChangeRev, canvasData.clientRev ?? 0, 1);
      lastChangeRev = savedRev;
      current.setAutoSaveStatus({ kind: "saving" });

      try {
        const saveVariantId = isPhotoPack
          ? packVariantIdFor(packVariants, canvasData.photoSlots, canvasData.magnet)
          : variantId;
        if (!designId) {
          // Misma vía compartida (dedupe con las aplicaciones de prediseñado
          // concurrentes): el draft nace UNA vez por sesión.
          const ensured = await ensureDesign();
          if (!ensured.ok) {
            current.setAutoSaveStatus({ kind: "error", message: ensured.message });
            return { ok: false, code: "INTERNAL", message: ensured.message };
          }
          designId = ensured.designId;
        }

        if (finalizedRef.current) {
          const reopened = await reopenDesignForEditAction(designId);
          if (!reopened.ok) {
            current.setAutoSaveStatus({ kind: "error", message: reopened.message });
            return { ok: false, code: "INTERNAL", message: reopened.message };
          }
          finalizedRef.current = false;
        }

        let draftPreviewDataUrl: string | undefined;
        if (
          Date.now() - lastDraftThumbAt >= DRAFT_THUMB_INTERVAL_MS &&
          canvasData.slots.some((slot) => slot.assetUrl)
        ) {
          try {
            const montage = await buildCompositedPreview(
              canvasData,
              slotStagesRef.current,
              productConfig.shape,
            );
            draftPreviewDataUrl = await fitDraftThumbnail(montage);
            lastDraftThumbAt = Date.now();
          } catch {
            // La miniatura se reintenta en el próximo guardado.
          }
        }

        const result = await saveCanvasAction({
          designId,
          canvasData: { ...canvasData, clientRev: savedRev },
          templateId: current.selectedTemplateId ?? undefined,
          variantId: isPhotoPack ? saveVariantId : undefined,
          draftPreviewDataUrl,
        });
        const latest = store.getState();
        const isLatest =
          latest.designId === designId &&
          latest.canvasData === canvasData &&
          lastChangeRev === savedRev;

        if (result.ok) {
          // 2026-10-21 — marcador del retomador SOLO con `draftResumeEnabled`
          // (cliente autenticado): el invitado no rearma ni limpia marcadores.
          if (draftResumeEnabled) {
            const savedScope = studioDraftScope(product.slug, saveVariantId);
            if (savedScope !== initialDraftScope) clearStudioDraftId(initialDraftScope);
            // 2026-10-19 — el marcador del retomador solo vive con CONTENIDO REAL:
            // si el canvas guardado quedó vacío (cambio deshecho: asignar y quitar
            // la única foto, o solo cambiar la plantilla), el marcador se RETIRA en
            // vez de quedar apuntando a un borrador vacío (el interstitial ya no lo
            // ofrece — studioDraftHasRealProgress ignora el atajo clientRev>0 de
            // designHasMeaningfulProgress, que cuenta "se guardó algo alguna vez").
            if (studioDraftHasRealProgress(canvasData)) {
              writeStudioDraftId(savedScope, designId);
            } else {
              clearStudioDraftId(savedScope);
            }
          }
          const snapshot = readStudioCanvasSnapshot(designId);
          if (snapshot && snapshot.rev <= savedRev) clearStudioCanvasSnapshot(designId);
          if (isLatest) {
            latest.markClean();
            latest.setAutoSaveStatus({ kind: "saved", at: Date.now() });
          }
        } else if (isLatest) {
          latest.setAutoSaveStatus({ kind: "error", message: result.message });
        }
        return result;
      } catch {
        const latest = store.getState();
        const message = texts.exportar.errorGuardar;
        if (latest.designId === designId && latest.canvasData === canvasData) {
          latest.setAutoSaveStatus({ kind: "error", message });
        }
        return { ok: false, code: "INTERNAL", message };
      }
    };

    const runSave = () => queue.run(performSave);
    const flushSaves = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      let result = await runSave();
      while (result.ok) {
        const current = store.getState();
        if (!current.isDirty || !current.canvasData) break;
        result = await runSave();
      }
      return result;
    };
    flushCanvasSaveRef.current = flushSaves;

    const unsubscribe = store.subscribe((state, prev) => {
      if (state.canvasData === prev.canvasData) return;
      if (!state.isDirty || !state.canvasData) return;

      lastChangeRev = Math.max(
        Date.now(),
        lastChangeRev + 1,
        (state.canvasData.clientRev ?? 0) + 1,
      );
      if (state.designId) {
        writeStudioCanvasSnapshot(
          state.designId,
          { ...state.canvasData, clientRev: lastChangeRev },
          lastChangeRev,
        );
      }

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void runSave();
      }, AUTO_SAVE_DELAY_MS);
    });

    const booted = store.getState();
    if (booted.isDirty && booted.canvasData) {
      lastChangeRev = booted.canvasData.clientRev ?? Date.now();
      timer = setTimeout(() => {
        timer = null;
        void runSave();
      }, AUTO_SAVE_DELAY_MS);
    }

    const flushOnHide = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const current = store.getState();
      if (!current.isDirty || !current.canvasData) return;
      if (!current.designId) {
        void runSave();
        return;
      }
      const payload = JSON.stringify({
        designId: current.designId,
        canvasData: lastChangeRev
          ? { ...current.canvasData, clientRev: lastChangeRev }
          : current.canvasData,
        templateId: current.selectedTemplateId ?? undefined,
        variantId: isPhotoPack
          ? packVariantIdFor(packVariants, current.canvasData.photoSlots, current.canvasData.magnet)
          : undefined,
      });
      const blob = new Blob([payload], { type: "application/json" });
      if (
        typeof navigator !== "undefined" &&
        navigator.sendBeacon?.("/api/designs/save-canvas", blob)
      ) {
        current.setAutoSaveStatus({ kind: "saved", at: Date.now() });
        current.markClean();
        return;
      }
      void runSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushOnHide();
    };
    window.addEventListener("pagehide", flushOnHide);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      if (flushCanvasSaveRef.current === flushSaves) flushCanvasSaveRef.current = null;
      store.getState().setDesignEnsurer(null);
      if (timer) clearTimeout(timer);
      window.removeEventListener("pagehide", flushOnHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    store,
    isPhotoPack,
    initialDraftScope,
    packVariants,
    product.id,
    product.slug,
    productConfig.shape,
    variantId,
    draftResumeEnabled,
    texts.exportar.errorGuardar,
  ]);

  // ──────────── Click slot → picker si está vacío, editor unificado si está lleno ────────────
  const handleSlotClick = useCallback(
    (slotIndex: number) => {
      const filled = !!store.getState().canvasData?.slots?.find((s) => s.slotIndex === slotIndex)
        ?.assetUrl;
      if (filled) {
        setOpenEditSlot({ slotIndex, tab: "photo" });
      } else {
        setPickerRequest({ slotIndex, purpose: "photo" });
      }
    },
    [store],
  );

  // Ola 10 — solicitud de cambiar foto desde el editor unificado: cerrar editor + abrir picker.
  const handleRequestChangePhoto = useCallback(
    (slotIndex: number) => {
      setOpenEditSlot(null);
      setPickerRequest({ slotIndex, purpose: "photo" });
    },
    [setOpenEditSlot],
  );

  // Ola 17 — solicitud de cambiar la FOTO DE PERFIL desde el editor unificado:
  // cerrar editor + abrir el picker en modo profile.
  const handleRequestChangeProfilePhoto = useCallback(
    (slotIndex: number) => {
      setOpenEditSlot(null);
      setPickerRequest({ slotIndex, purpose: "profile" });
    },
    [setOpenEditSlot],
  );

  const handleAssetSelected = useCallback(
    (slotIndex: number, asset: StudioAsset) => {
      // Ola 17 — el propósito decide el target: foto principal o foto de perfil
      // (ambas viven en el SlotState, independientes entre sí).
      if (pickerRequest?.purpose === "profile") {
        store.getState().setSlotProfilePhoto(slotIndex, asset);
      } else {
        store.getState().assignAssetToSlot(slotIndex, asset);
      }
    },
    [store, pickerRequest],
  );

  const handleAssetBSelected = useCallback(
    (slotIndex: number, asset: StudioAsset) => {
      // Paquete A (2026-10-02) — la cara B de un prediseñado NUNCA pisa el
      // contenido del usuario: slot ocupado → no se aplica y se avisa (antes
      // se sobreescribía o se descartaba en silencio según la vía).
      const slot = store.getState().canvasData?.slots.find((s) => s.slotIndex === slotIndex);
      if (slot?.assetUrl) {
        toast.warning(texts.plantillas.toastCaraBOcupada);
        return;
      }
      store.getState().assignAssetToSlot(slotIndex, asset);
    },
    [store, texts],
  );

  // Paquete A — DEDUPE de prediseñados (cache de sesión del store): el mismo
  // diseño aplicado 2+ veces (picker o llenado variado) se sube una sola vez.
  const getCachedPredesigned = useCallback(
    (galleryImageId: string) => store.getState().predesignedAssetsByGalleryId[galleryImageId],
    [store],
  );
  const rememberPredesigned = useCallback(
    (galleryImageId: string, entry: { a: StudioAsset; b?: StudioAsset }) =>
      store.getState().rememberPredesignedAssets(galleryImageId, entry),
    [store],
  );

  const handleAssetUploaded = useCallback(
    (asset: StudioAsset) => {
      store.getState().addAsset(asset);
    },
    [store],
  );

  // PERF (2026-10-07) — generación PEREZOSA de la página por unidad de la Vista
  // Previa: la modal la pide al navegar a una página pendiente (dataUrl null) y
  // el resultado queda cacheado en `previewPages` (cache local por unidad —
  // volver a una unidad ya generada no regenera nada). El loader lo siembra
  // handleFinalize al abrir la modal.
  const handleRequestPreviewPage = useCallback(
    (unitIndex: number) => {
      const loader = previewPageLoaderRef.current;
      if (!loader || previewPageInflightRef.current.has(unitIndex)) return;
      previewPageInflightRef.current.add(unitIndex);
      loader(unitIndex)
        .then((dataUrl) => {
          setPreviewPages((cur) =>
            cur ? cur.map((p, i) => (i === unitIndex ? { ...p, dataUrl } : p)) : cur,
          );
        })
        .catch((err: unknown) => {
          // Mismo contrato que el fallo del montaje global: detalle al log,
          // mensaje customer-safe en la modal.
          console.error("[studio.preview.page]", err);
          setPreviewError(texts.errores.preview);
        })
        .finally(() => {
          previewPageInflightRef.current.delete(unitIndex);
        });
    },
    [texts],
  );

  // ─────── Step 1: «Vista previa» → genera preview compositado + abre modal ───────
  //
  // PR A.3 (Lucy 2026-05-21): partimos el finalize en 2 fases. Esta solo
  // genera el preview client-side (rápido, sin red), abre el modal para
  // que el cliente confirme. No sube nada todavía.
  const handleFinalize = useCallback(async () => {
    let state = store.getState();
    if (!state.canvasData || state.isFinalizing || previewBuilding) return;
    // Ola 2 (2026-10-26) — plantilla OBLIGATORIA con bloqueo GUIADO (decisión
    // owner): con >1 plantillas y sin elección (5.1: ninguna viene
    // pre-seleccionada), «Ver diseño» no procede — abre el panel de plantillas
    // (sheet «Editar» en móvil; scroll a la sección en desktop), la resalta y
    // avisa. El botón NO se deshabilita: el bloqueo guía, no castiga.
    if (templates.length > 1 && !state.selectedTemplateId) {
      toast.error(texts.plantillas.elegirParaContinuar);
      setTemplateNudgeAt(Date.now());
      if (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 1023.98px)").matches
      ) {
        setMobileSheetOpen(true);
      }
      return;
    }
    // Ola 26 (owner 2026-09-09) — GUARD: la Polaroid Instagram no se finaliza con
    // textos requeridos vacíos (usuario, ubicación, título, hashtags). El botón ya
    // se muestra bloqueado con el tooltip; esta es la defensa en profundidad (cualquier
    // vía que llegue acá — teclado, estado de carrera) se detiene con el mismo mensaje.
    const igBlock = igBlockMessage(igMissingRequiredTextLayerIds(state.canvasData), texts);
    if (igBlock) {
      state.setAutoSaveStatus({ kind: "error", message: igBlock });
      return;
    }
    setPreviewError(null);
    setPreviewPages(null);
    previewPageLoaderRef.current = null;
    previewPageInflightRef.current.clear();
    setPreviewBuilding(true);
    try {
      const flush = flushCanvasSaveRef.current;
      const saved = flush ? await flush() : { ok: true as const };
      if (!saved.ok) {
        state.setAutoSaveStatus({ kind: "error", message: saved.message });
        setPreviewError(saved.message);
        return;
      }
      state = store.getState();
      if (!state.designId || !state.canvasData) return;
      // Fase 2 · item 2.2 (2026-10-07) — partición por UNIDAD física para la
      // Vista Previa paginada (set/tira/separador/pack; 1 rango = sin pager).
      const unitRanges = previewUnitRanges({
        slotCount: state.canvasData.slotCount,
        unitCount: state.canvasData.unitCount,
        unitSlots: state.canvasData.unitSlots,
        packGroupSlots: packUnitsPerGroup,
      });
      const pageLabel = (u: number) =>
        fillStudioText(texts.unidades.unidadDe, {
          nombre: unitNoun,
          n: u + 1,
          total: unitRanges.length,
        });
      // #3 (auditoría v3) — CALENDARIO: el preview de confirmación debe mostrar las PÁGINAS reales
      // (mes + grilla + festivos), no las fotos sueltas rotuladas "imanes". Reusa composeCalendarPages
      // (mismas páginas WYSIWYG que producción/3D) y las apila en un montaje. No usa Konva/stages.
      if (isCalendarMonth) {
        const startMonth =
          (product.personalizationSchema as { startMonth?: number })?.startMonth ?? 0;
        const inputs = buildCalendarPageInputs(
          state.canvasData.slots,
          startMonth,
          state.canvasData.unitTemplate.stage.width,
        );
        const pages = await composeCalendarPages(
          inputs,
          selectedYear,
          calendarLayout,
          liveCalendarFont,
        );
        // El montaje ya sale en el MIME efectivo (WebP/JPEG) del compositor —
        // reencodePreviewDataUrl queda como red de seguridad no-op.
        setPreviewDataUrl(await reencodePreviewDataUrl(await buildCalendarPreviewMontage(pages)));
        // Item 2.2 — una página por SET (12 tarjetas c/u) a tamaño legible:
        // el montaje global con 4 sets quedaba diminuto. Celdas más grandes
        // que el montaje de upload (es solo UX de la modal).
        // PERF (2026-10-07) — PEREZOSO: solo placeholders + loader; cada set se
        // monta cuando el cliente navega a él (las `pages` ya compuestas se
        // reusan — el costo por navegación es solo el montaje de su set).
        if (unitRanges.length > 1) {
          const unitSlots = state.canvasData.unitSlots ?? 12;
          previewPageLoaderRef.current = (u) =>
            buildCalendarPreviewMontage(pages.slice(u * unitSlots, (u + 1) * unitSlots), {
              cellW: 240,
              maxCols: 3,
            });
          setPreviewPagesGeneration((g) => g + 1);
          setPreviewPages(unitRanges.map((_, u) => ({ dataUrl: null, label: pageLabel(u) })));
        }
        setPreviewModalOpen(true);
        return;
      }
      await ensureAllStagesMounted(); // T5: montar todos los slots antes del snapshot compositado
      // Pasar shape del producto para que el preview compositado respete
      // la silueta real (corazón, círculo, etc.) y no se vea un rectángulo
      // Lucy 2026-05-21 feedback: "se ve completa, no como corazón".
      // Ola 3 — separadores 2 caras: el preview de confirmación muestra las TIRAS
      // desplegadas (plegables: "cabezas al doblez" — Cara B arriba rotada 180°,
      // Cara A abajo derecha, doblez horizontal en la unión, igual que imprenta;
      // noFold: frente | reverso lado a lado), no una grilla de caras sueltas —
      // es la pieza física que el cliente va a recibir.
      // 2026-09-22 — noFold (Alargados): sin doblez ni "desplegado"; backOptional:
      // cara B vacía se pinta EN BLANCO (REGLA ÚNICA, decisión owner 2026-10-07 —
      // revierte la regla espejo del Paquete A 2026-10-02; producción:
      // blank-back-face.ts, features/personalization), igual que en el libro 3D.
      // Lo resuelve previewFacePairOfUnit dentro del compositor (faceB = null).
      const foldCaption = (() => {
        if (facesPerUnit !== 2 || productConfig.noFold) return undefined;
        const deployed = deployedSizeCm(productConfig.sizeCm);
        return deployed
          ? fillStudioText(texts.lienzo.doblezDesplegado, { tamano: `${deployed} cm` })
          : undefined;
      })();
      const previewUrl =
        facesPerUnit === 2
          ? await buildBookmarkStripPreview(
              state.canvasData,
              slotStagesRef.current,
              productConfig.cornerRadiusPx,
              { noFold: productConfig.noFold === true, backOptional, foldCaption },
            )
          : await buildCompositedPreview(
              state.canvasData,
              slotStagesRef.current,
              productConfig.shape,
            );
      setPreviewDataUrl(previewUrl);
      // Item 2.2 — una página por UNIDAD (separador con sus 2 caras, tira, pack):
      // reusar el mismo compositor con el rango de slots de la unidad (los
      // snapshots de slot están cacheados — cada unidad cuesta solo el
      // dibujo del lienzo de su página).
      // PERF (2026-10-07) — PEREZOSO: en el click solo se siembra el loader;
      // la página de cada unidad se genera cuando el cliente NAVEGA a ella en
      // la modal (antes se generaban TODAS acá — el long task del botón).
      if (unitRanges.length > 1) {
        const canvasSnapshot = state.canvasData;
        previewPageLoaderRef.current = (u) =>
          facesPerUnit === 2
            ? buildBookmarkStripPreview(
                canvasSnapshot,
                slotStagesRef.current,
                productConfig.cornerRadiusPx,
                {
                  noFold: productConfig.noFold === true,
                  backOptional,
                  foldCaption,
                  unitIndex: u,
                },
              )
            : buildCompositedPreview(canvasSnapshot, slotStagesRef.current, productConfig.shape, {
                unitRange: unitRanges[u]!,
              });
        setPreviewPagesGeneration((g) => g + 1);
        setPreviewPages(unitRanges.map((_, u) => ({ dataUrl: null, label: pageLabel(u) })));
      }
      setPreviewModalOpen(true);
    } catch (err) {
      // #14 — detalle técnico al log; al cliente un mensaje claro es-CO.
      console.error("[studio.preview]", err);
      state.setAutoSaveStatus({
        kind: "error",
        message: texts.errores.preview,
      });
    } finally {
      setPreviewBuilding(false);
    }
  }, [
    store,
    templates,
    productConfig.shape,
    productConfig.cornerRadiusPx,
    productConfig.noFold,
    productConfig.sizeCm,
    backOptional,
    ensureAllStagesMounted,
    isCalendarMonth,
    facesPerUnit,
    selectedYear,
    calendarLayout,
    liveCalendarFont,
    product.personalizationSchema,
    packUnitsPerGroup,
    unitNoun,
    previewBuilding,
    texts,
  ]);

  // SEP1 — Abrir el libro 3D del separador: captura un snapshot recortado a la silueta física
  // (transparente afuera) y lo pasa como textura. Solo para separadores (no son imanes → su hogar es
  // un libro, no la nevera). Si la captura falla, no rompemos el Estudio — solo no abrimos el 3D.
  const handleOpen3D = useCallback(async () => {
    const state = store.getState();
    if (!state.canvasData || bookBuilding) return;
    setBookBuilding(true);
    try {
      await ensureAllStagesMounted(); // T5: la vista 3D necesita la textura de TODOS los slots
      let textures = await buildMagnetTextures(
        state.canvasData,
        slotStagesRef.current,
        productConfig.shape,
        magnetTextureWidth({ sizeCm: productConfig.sizeCm }),
      );
      if (
        isBookmark &&
        !productConfig.noFold &&
        state.canvasData.unitTemplate.stage.width > state.canvasData.unitTemplate.stage.height
      ) {
        // Ola 6 — el separador se dobla de PIE sobre el borde del libro: la textura
        // horizontal del Estudio se rota 90° para que el diseño lea derecho en la cara 3D.
        // Ola 17 — el marcapáginas ALARGADO plano (noFold) ya viene vertical del Estudio
        // (stage 400×1500/400×1200): no se rota, se acuesta tal cual sobre la hoja.
        // 2026-09-25 — la rotación solo aplica a stages HORIZONTALES (legacy Ola 6);
        // los stages de separadores actuales son verticales (2×6 → 200×600; 4×4.2 →
        // 400×420) y la vista 3D ya es robusta a ambos casos → no se rota nada.
        textures = await rotateTextures90(textures);
      }
      setBook3D(textures);
    } catch (err) {
      state.setAutoSaveStatus({
        kind: "error",
        message: texts.errores.vista3d,
      });
      void err;
    } finally {
      setBookBuilding(false);
    }
  }, [
    store,
    productConfig.shape,
    productConfig.noFold,
    productConfig.sizeCm,
    ensureAllStagesMounted,
    isBookmark,
    bookBuilding,
    texts,
  ]);

  // FOTO4 — Abrir la galería de escenas "en tu espacio" (nevera/mural/repisa/regalo). Calcula UNA vez
  // la textura por imán (recortada a su silueta) y la pasa a la galería, que arma cada escena bajo
  // demanda. Si la captura falla, no rompemos el Estudio — solo no abrimos la galería.
  const handleOpenScene = useCallback(async () => {
    const state = store.getState();
    if (!state.canvasData || sceneBuilding) return;
    setSceneBuilding(true);
    try {
      await ensureAllStagesMounted(); // T5: la galería necesita la textura de TODOS los slots
      let textures = await buildMagnetTextures(
        state.canvasData,
        slotStagesRef.current,
        productConfig.shape,
        magnetTextureWidth({ sizeCm: productConfig.sizeCm }),
      );
      // Ola 6 — los separadores se renderizan de PIE en el libro 3D: la textura horizontal
      // del Estudio debe rotarse 90° para que el diseño lea derecho sobre la cara 2×6 cm.
      // Se hace ANTES de combinar tiras photobooth, para no mezclar la lógica de imanes.
      // Ola 17 — el ALARGADO plano (noFold) ya viene vertical del Estudio: no se rota
      // (misma excepción que el modal, :950).
      // 2026-09-25 — solo si el stage es HORIZONTAL (legacy Ola 6): los stages de
      // separadores actuales son verticales/cuadrados y la vista 3D ya maneja ambos
      // casos → con stage vertical no se rota nada (trabajo innecesario).
      if (
        isBookmark &&
        !productConfig.noFold &&
        state.canvasData.unitTemplate.stage.width > state.canvasData.unitTemplate.stage.height
      )
        textures = await rotateTextures90(textures);
      // Ola 6 — Tira magnética photobooth: la pieza física es continua (1 col, gap 0).
      // Combinamos los slots de cada TIRA (unitSlots) para que la nevera 3D muestre
      // tiras enteras. Multi-unidad (2026-09-09): una textura-tira POR UNIDAD — antes
      // iba de 3 en 3 fijo (una tira de 4 fotos quedaba 3+1, y 2 tiras se mezclaban).
      const isStrip =
        state.canvasData.gridLayout.cols === 1 &&
        state.canvasData.gridLayout.gap === 0 &&
        state.canvasData.slots.length > 1;
      if (isStrip) {
        textures = await combineStripTextures(textures, state.canvasData.unitSlots ?? 3);
      }
      // La escena Polaroid 3D solo corresponde a productos Polaroid: se detecta por el slug
      // del producto o por la plantilla activa (Polaroid Clásica / Instagram).
      const selectedTemplateSlug = state.templates.find(
        (t) => t.id === state.selectedTemplateId,
      )?.slug;
      const isPolaroidTemplate =
        selectedTemplateSlug === "photo-pack-polaroid-clasica" ||
        selectedTemplateSlug === "photo-pack-polaroid-instagram";
      const isPolaroid = product.slug.includes("polaroid") || isPolaroidTemplate;
      setSceneMagnets({
        magnets: textures,
        cols: isStrip ? 1 : state.canvasData.gridLayout.cols,
        // Ola 2B — la nevera/tablero escalan los imanes a su tamaño físico real (sizeCm variante).
        sizeCm: productConfig.sizeCm,
        isPolaroid,
        // Ola 10 — para separadores 2 caras: la galería necesita saber el facesPerUnit.
        facesPerUnit: productConfig.facesPerUnit,
        // Ola 17 — Alargados planos (noFold): la galería los muestra planos, no doblados
        // (misma condición que el modal del libro, :1681).
        flat: productConfig.noFold,
      });
    } catch (err) {
      state.setAutoSaveStatus({
        kind: "error",
        message: texts.errores.espacio,
      });
      void err;
    } finally {
      setSceneBuilding(false);
    }
  }, [
    store,
    product.slug,
    productConfig.shape,
    productConfig.sizeCm,
    productConfig.facesPerUnit,
    productConfig.noFold,
    ensureAllStagesMounted,
    sceneBuilding,
    isBookmark,
    texts,
  ]);

  // CAL4 (rediseño 2026-07-22) — "Ver mi calendario": el set de 12 TARJETAS mes 7.5×10 se ve como
  // IMANES en la galería de escenas (nevera/tablero, kind="calendar") — el calendario-de-pared
  // quedó archivado (solo /internal/3d-preview). Compone cada tarjeta (foto + mes + año + grilla)
  // con el MISMO dibujo que producción (WYSIWYG) y la pasa como textura 3:4 con su tamaño real,
  // así la nevera/tablero las escalan a 7.5×10 cm físicos. No depende del montaje de stages.
  // Ola 3 (Lucy 2026-07-22, "detalle primero, espacio después"): con kind="calendar" el modal
  // ABRE en el visor de detalle tarjeta-a-tarjeta (CalendarCardFocus) y la galería nevera/tablero
  // queda un nivel arriba ("Míralo en tu espacio") — la inversión vive dentro de SceneGallery;
  // acá solo cambia la intención del botón (abre el detalle).
  const handleOpenCalendar3D = useCallback(async () => {
    const state = store.getState();
    if (!state.canvasData || calendarBuilding) return;
    setCalendarBuilding(true);
    try {
      const startMonth =
        (product.personalizationSchema as { startMonth?: number })?.startMonth ?? 0;
      const inputs = buildCalendarPageInputs(
        state.canvasData.slots,
        startMonth,
        state.canvasData.unitTemplate.stage.width,
      );
      const pages = await composeCalendarPages(
        inputs,
        selectedYear,
        calendarLayout,
        liveCalendarFont,
      );
      // Cada tarjeta compuesta (1080×1440 = 3:4 exacto) es un imán de nevera de 7.5×10 cm.
      const cards: Magnet3D[] = pages.map((dataUrl) => ({
        dataUrl,
        wRatio: CALENDAR_PAGE.width,
        hRatio: CALENDAR_PAGE.height,
        shape: "rectangle" as const,
        wCm: 7.5,
        hCm: 10,
      }));
      // 2026-10-23 (owner) — pager de DOS NIVELES en el visor de detalle multi-set:
      // las tarjetas por set salen de la fuente real (canvasData.unitSlots, ?? 12 — mismo
      // fallback del montaje de la Vista Previa, :1658) y los labels de mes son los MISMOS
      // de los slots del editor (slotLabels de la PDP, repetidos por unidad — misma regla
      // de resolvedSlotLabels, :794). Con 1 set el visor queda como siempre.
      const unitSlots = state.canvasData.unitSlots ?? 12;
      const cardLabels = slotLabels
        ? Array.from({ length: cards.length }, (_, i) => slotLabels[i % slotLabels.length])
        : undefined;
      setSceneMagnets({
        magnets: cards,
        cols: 4,
        kind: "calendar",
        sizeCm: "7.5×10",
        cardsPerSet: unitSlots,
        cardLabels,
      });
    } catch (err) {
      state.setAutoSaveStatus({
        kind: "error",
        message: texts.errores.calendario,
      });
      void err;
    } finally {
      setCalendarBuilding(false);
    }
  }, [
    store,
    product.personalizationSchema,
    selectedYear,
    calendarLayout,
    liveCalendarFont,
    calendarBuilding,
    slotLabels,
    texts,
  ]);

  // El Escape de ambos overlays 3D lo maneja ahora useDialogA11y (#15, arriba); la galería de
  // escenas maneja el suyo internamente.

  // ──────────── Step 2: Confirmar → upload + add to cart + redirect ────────────
  //
  // Solo se invoca si el cliente confirma desde el modal. Si vuelve a editar,
  // nada se sube y el editor queda intacto. Modelo MULTI-UNIDAD (2026-09-09): el
  // diseño YA contiene las N unidades (la PDP las eligió con "Unidades" y el
  // cliente las diseñó una a una) → el carrito recibe UNA línea con qty=1 y el
  // precio = variante × N lo deriva el SERVIDOR del canvasData guardado
  // (design-units.ts — nunca se confía en un multiplicador del cliente).
  const handleConfirmFinalize = useCallback(
    async (_copies: number, opts?: { qualityAcknowledged?: boolean }) => {
      const state = store.getState();
      if (!state.canvasData || state.isFinalizing || !previewDataUrl) return;
      state.setIsFinalizing(true);
      setPreviewError(null);
      let renderPoll: ReturnType<typeof setInterval> | null = null;
      try {
        const flush = flushCanvasSaveRef.current;
        const saved = flush ? await flush() : { ok: true as const };
        if (!saved.ok) {
          state.setAutoSaveStatus({ kind: "error", message: saved.message });
          state.setIsFinalizing(false);
          setPreviewError(saved.message || texts.exportar.errorGuardar);
          return;
        }
        const confirmedState = store.getState();
        if (!confirmedState.designId || !confirmedState.canvasData) {
          state.setIsFinalizing(false);
          setPreviewError(texts.exportar.errorGuardar);
          return;
        }
        const designId = confirmedState.designId;
        const canvasData = confirmedState.canvasData;

        setRenderProgress(null);
        renderPoll = setInterval(() => {
          fetch(`/api/designs/${designId}/render-status`, { cache: "no-store" })
            .then(async (res) => {
              if (!res.ok) return;
              const data = (await res.json()) as {
                job?: { status: string; totalUnits: number; doneUnits: number } | null;
              };
              const job = data.job;
              if (job && job.totalUnits > 1 && job.status !== "DONE" && job.status !== "FAILED") {
                setRenderProgress({ done: job.doneUnits, total: job.totalUnits });
              }
            })
            .catch(() => undefined);
        }, 1500);
        // 2026-10-05 (fix STG) — presupuesto de bytes del preview: el body de la
        // Server Action tiene techo duro ~4.5 MB en Vercel (lo corta la plataforma,
        // NO lo levanta `serverActions.bodySizeLimit`). Si el montaje no cabe se
        // re-codifica acá (calidad decreciente + downscale) ANTES de armar el
        // FormData; sin esto el request moría en un 413 que el cliente veía como
        // "NetworkError when attempting to fetch resource". El camino común
        // (preview ya bajo el presupuesto) no paga nada: pasa tal cual.
        const previewForUpload = await fitPreviewToBudget(previewDataUrl);
        const buildFinalizeForm = () => {
          const fd = new FormData();
          fd.set("designId", designId);
          fd.set("slotCount", String(canvasData.slots.length));
          // Paquete C — aceptación explícita de calidad de fotos (checkbox de la
          // Vista Previa): el servidor la sella en Design.qualityAcknowledgedAt.
          if (opts?.qualityAcknowledged) fd.set("qualityAcknowledged", "1");
          // ADR-063 CAL2 — para calendarios mes-a-mes, el año elegido viaja al server (que lo hornea en
          // cada página del mes y lo persiste por-diseño).
          if (isCalendarMonth) fd.set("calendarYear", String(selectedYear));
          // 2026-09-22 — el preview sale WebP/JPEG (no PNG): la extensión del
          // archivo refleja el mime REAL del dataURL (el servidor acepta los 3
          // formatos y guarda con la extensión correcta — contrato preview).
          fd.set(
            "preview",
            dataUrlToBlob(previewForUpload),
            `preview.${previewFileExtension(previewForUpload)}`,
          );
          return fd;
        };

        let result = finalizedRef.current
          ? ({
              ok: true as const,
              previewUrl: null,
              status: "READY",
              productionSlotsCount: 0,
            } as Awaited<ReturnType<typeof finalizeDesignAction>>)
          : await finalizeDesignAction(buildFinalizeForm());

        // Ningún tier server-side reproduce este diseño con fidelidad (hoy solo la Polaroid, por su
        // marco SVG con fuentes horneadas): el servidor nos devuelve URLs firmadas y los PNG suben
        // DIRECTO a Storage. Ese camino no pasa por la Function, así que no tiene techo de tamaño.
        if (!result.ok && result.code === "NEEDS_CLIENT_SLOTS") {
          await ensureAllStagesMounted(); // T5: garantizar los N stages antes de snapshotear producción
          // ADR-166 (2026-10-22): el lienzo carga el derivado ≤800px; los PNG de
          // IMPRENTA de este fallback se rasterizan de los stages, así que durante
          // el snapshot los slots conmutan al MASTER (runWithPrintMasters hace
          // preload + espera determinista por src del nodo slot-photo).
          // (capturado antes del wrapper: el narrowing de `result` no cruza el async)
          const stagedUploads = result.uploads;
          await runWithPrintMasters(canvasData.slots, slotStagesRef.current, async () => {
            // Misma espera de decodificación que los previews/3D (slot-photo-readiness):
            // el PNG de imprenta NO puede hornear el placeholder lila — el stage
            // montado no implica foto decodificada (useImage es async).
            await waitForSlotPhotosReady(canvasData.slots, slotStagesRef.current);
            // H5 (auditoría v3): el pixelRatio va RELATIVO al tamaño LÓGICO del stage, no al display
            // responsive — así el PNG de imprenta sale a resolución FIJA (ancho lógico × 3, = los 3240px
            // del render server para 1080) igual en móvil y en desktop (antes toDataURL({pixelRatio:3})
            // sobre un slot de ~171px móvil daba ~186 DPI, borroso).
            const logicalStageW = canvasData.unitTemplate.stage.width;
            // Los snapshots se generan 1 a 1 (Konva exporta en el main thread) pero
            // las SUBIDAS van en paralelo (tope 3) con retry+timeout — ver
            // lib/upload-with-retry.ts. Antes eran PUTs secuenciales sin retry y un
            // micro-corte de red tumbaba el confirmar con el error crudo del
            // navegador en pantalla (fix STG 2026-10-05).
            const uploadRequests: StoragePutRequest[] = [];
            for (const { slotIndex, url } of stagedUploads) {
              const stage = slotStagesRef.current.get(slotIndex);
              if (!stage) {
                throw new Error(`No se pudo encontrar el slot ${slotIndex + 1} para snapshot`);
              }
              // ADR-063 T3 + H6 — archivo de imprenta LIMPIO: la sombra/glossy/edge (`name="realism"`) y
              // los indicadores de edición (recuadro punteado + dot, `name="edit-indicator"`) son adornos
              // de PANTALLA; NO deben hornearse en el PNG 300 DPI. Se ocultan solo durante el snapshot y
              // se restauran de inmediato. (El preview compositado conserva el realismo, pero NO los
              // indicadores — se ocultan también allá.)
              const hiddenForSnapshot = [
                ...stage.find(".realism"),
                ...stage.find(".edit-indicator"),
              ];
              hiddenForSnapshot.forEach((l) => l.hide());
              let dataUrl: string;
              try {
                const displayW = stage.width() || logicalStageW;
                const pixelRatio = (logicalStageW * 3) / displayW;
                dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
              } finally {
                hiddenForSnapshot.forEach((l) => l.show());
              }
              // FOTO1: heart/circle → recortar a la silueta (transparente afuera).
              dataUrl = await clipProductionSnapshotToShape(dataUrl, productConfig.shape);
              uploadRequests.push({
                url,
                body: dataUrlToBlob(dataUrl),
                contentType: "image/png",
              });
            }
            try {
              await uploadAllWithRetry(uploadRequests);
            } catch {
              // Mensaje amigable orientado a acción — el error crudo del motor
              // ("NetworkError when attempting to fetch resource") no le dice
              // nada al cliente.
              throw new Error(texts.exportar.errorSubidaArchivos);
            }
          });
          const retry = buildFinalizeForm();
          retry.set("useStagedSlots", "1");
          result = await finalizeDesignAction(retry);
        }

        if (!result.ok) {
          state.setIsFinalizing(false);
          setPreviewError(result.message);
          return;
        }
        finalizedRef.current = true;

        // 2026-10-13 — páginas POR UNIDAD del preview: se suben en un request
        // APARTE (uploadDesignPreviewPagesAction) para el "Ver" paginado del
        // carrito y la miniatura representativa de la línea. Reusa el loader
        // perezoso de la modal (las páginas ya navegadas vienen cacheadas en
        // previewPages; las pendientes se generan acá, una sola vez — el
        // cliente ya está en la espera del confirmar). BEST-EFFORT: un fallo
        // NO bloquea la compra (el carrito cae al preview global watermarked) —
        // pero desde la revalidación 2026-10-20 va con reintento + reporte a
        // ErrorReport (antes un fallo era un console.error invisible y la orden
        // perdía el pager para siempre — caso real del pedido LCM-2026-0001).
        if (previewPages && previewPages.length > 1 && previewPageLoaderRef.current) {
          try {
            const loader = previewPageLoaderRef.current;
            const pageBlobs = await Promise.all(
              previewPages.map(async (p, i) => dataUrlToBlob(p.dataUrl ?? (await loader(i)))),
            );
            await uploadPreviewPagesWithRetry(designId, () => {
              const pagesForm = new FormData();
              pagesForm.set("designId", designId);
              pageBlobs.forEach((blob, i) =>
                pagesForm.set(`page_${i}`, blob, `page-${i + 1}.webp`),
              );
              return pagesForm;
            });
          } catch (pagesErr) {
            console.error("[studio.preview.pages-upload]", pagesErr);
          }
        }

        // Add to cart — pasamos variantId del PDP (consolidación familias M.3.b.CAT).
        // replacesCartDesignId: si venimos de "Editar" desde el carrito, reemplaza el item original.
        // qty = 1: UNA línea = el diseño COMPLETO con sus N unidades (modelo
        // multi-unidad 2026-09-09 — antes qty era las "copias idénticas" de la PDP;
        // ahora las unidades van DENTRO del diseño y el precio ×N lo deriva el
        // servidor). El short-circuit de finalizedRef sigue intacto.
        // Lucy 2026-09-05 — packs: SIN variantId. El N de fotos se eligió en el
        // Estudio y viaja en el canvasData guardado; el SERVIDOR resuelve la
        // variante exacta (photoSlots+sizeCm, +magnet desde 2026-09-08) con
        // precio y stock server-side.
        // Mandar el variantId de la PDP cobraría la combinación vieja si el
        // cliente cambió N acá (la ruta del dinero no confía en el cliente).
        const addResult = await addPersonalizedToCartAction({
          designId,
          qty: 1,
          variantId: isPhotoPack ? undefined : variantId,
          replaceDesignId: replacesCartDesignId ?? undefined,
        });
        if (!addResult.ok) {
          state.setIsFinalizing(false);
          setPreviewError(
            fillStudioText(texts.exportar.errorCarrito, { error: addResult.message }),
          );
          return;
        }

        // Item 2.4 — el diseño quedó en el carrito (READY): su lugar ahora es
        // "Mis diseños", no el retomador. Limpiar el marcador del producto+variante.
        clearStudioDraftId(initialDraftScope);
        const cartVariantId = isPhotoPack
          ? packVariantIdFor(packVariants, canvasData.photoSlots, canvasData.magnet)
          : variantId;
        clearStudioDraftId(studioDraftScope(product.slug, cartVariantId));
        // ADR-133 — y su snapshot de recuperación (ya no hay draft que retomar).
        clearStudioCanvasSnapshot(designId);

        // Cerramos modal antes de redirigir para evitar flicker visual.
        setPreviewModalOpen(false);
        router.push("/carrito?personalized=1");
      } catch (err) {
        state.setIsFinalizing(false);
        // 2026-10-05 (fix STG) — errores de RED (TypeError "Failed to fetch" /
        // "NetworkError when attempting to fetch resource", AbortError de
        // timeout) se traducen al mensaje amigable; el texto crudo del navegador
        // nunca llega a la pantalla.
        // 2026-10-07 — la Server Action reventando con un 500/504 HTML de
        // plataforma (timeout/OOM de la Function) llega como "An unexpected
        // response was received from the server": mismo tratamiento, copy
        // propio customer-safe (errorServidorLento) en vez del texto de Next.
        setPreviewError(
          isServerActionCrash(err)
            ? texts.exportar.errorServidorLento
            : isNetworkError(err)
              ? texts.exportar.errorSubidaArchivos
              : err instanceof Error
                ? err.message
                : String(err),
        );
      } finally {
        // ADR-131 — frena el polling del progreso del render en TODOS los desenlaces
        // (éxito con redirect, errores con return temprano, excepción).
        if (renderPoll) clearInterval(renderPoll);
      }
    },
    [
      router,
      store,
      variantId,
      initialDraftScope,
      isPhotoPack,
      packVariants,
      previewDataUrl,
      previewPages,
      replacesCartDesignId,
      productConfig.shape,
      product.slug,
      isCalendarMonth,
      selectedYear,
      ensureAllStagesMounted,
      texts,
    ],
  );

  // Cerrar modal "Volver a editar": libera estado para no acumular preview
  // viejo si edita y vuelve a «Vista previa».
  const handleClosePreviewModal = useCallback(() => {
    setPreviewModalOpen(false);
    setPreviewDataUrl(null);
    setPreviewPages(null);
    previewPageLoaderRef.current = null;
    previewPageInflightRef.current.clear();
    setPreviewError(null);
    // La bandera NO se limpia acá. Si el finalize ya pasó y hubo más ediciones, el save
    // forzado del siguiente confirmar reabre el diseño a DRAFT (fix F1.1) y re-finaliza —
    // limpiarla haría que el finalize corriera sobre un diseño READY sin reapertura.
  }, []);

  // ──────────── Estados de boot ────────────
  if (bootError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <p className="text-brand-purple-dark text-lg font-semibold">{texts.errores.bootTitulo}</p>
          <p className="text-brand-purple-dark/70 mt-2 text-sm">{bootError}</p>
        </div>
      </div>
    );
  }

  // Fase 2 · item 2.4 (2026-10-07) — interstitial "Continuar donde quedaste":
  // hay un marcador de draft de ESTE producto y la URL no trae ?designId=. El
  // boot está pausado hasta que el cliente elige (continuar → recover flow con
  // resume=1; descartar → limpiar marcador y boot de draft nuevo).
  if (booting && resumeOffer) {
    return (
      <div className="from-brand-cream/40 flex flex-1 flex-col items-center justify-center bg-gradient-to-b to-white p-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-resume-title"
          className="border-brand-purple/15 w-full max-w-md rounded-2xl border bg-white p-6 text-center shadow-xl"
        >
          <div className="relative mx-auto h-12 w-12">
            <div className="from-brand-purple/40 via-brand-pink/30 to-brand-yellow/30 absolute inset-0 animate-pulse rounded-full bg-gradient-to-br shadow-md" />
            <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white">
              <span className="text-xl" role="img" aria-label={texts.lienzo.mascotaAria}>
                💜
              </span>
            </div>
          </div>
          <h2
            id="studio-resume-title"
            className="text-brand-purple-dark font-display mt-3 text-xl font-bold"
          >
            {texts.comun.continuarTitulo}
          </h2>
          <p className="text-brand-muted mt-2 text-sm">{texts.comun.continuarCuerpo}</p>
          {/* 2026-10-13 — el interstitial dice QUÉ se va a retomar: el producto
              siempre; la fecha del último guardado cuando el marcador la trae
              (sin fecha no se inventa nada — la línea simplemente no sale). */}
          <p className="text-brand-purple-dark/80 mt-2 text-xs font-semibold">
            {resumeOffer.savedAt > 0
              ? fillStudioText(texts.comun.continuarDetalle, {
                  producto: product.name,
                  fecha: new Intl.DateTimeFormat("es-CO", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(resumeOffer.savedAt)),
                })
              : product.name}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleResumeDraft}
              className="bg-gradient-brand inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-bold text-white shadow-md transition-all hover:brightness-110 active:scale-[0.98]"
            >
              {texts.comun.continuarCta}
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-brand-purple-dark/70 hover:bg-brand-purple/10 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors"
            >
              {texts.comun.continuarDescartar}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (booting) {
    // A1.2 — Skeleton premium: hero card con shimmer + grid de placeholders pulse
    // + mensaje contextual. Reemplaza el spinner básico.
    const skelCount = Math.min(photoSlots, 6);
    return (
      <div className="from-brand-cream/40 flex flex-1 flex-col bg-gradient-to-b to-white">
        {/* Header skeleton */}
        <div className="border-brand-purple/10 sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="bg-brand-purple/10 h-6 w-20 animate-pulse rounded" />
            <div className="hidden items-center gap-3 md:flex">
              <div className="bg-brand-purple/10 h-10 w-10 animate-pulse rounded-md" />
              <div className="flex flex-col gap-1.5">
                <div className="bg-brand-purple/10 h-3 w-40 animate-pulse rounded" />
                <div className="bg-brand-purple/10 h-2 w-24 animate-pulse rounded" />
              </div>
            </div>
            <div className="bg-brand-purple/15 h-9 w-24 animate-pulse rounded-md" />
          </div>
        </div>

        {/* Body: mascote contextual + grid de slots fantasma */}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          <div className="flex items-center gap-3">
            {/* Mascote bobbing */}
            <div className="relative h-12 w-12">
              <div className="from-brand-purple/40 via-brand-pink/30 to-brand-yellow/30 absolute inset-0 animate-pulse rounded-full bg-gradient-to-br shadow-md" />
              <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white">
                <span className="text-xl" role="img" aria-label={texts.lienzo.mascotaAria}>
                  💜
                </span>
              </div>
            </div>
            <div className="flex flex-col">
              <p className="text-brand-purple-dark text-sm font-bold">{texts.lienzo.bootTitulo}</p>
              <p className="text-brand-muted text-xs">{texts.lienzo.bootSubtitulo}</p>
            </div>
          </div>

          {/* Mini grid skeleton de slots */}
          <div
            className="grid w-full max-w-md gap-2"
            style={{
              gridTemplateColumns: `repeat(${Math.min(3, skelCount)}, 1fr)`,
            }}
            aria-hidden
          >
            {Array.from({ length: skelCount }).map((_, i) => (
              <div
                key={i}
                className="from-brand-cream/80 aspect-square overflow-hidden rounded-md bg-gradient-to-br to-white shadow-sm"
              >
                {/* Shimmer overlay */}
                <div className="relative h-full w-full overflow-hidden">
                  <div
                    className="animate-shimmer absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent"
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                  <div className="border-brand-purple/15 absolute inset-3 rounded border-2 border-dashed" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CSS shimmer keyframes inline (sin agregar al globals — local al componente) */}
        <style jsx>{`
          @keyframes shimmer {
            100% {
              transform: translateX(100%);
            }
          }
          :global(.animate-shimmer) {
            animation: shimmer 1.8s infinite;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* h1 de la página del editor (WCAG 1.3.1): el nombre del producto visible vive en la
          toolbar como <p>; la página necesita un encabezado de nivel 1 aunque sea sr-only.
          Las rutas gate y los editores name/letter-set ya traen su propio h1. */}
      <h1 className="sr-only">Personalizando {product.name}</h1>
      <StudioToolbar
        store={store}
        productName={product.name}
        productSlug={product.slug}
        productImageUrl={product.images?.[0]}
        productSizeCm={productConfig.sizeCm}
        productSlotCount={livePhotoSlots}
        slotNoun={slotNounPair}
        // 2026-10-12 — desglose de la variante en el header: el MISMO label de
        // la Vista Previa (ya omite tamaño/conteos, que el header enuncia en
        // sus propios chips) → llegan imán, idioma, estilo, marco, forma…
        variantLabel={previewVariantLabel}
        // Fase 1A — labels por slot para el popover de faltantes de «Vista
        // previa» (mismas de la grilla: "Ene", "1A"…).
        slotLabels={resolvedSlotLabels}
        showRealismGuides={false}
        photoCount={
          isPhotoPack
            ? {
                min: packMinSlots,
                max: packMaxSlots,
                facesPerUnit,
                sizeCm: packSizeCm,
                // "¿Con imán?" (2026-09-08): badge read-only junto al stepper —
                // lo fija la PDP, el Estudio solo lo muestra y lo persiste.
                magnet: liveMagnet,
                // Ola 28 (owner 2026-09-11, 1.3.A) — composición fija (tiras:
                // unitSlots > caras, misma regla del store): el stepper de fotos
                // sobra (la composición se eligió en la PDP) → va el de UNIDADES.
                composition: liveUnitSlots > facesPerUnit,
              }
            : undefined
        }
        onOpenGesturesHint={() => {
          setGesturesHintPersistent(true);
          setGesturesHintOpen(true);
        }}
        isPreviewBuilding={previewBuilding}
        finalizeBlockReason={igFinalizeBlockReason}
        // Cara B opcional (separadores): el guard exige solo las caras A.
        backOptional={backOptional}
        onFinalize={handleFinalize}
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Sidebar desktop (visible lg+, oculto en mobile — usa sheet drawer).
            2026-10-02 (UX scroll) — sticky con scroll PROPIO acotado al viewport:
            el sidebar puede crecer largo (prediseñados + mis fotos + plantillas)
            y antes arrastraba el scroll del documento entero, sacando el canvas
            de vista. lg:self-start es requisito del sticky dentro del flex-row
            (sin él, stretch le da la altura de la fila y no pega). top-16 ≈ alto
            del SiteHeader sticky (py-3 + BrandMark sm). Móvil intacto (el sheet
            ya tiene max-h + overflow propios). */}
        <aside
          className="border-brand-purple/10 hidden bg-white lg:sticky lg:top-16 lg:block lg:max-h-[calc(100vh-4rem)] lg:w-72 lg:self-start lg:overflow-y-auto lg:border-r"
          aria-label={texts.lienzo.herramientasAria}
        >
          <StudioSidebar
            store={store}
            productName={product.name}
            productSku={product.sku}
            productSizeCm={productConfig.sizeCm}
            productShape={productConfig.shape}
            allowText={allowText}
            predesigned={predesigned}
            facesPerUnit={facesPerUnit}
            backOptional={backOptional}
            templateNudgeSignal={templateNudgeAt}
          />
        </aside>

        {/* Auditoría v3 · H15: flex-COL para que el banner del calendario quede ARRIBA del grid (antes
            era flex-row → banner y grid en fila → overflow horizontal y slots sangrando). El banner ya
            trae mb-3, pensado para apilado. */}
        {/* Owner 2026-09-18 · overflow real @1024-1280: `min-w-0` es INNEGOCIABLE acá.
            Como flex item del row lg (con el aside), el default min-width:auto dejaba
            que la sección se ESTIRARA con su contenido: el grid medía el ancho ya
            estirado (ResizeObserver), lo fijaba y el documento desbordaba en bucle
            (el aside llegaba a encogerse de 288 a ~153px). Con min-w-0 la sección
            respeta su parte del flex y el observer mide el ancho útil real. */}
        <section className="flex min-w-0 flex-1 flex-col items-center p-4 pb-28 sm:pb-24 lg:p-8 lg:pb-16">
          <StudioStyleToolbar
            store={store}
            frameOptions={productConfig.frameOptions}
            borderWidth={borderWidthConfig}
          />

          {/* ADR-057 Fase D + CAL2 — banner de calendario: el cliente elige el AÑO (selector) y
              pone una foto por mes. Ola 2A (Lucy 2026-07-22): el selector de año se perdía
              visualmente → card blanca con borde marcado + año GRANDE en el dropdown. */}
          {isCalendarMonth && (
            <div className="border-brand-purple/30 text-brand-purple-dark mb-4 flex w-full max-w-xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border-2 bg-white px-5 py-3 shadow-md">
              <span className="text-base font-bold">{texts.lienzo.calBannerTitulo}</span>
              <label className="flex items-center gap-2">
                <span className="text-brand-purple-dark/80 text-sm font-semibold">
                  {texts.lienzo.calBannerAno}
                </span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="border-brand-purple/50 focus-visible:ring-brand-purple/40 text-brand-purple-dark font-display cursor-pointer rounded-xl border-2 bg-white px-3 py-1.5 text-xl font-bold focus-visible:ring-2 focus-visible:outline-none"
                  aria-label={texts.lienzo.calAnoAria}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              {/* Lucy 2026-09-07 — selector de TIPO DE LETRA del título/mes ("sería bueno que
                  el usuario pudiera ser más versátil, como es coger el tipo de letra").
                  Persiste en canvasData.calendarFont → el preview y producción lo usan. El
                  body/grilla siempre es Inter; acá solo cambia el lettering del mes. */}
              <label className="flex items-center gap-2">
                <span className="text-brand-purple-dark/80 text-sm font-semibold">
                  {texts.lienzo.calFontLabel}
                </span>
                <select
                  value={liveCalendarFont}
                  onChange={(e) =>
                    setCalendarFont(e.target.value as (typeof CALENDAR_FONT_OPTIONS)[number])
                  }
                  className="border-brand-purple/50 focus-visible:ring-brand-purple/40 text-brand-purple-dark font-display cursor-pointer rounded-xl border-2 bg-white px-3 py-1.5 text-xl font-bold focus-visible:ring-2 focus-visible:outline-none"
                  aria-label={texts.lienzo.calFontAria}
                >
                  {CALENDAR_FONT_OPTIONS.map((key) => (
                    <option key={key} value={key}>
                      {calendarFontLabels[key] ?? key}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-brand-purple-dark/70 text-sm font-medium">
                {texts.lienzo.calBannerHint}
              </span>
            </div>
          )}

          {/* P1.4/P1.5 — Botones de acción global: Ideas (IA) + Ver en 3D/tu espacio.
              Ahora siempre fluyen dentro del section: en mobile quedan justo debajo del banner
              y arriba del grid para no tapar los slots; en desktop se sientan debajo del banner.
              Se elimina el posicionamiento fixed que superponía los botones de edición/eliminación.
              Lucy 2026-09-08 — separación vertical real respecto al lienzo (mb-6/lg:mb-8):
              con mb-2 los pills (h-12 + ring-4) quedaban pegados al borde superior del canvas.
              Ola 32 (owner 2026-09-18) — chrome móvil compacto: a 375px la fila envolvía en
              2-3 líneas y el lienzo quedaba bajo el fold. Ola 32b (mismo día, feedback visual):
              el scroll horizontal se veía roto ("se sale de pantalla"). Ahora los pills son
              compactos en <sm (h-11 = 44px de target, px-3, text-xs, ring-2) y la fila envuelve
              centrada sin scroll; ≥sm conserva el tamaño original (h-12, ring-4).
              Ola 2 (2026-10-26) — mínimo vertical en <sm: gaps y margen inferior
              aún más finos (los targets táctiles de 44px se conservan). */}
          <div className="mt-1 mb-2 flex flex-wrap items-center justify-center gap-1 px-2 sm:mt-2 sm:mb-6 sm:gap-2 sm:px-4 lg:mb-8">
            {aiEnabled && (
              // 2026-10-29 (owner) — «Ideas» pasa a pill SECUNDARIO discreto:
              // el primario visual es «Ver en tu espacio»/3D; el asistente IA
              // queda disponible pero sin competir (outline, sin sombra XL).
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                // El nombre accesible sale del CONTENIDO (no de aria-label) para que
                // contenga el texto visible — WCAG 2.5.3, control por voz dice lo que ve.
                className="border-brand-purple/30 text-brand-purple-dark hover:border-brand-purple hover:bg-brand-purple/5 focus:ring-brand-purple inline-flex h-11 items-center gap-1.5 rounded-full border-2 bg-white/95 px-3 text-xs font-semibold transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none sm:h-12 sm:gap-2 sm:px-4 sm:text-sm"
              >
                <Sparkles className="text-brand-purple h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                <span>{texts.lienzo.btnIdeas}</span>
                <span className="sr-only">&nbsp;{texts.lienzo.ideasSr}</span>
              </button>
            )}
            {isCalendarMonth ? (
              <button
                type="button"
                onClick={handleOpenCalendar3D}
                disabled={calendarBuilding}
                aria-busy={calendarBuilding}
                className="bg-brand-purple ring-brand-purple/25 inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-white shadow-xl ring-2 transition-transform hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-60 sm:h-12 sm:gap-2 sm:px-4 sm:text-sm sm:ring-4"
              >
                {/* Lucy 2026-09-09 — spinner visible mientras se componen las 12 tarjetas
                    (antes solo cambiaba el texto y parecía no haber pasado nada). */}
                {calendarBuilding ? (
                  <Loader2 className="h-4 w-4 animate-spin sm:h-5 sm:w-5" aria-hidden />
                ) : (
                  <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                )}
                <span>{calendarBuilding ? texts.comun.armando : texts.lienzo.btnCalendario}</span>
                <span className="sr-only">{texts.lienzo.calBtnSr}</span>
              </button>
            ) : // Sin imán (owner 2026-10-07): el botón 3D sigue visible; la
            // galería filtra las escenas magnéticas por dentro (ver nota junto a liveMagnet).
            isBookmark ? (
              <button
                type="button"
                onClick={handleOpen3D}
                disabled={bookBuilding}
                aria-busy={bookBuilding}
                className="bg-brand-purple ring-brand-purple/25 inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-white shadow-xl ring-2 transition-transform hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-60 sm:h-12 sm:gap-2 sm:px-4 sm:text-sm sm:ring-4"
              >
                {bookBuilding ? (
                  <Loader2 className="h-4 w-4 animate-spin sm:h-5 sm:w-5" aria-hidden />
                ) : (
                  <Box className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                )}
                <span>{bookBuilding ? texts.comun.armando : texts.lienzo.btnLibro}</span>
                <span className="sr-only">&nbsp;{texts.lienzo.libroBtnSr}</span>
              </button>
            ) : (
              // FOTO4 — un solo botón abre la galería con TODAS las escenas (nevera/mural/repisa/regalo).
              <button
                type="button"
                onClick={handleOpenScene}
                disabled={sceneBuilding}
                aria-busy={sceneBuilding}
                className="bg-brand-purple ring-brand-purple/25 inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-white shadow-xl ring-2 transition-transform hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-60 sm:h-12 sm:gap-2 sm:px-4 sm:text-sm sm:ring-4"
              >
                {sceneBuilding ? (
                  <Loader2 className="h-4 w-4 animate-spin sm:h-5 sm:w-5" aria-hidden />
                ) : (
                  <Box className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                )}
                <span>{sceneBuilding ? texts.comun.armando : texts.lienzo.btnEspacio}</span>
                <span className="sr-only">{texts.lienzo.espacioBtnSr}</span>
              </button>
            )}
            {/* Ola 22 (Lucy 2026-09-09) — zoom de lienzo: pill INLINE en esta misma
                fila (antes flotaba sobre la esquina superior derecha del lienzo e
                "invadía el canvas"). Display-only; el grid aplica y clampa el valor. */}
            <StudioStageZoomControl
              zoom={stageZoomState.zoom}
              cap={stageZoomState.cap}
              onStep={(dir) => setStageZoomRaw((z) => stepStageZoom(z, dir, stageZoomState.cap))}
              onReset={() => setStageZoomRaw(1)}
            />
            {/* 2026-10-19 — «Borrar el diseño»: acción destructiva GLOBAL (faltaba;
                solo existía el borrado por slot). Solo se muestra con contenido
                real en el lienzo; pide confirmación (StudioClearDesignModal) y
                queda deshacible con Ctrl+Z/undo (va por setCanvasData).
                2026-10-29 (owner) — solo el icono de basura (44px táctil) con
                tooltip: el texto completo hacía la fila de pills demasiado
                invasiva en móvil. */}
            {hasDesignContent && (
              <Hint content={texts.lienzo.borrarDisenoCta}>
                <button
                  type="button"
                  onClick={() => setClearDesignOpen(true)}
                  aria-label={texts.lienzo.borrarDisenoCta}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-red-300 bg-white text-red-700 shadow-sm transition-transform hover:scale-105 hover:border-red-400 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none active:scale-95 sm:h-12 sm:w-12"
                >
                  <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                </button>
              </Hint>
            )}
          </div>

          {/* Ola 2 (2026-10-26) — pista de descubribilidad de la edición DIRECTA
              de texto en el lienzo (tap sobre el texto → editor): pill en flujo
              (no bloquea gestos ni el canvas), dismissible y persistida en
              localStorage. Solo si la plantilla tiene textos editables. */}
          {hasEditableTextLayers && <StudioTextEditHint />}

          {/* 2026-10-29 (owner) — lienzo DESHABILITADO hasta elegir plantilla
              (con >1): el overlay bloquea la interacción con los slots y guía
              hacia el panel de plantillas (en <lg abre el sheet «Editar»; en
              desktop dispara el nudge que scrollea y resalta la sección). */}
          <div className="relative w-full">
            <div
              aria-hidden={templatePending || undefined}
              className={templatePending ? "pointer-events-none select-none" : undefined}
            >
              <StudioCanvasGrid
                store={store}
                canvasDisabled={templatePending}
                sizeCm={productConfig.sizeCm}
                shape={productConfig.shape}
                finish={productConfig.finish}
                cornerRadiusPx={productConfig.cornerRadiusPx}
                showRealismGuides={showRealismGuides}
                // Ola 3 — calendario: meses; separadores 2 caras: "1A","1B",… por unidad.
                // Multi-unidad (2026-09-09): con N calendarios los meses se repiten por
                // unidad (cada una vuelve a empezar en Enero). Fase 1A — la expresión
                // vive en resolvedSlotLabels (compartida con toolbar/FAB).
                slotLabels={resolvedSlotLabels}
                // Multi-unidad — sustantivo de la unidad para pager/headers de sección.
                unitNoun={unitNoun}
                // 4.5 — chip de variante/tamaño en el header de cada sección de
                // unidad (multi-unidad: cada sección enuncia qué es).
                unitVariantLabel={unitVariantLabel}
                // PACKS (owner 2026-09-15, ADR-101) — tamaño del pack para que la
                // grilla plana se delimite en tarjetas "Pack N" (fotoimanes packs
                // de 6); null = grilla plana de siempre.
                unitGroupSlots={packUnitsPerGroup}
                // Ola 4 (Lucy 2026-07-23) — calendario: cada slot previsualiza la TARJETA
                // compuesta del mes (foto + título + grilla), no la foto a sangre.
                calendarPreview={
                  isCalendarMonth
                    ? {
                        year: selectedYear,
                        startMonth:
                          (product.personalizationSchema as { startMonth?: number })?.startMonth ??
                          0,
                        layout: calendarLayout,
                        font: liveCalendarFont,
                      }
                    : null
                }
                slotNoun={slotNounPair.one}
                allowText={allowText}
                frameFullBleed={frameFullBleed}
                facesPerUnit={facesPerUnit}
                // Alargados planos (noFold): sin línea de doblez en la tarjeta-unidad.
                noFold={productConfig.noFold === true}
                // Cara B opcional (separadores backOptional): el placeholder del slot
                // vacío de Cara B avisa que puede quedar sin diseñar.
                backOptional={backOptional}
                interactiveSlots={!isTouch}
                onSlotClick={handleSlotClick}
                stageZoomRaw={stageZoomRaw}
                onStageZoomState={setStageZoomState}
                // Fase 2 · item 2.1 — pinch-to-zoom del lienzo en táctil: el grid
                // pide el nuevo zoom (mismo estado de los botones −/+).
                onStageZoomChange={setStageZoomRaw}
                // Overrides por producto (owner 2026-09-24, admin → Avanzado):
                // columnas de la grilla (fuerza N columnas en desktop) y tamaño
                // base del lienzo (el "100%" del cliente). null = automático.
                gridColsOverride={productConfig.gridColsOverride ?? null}
                canvasBaseScale={productConfig.canvasBaseScale ?? null}
                openEditSlot={openEditSlot}
                onEditClose={() => setOpenEditSlot(null)}
                onRequestChangePhoto={handleRequestChangePhoto}
                onRequestChangeProfilePhoto={handleRequestChangeProfilePhoto}
                registerSlotStages={(stages) => {
                  slotStagesRef.current = stages;
                }}
                forceMountAll={forceMountAll}
              />
            </div>
            {templatePending && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[2px]">
                <div className="border-brand-purple/20 mx-4 flex max-w-xs flex-col items-center gap-3 rounded-2xl border bg-white p-5 text-center shadow-xl">
                  <Sparkles className="text-brand-purple h-6 w-6" aria-hidden />
                  <p className="text-brand-purple-dark font-display text-base font-bold">
                    {texts.checklist.pasoPlantillas}
                  </p>
                  <p className="text-brand-muted text-xs leading-snug">
                    {texts.plantillas.elegirParaContinuar}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateNudgeAt(Date.now());
                      if (
                        typeof window !== "undefined" &&
                        typeof window.matchMedia === "function" &&
                        window.matchMedia("(max-width: 1023.98px)").matches
                      ) {
                        setMobileSheetOpen(true);
                      }
                    }}
                    className="bg-brand-purple hover:bg-brand-purple-dark focus:ring-brand-purple flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-white transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none"
                  >
                    {texts.checklist.pasoPlantillas}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* P1.5 — Panel del asistente IA de ideas (apagado en modo catálogo) */}
      {aiEnabled && (
        <StudioAiPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          productName={product.name}
          slotCount={liveSlotCount}
          allowText={allowText}
        />
      )}

      {/* FOTO4/CAL4 — Galería de escenas "en tu espacio" en un solo modal (kind decide las escenas:
          fotoimanes → nevera/polaroid/mural/repisa/regalo · calendario → abre en el DETALLE
          tarjeta-a-tarjeta y sube a nevera/tablero con "Míralo en tu espacio", ola 3).
          Fase 1A (2026-09-27) — el calendario SIN IMÁN SÍ abre: su visor de detalle
          tarjeta-a-tarjeta es válido sin imán; la galería recibe `magnet` y gatea
          INTERNO las escenas nevera/tablero (que sí asumen imán). */}
      {sceneMagnets !== null && (
        <SceneGallery
          magnets={sceneMagnets.magnets}
          cols={sceneMagnets.cols}
          kind={sceneMagnets.kind}
          sizeCm={sceneMagnets.sizeCm}
          isPolaroid={sceneMagnets.isPolaroid}
          facesPerUnit={sceneMagnets.facesPerUnit}
          flat={sceneMagnets.flat}
          // 2026-10-23 — calendario multi-set: pager de dos niveles en el detalle.
          cardsPerSet={sceneMagnets.cardsPerSet}
          cardLabels={sceneMagnets.cardLabels}
          // Fase 1A — calendario "Sin imán": la galería oculta las escenas que
          // asumen imán (nevera/tablero); el detalle sigue disponible.
          magnet={liveMagnet}
          onClose={() => setSceneMagnets(null)}
        />
      )}

      {/* SEP1 — Modal del separador en un libro 3D (lazy, client-only). */}
      {book3D !== null && (
        <div
          ref={book3DRef}
          role="dialog"
          aria-modal="true"
          aria-label={texts.lienzo.libroAria}
          tabIndex={-1}
          className="bg-brand-purple-dark/85 fixed inset-0 z-50 flex flex-col backdrop-blur-sm outline-none"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
            <span className="font-display text-lg font-bold">{texts.lienzo.libroTitulo}</span>
            <button
              type="button"
              onClick={closeBook3D}
              aria-label={texts.comun.cerrarVista3d}
              className={CLOSE_X_CLASS + " h-10 w-10"}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex-1">
            <BookView3D
              bookmarks={book3D}
              sizeCm={productConfig.sizeCm}
              facesPerUnit={productConfig.facesPerUnit}
              flat={productConfig.noFold}
            />
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1.5 text-center text-xs text-white">
              {isTouch ? texts.escenas.hintTouch : texts.escenas.hintMouse}
            </p>
          </div>
        </div>
      )}

      {/* A2.8 — FAB mobile + Sheet drawer bottom para la sidebar */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            // A11Y — el texto blanco sobre bg-brand-turquoise daba 1.71:1 (WCAG 1.4.3 AA pide
            // 4.5:1). No se toca el turquesa (paleta = ADR): se oscurece el TEXTO a
            // brand-purple-dark → 7.06:1. Y el nombre accesible sale del CONTENIDO en vez de un
            // aria-label que no decía "Editar": con control por voz "haz clic en Editar" no
            // activaba nada (WCAG 2.5.3 Label in Name).
            className={`bg-brand-turquoise ring-brand-turquoise/30 text-brand-purple-dark fixed ${fabRaisedForCookies ? "bottom-28" : "bottom-4"} left-4 z-30 inline-flex h-14 items-center gap-2 rounded-full px-5 text-sm font-bold shadow-xl ring-4 transition-all hover:scale-105 active:scale-95 lg:hidden`}
          >
            <Sparkles className="h-5 w-5" aria-hidden />
            <span>{texts.comun.editar}</span>
            <span className="sr-only">{texts.comun.editarSr}</span>
            {/* 5.1 — badge de pasos pendientes (fotos requeridas / datos IG):
                el FAB deja de ser mudo y comunica «te falta X» sin abrir el
                sheet. Solo pasos bloqueantes; los opcionales no agobian. */}
            {checklistPendingCount > 0 && (
              <>
                <span
                  aria-hidden
                  className="bg-brand-yellow text-brand-purple-dark absolute -top-1.5 -right-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums shadow ring-2 ring-white"
                >
                  {checklistPendingCount}
                </span>
                <span className="sr-only">
                  {fillStudioText(texts.checklist.badgePendientes, { n: checklistPendingCount })}
                </span>
              </>
            )}
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          // #6 — la X por defecto del sheet queda ENTERRADA bajo este header sticky (sin z-index) →
          // invisible e intappable en móvil. La suprimimos y ponemos una propia DENTRO del header,
          // en el mismo contexto de apilamiento, con target de 44px (antes 28px, bajo el mínimo táctil).
          showCloseButton={false}
          className="border-brand-purple/10 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t bg-white p-0 lg:hidden"
        >
          <SheetHeader className="border-brand-purple/10 sticky top-0 z-20 flex-row items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur">
            <SheetTitle className="text-brand-purple-dark text-base font-bold">
              {texts.lienzo.sheetTitulo}
            </SheetTitle>
            <SheetClose asChild>
              <button
                type="button"
                aria-label={texts.comun.cerrarPersonalizacion}
                className={CLOSE_X_CLASS + " -mr-2 size-11 shrink-0"}
              >
                <X className="size-5" aria-hidden />
              </button>
            </SheetClose>
          </SheetHeader>
          {/* Reusa el mismo StudioSidebar — no se duplica el código.
              Debe recibir las MISMAS props que la instancia desktop (paridad:
              sin `predesigned` la galería de diseños no aparecía en móvil).
              Ola 2 (2026-10-26) — `density="compact"`: el sheet es full-width y
              las miniaturas crecían demasiado (~110px); grilla de 4 columnas,
              gaps y paddings menores SOLO acá (el aside desktop no cambia). */}
          <div className="pb-6">
            <StudioSidebar
              store={store}
              productName={product.name}
              productSku={product.sku}
              productSizeCm={productConfig.sizeCm}
              productShape={productConfig.shape}
              allowText={allowText}
              predesigned={predesigned}
              facesPerUnit={facesPerUnit}
              backOptional={backOptional}
              density="compact"
              templateNudgeSignal={templateNudgeAt}
            />
          </div>
          {/* Ola 2 (2026-10-26) — «Listo» sticky: cierre explícito del sheet
              (mismo patrón del sheet de estilo y del picker de fotos — antes el
              sheet de Personalizar era el único sin salida clara abajo). La X
              del header se conserva. */}
          <div className="border-brand-purple/10 sticky bottom-0 z-20 mt-auto border-t bg-white px-4 py-3">
            <SheetClose asChild>
              <button
                type="button"
                className="bg-brand-purple hover:bg-brand-purple-dark focus:ring-brand-purple flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-white transition-colors focus:ring-2 focus:ring-offset-1 focus:outline-none"
              >
                {texts.texto.estiloSheetListo}
              </button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>

      <StudioAssetPickerModal
        isOpen={pickerRequest !== null}
        slotIndex={pickerRequest?.slotIndex ?? null}
        // Ola 17 — propósito del picker: foto principal o foto de perfil.
        mode={pickerRequest?.purpose ?? "photo"}
        // Ola 3 — con separadores 2 caras hay 2N slots de diseño (cara A/B por unidad).
        totalSlots={liveSlotCount}
        assets={modalAssets}
        designId={modalDesignId}
        ensureDesignId={ensureDesignIdForPicker}
        predesigned={predesigned}
        productSizeCm={productConfig.sizeCm}
        facesPerUnit={facesPerUnit}
        onClose={() => setPickerRequest(null)}
        onSelectAsset={handleAssetSelected}
        onSelectAssetB={handleAssetBSelected}
        onAssetUploaded={handleAssetUploaded}
        getCachedPredesigned={getCachedPredesigned}
        rememberPredesigned={rememberPredesigned}
      />

      {/* 2026-10-19 — confirmación de «Borrar el diseño» (reset global de slots). */}
      <StudioClearDesignModal
        open={clearDesignOpen}
        onConfirm={handleClearDesign}
        onClose={() => setClearDesignOpen(false)}
      />

      {/* PR A.3 (Lucy 2026-05-21) — Vista previa pre-carrito */}
      <StudioPreviewModal
        isOpen={previewModalOpen}
        previewUrl={previewDataUrl}
        // Fase 2 · item 2.2 — páginas por unidad para el pager de la modal
        // (null/1 página = montaje único de siempre, sin navegación).
        // PERF — páginas perezosas: la modal pide cada una al navegar a ella.
        pages={previewPages}
        onRequestPage={handleRequestPreviewPage}
        // Generación del set de páginas: el pager resetea a la 1ª página solo
        // cuando se regenera de verdad, no al cachear una página perezosa.
        pagesGeneration={previewPagesGeneration}
        productName={product.name}
        // Ola 3 — en separadores la unidad física es la tira (2 caras): el conteo
        // del modal es de UNIDADES (N fotos vivo del stepper), no de slots de
        // diseño (2N). Multi-unidad (2026-09-09): tiras/calendarios muestran las
        // unidades vivas del diseño y sus piezas por unidad.
        slotCount={liveIsStrip || isCalendarMonth ? liveUnitCount : livePhotoSlots}
        slotsPerUnit={liveIsStrip || isCalendarMonth ? liveUnitSlots : undefined}
        sizeCm={productConfig.sizeCm}
        unitPrice={effectiveUnitPrice}
        // 2026-09-22 — multiplicador del SERVIDOR (design-units): la variante
        // puede YA ser el pack (separadores ×5 → ×1). La modal lo usa en vez
        // del unitCount crudo para el total (bug: mostraba pack × N).
        priceMultiplier={livePriceMultiplier}
        // Separadores planos (Alargados): textos sin "doblado".
        noFold={productConfig.noFold === true}
        // Multi-unidad: el diseño YA contiene las unidades → qty 1 al carrito;
        // el total de la modal = precio unitario × unidades.
        unitCount={liveUnitCount}
        // 2026-10-12 — sustantivo de la unidad para la línea de la modal
        // ("3 separadores — cada uno con su propio diseño", nunca "N unidades").
        unitNoun={unitNounPair}
        isFinalizing={isFinalizingFlag}
        errorMessage={previewError}
        renderProgressLabel={
          renderProgress
            ? fillStudioText(texts.exportar.preparandoArchivos, {
                hechas: renderProgress.done,
                total: renderProgress.total,
              })
            : null
        }
        productKind={
          isCalendarMonth
            ? "calendar"
            : facesPerUnit === 2
              ? "bookmarks"
              : liveIsStrip
                ? "strips"
                : // Fase 1A — SIN IMÁN (magnet === false) la modal dice "fichas",
                  // nunca "imanes" (misma regla del helper resolveSlotNoun).
                  liveMagnet === false
                  ? "tiles"
                  : "magnets"
        }
        calendarYear={selectedYear}
        // Fase 2 · item 2.3 (2026-10-07) — desglose COMPLETO de la variante
        // efectiva (describeVariantAttributes, mismo de name/letterset): imán,
        // idioma, estilo, marco, forma… Se omiten conteos/tamaño porque el
        // resumen propio de la modal ya los enuncia (ver preview-variant-label).
        variantLabel={previewVariantLabel}
        // Paquete C — fotos con aviso de calidad asignadas al diseño: la modal
        // exige la aceptación explícita antes de habilitar el confirmar.
        qualityWarnings={qualityWarnings}
        onEdit={handleClosePreviewModal}
        onConfirm={handleConfirmFinalize}
      />

      {/* M.3.b.UX.1 — FAB «Vista previa» mobile (visible solo <sm, fixed bottom-right) */}
      <StudioFinalizeFab
        store={store}
        isPreviewBuilding={previewBuilding}
        finalizeBlockReason={igFinalizeBlockReason}
        // Cara B opcional (separadores): el guard exige solo las caras A.
        backOptional={backOptional}
        // Fase 1A — labels por slot para el popover de faltantes (móvil).
        slotLabels={resolvedSlotLabels}
        onFinalize={handleFinalize}
      />

      {/* M.3.b.UX.5 — Onboarding tutorial primera vez. Fase 2 · item 2.8 —
          tour POR PRODUCTO (features del lienzo + clave por superficie); el
          editor suprime el banner de gestos mientras está abierto. */}
      <StudioOnboarding
        slotNoun={slotNounPair.one}
        surface={tourSurface}
        onOpenChange={setOnboardingOpen}
      />

      {/* M.3.b.UX.v11/v12 — Banner de gestos. Auto-trigger 1ª vez cuando hay
        foto + abierto manualmente desde botón "?" del toolbar. */}
      <StudioGesturesHintWrapper
        store={store}
        open={gesturesHintOpen}
        persistent={gesturesHintPersistent}
        // Item 2.8 — el tour por producto tapa la pantalla: sin auto-trigger
        // del banner de gestos mientras está abierto.
        suppressAutoTrigger={onboardingOpen}
        onClose={() => {
          setGesturesHintOpen(false);
          setGesturesHintPersistent(false);
          // Marca como visto al cerrar (tanto auto como manual close cuentan).
          try {
            window.localStorage.setItem(GESTURES_HINT_STORAGE_KEY, "true");
          } catch {
            // localStorage puede no estar disponible (incognito).
          }
        }}
        onAutoTrigger={() => {
          setGesturesHintPersistent(false);
          setGesturesHintOpen(true);
        }}
      />
      {/* M.3.b.UX.v13 (Lucy 2026-05-15) — Vista Previa eliminada. La preview
        compositada se hace solo al finalizar (snapshot pipeline). En el editor
        el cliente ya ve cada imán a tamaño físico real con su shape. */}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
//  StudioGesturesHintWrapper (Lucy v12) — controla apertura del banner:
//    - Auto-abrir 1ª vez que hay foto cargada (gestionado con localStorage).
//    - Apertura manual cuando se clickea botón "?" del toolbar.
// ──────────────────────────────────────────────────────────────────
function StudioGesturesHintWrapper({
  store,
  open,
  onClose,
  persistent,
  onAutoTrigger,
  suppressAutoTrigger = false,
}: {
  store: ReturnType<typeof createStudioStore>;
  open: boolean;
  onClose: () => void;
  persistent: boolean;
  /** Callback que el editor llama internamente cuando se cumple la condición
   *  de auto-open (filledCount > 0 + localStorage no marcado). */
  onAutoTrigger: () => void;
  /** Item 2.8 — true mientras el tour por producto está abierto (sin auto-trigger). */
  suppressAutoTrigger?: boolean;
}) {
  // Conteo de slots con foto — selector atómico primitivo.
  const filledCount = useStore(
    store,
    (s) => s.canvasData?.slots.filter((sl) => !!sl.assetUrl).length ?? 0,
  );

  // Auto-trigger 1ª vez (localStorage check vive acá).
  useEffect(() => {
    if (filledCount === 0) return;
    if (suppressAutoTrigger) return;
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(GESTURES_HINT_STORAGE_KEY);
    if (seen === "true") return;
    const t = window.setTimeout(() => onAutoTrigger(), 600);
    return () => window.clearTimeout(t);
  }, [filledCount, onAutoTrigger, suppressAutoTrigger]);

  return <StudioGesturesHint open={open} onClose={onClose} persistent={persistent} />;
}

// ──────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────

function defaultGridFor(
  slotCount: number,
  stage: { width: number; height: number },
  forcedCols?: number,
  forcedGap?: number,
) {
  const presets: Record<number, { cols: number; rows: number }> = {
    1: { cols: 1, rows: 1 },
    2: { cols: 2, rows: 1 },
    3: { cols: 3, rows: 1 },
    4: { cols: 2, rows: 2 },
    6: { cols: 3, rows: 2 },
    9: { cols: 3, rows: 3 },
    // 12 → 3×4: tarjetas más grandes (calendario mes a mes); réplica de
    // lib/grid-layout.ts. Mantener alineadas las 4 copias (ver service.ts).
    12: { cols: 3, rows: 4 },
    20: { cols: 5, rows: 4 },
  };
  let cols = presets[slotCount]?.cols ?? Math.ceil(Math.sqrt(slotCount));
  let rows = presets[slotCount]?.rows ?? Math.ceil(slotCount / cols);
  const aspect = stage.width / stage.height;
  if (aspect > 2.0 && cols > rows) [cols, rows] = [rows, cols];
  if (aspect < 0.5 && rows > cols) [cols, rows] = [rows, cols];
  // Ola 2A — la plantilla puede fijar las columnas (tira fotobooth: gridCols=1 → apilado vertical).
  if (typeof forcedCols === "number" && forcedCols >= 1) {
    cols = Math.min(forcedCols, slotCount);
    rows = Math.ceil(slotCount / cols);
  }
  // Ola 3c — la plantilla puede fijar el gap (tira photobooth: gridGap=0 → tira continua).
  const gap =
    typeof forcedGap === "number" && forcedGap >= 0
      ? forcedGap
      : slotCount <= 4
        ? 24
        : slotCount <= 9
          ? 16
          : slotCount <= 12
            ? 12
            : 8;
  return { cols, rows, gap };
}

// 5.1 (2026-10-22) — solo queda como fallback del RECOVER de diseños legacy
// (sin Design.templateId persistido); un draft nuevo NUNCA matchea por acá.
function findTemplateIdForCanvas(canvas: CanvasDataV2, templates: StudioTemplate[]): string | null {
  // Best-effort: matchear por stage dimensions del unitTemplate
  const match = templates.find(
    (t) =>
      t.canvasData.stage.width === canvas.unitTemplate.stage.width &&
      t.canvasData.stage.height === canvas.unitTemplate.stage.height,
  );
  return match?.id ?? null;
}

/**
 * 2026-10-19 — confirmación de «Borrar el diseño» (reset global de slots del
 * canvas actual: fotos + overrides de texto; la plantilla/variante y las fotos
 * subidas en «Mis fotos» se conservan). Mismo patrón visual y de accesibilidad
 * de StudioFaceChoiceModal: portal a document.body, backdrop, useDialogA11y
 * (foco inicial + trap + Escape). Es undoable (Ctrl+Z) — el cuerpo no promete
 * irreversibilidad.
 */
function StudioClearDesignModal({
  open,
  onConfirm,
  onClose,
}: {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const texts = useStudioTexts();
  const dialogRef = useRef<HTMLDivElement>(null);
  // #15 — foco inicial + trap + Escape + retorno de foco.
  useDialogA11y(dialogRef, { onClose, active: open });

  // Guard SSR: el portal necesita document (el modal solo abre por interacción).
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label={texts.comun.cerrar}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 cursor-default bg-black/40 backdrop-blur-sm"
            tabIndex={-1}
          />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="clear-design-title"
              aria-describedby="clear-design-desc"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="ring-brand-purple/10 pointer-events-auto flex w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1"
            >
              <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
                <div>
                  <h2
                    id="clear-design-title"
                    className="text-brand-purple-dark text-base leading-tight font-bold"
                  >
                    {texts.lienzo.borrarDisenoTitulo}
                  </h2>
                  <p id="clear-design-desc" className="text-brand-muted mt-1 text-xs leading-snug">
                    {texts.lienzo.borrarDisenoCuerpo}
                  </p>
                </div>
                <CloseXButton onClick={onClose} label={texts.comun.cerrar} className="shrink-0" />
              </div>
              <div className="border-brand-purple/10 flex shrink-0 flex-col gap-2 border-t px-5 py-3">
                <button
                  type="button"
                  onClick={onConfirm}
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-400 focus:outline-none"
                >
                  {texts.lienzo.borrarDisenoConfirmar}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="border-brand-purple/40 text-brand-purple-dark hover:bg-brand-purple/10 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  {texts.lienzo.borrarDisenoCancelar}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
