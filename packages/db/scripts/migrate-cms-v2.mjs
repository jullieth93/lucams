/*
 * Migración CMS v2 — CmsBlock + SiteSetting → CmsPage/CmsSection/CmsField.
 *
 * Idempotente y SEGURO de re-ejecutar:
 *   - Estructura (páginas/secciones): upsert completo (títulos, orden…).
 *   - Campos migrados: la PRIMERA vez copia todo (body, versiones, estado de
 *     publicación); en re-ejecuciones solo actualiza atributos estructurales
 *     (sección, label, helpText, type, category, sortOrder) — NUNCA pisa
 *     body/isPublished/versiones, para no borrar ediciones hechas en v2.
 *   - Campos nuevos declarados en el site map (`fields`): igual — se crean con
 *     su valor por defecto + v1 publicada solo si no existen.
 *
 * Cierra con un reporte de PARIDAD: conteos origen vs destino, campos sin
 * versión publicada, y keys caídas en la página "otros".
 *
 * Uso:
 *   make migrate-cms-v2
 *
 * ⚠️ CACHÉ CMS: edita contenido DIRECTO en DB → después de correrlo invalidar
 * el tag "cms" desde /admin/contenido ("Actualizar caché de contenido").
 */

import { PrismaClient } from "@prisma/client";
import { SITE_MAP, resolveBlockSection, resolveSettingSection } from "./cms-site-map.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

const prisma = new PrismaClient();

console.log("=== migrate-cms-v2 ===\n");

// BlockFormat → CmsFieldType (los demás tipos vienen de SettingType 1:1).
const BLOCK_TYPE = { MARKDOWN: "MARKDOWN", HTML: "HTML", TEXT: "TEXT", JSON: "JSON" };

const report = {
  pages: 0,
  sections: 0,
  blocksTotal: 0,
  blocksCreated: 0,
  versionsCopied: 0,
  settingsTotal: 0,
  settingsCreated: 0,
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
// 2. CmsBlock → CmsField (kind BLOCK) con TODAS sus versiones.
// ─────────────────────────────────────────────────────────────────────────────
async function migrateBlocks() {
  const blocks = await prisma.cmsBlock.findMany({
    where: { deletedAt: null },
    include: { versions: { orderBy: { version: "asc" } }, publishedVersion: true },
    orderBy: { key: "asc" },
  });
  report.blocksTotal = blocks.length;

  for (const block of blocks) {
    const { pageSlug, sectionKey } = resolveBlockSection(block.key);
    if (pageSlug === "otros") report.inOtros.push(block.key);
    const sectionId = sectionIdByPath.get(`${pageSlug}/${sectionKey}`);

    const structural = {
      sectionId,
      label: block.title ?? block.key,
      helpText: block.description ?? null,
      type: BLOCK_TYPE[block.format] ?? "TEXT",
      category: block.category,
      metadata: block.metadata ?? {},
    };

    let field = await prisma.cmsField.findUnique({ where: { key: block.key } });
    if (field) {
      field = await prisma.cmsField.update({ where: { id: field.id }, data: structural });
    } else {
      field = await prisma.cmsField.create({
        data: {
          ...structural,
          key: block.key,
          kind: "BLOCK",
          body: block.body,
          isPublished: block.isPublished,
          createdBy: block.createdBy,
          updatedBy: block.updatedBy,
        },
      });
      report.blocksCreated++;

      // Versiones append-only: copiar SOLO en la creación del campo.
      for (const v of block.versions) {
        await prisma.cmsFieldVersion.create({
          data: {
            fieldId: field.id,
            version: v.version,
            title: v.title,
            body: v.body,
            metadata: v.metadata ?? {},
            publishedAt: v.publishedAt,
            createdAt: v.createdAt,
            createdBy: v.createdBy,
          },
        });
        report.versionsCopied++;
      }

      // Apuntar publishedVersionId a la misma versión que tenía el bloque.
      if (block.publishedVersion) {
        const fv = await prisma.cmsFieldVersion.findUnique({
          where: {
            fieldId_version: { fieldId: field.id, version: block.publishedVersion.version },
          },
        });
        if (fv) {
          await prisma.cmsField.update({
            where: { id: field.id },
            data: { publishedVersionId: fv.id },
          });
        }
      }
    }

    // Anomalías: publicado sin versión publicada.
    if (block.isPublished && !block.publishedVersion) {
      report.anomalies.push(`${block.key}: bloque publicado sin publishedVersion`);
    }
  }
  console.log(
    `Bloques: ${report.blocksTotal} leídos, ${report.blocksCreated} campos creados, ${report.versionsCopied} versiones copiadas.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SiteSetting → CmsField (kind SETTING) con v1 publicada.
// ─────────────────────────────────────────────────────────────────────────────
async function migrateSettings() {
  const settings = await prisma.siteSetting.findMany({ orderBy: { key: "asc" } });
  report.settingsTotal = settings.length;

  for (const setting of settings) {
    const { pageSlug, sectionKey } = resolveSettingSection(setting.category);
    if (pageSlug === "otros") report.inOtros.push(setting.key);
    const sectionId = sectionIdByPath.get(`${pageSlug}/${sectionKey}`);

    const structural = {
      sectionId,
      label: setting.label,
      helpText: setting.description ?? null,
      type: setting.valueType, // SettingType ⊆ CmsFieldType (mismos nombres)
      category: setting.category,
    };

    const existing = await prisma.cmsField.findUnique({ where: { key: setting.key } });
    if (existing) {
      await prisma.cmsField.update({ where: { id: existing.id }, data: structural });
      continue;
    }

    const field = await prisma.cmsField.create({
      data: {
        ...structural,
        key: setting.key,
        kind: "SETTING",
        body: setting.value,
        isPublished: true,
        createdBy: setting.createdBy,
        updatedBy: setting.updatedBy,
      },
    });
    const v1 = await prisma.cmsFieldVersion.create({
      data: {
        fieldId: field.id,
        version: 1,
        title: setting.label,
        body: setting.value,
        publishedAt: setting.updatedAt,
        createdBy: setting.createdBy,
      },
    });
    await prisma.cmsField.update({
      where: { id: field.id },
      data: { publishedVersionId: v1.id },
    });
    report.settingsCreated++;
  }
  console.log(
    `Settings: ${report.settingsTotal} leídos, ${report.settingsCreated} campos creados.`,
  );
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

  console.log("\n--- PARIDAD ---");
  console.log(
    `Bloques  origen ${report.blocksTotal} → destino ${fieldBlocks} ${fieldBlocks >= report.blocksTotal ? "OK" : "✗ FALTAN"}`,
  );
  console.log(
    `Settings origen ${report.settingsTotal} → destino ${fieldSettings} ${fieldSettings >= report.settingsTotal ? "OK" : "✗ FALTAN"}`,
  );
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
  await migrateBlocks();
  await migrateSettings();
  await upsertMapFields();
  await parity();
} finally {
  await prisma.$disconnect();
}
