/*
 * Global teardown de Playwright — limpieza garantizada de la homologación.
 *
 * 1. Borra los usuarios efímeros del global.setup (manifiestos POR RUN en
 *    .auth/<env>/manifest-<run>.json, auditoría 2026-11-08: dos corridas
 *    concurrentes del mismo ambiente ya no se borran entre sí — cada teardown
 *    limpia el suyo, el manifest.json legacy y manifiestos huérfanos de >2 h;
 *    el directorio solo se borra si queda vacío).
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

import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { checkDestructiveAllowed } from "../../../../../packages/db/scripts/lib/env-guard.mjs";
import {
  authStateDir,
  currentEnv,
  hasServiceSecrets,
  listAuthManifests,
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

/*
 * Merge del reporte de la auditoría responsive (Fase 5.1-5.2, 2026-10-13):
 * audit-responsive.spec.ts escribe una parte por perfil×grupo en
 * tmp/audit-20261013/parts/ (los workers corren perfiles en paralelo — cada
 * uno escribe su archivo); acá se consolidan en tmp/audit-20261013/report.json
 * y se borran las partes. No-op si la corrida no incluyó el spec.
 */
type AuditHallazgo = { severidad: "critical" | "medium" | "info"; tipo: string; detalle: string };
type AuditPantalla = { ruta: string; grupo: string; hallazgos: AuditHallazgo[] };
type AuditParte = {
  proyecto: string;
  viewport: { width: number; height: number };
  tactil: boolean;
  ambiente: string;
  generado: string;
  pantallas: AuditPantalla[];
};

function mergeAuditResponsiveReport(): void {
  // __dirname = tests/e2e/_setup (un nivel más que el spec) → 5 niveles al root.
  const outDir = resolve(__dirname, "../../../../../tmp/audit-20261013");
  const partsDir = resolve(outDir, "parts");
  if (!existsSync(partsDir)) return;
  try {
    const porPerfil = new Map<string, AuditParte>();
    for (const file of readdirSync(partsDir).filter((f) => f.endsWith(".json"))) {
      const parte = JSON.parse(readFileSync(resolve(partsDir, file), "utf8")) as AuditParte;
      const actual = porPerfil.get(parte.proyecto) ?? { ...parte, pantallas: [] };
      actual.pantallas.push(...parte.pantallas);
      porPerfil.set(parte.proyecto, actual);
    }
    const perfiles = [...porPerfil.values()].sort((a, b) => a.proyecto.localeCompare(b.proyecto));
    const contar = (p: AuditParte, sev: AuditHallazgo["severidad"]) =>
      p.pantallas.flatMap((s) => s.hallazgos).filter((h) => h.severidad === sev).length;
    const reporte = {
      generado: new Date().toISOString(),
      ambiente: perfiles[0]?.ambiente ?? null,
      resumen: perfiles.map((p) => ({
        proyecto: p.proyecto,
        viewport: p.viewport,
        pantallas: p.pantallas.length,
        critical: contar(p, "critical"),
        medium: contar(p, "medium"),
        info: contar(p, "info"),
      })),
      perfiles,
    };
    writeFileSync(resolve(outDir, "report.json"), JSON.stringify(reporte, null, 2));
    rmSync(partsDir, { recursive: true, force: true });
    console.log(
      `[e2e teardown] reporte responsive consolidado (${perfiles.length} perfiles) en tmp/audit-20261013/report.json`,
    );
  } catch (err) {
    // El merge nunca debe romper la limpieza de la homologación.
    console.warn("[e2e teardown] merge del reporte responsive falló (no bloqueante):", err);
  }
}

export default async function globalTeardown() {
  const env = currentEnv();
  loadEnvFor(env);

  // Consolidación de la auditoría responsive: independiente de secretos y de
  // la guarda de ambiente (solo mueve archivos dentro de tmp/, gitignored).
  mergeAuditResponsiveReport();

  // Auditoría 2026-11-08 — teardown seguro entre procesos Playwright
  // concurrentes del MISMO ambiente. Antes había UN manifest.json por ambiente
  // y el teardown borraba el directorio entero: la corrida A se llevaba los
  // usuarios efímeros y el storageState de la corrida B a mitad de camino.
  // Ahora el manifiesto es POR RUN y este proceso solo limpia:
  //   - su propio manifiesto (E2E_SETUP_RUN, lo fija el global.setup);
  //   - el manifest.json LEGACY (naming viejo — si existe, es residuo);
  //   - manifiestos de OTROS runs solo si llevan > 2 h (run muerto: ninguna
  //     corrida E2E dura eso — son huérfanos de procesos que murieron a mitad).
  const ownRun = process.env.E2E_SETUP_RUN;
  const ORPHAN_MANIFEST_MS = 2 * 60 * 60 * 1000;
  const manifestFiles = listAuthManifests(env).filter((f) => {
    if (f === "manifest.json") return true; // legacy: siempre es residuo
    if (ownRun && f === `manifest-${ownRun}.json`) return true;
    try {
      const age = Date.now() - statSync(resolve(authStateDir(env), f)).mtimeMs;
      return age > ORPHAN_MANIFEST_MS;
    } catch {
      return false;
    }
  });
  const guardFiles = existsSync(EVIDENCE_DIR)
    ? readdirSync(EVIDENCE_DIR).filter(
        (f) => f.startsWith(`cms-guard-${env}-`) && f.endsWith(".json"),
      )
    : [];
  if (manifestFiles.length === 0 && guardFiles.length === 0) return;

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
    // 1. Usuarios efímeros del setup (un manifiesto POR RUN — ver arriba).
    for (const file of manifestFiles) {
      const mPath = resolve(authStateDir(env), file);
      let manifest: Manifest;
      try {
        manifest = JSON.parse(readFileSync(mPath, "utf8")) as Manifest;
      } catch {
        unlinkSync(mPath); // manifiesto ilegible = residuo: fuera
        continue;
      }
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
      unlinkSync(mPath);
      console.log(`[e2e teardown] usuarios efímeros de ${manifest.run} eliminados (${env})`);
    }
    // El directorio .auth/<env> solo se borra si quedó VACÍO: los storageState
    // (admin.json/client.json) pueden estar en uso por otra corrida concurrente.
    try {
      if (readdirSync(authStateDir(env)).length === 0) {
        rmSync(authStateDir(env), { recursive: true, force: true });
      }
    } catch {
      // el directorio ya no existe o no se pudo leer: no bloqueante
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
