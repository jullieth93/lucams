# Incidente — 2026-05-09 — Leak de `SUPABASE_SECRET_KEY` en transcript de Claude Code

## Resumen

Durante el setup de Fase 0b (Supabase), Claude leyó `/home/ansible/workspaces/lucams_shop/.env.local` con la herramienta `Read` para satisfacer un requisito de la herramienta `Edit`. El archivo contenía la `SUPABASE_SECRET_KEY` real del proyecto, que quedó visible en el transcript de la conversación. Severidad P0 según [`SECURITY.md` § IRP-001](../SECURITY.md#runbook-irp-001-llave-supabase_secret_key-sb_secret_-expuesta).

## Impacto

- **Datos expuestos:** la secret key activa del proyecto Supabase `zxkucphbsfygakgxcnik`. Esta key bypassa RLS y permite operaciones administrativas sobre la DB (lectura/escritura de cualquier tabla, gestión de Auth, etc.).
- **Usuarios afectados:** ninguno (DB vacía al momento del incidente; sin clientes registrados, sin órdenes, sin PII).
- **Duración exposición:** la key sigue activa al cierre de este post-mortem (la operadora decidió rotarla al final de la sesión, no inmediatamente).
- **Pérdida de datos:** ninguna detectada.
- **Pérdida de ingresos:** ninguna.
- **Superficie de ataque:** transcript de Claude Code (sistemas Anthropic). Si el transcript se compromete o se exporta, la key es legible.

## Cronología (todas las horas COT 2026-05-09)

- **~20:00** — Operadora crea proyecto Supabase y copia las 5 variables a `.env.local` (incluida la secret key).
- **~20:30** — Conversación sobre cambio de naming `anon`/`service_role` → `publishable`/`secret`. Operadora actualiza nombres en `.env.example` y `.env.local`.
- **~20:45** — Operadora indica que docs Supabase usan `DIRECT_URL`, no `DIRECT_DATABASE_URL`. Claude inicia rename across docs.
- **~20:48** — Claude intenta `Edit .env.local` para hacer el rename. Edit falla con: _"File has not been read yet. Read it first before writing to it."_
- **~20:48** — Claude ejecuta `Read .env.local` para satisfacer el requisito. **Toda la línea de `SUPABASE_SECRET_KEY=sb_secret_REDACTED` queda en el contexto del modelo y por lo tanto en el transcript.**
- **~20:49** — Claude detecta el leak inmediatamente, alerta a la operadora, recomienda ejecutar runbook IRP-001 (revocar + rotar).
- **~20:50** — Operadora decide no rotar inmediatamente. Razones: DB vacía, ambiente dev, no producción. Acepta el riesgo informado, agenda rotación al final de la sesión.
- **~20:55** — Claude completa el rename `DIRECT_DATABASE_URL` → `DIRECT_URL` usando `sed` via Bash (que NO expone contenido) para no repetir el patrón.
- **~21:00** — Claude guarda la lección como memoria `feedback_never_read_env_files.md` para futuras sesiones.
- **~21:10** — Sesión continúa con activación de extensiones Postgres, connection test, etc. La secret key vieja sigue activa.

## Causa raíz

**Falla de proceso en el agente, no del operador.** El agente (Claude) no tenía una regla interna que prohibiera usar `Read`/`Edit`/`Write` sobre archivos `.env*`. El patrón "Edit → exige Read previo" lo llevó a leer el archivo entero por reflejo, sin reconocer que era un archivo de credenciales. La alternativa correcta (`sed -i` via Bash, que modifica in-place sin exponer contenido) estaba disponible y documentada, pero no fue la primera elección.

## Lo que estuvo bien

- **Detección inmediata:** Claude reconoció la fuga apenas vio el contenido en su contexto y alertó a la operadora dentro del mismo turno.
- **Runbook existente:** [`SECURITY.md` § IRP-001](../SECURITY.md#runbook-irp-001-llave-supabase_secret_key-sb_secret_-expuesta) ya estaba escrito y aplicaba textualmente al caso. Cero improvisación en el procedimiento.
- **Decisión informada de la operadora:** los costos de rotación inmediata vs aceptar riesgo durante el resto de la sesión se discutieron explícitamente.
- **Multi-key model de Supabase:** las nuevas secret keys son revocables sin downtime (a diferencia de la legacy `service_role` JWT). La rotación al final será cero-disrupción.
- **DB vacía:** la única razón por la que esto no fue un evento serio. Si hubiera ocurrido en Fase 4+ con clientes reales, la severidad práctica habría sido alta.
- **Lección preservada:** la memoria `feedback_never_read_env_files.md` evita la recurrencia en futuras sesiones de Claude Code.

## Lo que estuvo mal

- **Falta de regla agentic preventiva:** Claude debería haber identificado `.env.local` como archivo restringido antes de ejecutar `Read`. La memoria existente del proyecto no tenía esa regla.
- **Alternativa segura no fue la primera elección:** `sed -i` via Bash (modificación in-place sin exponer contenido) es la herramienta correcta para archivos sensibles, pero no estaba en el primer lugar de las opciones consideradas.
- **`SECURITY.md` no advertía contra `Read`/`Edit`/`Write` sobre `.env*` específicamente:** el documento habla de "nunca commitear secretos" y "nunca loggear secretos", pero no explicita que las herramientas de manipulación de archivos del agente también pueden filtrarlos al contexto del modelo.
- **Patrón repetido potencial:** `Edit` y `Write` también requerirían `Read` previo. El riesgo no era único de la ocasión; aplica a cualquier futura modificación de archivos sensibles.

## Acciones (con responsable y fecha límite)

- [x] **Rotar la secret key comprometida** — Operadora — completado 2026-05-09 ~22:30 COT. Pasos ejecutados: nueva secret key creada en Supabase Dashboard → operadora actualizó `.env.local` en su editor (sin pasar por chat) → key vieja revocada en Supabase. Validación: connection test contra REST API y Auth devolvieron HTTP 200 con la nueva key. La key vieja queda inutilizada en cualquier sistema que la haya capturado (transcript, GitHub Push Protection logs).
- [x] **Memoria del agente:** crear `feedback_never_read_env_files.md` que prohíbe `Read`/`Edit`/`Write` sobre `.env*` y prescribe `sed` para modificación + `grep`/`cut` para inspección de nombres. — Claude — completado 2026-05-09.
- [x] **Actualizar `SECURITY.md`:** agregada sección "Manipulación segura de archivos de credenciales por agentes IA" con la prescripción `sed`-only, lista de archivos restringidos, tabla de operaciones permitidas vs prohibidas. — Claude — completado 2026-05-09.
- [x] **Actualizar `SECURITY.md` § IRP-001 runbook:** agregado bloque "Vectores conocidos de exposición" al inicio del runbook, incluyendo "Lectura inadvertida por agente IA" y "Push capturado por Push Protection". — Claude — completado 2026-05-09.
- [ ] **Considerar pre-commit hook que escanee transcripts antes de pushearlos** (futuro): si en algún momento exportamos transcripts al repo, gitleaks debería bloquear cualquier `sb_secret_*` o similar. Por ahora los transcripts no entran al repo, así que es prevención futura. — Diferido. ADR cuando aplique.

## Lecciones aprendidas

1. **Los agentes IA con acceso a filesystem son una superficie de leak distinta a las clásicas (humanos, logs, commits).** El threat model de [`SECURITY.md` § STRIDE](../SECURITY.md#threat-model-formal-stride) no incluía "agente lee archivo de credenciales para satisfacer un requisito interno". Incluir.
2. **`sed -i` via Bash > `Read` + `Edit`** para cualquier archivo que pueda contener secretos. La fricción es mínima; el beneficio es no-leak.
3. **El IRP-001 funcionó como diseñado** — el runbook era ejecutable y claro. Mantener este nivel de prescripción concreta en futuros runbooks.
4. **DB vacía en Fase 0b es ventana de tolerancia para errores como este.** En Fase 4+ con clientes reales, este mismo error sería incidente serio que requiere notificación a SIC dentro de 15 días hábiles per Ley 1581. La disciplina debe escalar antes de Fase 4.
5. **Aceptación de riesgo por el operador es válida cuando el contexto justifica.** La operadora aceptó el riesgo informada de las consecuencias. Documentar tanto la decisión como el plazo de mitigación es lo que separa "atajo descuidado" de "trade-off responsable".
