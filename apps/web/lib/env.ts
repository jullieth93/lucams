/*
 * Validación central de variables de entorno al arranque (fail-fast).
 *
 * Antes: un secreto faltante (CSRF_SECRET, DATABASE_URL, Wompi…) fallaba en runtime
 * durante una request cualquiera, no al bootear → se descubría en producción. Ahora
 * `register()` (instrumentation.ts) llama validateEnv() al iniciar el servidor:
 *   - CORE ausente (cualquier entorno) → throw: la config está rota, no arranques.
 *   - PROD_REQUIRED ausente en producción → throw: el sitio no debe vender sin
 *     pago/envío/email/anti-bot/crons configurados.
 *   - PROD_REQUIRED ausente en dev/preview → solo warn (no bloquea el desarrollo).
 *
 * Se salta durante el build (NEXT_PHASE) para no romper CI/preview builds sin secretos:
 * lo que importa es el arranque del SERVIDOR (dev restart o runtime de Vercel).
 */

import { z } from "zod";
import { logger } from "@/lib/logger";

// Vars que la app necesita SIEMPRE (dev, preview, prod). Sin ellas nada funciona.
const CoreEnv = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  CSRF_SECRET: z.string().min(1),
});

// Vars que SOLO son críticas en producción real (pago, envío, email, anti-bot, crons).
// En dev/preview su ausencia es aceptable (se avisa, no se bloquea).
const PROD_REQUIRED = [
  "NEXT_PUBLIC_SITE_URL",
  "WOMPI_PUBLIC_KEY",
  "WOMPI_PRIVATE_KEY",
  "WOMPI_EVENTS_SECRET",
  "WOMPI_INTEGRITY_SECRET",
  "AVEONLINE_USUARIO",
  "AVEONLINE_CLAVE",
  // Sin este secreto el webhook de Aveonline responde 503 y las órdenes nunca auto-transicionan
  // (SHIPPED/DELIVERED) ni disparan sus emails → fail-fast en prod para no romper el despacho en silencio.
  "AVEONLINE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_WA_NUMBER",
] as const;

export function validateEnv(): void {
  // No validar durante el build: CI/preview pueden construir sin secretos de runtime.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const core = CoreEnv.safeParse(process.env);
  if (!core.success) {
    const missing = Object.keys(z.flattenError(core.error).fieldErrors);
    throw new Error(
      `[env] Faltan variables CORE: ${missing.join(", ")}. La app no puede arrancar sin ellas. ` +
        `Revisa .env.local (dev) o las Environment Variables de Vercel (prod).`,
    );
  }

  const isProd = process.env.VERCEL_ENV === "production";
  const missingProd = PROD_REQUIRED.filter((k) => !(process.env[k] && process.env[k]!.length > 0));
  if (missingProd.length > 0) {
    if (isProd) {
      throw new Error(
        `[env] Faltan variables de PRODUCCIÓN: ${missingProd.join(", ")}. ` +
          `El sitio no debe arrancar en producción sin pago/envío/email/anti-bot/crons configurados.`,
      );
    }
    logger.warn(
      { event: "env.prod_vars_missing", missing: missingProd },
      "Variables de producción ausentes (OK en dev/preview, obligatorias al lanzar)",
    );
  }
}
