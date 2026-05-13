"use client";

/*
 * StudioCanvas — wrapper Konva Stage del Estudio (M.3).
 *
 * Renderiza el `canvasData` como Konva layers:
 *   - background     → <Rect fill={color}> ocupando el stage
 *   - image-placeholder → <Rect> placeholder con dashed border si vacío,
 *                          <Image> con la foto del cliente si assetUrl seteado
 *   - text           → <Text>
 *   - shape          → <Rect> o <Path> heart custom
 *
 * El stage es responsive: se escala para encajar en el viewport (max width
 * 800px en mobile, 600px en desktop columna central). Internamente Konva
 * usa coordenadas lógicas según stage.width × stage.height.
 *
 * Drag & drop sobre image-placeholder slots: el cliente del editor escucha
 * `onDragOver` + `onDrop` sobre el contenedor; cuando se suelta un asset,
 * matchea la posición XY al layer image-placeholder más cercano.
 *
 * Esta capa exporta `registerStageHandle` para que el editor padre pueda
 * llamar `stage.toDataURL()` al finalizar — patrón ref-based para evitar
 * acoplar el state del padre al imperative Konva.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type {
  BackgroundLayer,
  CanvasData,
  CanvasLayer,
  ImagePlaceholderLayer,
  ShapeLayer,
  StudioAsset,
  TextLayer,
} from "./types";

type StudioCanvasProps = {
  canvasData: CanvasData;
  onAssetAssign: (layerId: string, asset: StudioAsset) => void;
  registerStageHandle: (handle: { getDataURL: (pixelRatio: number) => string }) => void;
};

const MAX_DISPLAY_SIZE = 720; // px en pantalla — el stage Konva escala automáticamente

export function StudioCanvas({ canvasData, onAssetAssign, registerStageHandle }: StudioCanvasProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // Escala el stage para que entre en el viewport (mantiene aspect ratio).
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const w = containerRef.current?.clientWidth ?? MAX_DISPLAY_SIZE;
      const targetMax = Math.min(MAX_DISPLAY_SIZE, w);
      setScale(Math.min(targetMax / canvasData.stage.width, targetMax / canvasData.stage.height));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [canvasData.stage.width, canvasData.stage.height]);

  // Expose stage.toDataURL al padre via callback ref.
  useEffect(() => {
    registerStageHandle({
      getDataURL: (pixelRatio: number) => {
        const stage = stageRef.current;
        if (!stage) return "";
        return stage.toDataURL({ pixelRatio, mimeType: "image/png" });
      },
    });
  }, [registerStageHandle]);

  // Drag & drop nativo del HTML para asset → image-placeholder.
  // El sidebar pone `e.dataTransfer.setData("application/lucams-asset", JSON.stringify(asset))`.
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("application/lucams-asset")) {
      e.preventDefault();
    }
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const raw = e.dataTransfer.getData("application/lucams-asset");
    if (!raw) return;
    e.preventDefault();
    let asset: StudioAsset;
    try {
      asset = JSON.parse(raw);
    } catch {
      return;
    }
    if (!containerRef.current) return;
    // Posición del drop en coords de container, después en coords del stage.
    const rect = containerRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const xStage = xPx / scale;
    const yStage = yPx / scale;
    // Encontrar el image-placeholder layer que contiene (xStage, yStage).
    const target = canvasData.layers.find(
      (l) =>
        l.type === "image-placeholder" &&
        xStage >= (l as ImagePlaceholderLayer).x - (l as ImagePlaceholderLayer).width / 2 &&
        xStage <= (l as ImagePlaceholderLayer).x + (l as ImagePlaceholderLayer).width / 2 &&
        yStage >= (l as ImagePlaceholderLayer).y - (l as ImagePlaceholderLayer).height / 2 &&
        yStage <= (l as ImagePlaceholderLayer).y + (l as ImagePlaceholderLayer).height / 2,
    );
    if (target) {
      onAssetAssign(target.id, asset);
    } else {
      // Si no matchea un slot existente, encajamos en el primer image-placeholder vacío.
      const emptySlot = canvasData.layers.find(
        (l) => l.type === "image-placeholder" && !(l as ImagePlaceholderLayer).assetUrl,
      );
      if (emptySlot) onAssetAssign(emptySlot.id, asset);
    }
  };

  // Renderiza layers según type
  const renderedLayers = useMemo(() => {
    return canvasData.layers.map((layer) => renderLayer(layer, canvasData.stage.width, canvasData.stage.height));
  }, [canvasData.layers, canvasData.stage.width, canvasData.stage.height]);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-3xl"
      style={{ aspectRatio: `${canvasData.stage.width} / ${canvasData.stage.height}` }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className="bg-white shadow-xl shadow-brand-purple/15 ring-1 ring-brand-purple/10"
        style={{
          width: canvasData.stage.width * scale,
          height: canvasData.stage.height * scale,
        }}
      >
        <Stage
          ref={stageRef as never}
          width={canvasData.stage.width * scale}
          height={canvasData.stage.height * scale}
          scaleX={scale}
          scaleY={scale}
        >
          <Layer>{renderedLayers}</Layer>
        </Stage>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────
//  Layer rendering
// ────────────────────────────────────────────────────

function renderLayer(layer: CanvasLayer, stageW: number, stageH: number) {
  switch (layer.type) {
    case "background":
      return renderBackground(layer as BackgroundLayer, stageW, stageH);
    case "image-placeholder":
      return renderImagePlaceholder(layer as ImagePlaceholderLayer);
    case "text":
      return renderText(layer as TextLayer);
    case "shape":
      return renderShape(layer as ShapeLayer);
    default:
      return null;
  }
}

function renderBackground(layer: BackgroundLayer, stageW: number, stageH: number) {
  return <Rect key={layer.id} x={0} y={0} width={stageW} height={stageH} fill={layer.color} />;
}

function renderImagePlaceholder(layer: ImagePlaceholderLayer) {
  const x = layer.x - layer.width / 2;
  const y = layer.y - layer.height / 2;
  return (
    <Group key={layer.id} rotation={layer.rotation ?? 0} x={x + layer.width / 2} y={y + layer.height / 2} offsetX={layer.width / 2} offsetY={layer.height / 2}>
      {layer.assetUrl ? (
        <ImageWithUrl url={layer.assetUrl} width={layer.width} height={layer.height} cornerRadius={layer.cornerRadius ?? 0} />
      ) : (
        <>
          <Rect
            width={layer.width}
            height={layer.height}
            fill="#F4ECFF"
            stroke="#7C6AAD"
            strokeWidth={2}
            dash={[8, 6]}
            cornerRadius={layer.cornerRadius ?? 0}
          />
          {layer.label && (
            <Text
              text={layer.label}
              x={0}
              y={layer.height / 2 - 12}
              width={layer.width}
              align="center"
              fontSize={20}
              fontFamily="Fredoka, Inter, sans-serif"
              fill="#7C6AAD"
            />
          )}
        </>
      )}
    </Group>
  );
}

function ImageWithUrl({
  url,
  width,
  height,
  cornerRadius,
}: {
  url: string;
  width: number;
  height: number;
  cornerRadius: number;
}) {
  const [image] = useImage(url, "anonymous");
  if (!image) {
    // Mientras carga, placeholder gris
    return <Rect width={width} height={height} fill="#E5E5E5" cornerRadius={cornerRadius} />;
  }
  return (
    <KonvaImage
      image={image}
      width={width}
      height={height}
      cornerRadius={cornerRadius}
    />
  );
}

function renderText(layer: TextLayer) {
  return (
    <Text
      key={layer.id}
      x={layer.x - 540}
      y={layer.y - (layer.fontSize ?? 48) / 2}
      width={1080}
      text={layer.text}
      fontFamily={layer.fontFamily ?? "Fredoka"}
      fontSize={layer.fontSize ?? 48}
      fontStyle={layer.fontWeight === "bold" ? "bold" : "normal"}
      fill={layer.fill ?? "#3D2E5C"}
      align={layer.align ?? "center"}
    />
  );
}

function renderShape(layer: ShapeLayer) {
  // V1 implementa solo rect — circle y heart como rect aproximado.
  // M.3.b agregará Path SVG para heart real + Circle para round-shape.
  if (layer.kind === "circle") {
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
        cornerRadius={Math.min(layer.width, layer.height) / 2}
        rotation={layer.rotation ?? 0}
      />
    );
  }
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
      rotation={layer.rotation ?? 0}
    />
  );
}
