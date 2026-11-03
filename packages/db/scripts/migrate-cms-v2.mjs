/*
 * Migración CMS v2 — site map → CmsPage/CmsSection/CmsField.
 *
 * ORIGEN: este script migró CmsBlock + SiteSetting (legacy) al modelo v2; tras
 * el drop de las tablas legacy y el aterrizaje a la arquitectura de 3 capas,
 * queda como herramienta canónica de UPSERT del site map (9 contenedores,
 * 29 secciones, 166 campos reales: 105 BLOCK + 61 SETTING).
 *
 * Idempotente y SEGURO de re-ejecutar:
 *   - Estructura (páginas/secciones): upsert completo (títulos, orden…).
 *   - Campos existentes: actualiza sección, orden, categoría y helpText sin
 *     pisar nunca `body`, `publishedVersionId` ni el historial de versiones;
 *     en `faq.*` y `seo.page.*` preserva `label` (que actúa como pregunta o
 *     <title> editable), salvo el typo histórico `Lucams_shop`.
 *   - Campos nuevos declarados en el site map (`fields`): se crean con su
 *     valor por defecto + v1 publicada (+ `defaultListItems` si aplica).
 *
 * N-06 (2026-09-12): DRY-RUN por defecto (`--apply` ejecuta) + env-guard
 * fail-closed (bloquea PRD/remotos no reconocidos).
 *
 * Uso:
 *   make migrate-cms-v2          (el target pasa --apply)
 *   node scripts/migrate-cms-v2.mjs            # DRY-RUN
 *   node scripts/migrate-cms-v2.mjs --apply    # aplica
 *
 * ⚠️ CACHÉ CMS: edita contenido DIRECTO en DB → después de correrlo invalidar
 * el tag "cms" desde /admin/contenido ("Actualizar caché de contenido").
 */

import { PrismaClient } from "@prisma/client";
import { SITE_MAP } from "./cms-site-map.mjs";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: upsert del site map CMS — bloquea PRD/remotos no STG.
assertDestructiveAllowed("migrate-cms-v2.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

console.log(`=== migrate-cms-v2 (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

const report = {
  pages: 0,
  sections: 0,
  mapFieldsCreated: 0,
  mapFieldsUpdated: 0,
  anomalies: [],
};

function shouldPreserveExistingLabel(key, existingLabel) {
  if (!existingLabel) return false;
  if (existingLabel.startsWith("Lucams_shop")) return false;
  return key.startsWith("faq.") || key.startsWith("seo.page.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Estructura: páginas + secciones del site map.
// ─────────────────────────────────────────────────────────────────────────────
const sectionIdByPath = new Map(); // "pageSlug/sectionKey" → sectionId

async function ensureStructure() {
  for (const page of SITE_MAP.pages) {
    report.pages++;
    let pageRowId = null;
    if (APPLY) {
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
      pageRowId = pageRow.id;
    } else {
      pageRowId = (await prisma.cmsPage.findUnique({ where: { slug: page.slug } }))?.id ?? null;
    }

    for (const section of page.sections) {
      report.sections++;
      if (APPLY) {
        const sectionRow = await prisma.cmsSection.upsert({
          where: { pageId_key: { pageId: pageRowId, key: section.key } },
          update: {
            title: section.title,
            description: section.description ?? null,
            sortOrder: section.sortOrder ?? 0,
          },
          create: {
            pageId: pageRowId,
            key: section.key,
            title: section.title,
            description: section.description ?? null,
            sortOrder: section.sortOrder ?? 0,
          },
        });
        sectionIdByPath.set(`${page.slug}/${section.key}`, sectionRow.id);
      } else {
        const sectionRow = pageRowId
          ? await prisma.cmsSection.findUnique({
              where: { pageId_key: { pageId: pageRowId, key: section.key } },
            })
          : null;
        if (sectionRow) sectionIdByPath.set(`${page.slug}/${section.key}`, sectionRow.id);
      }
    }
  }
  console.log(`Estructura: ${report.pages} páginas, ${report.sections} secciones OK.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Campos declarados en el site map.
// ─────────────────────────────────────────────────────────────────────────────
async function upsertMapFields() {
  for (const page of SITE_MAP.pages) {
    for (const section of page.sections) {
      if (!section.fields?.length) continue;
      const sectionId = sectionIdByPath.get(`${page.slug}/${section.key}`);
      for (const def of section.fields) {
        if (!sectionId && APPLY) {
          console.warn(
            `  ⚠ Sección ${page.slug}/${section.key} sin id — campo ${def.key} omitido.`,
          );
          continue;
        }
        const existing = await prisma.cmsField.findUnique({ where: { key: def.key } });
        const label =
          existing && shouldPreserveExistingLabel(def.key, existing.label)
            ? existing.label
            : def.label;

        const structural = {
          ...(sectionId ? { sectionId } : {}),
          kind: def.kind,
          label,
          helpText: def.helpText ?? null,
          type: def.type,
          category: def.category,
          sortOrder: def.sortOrder ?? 0,
          ...(def.metadata ? { metadata: def.metadata } : {}),
        };

        if (existing) {
          report.mapFieldsUpdated++;
          if (APPLY) {
            await prisma.cmsField.update({ where: { id: existing.id }, data: structural });
            if (Array.isArray(def.defaultListItems) && def.defaultListItems.length > 0) {
              const itemsCount = await prisma.cmsListItem.count({
                where: { fieldId: existing.id },
              });
              if (itemsCount === 0 && existing.body === def.body) {
                await prisma.cmsListItem.createMany({
                  data: def.defaultListItems.map((values, position) => ({
                    fieldId: existing.id,
                    position,
                    values,
                  })),
                });
              }
            }
          }
          continue;
        }

        report.mapFieldsCreated++;
        if (APPLY) {
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
          if (Array.isArray(def.defaultListItems) && def.defaultListItems.length > 0) {
            await prisma.cmsListItem.createMany({
              data: def.defaultListItems.map((values, position) => ({
                fieldId: field.id,
                position,
                values,
              })),
            });
          }
        }
      }
    }
  }
  console.log(
    `Campos del site map: ${report.mapFieldsCreated} ${APPLY ? "creados" : "a crear"} · ${report.mapFieldsUpdated} ${APPLY ? "alineados" : "existentes"}.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Estado y consistencia de publicación.
// ─────────────────────────────────────────────────────────────────────────────
async function parity() {
  const siteMapKeys = new Set(
    SITE_MAP.pages.flatMap((p) => p.sections.flatMap((s) => (s.fields ?? []).map((f) => f.key))),
  );
  const [fieldBlocks, fieldSettings, publishedNoVersion, extraFields] = await Promise.all([
    prisma.cmsField.count({ where: { kind: "BLOCK", deletedAt: null } }),
    prisma.cmsField.count({ where: { kind: "SETTING", deletedAt: null } }),
    prisma.cmsField.count({
      where: { isPublished: true, publishedVersionId: null, deletedAt: null },
    }),
    prisma.cmsField.count({
      where: { key: { notIn: [...siteMapKeys] } },
    }),
  ]);

  console.log("\n--- ESTADO ---");
  console.log(`Campos BLOCK en DB: ${fieldBlocks} · SETTING: ${fieldSettings}`);
  console.log(
    `Campos publicados sin versión publicada: ${publishedNoVersion} ${publishedNoVersion === 0 ? "OK" : "✗ REVISAR"}`,
  );
  if (extraFields > 0) {
    console.log(
      `⚠️  Campos en DB fuera del site map: ${extraFields} (usa sync-and-prune-cms-v2.mjs para sanearlos).`,
    );
  }
  if (!APPLY) {
    console.log("\nDRY-RUN (sin cambios). Para ejecutar: node scripts/migrate-cms-v2.mjs --apply");
  } else {
    console.log("\nListo. Recuerda invalidar el caché CMS desde /admin/contenido.");
  }
}

try {
  await ensureStructure();
  await upsertMapFields();
  await parity();
} finally {
  await prisma.$disconnect();
}
