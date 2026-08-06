/*
 * Global teardown de Playwright — limpieza garantizada de la homologación.
 *
 * 1. Borra los usuarios efímeros del global.setup (manifest .auth/<env>/).
 *    "Nada queda sin limpiar" (regla dura del prompt).
 * 2. Red de seguridad del CMS: si un spec de homologación murió a mitad con
 *    una variante de prueba publicada, queda un guard file
 *    `apps/web/tmp/e2e-homologacion/cms-guard-<env>-*.json` con el estado
 *    publicado ORIGINAL. Acá se restaura por DB (mismo modelo que
 *    features/cms/service.ts: publishedVersionId + isPublished + body).
 *
 * Respeta la guarda de ambiente del repo: si el destino está bloqueado (PRD /
 * remoto desconocido) no toca nada y avisa — igual que vitest-global-teardown.
 */

import { existsSync, readdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { checkDestructiveAllowed } from "../../../../../packages/db/scripts/lib/env-guard.mjs";
import {
  authManifestPath,
  authStateDir,
  currentEnv,
  hasServiceSecrets,
  loadEnvFor,
  strip,
} from "./env";

const EVIDENCE_DIR = resolve(__dirname, "../../../tmp/e2e-homologacion");

type Manifest = {
  run: string;
  admin?: { supabaseUserId: string; adminId: string; email: string };
  client?: { supabaseUserId: string; email: string };
};

type CmsGuard = {
  fieldKey: string;
  run: string;
  original: { body: string; publishedVersionId: string | null; isPublished: boolean };
};

export default async function globalTeardown() {
  const env = currentEnv();
  loadEnvFor(env);

  const manifestPath = authManifestPath(env);
  const hasManifest = existsSync(manifestPath);
  const guardFiles = existsSync(EVIDENCE_DIR)
    ? readdirSync(EVIDENCE_DIR).filter(
        (f) => f.startsWith(`cms-guard-${env}-`) && f.endsWith(".json"),
      )
    : [];
  if (!hasManifest && guardFiles.length === 0) return;

  if (!hasServiceSecrets() || !process.env.DATABASE_URL) {
    console.warn("[e2e teardown] sin secretos de servicio; limpieza omitida (revisar a mano).");
    return;
  }
  const guard = checkDestructiveAllowed();
  if (!guard.allowed) {
    console.warn(`[e2e teardown] limpieza OMITIDA por env-guard: ${guard.reason}`);
    return;
  }

  const prisma = new PrismaClient();
  const service = createClient(
    strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    strip(process.env.SUPABASE_SECRET_KEY)!,
    { auth: { persistSession: false } },
  );

  try {
    // 1. Usuarios efímeros del setup.
    if (hasManifest) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
      if (manifest.admin) {
        await prisma.adminRecoveryCode
          .deleteMany({ where: { adminUserId: manifest.admin.adminId } })
          .catch(() => {});
        await prisma.adminUser
          .deleteMany({ where: { id: manifest.admin.adminId } })
          .catch(() => {});
        await service.auth.admin.deleteUser(manifest.admin.supabaseUserId).catch(() => {});
      }
      if (manifest.client) {
        // Dependientes primero (Restrict): sin esto el delete del Customer
        // fallaba en silencio y quedaban filas "Prueba…" vivas (2026-08-06).
        const cust = await prisma.customer.findMany({
          where: { supabaseUserId: manifest.client.supabaseUserId },
          select: { id: true },
        });
        const custIds = cust.map((c) => c.id);
        if (custIds.length > 0) {
          await prisma.address
            .deleteMany({ where: { customerId: { in: custIds } } })
            .catch(() => {});
          await prisma.review
            .deleteMany({ where: { customerId: { in: custIds } } })
            .catch(() => {});
          await prisma.wishlistItem
            .deleteMany({ where: { customerId: { in: custIds } } })
            .catch(() => {});
          await prisma.backInStockSubscription
            .deleteMany({ where: { customerId: { in: custIds } } })
            .catch(() => {});
          const orders = await prisma.order.findMany({
            where: { customerId: { in: custIds } },
            select: { id: true },
          });
          const orderIds = orders.map((o) => o.id);
          if (orderIds.length > 0) {
            await prisma.orderItem
              .deleteMany({ where: { orderId: { in: orderIds } } })
              .catch(() => {});
            await prisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
          }
        }
        await prisma.customer
          .deleteMany({ where: { supabaseUserId: manifest.client.supabaseUserId } })
          .catch(() => {});
        await service.auth.admin.deleteUser(manifest.client.supabaseUserId).catch(() => {});
      }
      rmSync(authStateDir(env), { recursive: true, force: true });
      console.log(`[e2e teardown] usuarios efímeros de ${manifest.run} eliminados (${env})`);
    }

    // 2. Red de seguridad CMS: restaurar campos cuya variante de prueba siga viva.
    for (const file of guardFiles) {
      const path = resolve(EVIDENCE_DIR, file);
      try {
        const g = JSON.parse(readFileSync(path, "utf8")) as CmsGuard;
        const field = await prisma.cmsField.findUnique({
          where: { key: g.fieldKey },
          include: { publishedVersion: { select: { body: true } } },
        });
        const live = field?.publishedVersion?.body ?? "";
        if (field && live.includes(g.run)) {
          await prisma.cmsField.update({
            where: { id: field.id },
            data: {
              body: g.original.body,
              isPublished: g.original.isPublished,
              publishedVersionId: g.original.publishedVersionId,
              updatedBy: "e2e-teardown",
            },
          });
          console.warn(
            `[e2e teardown] ⚠️ ${g.fieldKey} quedó con la variante ${g.run} publicada; ` +
              "restaurado al estado original por la red de seguridad.",
          );
        }
        // Si ya no contiene el RUN (spec revirtió bien), solo se borra el guard.
        unlinkSync(path);
      } catch (err) {
        console.error(`[e2e teardown] error procesando ${file}:`, err);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
