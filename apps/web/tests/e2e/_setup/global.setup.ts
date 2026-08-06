/*
 * Global setup de Playwright — storageState por ambiente (homologación E2E).
 *
 * SOLO actúa cuando E2E_AUTH=1 (corridas de homologación). Sin esa flag es un
 * no-op: el gate de CI corre sin GoTrue real y los specs que necesitan auth se
 * saltan solos (fixtures/auth.ts verifica que el state file exista).
 *
 * Qué hace con E2E_AUTH=1 (LOCAL y STG — PRD está PROHIBIDO y se rechaza):
 *   1. Guarda de ambiente del repo (env-guard.mjs): nunca crear usuarios en PRD
 *      ni en remotos desconocidos.
 *   2. Crea un admin y un cliente EFÍMEROS vía service role (precedente del
 *      repo: release-check-a1 / cms-editing-flow / admin-mfa / catalog-mode).
 *      El admin real tiene MFA enrolado y su secret TOTP no está disponible
 *      para automatización; el efímero recorre el mismo login por UI y se
 *      borra en el teardown. El reto MFA tiene su propio spec (admin-mfa).
 *   3. Login por UI de cada uno y guarda el storageState en
 *      tests/e2e/.auth/<env>/{admin,client}.json (gitignored).
 *   4. Escribe .auth/<env>/manifest.json con los ids creados: el teardown los
 *      borra aunque los specs mueran a mitad.
 */

import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
// Guarda de ambiente compartida con los scripts destructivos del repo.
import { checkDestructiveAllowed } from "../../../../../packages/db/scripts/lib/env-guard.mjs";
import {
  authManifestPath,
  authStatePath,
  baseUrlFor,
  currentEnv,
  ensureAuthStateDir,
  extraHeadersFor,
  hasServiceSecrets,
  loadEnvFor,
  strip,
} from "./env";

const ADMIN_PASSWORD = "E2E-Setup-Admin-918273650";
const CLIENT_PASSWORD = "E2E-Setup-Client-918273650";

export default async function globalSetup() {
  const env = currentEnv();
  loadEnvFor(env);

  if (process.env.E2E_AUTH !== "1") {
    console.log(
      `[e2e setup] E2E_AUTH≠1 → sin storageState (ambiente ${env}; specs con auth se saltan)`,
    );
    return;
  }
  if (env === "prd") {
    throw new Error(
      "[e2e setup] E2E_AUTH=1 PROHIBIDO en PRD: crear usuarios es una mutación. " +
        "En producción solo corren specs de lectura (E2E_AUTH sin definir).",
    );
  }

  const guard = checkDestructiveAllowed();
  if (!guard.allowed) {
    throw new Error(`[e2e setup] BLOQUEADO por env-guard: ${guard.reason}`);
  }
  if (guard.bypassed) console.warn(`[e2e setup] ${guard.reason}`);

  if (!hasServiceSecrets() || !process.env.DATABASE_URL) {
    console.warn(
      "[e2e setup] faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / DATABASE_URL; " +
        "no se generan storageStates (los specs con auth se saltarán).",
    );
    return;
  }

  const baseURL = baseUrlFor(env);
  const run = `e2e-setup-${env}-${Date.now()}`;
  const prisma = new PrismaClient();
  const service = createClient(
    strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    strip(process.env.SUPABASE_SECRET_KEY)!,
    { auth: { persistSession: false } },
  );

  const adminEmail = `${run}-admin@example.com`;
  const clientEmail = `${run}-client@example.com`;

  // 2. Usuarios efímeros (auth.users pre-confirmados + fila AdminUser).
  const { data: adminAuth, error: adminErr } = await service.auth.admin.createUser({
    email: adminEmail,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (adminErr || !adminAuth.user) {
    throw new Error(`[e2e setup] no se pudo crear el admin efímero: ${adminErr?.message}`);
  }
  const admin = await prisma.adminUser.create({
    data: {
      supabaseUserId: adminAuth.user.id,
      email: adminEmail,
      role: "SUPERADMIN",
      isActive: true,
    },
    select: { id: true },
  });

  const { data: clientAuth, error: clientErr } = await service.auth.admin.createUser({
    email: clientEmail,
    password: CLIENT_PASSWORD,
    email_confirm: true,
  });
  if (clientErr || !clientAuth.user) {
    // Sin el cliente no hay paridad admin/cliente — pero el admin ya quedó
    // creado: lo limpiamos acá para no dejar residuo si abortamos.
    await prisma.adminUser.deleteMany({ where: { id: admin.id } }).catch(() => {});
    await service.auth.admin.deleteUser(adminAuth.user.id).catch(() => {});
    throw new Error(`[e2e setup] no se pudo crear el cliente efímero: ${clientErr?.message}`);
  }

  ensureAuthStateDir(env);

  // 3. Login por UI → storageState. El contexto lleva el baseURL y el bypass
  // del ambiente (los use.* del config NO se heredan a contextos manuales).
  const browser = await chromium.launch(
    process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {},
  );
  try {
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: extraHeadersFor(env),
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    // Admin (sin MFA → entra directo al dashboard; patrón catalog-mode.spec).
    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"]').fill(adminEmail);
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 30_000 });
    await context.storageState({ path: authStatePath(env, "admin") });

    // Cliente (login de storefront → redirect a "/" en éxito).
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"]').fill(clientEmail);
    await page.locator('input[name="password"]').fill(CLIENT_PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión|entrar|ingresar/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
    await context.storageState({ path: authStatePath(env, "client") });

    await context.close();
  } finally {
    await browser.close();
  }

  // 4. Manifiesto para el teardown (borrado garantizado de los efímeros).
  writeFileSync(
    authManifestPath(env),
    JSON.stringify(
      {
        run,
        env,
        createdAt: new Date().toISOString(),
        admin: { supabaseUserId: adminAuth.user.id, adminId: admin.id, email: adminEmail },
        client: { supabaseUserId: clientAuth.user.id, email: clientEmail },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
  console.log(
    `[e2e setup] storageState admin+client listos para ${env} (run ${run}) en ${baseURL}`,
  );
}
