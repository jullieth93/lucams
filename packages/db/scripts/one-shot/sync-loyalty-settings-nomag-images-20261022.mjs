#!/usr/bin/env node
/*
 * sync-loyalty-settings-nomag-images-20261022.mjs — cierra las dos derivas de
 * contenido detectadas por la homologación STG↔PRD del 2026-10-22:
 *
 *   1. SETTINGS global/comercio (CmsField kind SETTING): las 11 claves
 *      LOYALTY_* / REFERRAL_* / SHIPPING_DISABLED_CARRIERS existen solo en STG.
 *      Se crean en PRD copiando de STG label/helpText/type/category/body/
 *      sortOrder, con version 1 PUBLICADA y publishedVersionId (misma forma que
 *      createCmsField de features/cms/service.ts — las SETTING publican al
 *      guardar). Idempotente: una clave que ya existe en PRD NO se pisa (se
 *      reporta). OJO: al ser escritura directa en DB, el cache `cms` del
 *      storefront hay que invalidarlo a mano (/admin/contenido → «Actualizar
 *      caché de contenido») o esperar el TTL.
 *      Efecto de negocio: LOYALTY_ENABLED=true de STG ENCIENDE Puntos Lucams en
 *      PRD (el default fail-closed lo tenía apagado) — autorizado por el owner
 *      2026-10-22.
 *
 *   2. Variante CAL-FOT-12-DEFAULT-NOMAG: STG tiene 2 imágenes y PRD ninguna.
 *      Se descargan del bucket público de STG y se suben al bucket
 *      product-images de PRD CON EL MISMO path (paridad byte a byte con la
 *      firma de homologación, que normaliza solo el host), luego se actualiza
 *      ProductVariant.images en PRD.
 *
 * DRY-RUN por defecto; APPLY exige LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 (env-guard
 * fail-closed, mismo patrón que sync-gallery-stg-to-prd.mjs).
 *
 * Uso (desde packages/db):
 *   node scripts/one-shot/sync-loyalty-settings-nomag-images-20261022.mjs
 *   LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 node scripts/one-shot/sync-loyalty-settings-nomag-images-20261022.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { assertDestructiveAllowed, classifyUrl } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");

const STG_ENV = new URL("../../../../.env.stg", import.meta.url).pathname;
const PRD_ENV = new URL("../../../../.env.local.nube-backup", import.meta.url).pathname;

function loadEnvFile(path) {
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') || val.startsWith("'")) {
      const q = val[0];
      const end = val.indexOf(q, 1);
      val = end > 0 ? val.slice(1, end) : val.slice(1);
    } else {
      const hash = val.indexOf(" #");
      if (hash > 0) val = val.slice(0, hash).trim();
    }
    out[key] = val;
  }
  return out;
}

const stgEnv = loadEnvFile(STG_ENV);
const prdEnv = loadEnvFile(PRD_ENV);

if (classifyUrl(stgEnv.DIRECT_URL) !== "stg" || classifyUrl(prdEnv.DIRECT_URL) !== "prd") {
  console.error("✗ credenciales cruzadas o irreconocibles (esperado: .env.stg=stg, .env.local.nube-backup=prd).");
  process.exit(1);
}

if (APPLY) {
  process.env.DIRECT_URL = prdEnv.DIRECT_URL;
  process.env.DATABASE_URL = prdEnv.DATABASE_URL ?? prdEnv.DIRECT_URL;
  assertDestructiveAllowed("sync-loyalty-settings-nomag-images-20261022.mjs");
}

const stg = new PrismaClient({ datasources: { db: { url: stgEnv.DIRECT_URL } } });
const db = new PrismaClient({ datasources: { db: { url: prdEnv.DIRECT_URL } } });

const stgPublicBase = stgEnv.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const prdPublicBase = prdEnv.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const supabasePrd = createClient(prdPublicBase, prdEnv.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SETTING_KEYS = [
  "LOYALTY_ENABLED",
  "LOYALTY_EARN_COP_PER_POINT",
  "LOYALTY_REDEEM_POINTS_PER_1000",
  "LOYALTY_REDEEM_MIN_POINTS",
  "LOYALTY_REDEEM_MAX_PERCENT",
  "LOYALTY_EXPIRATION_ENABLED",
  "LOYALTY_EXPIRATION_DAYS",
  "REFERRAL_ENABLED",
  "REFERRAL_REWARD_PERCENT",
  "REFERRAL_REWARD_DAYS",
  "SHIPPING_DISABLED_CARRIERS",
];

const NOMAG_SKU = "CAL-FOT-12-DEFAULT-NOMAG";

/** Copia un objeto del bucket público STG al bucket PRD con el MISMO path. */
async function copyStorageObject(stgUrl, failures) {
  const marker = "/storage/v1/object/public/";
  const idx = stgUrl.indexOf(marker);
  if (idx < 0) {
    failures.push(`URL no reconocida: ${stgUrl}`);
    return null;
  }
  const rest = stgUrl.slice(idx + marker.length);
  const bucket = rest.slice(0, rest.indexOf("/"));
  const path = rest.slice(rest.indexOf("/") + 1);
  const prdUrl = `${prdPublicBase}${marker}${bucket}/${path}`;
  // Ya existe en PRD → no pisar.
  const head = await fetch(prdUrl, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
  if (head.ok) {
    console.log(`  · objeto ya existe en PRD: ${bucket}/${path}`);
    return prdUrl;
  }
  const res = await fetch(stgUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    failures.push(`descarga ${bucket}/${path} → HTTP ${res.status}`);
    return null;
  }
  const body = Buffer.from(await res.arrayBuffer());
  const { error } = await supabasePrd.storage
    .from(bucket)
    .upload(path, body, {
      contentType: res.headers.get("content-type") ?? "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) {
    failures.push(`upload ${bucket}/${path}: ${error.message}`);
    return null;
  }
  console.log(`  ✓ objeto copiado ${bucket}/${path}`);
  return prdUrl;
}

async function main() {
  console.log(`=== sync-loyalty-settings-nomag-images (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
  const failures = [];

  // ── 1. Settings ─────────────────────────────────────────────────────────
  const stgFields = await stg.cmsField.findMany({
    where: { key: { in: SETTING_KEYS } },
    select: {
      key: true, kind: true, label: true, helpText: true, type: true,
      category: true, body: true, sortOrder: true, metadata: true,
    },
  });
  if (stgFields.length !== SETTING_KEYS.length) {
    const found = new Set(stgFields.map((f) => f.key));
    console.warn(`⚠ STG solo tiene ${stgFields.length}/${SETTING_KEYS.length}: faltan ${SETTING_KEYS.filter((k) => !found.has(k)).join(", ")}`);
  }
  const prdExisting = new Set(
    (await db.cmsField.findMany({ where: { key: { in: SETTING_KEYS } }, select: { key: true } })).map(
      (f) => f.key,
    ),
  );
  const toCreate = stgFields.filter((f) => !prdExisting.has(f.key));
  console.log(`\nSettings: ${toCreate.length} a crear en PRD · ${prdExisting.size} ya existen`);
  for (const f of toCreate) console.log(`  + ${f.key} = ${f.body}`);

  if (APPLY && toCreate.length) {
    const section = await db.cmsSection.findFirst({
      where: { key: "comercio", page: { slug: "global" } },
      select: { id: true },
    });
    if (!section) throw new Error("PRD no tiene la sección global/comercio");
    for (const f of toCreate) {
      try {
        await db.$transaction(async (tx) => {
          const field = await tx.cmsField.create({
            data: {
              sectionId: section.id,
              key: f.key,
              kind: f.kind,
              label: f.label,
              helpText: f.helpText,
              type: f.type,
              category: f.category,
              body: f.body,
              metadata: f.metadata ?? {},
              sortOrder: f.sortOrder,
              isPublished: true,
              createdBy: "system:sync-stg-20261022",
            },
          });
          const v1 = await tx.cmsFieldVersion.create({
            data: {
              fieldId: field.id,
              version: 1,
              title: f.label,
              body: f.body,
              metadata: f.metadata ?? {},
              publishedAt: new Date(),
              createdBy: "system:sync-stg-20261022",
            },
          });
          await tx.cmsField.update({
            where: { id: field.id },
            data: { publishedVersionId: v1.id },
          });
        });
        console.log(`  ✓ setting creada y publicada: ${f.key}`);
      } catch (err) {
        failures.push(`setting ${f.key}: ${err.message}`);
        console.warn(`  ✗ setting ${f.key}: ${err.message}`);
      }
    }
  }

  // ── 2. Imágenes de la variante NOMAG ────────────────────────────────────
  const [stgVar, prdVar] = await Promise.all([
    stg.productVariant.findUnique({ where: { sku: NOMAG_SKU }, select: { images: true } }),
    db.productVariant.findUnique({ where: { sku: NOMAG_SKU }, select: { id: true, images: true } }),
  ]);
  if (!stgVar || !prdVar) throw new Error(`variante ${NOMAG_SKU} no encontrada en ambos ambientes`);
  console.log(`\nVariante ${NOMAG_SKU}: STG ${stgVar.images.length} imgs · PRD ${prdVar.images.length} imgs`);
  if (stgVar.images.length && prdVar.images.length === 0) {
    const prdUrls = [];
    for (const url of stgVar.images) {
      if (!APPLY) {
        console.log(`  ⇪ copiar ${url.slice(url.indexOf("/product-images/") + 1)}`);
        const marker = "/storage/v1/object/public/";
        prdUrls.push(prdPublicBase + url.slice(url.indexOf(marker)));
        continue;
      }
      const prdUrl = await copyStorageObject(url, failures);
      if (prdUrl) prdUrls.push(prdUrl);
    }
    if (APPLY && prdUrls.length === stgVar.images.length) {
      await db.productVariant.update({
        where: { id: prdVar.id },
        data: { images: prdUrls, updatedBy: "system:sync-stg-20261022" },
      });
      console.log(`  ✓ variante actualizada con ${prdUrls.length} imágenes`);
    } else if (APPLY) {
      failures.push("variante NOMAG: no se actualizó porque faltan objetos copiados");
    }
  } else {
    console.log("  · nada que hacer (ya homologada o STG sin imágenes)");
  }

  console.log(`\n${failures.length ? `✗ terminó con ${failures.length} fallos` : "✓ listo"}`);
  if (failures.length) for (const f of failures) console.warn(`  ✗ ${f}`);
  if (!APPLY) console.log("DRY-RUN (sin cambios). Para ejecutar: LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1 … --apply");
  process.exitCode = failures.length ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stg.$disconnect();
    await db.$disconnect();
  });
