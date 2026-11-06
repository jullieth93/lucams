import { expect, test } from "@playwright/test";
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
const EMAIL = `e2e-lifecycle-${Date.now()}@example.com`;
const PASSWORD = "E2E-Lifecycle-Test-918273650";
const JOURNEY_KEY = `e2e-journey-${Date.now()}`;
let supabaseUserId = "";
let adminId = "";
let totpSecret = "";

test.beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`E2E lifecycle: ${error?.message}`);
  supabaseUserId = data.user.id;
  const admin = await prisma.adminUser.create({
    data: { supabaseUserId, email: EMAIL, role: "SUPERADMIN", isActive: true },
  });
  adminId = admin.id;
  totpSecret = await enrollTotpFactor(EMAIL, PASSWORD);
});

test.afterAll(async () => {
  await prisma.lifecycleJourney.deleteMany({ where: { key: JOURNEY_KEY } }).catch(() => {});
  if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

test("admin crea, versiona, activa y pausa un recorrido sin enviar correos reales", async ({
  page,
}) => {
  await loginAdminWithTotp(page, { email: EMAIL, password: PASSWORD, totpSecret });

  await page.goto("/admin/lifecycle");
  await expect(
    page.getByRole("heading", { name: "Lifecycle Journeys", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Primera compra", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Nuevo recorrido" }).click();
  await page.getByLabel("Clave única").fill(JOURNEY_KEY);
  await page.getByLabel("Nombre visible").fill("Recorrido E2E");
  await page
    .getByLabel("Propósito del recorrido")
    .fill("Validar configuración completa sin contactos reales.");
  await page.getByLabel("Asunto").fill("Mensaje de prueba E2E");
  await page.getByLabel("Preheader").fill("Preheader de prueba E2E");
  await page.getByLabel("Titular del correo").fill("Titular de prueba E2E");
  await page.getByLabel("Contenido").fill("Hola {nombre}. Este es un recorrido de prueba E2E.");
  await page.getByLabel("Texto del botón").fill("Explorar productos");
  await page.getByRole("button", { name: "Crear borrador" }).click();

  await expect(page).toHaveURL(/\/admin\/lifecycle\/[a-z0-9]+/);
  await expect(page.getByRole("heading", { name: "Recorrido E2E", exact: true })).toBeVisible();
  await expect(page.getByText("Audiencia elegible ahora")).toBeVisible();

  await page.getByRole("button", { name: "Activar", exact: true }).click();
  await expect(page.getByText("Estado actualizado a ACTIVE.")).toBeVisible();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(page.getByText("Estado actualizado a PAUSED.")).toBeVisible();

  await page.getByLabel("Nombre visible").fill("Recorrido E2E actualizado");
  await page.getByRole("button", { name: "Guardar recorrido" }).click();
  await expect(page.getByText("Recorrido actualizado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recorrido E2E actualizado" })).toBeVisible();
  await expect(page.getByText(/versión 4/)).toBeVisible();
});
