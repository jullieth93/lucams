/*
 * Test de los helpers puros del backup a R2 (ADR-059): naming de la llave y la
 * lógica de retención (qué backups viejos podar). La retención es crítica: un bug
 * aquí implica o pérdida de backups o crecimiento sin límite del bucket.
 */

import { describe, it, expect } from "vitest";
import { buildBackupKey, selectStaleKeys, BACKUP_KEY_RE } from "./backup-lib.mjs";

describe("buildBackupKey", () => {
  it("arma la llave UTC ordenable con prefijo por defecto 'db'", () => {
    const key = buildBackupKey(new Date("2026-07-13T14:05:01.123Z"));
    expect(key).toBe("db/lucams-2026-07-13T140501Z.sql.gz");
  });

  it("respeta un prefijo custom y le quita la barra final", () => {
    expect(buildBackupKey(new Date("2026-01-02T03:04:05Z"), "prod/")).toBe(
      "prod/lucams-2026-01-02T030405Z.sql.gz",
    );
  });

  it("la llave generada matchea el patrón de backup", () => {
    expect(BACKUP_KEY_RE.test(buildBackupKey(new Date("2026-12-31T23:59:59Z")))).toBe(true);
  });

  it("llaves de fechas crecientes ordenan cronológicamente (sort lexical)", () => {
    const early = buildBackupKey(new Date("2026-07-13T01:00:00Z"));
    const late = buildBackupKey(new Date("2026-07-13T23:00:00Z"));
    const nextDay = buildBackupKey(new Date("2026-07-14T00:00:00Z"));
    expect([nextDay, early, late].sort()).toEqual([early, late, nextDay]);
  });
});

describe("selectStaleKeys — retención", () => {
  // 5 backups, del más viejo al más nuevo.
  const keys = [
    "db/lucams-2026-07-01T070000Z.sql.gz",
    "db/lucams-2026-07-02T070000Z.sql.gz",
    "db/lucams-2026-07-03T070000Z.sql.gz",
    "db/lucams-2026-07-04T070000Z.sql.gz",
    "db/lucams-2026-07-05T070000Z.sql.gz",
  ];

  it("conserva los N más nuevos y devuelve los más viejos para borrar", () => {
    expect(selectStaleKeys(keys, 2)).toEqual([
      "db/lucams-2026-07-01T070000Z.sql.gz",
      "db/lucams-2026-07-02T070000Z.sql.gz",
      "db/lucams-2026-07-03T070000Z.sql.gz",
    ]);
  });

  it("no borra nada si hay menos o igual backups que el tope", () => {
    expect(selectStaleKeys(keys, 5)).toEqual([]);
    expect(selectStaleKeys(keys, 9)).toEqual([]);
  });

  it("el orden de entrada no importa (ordena por llave)", () => {
    const shuffled = [keys[3], keys[0], keys[4], keys[1], keys[2]];
    expect(selectStaleKeys(shuffled, 1)).toEqual([
      "db/lucams-2026-07-01T070000Z.sql.gz",
      "db/lucams-2026-07-02T070000Z.sql.gz",
      "db/lucams-2026-07-03T070000Z.sql.gz",
      "db/lucams-2026-07-04T070000Z.sql.gz",
    ]);
  });

  it("SALVAGUARDA: keep<=0 o inválido NO borra nada (jamás vaciar el bucket)", () => {
    expect(selectStaleKeys(keys, 0)).toEqual([]);
    expect(selectStaleKeys(keys, -3)).toEqual([]);
    expect(selectStaleKeys(keys, NaN)).toEqual([]);
  });

  it("SEGURIDAD: ignora objetos que NO son backups (nunca los propone para borrar)", () => {
    const mixed = [
      "db/lucams-2026-07-01T070000Z.sql.gz",
      "db/lucams-2026-07-02T070000Z.sql.gz",
      "db/README.txt",
      "otros/imagen.png",
      "db/lucams-manual-note.sql.gz", // no matchea el patrón de timestamp
    ];
    expect(selectStaleKeys(mixed, 1)).toEqual(["db/lucams-2026-07-01T070000Z.sql.gz"]);
  });
});
