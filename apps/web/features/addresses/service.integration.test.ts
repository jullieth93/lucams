/*
 * Integración DB — service de direcciones del cliente. Verifica la invariante
 * "como máximo UNA default por cliente" + aislamiento por customerId + soft-delete.
 *
 * Corre contra la DB de dev (DATABASE_URL). Aislamiento estricto: un Customer de
 * prueba con datos RUN-prefijados; afterAll borra addresses + el customer.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  AddressNotFoundError,
} from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `ITESTADDR${Date.now()}${Math.floor(Math.random() * 1e6)}`;

let customerId = "";
let otherId = "";

const base = {
  name: "Casa",
  line1: "Calle 1 # 2-3",
  city: "Bogotá",
  department: "Cundinamarca",
  phone: "3000000000",
};

describe.skipIf(!hasDb)("addresses/service — integración DB", () => {
  beforeAll(async () => {
    const mk = (suffix: string) =>
      prisma.customer.create({
        data: {
          email: `${RUN}-${suffix}@test.local`,
          supabaseUserId: `${RUN}-${suffix}`,
          referralCode: `${RUN}-${suffix}`.slice(0, 40),
        },
        select: { id: true },
      });
    customerId = (await mk("main")).id;
    otherId = (await mk("other")).id;
  });

  afterAll(async () => {
    await prisma.address
      .deleteMany({ where: { customerId: { in: [customerId, otherId] } } })
      .catch(() => {});
    await prisma.customer
      .deleteMany({ where: { id: { in: [customerId, otherId] } } })
      .catch(() => {});
  });

  it("la PRIMERA dirección queda como default automáticamente", async () => {
    const a = await createAddress(customerId, base);
    expect(a.isDefault).toBe(true);
  });

  it("la SEGUNDA no es default salvo que se pida", async () => {
    const b = await createAddress(customerId, { ...base, name: "Oficina" });
    expect(b.isDefault).toBe(false);
    const list = await listAddresses(customerId);
    expect(list.filter((x) => x.isDefault)).toHaveLength(1); // invariante
  });

  it("setDefault mueve la default y deja exactamente UNA", async () => {
    const list = await listAddresses(customerId);
    const notDefault = list.find((x) => !x.isDefault)!;
    await setDefaultAddress(customerId, notDefault.id);
    const after = await listAddresses(customerId);
    expect(after.filter((x) => x.isDefault)).toHaveLength(1);
    expect(after.find((x) => x.id === notDefault.id)!.isDefault).toBe(true);
  });

  it("crear con isDefault=true desmarca la anterior", async () => {
    await createAddress(customerId, { ...base, name: "Nueva", isDefault: true });
    const list = await listAddresses(customerId);
    expect(list.filter((x) => x.isDefault)).toHaveLength(1);
    expect(list[0].name).toBe("Nueva"); // orderBy isDefault desc → la default primero
  });

  it("deleteAddress hace soft-delete (sale del listado)", async () => {
    const list = await listAddresses(customerId);
    const target = list.find((x) => !x.isDefault)!;
    await deleteAddress(customerId, target.id);
    const after = await listAddresses(customerId);
    expect(after.some((x) => x.id === target.id)).toBe(false);
    const row = await prisma.address.findUnique({ where: { id: target.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("aislamiento: otro cliente NO puede tocar direcciones ajenas", async () => {
    const mine = (await listAddresses(customerId))[0];
    await expect(setDefaultAddress(otherId, mine.id)).rejects.toBeInstanceOf(AddressNotFoundError);
    await expect(deleteAddress(otherId, mine.id)).rejects.toBeInstanceOf(AddressNotFoundError);
    await expect(updateAddress(otherId, mine.id, base)).rejects.toBeInstanceOf(AddressNotFoundError);
    // La dirección sigue intacta.
    const still = await prisma.address.findUnique({ where: { id: mine.id } });
    expect(still?.deletedAt).toBeNull();
  });

  it("borrar la dirección DEFAULT promueve otra viva a predeterminada", async () => {
    // otherId arranca sin direcciones (los tests previos no le crearon ninguna).
    const a = await createAddress(otherId, { ...base, name: "A" }); // primera → default
    const b = await createAddress(otherId, { ...base, name: "B" }); // no default
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(false);

    await deleteAddress(otherId, a.id); // se borra la default

    const list = await listAddresses(otherId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(b.id);
    expect(list[0].isDefault).toBe(true); // B fue promovida
  });
});
