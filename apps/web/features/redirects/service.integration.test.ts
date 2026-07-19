/*
 * Tests de integración del SERVICE de REDIRECTS — UrlRedirect admin-managed
 * (301/302 dinámicos). Consumido por proxy.ts (middleware) para resolver
 * redirects en cada GET público.
 *
 * El módulo @/features/redirects/service.ts es DB-coupled (importa `prisma` de
 * @/lib/db) y expone:
 *   - listRedirects(opts): listado paginado con búsqueda (fromPath/toPath/
 *     description), filtro status (active/inactive/archived/all), sort
 *     (recent/from/hits) y derivados (isArchived = !!deletedAt).
 *   - createRedirect(input, actorAdminId): normaliza paths, valida 301/302,
 *     rechaza origen==destino, rechaza fromPath duplicado activo, y REUSA la
 *     fila si existía archivada (reactivación in-place).
 *   - updateRedirect / toggleRedirectActive / archiveRedirect / restoreRedirect.
 *   - lookupActiveRedirect(fromPath): { toPath, statusCode } | null — el camino
 *     caliente del proxy (solo filas activas, no archivadas).
 *   - incrementRedirectHit(fromPath): best-effort, no bloqueante (.catch swallow).
 *
 * Estrategia: integración DB pura. Requiere DATABASE_URL (corre vía
 * `dotenv -e .env.local -- vitest`); sin ella se salta (skipIf) para no romper
 * CI sin DB.
 *
 * AISLAMIENTO ESTRICTO (nunca tocar datos reales):
 *   - Todo fromPath de esta corrida lleva el prefijo único `/${RUN}/...`. La
 *     limpieza en afterAll borra EXACTAMENTE lo creado, SCOPED por
 *     fromPath startsWith `/${RUN}`. JAMÁS un deleteMany sin filtro.
 *   - actorAdminId es un string sintético prefijado por RUN (UrlRedirect.createdBy
 *     es String? libre, sin FK a AdminUser → no contamina cuentas reales).
 *
 * El comportamiento esperado se verificó leyendo la fuente COMPLETA + proxy.ts y
 * probando la resolución de `new URL(toPath, base)` con vectores open-redirect
 * (//evil.com, /\evil.com → resuelven a host externo). Desde ADR-046,
 * `assertAllowedToPath` (lib/safe-redirect) BLOQUEA esos vectores disfrazados en
 * create/update; los tests de abajo verifican el bloqueo.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  RedirectValidationError,
  archiveRedirect,
  createRedirect,
  incrementRedirectHit,
  listRedirects,
  lookupActiveRedirect,
  restoreRedirect,
  toggleRedirectActive,
  updateRedirect,
} from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Todos los fromPath lo llevan como primer segmento
// (`/${RUN}/...`) → la limpieza borra exactamente lo creado sin tocar redirects
// reales (seed, los que cree Lucy).
// #29 — RUN en minúsculas: createRedirect ahora normaliza el fromPath a minúsculas, así que un
// prefijo minúsculo mantiene `created.fromPath === from` en las aserciones y evita fugar filas
// (la limpieza filtra por este prefijo). Igual usamos mode:"insensitive" en el afterAll por si
// algún seed mete mayúsculas en el sufijo.
const RUN = `itestredir${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const ACTOR = `${RUN}-admin`;

let seq = 0;
function nextPath(suffix = "") {
  seq += 1;
  return `/${RUN}/p${seq}${suffix}`;
}

// Crea un redirect directamente vía prisma (bypass del service) para sembrar
// estados arbitrarios (archivado, inactivo, hitCount, lastHitAt) que el service
// no permite fijar en create. fromPath SIEMPRE bajo `/${RUN}` para limpieza.
async function seedRedirect(
  over: Partial<{
    fromPath: string;
    toPath: string;
    statusCode: number;
    description: string | null;
    isActive: boolean;
    hitCount: number;
    lastHitAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
  }> = {},
) {
  return prisma.urlRedirect.create({
    data: {
      fromPath: over.fromPath ?? nextPath(),
      toPath: over.toPath ?? "/legal/garantias",
      statusCode: over.statusCode ?? 301,
      description: over.description === undefined ? null : over.description,
      isActive: over.isActive ?? true,
      hitCount: over.hitCount ?? 0,
      lastHitAt: over.lastHitAt ?? null,
      deletedAt: over.deletedAt ?? null,
      createdBy: ACTOR,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
}

// Timeout amplio a nivel de suite: cada test hace varios round-trips a la Supabase remota y
// createRedirect ahora suma un query de anti-cadena (#24). El default de 5s flakea bajo latencia.
describe.skipIf(!hasDb)(
  "redirects/service — integración DB (UrlRedirect admin 301/302)",
  { timeout: 30_000 },
  () => {
    afterAll(async () => {
      // SCOPED al prefijo RUN. Todos los fromPath empiezan con `/${RUN}`. Esto
      // incluye filas creadas por el service (createRedirect normaliza pero
      // conserva el prefijo) y por seedRedirect.
      await prisma.urlRedirect.deleteMany({
        where: { fromPath: { startsWith: `/${RUN}`, mode: "insensitive" } },
      });
    });

    // ─────────────────────────── lookupActiveRedirect (camino caliente proxy) ───

    describe("lookupActiveRedirect", () => {
      it("devuelve { toPath, statusCode } para un redirect activo y no archivado", async () => {
        const from = nextPath();
        await seedRedirect({ fromPath: from, toPath: "/legal/garantias", statusCode: 301 });

        const res = await lookupActiveRedirect(from);
        expect(res).toEqual({ toPath: "/legal/garantias", statusCode: 301 });
      });

      it("preserva el statusCode 302 (temporal) tal cual se persistió", async () => {
        const from = nextPath();
        await seedRedirect({ fromPath: from, toPath: "/promo", statusCode: 302 });

        const res = await lookupActiveRedirect(from);
        expect(res?.statusCode).toBe(302);
      });

      it("devuelve null para un fromPath que no existe", async () => {
        const res = await lookupActiveRedirect(`/${RUN}/does-not-exist-zzz`);
        expect(res).toBeNull();
      });

      it("NO matchea un redirect inactivo (isActive:false)", async () => {
        const from = nextPath();
        await seedRedirect({ fromPath: from, isActive: false });

        const res = await lookupActiveRedirect(from);
        expect(res).toBeNull();
      });

      it("NO matchea un redirect archivado (deletedAt != null) aunque siga isActive", async () => {
        // Estado inconsistente a propósito: archivado pero isActive true. El lookup
        // exige deletedAt:null → no debe matchear (defensa del filtro compuesto).
        const from = nextPath();
        await seedRedirect({ fromPath: from, isActive: true, deletedAt: new Date() });

        const res = await lookupActiveRedirect(from);
        expect(res).toBeNull();
      });

      it("el match de fromPath es exacto, no por prefijo (no devuelve un path vecino)", async () => {
        const base = nextPath();
        await seedRedirect({ fromPath: base, toPath: "/base" });

        // Un sufijo extra NO debe resolver al redirect de `base`.
        const res = await lookupActiveRedirect(`${base}/extra`);
        expect(res).toBeNull();
      });

      it("lookupActiveRedirect hace match EXACTO del fromPath almacenado (no normaliza en lectura)", async () => {
        // lookupActiveRedirect es un match exacto a nivel DB sobre lo persistido. La normalización
        // case-insensitive vive AGUAS ARRIBA: createRedirect lowercasea el fromPath al escribir (#29,
        // ver test abajo) y el proxy lowercasea el path al leer. Acá seedRedirect (raw) mete un casing
        // mixto a propósito para documentar que el lookup crudo respeta el casing almacenado.
        const from = `/${RUN}/MixedRawSeed${++seq}`;
        await seedRedirect({ fromPath: from, toPath: "/x" });

        expect(await lookupActiveRedirect(from)).not.toBeNull();
        expect(await lookupActiveRedirect(from.toUpperCase())).toBeNull();
      });

      it("solo proyecta toPath y statusCode (no fuga PII/campos de auditoría)", async () => {
        const from = nextPath();
        await seedRedirect({ fromPath: from, toPath: "/y", description: "interno secreto" });

        const res = await lookupActiveRedirect(from);
        expect(res).not.toBeNull();
        expect(Object.keys(res!).sort()).toEqual(["statusCode", "toPath"]);
      });
    });

    // ─────────────────────────── createRedirect ─────────────────────────────────

    describe("createRedirect", () => {
      it("crea un redirect con defaults: isActive true, hitCount 0, createdBy=actor", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/legal/garantias", statusCode: 301 },
          ACTOR,
        );

        expect(created.fromPath).toBe(from);
        expect(created.toPath).toBe("/legal/garantias");
        expect(created.statusCode).toBe(301);
        expect(created.isActive).toBe(true);
        expect(created.hitCount).toBe(0);
        expect(created.deletedAt).toBeNull();
        expect(created.createdBy).toBe(ACTOR);
        expect(created.description).toBeNull();

        // Persistido y resoluble inmediatamente por el lookup del proxy.
        const looked = await lookupActiveRedirect(from);
        expect(looked).toEqual({ toPath: "/legal/garantias", statusCode: 301 });
      });

      it("normaliza fromPath/toPath agregando '/' inicial si falta", async () => {
        // Sin barra inicial → normalizePath antepone '/'. Conservamos el prefijo RUN
        // para la limpieza, pero pasamos el path SIN la barra de apertura.
        const raw = `${RUN}/no-leading-slash-${++seq}`;
        const created = await createRedirect(
          { fromPath: raw, toPath: "destino-sin-barra", statusCode: 302 },
          ACTOR,
        );
        expect(created.fromPath).toBe(`/${raw}`);
        expect(created.toPath).toBe("/destino-sin-barra");
      });

      it("trimea espacios alrededor de los paths antes de persistir", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: `   ${from}   `, toPath: "   /trimmed-dest   ", statusCode: 301 },
          ACTOR,
        );
        expect(created.fromPath).toBe(from);
        expect(created.toPath).toBe("/trimmed-dest");
      });

      it("persiste description cuando se provee", async () => {
        const from = nextPath();
        const created = await createRedirect(
          {
            fromPath: from,
            toPath: "/dst",
            statusCode: 301,
            description: `${RUN} nota interna`,
          },
          ACTOR,
        );
        expect(created.description).toBe(`${RUN} nota interna`);
      });

      it("respeta isActive:false explícito (redirect creado pausado)", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/dst", statusCode: 301, isActive: false },
          ACTOR,
        );
        expect(created.isActive).toBe(false);
        // Inactivo → el lookup del proxy no lo resuelve.
        expect(await lookupActiveRedirect(from)).toBeNull();
      });

      it("rechaza fromPath vacío (solo espacios) con RedirectValidationError(field=fromPath)", async () => {
        await expect(
          createRedirect({ fromPath: "   ", toPath: "/dst", statusCode: 301 }, ACTOR),
        ).rejects.toMatchObject({
          constructor: RedirectValidationError,
          field: "fromPath",
        });
      });

      it("rechaza toPath vacío (normalizePath del destino lanza)", async () => {
        const from = nextPath();
        await expect(
          createRedirect({ fromPath: from, toPath: "  ", statusCode: 301 }, ACTOR),
        ).rejects.toBeInstanceOf(RedirectValidationError);
      });

      it("rechaza origen == destino tras normalizar (field=toPath)", async () => {
        // Ambos normalizan al mismo path → debe lanzar.
        const p = `${RUN}/same-${++seq}`; // sin barra: ambos quedan "/RUN/same-N"
        await expect(
          createRedirect({ fromPath: p, toPath: p, statusCode: 301 }, ACTOR),
        ).rejects.toMatchObject({ field: "toPath" });
      });

      it("rechaza statusCode inválido (≠ 301/302) con field=statusCode", async () => {
        const from = nextPath();
        await expect(
          // @ts-expect-error — fuerza un código fuera del union para probar la guard runtime.
          createRedirect({ fromPath: from, toPath: "/dst", statusCode: 307 }, ACTOR),
        ).rejects.toMatchObject({ field: "statusCode" });
        // No debe haberse creado nada.
        expect(await lookupActiveRedirect(from)).toBeNull();
      });

      it("rechaza un segundo redirect ACTIVO con el mismo fromPath (field=fromPath)", async () => {
        const from = nextPath();
        await createRedirect({ fromPath: from, toPath: "/a", statusCode: 301 }, ACTOR);

        await expect(
          createRedirect({ fromPath: from, toPath: "/b", statusCode: 302 }, ACTOR),
        ).rejects.toMatchObject({ field: "fromPath" });

        // El original sigue intacto (no se sobrescribió a /b).
        expect(await lookupActiveRedirect(from)).toEqual({ toPath: "/a", statusCode: 301 });
      });

      it("REACTIVA in-place un fromPath que estaba archivado (reusa el row, no crea otro)", async () => {
        const from = nextPath();
        // Sembramos un row archivado con datos viejos.
        const archived = await seedRedirect({
          fromPath: from,
          toPath: "/destino-viejo",
          statusCode: 302,
          isActive: false,
          deletedAt: new Date(),
          hitCount: 99,
        });

        const reactivated = await createRedirect(
          { fromPath: from, toPath: "/destino-nuevo", statusCode: 301, description: "renace" },
          ACTOR,
        );

        // Mismo id físico (reuso del row, no INSERT nuevo).
        expect(reactivated.id).toBe(archived.id);
        expect(reactivated.deletedAt).toBeNull();
        expect(reactivated.deletedBy).toBeNull();
        expect(reactivated.toPath).toBe("/destino-nuevo");
        expect(reactivated.statusCode).toBe(301);
        expect(reactivated.isActive).toBe(true);
        expect(reactivated.updatedBy).toBe(ACTOR);
        // hitCount NO se resetea en la reactivación (el update no lo toca).
        expect(reactivated.hitCount).toBe(99);

        // Solo existe UNA fila para ese fromPath.
        const count = await prisma.urlRedirect.count({ where: { fromPath: from } });
        expect(count).toBe(1);

        // Y ahora el lookup lo resuelve al destino nuevo.
        expect(await lookupActiveRedirect(from)).toEqual({
          toPath: "/destino-nuevo",
          statusCode: 301,
        });
      });

      it("la reactivación respeta isActive:false explícito (revive pausado)", async () => {
        const from = nextPath();
        await seedRedirect({ fromPath: from, isActive: false, deletedAt: new Date() });
        const res = await createRedirect(
          { fromPath: from, toPath: "/x", statusCode: 301, isActive: false },
          ACTOR,
        );
        expect(res.deletedAt).toBeNull();
        expect(res.isActive).toBe(false);
      });
    });

    // ─────────────────── #29 case-insensitive · #24 bucles / rutas vivas ─────────

    describe("createRedirect — normalización y validaciones (audit v3 #24/#29)", () => {
      it("#29 lowercasea el fromPath al escribir (match case-insensitive del proxy)", async () => {
        const from = `/${RUN}/MixedCaseWrite${++seq}`;
        const created = await createRedirect(
          { fromPath: from, toPath: "/legal/garantias", statusCode: 301 },
          ACTOR,
        );
        expect(created.fromPath).toBe(from.toLowerCase());
        // El toPath NO se lowercasea (destinos externos pueden ser case-sensitive).
        expect(created.toPath).toBe("/legal/garantias");
        // Resoluble por la llave en minúsculas (la que arma el proxy).
        expect(await lookupActiveRedirect(from.toLowerCase())).not.toBeNull();
      });

      it("#29 rechaza self-loop case-insensitive (/foo → /Foo)", async () => {
        const base = `${RUN}/selfloop${++seq}`;
        await expect(
          createRedirect(
            { fromPath: `/${base}`, toPath: `/${base.toUpperCase()}`, statusCode: 301 },
            ACTOR,
          ),
        ).rejects.toMatchObject({ field: "toPath" });
      });

      it("#24 rechaza fromPath que es una página estática viva (ej. /carrito)", async () => {
        await expect(
          createRedirect({ fromPath: "/carrito", toPath: "/productos", statusCode: 301 }, ACTOR),
        ).rejects.toMatchObject({ field: "fromPath" });
        // No persiste nada (la ruta viva no lleva prefijo RUN; verificamos que no se creó).
        expect(await prisma.urlRedirect.findUnique({ where: { fromPath: "/carrito" } })).toBeNull();
      });

      it("#24 rechaza cadena: crear Z→X cuando X ya es origen de un redirect activo", async () => {
        const x = nextPath();
        const y = nextPath();
        const z = nextPath();
        await createRedirect({ fromPath: x, toPath: y, statusCode: 301 }, ACTOR); // X→Y
        // Z→X: X ya es fromPath de un redirect activo → cadena → rechazo.
        await expect(
          createRedirect({ fromPath: z, toPath: x, statusCode: 301 }, ACTOR),
        ).rejects.toMatchObject({ field: "toPath" });
      });

      it("#24 rechaza el bucle A→B seguido de B→A", async () => {
        const a = nextPath();
        const b = nextPath();
        await createRedirect({ fromPath: a, toPath: b, statusCode: 301 }, ACTOR); // A→B
        // B→A: A ya es fromPath activo (A→B) → bucle → rechazo.
        await expect(
          createRedirect({ fromPath: b, toPath: a, statusCode: 301 }, ACTOR),
        ).rejects.toMatchObject({ field: "toPath" });
      });

      it("#24 permite un fromPath legacy que NO es una página viva (caso legítimo)", async () => {
        // Un slug archivado/inexistente no colisiona con ninguna página real → debe crearse.
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/productos", statusCode: 301 },
          ACTOR,
        );
        expect(created.fromPath).toBe(from);
      });

      it("#24 updateRedirect rechaza cambiar el toPath a un origen de otro redirect (cadena)", async () => {
        const x = nextPath();
        const y = nextPath();
        const m = nextPath();
        await createRedirect({ fromPath: x, toPath: y, statusCode: 301 }, ACTOR); // X→Y
        const mm = await createRedirect(
          { fromPath: m, toPath: "/productos", statusCode: 301 },
          ACTOR,
        );
        // Editar M para que apunte a X (origen activo) → cadena → rechazo.
        await expect(
          updateRedirect({ id: mm.id, toPath: x, statusCode: 301 }, ACTOR),
        ).rejects.toMatchObject({ field: "toPath" });
      });
    });

    // ─────────────────────────── SEGURIDAD: open-redirect / destinos ────────────

    describe("seguridad — destinos de redirect (open-redirect)", () => {
      it("PERMITE destino externo http(s):// tal cual (sin restricción de scheme — por diseño)", async () => {
        // El schema documenta "Sin restricciones de scheme" y normalizePath retorna
        // las URLs http(s) sin tocar. Documentamos el comportamiento REAL.
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "https://otra-empresa.com/landing", statusCode: 301 },
          ACTOR,
        );
        expect(created.toPath).toBe("https://otra-empresa.com/landing");
        // El lookup lo devolverá y el proxy hará redirect absoluto a host externo.
        expect((await lookupActiveRedirect(from))?.toPath).toBe("https://otra-empresa.com/landing");
      });

      it("BLOQUEA destino protocol-relative '//evil.com' (open-redirect) — ADR-046", async () => {
        // '//evil.com' empieza con '/' pero el proxy lo resolvería a un host
        // EXTERNO (new URL('//evil.com', base) → https://evil.com). assertAllowedToPath
        // ahora lo rechaza antes de persistir.
        const from = nextPath();
        await expect(
          createRedirect({ fromPath: from, toPath: "//evil.com/phish", statusCode: 302 }, ACTOR),
        ).rejects.toBeInstanceOf(RedirectValidationError);
        // Y NO se persistió ninguna fila con ese fromPath.
        expect(await prisma.urlRedirect.findUnique({ where: { fromPath: from } })).toBeNull();
      });

      it("BLOQUEA destino con backslash '/\\evil.com' (open-redirect) — ADR-046", async () => {
        // '/\evil.com' → el navegador normaliza '\' → '/' → //evil.com → host externo.
        const from = nextPath();
        await expect(
          createRedirect({ fromPath: from, toPath: "/\\evil.com", statusCode: 302 }, ACTOR),
        ).rejects.toBeInstanceOf(RedirectValidationError);
        expect(await prisma.urlRedirect.findUnique({ where: { fromPath: from } })).toBeNull();
      });

      it("un destino interno legítimo resuelve al MISMO host (no es open-redirect)", async () => {
        // Contraste sano: '/legal/garantias' se queda en el host propio.
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/legal/garantias", statusCode: 301 },
          ACTOR,
        );
        const resolved = new URL(created.toPath, "https://lucamsshop.co/page");
        expect(resolved.host).toBe("lucamsshop.co");
      });
    });

    // ─────────────────────────── incrementRedirectHit ──────────────────────────

    describe("incrementRedirectHit", () => {
      it("incrementa hitCount en 1 y fija lastHitAt para un redirect activo", async () => {
        const from = nextPath();
        const before = await seedRedirect({ fromPath: from, hitCount: 0, lastHitAt: null });
        expect(before.lastHitAt).toBeNull();

        await incrementRedirectHit(from);

        const after = await prisma.urlRedirect.findUnique({ where: { fromPath: from } });
        expect(after?.hitCount).toBe(1);
        expect(after?.lastHitAt).toBeInstanceOf(Date);
      });

      it("es acumulativo: tres hits dejan hitCount = 3", async () => {
        const from = nextPath();
        await seedRedirect({ fromPath: from, hitCount: 0 });

        await incrementRedirectHit(from);
        await incrementRedirectHit(from);
        await incrementRedirectHit(from);

        const after = await prisma.urlRedirect.findUnique({ where: { fromPath: from } });
        expect(after?.hitCount).toBe(3);
      });

      it("avanza lastHitAt en hits sucesivos (monotónico no-decreciente)", async () => {
        const from = nextPath();
        await seedRedirect({
          fromPath: from,
          hitCount: 0,
          lastHitAt: new Date(Date.now() - 60_000),
        });

        await incrementRedirectHit(from);
        const t1 = (await prisma.urlRedirect.findUnique({ where: { fromPath: from } }))?.lastHitAt;
        await incrementRedirectHit(from);
        const t2 = (await prisma.urlRedirect.findUnique({ where: { fromPath: from } }))?.lastHitAt;

        expect(t1).toBeInstanceOf(Date);
        expect(t2!.getTime()).toBeGreaterThanOrEqual(t1!.getTime());
      });

      it("NO incrementa un redirect inactivo (updateMany filtra isActive)", async () => {
        const from = nextPath();
        await seedRedirect({ fromPath: from, isActive: false, hitCount: 5 });

        await incrementRedirectHit(from);

        const after = await prisma.urlRedirect.findUnique({ where: { fromPath: from } });
        expect(after?.hitCount).toBe(5); // sin cambios
      });

      it("NO incrementa un redirect archivado (deletedAt != null)", async () => {
        const from = nextPath();
        await seedRedirect({ fromPath: from, isActive: true, deletedAt: new Date(), hitCount: 7 });

        await incrementRedirectHit(from);

        const after = await prisma.urlRedirect.findUnique({ where: { fromPath: from } });
        expect(after?.hitCount).toBe(7);
      });

      it("no lanza (best-effort) para un fromPath inexistente — updateMany 0 filas", async () => {
        // No debe rechazar la promesa: el proxy lo invoca con void sin await del error.
        await expect(incrementRedirectHit(`/${RUN}/ghost-hit-zzz`)).resolves.toBeUndefined();
      });
    });

    // ─────────────────────────── updateRedirect ────────────────────────────────

    describe("updateRedirect", () => {
      it("actualiza toPath/statusCode/description y registra updatedBy", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/v1", statusCode: 301 },
          ACTOR,
        );

        const updated = await updateRedirect(
          {
            id: created.id,
            toPath: "/v2",
            statusCode: 302,
            description: `${RUN} actualizado`,
          },
          `${RUN}-editor`,
        );

        expect(updated.toPath).toBe("/v2");
        expect(updated.statusCode).toBe(302);
        expect(updated.description).toBe(`${RUN} actualizado`);
        expect(updated.updatedBy).toBe(`${RUN}-editor`);
        // fromPath es inmutable en update — no se toca.
        expect(updated.fromPath).toBe(from);
      });

      it("conserva isActive previo cuando no se pasa isActive en el input", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/a", statusCode: 301, isActive: false },
          ACTOR,
        );
        const updated = await updateRedirect(
          { id: created.id, toPath: "/b", statusCode: 301 },
          ACTOR,
        );
        // input.isActive ?? existing.isActive → conserva el false previo.
        expect(updated.isActive).toBe(false);
      });

      it("rechaza id inexistente con field=id", async () => {
        await expect(
          updateRedirect({ id: `${RUN}-no-such-id`, toPath: "/x", statusCode: 301 }, ACTOR),
        ).rejects.toMatchObject({ field: "id" });
      });

      it("rechaza actualizar un redirect archivado (findFirst exige deletedAt:null) → field=id", async () => {
        const from = nextPath();
        const archived = await seedRedirect({ fromPath: from, deletedAt: new Date() });
        await expect(
          updateRedirect({ id: archived.id, toPath: "/x", statusCode: 301 }, ACTOR),
        ).rejects.toMatchObject({ field: "id" });
      });

      it("rechaza statusCode inválido con field=statusCode", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/a", statusCode: 301 },
          ACTOR,
        );
        await expect(
          // @ts-expect-error — código fuera del union.
          updateRedirect({ id: created.id, toPath: "/b", statusCode: 418 }, ACTOR),
        ).rejects.toMatchObject({ field: "statusCode" });
      });

      it("rechaza dejar toPath == fromPath existente (field=toPath)", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/distinto", statusCode: 301 },
          ACTOR,
        );
        // Intentar setear toPath igual al fromPath → loop, debe rechazar.
        await expect(
          updateRedirect({ id: created.id, toPath: from, statusCode: 301 }, ACTOR),
        ).rejects.toMatchObject({ field: "toPath" });
      });
    });

    // ─────────────────────────── toggle / archive / restore ─────────────────────

    describe("toggleRedirectActive", () => {
      it("invierte isActive (true → false) y registra updatedBy", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/a", statusCode: 301 },
          ACTOR,
        );
        expect(created.isActive).toBe(true);

        const toggled = await toggleRedirectActive(created.id, `${RUN}-toggler`);
        expect(toggled.isActive).toBe(false);
        expect(toggled.updatedBy).toBe(`${RUN}-toggler`);
        // Tras pausar, el lookup del proxy ya no lo resuelve.
        expect(await lookupActiveRedirect(from)).toBeNull();
      });

      it("vuelve a activar (false → true) en un segundo toggle", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/a", statusCode: 301, isActive: false },
          ACTOR,
        );
        const toggled = await toggleRedirectActive(created.id, ACTOR);
        expect(toggled.isActive).toBe(true);
        expect(await lookupActiveRedirect(from)).toEqual({ toPath: "/a", statusCode: 301 });
      });

      it("rechaza id inexistente con field=id", async () => {
        await expect(toggleRedirectActive(`${RUN}-ghost`, ACTOR)).rejects.toMatchObject({
          field: "id",
        });
      });

      it("rechaza togglear un redirect archivado (findFirst deletedAt:null) → field=id", async () => {
        const archived = await seedRedirect({ deletedAt: new Date() });
        await expect(toggleRedirectActive(archived.id, ACTOR)).rejects.toMatchObject({
          field: "id",
        });
      });
    });

    describe("archiveRedirect / restoreRedirect", () => {
      it("archive marca deletedAt, deletedBy e isActive:false → el lookup deja de resolver", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/a", statusCode: 301 },
          ACTOR,
        );
        expect(await lookupActiveRedirect(from)).not.toBeNull();

        const archived = await archiveRedirect(created.id, `${RUN}-arch`);
        expect(archived.deletedAt).toBeInstanceOf(Date);
        expect(archived.deletedBy).toBe(`${RUN}-arch`);
        expect(archived.isActive).toBe(false);

        expect(await lookupActiveRedirect(from)).toBeNull();
      });

      it("restore limpia deletedAt/deletedBy pero NO reactiva isActive por sí solo", async () => {
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/a", statusCode: 301 },
          ACTOR,
        );
        await archiveRedirect(created.id, ACTOR);

        const restored = await restoreRedirect(created.id, `${RUN}-restorer`);
        expect(restored.deletedAt).toBeNull();
        expect(restored.deletedBy).toBeNull();
        expect(restored.updatedBy).toBe(`${RUN}-restorer`);
        // archive dejó isActive:false; restore NO lo vuelve a true → sigue pausado.
        expect(restored.isActive).toBe(false);
        expect(await lookupActiveRedirect(from)).toBeNull();

        // Para que vuelva a resolver hace falta un toggle/update explícito.
        await toggleRedirectActive(created.id, ACTOR);
        expect(await lookupActiveRedirect(from)).toEqual({ toPath: "/a", statusCode: 301 });
      });

      it("tras archivar, createRedirect del mismo fromPath REUSA el row (no choca con unique)", async () => {
        // El @unique de fromPath persiste aun archivado. createRedirect debe detectar
        // existing.deletedAt y reactivar in-place, no intentar un INSERT que viole el unique.
        const from = nextPath();
        const created = await createRedirect(
          { fromPath: from, toPath: "/a", statusCode: 301 },
          ACTOR,
        );
        await archiveRedirect(created.id, ACTOR);

        const recreated = await createRedirect(
          { fromPath: from, toPath: "/b", statusCode: 302 },
          ACTOR,
        );
        expect(recreated.id).toBe(created.id);
        expect(recreated.toPath).toBe("/b");
        expect(recreated.statusCode).toBe(302);
      });
    });

    // ─────────────────────────── listRedirects ─────────────────────────────────

    describe("listRedirects — búsqueda (q)", () => {
      it("encuentra por fragmento de fromPath case-insensitive", async () => {
        // El prefijo /${RUN} se mantiene intacto para que el cleanup (startsWith
        // /${RUN}) lo capture; probamos case-insensitivity solo en el segmento propio.
        const seg = `findfrom${++seq}`;
        const from = `/${RUN}/${seg}/page`;
        await seedRedirect({ fromPath: from, toPath: "/dst" });

        const res = await listRedirects({ q: seg.toUpperCase(), pageSize: 100 });
        expect(res.items.map((i) => i.fromPath)).toContain(from);
      });

      it("encuentra por fragmento de toPath", async () => {
        const marker = `${RUN}dsttoken${++seq}`;
        const from = nextPath();
        await seedRedirect({ fromPath: from, toPath: `/${marker}/landing` });

        const res = await listRedirects({ q: marker, pageSize: 100 });
        expect(res.items.map((i) => i.fromPath)).toContain(from);
      });

      it("encuentra por fragmento de description", async () => {
        const marker = `${RUN}descmark${++seq}`;
        const from = nextPath();
        await seedRedirect({ fromPath: from, toPath: "/dst", description: `nota ${marker} fin` });

        const res = await listRedirects({ q: marker, pageSize: 100 });
        expect(res.items.map((i) => i.fromPath)).toContain(from);
      });

      it("trimea q antes de buscar", async () => {
        const marker = `${RUN}trimq${++seq}`;
        const from = `/${marker}/x`;
        await seedRedirect({ fromPath: from, toPath: "/dst" });

        const res = await listRedirects({ q: `   ${marker}   `, pageSize: 100 });
        expect(res.items.map((i) => i.fromPath)).toContain(from);
      });

      it("no devuelve nada para un q sin matches (total 0, totalPages 1)", async () => {
        const res = await listRedirects({ q: `${RUN}-NO-MATCH-ZZZ`, pageSize: 100 });
        expect(res.items).toHaveLength(0);
        expect(res.total).toBe(0);
        expect(res.totalPages).toBe(1); // Math.max(1, ceil(0/n))
      });
    });

    describe("listRedirects — filtro status", () => {
      it("active (default) incluye activos no archivados y excluye inactivos/archivados", async () => {
        const token = `${RUN}stat${++seq}`;
        const active = await seedRedirect({ fromPath: `/${token}/active`, isActive: true });
        const inactive = await seedRedirect({ fromPath: `/${token}/inactive`, isActive: false });
        const archived = await seedRedirect({
          fromPath: `/${token}/archived`,
          isActive: true,
          deletedAt: new Date(),
        });

        const res = await listRedirects({ q: token, pageSize: 100 }); // status default = active
        const ids = res.items.map((i) => i.id);
        expect(ids).toContain(active.id);
        expect(ids).not.toContain(inactive.id);
        expect(ids).not.toContain(archived.id);
      });

      it("inactive incluye solo isActive:false no archivados", async () => {
        const token = `${RUN}inact${++seq}`;
        const active = await seedRedirect({ fromPath: `/${token}/a`, isActive: true });
        const inactive = await seedRedirect({ fromPath: `/${token}/i`, isActive: false });
        const archivedInactive = await seedRedirect({
          fromPath: `/${token}/ai`,
          isActive: false,
          deletedAt: new Date(),
        });

        const res = await listRedirects({ q: token, status: "inactive", pageSize: 100 });
        const ids = res.items.map((i) => i.id);
        expect(ids).toContain(inactive.id);
        expect(ids).not.toContain(active.id);
        // archived & inactive → deletedAt != null lo excluye del filtro inactive.
        expect(ids).not.toContain(archivedInactive.id);
      });

      it("archived incluye solo deletedAt != null (independiente de isActive)", async () => {
        const token = `${RUN}arch${++seq}`;
        const active = await seedRedirect({ fromPath: `/${token}/a`, isActive: true });
        const archived = await seedRedirect({
          fromPath: `/${token}/x`,
          deletedAt: new Date(),
        });

        const res = await listRedirects({ q: token, status: "archived", pageSize: 100 });
        const ids = res.items.map((i) => i.id);
        expect(ids).toContain(archived.id);
        expect(ids).not.toContain(active.id);
      });

      it("all no filtra por estado: incluye activo, inactivo y archivado", async () => {
        const token = `${RUN}allst${++seq}`;
        const active = await seedRedirect({ fromPath: `/${token}/a`, isActive: true });
        const inactive = await seedRedirect({ fromPath: `/${token}/i`, isActive: false });
        const archived = await seedRedirect({ fromPath: `/${token}/x`, deletedAt: new Date() });

        const res = await listRedirects({ q: token, status: "all", pageSize: 100 });
        const ids = res.items.map((i) => i.id);
        expect(ids).toEqual(expect.arrayContaining([active.id, inactive.id, archived.id]));
      });

      it("expone isArchived derivado (!!deletedAt) en los items", async () => {
        const token = `${RUN}isarch${++seq}`;
        await seedRedirect({ fromPath: `/${token}/a`, isActive: true });
        await seedRedirect({ fromPath: `/${token}/x`, deletedAt: new Date() });

        const res = await listRedirects({ q: token, status: "all", pageSize: 100 });
        const archivedItem = res.items.find((i) => i.fromPath === `/${token}/x`);
        const activeItem = res.items.find((i) => i.fromPath === `/${token}/a`);
        expect(archivedItem?.isArchived).toBe(true);
        expect(activeItem?.isArchived).toBe(false);
      });
    });

    describe("listRedirects — sort", () => {
      it("sort 'from' ordena por fromPath ascendente", async () => {
        const token = `${RUN}sortfrom${++seq}`;
        // Insertamos desordenados; el orderBy fromPath asc debe ordenarlos.
        await seedRedirect({ fromPath: `/${token}/c` });
        await seedRedirect({ fromPath: `/${token}/a` });
        await seedRedirect({ fromPath: `/${token}/b` });

        const res = await listRedirects({ q: token, sort: "from", status: "all", pageSize: 100 });
        const mine = res.items
          .filter((i) => i.fromPath.startsWith(`/${token}/`))
          .map((i) => i.fromPath);
        expect(mine).toEqual([`/${token}/a`, `/${token}/b`, `/${token}/c`]);
      });

      it("sort 'hits' ordena por hitCount descendente", async () => {
        const token = `${RUN}sorthits${++seq}`;
        await seedRedirect({ fromPath: `/${token}/lo`, hitCount: 1 });
        await seedRedirect({ fromPath: `/${token}/hi`, hitCount: 100 });
        await seedRedirect({ fromPath: `/${token}/mid`, hitCount: 10 });

        const res = await listRedirects({ q: token, sort: "hits", status: "all", pageSize: 100 });
        const mine = res.items.filter((i) => i.fromPath.startsWith(`/${token}/`));
        expect(mine.map((i) => i.hitCount)).toEqual([100, 10, 1]);
      });

      it("sort 'recent' (default) ordena por createdAt desc — el más nuevo primero", async () => {
        const token = `${RUN}sortrec${++seq}`;
        const older = await seedRedirect({
          fromPath: `/${token}/old`,
          createdAt: new Date(Date.now() - 120_000),
        });
        const newer = await seedRedirect({
          fromPath: `/${token}/new`,
          createdAt: new Date(),
        });

        const res = await listRedirects({ q: token, status: "all", pageSize: 100 });
        const idx = (id: string) => res.items.findIndex((i) => i.id === id);
        expect(idx(newer.id)).toBeGreaterThanOrEqual(0);
        expect(idx(newer.id)).toBeLessThan(idx(older.id));
      });
    });

    describe("listRedirects — paginación y shape", () => {
      it("respeta pageSize y reporta totalPages = ceil(total/pageSize)", async () => {
        const token = `${RUN}page${++seq}`;
        await seedRedirect({ fromPath: `/${token}/1` });
        await seedRedirect({ fromPath: `/${token}/2` });
        await seedRedirect({ fromPath: `/${token}/3` });

        const page1 = await listRedirects({ q: token, status: "all", page: 1, pageSize: 2 });
        expect(page1.total).toBe(3);
        expect(page1.items).toHaveLength(2);
        expect(page1.page).toBe(1);
        expect(page1.pageSize).toBe(2);
        expect(page1.totalPages).toBe(2); // ceil(3/2)

        const page2 = await listRedirects({ q: token, status: "all", page: 2, pageSize: 2 });
        expect(page2.items).toHaveLength(1);
        expect(page2.page).toBe(2);

        // Cobertura total sin solapamiento.
        const seen = new Set([...page1.items, ...page2.items].map((i) => i.id));
        expect(seen.size).toBe(3);
      });

      it("normaliza page <= 0 a 1 (Math.max(1, page))", async () => {
        const token = `${RUN}normpage${++seq}`;
        await seedRedirect({ fromPath: `/${token}/x` });

        const res = await listRedirects({ q: token, status: "all", page: 0, pageSize: 50 });
        expect(res.page).toBe(1);
        const resNeg = await listRedirects({ q: token, status: "all", page: -3, pageSize: 50 });
        expect(resNeg.page).toBe(1);
      });

      it("una página fuera de rango devuelve items vacío pero conserva total", async () => {
        const token = `${RUN}oob${++seq}`;
        await seedRedirect({ fromPath: `/${token}/x` });

        const res = await listRedirects({ q: token, status: "all", page: 99, pageSize: 50 });
        expect(res.total).toBe(1);
        expect(res.items).toHaveLength(0);
        expect(res.page).toBe(99);
      });

      it("pageSize por defecto es 20 cuando no se pasa", async () => {
        const token = `${RUN}defsize${++seq}`;
        await seedRedirect({ fromPath: `/${token}/x` });
        const res = await listRedirects({ q: token, status: "all" });
        expect(res.pageSize).toBe(20);
      });

      it("invocado sin argumentos usa pageSize 20 y page 1 (status active por defecto)", async () => {
        const res = await listRedirects();
        expect(res.pageSize).toBe(20);
        expect(res.page).toBe(1);
        // Invariante: ningún item del listado active viene archivado.
        const returnedIds = res.items.map((i) => i.id);
        if (returnedIds.length > 0) {
          const anyArchived = await prisma.urlRedirect.count({
            where: { id: { in: returnedIds }, deletedAt: { not: null } },
          });
          expect(anyArchived).toBe(0);
        }
      });

      it("cada item expone el shape completo de RedirectListItem", async () => {
        const from = nextPath();
        await seedRedirect({
          fromPath: from,
          toPath: "/shape",
          statusCode: 302,
          description: `${RUN} d`,
        });

        const res = await listRedirects({ q: from, status: "all", pageSize: 10 });
        const item = res.items.find((i) => i.fromPath === from);
        expect(item).toBeDefined();
        expect(Object.keys(item!).sort()).toEqual(
          [
            "createdAt",
            "description",
            "fromPath",
            "hitCount",
            "id",
            "isActive",
            "isArchived",
            "lastHitAt",
            "statusCode",
            "toPath",
            "updatedAt",
          ].sort(),
        );
        expect(item!.createdAt).toBeInstanceOf(Date);
        expect(item!.updatedAt).toBeInstanceOf(Date);
        expect(item!.statusCode).toBe(302);
      });
    });
  },
);
