/*
 * TOTP (RFC 6238) con Node crypto — para el E2E del reto MFA admin (no hay lib
 * de TOTP en el proyecto). Supabase devuelve el secret en base32; generamos el
 * código de 6 dígitos de la ventana actual.
 */
import { createHmac } from "node:crypto";

function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s
    .replace(/=+$/, "")
    .toUpperCase()
    .replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Código TOTP de 6 dígitos para el secret base32, en la ventana de 30s de `atMs`. */
export function totp(secretBase32: string, atMs: number): string {
  const key = base32Decode(secretBase32);
  let counter = Math.floor(atMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buf[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}
