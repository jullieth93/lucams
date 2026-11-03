/*
 * Saneamiento transaccional e idempotente del CMS v2 (Fase 6 — Arquitectura de 3 capas).
 *
 * Qué hace (en orden seguro):
 *   1. Rescate cero-pérdida de `email.welcome.{subject,preview}` hacia
 *      `EmailTemplateOverride` (`templateId = "newsletter-welcome"`) si algún
 *      ambiente tenía personalización manual y aún no existe override.
 *   2. Upsert estructural del `SITE_MAP` canónico (10 páginas, 32 secciones,
 *      176 campos reales): crea los campos faltantes con v1 publicada (+ filas
 *      `CmsListItem` por defecto) y reubica/alinea metadatos de los existentes
 *      SIN pisar jamás su contenido publicado ni su historial de versiones.
 *   3. Republicación controlada (`version + 1`, `createdBy = "cms-v2-tokens-sync"`)
 *      de los 13 campos cuyo texto canónico pasó de literales fijos a `{{tokens}}`
 *      maestros (7 documentos `legal.*`, 4 `faq.*`, `checkout.shipping.note` y
 *      `home.hero.description`), ÚNICAMENTE cuando el cuerpo publicado actual
 *      coincide exactamente (SHA-256) con la semilla pre-token conocida — si la
 *      administradora editó manualmente alguno, se respeta y se avisa en consola.
 *   4. Purga en una ÚNICA transacción de las claves retiradas a Capa 3
 *      (`publishedVersionId = null` → `CmsFieldVersion` → `CmsListItem` →
 *      `CmsField`) y de las secciones/páginas fuera del `SITE_MAP` que queden vacías.
 *
 * Guardarraíles:
 *   - DRY-RUN por defecto (`--apply` requerido para escribir), con pre-carga
 *     masiva en 4 queries paralelas (~1s incluso contra ambientes remotos).
 *   - `assertDestructiveAllowed` fail-closed (permite LOCAL y STG; bloquea PRD
 *     salvo autorización explícita `LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1`).
 *
 * Uso:
 *   node scripts/sync-and-prune-cms-v2.mjs            # DRY-RUN (solo lectura)
 *   node scripts/sync-and-prune-cms-v2.mjs --apply    # ejecuta cambios
 */

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SITE_MAP } from "./cms-site-map.mjs";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

assertDestructiveAllowed("sync-and-prune-cms-v2.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/**
 * Hashes SHA-256 (sobre `body.trim()`) de las semillas previas a la Fase 1
 * (plazos literales y apóstrofo legacy). Solo si el cuerpo publicado actual
 * coincide con este hash exacto se publica una nueva versión con `{{tokens}}`.
 */
const PRE_TOKEN_BODY_SHA256 = new Map([
  ["home.hero.description", "8f7e5d265661a0cea6e7e89b3f4e996ef6a37378e9a21dbcc61d8f8c89b7a11b"],
  [
    "faq.05-cambios-devoluciones",
    "ce45d8eb42126c48ddf5d4a818071349a6db2db9cccc343ab69e7063513f4f58",
  ],
  ["faq.08-borrar-mis-datos", "b104dcc2d7e7f6ba719b5d6c159fcd9aab4724f4d1114582e7a7472ab8edefef"],
  [
    "faq.09-newsletter-unsuscripcion",
    "a8aa553ad724ce3bffeb3ab2c2d175a8a977b78e93c2c8ea39b5f79f9f92f1b6",
  ],
  ["faq.11-envio-mismo-dia", "992815f9748daf226fcd1c48fd1d0bfd960c0c2d893bb2bc1b7f687040f36c30"],
  ["legal.privacidad", "45be78ac559419212633e5657383a9be8072fcd05fcc82a08d8dbd4066832c8b"],
  ["legal.terminos", "2827e6818f732d498c1dec8ec0d0ae8cfed72c7a760be9d70f74842e98694f46"],
  ["legal.cookies", "a7175268d5c770443efa7d83b48e0b42f7de56ae34bd32abb623c7b537de2b77"],
  ["legal.devoluciones", "e085b4ca6b72262e1b22453e24eff4a866d3ddd4b0508ac3c5e8aa3bf655bd95"],
  ["legal.garantias", "0b1a023dfcca82518ec37acb5f065a96540b760b81a06acd5a1ff021139dc73d"],
  ["legal.habeas-data", "12907f0cd8aa15392633ee25e17f816ef930ccbacb0edde75cf897642ca46493"],
  ["legal.subprocesadores", "9072c34c9f08e053e632f264daf628a16b7e82b49c6fe9c0bf0027fd80b7940f"],
  ["checkout.shipping.note", "1a5d05f8ba1f33a29ab8bf57f283ff4993eaca3cc13b5ec14544b6d13c8b7368"],
]);

const EMAIL_WELCOME_DEFAULTS = {
  "email.welcome.subject": { overrideKey: "SUBJECT", defaultBody: "¡Estás dentro! 💜" },
  "email.welcome.preview": {
    overrideKey: "PREHEADER",
    defaultBody: "Gracias por sumarte. Esto es lo que viene.",
  },
};

function sha256Trimmed(value) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

function shouldPreserveExistingLabel(key, existingLabel) {
  if (!existingLabel) return false;
  if (existingLabel.startsWith("Lucams_shop")) return false;
  return key.startsWith("faq.") || key.startsWith("seo.page.");
}

function jsonStable(val) {
  return JSON.stringify(val ?? {});
}

async function main() {
  console.log(`=== sync-and-prune-cms-v2 (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // Pre-carga completa en 4 lecturas paralelas (evita N+1 contra DB remota).
  const [existingPages, existingSections, existingFields, welcomeOverrides] = await Promise.all([
    prisma.cmsPage.findMany(),
    prisma.cmsSection.findMany({ include: { page: { select: { slug: true } } } }),
    prisma.cmsField.findMany({
      include: {
        publishedVersion: true,
        section: { select: { key: true, page: { select: { slug: true } } } },
        _count: { select: { versions: true, items: true } },
      },
    }),
    prisma.emailTemplateOverride.findMany({
      where: { templateId: "newsletter-welcome" },
    }),
  ]);

  const pageBySlug = new Map(existingPages.map((p) => [p.slug, p]));
  const sectionByPath = new Map(existingSections.map((s) => [`${s.page.slug}/${s.key}`, s]));
  const fieldByKey = new Map(existingFields.map((f) => [f.key, f]));
  const overrideByKey = new Map(welcomeOverrides.map((o) => [o.key, o]));

  const blocksBefore = existingFields.filter((f) => f.kind === "BLOCK").length;
  const settingsBefore = existingFields.filter((f) => f.kind === "SETTING").length;
  console.log(
    `Estado inicial en DB: ${existingPages.length} páginas · ${existingSections.length} secciones · ` +
      `${existingFields.length} campos (${blocksBefore} BLOCK + ${settingsBefore} SETTING)\n`,
  );

  // ── 1. Rescate email.welcome.* → EmailTemplateOverride ─────────────────────
  let emailOverridesRescued = 0;
  for (const [cmsKey, spec] of Object.entries(EMAIL_WELCOME_DEFAULTS)) {
    const field = fieldByKey.get(cmsKey);
    const publishedBody = field?.publishedVersion?.body?.trim();
    if (!publishedBody || publishedBody === spec.defaultBody) continue;
    if (overrideByKey.has(spec.overrideKey)) continue;

    emailOverridesRescued++;
    console.log(
      `  ↳ Rescate newsletter-welcome.${spec.overrideKey} desde ${cmsKey}: "${publishedBody}"`,
    );
    if (APPLY) {
      await prisma.emailTemplateOverride.create({
        data: {
          templateId: "newsletter-welcome",
          key: spec.overrideKey,
          value: publishedBody,
          updatedBy: "cms-v2-sync",
        },
      });
    }
  }

  // ── 2. Upsert de páginas, secciones y 176 campos del SITE_MAP ──────────────
  const canonicalPageSlugs = new Set();
  const canonicalSectionKeys = new Set();
  const canonicalFieldDefs = new Map();

  let pagesCreated = 0;
  let pagesUpdated = 0;
  let sectionsCreated = 0;
  let sectionsUpdated = 0;
  const sectionIdByPath = new Map();

  for (const page of SITE_MAP.pages) {
    canonicalPageSlugs.add(page.slug);
    const existingPage = pageBySlug.get(page.slug) ?? null;
    let pageId = existingPage?.id ?? null;

    const pageData = {
      title: page.title,
      description: page.description ?? null,
      path: page.path ?? null,
      icon: page.icon ?? null,
      sortOrder: page.sortOrder ?? 0,
    };

    if (!existingPage) {
      pagesCreated++;
      if (APPLY) {
        const created = await prisma.cmsPage.create({ data: { slug: page.slug, ...pageData } });
        pageId = created.id;
      }
    } else {
      const changed =
        existingPage.title !== pageData.title ||
        existingPage.description !== pageData.description ||
        existingPage.path !== pageData.path ||
        existingPage.icon !== pageData.icon ||
        existingPage.sortOrder !== pageData.sortOrder;
      if (changed) {
        pagesUpdated++;
        if (APPLY) {
          await prisma.cmsPage.update({ where: { id: existingPage.id }, data: pageData });
        }
      }
    }

    for (const section of page.sections) {
      const pathKey = `${page.slug}/${section.key}`;
      canonicalSectionKeys.add(pathKey);
      for (const def of section.fields ?? []) {
        canonicalFieldDefs.set(def.key, { pageSlug: page.slug, sectionKey: section.key, def });
      }

      const existingSection = sectionByPath.get(pathKey) ?? null;
      const sectionData = {
        title: section.title,
        description: section.description ?? null,
        sortOrder: section.sortOrder ?? 0,
      };

      if (!existingSection) {
        sectionsCreated++;
        if (APPLY && pageId) {
          const created = await prisma.cmsSection.create({
            data: { pageId, key: section.key, ...sectionData },
          });
          sectionIdByPath.set(pathKey, created.id);
        }
      } else {
        sectionIdByPath.set(pathKey, existingSection.id);
        const changed =
          existingSection.title !== sectionData.title ||
          existingSection.description !== sectionData.description ||
          existingSection.sortOrder !== sectionData.sortOrder;
        if (changed) {
          sectionsUpdated++;
          if (APPLY) {
            await prisma.cmsSection.update({
              where: { id: existingSection.id },
              data: sectionData,
            });
          }
        }
      }
    }
  }

  let fieldsCreated = 0;
  let fieldsStructUpdated = 0;
  let fieldsTokenized = 0;
  const manualEditsPreserved = [];

  for (const [key, { pageSlug, sectionKey, def }] of canonicalFieldDefs) {
    const pathKey = `${pageSlug}/${sectionKey}`;
    const targetSectionId = sectionIdByPath.get(pathKey) ?? null;
    const existing = fieldByKey.get(key) ?? null;

    if (!existing) {
      fieldsCreated++;
      if (APPLY && targetSectionId) {
        const createdField = await prisma.cmsField.create({
          data: {
            sectionId: targetSectionId,
            key: def.key,
            kind: def.kind,
            label: def.label,
            helpText: def.helpText ?? null,
            type: def.type,
            category: def.category,
            sortOrder: def.sortOrder ?? 0,
            metadata: def.metadata ?? {},
            body: def.body,
            isPublished: true,
            createdBy: "cms-v2-sync",
          },
        });
        const v1 = await prisma.cmsFieldVersion.create({
          data: {
            fieldId: createdField.id,
            version: 1,
            title: def.label,
            body: def.body,
            metadata: def.metadata ?? {},
            publishedAt: new Date(),
            createdBy: "cms-v2-sync",
          },
        });
        await prisma.cmsField.update({
          where: { id: createdField.id },
          data: { publishedVersionId: v1.id },
        });
        if (Array.isArray(def.defaultListItems) && def.defaultListItems.length > 0) {
          await prisma.cmsListItem.createMany({
            data: def.defaultListItems.map((values, position) => ({
              fieldId: createdField.id,
              position,
              values,
            })),
          });
        }
      }
      continue;
    }

    const desiredLabel = shouldPreserveExistingLabel(key, existing.label)
      ? existing.label
      : def.label;
    const desiredHelpText = def.helpText ?? null;
    const desiredSortOrder = def.sortOrder ?? 0;
    const currentPath = `${existing.section.page.slug}/${existing.section.key}`;
    const metadataChanged = def.metadata
      ? jsonStable(existing.metadata) !== jsonStable(def.metadata)
      : false;

    const structChanged =
      currentPath !== pathKey ||
      existing.kind !== def.kind ||
      existing.label !== desiredLabel ||
      existing.helpText !== desiredHelpText ||
      existing.type !== def.type ||
      existing.category !== def.category ||
      existing.sortOrder !== desiredSortOrder ||
      existing.deletedAt !== null ||
      metadataChanged;

    if (structChanged) {
      fieldsStructUpdated++;
      if (APPLY && targetSectionId) {
        await prisma.cmsField.update({
          where: { id: existing.id },
          data: {
            sectionId: targetSectionId,
            kind: def.kind,
            label: desiredLabel,
            helpText: desiredHelpText,
            type: def.type,
            category: def.category,
            sortOrder: desiredSortOrder,
            deletedAt: null,
            deletedBy: null,
            ...(def.metadata ? { metadata: def.metadata } : {}),
          },
        });
      }
    }

    if (
      APPLY &&
      Array.isArray(def.defaultListItems) &&
      def.defaultListItems.length > 0 &&
      existing._count.items === 0 &&
      existing.body.trim() === def.body.trim()
    ) {
      await prisma.cmsListItem.createMany({
        data: def.defaultListItems.map((values, position) => ({
          fieldId: existing.id,
          position,
          values,
        })),
      });
    }

    // ── 3. Republicación controlada con {{tokens}} ───────────────────────────
    const preTokenHash = PRE_TOKEN_BODY_SHA256.get(key);
    const pv = existing.publishedVersion;
    const needsTitleTypoFix =
      key === "seo.page.home" && pv?.title?.startsWith("Lucams_shop") === true;

    if (pv && (preTokenHash || needsTitleTypoFix)) {
      const currentBodyTrimmed = pv.body.trim();
      const targetBodyTrimmed = def.body.trim();

      if (preTokenHash && currentBodyTrimmed !== targetBodyTrimmed) {
        const currentHash = sha256Trimmed(pv.body);
        if (currentHash === preTokenHash) {
          fieldsTokenized++;
          if (APPLY) {
            const agg = await prisma.cmsFieldVersion.aggregate({
              where: { fieldId: existing.id },
              _max: { version: true },
            });
            const nextVer = (agg._max.version ?? 0) + 1;
            const newVer = await prisma.cmsFieldVersion.create({
              data: {
                fieldId: existing.id,
                version: nextVer,
                title: desiredLabel,
                body: def.body,
                metadata: existing.metadata ?? {},
                publishedAt: new Date(),
                createdBy: "cms-v2-tokens-sync",
              },
            });
            await prisma.cmsField.update({
              where: { id: existing.id },
              data: {
                body: def.body,
                isPublished: true,
                publishedVersionId: newVer.id,
                updatedBy: "cms-v2-tokens-sync",
              },
            });
          }
        } else {
          manualEditsPreserved.push(key);
        }
      } else if (needsTitleTypoFix) {
        fieldsTokenized++;
        if (APPLY) {
          const agg = await prisma.cmsFieldVersion.aggregate({
            where: { fieldId: existing.id },
            _max: { version: true },
          });
          const nextVer = (agg._max.version ?? 0) + 1;
          const newVer = await prisma.cmsFieldVersion.create({
            data: {
              fieldId: existing.id,
              version: nextVer,
              title: def.label,
              body: pv.body,
              metadata: existing.metadata ?? {},
              publishedAt: new Date(),
              createdBy: "cms-v2-tokens-sync",
            },
          });
          await prisma.cmsField.update({
            where: { id: existing.id },
            data: { publishedVersionId: newVer.id, updatedBy: "cms-v2-tokens-sync" },
          });
        }
      }
    }
  }

  // ── 4. Campos, secciones y páginas fuera del SITE_MAP a retirar ────────────
  const retiredFields = existingFields
    .filter((f) => !canonicalFieldDefs.has(f.key))
    .sort((a, b) => a.key.localeCompare(b.key));

  const retiredVersionsCount = retiredFields.reduce((acc, f) => acc + f._count.versions, 0);
  const retiredItemsCount = retiredFields.reduce((acc, f) => acc + f._count.items, 0);

  const retiredByPage = new Map();
  for (const f of retiredFields) {
    const p = f.section.page.slug;
    retiredByPage.set(p, (retiredByPage.get(p) ?? 0) + 1);
  }

  const retiredSections = existingSections.filter(
    (s) => !canonicalSectionKeys.has(`${s.page.slug}/${s.key}`),
  );
  const retiredPages = existingPages.filter((p) => !canonicalPageSlugs.has(p.slug));

  console.log("--- PLAN / RESULTADO DE SINCRONIZACIÓN ---");
  console.log(
    `Estructura SITE_MAP: ${pagesCreated} páginas nuevas, ${pagesUpdated} actualizadas · ` +
      `${sectionsCreated} secciones nuevas, ${sectionsUpdated} actualizadas`,
  );
  console.log(
    `Campos canónicos (${canonicalFieldDefs.size}): ${fieldsCreated} ${APPLY ? "creados" : "a crear"} · ` +
      `${fieldsStructUpdated} ${APPLY ? "reubicados/alineados" : "a reubicar/alinear"} · ` +
      `${fieldsTokenized} ${APPLY ? "republicados con {{tokens}}" : "a republicar con {{tokens}}"}`,
  );
  if (emailOverridesRescued > 0) {
    console.log(`Overrides newsletter-welcome rescatados: ${emailOverridesRescued}`);
  }
  if (manualEditsPreserved.length > 0) {
    console.log(
      `⚠️  Ediciones manuales respetadas (no se sobre-escribieron con tokens): ${manualEditsPreserved.join(", ")}`,
    );
  }

  console.log("\n--- PLAN / RESULTADO DE PODA (CAPA 3 + HUÉRFANAS) ---");
  console.log(
    `Campos a eliminar: ${retiredFields.length} (+ ${retiredVersionsCount} versiones, ${retiredItemsCount} listItems)`,
  );
  if (retiredByPage.size > 0) {
    const breakdown = [...retiredByPage.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([slug, n]) => `${slug}:${n}`)
      .join(", ");
    console.log(`  Desglose por página actual: ${breakdown}`);
  }
  console.log(
    `Secciones obsoletas a eliminar: ${retiredSections.length} · Páginas obsoletas a eliminar: ${retiredPages.length}` +
      (retiredPages.length > 0 ? ` (${retiredPages.map((p) => p.slug).join(", ")})` : ""),
  );

  if (!APPLY) {
    console.log(
      "\nDRY-RUN completado (0 escrituras en DB). Para aplicar: node scripts/sync-and-prune-cms-v2.mjs --apply",
    );
    return;
  }

  if (retiredFields.length > 0 || retiredSections.length > 0 || retiredPages.length > 0) {
    const pruned = await prisma.$transaction(async (tx) => {
      const fieldIds = retiredFields.map((f) => f.id);
      let vCount = 0;
      let iCount = 0;
      let fCount = 0;

      if (fieldIds.length > 0) {
        await tx.cmsField.updateMany({
          where: { id: { in: fieldIds } },
          data: { publishedVersionId: null },
        });
        vCount = (await tx.cmsFieldVersion.deleteMany({ where: { fieldId: { in: fieldIds } } }))
          .count;
        iCount = (await tx.cmsListItem.deleteMany({ where: { fieldId: { in: fieldIds } } })).count;
        fCount = (await tx.cmsField.deleteMany({ where: { id: { in: fieldIds } } })).count;
      }

      const secIds = retiredSections.map((s) => s.id);
      let sCount = 0;
      if (secIds.length > 0) {
        sCount = (
          await tx.cmsSection.deleteMany({
            where: { id: { in: secIds }, fields: { none: {} } },
          })
        ).count;
      }

      const pageIds = retiredPages.map((p) => p.id);
      let pCount = 0;
      if (pageIds.length > 0) {
        pCount = (
          await tx.cmsPage.deleteMany({
            where: { id: { in: pageIds }, sections: { none: {} } },
          })
        ).count;
      }

      return { fCount, vCount, iCount, sCount, pCount };
    });

    console.log(
      `\n✓ Poda transaccional aplicada: ${pruned.fCount} campos, ${pruned.vCount} versiones, ` +
        `${pruned.iCount} listItems, ${pruned.sCount} secciones y ${pruned.pCount} páginas eliminadas.`,
    );
  } else {
    console.log("\n✓ Nada que podar (idempotente).");
  }

  const [pagesAfter, sectionsAfter, blocksAfter, settingsAfter] = await Promise.all([
    prisma.cmsPage.count(),
    prisma.cmsSection.count(),
    prisma.cmsField.count({ where: { kind: "BLOCK", deletedAt: null } }),
    prisma.cmsField.count({ where: { kind: "SETTING", deletedAt: null } }),
  ]);
  console.log(
    `Estado final en DB: ${pagesAfter} páginas · ${sectionsAfter} secciones · ` +
      `${blocksAfter + settingsAfter} campos (${blocksAfter} BLOCK + ${settingsAfter} SETTING).`,
  );
  console.log("Recuerda invalidar el caché CMS desde /admin/contenido tras aplicar en STG/PRD.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
