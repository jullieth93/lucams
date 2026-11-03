/*
 * getAccountTexts — devuelve el diccionario tipado de Capa 3 de /mi-cuenta
 * (`DEFAULT_ACCOUNT_TEXTS`). La mecánica de Puntos Lucams se interpola en vivo
 * con las tasas configuradas en `/admin/fidelizacion` (`getLoyaltySettings`),
 * evitando que un texto manual en CMS contradiga la regla económica vigente.
 */

import "server-only";
import { DEFAULT_ACCOUNT_TEXTS, type AccountTexts } from "./account-texts";

export async function getAccountTexts(): Promise<AccountTexts> {
  return DEFAULT_ACCOUNT_TEXTS;
}
