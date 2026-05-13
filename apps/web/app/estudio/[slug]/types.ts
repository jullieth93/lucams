/*
 * Types compartidos del Estudio (M.3). Versión cliente.
 *
 * Estos types son client-safe (no importan de @prisma/client ni de service-only
 * código). El servidor convierte modelos Prisma a estos shapes plain JSON antes
 * de pasar al cliente.
 */

export type PersonalizationKind =
  | "PHOTO_PACK"
  | "PHOTO_GRID"
  | "CALENDAR_PHOTO_MONTH"
  | "CALENDAR_PHOTO_HERO"
  | "EVENT_FAVOR"
  | "BUSINESS_LOGO"
  | "CUSTOM_DECOR"
  | "TEXT_ONLY";

export type StudioProduct = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  personalizationKind: PersonalizationKind;
  personalizationSchema: unknown;
  images: string[];
};

export type StudioTemplate = {
  id: string;
  slug: string;
  name: string;
  previewUrl: string;
  canvasData: CanvasData;
};

export type CanvasStage = {
  width: number;
  height: number;
  dpiPreview?: number;
  dpiProduction?: number;
};

export type CanvasLayer =
  | BackgroundLayer
  | ImagePlaceholderLayer
  | TextLayer
  | ShapeLayer
  | (UnknownLayer & { type: string });

export type BackgroundLayer = {
  id: string;
  type: "background";
  color: string;
};

export type ImagePlaceholderLayer = {
  id: string;
  type: "image-placeholder";
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
  rotation?: number;
  label?: string;
  /** Si está seteado, ya hay una foto del cliente cargada en este slot. */
  assetId?: string;
  /** signed URL de la foto del cliente — el editor la consume. */
  assetUrl?: string;
};

export type TextLayer = {
  id: string;
  type: "text";
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

export type ShapeLayer = {
  id: string;
  type: "shape";
  kind: "rect" | "circle" | "heart";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  rotation?: number;
};

type UnknownLayer = {
  id: string;
  [key: string]: unknown;
};

export type CanvasData = {
  version: number;
  stage: CanvasStage;
  layers: CanvasLayer[];
  // Permitir extras (perMonth para calendarios, grid para PHOTO_GRID, etc.)
  [key: string]: unknown;
};

export type StudioAsset = {
  id: string;
  signedUrl: string;
  width: number;
  height: number;
};

export type AutoSaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };
