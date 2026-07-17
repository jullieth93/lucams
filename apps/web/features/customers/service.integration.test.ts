/*
 * Tests de integración del SERVICE de CUSTOMERS — Customer 360 (PII, Ley 1581).
 *
 * El módulo @/features/customers/service.ts es DB-coupled (importa `prisma` de
 * @/lib/db) y SOLO expone lecturas para el admin Customer 360 (no muta perfiles
 * ajenos por mandato Ley 1581):
 *   - listCustomers(opts): listado paginado con búsqueda (email/nombre/documento/
 *     teléfono), filtro status (all / with-orders / no-orders), sort (recent /
 *     name / orders) y derivados (fullName, ordersCount, reviewsCount).
 *   - getCustomerDetail(id): detail con relaciones (orders/reviews/addresses/
 *     loyaltyTxns/designs/referrals/_count), excluye soft-deleted.
 *   - getCustomerTotalSpent(customerId): suma orders.total con status PAID o
 *     posterior (PAID/FULFILLING/SHIPPED/DELIVERED), excluye soft-deleted.
 *
 * Estrategia: integración DB pura. Requiere DATABASE_URL (corre vía
 * `dotenv -e .env.local -- vitest`); sin ella se salta (skipIf) para no romper
 * CI sin DB.
 *
 * AISLAMIENTO ESTRICTO (PII — nunca tocar datos reales):
 *   - Todo registro de esta corrida lleva el prefijo único `RUN` en sus
 *     identificadores naturales (email / supabaseUserId / referralCode / Category
 *     slug / Product slug+sku / Order number). La limpieza en afterAll borra
 *     EXACTAMENTE lo creado, SCOPED al prefijo. JAMÁS un deleteMany sin filtro.
 *   - Orden de borrado respeta FKs: orders/reviews/designs → customers →
 *     product → category.
 *
 * El comportamiento esperado se verificó contra la DB real antes de fijar las
 * aserciones (probe descartado): _sum.total es null sin filas → el service lo
 * coalesce a 0; findFirst con id inexistente o deletedAt!=null retorna null;
 * email/supabaseUserId/referralCode duplicado → PrismaClientKnownRequestError
 * P2002.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getCustomerDetail, getCustomerTotalSpent, listCustomers } from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Todos los identificadores naturales lo llevan → la
// limpieza borra exactamente lo que creamos sin tocar datos reales (la cuenta de
// Lucy, productos seed, etc.).
const RUN = `ITESTCUST${Date.now()}${Math.floor(Math.random() * 1e6)}`.toUpperCase();

// Contador monotónico para garantizar unicidad de email/supabaseUserId/referralCode
// dentro de la corrida sin depender del azar.
let seq = 0;
function nextId() {
  seq += 1;
  return `${RUN}-${seq}`;
}

type CustomerOverrides = Partial<{
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  documentType: "CC" | "CE" | "NIT" | "PP" | "TI";
  documentNumber: string | null;
  loyaltyPoints: number;
  deletedAt: Date | null;
  createdAt: Date;
}>;

async function makeCustomer(over: CustomerOverrides = {}) {
  const id = nextId();
  return prisma.customer.create({
    data: {
      email: over.email ?? `${id}@cust.test`,
      supabaseUserId: `${id}-sub`,
      referralCode: `${id}-ref`,
      firstName: over.firstName === undefined ? "Default" : over.firstName,
      lastName: over.lastName === undefined ? "Customer" : over.lastName,
      phone: over.phone === undefined ? null : over.phone,
      documentType: over.documentType,
      documentNumber: over.documentNumber === undefined ? null : over.documentNumber,
      loyaltyPoints: over.loyaltyPoints ?? 0,
      deletedAt: over.deletedAt ?? null,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
}

// Order mínima: el schema solo exige number/email/phone/shippingAddress/subtotal/
// shipping/total/paymentMethod. No requiere OrderItems.
async function makeOrder(
  customerId: string,
  over: Partial<{
    status:
      | "DRAFT"
      | "PENDING_PAYMENT"
      | "PAID"
      | "FULFILLING"
      | "SHIPPED"
      | "DELIVERED"
      | "CANCELLED"
      | "REFUNDED";
    total: number;
    deletedAt: Date | null;
  }> = {},
) {
  const id = nextId();
  return prisma.order.create({
    data: {
      number: `${id}-ord`,
      customerId,
      email: `${id}@cust.test`,
      phone: "3200000000",
      shippingAddress: { city: "Bogotá" },
      subtotal: over.total ?? 100_000,
      shipping: 0,
      total: over.total ?? 100_000,
      paymentMethod: "WOMPI",
      status: over.status ?? "PAID",
      deletedAt: over.deletedAt ?? null,
    },
  });
}

// Category + Product compartidos (RUN-scoped) para poder seedear Review/Design,
// que exigen un productId real.
let sharedProductId: string;
let sharedCategoryId: string;

async function makeReview(
  customerId: string,
  over: Partial<{ deletedAt: Date | null; rating: number; isApproved: boolean }> = {},
) {
  return prisma.review.create({
    data: {
      productId: sharedProductId,
      customerId,
      rating: over.rating ?? 5,
      comment: `${RUN} review`,
      isApproved: over.isApproved ?? true,
      deletedAt: over.deletedAt ?? null,
    },
  });
}

// Address mínima: el schema exige name/line1/city/department/phone. El `name`
// lleva el prefijo RUN para la limpieza SCOPED en afterAll (Address tampoco lo
// filtra el include de getCustomerDetail → no usar where deletedAt).
async function makeAddress(
  customerId: string,
  over: Partial<{
    name: string;
    line1: string;
    city: string;
    department: string;
    isDefault: boolean;
    createdAt: Date;
  }> = {},
) {
  const id = nextId();
  return prisma.address.create({
    data: {
      customerId,
      name: over.name ?? `${id}-addr`,
      line1: over.line1 ?? "Calle 1 # 2-3",
      city: over.city ?? "Bogotá",
      department: over.department ?? "Cundinamarca",
      phone: "3200000000",
      isDefault: over.isDefault ?? false,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
}

// LoyaltyTxn mínima: customerId/delta/reason. El `reason` lleva el prefijo RUN
// para la limpieza SCOPED (afterAll borra por reason startsWith RUN).
async function makeLoyaltyTxn(
  customerId: string,
  over: Partial<{ delta: number; reason: string; createdAt: Date }> = {},
) {
  const id = nextId();
  return prisma.loyaltyTxn.create({
    data: {
      customerId,
      delta: over.delta ?? 10,
      reason: over.reason ?? `${RUN}-txn-${id}`,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
}

describe.skipIf(!hasDb)("customers/service — integración DB (Customer 360, PII Ley 1581)", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `${RUN} Category` },
    });
    sharedCategoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `${RUN} Product`,
        description: "probe product",
        basePrice: 50_000,
        sku: `${RUN}-SKU`,
        categoryId: category.id,
      },
    });
    sharedProductId = product.id;
  });

  afterAll(async () => {
    // Orden de borrado respeta FKs. Todo SCOPED al prefijo RUN.
    // Reviews/Orders/Designs/LoyaltyTxns referencian customers (SetNull al borrar
    // customer, pero los borramos explícito por claridad y para no dejar huérfanos
    // con RUN). Designs/Reviews → product (Restrict) → category (Restrict): por eso
    // se borran ANTES que product/category.
    await prisma.review.deleteMany({ where: { comment: { startsWith: RUN } } });
    await prisma.design.deleteMany({ where: { productId: sharedProductId } });
    await prisma.loyaltyTxn.deleteMany({ where: { reason: { startsWith: RUN } } });
    // Address: el include de getCustomerDetail no filtra soft-deleted y el name
    // lleva el prefijo RUN → borrado explícito SCOPED (además del cascade al
    // borrar el customer). Antes de borrar customers para no depender del cascade.
    await prisma.address.deleteMany({ where: { name: { startsWith: RUN } } });
    await prisma.order.deleteMany({ where: { number: { startsWith: RUN } } });
    await prisma.customer.deleteMany({ where: { email: { startsWith: RUN } } });
    if (sharedProductId) {
      await prisma.product.deleteMany({ where: { id: sharedProductId } });
    }
    if (sharedCategoryId) {
      await prisma.category.deleteMany({ where: { id: sharedCategoryId } });
    }
  });

  // ───────────────────────── listCustomers — búsqueda ─────────────────────────

  describe("listCustomers — búsqueda (q)", () => {
    it("encuentra por fragmento de email case-insensitive", async () => {
      const unique = nextId();
      const c = await makeCustomer({ email: `${unique}-FINDME@cust.test` });

      // Buscar en minúsculas un email que tiene mayúsculas → mode insensitive.
      const res = await listCustomers({ q: `${unique}-findme`.toLowerCase(), pageSize: 50 });
      const ids = res.items.map((i) => i.id);
      expect(ids).toContain(c.id);
    });

    it("encuentra por firstName y por lastName", async () => {
      const token = nextId();
      const byFirst = await makeCustomer({ firstName: `Zoraida${token}`, lastName: "Perez" });
      const byLast = await makeCustomer({ firstName: "Juan", lastName: `Quintero${token}` });

      const resFirst = await listCustomers({ q: `Zoraida${token}`, pageSize: 50 });
      expect(resFirst.items.map((i) => i.id)).toContain(byFirst.id);

      const resLast = await listCustomers({ q: `Quintero${token}`, pageSize: 50 });
      expect(resLast.items.map((i) => i.id)).toContain(byLast.id);
    });

    it("encuentra por documentNumber (búsqueda case-sensitive, sin mode insensitive)", async () => {
      const doc = `DOC${nextId().replace(/[^0-9A-Z]/gi, "")}`;
      const c = await makeCustomer({ documentType: "CC", documentNumber: doc });

      const res = await listCustomers({ q: doc, pageSize: 50 });
      expect(res.items.map((i) => i.id)).toContain(c.id);
    });

    it("documentNumber con casing distinto al almacenado NO matchea (case-sensitivity real)", async () => {
      // Doc con letras en mayúscula+minúscula → al invertir el casing el match
      // debe FALLAR (documentNumber usa `contains` sin mode:insensitive). Token
      // RUN-único: las variantes no pueden colisionar con otros registros reales.
      const doc = `DocCs${nextId().replace(/[^0-9A-Za-z]/gi, "")}xZ`;
      const c = await makeCustomer({ documentType: "CC", documentNumber: doc });

      // Sanity: el casing EXACTO sí encuentra al customer.
      const exact = await listCustomers({ q: doc, pageSize: 50 });
      expect(exact.items.map((i) => i.id)).toContain(c.id);

      // Mismo string en MAYÚSCULAS → no matchea (case-sensitive).
      const upper = await listCustomers({ q: doc.toUpperCase(), pageSize: 50 });
      expect(upper.items.map((i) => i.id)).not.toContain(c.id);

      // Mismo string en minúsculas → tampoco matchea.
      const lower = await listCustomers({ q: doc.toLowerCase(), pageSize: 50 });
      expect(lower.items.map((i) => i.id)).not.toContain(c.id);
    });

    it("encuentra por phone", async () => {
      const phone = `3209${String(seq).padStart(6, "0")}`;
      const c = await makeCustomer({ phone });

      const res = await listCustomers({ q: phone, pageSize: 50 });
      expect(res.items.map((i) => i.id)).toContain(c.id);
    });

    it("trimea q: espacios alrededor no afectan el match", async () => {
      const token = nextId();
      const c = await makeCustomer({ firstName: `Trimmed${token}` });

      const res = await listCustomers({ q: `   Trimmed${token}   `, pageSize: 50 });
      expect(res.items.map((i) => i.id)).toContain(c.id);
    });

    it("no retorna nada para un q que no matchea ningún registro", async () => {
      const res = await listCustomers({ q: `${RUN}-NO-SUCH-FRAGMENT-ZZZ`, pageSize: 50 });
      expect(res.items).toHaveLength(0);
      expect(res.total).toBe(0);
      expect(res.totalPages).toBe(1); // Math.max(1, ceil(0/pageSize)) === 1
    });
  });

  // ───────────────────────── listCustomers — fullName derivado ─────────────────────────

  describe("listCustomers — fullName derivado", () => {
    it("compone 'firstName lastName' cuando ambos existen", async () => {
      const token = nextId();
      const c = await makeCustomer({ firstName: `Ana${token}`, lastName: "Bello" });
      const res = await listCustomers({ q: `Ana${token}`, pageSize: 50 });
      const item = res.items.find((i) => i.id === c.id);
      expect(item?.fullName).toBe(`Ana${token} Bello`);
    });

    it("usa solo firstName cuando lastName es null (sin espacio colgante)", async () => {
      const token = nextId();
      const c = await makeCustomer({ firstName: `Solo${token}`, lastName: null });
      const res = await listCustomers({ q: `Solo${token}`, pageSize: 50 });
      const item = res.items.find((i) => i.id === c.id);
      expect(item?.fullName).toBe(`Solo${token}`);
    });

    it("cae a '(sin nombre)' cuando firstName y lastName son null", async () => {
      const token = nextId();
      // Sin nombre buscable, lo localizamos por email.
      const c = await makeCustomer({
        email: `${token}-noname@cust.test`,
        firstName: null,
        lastName: null,
      });
      const res = await listCustomers({ q: `${token}-noname`, pageSize: 50 });
      const item = res.items.find((i) => i.id === c.id);
      expect(item?.fullName).toBe("(sin nombre)");
    });
  });

  // ───────────────────────── listCustomers — status filter ─────────────────────────

  describe("listCustomers — filtro status", () => {
    it("with-orders incluye customers con >=1 order activa y excluye los sin orders", async () => {
      const token = nextId();
      const withOrders = await makeCustomer({ firstName: `WithOrd${token}` });
      const noOrders = await makeCustomer({ firstName: `NoOrd${token}` });
      await makeOrder(withOrders.id, { status: "PAID" });

      const res = await listCustomers({ q: token, status: "with-orders", pageSize: 50 });
      const ids = res.items.map((i) => i.id);
      expect(ids).toContain(withOrders.id);
      expect(ids).not.toContain(noOrders.id);
    });

    it("no-orders incluye solo customers sin orders activas", async () => {
      const token = nextId();
      const withOrders = await makeCustomer({ firstName: `Has${token}` });
      const noOrders = await makeCustomer({ firstName: `None${token}` });
      await makeOrder(withOrders.id, { status: "PAID" });

      const res = await listCustomers({ q: token, status: "no-orders", pageSize: 50 });
      const ids = res.items.map((i) => i.id);
      expect(ids).toContain(noOrders.id);
      expect(ids).not.toContain(withOrders.id);
    });

    it("una order soft-deleted NO cuenta como 'with-orders' (none deletedAt:null)", async () => {
      const token = nextId();
      const cust = await makeCustomer({ firstName: `OnlyDeleted${token}` });
      await makeOrder(cust.id, { status: "PAID", deletedAt: new Date() });

      // Con la order soft-deleted, debe aparecer en no-orders y NO en with-orders.
      const noOrders = await listCustomers({ q: token, status: "no-orders", pageSize: 50 });
      expect(noOrders.items.map((i) => i.id)).toContain(cust.id);

      const withOrders = await listCustomers({ q: token, status: "with-orders", pageSize: 50 });
      expect(withOrders.items.map((i) => i.id)).not.toContain(cust.id);
    });

    it("status 'all' (default) no filtra por orders", async () => {
      const token = nextId();
      const withOrders = await makeCustomer({ firstName: `All${token}` });
      const noOrders = await makeCustomer({ firstName: `All${token}` });
      await makeOrder(withOrders.id, { status: "PAID" });

      const res = await listCustomers({ q: `All${token}`, pageSize: 50 });
      const ids = res.items.map((i) => i.id);
      expect(ids).toContain(withOrders.id);
      expect(ids).toContain(noOrders.id);
    });
  });

  // ───────────────────────── listCustomers — counts derivados ─────────────────────────

  describe("listCustomers — ordersCount / reviewsCount / loyaltyPoints", () => {
    it("ordersCount cuenta TODAS las orders (incluso soft-deleted: _count no filtra)", async () => {
      const token = nextId();
      const cust = await makeCustomer({ firstName: `Counts${token}` });
      await makeOrder(cust.id, { status: "PAID" });
      await makeOrder(cust.id, { status: "CANCELLED" });
      await makeOrder(cust.id, { status: "PAID", deletedAt: new Date() });

      const res = await listCustomers({ q: `Counts${token}`, pageSize: 50 });
      const item = res.items.find((i) => i.id === cust.id);
      // _count.orders del select NO lleva where → cuenta las 3 (comportamiento real).
      expect(item?.ordersCount).toBe(3);
    }, 30000);

    it("reviewsCount cuenta reviews y refleja loyaltyPoints persistidos", async () => {
      const token = nextId();
      const cust = await makeCustomer({ firstName: `Loyal${token}`, loyaltyPoints: 1234 });
      await makeReview(cust.id);
      await makeReview(cust.id);

      const res = await listCustomers({ q: `Loyal${token}`, pageSize: 50 });
      const item = res.items.find((i) => i.id === cust.id);
      expect(item?.reviewsCount).toBe(2);
      expect(item?.loyaltyPoints).toBe(1234);
    });
  });

  // ───────────────────────── listCustomers — soft-delete del customer ─────────────────────────

  describe("listCustomers — exclusión de customers soft-deleted", () => {
    it("no incluye un customer con deletedAt != null", async () => {
      const token = nextId();
      const alive = await makeCustomer({ firstName: `Alive${token}` });
      const deleted = await makeCustomer({
        firstName: `Dead${token}`,
        deletedAt: new Date(),
      });

      const res = await listCustomers({ q: token, pageSize: 50 });
      const ids = res.items.map((i) => i.id);
      expect(ids).toContain(alive.id);
      expect(ids).not.toContain(deleted.id);
    });
  });

  // ───────────────────────── listCustomers — sort ─────────────────────────

  describe("listCustomers — sort", () => {
    it("sort 'name' ordena por firstName asc (luego lastName asc)", async () => {
      const token = nextId();
      // Mismo token buscable, firstNames que ordenan deterministamente.
      await makeCustomer({ firstName: `${token}-Carlos`, lastName: "Z" });
      await makeCustomer({ firstName: `${token}-Ana`, lastName: "A" });
      await makeCustomer({ firstName: `${token}-Beto`, lastName: "M" });

      const res = await listCustomers({ q: token, sort: "name", pageSize: 50 });
      const names = res.items.filter((i) => i.fullName.startsWith(token)).map((i) => i.fullName);
      // Orden esperado alfabético por firstName: Ana < Beto < Carlos.
      expect(names).toEqual([`${token}-Ana A`, `${token}-Beto M`, `${token}-Carlos Z`]);
    });

    it("sort 'recent' (default) ordena por createdAt desc — el más nuevo primero", async () => {
      const token = nextId();
      const older = await makeCustomer({
        firstName: `Rec${token}`,
        createdAt: new Date(Date.now() - 60_000),
      });
      const newer = await makeCustomer({
        firstName: `Rec${token}`,
        createdAt: new Date(),
      });

      const res = await listCustomers({ q: `Rec${token}`, sort: "recent", pageSize: 50 });
      const idx = (id: string) => res.items.findIndex((i) => i.id === id);
      expect(idx(newer.id)).toBeGreaterThanOrEqual(0);
      expect(idx(older.id)).toBeGreaterThanOrEqual(0);
      expect(idx(newer.id)).toBeLessThan(idx(older.id));
    });

    it("sort 'orders' usa el mismo orderBy que 'recent' (fallback documentado: createdAt desc)", async () => {
      const token = nextId();
      const older = await makeCustomer({
        firstName: `Ord${token}`,
        createdAt: new Date(Date.now() - 60_000),
      });
      const newer = await makeCustomer({
        firstName: `Ord${token}`,
        createdAt: new Date(),
      });

      const res = await listCustomers({ q: `Ord${token}`, sort: "orders", pageSize: 50 });
      const idx = (id: string) => res.items.findIndex((i) => i.id === id);
      // Fallback a recent: el más nuevo primero (NO ordena por # de orders).
      expect(idx(newer.id)).toBeLessThan(idx(older.id));
    });
  });

  // ───────────────────────── listCustomers — paginación ─────────────────────────

  describe("listCustomers — paginación", () => {
    it("respeta pageSize y devuelve totalPages = ceil(total/pageSize)", async () => {
      const token = nextId();
      // 3 customers que matchean el mismo token.
      const a = await makeCustomer({ firstName: `Page${token}` });
      const b = await makeCustomer({ firstName: `Page${token}` });
      const c = await makeCustomer({ firstName: `Page${token}` });

      const page1 = await listCustomers({ q: `Page${token}`, page: 1, pageSize: 2 });
      expect(page1.total).toBe(3);
      expect(page1.items).toHaveLength(2);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(2);
      expect(page1.totalPages).toBe(2); // ceil(3/2)

      const page2 = await listCustomers({ q: `Page${token}`, page: 2, pageSize: 2 });
      expect(page2.items).toHaveLength(1);
      expect(page2.page).toBe(2);

      // Sin solapamiento entre páginas y cobertura total de los 3 ids.
      const seen = new Set([...page1.items, ...page2.items].map((i) => i.id));
      expect(seen.has(a.id) && seen.has(b.id) && seen.has(c.id)).toBe(true);
      expect([...page1.items, ...page2.items]).toHaveLength(3);
    }, 30000);

    it("normaliza page <= 0 a 1 (Math.max(1, page))", async () => {
      const token = nextId();
      await makeCustomer({ firstName: `Norm${token}` });

      const res = await listCustomers({ q: `Norm${token}`, page: 0, pageSize: 50 });
      expect(res.page).toBe(1);
      const resNeg = await listCustomers({ q: `Norm${token}`, page: -5, pageSize: 50 });
      expect(resNeg.page).toBe(1);
    });

    it("una página fuera de rango devuelve items vacío pero conserva total", async () => {
      const token = nextId();
      await makeCustomer({ firstName: `Oob${token}` });

      const res = await listCustomers({ q: `Oob${token}`, page: 99, pageSize: 50 });
      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(0);
      expect(res.page).toBe(99);
    });
  });

  // ───────────────────────── listCustomers — sin q / defaults ─────────────────────────

  describe("listCustomers — sin q (listado completo) y defaults", () => {
    it("sin q retorna todos los customers no soft-deleted (excluye el soft-deleted)", async () => {
      const token = nextId();
      const alive1 = await makeCustomer({ firstName: `NoQ${token}A` });
      const alive2 = await makeCustomer({ firstName: `NoQ${token}B` });
      const deleted = await makeCustomer({
        firstName: `NoQ${token}Dead`,
        deletedAt: new Date(),
      });

      // Sin q el where solo aplica deletedAt:null → listado global de vivos. Para
      // localizar deterministamente nuestros seeds entre los reales, pedimos un
      // pageSize amplio (no asertamos el total absoluto, que depende de la DB).
      const res = await listCustomers({ pageSize: 1000 });
      const ids = new Set(res.items.map((i) => i.id));

      // Los dos vivos del RUN están presentes; el soft-deleted no.
      expect(ids.has(alive1.id)).toBe(true);
      expect(ids.has(alive2.id)).toBe(true);
      expect(ids.has(deleted.id)).toBe(false);

      // Invariante del filtro: NINGÚN item del listado viene soft-deleted. Esto se
      // verifica sobre el conjunto entero contra la DB (no solo los seeds del RUN).
      const returnedIds = res.items.map((i) => i.id);
      const anyDeleted = await prisma.customer.count({
        where: { id: { in: returnedIds }, deletedAt: { not: null } },
      });
      expect(anyDeleted).toBe(0);
    }, 30000);

    it("pageSize por defecto es 20 cuando no se pasa", async () => {
      // Llamada scoped por q (rápida) sin pageSize → debe caer al PAGE_SIZE=20.
      const token = nextId();
      await makeCustomer({ firstName: `Defsize${token}` });

      const res = await listCustomers({ q: `Defsize${token}` });
      expect(res.pageSize).toBe(20);
    });

    it("invocado sin argumentos también usa pageSize 20 y page 1", async () => {
      const res = await listCustomers();
      expect(res.pageSize).toBe(20);
      expect(res.page).toBe(1);
    });
  });

  // ───────────────────────── getCustomerDetail ─────────────────────────

  describe("getCustomerDetail", () => {
    it("retorna null para un id inexistente", async () => {
      const detail = await getCustomerDetail(`${RUN}-no-such-id`);
      expect(detail).toBeNull();
    });

    it("retorna null para un customer soft-deleted (filtra deletedAt:null)", async () => {
      const cust = await makeCustomer({ deletedAt: new Date() });
      const detail = await getCustomerDetail(cust.id);
      expect(detail).toBeNull();
    });

    it("trae el customer con _count agregado y relaciones cargadas", async () => {
      const cust = await makeCustomer({ firstName: "Detail", lastName: "Full" });
      // 2 orders activas, 1 soft-deleted; 1 review activa, 1 soft-deleted.
      await makeOrder(cust.id, { status: "PAID" });
      await makeOrder(cust.id, { status: "DELIVERED" });
      await makeOrder(cust.id, { status: "PAID", deletedAt: new Date() });
      await makeReview(cust.id);
      await makeReview(cust.id, { deletedAt: new Date() });

      const detail = await getCustomerDetail(cust.id);
      expect(detail).not.toBeNull();
      expect(detail!.id).toBe(cust.id);
      expect(detail!.email).toBe(cust.email);

      // include.orders tiene where deletedAt:null → solo 2 activas.
      expect(detail!.orders).toHaveLength(2);
      expect(detail!.orders.every((o) => "number" in o && "status" in o)).toBe(true);

      // include.reviews where deletedAt:null → solo 1 activa, con product embebido.
      expect(detail!.reviews).toHaveLength(1);
      expect(detail!.reviews[0].product.id).toBe(sharedProductId);

      // _count NO filtra soft-deleted → cuenta TODAS (3 orders, 2 reviews).
      expect(detail!._count.orders).toBe(3);
      expect(detail!._count.reviews).toBe(2);
      expect(detail!._count.designs).toBe(0);
      expect(detail!._count.referrals).toBe(0);
    }, 30000);

    it("ordena orders por createdAt desc (la más reciente primero)", async () => {
      const cust = await makeCustomer();
      const old = await makeOrder(cust.id, { status: "PAID" });
      await prisma.order.update({
        where: { id: old.id },
        data: { createdAt: new Date(Date.now() - 120_000) },
      });
      const recent = await makeOrder(cust.id, { status: "PAID" });

      const detail = await getCustomerDetail(cust.id);
      expect(detail!.orders[0].id).toBe(recent.id);
      expect(detail!.orders[1].id).toBe(old.id);
    }, 30000);

    it("carga referrals (customers referidos por este) con su PII mínima", async () => {
      const referrer = await makeCustomer({ firstName: "Referrer" });
      const referred = await prisma.customer.create({
        data: {
          email: `${nextId()}@cust.test`,
          supabaseUserId: `${nextId()}-sub`,
          referralCode: `${nextId()}-ref`,
          firstName: "Referred",
          lastName: "Friend",
          referredById: referrer.id,
        },
      });

      const detail = await getCustomerDetail(referrer.id);
      expect(detail!._count.referrals).toBe(1);
      expect(detail!.referrals.map((r) => r.id)).toContain(referred.id);
      const ref = detail!.referrals.find((r) => r.id === referred.id)!;
      expect(ref.email).toBe(referred.email);
      expect(ref.firstName).toBe("Referred");
    });

    it("carga addresses ordenadas por createdAt desc (la más reciente primero)", async () => {
      const cust = await makeCustomer({ firstName: "AddrOwner" });
      const older = await makeAddress(cust.id, {
        name: `${RUN}-AddrOlder`,
        city: "Bogotá",
        createdAt: new Date(Date.now() - 120_000),
      });
      const newer = await makeAddress(cust.id, {
        name: `${RUN}-AddrNewer`,
        city: "Medellín",
        isDefault: true,
        createdAt: new Date(),
      });

      const detail = await getCustomerDetail(cust.id);
      expect(detail).not.toBeNull();

      // include.addresses no lleva where → trae ambas; orderBy createdAt desc.
      expect(detail!.addresses).toHaveLength(2);
      expect(detail!.addresses.map((a) => a.id)).toEqual([newer.id, older.id]);

      // Contenido real cargado (no solo ids): la más reciente es la default de Medellín.
      expect(detail!.addresses[0].name).toBe(`${RUN}-AddrNewer`);
      expect(detail!.addresses[0].city).toBe("Medellín");
      expect(detail!.addresses[0].isDefault).toBe(true);
      expect(detail!.addresses[1].name).toBe(`${RUN}-AddrOlder`);
      expect(detail!.addresses[1].city).toBe("Bogotá");
    }, 30000);

    it("carga loyaltyTxns: take 20 (descarta los más viejos) y orden createdAt desc", async () => {
      const cust = await makeCustomer({ firstName: "LoyaltyOwner" });
      // 22 txns con createdAt creciente → al ordenar desc, las 2 más viejas
      // (idx 0 y 1) caen fuera del take:20. La más reciente es idx 21.
      const base = Date.now();
      for (let i = 0; i < 22; i++) {
        await makeLoyaltyTxn(cust.id, {
          delta: i,
          reason: `${RUN}-loy-${String(i).padStart(2, "0")}`,
          createdAt: new Date(base + i * 1000),
        });
      }

      const detail = await getCustomerDetail(cust.id);
      expect(detail).not.toBeNull();

      // take:20 → solo 20 aunque sembramos 22.
      expect(detail!.loyaltyTxns).toHaveLength(20);

      // orderBy createdAt desc → la primera es la más reciente (idx 21),
      // la última de las 20 es idx 02 (idx 00 y 01 quedaron fuera).
      const reasons = detail!.loyaltyTxns.map((t) => t.reason);
      expect(reasons[0]).toBe(`${RUN}-loy-21`);
      expect(reasons[reasons.length - 1]).toBe(`${RUN}-loy-02`);
      expect(detail!.loyaltyTxns[0].delta).toBe(21);

      // Orden estrictamente descendente por createdAt en toda la ventana.
      for (let i = 1; i < detail!.loyaltyTxns.length; i++) {
        expect(detail!.loyaltyTxns[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          detail!.loyaltyTxns[i].createdAt.getTime(),
        );
      }

      // _count NO incluye loyaltyTxns en el select del service → no se asume.
      // Verificamos persistencia real de las 22 directamente.
      const persisted = await prisma.loyaltyTxn.count({
        where: { customerId: cust.id, reason: { startsWith: `${RUN}-loy-` } },
      });
      expect(persisted).toBe(22);
    }, 60000);
  });

  // ───────────────────────── getCustomerTotalSpent ─────────────────────────

  describe("getCustomerTotalSpent", () => {
    it("retorna 0 cuando el customer no tiene orders (sum null coalesce a 0)", async () => {
      const cust = await makeCustomer();
      const spent = await getCustomerTotalSpent(cust.id);
      expect(spent).toBe(0);
    });

    it("suma SOLO orders con status PAID/FULFILLING/SHIPPED/DELIVERED", async () => {
      const cust = await makeCustomer();
      await makeOrder(cust.id, { status: "PAID", total: 100_000 });
      await makeOrder(cust.id, { status: "FULFILLING", total: 50_000 });
      await makeOrder(cust.id, { status: "SHIPPED", total: 25_000 });
      await makeOrder(cust.id, { status: "DELIVERED", total: 5_000 });

      const spent = await getCustomerTotalSpent(cust.id);
      expect(spent).toBe(180_000);
    }, 30000);

    it("EXCLUYE orders en DRAFT, PENDING_PAYMENT, CANCELLED y REFUNDED", async () => {
      const cust = await makeCustomer();
      await makeOrder(cust.id, { status: "PAID", total: 100_000 }); // cuenta
      await makeOrder(cust.id, { status: "DRAFT", total: 999_999 }); // no
      await makeOrder(cust.id, { status: "PENDING_PAYMENT", total: 999_999 }); // no
      await makeOrder(cust.id, { status: "CANCELLED", total: 999_999 }); // no
      await makeOrder(cust.id, { status: "REFUNDED", total: 999_999 }); // no

      const spent = await getCustomerTotalSpent(cust.id);
      expect(spent).toBe(100_000);
    }, 30000);

    it("EXCLUYE orders soft-deleted aunque estén PAID", async () => {
      const cust = await makeCustomer();
      await makeOrder(cust.id, { status: "PAID", total: 70_000 }); // cuenta
      await makeOrder(cust.id, { status: "PAID", total: 999_999, deletedAt: new Date() }); // no

      const spent = await getCustomerTotalSpent(cust.id);
      expect(spent).toBe(70_000);
    });

    it("aísla por customerId: no suma orders de otro customer", async () => {
      const a = await makeCustomer();
      const b = await makeCustomer();
      await makeOrder(a.id, { status: "PAID", total: 40_000 });
      await makeOrder(b.id, { status: "PAID", total: 999_999 });

      expect(await getCustomerTotalSpent(a.id)).toBe(40_000);
    });

    it("retorna 0 para un customerId inexistente (no lanza)", async () => {
      const spent = await getCustomerTotalSpent(`${RUN}-ghost-customer`);
      expect(spent).toBe(0);
    });
  });

  // ───────────────────────── Seguridad / integridad PII ─────────────────────────

  describe("integridad PII — unicidad (constraints DB)", () => {
    it("rechaza email duplicado con P2002 (target email)", async () => {
      const email = `${nextId()}-dup@cust.test`;
      await prisma.customer.create({
        data: {
          email,
          supabaseUserId: `${nextId()}-sub`,
          referralCode: `${nextId()}-ref`,
        },
      });
      await expect(
        prisma.customer.create({
          data: {
            email, // mismo email
            supabaseUserId: `${nextId()}-sub`,
            referralCode: `${nextId()}-ref`,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002", meta: { target: ["email"] } });
    });

    it("rechaza supabaseUserId duplicado con P2002 (target supabaseUserId)", async () => {
      const sub = `${nextId()}-shared-sub`;
      await prisma.customer.create({
        data: {
          email: `${nextId()}@cust.test`,
          supabaseUserId: sub,
          referralCode: `${nextId()}-ref`,
        },
      });
      await expect(
        prisma.customer.create({
          data: {
            email: `${nextId()}@cust.test`,
            supabaseUserId: sub, // mismo supabaseUserId
            referralCode: `${nextId()}-ref`,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002", meta: { target: ["supabaseUserId"] } });
    });

    it("lookup por email único devuelve exactamente un customer", async () => {
      const email = `${nextId()}-unique@cust.test`;
      const created = await makeCustomer({ email });
      const found = await prisma.customer.findUnique({ where: { email } });
      expect(found?.id).toBe(created.id);
    });
  });
});
