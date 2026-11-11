import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const GITLEAKS_CONFIG = path.join(REPO_ROOT, ".gitleaks.toml");

function resolveGitleaksBin(): string | null {
  try {
    execFileSync("gitleaks", ["version"], { stdio: "ignore" });
    return "gitleaks";
  } catch {
    const localBin = path.join(REPO_ROOT, "tmp/bin/gitleaks");
    if (fs.existsSync(localBin)) return localBin;
    return null;
  }
}

function runGitleaksDir(bin: string, targetPath: string): number {
  try {
    execFileSync(bin, ["dir", targetPath, "--config", GITLEAKS_CONFIG, "--no-banner", "--redact"], {
      stdio: "pipe",
    });
    return 0;
  } catch (err) {
    const e = err as { status?: number };
    return e.status ?? 1;
  }
}

describe("SEC-02 — .gitleaks.toml sin puntos ciegos por path", { timeout: 30_000 }, () => {
  it("no excluye globalmente .env.example ni README.md en [allowlist].paths", () => {
    const raw = fs.readFileSync(GITLEAKS_CONFIG, "utf8");
    const allowlistPathsMatch = raw.match(/\[allowlist\][\s\S]*?paths\s*=\s*\[([\s\S]*?)\]/);
    const pathsBlock = allowlistPathsMatch?.[1] ?? "";

    expect(pathsBlock).not.toMatch(/env\\?\.example/i);
    expect(pathsBlock).not.toMatch(/README\\?\.md/i);
  });

  const bin = resolveGitleaksBin();

  it.skipIf(!bin)("acepta los placeholders actuales de apps/web/.env.example y README.md", () => {
    expect(runGitleaksDir(bin!, path.join(REPO_ROOT, "apps/web/.env.example"))).toBe(0);
    expect(runGitleaksDir(bin!, path.join(REPO_ROOT, "README.md"))).toBe(0);
  });

  it.skipIf(!bin)(
    "detecta secretos sintéticos realistas en .env.example, README.md y docs/test.md",
    () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lucams-gitleaks-sec02-"));
      try {
        fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
        // Construidos dinámicamente en runtime sin literales de alta entropía para que
        // `gitleaks` escaneando este archivo de test nunca emita falso positivo.
        const synthSb = "sb_" + "secret_" + "a9B8c7".repeat(4);
        const synthPg =
          "postgresql://postgres:" +
          "dbPass99".repeat(2) +
          "@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
        const jwtHdr = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
        const jwtPay = Buffer.from('{"role":"service_role","iss":"supabase"}').toString(
          "base64url",
        );
        const synthJwt = "SUPABASE_" + "SECRET_KEY=" + `${jwtHdr}.${jwtPay}`;

        const envExample = path.join(tmpDir, ".env.example");
        const readme = path.join(tmpDir, "README.md");
        const docTest = path.join(tmpDir, "docs/test.md");

        fs.writeFileSync(envExample, `SUPABASE_SECRET_KEY=${synthSb}\n`);
        expect(runGitleaksDir(bin!, envExample)).toBe(1);

        fs.writeFileSync(envExample, `DATABASE_URL=${synthPg}\n`);
        expect(runGitleaksDir(bin!, envExample)).toBe(1);

        fs.writeFileSync(envExample, `${synthJwt}\n`);
        expect(runGitleaksDir(bin!, envExample)).toBe(1);

        fs.writeFileSync(readme, `# Docs\nToken: ${synthSb}\n`);
        expect(runGitleaksDir(bin!, readme)).toBe(1);

        fs.writeFileSync(docTest, `# Audit\nToken: ${synthSb}\n`);
        expect(runGitleaksDir(bin!, docTest)).toBe(1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
