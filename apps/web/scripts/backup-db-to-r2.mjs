#!/usr/bin/env node
/*
 * Backup off-site de la base de datos a Cloudflare R2 (ADR-059, OPERATIONS.md).
 *
 * Qué hace:
 *   1. pg_dump (formato plano, --no-owner --no-privileges → restaurable en cualquier
 *      proyecto Supabase de testing para el DR drill #2) contra una conexión DIRECTA
 *      (no el pooler — pg_dump necesita una sesión larga).
 *   2. Streaming directo pg_dump → gzip -9 → gpg simétrico AES256 (A-3, auditoría
 *      2026-08-24; Fase 4 · #17: sin buffering en memoria para evitar OOM al crecer
 *      el dump) → archivo temporal en disco con modo 0600 (solo texto cifrado toca
 *      disco; limpieza garantizada en `finally`).
 *      La passphrase viaja por fd 3, NUNCA por argv/env del proceso gpg.
 *   3. Lo sube en streaming a R2 (S3-compatible) con `ContentLength` conocido y
 *      una llave UTC ordenable (….sql.gz.gpg).
 *   4. Poda backups viejos según retención (conserva los N más nuevos).
 *
 * Se corre desde un workflow programado de GitHub Actions (diario). Requiere pg_dump
 * 17 (el servidor Supabase es PG17; pg_dump < 17 rechaza el volcado) → el workflow
 * instala postgresql-client-17. Local: `pnpm --filter web db:backup` con el entorno
 * cargado (necesita pg_dump 17 local).
 *
 * NUNCA imprime secretos. Env requerido:
 *   BACKUP_DATABASE_URL (o DIRECT_URL): conexión DIRECTA a Postgres (con password).
 *   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
 *   BACKUP_GPG_PASSPHRASE: passphrase del cifrado simétrico (sin ella el script
 *   falla de inmediato — fail-closed a propósito).
 * Opcional: BACKUP_PREFIX (default "db"), BACKUP_KEEP (default 8; el workflow
 * diario fija 30 ≈ 1 mes de diarios).
 */

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { pathToFileURL } from "node:url";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import {
  buildBackupKey,
  selectStaleKeys,
  normalizeR2AccountId,
  explainR2ConnectError,
} from "./backup-lib.mjs";

function requireEnv(name, ...fallbacks) {
  for (const key of [name, ...fallbacks]) {
    const v = process.env[key];
    if (v && v.trim()) return v.trim();
  }
  throw new Error(
    `Falta la variable de entorno ${name}${fallbacks.length ? ` (o ${fallbacks.join("/")})` : ""}`,
  );
}

/**
 * Canaliza `sourceStream` → gzip (-9) → gpg AES256 (passphrase por fd 3, nunca
 * argv/env) → archivo `outPath` (modo 0600). Solo el texto cifrado toca disco y
 * el uso de RAM permanece plano sin importar el tamaño del dump (Fase 4 · #17).
 */
export async function streamGzipEncryptToFile(sourceStream, passphrase, outPath) {
  const gpg = spawn(
    "gpg",
    [
      "--symmetric",
      "--cipher-algo",
      "AES256",
      "--batch",
      "--yes",
      "--passphrase-fd",
      "3",
      "-o",
      "-",
    ],
    { stdio: ["pipe", "pipe", "pipe", "pipe"] },
  );
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
        : reject(new Error(`gpg salió con código ${code}: ${gpgStderr.trim().slice(0, 500)}`)),
    );
  });

  // Evita crash por EPIPE/EBADF no capturado en fd 3 o stdin si gpg sale antes
  // de leerlos (garantiza que withTempBackupDir siempre ejecute su `finally`).
  gpg.stdio[3].on("error", () => {});
  gpg.stdin.on("error", () => {});
  gpg.stdio[3].end(`${passphrase}\n`);

  const inDone = pipeline(sourceStream, createGzip({ level: 9 }), gpg.stdin);
  const outDone = pipeline(gpg.stdout, createWriteStream(outPath, { mode: 0o600 }));
  try {
    await Promise.all([gpgDone, inDone, outDone]);
  } catch (err) {
    if (gpg.exitCode === null) gpg.kill("SIGTERM");
    throw err;
  }
}

/**
 * Ejecuta `pg_dump` y canaliza su stdout directamente por gzip → gpg → archivo
 * temporal cifrado `outPath` (modo 0600), sin acumular el volcado en RAM.
 */
async function dumpGzipEncryptToFile(connectionString, passphrase, outPath) {
  const dump = spawn("pg_dump", [connectionString, "--no-owner", "--no-privileges"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let dumpStderr = "";
  dump.stderr.on("data", (d) => {
    dumpStderr += d.toString();
  });

  const dumpDone = new Promise((resolve, reject) => {
    dump.on("error", (e) =>
      reject(e.code === "ENOENT" ? new Error("pg_dump no está instalado (se requiere v17)") : e),
    );
    dump.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pg_dump salió con código ${code}: ${dumpStderr.trim().slice(0, 500)}`)),
    );
  });

  try {
    await Promise.all([dumpDone, streamGzipEncryptToFile(dump.stdout, passphrase, outPath)]);
  } catch (err) {
    if (dump.exitCode === null) dump.kill("SIGTERM");
    throw err;
  }
}

/**
 * Ejecuta una operación con un directorio temporal privado que siempre se
 * limpia en `finally`, incluso ante errores o abortos (Fase 4 · #17).
 */
export async function withTempBackupDir(prefix, fn) {
  const tmpDir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await fn(tmpDir);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  const conn = requireEnv("BACKUP_DATABASE_URL", "DIRECT_URL");
  const accountId = normalizeR2AccountId(requireEnv("R2_ACCOUNT_ID"));
  const bucket = requireEnv("R2_BUCKET");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  // Fail-closed (A-3): sin passphrase no hay backup — un dump sin cifrar en R2
  // es peor que un correo de error del workflow.
  const gpgPassphrase = requireEnv("BACKUP_GPG_PASSPHRASE");
  const prefix = (process.env.BACKUP_PREFIX || "db").trim();
  const keep = Number.parseInt(process.env.BACKUP_KEEP || "8", 10);

  // Sin exponer el id (GitHub lo enmascara igual): basta la FORMA para diagnosticar un valor mal
  // copiado sin tener que leer el secreto.
  console.log(
    `→ endpoint R2: <account-id de ${accountId.length} caracteres>.r2.cloudflarestorage.com`,
  );

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const { key, mb } = await withTempBackupDir("db-backup-", async (tmpDir) => {
    const tmpPath = join(tmpDir, "dump.sql.gz.gpg");

    // 1-2. Streaming directo: pg_dump → gzip -9 → gpg AES256 → archivo cifrado 0600.
    console.log("→ pg_dump + gzip + gpg (AES256) en streaming a disco temporal…");
    await dumpGzipEncryptToFile(conn, gpgPassphrase, tmpPath);

    const { size: encryptedBytes } = await stat(tmpPath);
    if (encryptedBytes <= 0) {
      throw new Error("El archivo cifrado del backup quedó vacío (0 bytes) — abortado.");
    }
    const sizeMb = (encryptedBytes / (1024 * 1024)).toFixed(2);
    const objectKey = buildBackupKey(new Date(), prefix);

    // 3. Subir en streaming con ContentLength exacto.
    console.log(`→ subiendo ${objectKey} (${sizeMb} MB) a r2://${bucket}…`);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: createReadStream(tmpPath),
          ContentLength: encryptedBytes,
          ContentType: "application/pgp-encrypted",
        }),
      );
    } catch (err) {
      throw explainR2ConnectError(err, accountId);
    }
    return { key: objectKey, mb: sizeMb };
  });

  // 4. Podar backups viejos (retención).
  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix.replace(/\/+$/, "")}/` }),
  );
  const keys = (listed.Contents || []).map((o) => o.Key).filter(Boolean);
  const stale = selectStaleKeys(keys, keep);
  if (stale.length > 0) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: stale.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  console.log(
    `✓ backup listo: ${key} (${mb} MB). Retención: conservados ${Math.min(keys.length + 1, keep)}, podados ${stale.length}.`,
  );
}

// Sólo ejecuta si se invoca directamente (no al importarlo en tests).
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`✗ backup falló: ${err.message}`);
    process.exit(1);
  });
}
