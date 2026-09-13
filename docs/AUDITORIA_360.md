# AUDITORÍA 360° DE COHERENCIA FUNCIONAL, CABLEADO CLIENTE–ADMIN

# Y SANEAMIENTO PRODUCTIVO DE LUCAM’S

## Modo de trabajo

Trabaja inicialmente en modo:

DIAGNÓSTICO EXHAUSTIVO + PLAN DE REMEDIACIÓN, SIN APLICAR CAMBIOS FUNCIONALES
NI BORRADOS DE DATOS.

No hagas una auditoría genérica ni te limites a los ejemplos dados.
Debes inspeccionar y clasificar la totalidad del sistema actual.

El propósito es preparar LuCam’s para una operación productiva coherente, eliminando
funcionalidades falsas, redundancias, datos demo no autorizados, módulos desconectados,
estados engañosos, rutas incompletas y deriva entre cliente, admin, base de datos,
integraciones, pruebas y documentación.

---

## 1. Contexto actual que debes verificar, no asumir

Repositorio:

- `jullieth93/lucams`
- rama objetivo: `develop`
- producción opera actualmente en modo `full`
- stack principal:
  - Next.js 16 App Router
  - React 19
  - TypeScript
  - Prisma
  - PostgreSQL/Supabase
  - Supabase Auth y Storage
  - Vercel
  - Wompi
  - Aveonline
  - Resend
  - Gemini
  - Cloudflare Turnstile
  - Cloudflare R2
  - pg_cron/pg_net

El repositorio ya tuvo auditorías previas de seguridad e información pública.
No las repitas mecánicamente. Úsalas como antecedentes y busca:

- regresiones;
- cableado incompleto;
- módulos abandonados;
- datos inconsistentes;
- comportamiento diferente al documentado;
- incoherencias entre ambientes;
- funcionalidades visibles que no cumplen realmente lo que prometen.

---

## 2. Baseline obligatorio

Antes de analizar, registra:

````bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
git diff --stat
git log -15 --oneline

Registra también, sin cambiar de rama:

SHA actual de develop;
SHA actual de production;
commits presentes en develop y no en production;
estado del working tree;
fecha y hora de la revisión.

Preserva todos los cambios locales existentes.

Está prohibido ejecutar:

git reset
git clean
git restore
git checkout -- <archivo>
git stash
git add -A

No hagas commit, push, merge ni despliegue.

3. Protección de secretos y datos

Nunca leas, imprimas ni copies el contenido de:

.env
.env.local
.env.stg
.env.production
respaldos de .env
secretos de Vercel
claves de Supabase
credenciales de proveedores
cadenas completas de conexión

Puedes ejecutar comandos existentes que carguen variables de entorno sin mostrarlas,
siempre que sean de solo lectura y el destino esté claramente identificado.

Para inventariar variables utiliza:

.env.example;
referencias process.env.*;
workflows;
documentación;
nombres de secretos, nunca sus valores.

No imprimas:

PII;
emails completos;
teléfonos;
direcciones;
tokens;
cuerpos de pedidos;
contenido privado de diseños;
URLs firmadas.

Los reportes de datos deben usar conteos, hashes, claves de negocio no sensibles o valores
redactados.

4. Fuentes obligatorias

Lee primero:

CLAUDE.md
apps/web/AGENTS.md
docs/STATE.md
docs/README.md

Después revisa, según corresponda:

docs/ARCHITECTURE.md
docs/CONVENTIONS.md
docs/SECURITY.md
docs/TESTING.md
docs/OPERATIONS.md
docs/OBSERVABILITY.md
docs/INTEGRATIONS.md
docs/INTEGRATIONS_AVEONLINE.md
docs/COMPLIANCE.md
docs/ROADMAP.md
docs/RUNBOOK_GO_LIVE.md
docs/QA_CHECKLIST.md
docs/DECISIONS.md
docs/audits/
apps/web/app/estudio/[slug]/README.md

Por usar Next.js 16, consulta la documentación local relevante en:

node_modules/next/dist/docs/

antes de afirmar que una ruta, Server Action, caché, proxy o API está implementada
incorrectamente.

5. Principio central: no confundas “sin uso” con “borrable”

Clasifica cada elemento en una y solo una categoría:

PRODUCTIVO
PRODUCTIVO_CON_GAP
ADMIN_ONLY_JUSTIFICADO
CLIENT_ONLY_SIN_OPERACIÓN
OCULTO_POR_MODO
OCULTO_POR_ROL
DESHABILITADO_INTENCIONAL
PLACEHOLDER
EXPERIMENTAL
FUTURO_APROBADO
DESCOPEADO
TEST_ONLY
DEMO_ONLY
LEGACY_REFERENCIADO
LEGACY_NO_REFERENCIADO
DUPLICADO
HUÉRFANO
FALSA_ALARMA
CONFIGURADO_NO_PROBADO
DESCONOCIDO

Una funcionalidad no se considera “sin uso” únicamente porque:

no tiene imports evidentes;
no aparece en el menú;
está inactiva;
está soft-deleted;
no tiene registros recientes;
no se encuentra en una prueba E2E;
está detrás de un feature flag;
solo se ejecuta por cron, webhook o Server Action;
es necesaria para reconstruir pedidos o diseños históricos.

Antes de recomendar eliminación debes demostrar:

que no tiene entrada pública, administrativa, API, cron, webhook ni consumidor interno;
que no está referenciada desde base de datos;
que no es necesaria para auditoría, cumplimiento, reproducción o rollback;
que no pertenece a una capacidad futura aprobada;
que no es una divergencia intencional por ambiente;
que eliminarla no rompe datos históricos;
que existe una prueba de cierre.
6. Inventario exhaustivo con denominador

Genera automáticamente un inventario y reporta los totales de:

páginas públicas;
páginas autenticadas de cliente;
páginas administrativas;
entradas del menú admin;
rutas resueltas por el catch-all placeholder;
API routes;
webhooks;
endpoints cron;
Server Actions;
feature folders;
servicios y repositories;
modelos Prisma;
tablas SQL no Prisma;
migraciones;
buckets de Storage;
plantillas de email;
tipos de notificación;
integraciones externas;
jobs programados;
variables de entorno;
scripts operativos;
scripts one-shot;
seeds;
scripts de limpieza;
documentos canónicos;
suites unitarias, de integración y E2E.

No debe quedar ningún elemento sin clasificar.

Informa, por ejemplo:

Páginas admin clasificadas: 42/42
Features clasificadas: 36/36
Modelos Prisma clasificados: 58/58
Crons clasificados: 8/8
Integraciones clasificadas: 10/10
Scripts DB clasificados: 74/74

Si no alcanzas cobertura total, identifica exactamente qué quedó sin revisar y por qué.

7. Matriz maestra de capacidades

Construye esta tabla:

| Capacidad | Propósito de negocio | Entrada cliente | Entrada admin | API/Server Action | Servicio | Modelos/Storage | Integración | Cron/Webhook | Email/Notificación | Caché/invalidación | Modo/Roles | Tests | Docs | Estado | Disposición |

Usa como disposición:

MANTENER
CORREGIR_CABLEADO
CONSOLIDAR
OCULTAR
ARCHIVAR_DATOS
ELIMINAR_DATOS
RETIRAR_CÓDIGO
MIGRAR
DOCUMENTAR
POSPONER_CON_ADR
REQUIERE_DECISIÓN_DE_NEGOCIO
REQUIERE_EVIDENCIA_DEL_OPERADOR

Cada fila debe incluir evidencia archivo:líneas, símbolo, test o consulta.

8. Dominios que debes cubrir
Catálogo
productos;
variantes;
categorías;
ocasiones;
precios;
descuentos;
stock;
imágenes;
estados activo/inactivo;
canales;
búsqueda;
recomendaciones;
productos relacionados;
sitemap;
redirects;
caché e invalidación.
Estudio de personalización
catálogo de plantillas;
plantillas globales y por producto;
plantillas activas, ocultas y descartadas;
PREMADE y EDITABLE;
asociación producto–plantilla;
parámetros template, templateId, variant y copies;
canvas;
carga de archivos;
diseños;
assets;
vista previa;
producción;
ZIP;
moderación;
reproducción de diseños históricos;
plantillas utilizadas por pedidos o diseños existentes;
estados administrativos frente a visibilidad pública.
Comercio
carrito;
checkout;
cupones;
Wompi;
contraentrega;
Aveonline;
reservas de stock;
pedidos;
pagos;
envíos;
tracking;
conciliación;
reembolsos;
retractos;
garantías;
emails y notificaciones asociados.
Cliente
registro;
login;
cuenta;
direcciones;
pedidos;
wishlist;
reseñas;
referidos;
puntos de fidelidad;
newsletter;
recuperación de carrito;
back-in-stock;
soporte;
mensajes.
Contenido
CMS;
edición visual;
mediateca;
settings;
emails;
contenido legal;
fallbacks;
contenido condicionado por STORE_MODE.
Administración
navegación;
rutas reales;
placeholders;
RBAC;
MFA;
auditoría;
notificaciones;
dashboards;
métricas;
acciones disponibles por rol;
duplicación de pantallas o procesos.
Operación
healthchecks;
observabilidad;
alertas;
SLOs;
cron heartbeats;
backups;
retención;
scripts;
CI/CD;
documentación operativa.
Integraciones
Supabase;
Wompi;
Aveonline;
Resend;
Gemini;
WhatsApp;
Turnstile;
HIBP;
R2;
Vercel.
9. Prueba de cableado bidireccional

Para cada capacidad productiva demuestra ambos sentidos.

Cliente → operación

Ejemplo:

cliente crea una solicitud
→ UI pública
→ schema y acción
→ servicio
→ DB/proveedor
→ aparece en el admin correcto
→ operador puede actuar
→ queda auditoría
→ cliente recibe el resultado esperado
Admin → cliente

Ejemplo:

admin cambia un dato
→ autorización
→ validación
→ servicio
→ DB
→ invalidación de caché
→ cambio visible en storefront/checkout/Estudio
→ evento o auditoría

Marca como PRODUCTIVO_CON_GAP cualquier capacidad que funcione solo en una dirección.

Valida expresamente estos invariantes:

Archivar un producto lo retira de:
catálogo;
búsqueda;
sitemap;
relacionados;
recomendaciones;
Estudio;
checkout;
sin romper pedidos históricos.
Pausar, expirar o archivar un cupón:
impide aplicarlo;
conserva usos históricos;
actualiza el admin;
actualiza el checkout correcto;
no deja totales cacheados;
no elimina evidencia de pedidos.
Aprobar, ocultar o descartar una plantilla:
actualiza PDP y Estudio;
respeta el producto y kind correspondientes;
conserva diseños y pedidos históricos;
no deja enlaces muertos;
invalida la caché correcta.
Cambiar stock:
actualiza PDP;
carrito;
checkout;
admin;
reservas;
back-in-stock;
alertas correspondientes.
Un pago o envío:
aparece en el admin;
actualiza el cliente;
genera email/notificación;
mantiene una transición válida;
es idempotente.
Un mensaje de contacto:
crea SupportTicket;
aparece en las pantallas administrativas pertinentes;
permite respuesta y cambio de estado;
deja auditoría;
no duplica procesos contradictorios.
Un cambio CMS:
llega a la página pública;
respeta fallback y modo;
invalida caché;
queda versionado.
Una integración caída:
se refleja con la misma semántica en:
health endpoint;
/api/health/all;
panel de integraciones;
observabilidad;
alertas;
sin convertir servicios deshabilitados deliberadamente en falsos fallos.
10. Auditoría de plantillas del Estudio

No uses la regla:

no aprobada = borrar

Clasifica cada plantilla por:

slug;
kind;
mode;
producto asociado;
global o específica;
activa;
oculta;
soft-deleted;
preview existente;
asset existente;
canvas válido;
visible en PDP;
visible en Estudio;
compatible con las variantes del producto;
cantidad de diseños que la referencian;
cantidad de pedidos o cart items históricos relacionados;
origen seed/manual/demo;
última utilización;
ambiente;
posibilidad real de restauración.

Determina:

plantillas activas pero nunca alcanzables;
plantillas visibles que llevan a un flujo incompleto;
plantillas asociadas a productos archivados;
plantillas sin asset o con asset huérfano;
assets sin plantilla;
plantillas duplicadas;
plantillas históricas que deben preservarse;
plantillas demo que no deben existir en PRD;
plantillas descartadas sin ninguna referencia que podrían purgarse;
inconsistencias entre isActive, deletedAt, aprobación y visibilidad.

Revalida específicamente:

TemplatesStrip;
flujo PREMADE;
uso de ?templateId=;
uso de ?template=;
filtrado en listTemplatesByProduct;
selección del Estudio;
admin /admin/plantillas;
seeds de plantillas.

No propongas hard-delete si existe cualquier referencia histórica.

11. Auditoría de cupones

Primero demuestra que el módulo está o no cableado; no lo juzgues por la cantidad de registros.

Para cada ambiente, clasifica agregadamente:

activos vigentes;
activos expirados;
pausados;
archivados;
públicos;
privados;
sin usos;
con usos;
códigos marcados objetivamente como test/demo;
códigos sin procedencia demostrable;
referencias desde pedidos;
referencias desde CouponUsage;
inconsistencias entre usedCount y usos reales.

Valida:

creación, actualización, pausa, reactivación y archivo desde admin;
aplicación en /checkout/pago;
eliminación del cupón de la sesión;
recálculo del total;
validación atómica al pagar;
límites globales y por cliente;
restricciones por producto, categoría, monto y cantidad;
FREE_SHIPPING;
invalidación de caché;
copy administrativo;
rutas revalidadas;
auditoría administrativa.

Revalida específicamente la aparente deriva entre:

copy del admin que dice “carrito”;
revalidatePath("/carrito");
campo real ubicado en /checkout/pago.

No elimines en duro un cupón con usos o pedidos relacionados.
Distingue archivo funcional de purga física.

12. Saneamiento de datos por ambiente

Audita por separado:

LOCAL;
STG;
PRD.

Construye una matriz:

| Entidad | LOCAL | STG | PRD | Debe coincidir | Divergencia permitida | Evidencia | Acción |

Incluye al menos:

categorías;
productos;
variantes;
plantillas;
cupones;
reseñas;
usuarios y admins de test;
pedidos de prueba;
webhooks de prueba;
eventos de email;
diseños;
assets;
campos CMS;
crons;
configuraciones;
redirects;
notificaciones;
alert states.

Una divergencia solo es aceptable si:

está documentada;
tiene razón operativa;
tiene responsable;
no genera comportamiento engañoso;
cuenta con criterio de cierre o permanencia.

No clasifiques un registro como demo porque “parece falso”.
Exige una señal objetiva:

dominio .test;
prefijo reconocido;
timestamp o run ID;
metadata;
creador;
script de origen;
SKU/slug de fixture;
documentación explícita.

Cuando no exista procedencia fiable, clasifica como:

ORIGEN_DESCONOCIDO — REQUIERE DECISIÓN DEL OPERADOR

No consultes ni muestres PII individual.

13. Seeds, fixtures y scripts operativos

Clasifica todos los scripts de packages/db/scripts/ como:

bootstrap reproducible;
seed canónico;
seed demo;
migración;
mantenimiento recurrente;
limpieza;
diagnóstico;
one-shot histórico;
reparación;
fixture de test;
peligroso en PRD;
obsoleto;
desconocido.

Revisa especialmente:

seed-products.mjs;
seed-templates.mjs;
seed-ocasiones.mjs;
seed-catalog-v2.mjs;
migrate-cms-v2.mjs;
cleanup-test-junk.mjs;
scripts fechados;
scripts llamados desde Makefile;
scripts mencionados en documentación pero no llamados;
scripts llamados pero ausentes.

Determina si algún seed puede:

pisar precios editados en admin;
reemplazar imágenes reales;
reactivar registros;
archivar productos nuevos no presentes en código;
volver a insertar reseñas demo;
alterar PRD accidentalmente;
introducir divergencias entre entornos.

No ejecutes seeds ni limpiezas en esta fase.

Revisa la cobertura de env-guard.mjs, incluyendo su limitación declarada respecto
de hosts remotos no Supabase.

Propón, solo como plan:

separación entre datos canónicos y fixtures demo;
bloqueo fail-closed contra PRD;
--dry-run por defecto;
--apply explícito;
allowlist de entidades;
conteos antes/después;
transacciones;
rollback;
idempotencia;
evidencia de procedencia.
14. Integraciones y falsas alarmas

Crea un registro único de integraciones con:

| Integración | Propósito | Modo | Variables requeridas | Configurada | Probe real | Qué prueba el probe | Criticidad | Panel admin | Alertas | Estado |

Usa estos estados, sin mezclarlos:

HEALTHY
DEGRADED
DOWN
NOT_CONFIGURED
DISABLED_BY_MODE
DISABLED_BY_ENVIRONMENT
SANDBOX
PRODUCTION
UNKNOWN_NOT_PROBED

Reglas:

“Variable presente” no equivale a “integración sana”.
“No probada” no equivale a “caída”.
“Deshabilitada intencionalmente” no equivale a “degradada”.
“Sandbox” no equivale a “error”.
Un probe de autenticación no prueba todo el flujo transaccional.
Un healthcheck no debe generar pagos, guías ni emails reales.
La UI, /api/health/all y alertas deben compartir la misma semántica.

Revalida específicamente:

/admin/integraciones frente a:
/api/health/wompi;
/api/health/aveonline;
/api/health/all.
El número real de variables necesarias para considerar Wompi configurado.
La diferencia entre:
Wompi sandbox;
Wompi production;
Aveonline test;
Aveonline production con cuenta demo;
Aveonline production con cuenta real.
Integraciones documentadas que no aparecen en el panel:
Gemini;
Turnstile;
HIBP;
R2;
Vercel;
WhatsApp.
Integraciones mostradas como activas que no tengan consumidor real.
Integraciones con consumidor real pero sin visibilidad operativa.

No conviertas la ausencia de un healthcheck remoto en una alarma roja si el proveedor
no ofrece una comprobación segura.

15. Alertas y observabilidad

Audita:

origen exacto de cada alerta;
condición de disparo;
severidad;
ambiente;
modo;
deduplicación;
recuperación;
enlace de acción;
destinatario operativo;
prueba automatizada;
criterio de resolución.

Detecta:

alertas que se disparan por estados esperados;
alertas de STG que deberían estar deshabilitadas;
alertas sin acción posible;
alertas con enlace al módulo incorrecto;
alertas que nunca pueden dispararse;
alertas duplicadas;
fallos reales no cubiertos;
estado persistente que no se limpia al recuperarse;
warning fijo usado en lugar de una prueba real.

Usa el manejo existente de CRON_JOBS_DISABLED como referencia de semántica
por ambiente, pero comprueba que esté correctamente configurado.

16. Navegación, rutas y módulos administrativos

Construye las relaciones:

entrada de admin-nav
→ ruta real
→ page.tsx real o catch-all placeholder
→ permiso
→ servicio
→ modelo
→ acción útil

Detecta:

ítem de menú sin página real;
página real sin acceso intencional desde menú;
módulo visible que solo muestra placeholder;
módulo futuro todavía visible;
módulo implementado pero oculto por error;
ruta accesible por URL aunque el modo la deshabilite;
módulo visible a un rol que no puede operar;
módulo duplicado;
dos pantallas que modifican lo mismo con reglas distintas;
acciones presentes en una pantalla y ausentes en la otra;
métricas o badges que no coinciden con la fuente real.

Revalida específicamente:

/admin/mensajes;
/admin/soporte;
/admin/integraciones;
/admin/plantillas;
/admin/cupones;
catch-all [...placeholder];
módulos futuros filtrados por getAdminNav().

No consolides módulos solo porque comparten tabla.
Primero demuestra que representan la misma tarea operativa, permisos y ciclo de vida.

17. Código potencialmente sobrante

Busca:

componentes sin consumidor;
exports sin consumidor;
rutas sin entrada;
schemas sin uso;
tipos duplicados;
adaptadores sin proveedor;
flags que nunca cambian;
ramas imposibles;
comentarios que describen futuro ya descartado;
fallbacks permanentemente activos;
código legacy después de migraciones;
variables de entorno sin consumidor;
consumidor que referencia una variable ya eliminada;
email template sin emisor;
notificación sin productor;
modelo sin lecturas ni escrituras;
tabla abandonada;
índice o constraint de una capacidad retirada;
tests de código retirado;
documentos de funcionalidades inexistentes.

No instales herramientas como knip ni dependencias nuevas.

No declares código muerto mediante una sola búsqueda textual.
Considera:

imports dinámicos;
Next.js routing;
Server Actions;
cron;
webhooks;
scripts;
reflection;
DB-driven CMS;
referencias en migraciones;
consumidores históricos.

Para cada candidato a retiro aporta:

ausencia de consumidor;
búsqueda realizada;
referencias DB;
impacto;
prueba necesaria;
estrategia de rollback.
18. Hipótesis específicas que debes revalidar

Estas no son conclusiones; son puntos que el repositorio actual sugiere y debes
confirmar o refutar con evidencia:

/admin/integraciones genera warnings fijos para Wompi y Aveonline a pesar
de existir probes reales.
El módulo de cupones está implementado, pero su copy y rutas de revalidación
todavía hablan del carrito aunque el ingreso real ocurre en checkout/pago.
El flujo PREMADE de TemplatesStrip utiliza ?templateId= sin un consumidor
productivo completo.
/admin/mensajes y /admin/soporte podrían ser dos vistas justificadas o
una duplicación operativa.
El catch-all administrativo puede esconder módulos todavía no implementados.
docs/QA_CHECKLIST.md conserva expectativas antiguas sobre la CTA de
personalización y posiblemente otros flujos.
seed-products.mjs mezcla bootstrap de catálogo con datos demo y puede
sobrescribir o archivar datos administrados.
Los scripts históricos podrían seguir siendo ejecutables sin formar parte
de una operación vigente.
El inventario de integraciones documentado no coincide completamente con
el panel administrativo.
Algunos módulos marcados pendientes en ROADMAP podrían estar implementados,
y otros marcados completos podrían conservar gaps operativos.

No aceptes ni rechaces estas hipótesis sin demostrarlas.

19. Pruebas permitidas en esta fase

Puedes ejecutar, si el entorno ya está preparado:

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check

También:

tests específicos existentes;
consultas SQL de solo lectura;
healthchecks GET seguros;
navegación E2E que no cree pagos, guías ni emails reales;
inspección de rutas;
comprobaciones de assets;
análisis de referencias.

Registra para cada comando:

comando exacto;
ambiente;
código de salida;
total de pruebas;
omitidas;
motivo de omisión.

Está prohibido en esta fase:

ejecutar seeds;
ejecutar migraciones;
usar --apply;
borrar o archivar datos;
modificar variables;
enviar emails reales;
crear pagos;
crear guías;
invocar webhooks externos;
load testing de PRD;
usar LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1;
corregir código mientras auditas.
20. Formato obligatorio del informe
A. Baseline
fecha;
rama;
SHA;
working tree;
diferencias con production;
ambientes disponibles;
limitaciones.
B. Veredicto ejecutivo

Selecciona uno:

COHERENCIA PRODUCTIVA BLOQUEADA
PRODUCCIÓN OPERATIVA CON GAPS
COHERENCIA PRODUCTIVA DEMOSTRADA

No uses “todo está bien” ni “100 % listo”.

C. Cobertura

| Superficie | Revisados | Total | Cobertura | Sin clasificar |

D. Mapa de capacidades

La matriz maestra definida anteriormente.

E. Matriz cliente–admin

| ID | Capacidad | Flujo cliente→admin | Flujo admin→cliente | Persistencia | Invalidación | Auditoría | Tests | Estado |

F. Hallazgos

| ID | Área | Severidad | Confianza | Evidencia | Comportamiento actual | Comportamiento correcto | Impacto | Disposición | Prueba de cierre |

Severidad:

CRÍTICA
ALTA
MEDIA
BAJA
INFORMATIVA
G. Datos por ambiente

Incluye conteos y divergencias, sin PII.

H. Plantillas

| Plantilla/grupo | Estado | Producto | Referencias históricas | Visible cliente | Origen | Ambiente | Disposición |

I. Cupones

| Grupo | Ambiente | Cantidad | Usos | Referencias | Clasificación | Disposición |

J. Integraciones

Incluye la tabla de verdad de salud y configuración.

K. Módulos y rutas

| Módulo | Nav | Ruta real | Placeholder | Servicio | Acción operativa | Estado | Disposición |

L. Scripts y seeds

| Script | Tipo | Entorno permitido | Riesgo | Consumidor | Sigue vigente | Disposición |

M. Deriva documental

| Documento | Afirmación | Realidad observada | Riesgo | Corrección requerida |

N. Manifiesto de saneamiento

Para cada cambio propuesto:

| ID | Tipo | Entidad/archivos | Selector exacto | Ambiente | Referencias comprobadas | Acción | Dry-run | Backup/rollback | Riesgo | Aprobación requerida |

O. Plan de implementación

Agrupa en PRs o lotes pequeños:

semántica y cableado;
consolidación de módulos;
limpieza de código;
endurecimiento de seeds y scripts;
saneamiento LOCAL;
saneamiento STG;
validación;
propuesta separada para PRD.

No mezcles el cambio de código y el borrado productivo en un único lote.

P. Decisiones requeridas

Solo preguntas que no puedan resolverse inspeccionando el repositorio o los ambientes.

21. Entregable en el repositorio

Durante el análisis no modifiques archivos.

Al terminar, se permite crear únicamente:

docs/audits/YYYY-MM-DD-coherencia-funcional-productiva.md

y actualizar mínimamente docs/STATE.md para:

enlazar la auditoría;
indicar que está pendiente de aprobación;
no marcar ningún hallazgo como remediado.

No hagas commit.

22. Regla de salida

Finaliza después del diagnóstico y el manifiesto de saneamiento.

No corrijas nada todavía.
No borres nada todavía.
No archives nada todavía.
No ejecutes acciones contra PRD.

Espera que el usuario apruebe expresamente los IDs que deben implementarse.


---

# Prompt 2 — Ejecutar únicamente lo aprobado

Este segundo prompt se utiliza después de revisar el informe anterior y seleccionar los hallazgos.

```markdown
# REMEDIACIÓN CONTROLADA DE COHERENCIA FUNCIONAL DE LUCAM’S

Implementa únicamente estos IDs aprobados:

[PEGAR AQUÍ LOS IDS APROBADOS]

Usa como fuente:

`docs/audits/[ARCHIVO-DE-LA-AUDITORÍA].md`

No implementes hallazgos no incluidos, aunque parezcan relacionados.

---

## 1. Revalidación inicial

Antes de modificar:

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
git diff --stat
git log -10 --oneline

Para cada ID:

confirma que el hallazgo todavía existe;
confirma que la evidencia y las líneas siguen vigentes;
identifica cambios locales que puedan colisionar;
identifica datos, pedidos, diseños, usos o auditorías referenciados;
define la prueba que demostrará el cierre.

Si un hallazgo ya no existe, márcalo como OBSOLETO, no inventes una corrección.

2. Orden obligatorio

Ejecuta los cambios en este orden:

corregir semántica y fuente de verdad;
corregir cableado cliente–admin;
agregar o ajustar tests;
corregir documentación;
endurecer scripts de saneamiento;
probar en LOCAL;
generar dry-run para STG;
aplicar en STG solo si está incluido en los IDs aprobados;
verificar STG;
generar propuesta y dry-run para PRD;
detenerte antes de aplicar en PRD.

No uses producción como entorno de ensayo.

3. Reglas de implementación
Preserva todos los cambios locales.
No hagas refactors no relacionados.
No instales dependencias.
No cambies el stack.
No agregues microservicios.
No agregues Sentry ni Twilio.
No retires una capacidad aprobada mediante ADR sin decisión explícita.
No debilites controles para hacer pasar pruebas.
No cambies textos legales salvo que un ID aprobado lo requiera.
Mantén compatibilidad con Next.js 16.
Usa los patrones existentes del repositorio.
Toda mutación admin conserva RBAC, MFA y auditoría.
Toda mutación visible al cliente invalida la caché correspondiente.
Todo cambio de estado debe ser idempotente cuando pueda reintentarse.
4. Retiro o consolidación de módulos

Antes de retirar código demuestra:

cero rutas productivas dependientes;
cero jobs;
cero webhooks;
cero Server Actions;
cero consumidores dinámicos;
cero referencias desde datos históricos;
pruebas actualizadas;
documentación actualizada.

Al consolidar dos módulos:

define una única tarea operativa;
conserva permisos;
conserva auditoría;
conserva filtros y acciones útiles;
agrega redirects cuando corresponda;
evita dos implementaciones de las mismas reglas;
elimina el módulo anterior solo después de probar el reemplazo.
5. Cambios sobre plantillas

No hard-deletees ninguna plantilla que esté referenciada por:

Design;
CartItem;
OrderItem;
assets de producción;
pedidos;
auditoría;
cualquier registro histórico.

Para elementos no visibles pero referenciados:

conserva la fila;
marca el estado apropiado;
impide nueva selección;
permite reproducción histórica.

Para candidatos realmente eliminables:

crea un script scoped;
dry-run por defecto;
lista únicamente IDs/slugs no sensibles;
verifica referencias;
requiere --apply;
usa transacción;
reporta antes/después;
incorpora rollback o respaldo;
aplica primero en LOCAL y STG.
6. Cambios sobre cupones

No hard-deletees cupones con:

CouponUsage;
pedidos;
snapshots;
auditoría;
cualquier evidencia comercial.

Prefiere archivo o inactivación cuando exista historia.

Corrige de forma coherente:

copy;
ruta real;
invalidación;
admin;
checkout;
tests;
documentación.

No cambies totales históricos de pedidos.

7. Integraciones y alertas

Implementa una fuente de verdad compartida cuando el ID aprobado lo requiera.

Distingue:

configuración;
modo;
salud;
preparación comercial;
criticidad;
ambiente;
último evento exitoso.

No realices probes con efectos transaccionales.

El panel, healthchecks y alertas deben usar estados compatibles:

HEALTHY
DEGRADED
DOWN
NOT_CONFIGURED
DISABLED_BY_MODE
DISABLED_BY_ENVIRONMENT
SANDBOX
PRODUCTION
UNKNOWN_NOT_PROBED

Agrega tests que demuestren que:

un servicio deshabilitado no genera falsa alarma;
un sandbox no aparece como producción;
una integración no probada no aparece caída;
Wompi y Aveonline consumen sus probes reales;
una recuperación elimina o resuelve el estado degradado.
8. Scripts de datos

Todo script nuevo o modificado debe:

ser dry-run por defecto;
exigir --apply;
imprimir destino clasificado sin revelar credenciales;
incluir env-guard;
rechazar PRD por defecto;
usar selectores estables;
comprobar referencias;
usar transacción cuando sea viable;
producir conteos antes/después;
ser idempotente;
tener tests para la clasificación;
documentar rollback.

No uses:

LUCAMS_ALLOW_DESTRUCTIVE_REMOTE=1

salvo que el usuario escriba expresamente:

APLICAR EN PRD LOS IDS: [lista]

en una sesión separada.

La existencia del bypass no es autorización.

Verifica adicionalmente destinos remotos no Supabase, porque la guarda actual no necesariamente
los bloquea.

9. Gates por lote

Después de cada lote ejecuta los tests específicos.

Al terminar ejecuta, si están disponibles:

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check

Ejecuta además:

pruebas de integración afectadas;
RLS si se tocaron políticas o acceso;
E2E del flujo cliente;
E2E del flujo admin;
comprobación de caché/invalidation;
dry-run de datos;
verificación de rutas y enlaces.

No afirmes que un gate pasó sin mostrar:

comando;
código de salida;
total;
omitidos;
ambiente.
10. Documentación

Actualiza en la misma sesión, según corresponda:

docs/STATE.md;
docs/ROADMAP.md;
docs/ARCHITECTURE.md;
docs/CONVENTIONS.md;
docs/OPERATIONS.md;
docs/OBSERVABILITY.md;
docs/INTEGRATIONS.md;
docs/TESTING.md;
docs/QA_CHECKLIST.md;
auditoría de coherencia funcional;
ADR cuando exista una decisión arquitectónica o de producto nueva.

No conserves comentarios que describan un futuro descartado como si siguiera vigente.

11. Informe final

Entrega:

Cambios

| ID | Archivos | Datos | Comportamiento anterior | Comportamiento nuevo |

Evidencia

| ID | Test/comando | Resultado | Ambiente |

Saneamiento

| Entidad | Ambiente | Antes | Acción | Después | Referencias preservadas |

Riesgos residuales

Incluye únicamente riesgos reales aún abiertos.

Despliegue
orden de despliegue;
migraciones;
scripts;
variables;
caché;
validación post-deploy;
rollback.
Estado de cada ID
CERRADO
PARCIAL
NO REPRODUCIBLE
BLOQUEADO POR DECISIÓN
PENDIENTE DE PRD

No hagas commit, push, merge, despliegue ni aplicación en PRD salvo instrucción explícita.
````
