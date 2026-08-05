/*
 * Declaración ambiental para `heic-decode` (no trae tipos propios).
 * Decodificador HEIC/HEIF puro (JS/WASM) — el sharp prebuilt para Linux no
 * incluye de265, así que el pipeline de uploads lo usa en la rama HEIC
 * (apps/web/lib/storage.ts, 2026-08-05).
 */
declare module "heic-decode" {
  export interface HeicDecodeResult {
    width: number;
    height: number;
    /** Píxeles RGBA crudos (4 canales, width × height × 4 bytes). */
    data: Uint8ClampedArray;
  }
  function heicDecode(options: { buffer: Buffer }): Promise<HeicDecodeResult>;
  export default heicDecode;
}
