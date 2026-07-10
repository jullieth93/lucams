/*
 * Eliminación de cuenta del cliente — derecho de supresión (Ley 1581, art. 8).
 *
 * Enfoque ANONIMIZAR + soft-delete (no borrado físico), para conciliar el derecho
 * de supresión con la RETENCIÓN FISCAL de la DIAN (las facturas/órdenes deben
 * conservarse). Se scrubbea la PII de la persona y se corta el acceso, pero las
 * órdenes quedan referenciando un Customer anonimizado. Ver docs/COMPLIANCE.md.
 *
 * Qué se hace:
 *  - Customer: email→placeholder único, nombre/teléfono/documento→null,
 *    supabaseUserId→null (desvincula del auth user), deletedAt/deletedBy.
 *  - Address: soft-delete (contienen PII: nombre, dirección, teléfono).
 *  - Review: se desvinculan (customerId→null) y se anonimiza el nombre snapshot,
 *    conservando el contenido público de la reseña.
 *  - Auth user de Supabase: se borra (no puede volver a iniciar sesión).
 * Qué NO se toca (retención legal): órdenes/facturas (DIAN) y consentimientos
 * (prueba de cumplimiento Ley 1581).
 */

import "server-only";
import { prisma } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export async function deleteCustomerAccount(
  customerId: string,
  supabaseUserId: string,
): Promise<void> {
  const now = new Date();

  // 1) Anonimización + soft-delete (transacción DB).
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: {
        email: `deleted-${customerId}@deleted.lucamsshop.co`,
        firstName: null,
        lastName: null,
        phone: null,
        documentType: null,
        documentNumber: null,
        taxResponsibility: null,
        // supabaseUserId es NOT NULL @unique → placeholder único en vez de null.
        // Desvincula igual: ningún auth user real tendrá este id, así que
        // getCurrentCustomer nunca resolverá esta fila tras el borrado.
        supabaseUserId: `deleted-${customerId}`,
        deletedAt: now,
        deletedBy: customerId,
      },
    });
    await tx.address.updateMany({
      where: { customerId, deletedAt: null },
      data: { deletedAt: now, deletedBy: customerId, isDefault: false },
    });
    await tx.review.updateMany({
      where: { customerId },
      data: { customerId: null, authorName: "Cliente Lucams", authorCity: null },
    });
  });

  // 2) Borrar el usuario de Supabase Auth (fuera de la tx — operación externa no
  //    transaccional). Best-effort: si falla, la cuenta YA quedó inaccesible
  //    (supabaseUserId=null → getCurrentCustomer no la resuelve); queda log para
  //    reconciliación manual del auth user huérfano.
  const { error } = await supabaseService.auth.admin.deleteUser(supabaseUserId);
  if (error) {
    logger.error({ event: "account.delete.auth_user_fail", customerId, err: error.message });
  }

  logger.info({ event: "account.delete.success", customerId });
}
