/*
 * Validación central de variables de entorno al arranque (fail-fast).
 *
 * Antes: un secreto faltante (CSRF_SECRET, DATABASE_URL, Wompi…) fallaba en runtime
 * durante una request cualquiera, no al bootear → se descubría en producción. Ahora
 * `register()` (instrumentation.ts) llama validateEnv() al iniciar el servidor:
 *   - CORE ausente (cualquier entorno) → throw: la config está rota, no arranques.
 *   - PROD_REQUIRED ausente en producción → throw: el sitio no debe vender sin
 *     email/anti-bot/crons configurados.
 *   - FULL_MODE_REQUIRED (Wompi/Aveonline/Gemini) ausente en producción → throw
 *     SOLO en modo tienda full. En modo catálogo (NEXT_PUBLIC_STORE_MODE=catalog,
 *     Etapa 1) no aplican: la tienda vende por cotización WhatsApp, sin pago en
 *     línea, sin envíos integrados y sin IA.
 *   - PROD_REQUIRED ausente en dev/preview → solo warn (no bloquea el desarrollo).
 *
 * Se salta durante el build (NEXT_PHASE) para no romper CI/preview builds sin secretos:
 * lo que importa es el arranque del SERVIDOR (dev restart o runtime de Vercel).
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { isCatalogMode } from "@/lib/store-mode";

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
  "EMAIL_FROM",
  // El From vive en mail.lucamsshop.com (subdominio de envío, sin buzón). Sin Reply-To al dominio
  // principal, toda respuesta de un cliente a un correo transaccional se pierde → fail-fast en prod.
  "EMAIL_REPLY_TO",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_WA_NUMBER",
] as const;

// Vars que SOLO aplican en modo tienda FULL (Etapa 2): pasarela Wompi, courier
// Aveonline e IA Gemini. En modo catálogo (NEXT_PUBLIC_STORE_MODE=catalog) la
// tienda sale SIN pagos en línea, SIN envíos integrados y SIN IA
// (docs/PLAN_SALIDA_PRODUCCION.md) → exigirlas bloquearía el arranque de prod
// de la Etapa 1 sin necesidad.
const FULL_MODE_REQUIRED = [
  "WOMPI_PUBLIC_KEY",
  "WOMPI_PRIVATE_KEY",
  "WOMPI_EVENTS_SECRET",
  "WOMPI_INTEGRITY_SECRET",
  "AVEONLINE_USUARIO",
  "AVEONLINE_CLAVE",
  // Sin este secreto el webhook de Aveonline responde 503 y las órdenes nunca auto-transicionan
  // (SHIPPED/DELIVERED) ni disparan sus emails → fail-fast en prod para no romper el despacho en silencio.
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

  // El modo de tienda debe ser EXPLÍCITO en producción (auditoría 2026-07-21, hallazgo del flag).
  // `readStoreMode()` cae a "full" ante ausencia o typo — un default deliberado para que un error
  // de configuración nunca apague el checkout de una tienda que sí vende. Pero ese mismo default
  // hace que borrar la variable publique en silencio toda la superficie transaccional. Con la
  // variable declarada a la fuerza, ninguno de los dos modos puede activarse por accidente: el
  // valor tiene que estar escrito.
  if (isProd) {
    const raw = process.env.NEXT_PUBLIC_STORE_MODE;
    if (raw !== "catalog" && raw !== "full") {
      throw new Error(
        `[env] NEXT_PUBLIC_STORE_MODE debe valer exactamente "catalog" o "full" en producción ` +
          `(recibido: ${raw === undefined ? "ausente" : `"${raw}"`}). Sin un valor explícito la app ` +
          `asumiría "full" y habilitaría pagos y envíos sin que nadie lo haya decidido.`,
      );
    }
  }

  // Modo catálogo (Etapa 1): NO se exigen las vars de pago/envío/IA — la tienda
  // vende por cotización WhatsApp sin Wompi/Aveonline/Gemini. El resto (email,
  // Turnstile, crons, WA) sigue siendo obligatorio en prod.
  const required = isCatalogMode() ? PROD_REQUIRED : [...PROD_REQUIRED, ...FULL_MODE_REQUIRED];
  const missingProd = required.filter((k) => !(process.env[k] && process.env[k]!.length > 0));
  if (missingProd.length > 0) {
    if (isProd) {
      throw new Error(
        `[env] Faltan variables de PRODUCCIÓN: ${missingProd.join(", ")}. ` +
          (isCatalogMode()
            ? `El sitio (modo catálogo) no debe arrancar en producción sin email/anti-bot/crons/WhatsApp configurados.`
            : `El sitio no debe arrancar en producción sin pago/envío/email/anti-bot/crons configurados.`),
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
}
