/*
 * Confirmación INTERACTIVA del destino para operaciones break-glass
 * (seed-admin, admin-mfa-reset) — N-06, 2026-09-12.
 *
 * Por qué existe: el env-guard (lib/env-guard.mjs) bloquea destinos no
 * reconocidos, pero STG queda permitido y un operador puede tener cargado el
 * .env equivocado sin saberlo. Para las operaciones que crean/reactivan un
 * SUPERADMIN o borran el MFA de un admin, el costo de un destino equivocado es
 * tan alto que pedimos una confirmación HUMANA: el script imprime la
 * clasificación del env-guard y exige teclear el host/ref exacto del destino
 * (no un "sí" genérico — hay que mirar la pantalla para escribirlo).
 *
 * No interactivo (stdin sin TTY, ej. un pipe en CI): se NIEGA — estas
 * operaciones son siempre deliberadas y manuales; la automatización no es un
 * caso de uso legítimo.
 */

import { createInterface } from "node:readline/promises";
import { classifyUrl } from "./env-guard.mjs";

/** Etiqueta legible del destino según la clasificación del env-guard. */
export function describeTarget(env = process.env) {
  const url = env.DIRECT_URL ?? env.DATABASE_URL ?? "";
  const kind = classifyUrl(url);
  let host = "(sin URL)";
  try {
    host = new URL(url).hostname;
  } catch {
    // URL no parseable: el env-guard ya la bloquea antes de llegar acá.
  }
  return { kind, host };
}

/**
 * Imprime la clasificación del destino y exige teclear el host exacto para
 * confirmar. Sale con 1 si el operador no confirma o si no hay TTY.
 * Llamar DESPUÉS de assertDestructiveAllowed y SOLO en modo --apply.
 * @param {string} scriptName nombre del script, para los mensajes.
 * @param {string} actionDescripcion qué se va a hacer (1 línea, para el prompt).
 */
export async function confirmTargetInteractive(scriptName, actionDescripcion) {
  const { kind, host } = describeTarget();
  console.log(`\n[confirmación] ${scriptName}`);
  console.log(`  Destino según env-guard: ${kind} (host: ${host})`);
  console.log(`  Acción: ${actionDescripcion}`);

  if (!process.stdin.isTTY) {
    console.error(
      `[confirmación] ${scriptName}: RECHAZADO — stdin no es interactivo. ` +
        `Esta operación exige confirmación humana en una terminal.`,
    );
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer = "";
  try {
    answer = await rl.question(`  Escribe el host exacto ("${host}") para confirmar: `);
  } finally {
    rl.close();
  }
  if (answer.trim() !== host) {
    console.error(`[confirmación] ${scriptName}: no coincide — operación CANCELADA.`);
    process.exit(1);
  }
  console.log(`[confirmación] OK — procediendo contra ${host}.\n`);
}
