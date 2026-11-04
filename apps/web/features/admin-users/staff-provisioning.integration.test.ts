import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && process.env.DATABASE_URL);

describe.skipIf(!HAS_SUPABASE)(
  "provisionStaffAdmin — alta limpia de staff sin contaminar Customer ni Contact",
  () => {
    const service = HAS_SUPABASE
      ? createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

    const createdAdminIds: string[] = [];
    const createdCustomerIds: string[] = [];
    const createdAuthUserIds: string[] = [];

    afterAll(async () => {
      if (createdAdminIds.length > 0) {
        await prisma.adminUser
          .deleteMany({ where: { id: { in: createdAdminIds } } })
          .catch(() => {});
      }
      if (createdCustomerIds.length > 0) {
        await prisma.customer
          .deleteMany({ where: { id: { in: createdCustomerIds } } })
          .catch(() => {});
      }
      if (service) {
        for (const authId of createdAuthUserIds) {
          await service.auth.admin.deleteUser(authId).catch(() => {});
        }
      }
    });

    it("aprovisiona un nuevo miembro PRINT_WORKSHOP en auth.users + AdminUser dejando Customer y Contact intactos", async () => {
      const { provisionStaffAdmin, AdminUserValidationError } =
        await import("@/features/admin-users/service");

      const suffix = randomUUID().slice(0, 8);
      const staffEmail = `staff-taller-${suffix}@lucams.test`;

      const [customersBefore, contactsBefore] = await Promise.all([
        prisma.customer.count(),
        prisma.contact.count(),
      ]);

      const provisioned = await provisionStaffAdmin(staffEmail, "PRINT_WORKSHOP", "actor_super_1");
      createdAdminIds.push(provisioned.id);
      createdAuthUserIds.push(provisioned.supabaseUserId);

      const [customersAfter, contactsAfter, customerMatch] = await Promise.all([
        prisma.customer.count(),
        prisma.contact.count(),
        prisma.customer.findUnique({ where: { email: staffEmail } }),
      ]);

      expect(provisioned.email).toBe(staffEmail);
      expect(provisioned.role).toBe("PRINT_WORKSHOP");
      expect(provisioned.isActive).toBe(true);
      expect(provisioned.supabaseUserId).toBeTruthy();

      // Invariante crítica: 0 filas creadas en Customer y 0 filas creadas en Contact
      expect(customerMatch).toBeNull();
      expect(customersAfter).toBe(customersBefore);
      expect(contactsAfter).toBe(contactsBefore);

      // Segundo intento sobre un admin ya existente → rechazo limpio de validación
      await expect(
        provisionStaffAdmin(staffEmail, "OPERATIONS_MANAGER", "actor_super_1"),
      ).rejects.toBeInstanceOf(AdminUserValidationError);
    });

    it("reutiliza el supabaseUserId cuando el correo ya pertenece a un Customer existente sin duplicar auth.users", async () => {
      const { provisionStaffAdmin } = await import("@/features/admin-users/service");

      const suffix = randomUUID().slice(0, 8);
      const existingEmail = `existing-staff-${suffix}@lucams.test`;

      const { data: authCreated, error: authErr } = await service!.auth.admin.createUser({
        email: existingEmail,
        email_confirm: true,
      });
      expect(authErr).toBeNull();
      const authId = authCreated.user!.id;
      createdAuthUserIds.push(authId);

      const customer = await prisma.customer.create({
        data: {
          email: existingEmail,
          supabaseUserId: authId,
          firstName: "Persona",
          lastName: "Existente",
          referralCode: `REF-${suffix.toUpperCase()}`,
        },
      });
      createdCustomerIds.push(customer.id);

      const customersBefore = await prisma.customer.count();
      const provisioned = await provisionStaffAdmin(
        existingEmail,
        "FINANCE_ANALYST",
        "actor_super_1",
      );
      createdAdminIds.push(provisioned.id);
      const customersAfter = await prisma.customer.count();

      expect(provisioned.supabaseUserId).toBe(authId);
      expect(provisioned.role).toBe("FINANCE_ANALYST");
      expect(customersAfter).toBe(customersBefore);
    });
  },
);
