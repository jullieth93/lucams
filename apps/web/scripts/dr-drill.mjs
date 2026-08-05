#!/usr/bin/env node
/*
 * DR drill #2 — verifica que el backup de R2 es RESTAURABLE de verdad (ADR-059).
 *
 * Por qué existe: un backup que nunca se restaura no es un backup, es una
 * esperanza. Este script baja el dump MÁS NUEVO del bucket R2, lo restaura en
 * un Postgres vacío (el service container del runner, imagen supabase/postgres
 * — el mismo engine de prod) y verifica conteos de tablas clave. Si el dump no
 * sirve, el workflow sale ROJO el día tranquilo, no el día del desastre.
 *
 * Corre desde .github/workflows/dr-drill.yml (mensual + manual). NUNCA imprime
 * secretos. Env requerido: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY. Opcional: BACKUP_PREFIX (default "db"),
 * DRILL_DATABASE_URL (default postgres local del runner), DRILL_MIN_PRODUCTS
 * (default 100 — umbral de sanidad del catálogo restaurado).
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
  const prefix = (process.env.BACKUP_PREFIX || "db").replace(/\/+$/, "");
  const drillUrl =
    process.env.DRILL_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/drill";
  const minProducts = Number.parseInt(process.env.DRILL_MIN_PRODUCTS || "100", 10);

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  // 1. Localizar el dump MÁS NUEVO del bucket.
  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/` }),
  );
  const keys = (listed.Contents || [])
    .map((o) => o.Key)
    .filter((k) => k && BACKUP_KEY_RE.test(k))
    .sort();
  if (keys.length === 0)
    throw new Error(`No hay backups con forma de dump en r2://${bucket}/${prefix}/`);
  const latest = keys[keys.length - 1];
  console.log(`→ dump a restaurar: ${latest} (de ${keys.length} disponibles)`);

  // 2. Descargar + descomprimir.
  let dump;
  try {
    dump = await client.send(new GetObjectCommand({ Bucket: bucket, Key: latest }));
  } catch (err) {
    throw explainR2ConnectError(err, accountId);
  }
  const chunks = [];
  const gunzip = createGunzip();
  dump.Body.pipe(gunzip);
  for await (const chunk of gunzip) chunks.push(chunk);
  const sql = Buffer.concat(chunks);
  console.log(`→ descargado y descomprimido (${(sql.length / 1024 / 1024).toFixed(2)} MB de SQL)`);

  // 3. Recrear la DB de prueba y restaurar (vía archivo temporal — el SQL no
  //    cabe en argv y psql lee de archivo con -f).
  const adminUrl = drillUrl.replace(/\/[^/]+$/, "/postgres");
  await run("psql", [adminUrl, "-v", "ON_ERROR_STOP=1", "-c", "DROP DATABASE IF EXISTS drill;"]);
  const created = await run("psql", [
    adminUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "CREATE DATABASE drill;",
  ]);
  if (created.code !== 0) throw new Error(`No se pudo crear la DB drill: ${created.stderr}`);

  // El dump viene de Supabase (--no-owner --no-privileges): contra el engine
  // supabase/postgres del runner restaura limpio; contamos errores por si hay
  // incompatibilidades parciales (objetos de extensiones ajenas, etc.).
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const tmp = `/tmp/dr-drill-${Date.now()}.sql`;
  writeFileSync(tmp, sql);
  const restoreRun = await run("bash", [
    "-c",
    `psql "${drillUrl}" -v ON_ERROR_STOP=0 -q -f "${tmp}" 2>&1 | grep -c ERROR || true`,
  ]);
  unlinkSync(tmp);
  const errors = Number.parseInt(restoreRun.stdout.trim() || "0", 10) || 0;

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
