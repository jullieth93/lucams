/*
 * getCheckoutTexts — combina DEFAULT_CHECKOUT_TEXTS (Capa 3: formularios,
 * labels, errores) con los textos comerciales de Capa 2 declarados en
 * CHECKOUT_TEXT_KEYS, leídos desde el snapshot unificado de `lib/cms.ts` e
 * interpolados con `resolveCmsTokens`.
 */

import "server-only";
import { getCmsBlock } from "@/lib/cms";
import { resolveCmsTokens } from "@/lib/cms-tokens";
import { CHECKOUT_TEXT_KEYS, DEFAULT_CHECKOUT_TEXTS, type CheckoutTexts } from "./checkout-texts";

function setPath(target: Record<string, unknown>, path: string, value: string) {
  const [section, prop] = path.split(".");
  const bucket = target[section] as Record<string, string> | undefined;
  if (bucket && typeof bucket[prop] === "string") bucket[prop] = value;
}

export async function getCheckoutTexts(): Promise<CheckoutTexts> {
  const texts = structuredClone(DEFAULT_CHECKOUT_TEXTS) as CheckoutTexts;
  const entries = Object.entries(CHECKOUT_TEXT_KEYS);
  const resolved = await Promise.all(
    entries.map(async ([path, cmsKey]) => {
      const block = await getCmsBlock(cmsKey);
      if (!block?.body) return null;
      return [path, await resolveCmsTokens(block.body)] as const;
    }),
  );
  for (const item of resolved) {
    if (item && item[1].length > 0) {
      setPath(texts as unknown as Record<string, unknown>, item[0], item[1]);
    }
  }
  return texts;
}
