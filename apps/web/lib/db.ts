/*
 * Re-export del cliente Prisma desde @lucams/db.
 *
 * Permite a la app importar como `import { prisma } from "@/lib/db"`
 * sin acoplarse al nombre del package workspace. Si en el futuro
 * cambia la implementación (ej. wrapper con tracing), solo se cambia
 * acá sin tocar consumers.
 */

import "server-only";
export { prisma } from "@lucams/db";
export type { Prisma } from "@lucams/db";
