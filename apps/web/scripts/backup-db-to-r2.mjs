#!/usr/bin/env node
/*
 * Backup off-site de la base de datos a Cloudflare R2 (ADR-059, OPERATIONS.md).
 *
 * Qué hace:
 *   1. pg_dump (formato plano, --no-owner --no-privileges → restaurable en cualquier
 *      proyecto Supabase de testing para el DR drill #2) contra una conexión DIRECTA
 *      (no el pooler — pg_dump necesita una sesión larga).
 *   2. Comprime el dump con gzip.
 *   3. Lo cifra con gpg simétrico AES256 (A-3, auditoría 2026-08-24): el dump lleva
 *      PII (Ley 1581) y su confidencialidad no puede depender solo del ACL del
 *      bucket. La passphrase viaja por fd, NUNCA por argv/env del proceso gpg.
 *   4. Lo sube a R2 (S3-compatible) con una llave UTC ordenable (….sql.gz.gpg).
 *   5. Poda backups viejos según retención (conserva los N más nuevos).
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

/** Corre pg_dump y comprime su salida con gzip, devolviendo el .sql.gz en un Buffer. */
async function dumpAndGzip(connectionString) {
  const dump = spawn("pg_dump", [connectionString, "--no-owner", "--no-privileges"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const gzip = createGzip({ level: 9 });
  const chunks = [];
  let stderr = "";

  dump.stderr.on("data", (d) => {
    stderr += d.toString();
  });
  gzip.on("data", (c) => chunks.push(c));
  dump.stdout.pipe(gzip);

  const dumpDone = new Promise((resolve, reject) => {
    dump.on("error", (e) =>
      reject(e.code === "ENOENT" ? new Error("pg_dump no está instalado (se requiere v17)") : e),
    );
    dump.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pg_dump salió con código ${code}: ${stderr.trim().slice(0, 500)}`)),
    );
  });
  const gzipDone = new Promise((resolve, reject) => {
    gzip.on("end", resolve);
    gzip.on("error", reject);
  });

  await Promise.all([dumpDone, gzipDone]);
  return Buffer.concat(chunks);
}

/**
 * Cifra `data` con gpg simétrico AES256 (streaming stdin → stdout).
 * La passphrase entra por el fd 3 (NO por argv ni por el entorno, donde sería
 * visible en /proc o en logs) y los datos por stdin — por eso NO se usa
 * `--passphrase-fd 0`: el fd 0 ya lo ocupa el stream de datos.
 */
function gpgEncrypt(data, passphrase) {
  return new Promise((resolve, reject) => {
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
    const chunks = [];
    let stderr = "";
    gpg.stdout.on("data", (c) => chunks.push(c));
    gpg.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    gpg.on("error", (e) =>
      reject(e.code === "ENOENT" ? new Error("gpg no está instalado en este ambiente") : e),
    );
    gpg.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`gpg salió con código ${code}: ${stderr.trim().slice(0, 500)}`)),
    );
    gpg.stdio[3].end(`${passphrase}\n`);
    gpg.stdin.end(data);
  });
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

  // 1-2. Dump + gzip.
  console.log("→ pg_dump + gzip…");
  const gzipped = await dumpAndGzip(conn);

  // 3. Cifrar (gpg simétrico AES256) antes de que el dump salga de esta máquina.
  console.log("→ cifrando con gpg (AES256)…");
  const body = await gpgEncrypt(gzipped, gpgPassphrase);
  const mb = (body.length / (1024 * 1024)).toFixed(2);
  const key = buildBackupKey(new Date(), prefix);

  // 4. Subir.
  console.log(`→ subiendo ${key} (${mb} MB) a r2://${bucket}…`);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/pgp-encrypted",
      }),
    );
  } catch (err) {
    throw explainR2ConnectError(err, accountId);
  }

  // 5. Podar backups viejos (retención).
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
