/*
 * Tests de integración de los helpers de AUTENTICACIÓN server-side (lib/auth.ts).
 *
 * SUT: getCurrentUser / getCurrentCustomer / getCurrentAdmin — resuelven la
 * sesión de Supabase y, sobre ella, la fila Customer / AdminUser asociada por
 * supabaseUserId, aplicando los filtros de negocio (deletedAt:null en ambos;
 * isActive:true adicional en admin).
 *
 * Estrategia: DB+COOKIES, híbrida.
 *   - La resolución de SESIÓN se MOCKEA: sustituimos `@/lib/supabase/server`
 *     por un doble que devuelve `auth.getUser()` con la forma real
 *     ({ data: { user }, error }). Un helper `setSession()` controla, por test,
 *     si hay sesión (user con id) o no (user:null) → determinista y OFFLINE,
 *     sin cookies reales ni Auth server.
 *   - La resolución de ROL/FILA usa la DB REAL vía prisma (Customer/AdminUser),
 *     porque es exactamente lo que el SUT consulta. Requiere DATABASE_URL; sin
 *     ella el bloque se salta (skipIf) para no romper CI sin DB.
 *
 * Por qué mockear supabase y NO prisma: el valor bajo prueba es el JOIN entre
 * "hay sesión con este user.id" y "existe fila activa para ese id". Mockear
 * prisma volvería el test tautológico (probaría el mock, no el filtro real de
 * deletedAt/isActive que corre en Postgres).
 *
 * AISLAMIENTO ESTRICTO (nunca tocar datos reales / cuenta de Lucy):
 *   - Todo registro lleva el prefijo único `RUN` en email / supabaseUserId /
 *     referralCode. La limpieza en afterAll borra EXACTAMENTE lo creado, SCOPED
 *     al prefijo. JAMÁS un deleteMany sin filtro.
 *
 * El comportamiento esperado se verificó contra la fuente (lib/auth.ts) antes de
 * fijar las aserciones:
 *   - getCurrentUser: retorna `data.user` tal cual (objeto o null). No lanza.
 *   - getCurrentCustomer: null si no hay sesión O no hay Customer (deletedAt:null)
 *     para user.id; si hay, { user, customer }.
 *   - getCurrentAdmin: null si no hay sesión O no hay AdminUser con
 *     isActive:true Y deletedAt:null; si hay, { user, admin }.
 *
 * Correr solo este archivo:
 *   cd apps/web && ../../packages/db/node_modules/.bin/dotenv -e ../../.env.local \
 *     -- node_modules/.bin/vitest run lib/auth.integration.test.ts
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const hasDb = Boolean(process.env.DATABASE_URL);

// ───────────────────────── Mock de la sesión (supabase server) ─────────────────────────
//
// Estado de sesión controlado por test. `setSession(user)` define qué devuelve
// `auth.getUser()`; `clearSession()` simula "sin sesión" (user:null). El objeto
// devuelto imita la forma real de @supabase/supabase-js: { data: { user }, error }.

type FakeUser = { id: string; email?: string; [k: string]: unknown } | null;

let sessionUser: FakeUser = null;
// Contador de llamadas a getUser() → permite asertar que cada helper contacta
// al Auth server una vez (no confía en getSession()).
let getUserCalls = 0;

function setSession(user: NonNullable<FakeUser>) {
  sessionUser = user;
}
function clearSession() {
  sessionUser = null;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => {
        getUserCalls += 1;
        return { data: { user: sessionUser }, error: null };
      }),
    },
  })),
}));

// Importamos el SUT DESPUÉS del mock (hoisting de vi.mock lo garantiza, pero lo
// mantenemos explícito). "server-only" lo aliasa vitest a un stub no-op.
import { getCurrentAdmin, getCurrentCustomer, getCurrentUser } from "./auth";

// ───────────────────────── Fixtures RUN-scoped ─────────────────────────

const RUN = `ITESTAUTH${Date.now()}${Math.floor(Math.random() * 1e6)}`.toUpperCase();
let seq = 0;
function nextId() {
  seq += 1;
  return `${RUN}-${seq}`;
}

// Un supabaseUserId nuevo para cada escenario → evita colisiones con el @unique.
function newSub() {
  return `${nextId()}-sub`;
}

async function makeCustomer(
  supabaseUserId: string,
  over: Partial<{ email: string; firstName: string; deletedAt: Date | null }> = {},
) {
  const id = nextId();
  return prisma.customer.create({
    data: {
      email: over.email ?? `${id}@auth.test`,
      supabaseUserId,
      referralCode: `${id}-ref`,
      firstName: over.firstName ?? "Cust",
      lastName: "Test",
      deletedAt: over.deletedAt ?? null,
    },
  });
}

async function makeAdmin(
  supabaseUserId: string,
  over: Partial<{
    email: string;
    role: "SUPERADMIN" | "MANAGER" | "FULFILLMENT";
    isActive: boolean;
    deletedAt: Date | null;
  }> = {},
) {
  const id = nextId();
  return prisma.adminUser.create({
    data: {
      email: over.email ?? `${id}@admin.test`,
      supabaseUserId,
      role: over.role ?? "MANAGER",
      isActive: over.isActive ?? true,
      deletedAt: over.deletedAt ?? null,
    },
  });
}

describe.skipIf(!hasDb)("lib/auth — integración (sesión Supabase mockeada + DB real)", () => {
  afterAll(async () => {
    // Limpieza SCOPED al prefijo RUN. Sin FKs cruzadas entre AdminUser y Customer
    // (comparten auth.user, no relación Prisma) → orden indistinto. JAMÁS sin filtro.
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.customer.deleteMany({ where: { email: { startsWith: RUN } } });
  });

  afterEach(() => {
    clearSession();
    getUserCalls = 0;
    vi.clearAllMocks();
  });

  // ═══════════════════════════ getCurrentUser ═══════════════════════════

  describe("getCurrentUser", () => {
    it("retorna null cuando no hay sesión (data.user === null)", async () => {
      clearSession();
      await expect(getCurrentUser()).resolves.toBeNull();
    });

    it("retorna el objeto user tal cual cuando hay sesión", async () => {
      const user = { id: newSub(), email: "u@auth.test", role: "authenticated" };
      setSession(user);
      const result = await getCurrentUser();
      expect(result).not.toBeNull();
      expect(result!.id).toBe(user.id);
      expect(result!.email).toBe("u@auth.test");
      // Devuelve la referencia sin transformarla (no envuelve ni copia campos).
      expect(result).toEqual(user);
    });

    it("contacta al Auth server (getUser) exactamente una vez por llamada", async () => {
      setSession({ id: newSub() });
      await getCurrentUser();
      expect(getUserCalls).toBe(1);
    });
  });

  // ═══════════════════════════ getCurrentCustomer ═══════════════════════════

  describe("getCurrentCustomer", () => {
    it("retorna null cuando no hay sesión (corta antes de tocar la DB)", async () => {
      clearSession();
      await expect(getCurrentCustomer()).resolves.toBeNull();
      // Sin sesión no debe consultar la fila; getUser sí se llama una vez.
      expect(getUserCalls).toBe(1);
    });

    it("retorna null cuando hay sesión pero NO existe Customer para ese user.id", async () => {
      // Sesión con un id que no tiene fila Customer.
      setSession({ id: newSub() });
      await expect(getCurrentCustomer()).resolves.toBeNull();
    });

    it("retorna { user, customer } cuando existe Customer activo para el user.id", async () => {
      const sub = newSub();
      const created = await makeCustomer(sub, { firstName: "Activo" });
      setSession({ id: sub, email: created.email });

      const result = await getCurrentCustomer();
      expect(result).not.toBeNull();
      expect(result!.user.id).toBe(sub);
      expect(result!.customer.id).toBe(created.id);
      expect(result!.customer.supabaseUserId).toBe(sub);
      expect(result!.customer.firstName).toBe("Activo");
      expect(result!.customer.deletedAt).toBeNull();
    });

    it("retorna null cuando el Customer está soft-deleted (filtra deletedAt:null)", async () => {
      const sub = newSub();
      await makeCustomer(sub, { deletedAt: new Date() });
      setSession({ id: sub });

      await expect(getCurrentCustomer()).resolves.toBeNull();
    });

    it("resuelve el Customer correcto por user.id (aislamiento entre cuentas)", async () => {
      const subA = newSub();
      const subB = newSub();
      const custA = await makeCustomer(subA, { firstName: "Ana" });
      await makeCustomer(subB, { firstName: "Beto" });

      // La sesión es de A → debe traer SOLO la fila de A, nunca la de B.
      setSession({ id: subA });
      const result = await getCurrentCustomer();
      expect(result!.customer.id).toBe(custA.id);
      expect(result!.customer.firstName).toBe("Ana");
    });

    it("no resuelve Customer aunque exista un AdminUser con ese user.id (busca en la tabla correcta)", async () => {
      // Un user que es admin pero NO cliente: getCurrentCustomer debe dar null.
      const sub = newSub();
      await makeAdmin(sub, { role: "SUPERADMIN" });
      setSession({ id: sub });

      await expect(getCurrentCustomer()).resolves.toBeNull();
    });

    it("es idempotente: dos llamadas con la misma sesión devuelven el mismo customer.id", async () => {
      const sub = newSub();
      const created = await makeCustomer(sub);
      setSession({ id: sub });

      const first = await getCurrentCustomer();
      const second = await getCurrentCustomer();
      expect(first!.customer.id).toBe(created.id);
      expect(second!.customer.id).toBe(created.id);
    });
  });

  // ═══════════════════════════ getCurrentAdmin ═══════════════════════════

  describe("getCurrentAdmin", () => {
    it("retorna null cuando no hay sesión", async () => {
      clearSession();
      await expect(getCurrentAdmin()).resolves.toBeNull();
      expect(getUserCalls).toBe(1);
    });

    it("retorna null cuando hay sesión pero NO existe AdminUser para ese user.id", async () => {
      setSession({ id: newSub() });
      await expect(getCurrentAdmin()).resolves.toBeNull();
    });

    it("retorna { user, admin } cuando existe AdminUser activo (isActive:true, deletedAt:null)", async () => {
      const sub = newSub();
      const created = await makeAdmin(sub, { role: "MANAGER" });
      setSession({ id: sub, email: created.email });

      const result = await getCurrentAdmin();
      expect(result).not.toBeNull();
      expect(result!.user.id).toBe(sub);
      expect(result!.admin.id).toBe(created.id);
      expect(result!.admin.supabaseUserId).toBe(sub);
      expect(result!.admin.role).toBe("MANAGER");
      expect(result!.admin.isActive).toBe(true);
      expect(result!.admin.deletedAt).toBeNull();
    });

    it("resuelve cualquier rol activo (SUPERADMIN/MANAGER/FULFILLMENT) — no filtra por rol", async () => {
      for (const role of ["SUPERADMIN", "MANAGER", "FULFILLMENT"] as const) {
        const sub = newSub();
        const created = await makeAdmin(sub, { role });
        setSession({ id: sub });
        const result = await getCurrentAdmin();
        expect(result).not.toBeNull();
        expect(result!.admin.id).toBe(created.id);
        expect(result!.admin.role).toBe(role);
        clearSession();
      }
    });

    it("SEGURIDAD: admin inactivo (isActive:false) → null aunque no esté borrado", async () => {
      const sub = newSub();
      await makeAdmin(sub, { isActive: false });
      setSession({ id: sub });

      await expect(getCurrentAdmin()).resolves.toBeNull();
    });

    it("SEGURIDAD: admin soft-deleted (deletedAt != null) → null aunque isActive:true", async () => {
      const sub = newSub();
      await makeAdmin(sub, { isActive: true, deletedAt: new Date() });
      setSession({ id: sub });

      await expect(getCurrentAdmin()).resolves.toBeNull();
    });

    it("SEGURIDAD: admin inactivo Y soft-deleted → null (ambos filtros deben fallar)", async () => {
      const sub = newSub();
      await makeAdmin(sub, { isActive: false, deletedAt: new Date() });
      setSession({ id: sub });

      await expect(getCurrentAdmin()).resolves.toBeNull();
    });

    it("SEGURIDAD: reactivar un admin (isActive false→true) lo vuelve a autorizar", async () => {
      // Ejercita el gate real de isActive contra la DB, no un booleano en memoria.
      const sub = newSub();
      const created = await makeAdmin(sub, { isActive: false });
      setSession({ id: sub });
      await expect(getCurrentAdmin()).resolves.toBeNull();

      await prisma.adminUser.update({
        where: { id: created.id },
        data: { isActive: true },
      });
      const result = await getCurrentAdmin();
      expect(result).not.toBeNull();
      expect(result!.admin.id).toBe(created.id);
    });

    it("no resuelve Admin para un user que solo es Customer (busca en la tabla correcta)", async () => {
      const sub = newSub();
      await makeCustomer(sub);
      setSession({ id: sub });

      await expect(getCurrentAdmin()).resolves.toBeNull();
    });

    it("es idempotente: dos llamadas con la misma sesión devuelven el mismo admin.id", async () => {
      const sub = newSub();
      const created = await makeAdmin(sub);
      setSession({ id: sub });

      const first = await getCurrentAdmin();
      const second = await getCurrentAdmin();
      expect(first!.admin.id).toBe(created.id);
      expect(second!.admin.id).toBe(created.id);
    });
  });

  // ═══════════════ Dualidad Customer + Admin sobre el mismo auth.user ═══════════════
  //
  // Un mismo email/user puede ser cliente Y admin (fila en ambas tablas con el
  // mismo supabaseUserId). Verificamos que cada helper resuelve su propia tabla
  // sin cruzarse — invariante documentado en el JSDoc de getCurrentAdmin.

  describe("dualidad Customer+Admin con el mismo user.id", () => {
    it("un user con AMBAS filas activas resuelve tanto customer como admin", async () => {
      const sub = newSub();
      const cust = await makeCustomer(sub, { firstName: "Dual" });
      const admin = await makeAdmin(sub, { role: "SUPERADMIN" });
      setSession({ id: sub });

      const asCustomer = await getCurrentCustomer();
      const asAdmin = await getCurrentAdmin();

      expect(asCustomer!.customer.id).toBe(cust.id);
      expect(asAdmin!.admin.id).toBe(admin.id);
      // Ambos comparten el mismo user de sesión.
      expect(asCustomer!.user.id).toBe(sub);
      expect(asAdmin!.user.id).toBe(sub);
    });

    it("customer activo + admin INACTIVO: resuelve customer pero NO admin", async () => {
      const sub = newSub();
      const cust = await makeCustomer(sub);
      await makeAdmin(sub, { isActive: false });
      setSession({ id: sub });

      const asCustomer = await getCurrentCustomer();
      const asAdmin = await getCurrentAdmin();

      expect(asCustomer!.customer.id).toBe(cust.id);
      expect(asAdmin).toBeNull();
    });
  });
});
