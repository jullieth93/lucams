/**
 * Carga `.env.local` al inicio de los tests cuando existe.
 *
 * Esto permite correr `pnpm test` localmente sin exportar manualmente
 * DATABASE_URL y el resto de secretos de desarrollo. En CI no existe
 * `.env.local`; el setup lo ignora silenciosamente y los workflows se
 * encargan de inyectar sus propias variables (ver `.github/workflows/ci.yml`).
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkDestructiveAllowed } from "../../../packages/db/scripts/lib/env-guard.mjs";

// Si la shell ya trae la flag (CI o un override manual), manda la shell.
const shellStoreMode = process.env.NEXT_PUBLIC_STORE_MODE;

const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
}

/*
 * GUARD DURO anti-tests-en-PRD (revalidación 2026-10-20 — incidente de la madrugada:
 * una suite corrió con el env de PRD cargado y creó órdenes reales fantasmas
 * [LCM-2026-0002 consumido, emails reales enviados a *@lucams.test] que luego el
 * cleanup borró — retrocediendo la numeración de pedidos y reutilizando números).
 * La limpieza (global-teardown) YA tenía guarda, pero la CREACIÓN de datos ocurre
 * en los tests mismos: hay que abortar ANTES de que corra el primer test.
 * La suite NUNCA debe correr contra PRD — sin escape hatch acá (a diferencia de
 * los scripts one-shot, no existe una "suite de tests deliberada contra PRD").
 * En CI no hay .env.local y las vars apuntan al Postgres del runner: pasa limpio.
 */
{
  const guard = checkDestructiveAllowed();
  if (!guard.allowed || guard.bypassed) {
    throw new Error(
      `[setup-env] SUITE ABORTADA: las pruebas de vitest NO pueden correr contra este destino. ` +
        `${guard.reason || "destino bloqueado"} ` +
        `Apunta DATABASE_URL/DIRECT_URL al Supabase local (make db-local-start) o a STG.`,
    );
  }
}

/*
 * La suite corre en modo FULL por defecto. `.env.local` del día a día puede decir
 * `catalog` (Etapa 1) y eso apaga los servicios transaccionales vía stage-guard —
 * justo los que ejercitan los integration tests de orders/checkout/coupons. En CI
 * la var no existe y `lib/store-mode` ya cae a "full"; acá replicamos eso. Los
 * tests que dependen del modo (store-mode, stage-guard, admin-nav, env, manifest)
 * fijan la variable ellos mismos con imports frescos, así que no se ven afectados.
 */
if (shellStoreMode === undefined) {
  process.env.NEXT_PUBLIC_STORE_MODE = "full";
}
