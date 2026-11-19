import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { enrollTotpFactor, loginAdminWithTotp } from "./_helpers/mfa";

const strip = (value: string | undefined) => value?.replace(/^["']|["']$/g, "");
const prisma = new PrismaClient();
const service = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  strip(process.env.SUPABASE_SECRET_KEY)!,
  { auth: { persistSession: false } },
);
const EMAIL = `e2e-help-${Date.now()}@example.com`;
const PASSWORD = "E2E-Help-Test-918273650";
let supabaseUserId = "";
let adminId = "";
let totpSecret = "";

test.setTimeout(120_000);

test.beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`E2E ayuda: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: EMAIL, role: "SUPERADMIN", isActive: true },
  });
  adminId = admin.id;
  totpSecret = await enrollTotpFactor(EMAIL, PASSWORD);
});

test.afterAll(async () => {
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

test("ayuda contextual reactiva, modo en /admin/ayuda, playbooks E2E, vista por rol, búsqueda y feedback funcionan de punta a punta", async ({
  page,
}) => {
  await loginAdminWithTotp(page, {
    email: EMAIL,
    password: PASSWORD,
    totpSecret,
    dismissOnboarding: false,
  });

  // 1. Bienvenida discreta en primer ingreso (compatible con dismissAdminHelpOnboarding)
  await page.getByRole("button", { name: "No mostrar automáticamente esta ruta" }).click();
  await expect(
    page.getByRole("button", { name: "No mostrar automáticamente esta ruta" }),
  ).toBeHidden();
  await expect
    .poll(async () =>
      prisma.adminHelpProgress.count({
        where: {
          adminUserId: adminId,
          guideId: "onboarding-superadmin",
          dismissedAt: { not: null },
        },
      }),
    )
    .toBe(1);

  // 2. En /admin/dashboard el botón abre ayuda de Dashboard; al navegar del lado cliente (<Link>) a Pedidos se actualiza en tiempo real
  await expect(page.getByRole("button", { name: "Abrir ayuda de Dashboard" })).toBeVisible();
  const mobileMenuButton = page.getByRole("button", { name: "Abrir menú" });
  if (await mobileMenuButton.isVisible()) {
    await mobileMenuButton.click();
  }
  await page.getByRole("link", { name: "Pedidos", exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/pedidos$/);
  await expect(page.getByRole("button", { name: "Abrir ayuda de Pedidos" })).toBeVisible();

  await page.getByRole("button", { name: "Abrir ayuda de Pedidos" }).click();
  await expect(page.getByRole("heading", { name: "Ayuda de Pedidos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Procedimientos paso a paso" })).toBeVisible();
  await page.getByRole("link", { name: "Abrir en el Centro de ayuda" }).click();
  await expect(page).toHaveURL(/\/admin\/ayuda\?guia=pedidos/);
  await expect(page.getByRole("heading", { name: "Pedidos", exact: true })).toBeVisible();

  // 3. Dentro de /admin/ayuda?guia=pedidos el botón flotante se transforma en «Índice rápido»
  await expect(
    page.getByRole("button", { name: "Abrir índice y buscador rápido de ayuda" }),
  ).toBeVisible();

  // 4. Checklist operativo paso a paso y feedback persistidos en BD
  await page.getByRole("button", { name: "Iniciar recorrido interactivo" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("Paso 2 de 4")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar recorrido" }).click();
  await expect
    .poll(async () =>
      prisma.adminHelpProgress.count({
        where: { adminUserId: adminId, guideId: "pedidos", currentStep: 1 },
      }),
    )
    .toBe(1);

  await page.getByRole("button", { name: "Sí, me ayudó" }).click();
  await expect(page.getByText("Gracias por ayudarnos a mejorar esta guía.")).toBeVisible();
  await expect
    .poll(async () =>
      prisma.adminHelpFeedback.count({
        where: { adminUserId: adminId, guideId: "pedidos", isHelpful: true },
      }),
    )
    .toBe(1);

  // 5. En la portada de /admin/ayuda el botón flotante se oculta; funcionan pestañas, Playbooks, vista por rol y buscador
  await page.goto("/admin/ayuda");
  await expect(
    page.getByRole("button", { name: "Abrir índice y buscador rápido de ayuda" }),
  ).toBeHidden();

  await page.getByRole("button", { name: /2\. Flujos E2E/i }).click();
  await expect(
    page.getByRole("heading", { name: "Flujos transversales de punta a punta (Playbooks E2E)" }),
  ).toBeVisible();

  await page.getByLabel("Ver ayuda como rol:").selectOption("PRINT_WORKSHOP");
  await expect(page).toHaveURL(/rol=PRINT_WORKSHOP/);
  await expect(page.getByText(/Modo vista previa por rol/i)).toBeVisible();
  await page.getByRole("link", { name: "Volver a mi vista (Administradora)" }).click();
  await expect(page).not.toHaveURL(/rol=PRINT_WORKSHOP/);
  await expect(page.getByText(/Modo vista previa por rol/i)).toBeHidden();

  await page.getByRole("searchbox", { name: "Buscar en las guías" }).fill("conciliar remesa");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/q=conciliar\+remesa/);
  await expect(
    page.getByRole("heading", { name: "Conciliación contraentrega", exact: true }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});
