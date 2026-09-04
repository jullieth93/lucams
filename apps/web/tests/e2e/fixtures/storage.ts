/*
 * Storage E2E — imágenes generadas por corrida + limpieza de objetos
 * (docs/TESTING.md). Bucket real: customer-uploads.
 *
 * Las imágenes se generan con sharp (ya es dep de apps/web) — nada de archivos
 * binarios commiteados salvo el fixture HEIC existente (tests/fixtures/).
 * Todo objeto subido lleva el RUN en el path y se borra con removeByPrefix().
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { strip } from "../_setup/env";

export const UPLOADS_BUCKET = "customer-uploads";

let client: SupabaseClient | null = null;

function storage(): SupabaseClient {
  if (!client) {
    client = createClient(
      strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      strip(process.env.SUPABASE_SECRET_KEY)!,
      { auth: { persistSession: false } },
    );
  }
  return client;
}

/** PNG/JPEG/WebP de prueba generado en memoria (color y tamaño variables). */
export async function makeImage(
  format: "jpeg" | "png" | "webp",
  width = 800,
  height = 600,
): Promise<Buffer> {
  const img = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 90, b: 160 },
    },
  });
  if (format === "jpeg") return img.jpeg({ quality: 85 }).toBuffer();
  if (format === "webp") return img.webp({ quality: 85 }).toBuffer();
  return img.png().toBuffer();
}

/** Sube un buffer al bucket de uploads con prefijo de corrida. Devuelve el path. */
export async function uploadRunObject(
  run: string,
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const path = `${run}/${filename}`;
  const { error } = await storage().storage.from(UPLOADS_BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return path;
}

/** Borra TODOS los objetos bajo el prefijo de la corrida (teardown). */
export async function removeRunObjects(run: string): Promise<number> {
  const bucket = storage().storage.from(UPLOADS_BUCKET);
  const { data, error } = await bucket.list(run, { limit: 1000 });
  if (error || !data || data.length === 0) return 0;
  const paths = data.map((o) => `${run}/${o.name}`);
  const { error: rmErr } = await bucket.remove(paths);
  if (rmErr) throw new Error(`remove ${run}: ${rmErr.message}`);
  return paths.length;
}
