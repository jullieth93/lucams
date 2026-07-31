/*
 * Migración CMS v2 — site map → CmsPage/CmsSection/CmsField.
 *
 * ORIGEN: este script migró CmsBlock + SiteSetting (legacy) al modelo v2; tras
 * el drop de las tablas legacy (fase A2, 2026-07-31) queda como herramienta de
 * UPSERT del site map — es el paso 2 del flujo «agregar un campo CMS»
 * (docs/CONVENTIONS.md § CMS).
 *
 * Idempotente y SEGURO de re-ejecutar:
 *   - Estructura (páginas/secciones): upsert completo (títulos, orden…).
 *   - Campos nuevos declarados en el site map (`fields`): se crean con su
 *     valor por defecto + v1 publicada solo si NO existen — NUNCA pisa
 *     body/isPublished/versiones de campos ya editados desde el admin.
 *
 * Cierra con un reporte de estado: conteos en destino, campos publicados sin
 * versión publicada, y keys caídas en la página "otros".
 *
 * Uso:
 *   make migrate-cms-v2
 *
 * ⚠️ CACHÉ CMS: edita contenido DIRECTO en DB → después de correrlo invalidar
 * el tag "cms" desde /admin/contenido ("Actualizar caché de contenido").
 */

import { PrismaClient } from "@prisma/client";
import { SITE_MAP } from "./cms-site-map.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== migrate-cms-v2 ===\n");

const report = {
  pages: 0,
  sections: 0,
  mapFieldsCreated: 0,
  inOtros: [],
  anomalies: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Estructura: páginas + secciones del site map.
// ─────────────────────────────────────────────────────────────────────────────
const sectionIdByPath = new Map(); // "pageSlug/sectionKey" → sectionId

async function ensureStructure() {
  for (const page of SITE_MAP.pages) {
    const pageRow = await prisma.cmsPage.upsert({
      where: { slug: page.slug },
      update: {
        title: page.title,
        description: page.description ?? null,
        path: page.path ?? null,
        icon: page.icon ?? null,
        sortOrder: page.sortOrder ?? 0,
      },
      create: {
        slug: page.slug,
        title: page.title,
        description: page.description ?? null,
        path: page.path ?? null,
        icon: page.icon ?? null,
        sortOrder: page.sortOrder ?? 0,
      },
    });
    report.pages++;

    for (const section of page.sections) {
      const sectionRow = await prisma.cmsSection.upsert({
        where: { pageId_key: { pageId: pageRow.id, key: section.key } },
        update: {
          title: section.title,
          description: section.description ?? null,
          sortOrder: section.sortOrder ?? 0,
        },
        create: {
          pageId: pageRow.id,
          key: section.key,
          title: section.title,
          description: section.description ?? null,
          sortOrder: section.sortOrder ?? 0,
        },
      });
      sectionIdByPath.set(`${page.slug}/${section.key}`, sectionRow.id);
      report.sections++;
    }
  }
  console.log(`Estructura: ${report.pages} páginas, ${report.sections} secciones OK.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Campos NUEVOS declarados en el site map (brechas de contenido).
// ─────────────────────────────────────────────────────────────────────────────
async function upsertMapFields() {
  for (const page of SITE_MAP.pages) {
    for (const section of page.sections) {
      if (!section.fields?.length) continue;
      const sectionId = sectionIdByPath.get(`${page.slug}/${section.key}`);
      for (const def of section.fields) {
        const structural = {
          sectionId,
          kind: def.kind,
          label: def.label,
          helpText: def.helpText ?? null,
          type: def.type,
          category: def.category,
          sortOrder: def.sortOrder ?? 0,
          // metadata solo cuando el mapa la declara (ej. listSchema de los
          // campos LISTA) — si no viene, se conserva la que ya tenga el campo.
          ...(def.metadata ? { metadata: def.metadata } : {}),
        };
        const existing = await prisma.cmsField.findUnique({ where: { key: def.key } });
        if (existing) {
          await prisma.cmsField.update({ where: { id: existing.id }, data: structural });
          continue;
        }
        const field = await prisma.cmsField.create({
          data: { ...structural, key: def.key, body: def.body, isPublished: true },
        });
        const v1 = await prisma.cmsFieldVersion.create({
          data: {
            fieldId: field.id,
            version: 1,
            title: def.label,
            body: def.body,
            publishedAt: new Date(),
          },
        });
        await prisma.cmsField.update({
          where: { id: field.id },
          data: { publishedVersionId: v1.id },
        });
        report.mapFieldsCreated++;
      }
    }
  }
  if (report.mapFieldsCreated > 0) {
    console.log(`Campos nuevos del site map: ${report.mapFieldsCreated} creados.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Paridad: origen vs destino + publicación consistente.
// ─────────────────────────────────────────────────────────────────────────────
async function parity() {
  const [fieldBlocks, fieldSettings, publishedNoVersion] = await Promise.all([
    prisma.cmsField.count({ where: { kind: "BLOCK", deletedAt: null } }),
    prisma.cmsField.count({ where: { kind: "SETTING", deletedAt: null } }),
    prisma.cmsField.count({
      where: { isPublished: true, publishedVersionId: null, deletedAt: null },
    }),
  ]);

  console.log("\n--- ESTADO ---");
  console.log(`Campos BLOCK en DB: ${fieldBlocks} · SETTING: ${fieldSettings}`);
  console.log(
    `Campos publicados sin versión publicada: ${publishedNoVersion} ${publishedNoVersion === 0 ? "OK" : "✗ REVISAR"}`,
  );
  if (report.inOtros.length > 0) {
    console.log(`⚠️  Keys sin clasificar (página "otros"): ${report.inOtros.join(", ")}`);
  }
  if (report.anomalies.length > 0) {
    console.log("⚠️  Anomalías:");
    for (const a of report.anomalies) console.log(`   - ${a}`);
  }
  console.log("\nListo. Recuerda invalidar el caché CMS desde /admin/contenido.");
}

try {
  await ensureStructure();
  await upsertMapFields();
  await parity();
} finally {
  await prisma.$disconnect();
}
