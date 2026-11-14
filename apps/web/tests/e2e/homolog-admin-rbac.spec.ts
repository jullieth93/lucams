import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { AdminRole } from "@lucams/db";
import { baseUrlFor, extraHeadersFor, strip } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import { enrollTotpFactor, loginAdminWithTotp } from "./_helpers/mfa";

const run = newRunId("admin-rbac");
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const cases: Array<{
  role: Exclude<AdminRole, "SUPERADMIN">;
  home: string;
  allowed: string;
  denied: string;
}> = [
  {
    role: "OPERATIONS_MANAGER",
    home: "/admin/dashboard",
    allowed: "/admin/productos",
    denied: "/admin/finanzas",
  },
  {
    role: "CUSTOMER_SUPPORT",
    home: "/admin/dashboard",
    allowed: "/admin/soporte",
    denied: "/admin/productos",
  },
  {
    role: "PRINT_WORKSHOP",
    home: "/admin/dashboard",
    allowed: "/admin/moderacion",
    denied: "/admin/clientes",
  },
  {
    role: "FINANCE_ANALYST",
    home: "/admin/dashboard",
    allowed: "/admin/finanzas",
    denied: "/admin/productos",
  },
  {
    role: "MANAGER",
    home: "/admin/dashboard",
    allowed: "/admin/cotizaciones",
    denied: "/admin/finanzas",
  },
  {
    role: "FULFILLMENT",
    home: "/admin/dashboard",
    allowed: "/admin/pedidos",
    denied: "/admin/productos",
  },
  {
    role: "CMS_EDITOR",
    home: "/admin/contenido",
    allowed: "/admin/contenido",
    denied: "/admin/pedidos",
  },
];

test.skip(E2E_ENV === "prd", "Crea usuarios admin efímeros: prohibido en PRD.");

test.afterAll(async () => {
  await disconnectDb();
});

for (const { role, home, allowed, denied } of cases) {
  test(`RBAC real: ${role} entra con MFA, accede a ${allowed} y no a ${denied}`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const email = `${run}-${role.toLowerCase()}@e2e.test`;
    const password = `E2E-${randomBytes(24).toString("base64url")}`;
    let authUserId = "";
    const context = await browser.newContext({
      baseURL: baseUrlFor(E2E_ENV),
      extraHTTPHeaders: extraHeadersFor(E2E_ENV),
      ignoreHTTPSErrors: true,
    });

    try {
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      expect(error, `crear auth user ${role}`).toBeNull();
      authUserId = data.user!.id;
      await db().adminUser.create({
        data: { supabaseUserId: authUserId, email, role, isActive: true },
      });
      const totpSecret = await enrollTotpFactor(email, password);
      const page = await context.newPage();

      await loginAdminWithTotp(page, { email, password, totpSecret, homePath: home });
      await expect(page).toHaveURL(new RegExp(`${home}(?:\\?.*)?$`));

      await page.goto(allowed, { waitUntil: "domcontentloaded" });
      await page.waitForURL((url) => url.pathname === allowed, { timeout: 20_000 });
      await expect(page.getByText(/algo salió mal/i)).toHaveCount(0);

      await page.goto(denied, { waitUntil: "domcontentloaded" });
      await page.waitForURL(
        (url) => url.pathname === home && url.searchParams.get("denied") === "1",
        { timeout: 20_000 },
      );
    } finally {
      await context.close();
      if (authUserId) {
        await db().adminUser.deleteMany({ where: { supabaseUserId: authUserId } });
        const { error } = await service.auth.admin.deleteUser(authUserId);
        expect(error, `borrar auth user ${role}`).toBeNull();
      }
    }
  });
}
