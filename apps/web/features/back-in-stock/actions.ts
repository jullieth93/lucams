"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { subscribeBackInStock } from "./service";

const Schema = z.object({
  productId: z.string().min(1),
  email: z.email().max(254).trim().toLowerCase().optional(),
});

type Result = { ok: true } | { ok: false; message: string };

/**
 * Suscribe un email a "avísame cuando vuelva" para un producto agotado. Público (anónimo o
 * logueado). Rate-limit por IP (anti-abuso). Para logueados usa su email si no se pasó.
 */
export async function subscribeBackInStockAction(input: {
  productId: string;
  email?: string;
}): Promise<Result> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos." };
  }

  const ip = getClientIp(await headers());
  const { allowed } = await rateLimit(`back_in_stock:${ip}`, 20, 3600); // 20/hora por IP
  if (!allowed) {
    return { ok: false, message: "Demasiadas solicitudes. Intenta más tarde." };
  }

  const customer = await getCurrentCustomer();
  const email = parsed.data.email ?? customer?.customer.email;
  if (!email) {
    return { ok: false, message: "Déjanos tu correo para avisarte." };
  }

  const res = await subscribeBackInStock(
    parsed.data.productId,
    email,
    customer?.customer.id ?? null,
  );
  if (!res.ok) {
    return {
      ok: false,
      message:
        res.reason === "in_stock" ? "¡Ya está disponible!" : "No pudimos registrar tu aviso.",
    };
  }
  return { ok: true };
}
