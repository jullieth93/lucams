/*
 * getStudioTexts — resuelve SERVER-SIDE todos los textos CMS del Estudio (roadmap B1).
 *
 * A diferencia del resto del sitio (getCmsBlock key a key), acá son ~280 campos:
 * resolverlos uno a uno serían ~280 round-trips en la primera carga. Se hace UNA
 * sola query por prefijo `estudio.*` (misma selección que lib/cms.ts: kind BLOCK,
 * publicado, con su versión publicada) y se sobreescribe el DEFAULT campo a campo
 * vía STUDIO_TEXT_KEYS. Cualquier campo faltante o sin publicar, o la DB caída,
 * deja el default exacto pre-CMS (REGLA DE ORO).
 *
 * Cache: `unstable_cache` con tag global "cms" (publicar en /admin/contenido lo
 * invalida vía updateTag). El guard del invariante E469 replica el de lib/cms.ts
 * para que llamarlo fuera de un request de Next (scripts, pruebas manuales)
 * ejecute la query cruda en vez de reventar.
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { DEFAULT_STUDIO_TEXTS, STUDIO_TEXT_KEYS, type StudioTexts } from "./studio-texts";

async function fetchStudioBodies(): Promise<Record<string, string>> {
  try {
    const fields = await prisma.cmsField.findMany({
      where: {
        kind: "BLOCK",
        isPublished: true,
        deletedAt: null,
        key: { startsWith: "estudio." },
      },
      include: { publishedVersion: true },
    });
    const bodies: Record<string, string> = {};
    for (const f of fields) {
      if (f.publishedVersion) bodies[f.key] = f.publishedVersion.body;
    }
    return bodies;
  } catch {
    // DB inalcanzable (build con placeholder, red caída) → {} → defaults completos.
    return {};
  }
}

const cachedStudioBodies = unstable_cache(fetchStudioBodies, ["studio-texts"], {
  tags: ["cms"],
  revalidate: 3600,
});

async function loadBodiesSafe(): Promise<Record<string, string>> {
  try {
    return await cachedStudioBodies();
  } catch (err) {
    // Next 16 sin incrementalCache (fuera de un request/render) lanza el invariante
    // E469: ejecutar la query cruda (mismo guard que lib/cms.ts). Otros errores
    // también degradan a defaults — la página del Estudio nunca se rompe por CMS.
    const code = (err as { __NEXT_ERROR_CODE?: string } | null)?.__NEXT_ERROR_CODE;
    if (code === "E469" || (err instanceof Error && err.message.includes("incrementalCache"))) {
      return fetchStudioBodies();
    }
    return {};
  }
}

function setPath(target: Record<string, unknown>, path: string, value: string) {
  const [section, prop] = path.split(".");
  const bucket = target[section] as Record<string, string> | undefined;
  if (bucket && typeof bucket[prop] === "string") bucket[prop] = value;
}

export async function getStudioTexts(): Promise<StudioTexts> {
  const bodies = await loadBodiesSafe();
  // structuredClone: nunca mutar el DEFAULT compartido entre requests.
  const texts = structuredClone(DEFAULT_STUDIO_TEXTS) as StudioTexts;
  for (const [path, cmsKey] of Object.entries(STUDIO_TEXT_KEYS)) {
    const body = bodies[cmsKey];
    if (typeof body === "string" && body.length > 0) {
      setPath(texts as unknown as Record<string, unknown>, path, body);
    }
  }
  return texts;
}
