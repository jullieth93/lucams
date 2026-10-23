/*
 * Cap de raster de los stages Konva del Estudio (2026-10-22 — medición con
 * CDP Profiler, emulación móvil 390×844 + CPU ×6, build de producción):
 * Konva crea los backing stores de TODOS sus canvas a devicePixelRatio nativo
 * (3 en celulares modernos → 9× píxeles por operación de dibujo). Con 6
 * stages × 3 layers (18 canvas) la entrada a /estudio/set-fotoimanes-polaroid
 * costaba 13.4 s de JS y 65 longtasks; reduciendo el área de raster (dpr 1 en
 * la medición) bajaba a 7.6 s y 12 longtasks. El cap a 2 conserva nitidez
 * retina y baja el área de raster 2.25×. Los EXPORTS no se afectan:
 * stage.toDataURL usa pixelRatio RELATIVO al tamaño lógico del stage
 * (studio-canvas-grid, slot-snapshot-cache) y la producción renderiza en
 * servidor.
 *
 * Side-effect importado UNA vez desde studio-editor.tsx (antes de montar
 * cualquier Stage). Instancia única de konva@10.9 (peer de react-konva), así
 * que el cap aplica a todos los stages del editor y sus previews client-side.
 */
import Konva from "konva";

if (typeof window !== "undefined") {
  Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
}
