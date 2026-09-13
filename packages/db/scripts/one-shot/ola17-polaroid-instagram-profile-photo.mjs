#!/usr/bin/env node
/*
 * ARCHIVADO en one-shot/ (N-06, 2026-09-12): one-shot ya aplicado; se
 * conserva como referencia y para rerun DELIBERADO (ver lib/env-guard.mjs).
 * ola17-polaroid-instagram-profile-photo.mjs — Foto de perfil editable en la
 * plantilla "Polaroid Instagram" (PersonalizationTemplate slug
 * `photo-pack-polaroid-instagram`, autorizado por Lucy 2026-09-07).
 *
 * Inserta en el canvasData de la plantilla la capa `profile-photo`
 * (id "profile_photo", type "profile-photo", centro 34,34 r=16) INMEDIATAMENTE
 * DESPUÉS del asset "frame" (ig_post_3x4.svg). El chrome SVG trae un avatar
 * placeholder horneado (circle cx=34 cy=34 r=16, ver public/templates/ig_post_3x4.svg);
 * la capa lo cubre con la foto real del cliente recortada a círculo, dejando el
 * anillo de historia (r=20, stroke 2.5) visible alrededor. La imagen la aporta
 * cada slot vía slots[i].profileAssetUrl (POR SLOT — cada imán del pack es un post
 * independiente con su propio usuario). Sin foto elegida no dibuja nada → placeholder.
 *
 * Geometría congelada en apps/web/features/personalization/instagram-template-spec.ts
 * (IG_PROFILE_PHOTO_LAYER) — el unit test instagram-template-spec.test.ts la atrapa.
 *
 * NOTA: drafts/cotizaciones ya creadas conservan su propio canvasData (snapshot del
 * design) y NO ganan la capa: siguen viendo el avatar placeholder horneado, que es
 * el comportamiento correcto para diseños existentes (aceptado con Lucy).
 *
 * Idempotente: si la capa ya existe con estos valores exactos, no escribe.
 *
 * GUARD DE AMBIENTE: la escritura solo está permitida contra hosts LOCALES
 * (127.0.0.1/localhost/host.docker.internal) o STG — la guarda genérica bloquea
 * PRD y remotos desconocidos. En la práctica este script se corre contra LOCAL;
 * el integrador corre el equivalente contra STG después del deploy.
 *
 * Uso (desde packages/db):
 *   npx dotenv -e ../../.env.local -- node scripts/one-shot/ola17-polaroid-instagram-profile-photo.mjs
 *   npx dotenv -e ../../.env.local -- node scripts/one-shot/ola17-polaroid-instagram-profile-photo.mjs --apply
 */

import { PrismaClient } from "@prisma/client";
import { checkDestructiveAllowed } from "../lib/env-guard.mjs";

const APPLY = process.argv.includes("--apply");
const SCRIPT = "ola17-polaroid-instagram-profile-photo";
const SLUG = "photo-pack-polaroid-instagram";

// Guarda de ambiente (bloquea PRD/remotos desconocidos; permite local + STG).
{
  const res = checkDestructiveAllowed();
  if (!res.allowed) {
    console.error(`[env-guard] ${SCRIPT}: BLOQUEADO — ${res.reason}`);
    process.exit(1);
  }
  if (res.bypassed) console.warn(`[env-guard] ${SCRIPT}: ${res.reason}`);
  else console.log(`[env-guard] ${SCRIPT}: destino permitido (${res.reason || "local/stg"}).`);
}

// Capa canónica — MANTENER ALINEADA con IG_PROFILE_PHOTO_LAYER de
// apps/web/features/personalization/instagram-template-spec.ts (y con el seed).
const PROFILE_LAYER = {
  id: "profile_photo",
  type: "profile-photo",
  x: 34,
  y: 34,
  radius: 16,
};

const prisma = new PrismaClient();

async function main() {
  const tpl = await prisma.personalizationTemplate.findUnique({ where: { slug: SLUG } });
  if (!tpl) throw new Error(`No existe la plantilla ${SLUG}`);
  const cd = tpl.canvasData;
  if (!cd?.layers || !Array.isArray(cd.layers)) {
    throw new Error(`canvasData de ${SLUG} sin layers — estado inesperado, no se toca nada.`);
  }

  const before = cd.layers.map((l) => l.id);
  console.log("Capas antes:", JSON.stringify(before));

  // Idempotencia: ya existe con los valores exactos → no escribe. La comparación
  // es campo a campo (el JSON persistido puede tener las claves en otro orden).
  const existing = cd.layers.find((l) => l.id === PROFILE_LAYER.id);
  const sameLayer =
    existing &&
    existing.type === PROFILE_LAYER.type &&
    existing.x === PROFILE_LAYER.x &&
    existing.y === PROFILE_LAYER.y &&
    existing.radius === PROFILE_LAYER.radius;
  if (sameLayer) {
    console.log("Ya estaba aplicada (idempotente). 0 filas tocadas.");
    return;
  }
  if (existing) {
    throw new Error(
      `La capa ${PROFILE_LAYER.id} ya existe con OTROS valores (${JSON.stringify(existing)}). ` +
        "No se sobrescribe a ciegas: revisar a mano.",
    );
  }

  // Insertar INMEDIATAMENTE DESPUÉS del asset "frame" (la capa debe quedar
  // ENCIMA del chrome SVG para cubrir el avatar horneado). Si no hay asset
  // "frame" (estado raro), al final del array con un warning.
  const frameIdx = cd.layers.findIndex((l) => l.id === "frame" && l.type === "asset");
  const insertAt = frameIdx >= 0 ? frameIdx + 1 : cd.layers.length;
  if (frameIdx < 0) {
    console.warn(
      "⚠️ No se encontró el asset 'frame' — la capa se agrega al FINAL (revisar orden).",
    );
  }
  const newLayers = [...cd.layers];
  newLayers.splice(insertAt, 0, PROFILE_LAYER);

  if (!APPLY) {
    console.log(
      "DRY-RUN (sin --apply): no se escribió nada. Capas después:",
      JSON.stringify(newLayers.map((l) => l.id)),
    );
    return;
  }

  await prisma.personalizationTemplate.update({
    where: { slug: SLUG },
    data: { canvasData: { ...cd, layers: newLayers } },
  });

  console.log("Capas después:", JSON.stringify(newLayers.map((l) => l.id)));
  console.log("Listo: 1 fila actualizada (PersonalizationTemplate.photo-pack-polaroid-instagram).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
