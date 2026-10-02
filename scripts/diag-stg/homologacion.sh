#!/usr/bin/env bash
# Homologación STG ↔ PRD (STG es la base — todas las pruebas se hacen ahí).
#
# Compara, entre la DB de STG (.env.stg) y la de PRD (.env.local.nube-backup):
#   1. Migraciones Prisma aplicadas (_prisma_migrations).
#   2. Firma de esquema: columnas, índices, constraints, triggers, funciones,
#      enums, extensiones, RLS + policies, secuencias, crons, buckets
#      (05-homologacion-schema.sql).
#   3. Conteos/checksums de datos: catálogo, CMS, config, galería
#      (06-homologacion-datos.sql).
# y luego la matriz de env vars de Vercel (Preview vs Production, nombres).
#
# Uso: scripts/diag-stg/homologacion.sh
# Nunca imprime secretos (solo usa las URLs de conexión, sin eco).
set -euo pipefail
cd "$(dirname "$0")/../.."

for f in .env.stg .env.local.nube-backup; do
  [[ -f $f ]] || { echo "✗ falta $f" >&2; exit 1; }
done

OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

run() { # run <envfile> <tag> <sqlfile> <outfile>
  set -a; source "$1"; set +a
  psql "$DIRECT_URL" -tA -f "$3" > "$OUT/$4"
}

echo "→ migraciones Prisma…"
run .env.stg stg <(echo 'SELECT migration_name FROM _prisma_migrations ORDER BY finished_at;') mig-stg.txt
run .env.local.nube-backup prd <(echo 'SELECT migration_name FROM _prisma_migrations ORDER BY finished_at;') mig-prd.txt
echo "== solo en STG =="; comm -23 <(sort "$OUT/mig-stg.txt") <(sort "$OUT/mig-prd.txt") || true
echo "== solo en PRD =="; comm -13 <(sort "$OUT/mig-stg.txt") <(sort "$OUT/mig-prd.txt") || true

echo "→ firma de esquema…"
run .env.stg stg scripts/diag-stg/05-homologacion-schema.sql sig-stg.txt
run .env.local.nube-backup prd scripts/diag-stg/05-homologacion-schema.sql sig-prd.txt
diff "$OUT/sig-stg.txt" "$OUT/sig-prd.txt" && echo "esquema IDÉNTICO" || true

echo "→ datos (conteos/checksums)…"
run .env.stg stg scripts/diag-stg/06-homologacion-datos.sql data-stg.txt
run .env.local.nube-backup prd scripts/diag-stg/06-homologacion-datos.sql data-prd.txt
join -t'|' -j1 -o1.1,1.2,1.3,2.2,2.3 <(sort "$OUT/data-stg.txt") <(sort "$OUT/data-prd.txt") \
  | awk -F'|' '{m=($3==$5)?"OK  ":"DIFF"; printf "%-28s stg=%-7s prd=%-7s %s\n",$1,$2,$4,m}'

echo "→ env vars Vercel (nombres por scope)…"
if command -v vercel >/dev/null 2>&1; then
  vercel env ls 2>/dev/null | sed -n '4,$p' | awk '{name=$1; envs=""; for(i=3;i<=NF-1;i++) envs=envs" "$i; print name"|"envs}' \
    | sed 's/ [0-9]*[dhmo] .*$//' | python3 -c '
import sys
from collections import defaultdict
m=defaultdict(set)
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    name,envs=line.split("|",1)
    if "Production" in envs: m[name].add("P")
    if "Preview" in envs: m[name].add("V")
po=[k for k,v in sorted(m.items()) if v=={"P"}]
vo=[k for k,v in sorted(m.items()) if v=={"V"}]
print("solo Production:", " ".join(po) or "(ninguna)")
print("solo Preview:   ", " ".join(vo) or "(ninguna)")'
else
  echo "(vercel CLI no disponible — se omite)"
fi
