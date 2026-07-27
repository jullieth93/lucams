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

// Si la shell ya trae la flag (CI o un override manual), manda la shell.
const shellStoreMode = process.env.NEXT_PUBLIC_STORE_MODE;

const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
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
