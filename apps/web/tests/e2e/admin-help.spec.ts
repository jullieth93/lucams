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

test("ayuda contextual, onboarding, recorrido, búsqueda y feedback funcionan de punta a punta", async ({
  page,
}) => {
  await loginAdminWithTotp(page, { email: EMAIL, password: PASSWORD, totpSecret });

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

  await page.goto("/admin/pedidos");
  await page.getByRole("button", { name: "Abrir ayuda de Pedidos" }).click();
  await expect(page.getByRole("heading", { name: "Ayuda de Pedidos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Procedimientos paso a paso" })).toBeVisible();
  await page.getByRole("link", { name: "Abrir en el Centro de ayuda" }).click();
  await expect(page).toHaveURL(/\/admin\/ayuda\?guia=pedidos/);
  await expect(page.getByRole("heading", { name: "Pedidos", exact: true })).toBeVisible();

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

  await page.goto("/admin/ayuda");
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
