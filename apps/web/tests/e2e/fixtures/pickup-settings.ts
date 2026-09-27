/*
 * Settings BUSINESS de recogida Aveonline para el E2E transaccional sandbox.
 *
 * La guía post-pago (saga → Aveonline createShipment) exige 5 SiteSettings
 * (PICKUP_CITY/DEPARTMENT/ADDRESS/PHONE/CONTACT_NAME) que en dev/STG se
 * configuran a mano en /admin/contenido/paginas/global (sección "Negocio").
 * NINGÚN seed del repo los crea (cms-site-map solo declara la sección), así
 * que una DB desde cero (localstack de CI, nightly e2e-wompi-sandbox) llega
 * sin ellos → shipment_failed y el spec hace timeout esperando trackingNumber
 * (run 36325762084, 2026-09-27). Este helper los siembra IDEMPOTENTE:
 *   - si la key ya existe publicada (dev/STG), NO se toca;
 *   - si no existe, se crea la cadena completa que el lector exige
 *     (CmsPage global → CmsSection negocio → CmsField SETTING con versión 1
 *     publicada y publishedVersionId — mismo patrón que createCmsField del
 *     service admin, features/cms/service.ts);
 *   - si la key existe pero SIN versión publicada, lanza (config a medias:
 *     no se pisa contenido del admin desde un test).
 *
 * Valores: Bogotá/Cundinamarca (mismo origen que el fallback del cotizador,
 * features/checkout/service.ts — ruta con cobertura verificada en sandbox) y
 * dirección/teléfono/contacto de prueba. El lector (lib/cms.ts toSettingData)
 * lee el body de la publishedVersion, no el del field.
 *
 * OJO cache: getSiteSetting va con unstable_cache (tag "cms", TTL 1h) DENTRO
 * del server — el seed debe correr ANTES de la primera lectura (en CI el
 * server arranca fresco y el beforeAll siembra antes de navegar).
 */

import { db } from "./db";

const PAGE_SLUG = "global";
const SECTION_KEY = "negocio";

const PICKUP_SETTINGS = [
  {
    key: "PICKUP_CITY",
    type: "TEXT",
    label: "Ciudad de recogida",
    value: "Bogotá",
  },
  {
    key: "PICKUP_DEPARTMENT",
    type: "TEXT",
    label: "Departamento de recogida",
    value: "Cundinamarca",
  },
  {
    key: "PICKUP_ADDRESS",
    type: "TEXT",
    label: "Dirección de recogida",
    value: "Calle 10 # 15-20",
  },
  {
    key: "PICKUP_PHONE",
    type: "PHONE",
    label: "Teléfono de recogida",
    value: "3001234567",
  },
  {
    key: "PICKUP_CONTACT_NAME",
    type: "TEXT",
    label: "Contacto de recogida",
    value: "Lucams Shop E2E",
  },
] as const;

export type PickupSettingsHandle = {
  /** Keys que el spec CREÓ (las demás ya existían y no se tocan). */
  createdKeys: string[];
  /** Borra SOLO lo creado por ensurePickupSettings en esta corrida. */
  cleanup: () => Promise<void>;
};

export async function ensurePickupSettings(): Promise<PickupSettingsHandle> {
  const prisma = db();

  // Página "global" + sección "negocio" (las crea migrate-cms-v2 en dev/STG;
  // en una DB scratch de CI no existen). Registra qué creó para el cleanup.
  let createdPageId: string | null = null;
  let createdSectionId: string | null = null;

  let page = await prisma.cmsPage.findUnique({ where: { slug: PAGE_SLUG } });
  if (!page) {
    page = await prisma.cmsPage.create({
      data: {
        slug: PAGE_SLUG,
        title: "Ajustes del sitio",
        description:
          "Valores globales: contacto, redes sociales, WhatsApp, negocio y enlaces externos.",
        icon: "Settings",
        sortOrder: 190,
      },
    });
    createdPageId = page.id;
  }
  let section = await prisma.cmsSection.findUnique({
    where: { pageId_key: { pageId: page.id, key: SECTION_KEY } },
  });
  if (!section) {
    section = await prisma.cmsSection.create({
      data: { pageId: page.id, key: SECTION_KEY, title: "Negocio", sortOrder: 40 },
    });
    createdSectionId = section.id;
  }

  const createdKeys: string[] = [];
  for (const s of PICKUP_SETTINGS) {
    const existing = await prisma.cmsField.findUnique({
      where: { key: s.key },
      include: { publishedVersion: { select: { id: true } } },
    });
    if (existing && !existing.deletedAt) {
      if (!existing.isPublished || !existing.publishedVersion) {
        throw new Error(
          `Setting ${s.key} existe pero NO está publicado (config a medias en ` +
            `/admin/contenido/paginas/global). El test no pisa contenido del admin: ` +
            `publícalo a mano o bórralo para que el spec lo siembre.`,
        );
      }
      continue; // ya existía publicado (dev/STG) — no tocar.
    }
    // Mismo patrón que createCmsField(kind SETTING): nace publicado, con la
    // versión 1 viva y publishedVersionId apuntando a ella.
    await prisma.$transaction(async (tx) => {
      const field = await tx.cmsField.create({
        data: {
          sectionId: section.id,
          key: s.key,
          kind: "SETTING",
          label: s.label,
          type: s.type,
          category: "BUSINESS",
          body: s.value,
          isPublished: true,
          createdBy: "e2e-wompi-sandbox",
        },
      });
      const v1 = await tx.cmsFieldVersion.create({
        data: {
          fieldId: field.id,
          version: 1,
          title: s.label,
          body: s.value,
          publishedAt: new Date(),
          createdBy: "e2e-wompi-sandbox",
        },
      });
      await tx.cmsField.update({
        where: { id: field.id },
        data: { publishedVersionId: v1.id },
      });
    });
    createdKeys.push(s.key);
  }

  const cleanup = async () => {
    // Hard delete solo de lo creado acá (las versiones caen en cascada).
    if (createdKeys.length > 0) {
      await prisma.cmsField.deleteMany({ where: { key: { in: createdKeys } } }).catch(() => {});
    }
    // La sección/página solo se borran si las creó este spec Y quedaron vacías
    // (nunca arrastrar contenido ajeno).
    if (createdSectionId) {
      const left = await prisma.cmsField.count({ where: { sectionId: createdSectionId } });
      if (left === 0)
        await prisma.cmsSection.delete({ where: { id: createdSectionId } }).catch(() => {});
    }
    if (createdPageId) {
      const left = await prisma.cmsSection.count({ where: { pageId: createdPageId } });
      if (left === 0) await prisma.cmsPage.delete({ where: { id: createdPageId } }).catch(() => {});
    }
  };

  return { createdKeys, cleanup };
}
