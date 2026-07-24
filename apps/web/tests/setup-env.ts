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

const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
}
