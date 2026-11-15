/*
 * Validación central de variables de entorno al arranque (fail-fast).
 *
 * `register()` (instrumentation.ts) llama validateEnv() al iniciar el servidor:
 *   - CORE ausente (cualquier entorno) → throw: la config está rota, no arranques.
 *   - PROD_REQUIRED y FULL_MODE_REQUIRED ausentes en producción → throw.
 *   - Variables de producción ausentes en dev/preview → solo warn.
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

// Vars que SOLO son críticas en producción real (email, anti-bot, crons, WhatsApp).
// En dev/preview su ausencia es aceptable (se avisa, no se bloquea).
const PROD_REQUIRED = [
  "NEXT_PUBLIC_SITE_URL",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_WA_NUMBER",
] as const;

const FULL_MODE_REQUIRED = [
  "WOMPI_PUBLIC_KEY",
  "WOMPI_PRIVATE_KEY",
  "WOMPI_EVENTS_SECRET",
  "WOMPI_INTEGRITY_SECRET",
  "AVEONLINE_USUARIO",
  "AVEONLINE_CLAVE",
  "AVEONLINE_WEBHOOK_SECRET",
  "GEMINI_API_KEY",
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
  const required = [...PROD_REQUIRED, ...FULL_MODE_REQUIRED];
  const missingProd = required.filter((k) => !(process.env[k] && process.env[k]!.length > 0));
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

  // WOMPI_DISABLE_TIMESTAMP_CHECK apaga el anti-replay (ventana de timestamp) del webhook de
  // Wompi — es un flag SOLO para debugging local. En producción DEBE estar apagado; si quedó
  // en "true" el webhook aceptaría eventos re-enviados/forjados. Fail-fast (ADR-062 P1).
  if (isProd && process.env.WOMPI_DISABLE_TIMESTAMP_CHECK === "true") {
    throw new Error(
      "[env] WOMPI_DISABLE_TIMESTAMP_CHECK=true en producción: apaga el anti-replay del webhook " +
        "de Wompi. Quítalo o ponlo en false antes de arrancar.",
    );
  }

  // SEC-06: el canal legacy `?secret=` en /api/webhooks/aveonline fue retirado definitivamente.
  // Si alguien configura AVEONLINE_ALLOW_QUERY_SECRET=true en producción creyendo que aún
  // habilita query-string auth, fallamos cerrado en el arranque en lugar de ignorarlo en silencio.
  if (isProd && process.env.AVEONLINE_ALLOW_QUERY_SECRET === "true") {
    throw new Error(
      "[env] AVEONLINE_ALLOW_QUERY_SECRET=true está prohibido en producción (SEC-06): " +
        "el webhook de Aveonline solo acepta x-aveonline-secret o payload.token.",
    );
  }
}
