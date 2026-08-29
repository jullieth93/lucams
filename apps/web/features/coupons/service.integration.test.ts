/*
 * Tests de integración del SERVICE de CUPONES contra la DB real.
 *
 * Módulo DB-coupled (importa `prisma` de @/lib/db). Foco PLAN_CATALOG_V2 3.9:
 *   - Validez de creación: orden de fechas validFrom/validTo, rango PERCENT
 *     (1-100), tipos PERCENT/FIXED/FREE_SHIPPING, código único.
 *   - Ventanas de vigencia en listCoupons (active vs inactive: validFrom/validTo
 *     + isActive).
 *   - Métricas usedCount/maxUses/totalDiscounted/uniqueCustomers.
 *   - Transiciones de estado (pause/resume/archive) y soft-delete.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`). Sin ella
 * se saltan (skipIf) para no romper CI sin DB.
 *
 * Aislamiento: todos los cupones de esta corrida usan el prefijo `RUN` único en
 * el código; se limpian en afterAll (hard delete, junto con sus usages,
 * customers y orders sintéticas). Cualquier fila con ese prefijo se borra.
 *
 * `next/cache.updateTag` se mockea a no-op: fuera de un Server Action real
 * lanza ("can only be called from within a Server Action").
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/db";
import {
  CouponValidationError,
  archiveCoupon,
  createCoupon,
  getCoupon,
  getCouponMetrics,
  listCoupons,
  pauseCoupon,
  resumeCoupon,
  updateCoupon,
} from "./service";
import type { CouponCreateInput } from "./schemas";
import { isCouponPerCustomerLimitError } from "./redemption";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Todos los códigos de cupón lo llevan → la limpieza
// borra exactamente lo que creamos sin tocar datos reales.
const RUN = `ITEST${Date.now()}${Math.floor(Math.random() * 1e6)}`.toUpperCase();
const ACTOR = `actor-${RUN}`;

// Helpers de fecha relativos a "ahora" para construir ventanas de vigencia.
const day = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * day);

// Base de un input válido; cada test sobrescribe lo que necesita y un `code`
// único con el prefijo de la corrida.
function baseInput(over: Partial<CouponCreateInput> = {}): CouponCreateInput {
  return {
    code: `${RUN}-BASE`,
    type: "PERCENT",
    value: 10,
    description: null,
    isPublic: false,
    isActive: true,
    validFrom: daysFromNow(-1),
    validTo: daysFromNow(30),
    minOrder: null,
    maxUses: null,
    maxUsesPerCustomer: null,
    requiresMinQuantity: null,
    appliesToCategories: [],
    appliesToProductSlugs: [],
    ...over,
  };
}

describe.skipIf(!hasDb)("coupons/service — integración DB (PLAN_CATALOG_V2 3.9)", () => {
  afterAll(async () => {
    // Borrar usages → orders → customers → coupons creados por esta corrida.
    // FKs: CouponUsage.couponId (Cascade), pero borramos explícito por claridad.
    const coupons = await prisma.coupon.findMany({
      where: { code: { startsWith: RUN } },
      select: { id: true },
    });
    const couponIds = coupons.map((c) => c.id);
    if (couponIds.length) {
      const usages = await prisma.couponUsage.findMany({
        where: { couponId: { in: couponIds } },
        select: { orderId: true, customerId: true },
      });
      await prisma.couponUsage.deleteMany({ where: { couponId: { in: couponIds } } });
      const orderIds = usages.map((u) => u.orderId).filter(Boolean) as string[];
      if (orderIds.length) {
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      }
      const custIds = [...new Set(usages.map((u) => u.customerId).filter(Boolean))] as string[];
      if (custIds.length) {
        await prisma.customer.deleteMany({ where: { id: { in: custIds } } });
      }
    }
    await prisma.coupon.deleteMany({ where: { code: { startsWith: RUN } } });
  });

  // ───────────────────────── createCoupon ─────────────────────────

  describe("createCoupon — validez de creación", () => {
    it("crea un cupón PERCENT válido con createdBy y usedCount=0 por defecto", async () => {
      const code = `${RUN}-PCT-OK`;
      const created = await createCoupon(baseInput({ code, type: "PERCENT", value: 25 }), ACTOR);

      expect(created.code).toBe(code);
      expect(created.type).toBe("PERCENT");
      expect(created.value).toBe(25);
      expect(created.createdBy).toBe(ACTOR);
      expect(created.usedCount).toBe(0);
      expect(created.isActive).toBe(true);
      expect(created.deletedAt).toBeNull();
    });

    it("crea un cupón FIXED (value = COP centavos, sin tope de %)", async () => {
      const code = `${RUN}-FIXED-OK`;
      const created = await createCoupon(baseInput({ code, type: "FIXED", value: 500_000 }), ACTOR);
      expect(created.type).toBe("FIXED");
      expect(created.value).toBe(500_000);
    });

    it("crea un cupón FREE_SHIPPING (value ignorado, no aplica regla 1-100)", async () => {
      const code = `${RUN}-FREE-OK`;
      // value=0 sería ilegal para PERCENT, pero FREE_SHIPPING no valida rango.
      const created = await createCoupon(
        baseInput({ code, type: "FREE_SHIPPING", value: 0 }),
        ACTOR,
      );
      expect(created.type).toBe("FREE_SHIPPING");
      expect(created.value).toBe(0);
    });

    it("persiste minOrder, maxUses y maxUsesPerCustomer cuando se proveen", async () => {
      const code = `${RUN}-LIMITS`;
      const created = await createCoupon(
        baseInput({
          code,
          minOrder: 10_000_000,
          maxUses: 100,
          maxUsesPerCustomer: 1,
          requiresMinQuantity: 6,
          appliesToCategories: ["de-temporada"],
          appliesToProductSlugs: ["iman-magnetico"],
        }),
        ACTOR,
      );
      expect(created.minOrder).toBe(10_000_000);
      expect(created.maxUses).toBe(100);
      expect(created.maxUsesPerCustomer).toBe(1);
      expect(created.requiresMinQuantity).toBe(6);
      expect(created.appliesToCategories).toEqual(["de-temporada"]);
      expect(created.appliesToProductSlugs).toEqual(["iman-magnetico"]);
    });

    it("rechaza validTo <= validFrom (validTo igual a validFrom)", async () => {
      const same = daysFromNow(5);
      await expect(
        createCoupon(baseInput({ code: `${RUN}-EQDATE`, validFrom: same, validTo: same }), ACTOR),
      ).rejects.toMatchObject({
        name: "CouponValidationError",
        field: "validTo",
      });
    });

    it("rechaza validTo anterior a validFrom", async () => {
      await expect(
        createCoupon(
          baseInput({
            code: `${RUN}-BADDATE`,
            validFrom: daysFromNow(10),
            validTo: daysFromNow(2),
          }),
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(CouponValidationError);
    });

    it("rechaza PERCENT con value < 1 (0)", async () => {
      await expect(
        createCoupon(baseInput({ code: `${RUN}-PCT0`, type: "PERCENT", value: 0 }), ACTOR),
      ).rejects.toMatchObject({ field: "value", name: "CouponValidationError" });
    });

    it("rechaza PERCENT con value > 100 (101)", async () => {
      await expect(
        createCoupon(baseInput({ code: `${RUN}-PCT101`, type: "PERCENT", value: 101 }), ACTOR),
      ).rejects.toMatchObject({ field: "value", name: "CouponValidationError" });
    });

    it("acepta PERCENT en los bordes exactos value=1 y value=100", async () => {
      const lo = await createCoupon(
        baseInput({ code: `${RUN}-PCT1`, type: "PERCENT", value: 1 }),
        ACTOR,
      );
      const hi = await createCoupon(
        baseInput({ code: `${RUN}-PCT100`, type: "PERCENT", value: 100 }),
        ACTOR,
      );
      expect(lo.value).toBe(1);
      expect(hi.value).toBe(100);
    });

    it("rechaza código duplicado (mismo code ya existe)", async () => {
      const code = `${RUN}-DUP`;
      await createCoupon(baseInput({ code }), ACTOR);
      await expect(createCoupon(baseInput({ code }), ACTOR)).rejects.toMatchObject({
        field: "code",
        name: "CouponValidationError",
      });
    });

    it("la validación de fechas corre ANTES de tocar la DB (no inserta el cupón inválido)", async () => {
      const code = `${RUN}-NOINSERT`;
      const same = daysFromNow(3);
      await expect(
        createCoupon(baseInput({ code, validFrom: same, validTo: same }), ACTOR),
      ).rejects.toBeInstanceOf(CouponValidationError);
      const found = await prisma.coupon.findUnique({ where: { code } });
      expect(found).toBeNull();
    });
  });

  // ───────────────────────── listCoupons (vigencia) ─────────────────────────

  describe("listCoupons — ventanas de vigencia validFrom/validTo + isActive", () => {
    let activeId = "";
    let expiredId = "";
    let scheduledId = "";
    let pausedId = "";

    beforeAll(async () => {
      // Vigente HOY: validFrom en el pasado, validTo en el futuro, isActive.
      const active = await createCoupon(
        baseInput({
          code: `${RUN}-LIST-ACTIVE`,
          description: "vigente buscable",
          validFrom: daysFromNow(-5),
          validTo: daysFromNow(5),
          isActive: true,
        }),
        ACTOR,
      );
      activeId = active.id;

      // Expirado: validTo en el pasado.
      const expired = await createCoupon(
        baseInput({
          code: `${RUN}-LIST-EXPIRED`,
          validFrom: daysFromNow(-20),
          validTo: daysFromNow(-1),
          isActive: true,
        }),
        ACTOR,
      );
      expiredId = expired.id;

      // Programado: validFrom en el futuro.
      const scheduled = await createCoupon(
        baseInput({
          code: `${RUN}-LIST-SCHEDULED`,
          validFrom: daysFromNow(5),
          validTo: daysFromNow(20),
          isActive: true,
        }),
        ACTOR,
      );
      scheduledId = scheduled.id;

      // Pausado: vigente por fecha pero isActive=false.
      const paused = await createCoupon(
        baseInput({
          code: `${RUN}-LIST-PAUSED`,
          validFrom: daysFromNow(-5),
          validTo: daysFromNow(5),
          isActive: false,
        }),
        ACTOR,
      );
      pausedId = paused.id;
    });

    it("status=active devuelve solo el vigente (isActive + dentro de ventana)", async () => {
      const rows = await listCoupons({ status: "active" });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(activeId);
      expect(ids).not.toContain(expiredId);
      expect(ids).not.toContain(scheduledId);
      expect(ids).not.toContain(pausedId);
    });

    it("status=inactive incluye expirado, programado y pausado pero NO el vigente", async () => {
      const rows = await listCoupons({ status: "inactive" });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(expiredId);
      expect(ids).toContain(scheduledId);
      expect(ids).toContain(pausedId);
      expect(ids).not.toContain(activeId);
    });

    it("status=all (default) incluye todos los no-borrados", async () => {
      const rows = await listCoupons({ status: "all" });
      const ids = rows.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([activeId, expiredId, scheduledId, pausedId]));
    });

    it("filtra por q en code (case-insensitive)", async () => {
      const rows = await listCoupons({ q: `${RUN}-list-active`.toLowerCase() });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(activeId);
      expect(ids).not.toContain(expiredId);
    });

    it("filtra por q en description (case-insensitive)", async () => {
      const rows = await listCoupons({ q: "VIGENTE BUSCABLE" });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(activeId);
    });

    it("incluye _count.usages en cada fila", async () => {
      const rows = await listCoupons({ q: `${RUN}-LIST-ACTIVE` });
      const row = rows.find((r) => r.id === activeId);
      expect(row?._count.usages).toBe(0);
    });

    it("sort=code ordena alfabéticamente por código ascendente", async () => {
      const rows = await listCoupons({ q: `${RUN}-LIST`, sort: "code" });
      const codes = rows.map((r) => r.code);
      const sorted = [...codes].sort();
      expect(codes).toEqual(sorted);
    });

    it("sort=expiry-asc ordena por validTo ascendente (expirado antes que vigente)", async () => {
      const rows = await listCoupons({ q: `${RUN}-LIST`, sort: "expiry-asc" });
      const subset = rows.filter((r) => [expiredId, activeId, scheduledId].includes(r.id));
      const validTos = subset.map((r) => r.validTo.getTime());
      const sorted = [...validTos].sort((a, b) => a - b);
      expect(validTos).toEqual(sorted);
    });
  });

  // ───────────────────────── transiciones de estado ─────────────────────────

  describe("pause / resume / archive — transiciones de estado", () => {
    it("pauseCoupon pone isActive=false y setea updatedBy", async () => {
      const c = await createCoupon(baseInput({ code: `${RUN}-PAUSE` }), ACTOR);
      await pauseCoupon(c.id, ACTOR);
      const after = await prisma.coupon.findUnique({ where: { id: c.id } });
      expect(after?.isActive).toBe(false);
      expect(after?.updatedBy).toBe(ACTOR);
    });

    it("resumeCoupon vuelve isActive=true", async () => {
      const c = await createCoupon(baseInput({ code: `${RUN}-RESUME`, isActive: false }), ACTOR);
      await resumeCoupon(c.id, ACTOR);
      const after = await prisma.coupon.findUnique({ where: { id: c.id } });
      expect(after?.isActive).toBe(true);
    });

    it("archiveCoupon hace soft-delete (deletedAt + deletedBy) y fuerza isActive=false", async () => {
      const c = await createCoupon(baseInput({ code: `${RUN}-ARCHIVE` }), ACTOR);
      await archiveCoupon(c.id, ACTOR);
      const after = await prisma.coupon.findUnique({ where: { id: c.id } });
      expect(after?.deletedAt).toBeInstanceOf(Date);
      expect(after?.deletedBy).toBe(ACTOR);
      expect(after?.isActive).toBe(false);
    });

    it("un cupón archivado (soft-deleted) NO aparece en listCoupons", async () => {
      const c = await createCoupon(baseInput({ code: `${RUN}-ARCH-HIDDEN` }), ACTOR);
      await archiveCoupon(c.id, ACTOR);
      const rows = await listCoupons({ status: "all", q: `${RUN}-ARCH-HIDDEN` });
      expect(rows.map((r) => r.id)).not.toContain(c.id);
    });

    it("updateCoupon modifica campos y setea updatedBy", async () => {
      const c = await createCoupon(baseInput({ code: `${RUN}-UPD`, value: 10 }), ACTOR);
      const updated = await updateCoupon(
        { id: c.id, value: 50, description: "actualizado" },
        `editor-${RUN}`,
      );
      expect(updated.value).toBe(50);
      expect(updated.description).toBe("actualizado");
      expect(updated.updatedBy).toBe(`editor-${RUN}`);
    });
  });

  // ───────────────────────── getCoupon ─────────────────────────

  describe("getCoupon", () => {
    it("devuelve el cupón con usages[] y _count cuando existe", async () => {
      const c = await createCoupon(baseInput({ code: `${RUN}-GET` }), ACTOR);
      const found = await getCoupon(c.id);
      expect(found?.id).toBe(c.id);
      expect(Array.isArray(found?.usages)).toBe(true);
      expect(found?._count.usages).toBe(0);
    });

    it("devuelve null para un id inexistente", async () => {
      const found = await getCoupon("ckxxxxxxxxxxxxxxxxxxxxxxx");
      expect(found).toBeNull();
    });
  });

  // ───────────────────────── getCouponMetrics ─────────────────────────

  describe("getCouponMetrics — usedCount / maxUses / totalDiscounted / uniqueCustomers", () => {
    it("cupón sin usos: usedCount=0, totalDiscounted=0, uniqueCustomers=0", async () => {
      const c = await createCoupon(baseInput({ code: `${RUN}-MTR-EMPTY`, maxUses: 50 }), ACTOR);
      const m = await getCouponMetrics(c.id);
      expect(m.usedCount).toBe(0);
      expect(m.maxUses).toBe(50);
      expect(m.totalDiscounted).toBe(0);
      expect(m.uniqueCustomers).toBe(0);
    });

    it("agrega totalDiscounted (suma de amount) y cuenta clientes distintos", async () => {
      const c = await createCoupon(baseInput({ code: `${RUN}-MTR-USAGE`, maxUses: 10 }), ACTOR);

      // Dos clientes distintos (supabaseUserId y referralCode son @unique).
      const cust1 = await prisma.customer.create({
        data: {
          email: `${RUN}-c1@lucams.test`.toLowerCase(),
          firstName: "Cli",
          lastName: "Uno",
          supabaseUserId: `${RUN}-sub1`,
          referralCode: `${RUN}-ref1`,
        },
      });
      const cust2 = await prisma.customer.create({
        data: {
          email: `${RUN}-c2@lucams.test`.toLowerCase(),
          firstName: "Cli",
          lastName: "Dos",
          supabaseUserId: `${RUN}-sub2`,
          referralCode: `${RUN}-ref2`,
        },
      });

      // Tres orders sintéticas (orderId es @unique en CouponUsage).
      const mkOrder = (n: number, customerId: string) =>
        prisma.order.create({
          data: {
            number: `LCM-${RUN}-${n}`,
            email: `${RUN}-o${n}@lucams.test`.toLowerCase(),
            phone: "3000000000",
            shippingAddress: {},
            subtotal: 100_000,
            shipping: 0,
            total: 100_000,
            paymentMethod: "WOMPI",
            status: "PAID",
            customerId,
            couponId: c.id,
          },
          select: { id: true },
        });

      const o1 = await mkOrder(1, cust1.id);
      const o2 = await mkOrder(2, cust1.id); // mismo cliente → no suma único
      const o3 = await mkOrder(3, cust2.id);

      await prisma.couponUsage.createMany({
        data: [
          { couponId: c.id, customerId: cust1.id, orderId: o1.id, amount: 10_000 },
          { couponId: c.id, customerId: cust1.id, orderId: o2.id, amount: 25_000 },
          { couponId: c.id, customerId: cust2.id, orderId: o3.id, amount: 5_000 },
        ],
      });

      // Mantener usedCount coherente con los 3 usos.
      await prisma.coupon.update({
        where: { id: c.id },
        data: { usedCount: 3 },
      });

      const m = await getCouponMetrics(c.id);
      expect(m.usedCount).toBe(3);
      expect(m.maxUses).toBe(10);
      expect(m.totalDiscounted).toBe(40_000); // 10k + 25k + 5k
      expect(m.uniqueCustomers).toBe(2); // cust1 (x2) + cust2
    }, 30000);

    it("maxUses=null se refleja como null en métricas (uso ilimitado)", async () => {
      const c = await createCoupon(baseInput({ code: `${RUN}-MTR-UNLIM`, maxUses: null }), ACTOR);
      const m = await getCouponMetrics(c.id);
      expect(m.maxUses).toBeNull();
    });

    it("id inexistente: devuelve defaults (usedCount=0, maxUses=null)", async () => {
      const m = await getCouponMetrics("ckxxxxxxxxxxxxxxxxxxxxxxx");
      expect(m.usedCount).toBe(0);
      expect(m.maxUses).toBeNull();
      expect(m.totalDiscounted).toBe(0);
      expect(m.uniqueCustomers).toBe(0);
    });
  });

  // ───────────────────── G-5: trigger maxUsesPerCustomer (DB) ─────────────────
  // Auditoría seguridad 2026-08-24: el tope por cliente era read-then-write sin
  // constraint → dos checkouts pagados en paralelo con la misma identidad pasaban
  // ambos. El trigger `coupon_usage_per_customer_limit` (advisory xact lock +
  // count bajo el lock) lo enforcea en DB; el perdedor recibe 23505 → P2002 que
  // isCouponPerCustomerLimitError mapea al rechazo amable.
  describe("G-5 — trigger coupon_usage_per_customer_limit", () => {
    const g5OrderIds: string[] = [];
    const g5CouponIds: string[] = [];

    const mkCoupon = async (code: string, maxUsesPerCustomer: number | null) => {
      const c = await createCoupon(
        baseInput({ code: `${RUN}-G5-${code}`, maxUsesPerCustomer }),
        ACTOR,
      );
      g5CouponIds.push(c.id);
      return c.id;
    };
    const mkOrder = async (tag: string) => {
      const o = await prisma.order.create({
        data: {
          number: `LCM-${RUN}-G5-${tag}`.slice(0, 60),
          email: `${RUN}-g5-${tag}@lucams.test`.toLowerCase(),
          phone: "3000000000",
          shippingAddress: {},
          subtotal: 100_000,
          shipping: 0,
          total: 100_000,
          paymentMethod: "WOMPI",
          status: "PAID",
        },
        select: { id: true },
      });
      g5OrderIds.push(o.id);
      return o.id;
    };
    const usage = (couponId: string, orderId: string, over: Record<string, unknown> = {}) => ({
      couponId,
      orderId,
      amount: 10_000,
      ...over,
    });

    afterAll(async () => {
      // Orders primero: CouponUsage.orderId es onDelete:Cascade (cubre también
      // los usages que SÍ entraron). Los cupones los borra el afterAll padre.
      const safe = (p: Promise<unknown>) => p.catch(() => {});
      await safe(prisma.order.deleteMany({ where: { id: { in: g5OrderIds } } }));
      await safe(prisma.couponUsage.deleteMany({ where: { couponId: { in: g5CouponIds } } }));
    });

    it("bloquea el 2do uso del mismo email (tope 1) con P2002 mapeable", async () => {
      const couponId = await mkCoupon("EMAIL1", 1);
      const email = `${RUN}-g5-dup@lucams.test`.toLowerCase();
      await prisma.couponUsage.create({ data: usage(couponId, await mkOrder("e1"), { email }) });
      const err = await prisma.couponUsage
        .create({ data: usage(couponId, await mkOrder("e2"), { email }) })
        .then(() => null)
        .catch((e: unknown) => e);
      expect(isCouponPerCustomerLimitError(err)).toBe(true);
      expect(await prisma.couponUsage.count({ where: { couponId } })).toBe(1);
    });

    it("el match de email es case-insensitive (misma persona, otra capitalización)", async () => {
      const couponId = await mkCoupon("CASE", 1);
      const email = `${RUN}-g5-case@lucams.test`.toLowerCase();
      await prisma.couponUsage.create({ data: usage(couponId, await mkOrder("c1"), { email }) });
      const err = await prisma.couponUsage
        .create({
          data: usage(couponId, await mkOrder("c2"), { email: email.toUpperCase() }),
        })
        .then(() => null)
        .catch((e: unknown) => e);
      expect(isCouponPerCustomerLimitError(err)).toBe(true);
    });

    it("bloquea por customerId aunque el email venga null", async () => {
      const couponId = await mkCoupon("CID", 1);
      const cust = await prisma.customer.create({
        data: {
          email: `${RUN}-g5-cid@lucams.test`,
          supabaseUserId: `${RUN}-g5-cid-sub`,
          referralCode: `${RUN}-G5CID`,
        },
        select: { id: true },
      });
      try {
        await prisma.couponUsage.create({
          data: usage(couponId, await mkOrder("k1"), { customerId: cust.id, email: null }),
        });
        const err = await prisma.couponUsage
          .create({
            data: usage(couponId, await mkOrder("k2"), { customerId: cust.id, email: null }),
          })
          .then(() => null)
          .catch((e: unknown) => e);
        expect(isCouponPerCustomerLimitError(err)).toBe(true);
      } finally {
        await prisma.customer.delete({ where: { id: cust.id } }).catch(() => {});
      }
    });

    it("permite otro email distinto y respeta topes >1 (2 usos OK, el 3ro cae)", async () => {
      const couponId = await mkCoupon("TWO", 2);
      const email = `${RUN}-g5-two@lucams.test`.toLowerCase();
      await prisma.couponUsage.create({ data: usage(couponId, await mkOrder("t1"), { email }) });
      await prisma.couponUsage.create({
        data: usage(couponId, await mkOrder("t2"), { email }), // 2do uso: entra
      });
      // Email distinto del mismo cupón: identidad nueva, no cuenta.
      await prisma.couponUsage.create({
        data: usage(couponId, await mkOrder("t3"), { email: `${RUN}-g5-other@lucams.test` }),
      });
      const err = await prisma.couponUsage
        .create({ data: usage(couponId, await mkOrder("t4"), { email }) })
        .then(() => null)
        .catch((e: unknown) => e);
      expect(isCouponPerCustomerLimitError(err)).toBe(true); // 3er uso de la MISMA identidad
    });

    it("carrera real: dos inserts concurrentes de la misma identidad → exactamente uno gana", async () => {
      const couponId = await mkCoupon("RACE", 1);
      const email = `${RUN}-g5-race@lucams.test`.toLowerCase();
      const [o1, o2] = await Promise.all([mkOrder("r1"), mkOrder("r2")]);
      const results = await Promise.allSettled([
        prisma.couponUsage.create({ data: usage(couponId, o1, { email }) }),
        prisma.couponUsage.create({ data: usage(couponId, o2, { email }) }),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r) => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(isCouponPerCustomerLimitError((failed[0] as PromiseRejectedResult).reason)).toBe(true);
      expect(await prisma.couponUsage.count({ where: { couponId } })).toBe(1);
    });

    it("cupón SIN tope por cliente (null) no se ve afectado por el trigger", async () => {
      const couponId = await mkCoupon("FREE", null);
      const email = `${RUN}-g5-free@lucams.test`.toLowerCase();
      await prisma.couponUsage.create({ data: usage(couponId, await mkOrder("f1"), { email }) });
      await prisma.couponUsage.create({ data: usage(couponId, await mkOrder("f2"), { email }) });
      expect(await prisma.couponUsage.count({ where: { couponId } })).toBe(2);
    });
  });
});

// CouponValidationError es una unidad pura — corre siempre, con o sin DB.
describe("CouponValidationError — forma del error", () => {
  it("es una Error con field y name correctos", () => {
    const e = new CouponValidationError("code", "duplicado");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("CouponValidationError");
    expect(e.field).toBe("code");
    expect(e.message).toBe("duplicado");
  });
});
