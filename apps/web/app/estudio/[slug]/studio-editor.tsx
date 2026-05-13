"use client";

/*
 * StudioEditor — orquestador client del Estudio (M.3).
 *
 * Responsabilidades:
 *   - Crear Design draft al montar (si no hay designId en query params)
 *   - State del canvasData (única fuente de verdad cliente)
 *   - Auto-save 2s debounce → server action `saveCanvasAction`
 *   - Coordinar uploads → server action `uploadDesignAssetAction`
 *   - Aplicar plantilla seleccionada → reemplazar canvasData
 *   - Finalizar (snapshot via Konva stage.toDataURL) → server action `finalizeDesignAction`
 *
 * Layout responsive:
 *   - Desktop: 3 columnas (uploads + templates | canvas | layer panel)
 *   - Mobile: stack vertical con tabs (Canvas / Plantillas / Mis fotos)
 *
 * Konva Stage es client-only — el dynamic import del page.tsx asegura
 * que no se ejecute en SSR.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createDraftDesignAction,
  finalizeDesignAction,
  saveCanvasAction,
} from "@/features/personalization/actions";
import { addPersonalizedToCartAction } from "@/app/carrito/actions";
import { StudioCanvas } from "./studio-canvas";
import { StudioSidebar } from "./studio-sidebar";
import { StudioToolbar } from "./studio-toolbar";
import type {
  AutoSaveStatus,
  CanvasData,
  CanvasLayer,
  ImagePlaceholderLayer,
  StudioAsset,
  StudioProduct,
  StudioTemplate,
} from "./types";

type StudioEditorProps = {
  product: StudioProduct;
  templates: StudioTemplate[];
  initialDesignId: string | null;
  initialTemplateSlug: string | null;
};

const AUTO_SAVE_DELAY_MS = 2000;

export function StudioEditor({
  product,
  templates,
  initialDesignId,
  initialTemplateSlug,
}: StudioEditorProps) {
  const router = useRouter();
  const [designId, setDesignId] = useState<string | null>(initialDesignId);
  const [canvasData, setCanvasData] = useState<CanvasData | null>(null);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>({ kind: "idle" });
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Pre-set: si el page recibió ?template=slug, encontrar la plantilla
  // matching para pasársela al createDraftDesignAction inicial.
  const initialTemplate = useMemo(() => {
    if (!initialTemplateSlug) return templates[0] ?? null;
    return templates.find((t) => t.slug === initialTemplateSlug) ?? templates[0] ?? null;
  }, [initialTemplateSlug, templates]);

  // ──────────── Init: crear draft + cargar canvasData inicial ────────────

  useEffect(() => {
    if (designId) {
      // Ya hay designId — TODO M.3.b: levantar Design.canvasData del server
      // y los DesignAssets existentes. Por ahora, si pasaron designId pero
      // no canvasData, usamos la plantilla por defecto.
      if (initialTemplate && !canvasData) {
        setCanvasData(initialTemplate.canvasData);
        setSelectedTemplateId(initialTemplate.id);
      }
      return;
    }
    // Crear draft
    let cancelled = false;
    (async () => {
      const result = await createDraftDesignAction({
        productId: product.id,
        templateId: initialTemplate?.id,
      });
      if (cancelled) return;
      if (result.ok) {
        setDesignId(result.designId);
        if (initialTemplate) {
          setCanvasData(initialTemplate.canvasData);
          setSelectedTemplateId(initialTemplate.id);
        }
      } else {
        setInitError(result.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [designId, initialTemplate, product.id, canvasData]);

  // ──────────── Auto-save 2s debounce ────────────

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<CanvasData | null>(null);

  useEffect(() => {
    if (!designId || !canvasData) return;
    latestDataRef.current = canvasData;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setAutoSaveStatus({ kind: "idle" });
    saveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus({ kind: "saving" });
      const result = await saveCanvasAction({
        designId,
        canvasData: latestDataRef.current!,
      });
      if (result.ok) {
        setAutoSaveStatus({ kind: "saved", at: Date.now() });
      } else {
        setAutoSaveStatus({ kind: "error", message: result.message });
      }
    }, AUTO_SAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [designId, canvasData]);

  // ──────────── Aplicar plantilla ────────────

  const handleSelectTemplate = useCallback(
    (template: StudioTemplate) => {
      // Replace canvasData con la plantilla. Si había fotos cargadas en
      // image-placeholders previos, las preservamos por id matching.
      const previousAssetsByLayerId = new Map<string, { assetId: string; assetUrl: string }>();
      if (canvasData) {
        for (const layer of canvasData.layers) {
          if (layer.type === "image-placeholder") {
            const img = layer as ImagePlaceholderLayer;
            if (img.assetId && img.assetUrl) {
              previousAssetsByLayerId.set(img.id, {
                assetId: img.assetId,
                assetUrl: img.assetUrl,
              });
            }
          }
        }
      }
      const newCanvas: CanvasData = JSON.parse(JSON.stringify(template.canvasData));
      newCanvas.layers = newCanvas.layers.map((layer: CanvasLayer) => {
        if (layer.type === "image-placeholder") {
          const prev = previousAssetsByLayerId.get(layer.id);
          if (prev) {
            return { ...layer, assetId: prev.assetId, assetUrl: prev.assetUrl };
          }
        }
        return layer;
      });
      setCanvasData(newCanvas);
      setSelectedTemplateId(template.id);
    },
    [canvasData],
  );

  // ──────────── Drop asset en image-placeholder ────────────

  const handleAssetAssign = useCallback(
    (layerId: string, asset: StudioAsset) => {
      if (!canvasData) return;
      const updated: CanvasData = {
        ...canvasData,
        layers: canvasData.layers.map((layer) => {
          if (layer.id !== layerId || layer.type !== "image-placeholder") return layer;
          return { ...layer, assetId: asset.id, assetUrl: asset.signedUrl };
        }),
      };
      setCanvasData(updated);
    },
    [canvasData],
  );

  const handleAssetUploaded = useCallback((asset: StudioAsset) => {
    setAssets((prev) => [...prev, asset]);
  }, []);

  // ──────────── Finalize (snapshot READY) ────────────

  const stageRef = useRef<{
    getDataURL: (pixelRatio: number) => string;
  } | null>(null);

  const handleFinalize = useCallback(async () => {
    if (!designId || !canvasData || !stageRef.current) return;
    setIsFinalizing(true);
    try {
      // Preview: pixelRatio 1 (1080 lógico × 1 = 1080 actual)
      // Production: pixelRatio 3 (1080 lógico × 3 = 3240 actual)
      // 3240px en 1080px de canvas físico-equivalente ≈ 300 DPI para imán 10cm.
      // Para imanes más grandes (calendarios A4), el stage es 1080 logical pero
      // Konva escala via pixelRatio. M.8 ajustará pixelRatio según producto físico real.
      const previewDataUrl = stageRef.current.getDataURL(1);
      const productionDataUrl = stageRef.current.getDataURL(3);

      const result = await finalizeDesignAction({
        designId,
        previewDataUrl,
        productionDataUrl,
      });
      if (!result.ok) {
        setAutoSaveStatus({ kind: "error", message: result.message });
        setIsFinalizing(false);
        return;
      }

      // M.4: Design.status=READY, agregar al cart con designId.
      const addResult = await addPersonalizedToCartAction({ designId, qty: 1 });
      if (!addResult.ok) {
        setAutoSaveStatus({
          kind: "error",
          message: `Diseño guardado, pero no pudimos agregarlo al carrito: ${addResult.message}`,
        });
        setIsFinalizing(false);
        return;
      }

      // Éxito end-to-end → redirect al carrito
      router.push("/carrito?personalized=1");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAutoSaveStatus({ kind: "error", message: `Error generando snapshot: ${msg}` });
      setIsFinalizing(false);
    }
  }, [canvasData, designId, product.slug, router]);

  // ──────────── Error state inicial ────────────

  if (initError) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <p className="text-brand-purple-dark text-lg font-semibold">No pudimos abrir el Estudio</p>
        <p className="text-brand-purple-dark/70 text-sm">{initError}</p>
        <Link
          href={`/producto/${product.slug}`}
          className="text-brand-purple hover:text-brand-purple-dark text-sm underline"
        >
          ← Volver al producto
        </Link>
      </div>
    );
  }

  if (!canvasData) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="text-brand-purple/70 flex items-center gap-3">
          <div className="border-brand-purple/30 border-t-brand-purple h-6 w-6 animate-spin rounded-full border-2" />
          <span>Preparando lienzo...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <StudioToolbar
        product={product}
        autoSaveStatus={autoSaveStatus}
        canFinalize={canvasData.layers.some((l) => l.type === "image-placeholder" ? !!(l as ImagePlaceholderLayer).assetUrl : true)}
        isFinalizing={isFinalizing}
        onFinalize={handleFinalize}
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="border-brand-purple/10 bg-white lg:w-72 lg:border-r">
          <StudioSidebar
            product={product}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            assets={assets}
            designId={designId}
            onSelectTemplate={handleSelectTemplate}
            onAssetUploaded={handleAssetUploaded}
          />
        </aside>

        <section className="flex flex-1 items-center justify-center p-4 lg:p-8">
          <StudioCanvas
            canvasData={canvasData}
            onAssetAssign={handleAssetAssign}
            registerStageHandle={(handle) => {
              stageRef.current = handle;
            }}
          />
        </section>
      </div>
    </div>
  );
}
