/*
 * Service de direcciones del cliente (área /mi-cuenta/direcciones).
 *
 * TODAS las funciones scopean por customerId (aislamiento a nivel aplicación —
 * no hay RLS en DB para Address; el cliente solo puede tocar lo suyo). Soft-delete
 * vía deletedAt. Invariante: como máximo UNA dirección con isDefault=true por
 * cliente, garantizada desmarcando el resto dentro de la misma transacción.
 */

import "server-only";
import type { Prisma } from "@lucams/db";
import { prisma } from "@/lib/db";
import { getDepartmentByName, getCityByDeptAndName } from "@/lib/dane-divipola";

/**
 * Si tras una mutación el cliente quedó SIN dirección predeterminada pero le
 * quedan direcciones vivas, promueve la más reciente. Evita el estado "tengo
 * direcciones pero ninguna default" (checkout sin pre-selección).
 */
async function ensureDefault(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
  const hasDefault = await tx.address.count({
    where: { customerId, deletedAt: null, isDefault: true },
  });
  if (hasDefault > 0) return;
  const next = await tx.address.findFirst({
    where: { customerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
}

export type AddressInput = {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  department: string;
  zip?: string | null;
  phone: string;
  isDefault?: boolean;
  // Dirección estructurada del checkout (deptCode/cityCode/kind/vía/cruce…) para
  // reuso 100% al pagar. Los campos de arriba son el "display" derivado.
  structured: Prisma.InputJsonValue;
};

export class AddressNotFoundError extends Error {
  constructor() {
    super("Dirección no encontrada.");
    this.name = "AddressNotFoundError";
  }
}

export async function listAddresses(customerId: string) {
  return prisma.address.findMany({
    where: { customerId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Direcciones guardadas listas para pre-llenar el checkout: mapea los NOMBRES de
 * departamento/ciudad (modelo plano) a los CÓDIGOS DANE que usa el formulario.
 * `deptCode`/`cityCode` quedan null si el nombre no matchea el catálogo DANE (el
 * checkout entonces solo pre-llena teléfono; el usuario elige depto/ciudad).
 */
export type CheckoutPrefillAddress = {
  id: string;
  label: string;
  line1: string;
  isDefault: boolean;
  // Dirección estructurada completa → reuso 100% al pagar. null en direcciones
  // legacy (form plano); en ese caso se usan deptCode/cityCode (mapeo nombre→código).
  structured: Record<string, unknown> | null;
  deptCode: string | null;
  cityCode: string | null;
  zip: string | null;
  phone: string;
};

export async function getSavedAddressesForCheckout(
  customerId: string,
): Promise<CheckoutPrefillAddress[]> {
  const rows = await listAddresses(customerId);
  return rows.map((a) => {
    const structured = (a.structured as Record<string, unknown> | null) ?? null;
    // Fallback legacy (sin structured): mapear los nombres a códigos DANE.
    const dept = structured ? null : getDepartmentByName(a.department);
    const city = dept ? getCityByDeptAndName(dept.code, a.city) : null;
    return {
      id: a.id,
      label: a.name,
      line1: a.line1,
      isDefault: a.isDefault,
      structured,
      deptCode: (structured?.deptCode as string | undefined) ?? dept?.code ?? null,
      cityCode: (structured?.cityCode as string | undefined) ?? city?.code ?? null,
      zip: a.zip,
      phone: a.phone,
    };
  });
}

function toData(input: AddressInput) {
  return {
    name: input.name.trim(),
    line1: input.line1.trim(),
    line2: input.line2?.trim() || null,
    city: input.city.trim(),
    department: input.department.trim(),
    zip: input.zip?.trim() || null,
    phone: input.phone.trim(),
    structured: input.structured,
  };
}

export async function createAddress(customerId: string, input: AddressInput) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { customerId, deletedAt: null } });
    // La primera dirección es default sí o sí; después, solo si el usuario lo pide.
    const makeDefault = Boolean(input.isDefault) || count === 0;
    if (makeDefault) {
      await tx.address.updateMany({
        where: { customerId, deletedAt: null },
        data: { isDefault: false },
      });
    }
    return tx.address.create({
      data: { customerId, ...toData(input), isDefault: makeDefault, createdBy: customerId },
    });
  });
}

export async function updateAddress(customerId: string, id: string, input: AddressInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, customerId, deletedAt: null } });
    if (!existing) throw new AddressNotFoundError();
    const makeDefault = Boolean(input.isDefault);
    if (makeDefault) {
      await tx.address.updateMany({
        where: { customerId, deletedAt: null },
        data: { isDefault: false },
      });
    }
    const updated = await tx.address.update({
      where: { id },
      data: {
        ...toData(input),
        // Si ya era la default y no se desmarca explícito, se conserva.
        isDefault: makeDefault || (existing.isDefault && input.isDefault === undefined),
        updatedBy: customerId,
      },
    });
    // Si el edit desmarcó la única default, promover otra.
    await ensureDefault(tx, customerId);
    return updated;
  });
}

export async function deleteAddress(customerId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const res = await tx.address.updateMany({
      where: { id, customerId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: customerId, isDefault: false },
    });
    if (res.count === 0) throw new AddressNotFoundError();
    // Si se borró la default, promover otra dirección viva a predeterminada.
    await ensureDefault(tx, customerId);
  });
}

export async function setDefaultAddress(customerId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, customerId, deletedAt: null } });
    if (!existing) throw new AddressNotFoundError();
    await tx.address.updateMany({
      where: { customerId, deletedAt: null },
      data: { isDefault: false },
    });
    await tx.address.update({ where: { id }, data: { isDefault: true, updatedBy: customerId } });
  });
}
