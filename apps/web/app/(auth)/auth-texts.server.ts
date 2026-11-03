/*
 * getAuthTexts — capa 3 del CMS v2: el copy funcional de formularios de
 * autenticación vive tipado en `auth-texts.ts` (DEFAULT_AUTH_TEXTS), sin viajes
 * a base de datos.
 */

import "server-only";
import { DEFAULT_AUTH_TEXTS, type AuthTexts } from "./auth-texts";

export async function getAuthTexts(): Promise<AuthTexts> {
  return DEFAULT_AUTH_TEXTS;
}
