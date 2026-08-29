#!/usr/bin/env node
/*
 * DR drill #2 — verifica que el backup de R2 es RESTAURABLE de verdad (ADR-059).
 *
 * Por qué existe: un backup que nunca se restaura no es un backup, es una
 * esperanza. Este script baja el dump MÁS NUEVO del bucket R2, lo DESCIFRA
 * (gpg — los backups se suben cifrados con AES256 desde 2026-08-29, A-3 de la
 * auditoría 2026-08-24), lo restaura en un Postgres vacío (el service container
 * del runner, imagen supabase/postgres — el mismo engine de prod) y verifica
 * conteos de tablas clave. Si el dump no sirve, el workflow sale ROJO el día
 * tranquilo, no el día del desastre.
 *
 * Corre desde .github/workflows/dr-drill.yml (mensual + manual). NUNCA imprime
 * secretos. Env requerido: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, BACKUP_GPG_PASSPHRASE (la misma del backup — sin ella
 * no se puede descifrar y el drill falla de inmediato). Opcional:
 * BACKUP_PREFIX (default "db"), DRILL_DATABASE_URL (default postgres local del
 * runner), DRILL_MIN_PRODUCTS (default 100 — umbral de sanidad del catálogo
 * restaurado).
 */

import { spawn } from "node:child_process";
import { createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { BACKUP_KEY_RE, normalizeR2AccountId, explainR2ConnectError } from "./backup-lib.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  throw new Error(`Falta la variable de entorno ${name}`);
}

/** Corre un binario y devuelve { code, stdout, stderr } sin lanzar. */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  const accountId = normalizeR2AccountId(requireEnv("R2_ACCOUNT_ID"));
  const bucket = requireEnv("R2_BUCKET");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  // Fail-closed (A-3): sin la passphrase no se puede descifrar el dump.
  const gpgPassphrase = requireEnv("BACKUP_GPG_PASSPHRASE");
  const prefix = (process.env.BACKUP_PREFIX || "db").replace(/\/+$/, "");
  const drillUrl =
    process.env.DRILL_DATABASE_URL ||
    "postgresql://supabase_admin:postgres@localhost:5432/postgres";
  const minProducts = Number.parseInt(process.env.DRILL_MIN_PRODUCTS || "100", 10);

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  // 1. Localizar el dump cifrado MÁS NUEVO del bucket. Solo entran llaves .gpg:
  //    los backups legacy sin cifrar (anteriores a 2026-08-29) ya no son
  //    candidatos del drill — la retención de backup-db-to-r2.mjs los poda.
  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/` }),
  );
  const keys = (listed.Contents || [])
    .map((o) => o.Key)
    .filter((k) => k && k.endsWith(".gpg") && BACKUP_KEY_RE.test(k))
    .sort();
  if (keys.length === 0)
    throw new Error(`No hay backups cifrados (.sql.gz.gpg) en r2://${bucket}/${prefix}/`);
  const latest = keys[keys.length - 1];
  console.log(`→ dump a restaurar: ${latest} (de ${keys.length} disponibles)`);

  // 2. Descargar + descifrar (gpg) + descomprimir. La passphrase entra por el
  //    fd 3 (nunca por argv/env) y el stream cifrado por stdin; gpg -d escribe
  //    el gzip en claro a stdout y de ahí al gunzip — nada toca disco sin cifrar.
  let dump;
  try {
    dump = await client.send(new GetObjectCommand({ Bucket: bucket, Key: latest }));
  } catch (err) {
    throw explainR2ConnectError(err, accountId);
  }
  const gpg = spawn("gpg", ["-d", "--batch", "--yes", "--passphrase-fd", "3", "-o", "-"], {
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });
  let gpgStderr = "";
  gpg.stderr.on("data", (d) => {
    gpgStderr += d.toString();
  });
  const gpgDone = new Promise((resolve, reject) => {
    gpg.on("error", (e) =>
      reject(e.code === "ENOENT" ? new Error("gpg no está instalado en este ambiente") : e),
    );
    gpg.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `gpg -d salió con código ${code} (¿BACKUP_GPG_PASSPHRASE incorrecta?): ` +
                gpgStderr.trim().slice(0, 300),
            ),
          ),
    );
  });
  const gunzip = createGunzip();
  const sqlPromise = (async () => {
    const chunks = [];
    for await (const chunk of gunzip) chunks.push(chunk);
    return Buffer.concat(chunks);
  })();
  dump.Body.pipe(gpg.stdin);
  gpg.stdio[3].end(`${gpgPassphrase}\n`);
  gpg.stdout.pipe(gunzip);
  let sql;
  try {
    sql = (await Promise.all([sqlPromise, gpgDone]))[0];
  } catch (err) {
    throw new Error(
      `No se pudo descifrar/descomprimir ${latest} (¿BACKUP_GPG_PASSPHRASE incorrecta ` +
        `o dump sin cifrar?): ${err.message}`,
    );
  }
  console.log(
    `→ descargado, descifrado y descomprimido (${(sql.length / 1024 / 1024).toFixed(2)} MB de SQL)`,
  );

  // 3. Restaurar (vía archivo temporal — el SQL no cabe en argv y psql lee de
  //    archivo con -f).
  //    Lecciones del primer drill (2026-08-05, verificado con el dump real):
  //    - pg_cron SOLO puede crearse en la DB "postgres" del engine supabase —
  //      en una DB scratch el COPY cron.job revienta y, como psql sigue, las
  //      filas de datos se parsean como SQL y el resto del dump no carga nada.
  //    - Los schemas auth/storage/realtime exigen el rol supabase_admin (el
  //      rol postgres del contenedor no tiene permisos sobre ellos).
  //    Por eso el restore va a la DB "postgres" del contenedor fresco (que ya
  //    trae pg_cron disponible) con el rol supabase_admin.
  //    (Re-auditoría 2026-08-05: restore SIN shell — psql va por spawn + argv,
  //    nunca interpolado en un `bash -c`, y el dump temporal se escribe 0600
  //    en un dir propio. El conteo/top de errores se hace en JS.)
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { join: joinPath } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const tmpDir = mkdtempSync(joinPath(tmpdir(), "dr-drill-"));
  const tmp = joinPath(tmpDir, "dump.sql");
  writeFileSync(tmp, sql, { mode: 0o600 });
  const restoreRun = await run("psql", [drillUrl, "-v", "ON_ERROR_STOP=0", "-q", "-f", tmp]);
  rmSync(tmpDir, { recursive: true, force: true });
  // Errores esperados (ruido tolerable de un dump Supabase --no-owner en un
  // contenedor scratch: FKs de auth/*, policies que referencian roles de la
  // nube). Se cuentan Y se muestran las primeras para no volar a ciegas.
  // (Equivale al viejo `grep -c ^ERROR` + `sort | uniq -c | sort -rn | head -6`.)
  const errorLines = `${restoreRun.stdout}\n${restoreRun.stderr}`
    .split("\n")
    .filter((l) => l.startsWith("ERROR"));
  const errors = errorLines.length;
  if (errors > 0) {
    const freq = new Map();
    for (const l of errorLines) freq.set(l, (freq.get(l) ?? 0) + 1);
    const topErrors = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([line, count]) => `    ${count} ${line}`)
      .join("\n");
    console.log(`→ errores SQL durante restore: ${errors} (top:)\n${topErrors}`);
  }

  // 4. Verificar conteos de tablas clave.
  const tables = ["Product", "Category", "OcasionTag", "CmsField", "Order", "Customer"];
  const counts = {};
  for (const t of tables) {
    const r = await run("psql", [drillUrl, "-A", "-t", "-c", `SELECT count(*) FROM "${t}";`]);
    counts[t] = Number.parseInt(r.stdout.trim(), 10);
    if (Number.isNaN(counts[t])) {
      throw new Error(
        `Tabla "${t}" no existe tras el restore — el dump no restauró el esquema (${r.stderr.trim()})`,
      );
    }
  }
  console.log(
    "→ conteos restaurados: " +
      tables.map((t) => `${t}=${counts[t]}`).join(" · ") +
      ` · errores SQL durante restore: ${errors}`,
  );

  if (counts.Product < minProducts) {
    throw new Error(
      `Sanidad fallida: Product=${counts.Product} < umbral ${minProducts}. El dump más nuevo NO contiene el catálogo esperado.`,
    );
  }
  console.log(`✓ DR drill OK: ${latest} restaura y el catálogo vuelve (Product ≥ ${minProducts}).`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`✗ DR drill FALLÓ: ${err.message}`);
    process.exit(1);
  });
}
