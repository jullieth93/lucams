/*
 * getStudioTexts — capa 3 del CMS v2: el copy funcional del Estudio vive 100 %
 * tipado en `studio-texts.ts` (DEFAULT_STUDIO_TEXTS), sin viajes a Postgres ni
 * serialización duplicada en el payload RSC. Se conserva este helper por
 * compatibilidad con llamadas server-side.
 */

import "server-only";
import { DEFAULT_STUDIO_TEXTS, type StudioTexts } from "./studio-texts";

export async function getStudioTexts(): Promise<StudioTexts> {
  return DEFAULT_STUDIO_TEXTS;
}
