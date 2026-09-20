# AUDITORÍA INTEGRAL DE SEGURIDAD, RED TEAM CONTROLADO Y GATE DE PRODUCCIÓN

# LUCAMS SHOP

## 0. MISIÓN

Asume simultáneamente los siguientes roles:

- Principal Application Security Engineer.
- Pentester senior de aplicaciones web, APIs y lógica de negocio.
- Arquitecto de seguridad cloud y serverless.
- Especialista en Next.js, React Server Components y Server Actions.
- Especialista en PostgreSQL, Prisma, Supabase Auth, RLS y Storage.
- Especialista en seguridad de pagos, webhooks, conciliación y fraude.
- Especialista en seguridad de DNS, dominios, certificados TLS y edge/CDN.
- Especialista en CI/CD, supply chain, GitHub Actions y gestión de secretos.
- Especialista en detección, respuesta a incidentes, backups y recuperación.
- Revisor adversarial encargado de refutar los hallazgos antes de aceptarlos.

Tu misión no es confirmar que el producto está listo para producción.

Debes intentar refutarlo.

Debes pensar primero como atacante:

> “¿Cómo comprometería cuentas, administración, clientes, fotografías, diseños, pedidos, precios,
> inventario, descuentos, pagos, reembolsos, envíos, correos, backups, infraestructura o la cadena
> de despliegue?”

Después debes pensar como defensor:

> “¿Qué control elimina la causa raíz, cómo demuestro que funciona, cómo detectaría el ataque y qué
> prueba impedirá que reaparezca?”

No produzcas una auditoría genérica.

No te limites a OWASP Top 10.

No te limites al repositorio.

No te limites a los puntos mencionados por el propietario.

Busca activamente:

- controles ausentes;
- configuraciones incorrectas;
- regresiones;
- contradicciones;
- activos olvidados;
- cuentas no controladas;
- dependencias de una sola persona;
- servicios externos;
- vectores pequeños que puedan encadenarse;
- riesgos desconocidos;
- puntos que están documentados, pero no demostrados.

Debes evaluar desde el dominio y la infraestructura pública hasta el código, la base de datos, los
proveedores, los equipos operativos, la detección y la recuperación.

No declares nunca que el sistema es “100 % seguro”.

El resultado permitido es uno de estos:

- `BLOQUEADO PARA PRODUCCIÓN`
- `PRODUCCIÓN CONDICIONADA`
- `APTO CON RIESGOS RESIDUALES ACEPTADOS`

---

# 1. CONTEXTO DEL PROYECTO

Proyecto: **LuCam’s Shop**, e-commerce colombiano de productos magnéticos personalizados.

Repositorio:

- Organización/usuario: `jullieth93`
- Repositorio: `lucams`
- Rama de desarrollo: `develop`
- Rama productiva: `production`
- Dominio declarado: `lucamsshop.com`

Stack declarado, que debes validar contra código, configuración y entornos reales:

- Next.js 16 App Router.
- React 19.
- React Server Components.
- Server Actions.
- Route Handlers.
- TypeScript.
- Tailwind CSS.
- Prisma.
- PostgreSQL.
- Supabase Auth.
- Supabase Storage.
- Supabase RLS.
- Vercel.
- Wompi.
- Aveonline.
- Resend.
- Cloudflare Turnstile.
- Cloudflare R2.
- Gemini.
- GitHub Actions.
- pg_cron.
- pg_net.
- Supabase Vault.

Superficies críticas:

- Dominio, DNS y certificado TLS.
- Registro, login, OTP y recuperación.
- Sesiones de clientes.
- Panel administrativo.
- RBAC.
- MFA TOTP.
- Recovery codes.
- Catálogo.
- Variantes.
- Precios.
- Promociones.
- Cupones.
- Referidos.
- Inventario.
- Carrito.
- Checkout.
- Wompi.
- Contraentrega.
- Conciliación.
- Reembolsos.
- Aveonline.
- Estados de envío.
- Retractos.
- Garantías.
- Estudio de personalización.
- Upload y procesamiento de imágenes.
- Diseños de clientes.
- CMS.
- Mediateca.
- Plantillas de correo.
- Correos de autenticación.
- Suscriptores.
- Exportaciones CSV.
- Finanzas.
- Materiales.
- Crons.
- Observabilidad.
- Backups.
- Restauración.
- Retención y eliminación de datos.
- CI/CD.
- Infraestructura cloud.
- VM y equipos administrativos.

Existe una auditoría histórica de seguridad en `docs/audits/`.

Esa auditoría sirve como referencia, pero no como prueba del estado actual.

No asumas que:

- un control que estaba bien continúa bien;
- un hallazgo remediado no regresó;
- la documentación coincide con el código;
- STG coincide con PRD;
- el código de `develop` está desplegado;
- una configuración cloud está bien porque aparece documentada;
- un proveedor administra automáticamente un control y por ello no necesita verificación.

---

# 2. OBJETIVO DE LA AUDITORÍA

La auditoría debe responder con evidencia:

1. ¿Cuáles son todos los activos externos e internos de LuCam’s?
2. ¿Qué superficie puede descubrir un atacante desde Internet?
3. ¿Qué controles están realmente implementados?
4. ¿Qué controles están únicamente documentados?
5. ¿Qué controles funcionan solo en LOCAL o STG?
6. ¿Qué controles funcionan realmente en PRD?
7. ¿Qué diferencias existen entre código, documentación, migraciones y entornos?
8. ¿Qué vulnerabilidades existen?
9. ¿Qué defectos menores podrían combinarse en una cadena grave?
10. ¿Qué operaciones financieras pueden manipularse?
11. ¿Qué datos pueden exponerse?
12. ¿Qué cuentas o proveedores pueden comprometer la plataforma?
13. ¿Qué ataques no serían detectados?
14. ¿Qué datos no podrían restaurarse?
15. ¿Qué depende de una sola persona?
16. ¿Qué riesgos bloquean producción?
17. ¿Qué riesgos pueden aceptarse temporalmente?
18. ¿Qué pruebas demuestran el cierre de cada hallazgo?

La auditoría debe cubrir:

- prevención;
- detección;
- alerta;
- respuesta;
- investigación;
- recuperación;
- continuidad;
- gobierno;
- riesgo de terceros.

---

# 3. PRINCIPIOS OBLIGATORIOS

## 3.1 Cero suposiciones

No aceptes como evidencia:

- “Next.js ya lo protege”.
- “Prisma evita inyecciones”.
- “Supabase maneja la seguridad”.
- “Vercel renueva el certificado”.
- “La ruta no aparece en la interfaz”.
- “El ID es difícil de adivinar”.
- “La documentación dice que tiene RLS”.
- “CI está verde”.
- “Hay muchos tests”.
- “El proveedor es reconocido”.
- “La clave es pública, así que no importa”.
- “Solo un administrador conoce esa URL”.

Demuestra los controles.

## 3.2 Evidencia por entorno

Separa siempre:

- código candidato;
- working tree local;
- LOCAL;
- STG;
- PRD;
- previews;
- aliases históricos;
- servicios de terceros.

Un control verificado en LOCAL no se considera verificado en PRD.

## 3.3 Seguridad proporcional

No conviertas automáticamente en vulnerabilidad:

- una clave publicable de Supabase en el navegador;
- identificadores numéricos;
- el uso de un monolito modular;
- la ausencia de microservicios;
- la inspección de HTML o JavaScript;
- la ausencia de DNSSEC;
- la ausencia de CAA;
- la ausencia de OCSP stapling;
- la ausencia de `security.txt`;
- la ausencia de MTA-STS;
- la ausencia de pinning de certificados;
- la ausencia de bloqueo permanente de cuenta;
- la ausencia de hashing propio de contraseñas;
- la ausencia de cifrado campo por campo;
- la ausencia de una herramienta específica.

Debes demostrar el riesgo real y la aplicabilidad.

## 3.4 Sin límite artificial de hallazgos

No impongas un máximo arbitrario.

Agrupa hallazgos con la misma causa raíz, pero enumera todos los activos y puntos afectados.

Los hallazgos de baja severidad e informativos deben conservarse en un **ledger de hardening**, aunque
no bloqueen producción.

## 3.5 No confundir seguridad con ocultamiento

No consideres controles de seguridad:

- ocultar rutas;
- minificar JavaScript;
- impedir `view-source`;
- usar UUID;
- bloquear crawlers mediante `robots.txt`;
- no documentar una API;
- cambiar mensajes sin corregir la autorización.

---

# 4. MARCOS DE REFERENCIA

Verifica en fuentes oficiales cuál es la versión vigente y registra fecha de consulta.

Utiliza como mínimo:

1. OWASP ASVS vigente.
   - Cobertura completa del nivel 2 aplicable.
   - Controles seleccionados del nivel 3 para:
     - administración;
     - sesiones;
     - autorización;
     - pagos;
     - reembolsos;
     - cambios de rol;
     - secretos;
     - criptografía;
     - archivos;
     - backups;
     - PII;
     - operaciones destructivas.

2. OWASP Top 10 vigente.

3. OWASP API Security Top 10 vigente.

4. OWASP Web Security Testing Guide.

5. OWASP Next.js Security Cheat Sheet.

6. OWASP File Upload Cheat Sheet.

7. OWASP Session Management Cheat Sheet.

8. OWASP Authentication Cheat Sheet.

9. OWASP Authorization Cheat Sheet.

10. OWASP Transaction Authorization Cheat Sheet.

11. OWASP Logging Cheat Sheet.

12. OWASP SSRF Prevention Cheat Sheet.

13. NIST Secure Software Development Framework.

14. NIST Cybersecurity Framework.

15. CWE.

16. CVSS vigente, únicamente como referencia complementaria.

17. Requisitos PCI aplicables al modelo real de integración con Wompi.

18. Baseline Requirements del CA/Browser Forum para certificados TLS.

19. RFC aplicables a:
    - TLS;
    - HSTS;
    - CAA;
    - DNSSEC;
    - Certificate Transparency;
    - `security.txt`;
    - SPF;
    - DKIM;
    - DMARC;
    - MTA-STS;
    - TLS-RPT.

No bases afirmaciones de versiones, defaults, límites o vulnerabilidades en memoria del modelo.

Cita fuente oficial y fecha.

---

# 5. PREGUNTAS PREVIAS A PRUEBAS ACTIVAS

Antes de lanzar pruebas dinámicas fuera de LOCAL, confirma únicamente lo que no pueda resolverse
inspeccionando el repositorio o los conectores disponibles:

1. URLs exactas de:
   - LOCAL;
   - STG;
   - PRD;
   - preview actual;
   - aliases relevantes.

2. Autorización de pruebas:
   - ¿STG permite pruebas activas?
   - ¿PRD permite únicamente pruebas pasivas y de bajo impacto?
   - ¿Existe una ventana para pruebas de concurrencia?

3. Cuentas de prueba:
   - cliente A;
   - cliente B;
   - SUPERADMIN;
   - MANAGER;
   - FULFILLMENT;
   - CMS_EDITOR;
   - administrador inactivo;
   - cuenta sin MFA, si existe un fixture seguro;
   - cuenta con sesión AAL1;
   - cuenta con sesión AAL2.

4. Acceso de solo lectura a:
   - GitHub;
   - Vercel;
   - Supabase LOCAL;
   - Supabase STG;
   - Supabase PRD;
   - registrador;
   - proveedor DNS;
   - Cloudflare;
   - R2;
   - Resend;
   - Wompi sandbox;
   - Wompi producción;
   - Aveonline;
   - Gemini.

5. Datos autorizados:
   - usuarios de prueba;
   - pedidos de prueba;
   - cupones de prueba;
   - archivos de prueba;
   - correos de prueba;
   - webhooks de prueba.

6. Restricciones expresas:
   - acciones prohibidas;
   - límites de requests;
   - horarios;
   - IPs autorizadas;
   - requisitos de limpieza.

Si faltan respuestas:

- continúa con revisión estática;
- continúa con LOCAL;
- continúa con evidencia pasiva;
- no ejecutes ataques en STG o PRD;
- marca la prueba como `BLOQUEADA POR FALTA DE AUTORIZACIÓN O ACCESO`;
- entrega el procedimiento exacto para que el operador la ejecute.

El acceso al repositorio no constituye autorización automática para atacar infraestructura.

---

# 6. REGLAS DE COMPROMISO

## 6.1 Prohibiciones en PRD

Sin autorización explícita, queda prohibido:

- DoS;
- stress testing;
- fuzzing de alto volumen;
- fuerza bruta;
- credential stuffing;
- creación de pagos reales;
- reembolsos reales;
- cambios de estado sobre pedidos reales;
- modificación de roles;
- desactivación de administradores;
- envío masivo de correos;
- webhooks falsos contra datos reales;
- borrado de datos;
- exfiltración de PII;
- descarga de archivos de clientes;
- subida de malware real;
- modificación de DNS;
- modificación de dominios;
- rotación de secretos;
- despliegues;
- cambios de infraestructura;
- restauraciones sobre PRD;
- interrupción de crons;
- revocación de certificados.

## 6.2 Evidencia segura

En PRD utiliza preferentemente:

- configuración de solo lectura;
- consultas SQL de catálogo;
- conteos;
- nombres de objetos sin datos privados;
- headers;
- cookies de cuentas de prueba;
- respuestas HTTP de bajo impacto;
- dashboards;
- logs redactados;
- capturas sanitizadas;
- pruebas con registros creados específicamente para auditoría.

## 6.3 PII y secretos

Nunca muestres en el informe:

- contraseñas;
- OTP;
- cookies completas;
- access tokens;
- refresh tokens;
- claves API;
- connection strings;
- secretos de webhooks;
- headers Authorization;
- URLs firmadas completas;
- datos de tarjeta;
- direcciones completas;
- fotografías privadas;
- diseños privados;
- cuerpos completos con PII.

Nunca imprimas contenido de:

- `.env`;
- `.env.local`;
- `.env.production`;
- backups de `.env`;
- secretos de dashboards;
- gestores de contraseñas.

Para inventariar variables utiliza:

- `.env.example`;
- referencias `process.env.*`;
- nombres de secretos en workflows;
- documentación;
- dashboards mostrando únicamente nombres y ambientes.

Si encuentras un secreto:

1. no lo reproduzcas;
2. registra tipo y ubicación;
3. determina si fue commiteado;
4. determina alcance;
5. marca rotación;
6. revisa historial;
7. documenta respuesta al incidente.

## 6.4 Working tree

Preserva cambios locales.

Está prohibido:

- `git reset`;
- `git clean`;
- `git restore`;
- `git checkout -- <archivo>`;
- `git stash`;
- rebase;
- force push;
- modificación de ramas;
- commit;
- despliegue;
- instalación de dependencias sin aprobación.

---

# 7. FASES ESTRICTAMENTE SEPARADAS

## FASE A — AUDITORÍA

Durante esta fase:

- no corrijas código;
- no cambies migraciones;
- no actualices dependencias;
- no alteres infraestructura;
- no rotes secretos;
- no despliegues;
- no cambies documentación canónica, salvo crear el informe solicitado;
- no suavices controles para hacer pasar pruebas.

Puedes crear únicamente:

- informe de auditoría;
- evidencia sanitizada;
- scripts temporales fuera del código productivo;
- fixtures de prueba autorizados;
- archivos temporales en directorios gitignored.

Al finalizar FASE A:

1. entrega el informe;
2. presenta el veredicto;
3. enumera bloqueantes;
4. enumera evidencia faltante;
5. detente;
6. espera autorización expresa para corregir.

## FASE B — REMEDIACIÓN

Solo comienza cuando el propietario apruebe IDs concretos.

Para cada hallazgo:

1. revalida que siga vigente;
2. identifica causa raíz;
3. diseña corrección mínima;
4. agrega prueba que falle antes;
5. implementa;
6. ejecuta pruebas positivas;
7. ejecuta pruebas negativas;
8. ejecuta retest ofensivo;
9. verifica efectos colaterales;
10. documenta despliegue;
11. documenta rollback;
12. actualiza documentación canónica;
13. marca riesgo residual;
14. espera autorización antes de commit o deploy.

---

# 8. LÍNEA BASE Y TRAZABILIDAD

Antes de analizar, registra:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse develop
git rev-parse production
git log -20 --oneline --decorate
git diff --stat production..develop
git diff --name-status production..develop
git remote -v

No asumas que los refs locales están actualizados.

Registra:

commit del working tree;
commit local de develop;
commit remoto de develop, si se puede consultar;
commit local de production;
commit remoto de production, si se puede consultar;
commit desplegado en STG;
commit desplegado en PRD;
migraciones aplicadas en LOCAL;
migraciones aplicadas en STG;
migraciones aplicadas en PRD;
fecha de última sincronización;
estado limpio o modificado;
feature flags por entorno;
ramas existentes;
aliases y deployments.

No confundas:

commit en Git;
commit desplegado;
base de datos migrada;
configuración cloud;
contenido CMS.
9. FUENTES QUE DEBES LEER

Lee primero:

CLAUDE.md
apps/web/AGENTS.md
docs/STATE.md
docs/README.md

Después:

docs/ARCHITECTURE.md
docs/SECURITY.md
docs/CONVENTIONS.md
docs/TESTING.md
docs/OPERATIONS.md
docs/OBSERVABILITY.md
docs/COMPLIANCE.md
docs/INTEGRATIONS.md
docs/DECISIONS.md
docs/ROADMAP.md
docs/RUNBOOK_GO_LIVE.md
docs/QA_CHECKLIST.md
docs/audits/README.md
auditoría histórica de seguridad;
auditorías posteriores vigentes;
post-mortems.

Inspecciona:

apps/web/app/**
apps/web/features/**
apps/web/lib/**
apps/web/components/**
apps/web/proxy.ts
apps/web/next.config.ts
apps/web/instrumentation.ts
apps/web/package.json
packages/db/package.json
packages/db/prisma/schema.prisma
todas las migraciones Prisma;
todas las migraciones Supabase;
scripts de DB;
scripts de Storage;
scripts de backups;
.github/workflows/**
.github/dependabot.yml
configuración de gitleaks;
configuración de Playwright;
configuración de Vitest;
configuración de Lighthouse;
pnpm-lock.yaml;
.npmrc;
Makefile;
archivos de Vercel;
configuración de TypeScript y ESLint.

Para Next.js 16 consulta además:

node_modules/next/dist/docs/

No uses conocimientos de Next.js 14 o 15 para asumir comportamientos de Next.js 16.

10. INVENTARIO TOTAL DE ACTIVOS

La auditoría no empieza en el código.

Empieza desde Internet:

registrador → DNS → certificados → edge/CDN → dominios → navegador → aplicación → APIs → datos →
proveedores → CI/CD → operación → recuperación

Realiza cuatro pasadas:

10.1 Outside-in

Descubre qué puede observar un atacante sin credenciales:

dominios;
subdominios;
certificados;
DNS;
servicios;
headers;
tecnologías;
despliegues;
aliases;
páginas;
APIs;
archivos públicos.
10.2 Inside-out

Descubre qué declara internamente el sistema:

código;
documentación;
migraciones;
variables;
workflows;
dashboards;
historial Git;
proveedores.
10.3 Cross-environment

Compara:

LOCAL;
STG;
PRD;
preview;
aliases;
dominios del proveedor;
bases de datos;
buckets;
secrets por nombre;
feature flags.
10.4 Negative-space review

Busca lo que puede existir, pero no aparece en el estado actual:

subdominios antiguos;
deployments retirados;
buckets olvidados;
claves antiguas;
usuarios antiguos;
aliases huérfanos;
túneles;
registros DNS;
cuentas personales;
webhooks viejos;
integraciones retiradas;
dominios de tracking;
selectores DKIM antiguos;
CNAME dangling.

Produce:

| Activo | Tipo | Fuente | Proveedor | Entorno | Propietario | Exposición | Criticidad | Estado | Evidencia | Acción |

Un activo crítico sin propietario o sin estado verificable es un riesgo abierto.

11. REGISTRADOR Y PROPIEDAD DEL DOMINIO

Verifica mediante evidencia de solo lectura:

registrador;
titular;
entidad propietaria;
contactos;
correo de recuperación;
teléfono de recuperación;
fecha de expiración;
autorrenovación;
método de pago;
método alternativo;
notificaciones;
verificación del titular;
transfer lock;
registry lock, si aplica;
código EPP/AuthInfo;
MFA;
cuentas con acceso;
sesiones activas;
tokens API;
logs;
recuperación;
cuenta break-glass;
cuentas personales;
excolaboradores;
proceso de baja.

Determina quién podría:

transferir el dominio;
cambiar nameservers;
editar DNS;
desactivar renovación;
cambiar contactos;
recuperar la cuenta.

Bloquea producción si existe:

riesgo inminente de expiración;
ausencia de autorrenovación sin procedimiento alternativo;
propietario inaccesible;
cuenta comprometida;
recuperación dependiente de una sola persona;
acceso de un tercero no autorizado;
dominio registrado en cuenta no controlada;
posibilidad de modificar DNS desde una cuenta sin MFA.

No confundas expiración del dominio con expiración del certificado.

12. DNS

Inventaría:

NS;
SOA;
A;
AAAA;
CNAME;
MX;
TXT;
CAA;
DS;
DNSKEY;
RRSIG;
DKIM;
SPF;
DMARC;
MTA-STS;
TLS-RPT;
_acme-challenge;
verificaciones;
delegaciones;
wildcards.

Comprueba:

nameservers correctos;
consistencia entre resolutores;
TTL;
propagación;
registros huérfanos;
CNAME dangling;
subdomain takeover;
wildcards innecesarios;
delegaciones olvidadas;
AXFR público;
IPv4/IPv6;
respuestas distintas no justificadas;
dominios parecidos;
servicios retirados;
previews antiguas;
aliases reclamables.
12.1 DNSSEC

Comprueba:

DS;
DNSKEY;
RRSIG;
cadena de confianza;
algoritmos;
expiración de firmas;
rollover;
monitoreo.

No marques su ausencia automáticamente como crítica.

Evalúa riesgo, soporte, complejidad y capacidad operativa.

12.2 CAA

Comprueba:

issue;
issuewild;
iodef;
herencia;
autoridades permitidas;
compatibilidad con Vercel y CA real;
certificados wildcard;
autorizaciones innecesarias.
13. CERTIFICADOS TLS

Evalúa todos los hosts públicos:

apex;
www;
producción de Vercel;
STG;
previews;
APIs;
subdominios;
correo;
tracking;
Storage;
custom domains.

Para cada uno registra:

| Host | Emisor | SAN | notBefore | notAfter | Días restantes | Clave | Firma | Cadena | SCT | Revocación | Renovación | Monitor |

Comprueba:

hostname;
SAN;
apex;
www;
wildcard;
cadena completa;
root confiable;
intermediarios;
orden;
fecha;
certificado futuro;
certificado expirado;
algoritmo;
tamaño de clave;
ausencia de SHA-1/MD5;
SCT;
Certificate Transparency;
CRL;
AIA;
OCSP cuando corresponda;
SNI;
host virtual por defecto;
IPv4;
IPv6;
distintas ubicaciones edge;
aliases;
navegadores modernos.

No aceptes como única evidencia:

“Vercel lo renueva automáticamente”.

Verifica:

historial de renovación;
mecanismo ACME;
permisos;
CAA;
_acme-challenge;
alertas;
destinatarios;
procedimiento manual;
reemisión;
revocación;
recuperación ante cambio de DNS;
monitor independiente.

Debe existir alertamiento, como mínimo, antes de:

30 días;
14 días;
7 días;
3 días;
24 horas.

No recomiendes HPKP.

14. TLS Y PROTOCOLOS

Verifica:

SSLv2 rechazado;
SSLv3 rechazado;
TLS 1.0 rechazado;
TLS 1.1 rechazado;
TLS 1.2 seguro;
TLS 1.3 soportado;
suites;
forward secrecy;
ECDHE;
curvas;
RSA key exchange;
CBC;
3DES;
RC4;
compresión TLS;
renegociación;
downgrade protection;
ALPN;
HTTP/2;
HTTP/3;
QUIC;
session resumption;
session tickets;
0-RTT.

Para 0-RTT analiza replay de:

login;
checkout;
cupón;
creación de orden;
reembolso;
webhooks;
acciones administrativas.

Utiliza únicamente herramientas existentes o aprobadas:

openssl s_client
curl
dig
nmap --script ssl-enum-ciphers
testssl.sh
sslyze

No instales herramientas sin aprobación.

15. HTTPS, REDIRECCIONES Y HSTS

Prueba:

http://lucamsshop.com;
http://www.lucamsshop.com;
https://lucamsshop.com;
https://www.lucamsshop.com;
rutas;
404;
APIs;
admin;
webhooks;
estáticos;
errores.

Comprueba:

HTTP→HTTPS;
ausencia de downgrade;
destino canónico;
número de saltos;
path;
query string;
open redirects;
cookies antes del redirect;
mixed content;
WebSocket seguro;
URLs HTTP productivas.
15.1 HSTS

Comprueba en respuestas reales:

Strict-Transport-Security;
max-age;
includeSubDomains;
preload;
2xx;
3xx;
4xx;
5xx;
APIs;
admin;
distintas ubicaciones edge;
lista preload real;
soporte HTTPS en todos los subdominios;
procedimiento de rollback.

La palabra preload en el header no demuestra inclusión efectiva.

16. CERTIFICATE TRANSPARENCY

Busca certificados históricos para:

dominio;
www;
wildcards;
subdominios;
aliases antiguos.

Identifica:

certificados desconocidos;
emisores inesperados;
hosts desconocidos;
certificados todavía válidos de servicios retirados.

Verifica monitoreo de:

nueva emisión;
issuer inesperado;
wildcard inesperado;
subdominio inesperado;
cambios de DNS;
cambios de CAA;
cambios de NS.
17. EDGE, VERCEL Y CDN

Verifica en configuración real:

proyecto dueño;
equipo;
miembros;
roles;
MFA;
tokens;
Git integration;
domains;
aliases;
certificados;
previews;
preview protection;
bypass tokens;
deployment hooks;
production branch;
custom environments;
logs;
audit trail;
source maps;
rollback;
WAF;
firewall;
DDoS;
bot protection;
rate limits;
caches;
edge functions;
redirects;
headers;
deployments históricos.

Prueba de manera controlada:

Host header injection;
alternate host;
acceso mediante *.vercel.app;
bypass de preview protection;
bypass token;
deployments antiguos;
cache poisoning;
cache deception;
path normalization;
doble encoding;
encoded slashes;
métodos inesperados;
headers duplicados;
request smuggling;
HTTP desync;
Content-Length/Transfer-Encoding conflictivos;
origin bypass;
dominios alternativos.

Comprueba que un deployment histórico no conserve:

código vulnerable;
acceso a PRD;
variables productivas;
sesiones;
datos;
APIs internas.
18. SEGURIDAD DEL CORREO

Revisa:

dominio visible en From;
dominio DKIM;
Return-Path;
MAIL FROM;
tracking domain;
links;
unsubscribe;
SMTP de Supabase;
Resend;
correos de autenticación;
correos de pedidos;
correos administrativos.
18.1 SPF

Comprueba:

registro único;
sintaxis;
mecanismos;
+all;
includes;
lookups;
proveedores retirados;
subdominios;
alineación;
softfail/fail.
18.2 DKIM

Comprueba:

selectores;
claves;
tamaño;
algoritmo;
alineación;
rotación;
selectores antiguos;
registros huérfanos;
firma de cada tipo de correo.
18.3 DMARC

Comprueba:

registro único;
sintaxis;
alineación;
p;
sp;
pct;
rua;
ruf;
procesamiento de reportes;
privacidad;
forwarding.

No exijas p=reject antes de validar todos los remitentes legítimos.

18.4 Transporte

Evalúa:

MX;
STARTTLS;
certificado MX;
MTA-STS;
TLS-RPT;
DANE, si corresponde;
open relay;
spoofing;
bounces;
suppression;
abuse reports.
18.5 Phishing

Comprueba:

suplantación del dominio;
dominios parecidos;
enlaces de autenticación;
consistencia;
soporte;
capacidad de envío;
cuentas con permisos de envío;
API keys de Resend;
scopes.
19. SECURITY.TXT Y DIVULGACIÓN

Verifica:

/.well-known/security.txt

Si existe, comprueba:

HTTPS;
200;
UTF-8;
text/plain;
Contact;
Expires;
Canonical;
Policy;
buzón atendido;
SLA;
procedimiento interno.

Su ausencia no es crítica automáticamente.

Un archivo obsoleto o un contacto no atendido sí constituye riesgo operativo.

20. TLS SALIENTE Y CONEXIONES ENTRE SERVICIOS

Revisa:

Vercel → Supabase;
Prisma → PostgreSQL;
Next.js → Wompi;
Next.js → Aveonline;
Next.js → Resend;
Next.js → Gemini;
Next.js → R2;
pg_net → crons;
Supabase Auth → SMTP;
GitHub Actions → proveedores;
backups → R2.

Busca:

http:// en producción;
NODE_TLS_REJECT_UNAUTHORIZED=0;
rejectUnauthorized: false;
validación de hostname desactivada;
CA custom;
certificados autofirmados;
redirects HTTPS→HTTP;
secrets en URL;
sslmode;
validación real de identidad;
timeouts;
retry;
SNI;
proxy corporativo;
TLS interception.

No asumas que sslmode=require valida identidad.

Prueba mediante mocks o entornos controlados:

certificado expirado;
hostname incorrecto;
CA no confiable;
timeout;
respuesta parcial;
cierre abrupto.
21. CUENTAS CLOUD, IAM Y FACTOR HUMANO

Audita:

registrador;
GitHub;
Vercel;
Supabase;
Cloudflare;
R2;
Resend;
Wompi;
Aveonline;
Google/Gemini;
correo corporativo;
gestor de contraseñas;
analítica;
proveedor DNS.

Para cada plataforma:

| Plataforma | Propietario | Usuarios | Roles | MFA | Tokens | Última revisión | Logs | Recuperación | Offboarding |

Comprueba:

MFA;
MFA resistente a phishing cuando esté disponible;
mínimo privilegio;
usuarios compartidos;
cuentas personales;
cuentas de servicio;
tokens sin expiración;
scopes;
sesiones;
recuperación;
recovery codes;
break-glass;
excolaboradores;
acceso de soporte;
notificaciones;
auditoría;
separación de responsabilidades.

Analiza cadenas:

correo comprometido → recuperación de registrador;
correo comprometido → GitHub;
GitHub comprometido → Vercel;
Vercel comprometido → variables;
Supabase comprometido → PII;
registrador comprometido → secuestro del dominio.
22. VM Y EQUIPOS OPERATIVOS

Evalúa:

sistema operativo;
soporte;
parches;
cifrado de disco;
bloqueo;
usuarios;
sudo;
SSH;
claves;
passphrase;
SSH agent;
firewall;
puertos;
procesos;
servicios;
túneles;
ngrok;
navegadores;
extensiones;
malware protection;
backups;
secrets locales;
permisos de .env*;
shell history;
core dumps;
swap;
archivos temporales;
paquetes globales;
credenciales PRD;
tokens CLI;
sesiones;
repositorios clonados;
Git credentials;
redes públicas;
VPN;
offboarding.

Busca:

servicios en 0.0.0.0;
Supabase Studio expuesto;
túneles antiguos;
backups sin cifrar;
secretos en logs;
secretos en historial;
procesos antiguos;
versiones obsoletas;
copias locales de producción;
capturas con PII.

No apliques hardening destructivo en FASE A.

23. INVENTARIO DE SUPERFICIE DE APLICACIÓN

Cuenta y clasifica:

páginas públicas;
páginas autenticadas;
páginas admin;
Server Components con DB;
Server Actions;
Route Handlers;
webhooks;
crons;
health endpoints;
status endpoints;
uploads;
downloads;
exports;
previews;
RPC;
funciones SQL;
funciones SECURITY DEFINER;
triggers;
tablas;
vistas;
buckets;
roles;
integraciones.

Para cada punto de entrada:

Campo	Evidencia
Ruta/símbolo
Mecanismo
Método
Público/autenticado/admin/interno
Rol permitido
Input
Validación
Autenticación
Autorización
Ownership
Rate limit
Idempotencia
Timeout
Tamaño máximo
Output
Cache
Logging
Dependencias
Prueba hostil

No declares cobertura completa sin conteos.

24. NEXT.JS Y FRONTERA CLIENTE-SERVIDOR

Verifica:

secretos importados por componentes cliente;
server-only;
NEXT_PUBLIC_*;
datos serializados en RSC;
React Flight payloads;
props privadas;
Server Actions invocables directamente;
autorización en cada Action;
validación en servidor;
campos ocultos;
mass assignment;
CSRF;
Origin;
Host;
safe redirects;
cache;
unstable_cache;
tags;
invalidaciones;
draft/edit mode;
revalidateTag;
middleware/proxy;
rutas excluidas;
early returns;
headers en errores;
source maps;
Image Optimization;
remotePatterns;
SSRF;
body limits;
Server Actions de 50 MB;
CPU;
memoria;
timeout;
cold starts;
archivos temporales;
estados parciales;
GET con efectos;
prefetch de Next.js;
links o bots que puedan activar acciones.

Comprueba headers en:

2xx;
3xx;
4xx;
5xx;
público;
autenticado;
admin;
APIs;
webhooks;
redirects;
early returns.
25. AUTENTICACIÓN, OTP, MFA Y SESIONES

Prueba:

registro;
email ya registrado;
enumeración;
confirmación OTP;
reenvío OTP;
expiración OTP;
brute force OTP;
recuperación;
restablecimiento;
cambio de contraseña;
cambio de email;
logout;
revocación;
borrado de cuenta;
usuario desactivado;
administrador desactivado;
sesión robada;
refresh token robado;
session fixation;
session replay;
cookie alterada;
token expirado;
clock skew;
AAL1;
AAL2;
enrolamiento TOTP;
desafío TOTP;
recovery code;
doble consumo concurrente;
regeneración;
downgrade;
desenrolamiento;
step-up;
reautenticación reciente;
replay de reautenticación.

Revisa cookies:

Secure;
HttpOnly;
SameSite;
Domain;
Path;
TTL;
rotación;
nombres;
colisiones;
__Host-;
__Secure-;
invalidación;
subdominios;
exposición por takeover.

Evalúa:

Clear-Site-Data;
bfcache después de logout;
caché de páginas privadas;
navegador atrás después de logout;
tokens en URL;
referrer leakage;
autocomplete;
password managers;
campos OTP.

No declares automáticamente vulnerabilidad por cookies de Supabase SSR no HttpOnly.

Analiza arquitectura y compensaciones reales.

26. RATE LIMITING Y PROTECCIÓN ANTIABUSO

Comprueba:

login;
registro;
OTP;
reset;
MFA;
recovery codes;
contacto;
newsletter;
reseñas;
Q&A;
búsqueda;
vitals;
log-error;
IA;
uploads;
cupones;
checkout;
tracking;
webhooks;
crons.

Evalúa:

por IP;
por email;
por cuenta;
por sesión;
por recurso;
global;
distribuido;
botnet;
rotación de IP;
spoofing de headers;
Vercel trusted proxy;
IPv6;
NAT;
claves hasheadas;
TTL;
cleanup;
carrera;
evasión por casing;
Unicode;
alias de email;
respuesta;
Retry-After;
bloqueo de usuarios legítimos;
denial-of-wallet;
costo de proveedores.

Verifica Turnstile:

token;
hostname;
action;
expiración;
replay;
fail-open/fail-closed;
secret ausente;
timeout;
error del proveedor;
bypass directo de Action/API.
27. AUTORIZACIÓN, RBAC, IDOR Y MASS ASSIGNMENT

Construye matriz para:

anónimo;
cliente propietario;
cliente distinto;
SUPERADMIN;
MANAGER;
FULFILLMENT;
CMS_EDITOR;
admin inactivo;
AAL1;
AAL2;
sesión expirada.

Prueba directamente:

read;
create;
update;
delete;
archive;
restore;
publish;
export;
download;
refund;
role change;
deactivate;
inventory;
finance;
PII;
designs;
images;
email templates;
media;
subscribers.

Busca:

IDOR;
BOLA;
function-level authorization;
field-level authorization;
mass assignment;
parámetros como:
role;
isActive;
isApproved;
featured;
price;
discount;
stock;
status;
customerId;
orderId;
email;
ownerId;
createdBy;
deletedAt;
usedCount.

Comprueba que headers internos como x-pathname no puedan ser falsificados desde el cliente.

No confíes en layouts ni navegación.

28. POSTGRESQL, PRISMA, RLS Y STORAGE

En cada entorno autorizado verifica:

tablas;
vistas;
secuencias;
RLS;
FORCE RLS;
políticas;
grants;
default privileges;
roles;
ownership;
BYPASSRLS;
funciones;
SECURITY DEFINER;
search_path;
triggers;
event triggers;
extensiones;
RPC;
exposed schemas;
PostgREST;
Storage policies;
buckets públicos;
buckets privados;
signed URLs;
funciones de rate limit;
Vault;
pg_cron;
pg_net.

Contrasta:

Prisma schema;
migraciones Prisma;
migraciones Supabase;
LOCAL;
STG;
PRD.

Busca:

$queryRawUnsafe;
$executeRawUnsafe;
concatenación SQL;
dynamic SQL;
format() inseguro;
funciones públicas;
EXECUTE a PUBLIC;
search_path mutable;
privilege escalation;
policies USING (true);
policies de Storage demasiado amplias;
nuevas tablas sin RLS;
vista que eluda RLS;
grants heredados;
función huérfana;
drift;
migraciones no aplicadas;
downgrade inseguro;
scripts destructivos;
conexión de app como postgres;
secretos DB;
TLS DB;
pooler;
agotamiento de conexiones.

No repitas cifras históricas.

Consulta estado actual.

29. INPUTS, OUTPUTS E INYECCIONES

Busca sistemáticamente:

SQL injection;
command injection;
XSS almacenado;
XSS reflejado;
DOM XSS;
HTML injection;
Markdown inseguro;
email HTML injection;
template injection;
CSV/formula injection;
SSRF;
path traversal;
zip slip;
open redirect;
host header injection;
CRLF;
response splitting;
log injection;
prototype pollution;
deserialización insegura;
regex DoS;
header injection;
HTTP parameter pollution;
duplicate fields;
duplicate query params;
JSON profundo;
JSON grande;
Unicode;
null bytes;
coerción de tipos;
campos adicionales;
URLs manipuladas;
Content-Type incorrecto;
multipart ambiguo.

Revisa:

dangerouslySetInnerHTML;
ReactMarkdown;
rehype-raw;
sanitización;
JSON-LD;
CMS;
emails;
reviews;
Q&A;
nombres;
mensajes;
WhatsApp;
archivos;
exports.

No consideres suficiente:

TypeScript;
Zod en una capa distinta;
escape de React;
Prisma;
validación del navegador.
30. SSRF

Busca cualquier input que termine en:

fetch;
image optimizer;
previews;
mediateca;
importaciones;
webhooks salientes;
IA;
URLs de productos;
descargas;
redirects.

Prueba de forma controlada:

localhost;
127.0.0.1;
IPv6 localhost;
RFC1918;
link-local;
169.254.169.254;
decimal/hex IP;
DNS rebinding;
redirect a red privada;
esquema no HTTP;
URL con credenciales;
hostname ambiguo;
punto final;
Unicode;
puerto alternativo.

Comprueba:

allowlist;
resolución DNS;
verificación posterior a redirect;
bloqueo de IP privada;
timeouts;
tamaño de respuesta;
Content-Type;
cantidad de redirects;
egress.
31. APIs, ROUTE HANDLERS Y SERVER ACTIONS

Aplica OWASP API Security Top 10.

Para cada endpoint:

autenticación;
autorización;
ownership;
input;
output;
propiedades excesivas;
mass assignment;
rate limit;
cache;
timeout;
body limit;
métodos;
CORS;
CSRF;
logs;
errores;
versionado;
inventario;
exposición antigua.

Prueba:

GET;
POST;
PUT;
PATCH;
DELETE;
OPTIONS;
HEAD;
TRACE;
métodos inesperados;
override de método;
Content-Type alternativo;
JSON;
form-urlencoded;
multipart;
sin Content-Type;
body vacío;
campos duplicados;
campos adicionales.
32. WEBHOOKS

Para Wompi, Aveonline, Resend y cualquier otro:

algoritmo;
secret;
raw body;
canonicalización;
comparación timing-safe;
timestamp;
tolerancia;
replay;
idempotencia;
deduplicación;
carreras;
orden de eventos;
eventos atrasados;
eventos duplicados;
eventos imposibles;
tamaño;
rate limit;
timeout;
retry;
respuesta rápida;
procesamiento posterior;
PII en logs;
secreto en query string;
rotación;
ambiente;
sandbox vs PRD.

Prueba:

firma faltante;
firma incorrecta;
firma válida con body alterado;
timestamp vencido;
replay exacto;
dos requests concurrentes;
evento válido fuera de orden;
referencia de otra orden;
monto diferente;
moneda diferente;
estado inválido;
proveedor caído.
33. CRONS Y JOBS

Para cada cron:

autenticación;
x-cron-secret;
timing-safe;
fail-closed;
Vault;
ambiente;
base URL;
idempotencia;
lock;
ejecución concurrente;
reintentos;
timeout;
heartbeat;
stale detection;
alertas;
logging;
PII;
operación destructiva;
paginación;
límites;
cleanup;
rollback.

Busca:

STG llamando PRD;
secret compartido;
base URL equivocada;
cron duplicado;
migración que reagenda jobs retirados;
job desactivado sin alerta;
job que borra demasiado;
error parcial;
carrera entre ejecuciones.
34. LÓGICA DE NEGOCIO
34.1 Carrito

Intenta:

modificar precio;
cambiar variante;
usar variante archivada;
cantidad negativa;
cantidad cero;
cantidad extrema;
overflow;
duplicar línea;
carrito de otro usuario;
sesión anónima robada;
token de carrito;
mezclar entornos;
producto sin stock;
precio antiguo;
promoción antigua.
34.2 Checkout

Intenta:

saltar pasos;
modificar dirección;
modificar flete;
alterar oferta de envío;
alterar moneda;
alterar subtotal;
alterar impuesto;
alterar descuento;
alterar total;
reutilizar checkout;
replay;
dos checkouts;
mismo carrito;
cambiar email;
cambiar identidad;
manipular cookies;
usar estado expirado;
ejecutar con tienda en modo incorrecto.
34.3 Inventario

Prueba:

último stock;
dos compras concurrentes;
reserva expirada;
reserva duplicada;
pago después de expiración;
cancelación;
devolución;
reembolso;
stock negativo;
doble liberación;
doble decremento;
estado manual.
34.4 Cupones

Prueba:

doble uso;
concurrencia;
límite global;
límite por usuario;
expiración;
timezone;
mínimo;
máximo;
producto no elegible;
stacking;
descuento mayor al total;
cupón archivado;
código con casing;
Unicode;
usedCount;
rollback de orden;
reintento.
34.5 Referidos y lealtad

Prueba:

autoreferido;
ciclos;
duplicados;
puntos negativos;
race;
reembolso;
account deletion;
código predecible;
abuso masivo.
35. WOMPI Y PAGOS

Determina cómo se integra Wompi:

redirect;
iframe;
widget;
script;
tokenización;
hosted fields;
retorno;
webhook.

Verifica:

firma de integridad;
monto;
moneda;
referencia;
orden;
timestamp;
firma webhook;
raw body;
replay;
duplicados;
idempotencia;
orden de eventos;
timeout;
reconciliación;
devolución del navegador;
pago aprobado con orden cancelada;
pago duplicado;
pago con monto diferente;
pago tardío;
webhook perdido;
sandbox/PRD;
keys;
rotación.

No confíes en parámetros del navegador.

No declares cumplimiento PCI.

Documenta el alcance probable y qué requiere confirmación de Wompi, adquirente o especialista PCI.

36. CONTRAENTREGA, FINANZAS Y REEMBOLSOS

Prueba:

habilitar COD sin rol;
evadir límites;
múltiples pedidos;
identidad distinta;
órdenes simultáneas;
estados manuales;
conciliación manipulada;
reembolso doble;
reembolso concurrente;
reembolso parcial;
monto distinto;
orden no pagada;
orden ya reembolsada;
retracto reembolsado;
sesión AAL2 vieja;
bypass del step-up;
cambio de rol;
administrador desactivado;
TOCTOU;
dos administradores;
replay de Action.

Toda operación financiera sensible debe tener:

autorización;
step-up MFA;
idempotencia;
audit log;
correlación;
evidencia;
alerta;
reconciliación.
37. AVEONLINE Y LOGÍSTICA

Verifica:

autenticidad;
secret;
replay;
estados;
transiciones;
guía duplicada;
creación concurrente;
devolución;
entrega falsa;
COD;
dirección;
PII;
logs;
retry;
caída;
timeout;
reconciliación;
sandbox/PRD;
rotación.
38. FUNCIONALIDADES NUEVAS O CAMBIADAS

Audita con prioridad el diff entre production y develop, especialmente:

autenticación;
OTP;
SMTP;
recovery codes;
MFA;
plantillas de correo;
preview de correos;
envío de prueba;
HTML administrable;
destinatarios;
finanzas;
conciliación;
COD;
exportación CSV;
suscriptores;
mediateca;
copiado de URLs;
materiales;
costos;
nuevos crons;
retención de diseños;
backups de Storage;
migraciones;
RLS;
nuevas tablas;
nuevos roles;
nuevas rutas;
nuevos scripts.

Cada cambio sensible debe tener threat model y prueba hostil.

39. CSV Y EXPORTACIONES

Verifica:

autorización;
PII;
columnas;
minimización;
auditoría;
rate limit;
memoria;
paginación;
streaming;
fórmula de Excel;
campos que comienzan por:
=
+
-
@
tab;
carriage return;
delimitadores;
encoding;
nombres de archivo;
Content-Disposition;
cache;
descarga desde historial;
logs;
acceso de roles.
40. EMAILS Y PLANTILLAS

Verifica:

acceso;
roles;
preview;
envio de prueba;
destinatario manipulable;
header injection;
HTML injection;
links;
escape;
Markdown;
templates;
tokens;
datos faltantes;
secrets;
PII;
logs;
unsubscribe;
rate limit;
abuso de envío;
phishing interno;
SSRF mediante imágenes;
tracking;
CSP del preview;
contenido activo.
41. UPLOADS, IMÁGENES Y STORAGE

Evalúa:

tamaño por archivo;
tamaño total;
cantidad;
MIME;
magic bytes;
extensión;
polyglots;
SVG;
HTML;
HEIC;
ZIP;
archivos truncados;
dimensiones gigantes;
decompression bombs;
memoria;
CPU;
timeout;
sharp;
canvas;
EXIF;
GPS;
re-encode;
nombres;
object keys;
path traversal;
colisión;
overwrite;
acceso entre clientes;
signed URLs;
TTL;
bucket público;
bucket privado;
Content-Type;
Content-Disposition;
cache;
retención;
eliminación;
R2;
huérfanos;
backups;
restore.

Analiza específicamente el límite de 50 MB:

qué Actions lo heredan;
cuándo se lee el body;
memoria;
concurrencia;
costo;
timeout;
cantidad de archivos;
posibilidad de upload directo;
validación previa;
validación posterior;
cleanup tras aborto;
archivos parciales.

No declares vulnerabilidad sin demostrar una ruta abusiva.

42. IA Y GEMINI

Si Gemini recibe datos, verifica:

prompts;
fotografías;
diseños;
nombres;
PII;
menores;
metadata;
retención;
entrenamiento;
consentimiento;
minimización;
región;
logs;
aislamiento;
prompt injection;
instrucciones ocultas;
salida no confiable;
links;
código;
contenido inseguro;
abuso de costo;
rate limit;
timeout;
retry;
filtración de system prompt;
filtración de secretos;
fallback;
errores;
moderación.

Toda salida de IA debe tratarse como input no confiable.

43. SEGURIDAD DEL NAVEGADOR

Revisa:

localStorage;
sessionStorage;
IndexedDB;
Cache Storage;
Service Workers;
scope;
actualización;
cache poisoning;
datos offline;
tokens;
PII;
fotografías;
diseños;
clipboard;
postMessage;
validación de origin;
window.opener;
reverse tabnabbing;
target="_blank";
object URLs;
blobs;
descargas;
history;
referrer;
source maps;
consola;
React Flight;
autofill;
bfcache;
manifest;
deep links.

Para cada script externo:

| Script | Proveedor | Página | Privilegios | Integridad | CSP | Necesidad | Riesgo |

Incluye:

Wompi;
Turnstile;
Vercel Toolbar;
fuentes;
analítica;
píxeles;
cualquier script dinámico.

Evalúa:

SRI;
nonce;
hash;
allowlist;
carga dinámica;
cambios del proveedor;
CSP reporting;
inventario de scripts;
reducción de scripts en checkout.
44. CHECKOUT Y E-SKIMMING

Analiza ataques Magecart:

script comprometido;
overlay;
formulario falso;
keylogger;
envío externo;
iframe sustituido;
botón alterado;
retorno manipulado;
CMS comprometido;
script de tercero.

Determina:

qué renderiza LuCam’s;
qué renderiza Wompi;
si el navegador recibe PAN;
si el servidor recibe PAN;
si analítica ve datos de pago;
si scripts pueden observar campos;
qué alcance PCI queda;
qué evidencia falta.
45. HEADERS HTTP

Comprueba en respuestas reales:

CSP;
nonce;
script-src;
style-src;
connect-src;
img-src;
frame-src;
frame-ancestors;
form-action;
base-uri;
object-src;
HSTS;
X-Frame-Options;
X-Content-Type-Options;
Referrer-Policy;
Permissions-Policy;
COOP;
CORP;
COEP, si aplica;
Cache-Control;
Pragma;
Expires;
Clear-Site-Data;
Content-Disposition;
Vary;
Server;
X-Powered-By;
ETag;
Fetch Metadata;
X-Permitted-Cross-Domain-Policies;
Origin-Agent-Cluster.

No marques ausencia de COEP o Trusted Types automáticamente como vulnerabilidad.

Evalúa compatibilidad y beneficio.

46. CORS Y CSRF

Prueba orígenes:

legítimo;
subdominio malicioso;
dominio parecido;
prefijo/sufijo;
puerto;
null;
uppercase;
punto final;
Unicode;
preview no autorizado;
localhost;
dominio Vercel ajeno.

Comprueba:

ACAO;
credentials;
wildcard;
preflight;
Vary;
métodos;
headers;
Origin faltante;
Origin duplicado;
Referer;
SameSite;
CSRF token;
Server Actions;
multipart;
JSON;
logout;
admin;
reembolsos;
cambios de rol.
47. SECRETS Y CRIPTOGRAFÍA

Inventaría:

claves privadas;
claves publicables;
secrets;
peppers;
HMAC keys;
encryption keys;
webhook secrets;
API keys;
DB URLs;
R2 keys;
bypass tokens;
recovery material.

Verifica:

frontera cliente/servidor;
bundle;
React Flight;
source maps;
logs;
workflows;
artefactos;
historial Git;
documentación;
fixtures;
errores;
URLs;
rotación;
scopes;
expiración;
ambiente;
mínimo privilegio;
ownership;
almacenamiento;
backup;
acceso.

No marques la publishable key de Supabase como secreto.

Comprueba criptografía:

algoritmos;
random;
nonces;
IV;
autenticación;
timing-safe;
HMAC;
hash;
salt;
pepper;
KDF;
key reuse;
key rotation;
token entropy;
expiración;
replay.
48. LOGGING, MONITOREO Y DETECCIÓN

Comprueba eventos de:

login;
login fallido;
OTP;
MFA;
recovery code;
cambio de rol;
desactivación;
reembolso;
conciliación;
cambio de estado;
webhook inválido;
replay;
rate limit;
upload rechazado;
acceso denegado;
RLS denial;
cambio de configuración;
exportación;
script destructivo;
backup;
cron;
restore;
cambio de dominio;
cambio de certificado;
despliegue.

Los logs no deben contener:

passwords;
OTP;
cookies;
tokens;
secrets;
URLs firmadas;
PII innecesaria;
bodies completos;
imágenes;
prompts privados;
headers sensibles.

Verifica:

requestId;
userId seguro;
correlación;
timestamps;
integridad;
redacción;
retención;
acceso;
alerts;
dedup;
dead-man;
búsqueda;
investigación;
exportación;
borrado.

Un evento no está cubierto porque se registra.

Debe demostrarse:

detección;
alerta;
entrega;
responsable;
runbook;
escalamiento.
49. RESPUESTA A INCIDENTES

Verifica runbooks para:

secreto filtrado;
cuenta admin comprometida;
dominio secuestrado;
DNS modificado;
certificado inesperado;
Wompi fraudulento;
webhook falso;
PII expuesta;
ransomware;
borrado de DB;
pérdida de Storage;
proveedor caído;
dependencia crítica;
supply-chain compromise;
correo comprometido;
phishing.

Cada runbook debe contener:

detección;
contención;
preservación de evidencia;
rotación;
recuperación;
comunicación;
notificación legal;
verificación;
post-mortem;
responsables;
contactos;
tiempo objetivo.
50. SUPPLY CHAIN Y DEPENDENCIAS

Revisa:

lockfile;
dependencias directas;
transitivas;
postinstall;
build scripts;
allowBuilds;
overrides;
advisories;
CVEs;
reachability;
paquetes abandonados;
typosquatting;
paquetes innecesarios;
integridad del lockfile;
registry;
.npmrc;
SBOM;
provenance;
firmas;
release cadence;
Dependabot;
actualización automática;
majors ignorados;
vulnerabilidades sin parche.

No reportes una CVE como explotable sin evaluar:

versión;
path alcanzable;
configuración;
runtime;
input controlado;
defensa compensatoria.
51. GITHUB Y CI/CD

Verifica configuración real:

repository rulesets;
branch protection;
required reviews;
required status checks;
direct push;
force push;
deletion;
admin bypass;
CODEOWNERS;
signed commits, si aplica;
secrets scanning;
push protection;
Dependabot;
Actions permissions;
fork permissions;
environments;
approval para PRD;
deployment protection;
quién puede desplegar;
audit log.

Revisa workflows:

acciones pineadas por SHA;
permisos;
pull_request_target;
inyección de contexto;
secretos en forks;
command injection;
artifacts;
caches;
logs;
upload/download artifacts;
retención;
service containers;
variables dummy;
ambientes reales;
scripts destructivos;
checkout de código no confiable;
deployments;
concurrency;
cancelación;
rollback.

Verifica expresamente:

si develop acepta push directo;
si production acepta push directo;
si PRD puede desplegar sin revisión;
si todos los gates son obligatorios;
si existe bypass administrativo;
si el commit desplegado pasó exactamente esos gates.
52. CONFIGURACIÓN DE SUPABASE

Verifica:

proyectos;
regiones;
Auth;
redirect URLs;
OTP;
TTL;
password policy;
leaked password protection;
SMTP;
MFA;
rate limits;
sessions;
service role;
publishable key;
RLS;
grants;
exposed schemas;
Storage;
buckets;
Vault;
cron;
pg_net;
logs;
backups;
PITR;
network;
SSL;
advisors;
members;
MFA de miembros;
API settings;
project pause;
quotas.

No confíes únicamente en migraciones.

53. CONFIGURACIÓN DE W0MPI, AVEONLINE, RESEND, CLOUDFLARE Y GEMINI

Para cada proveedor verifica:

propietarios;
usuarios;
MFA;
API keys;
scopes;
entorno;
URLs;
webhooks;
rotación;
logs;
alertas;
IP restrictions, si existen;
dominios;
callbacks;
datos;
región;
retención;
subprocesadores;
SLA;
incidentes;
salida/migración.
54. DATOS, PRIVACIDAD Y RETENCIÓN

Inventaría:

PII;
datos financieros;
direcciones;
teléfonos;
emails;
documentos;
fotografías;
diseños;
IPs;
device data;
logs;
prompts;
respuestas IA;
datos de menores;
datos administrativos.

Para cada dato:

| Dato | Fuente | Finalidad | Ubicación | Acceso | Retención | Eliminación | Backup | Terceros | Protección |

Verifica:

minimización;
acceso;
cifrado;
hashes;
tokenización;
retención;
purga;
eliminación;
anonimización;
backups;
terceros;
account deletion;
archivos;
logs;
datos derivados.

Comprueba que las declaraciones públicas de seguridad y privacidad coincidan con la realidad.

No presentes conclusiones legales definitivas.

Marca lo que requiere abogado colombiano.

55. BACKUPS Y RECUPERACIÓN

Verifica:

backup DB;
backup Storage;
cifrado;
autenticidad;
integridad;
bucket;
access;
credentials;
retención;
lifecycle;
logs;
retries;
alertas;
RPO;
RTO;
restore;
drills;
consistencia DB/Storage;
archivos borrados;
PII;
rotación de keys;
pérdida del proveedor;
corrupción;
ransomware.

Un backup no está verificado hasta restaurarlo.

La restauración debe comprobar:

estructura;
datos;
RLS;
funciones;
crons;
Storage;
hashes;
consistencia;
aplicación.
56. DISPONIBILIDAD Y DENIAL-OF-WALLET

Sin ejecutar DoS, identifica:

endpoints costosos;
búsquedas;
offsets;
filtros;
cache-key explosion;
uploads;
imágenes;
canvas;
ZIP;
previews;
IA;
email;
APIs externas;
pool DB;
crons;
tablas crecientes;
logs;
exportaciones;
backups;
render 3D;
generación server-side.

Evalúa:

timeouts;
limits;
pagination;
concurrency;
circuit breaker;
retry;
backoff;
jitter;
queues;
locks;
resource caps;
billing alerts;
quotas;
graceful degradation.
57. TIEMPO Y CADUCIDADES

Verifica sincronización en:

VM;
Vercel;
PostgreSQL;
Supabase;
cliente;
proveedores.

Evalúa:

UTC;
Colombia;
NTP;
clock skew;
JWT;
TOTP;
OTP;
certificados;
webhooks;
cookies;
crons;
reservas;
cupones;
promociones;
retención;
logs;
conciliación.

Diseña tests con reloj adelantado y atrasado en entornos controlados.

58. PRUEBAS DINÁMICAS

Orden preferido:

LOCAL completo.
STG autorizado.
PRD pasivo o expresamente aprobado.

Para cada operación sensible prueba:

anónimo;
propietario;
usuario diferente;
rol insuficiente;
rol correcto;
admin inactivo;
sesión vencida;
AAL1;
AAL2;
Origin ausente;
Origin inválido;
body inválido;
campos extra;
body grande;
replay;
concurrencia;
ID inexistente;
ID ajeno;
método incorrecto;
Content-Type incorrecto.

Las pruebas de concurrencia deben usar:

volumen bajo;
fixture de prueba;
límite explícito;
cleanup;
evidencia.

Casos prioritarios:

cupón;
último stock;
recovery code;
webhook;
reembolso;
guía;
cron;
token público;
order transition;
email test;
export.
59. HERRAMIENTAS

Usa solamente herramientas instaladas o aprobadas.

Posibles:

Playwright;
Vitest;
curl;
OpenSSL;
dig;
psql;
scripts Node;
gitleaks;
pnpm audit;
Semgrep;
OWASP ZAP;
proxy de interceptación;
testssl;
sslyze;
nmap limitado;
Vercel CLI;
GitHub CLI;
Supabase CLI.

No descargues scanners desconocidos.

No aceptes resultados automáticos sin verificación manual.

60. COMANDOS Y GATES

Inventa primero los scripts reales.

Con dependencias instaladas, ejecuta cuando corresponda:

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm audit --prod

Ejecuta además, si existen:

tests RLS;
E2E;
admin/MFA;
gitleaks;
Lighthouse;
scripts de migración;
restore drill;
security scans existentes.

No ejecutes pnpm install si no es necesario.

Si falta node_modules, solicita aprobación antes de instalar.

Para cada comando registra:

fecha;
entorno;
comando;
exit code;
duración;
resultado;
skips;
fallos;
flakiness;
reintentos;
limitaciones.

CI verde no equivale a seguridad aprobada.

61. CONTROL DE FALSOS POSITIVOS

Antes de aceptar un hallazgo crítico o alto:

intenta refutarlo;
verifica reachability;
verifica versión desplegada;
verifica defensa compensatoria;
ejecuta prueba negativa;
distingue código muerto;
revisa fuente oficial;
reproduce;
solicita verificación independiente.

Si el agente soporta subagentes:

Auditor A: dominio, DNS, TLS y edge.
Auditor B: autenticación, MFA y sesiones.
Auditor C: autorización, RLS y Storage.
Auditor D: pagos y lógica de negocio.
Auditor E: APIs, webhooks y crons.
Auditor F: uploads, navegador e IA.
Auditor G: CI/CD, supply chain e IAM.
Auditor H: logging, backups y recuperación.
Verificador V1: refuta código.
Verificador V2: refuta infraestructura.
Verificador V3: reproduce dinámicamente.
Verificador V4: busca cadenas de ataque.

Un alto o crítico requiere revisión adversarial.

62. CADENAS DE ATAQUE

No analices hallazgos solo de manera aislada.

Busca cadenas como:

CNAME dangling → subdomain takeover → cookies de dominio → sesión;
CMS → XSS → sesión admin → reembolso;
email template → HTML injection → phishing;
CSV export → formula injection → equipo admin;
SSRF → servicio interno → secreto;
upload → procesamiento → agotamiento/RCE;
webhook replay → estado entregado → pérdida COD;
IDOR → diseño o fotografía ajena;
sesión robada → cambio de rol → persistencia;
GitHub → Vercel → PRD;
correo de recuperación → registrador → secuestro;
deployment antiguo → variables PRD → acceso;
backup → exposición masiva;
script de checkout → e-skimming;
varios hallazgos medios → impacto alto.
63. CLASIFICACIÓN

Estados:

CONFIRMADO
CONFIRMADO CON MATIZ
PROBABLE
NO REPRODUCIDO
REFUTADO
REGRESIÓN
DOCUMENTADO, NO VERIFICADO
REQUIERE EVIDENCIA DE PRODUCCIÓN
BLOQUEADO POR ACCESO
RIESGO ACEPTADO
NO APLICA JUSTIFICADO

Severidad:

CRÍTICA
ALTA
MEDIA
BAJA
INFORMATIVA

Confianza:

ALTA
MEDIA
BAJA

Considera bloqueante, entre otros:

bypass de autenticación;
bypass de MFA;
escalamiento;
IDOR entre clientes;
PII significativa;
RCE;
SQL injection;
XSS persistente con impacto admin;
SSRF sensible;
secret PRD;
manipulación de precio;
manipulación de pago;
doble reembolso;
webhook falsificable con impacto;
archivos privados públicos;
branch/deploy sin control;
takeover;
dominio no controlado;
certificado inválido;
TLS inseguro;
backup expuesto;
pérdida de integridad financiera.
64. REGLA DE EVIDENCIA

Cada hallazgo debe contener:

activo;
punto de entrada;
precondiciones;
atacante;
escenario;
evidencia;
resultado;
entorno;
impacto;
causa raíz;
remediación;
prueba de cierre;
detección;
respuesta;
riesgo residual.

Evidencia válida:

archivo y líneas;
símbolo;
commit;
diff;
migración;
query;
policy;
trigger;
función;
comando;
exit code;
request sanitizado;
response sanitizada;
captura;
dashboard;
test;
log redactado.

No uses:

“parece”;
“probablemente”;
“el framework lo maneja”;
“usa buenas prácticas”;
“está documentado”;
“CI pasó”.
65. ENTREGABLE

Crea:

docs/audits/YYYY-MM-DD-auditoria-integral-seguridad-preproduccion.md

El informe debe incluir:

A. Metadatos
fecha;
commits;
ramas;
entornos;
autorizaciones;
herramientas;
limitaciones;
comandos.
B. Veredicto ejecutivo

Uno de:

BLOQUEADO PARA PRODUCCIÓN
PRODUCCIÓN CONDICIONADA
APTO CON RIESGOS RESIDUALES ACEPTADOS

Máximo 15 líneas.

C. Diferencias entre candidato y PRD

| Área | Develop/STG | PRD | Riesgo | Acción |

D. Inventario de activos

Incluye dominio, DNS, certificados, cloud, proveedores, cuentas, aplicación y datos.

E. Arquitectura y trust boundaries

Incluye Mermaid.

F. Superficie de ataque

Conteos, cobertura y exclusiones.

G. Matriz ASVS

| Requisito | Nivel | Aplica | Estado | Evidencia | Gap | Hallazgo |

H. Hallazgos

| ID | Estado | Severidad | Confianza | Activo | Entrada | Ataque | Evidencia | CWE | ASVS | Ambiente | Impacto | Remediación | Prueba de cierre | Bloquea |

I. Ledger de hardening

Incluye todos los puntos bajos e informativos.

J. Cadenas de ataque

Describe combinaciones.

K. Regresiones

| Control histórico | Estado anterior | Estado actual | Evidencia | Regresión |

L. Dominio, DNS y TLS

Incluye todos los hosts y certificados.

M. Infraestructura cloud

Separa:

registrador;
DNS;
Vercel;
GitHub;
Supabase;
Cloudflare;
Wompi;
Aveonline;
Resend;
Gemini.
N. Aplicación

Separa:

Next.js;
auth;
MFA;
RBAC;
RLS;
APIs;
pagos;
uploads;
IA;
browser.
O. Supply chain

Dependencias, workflows y ruta de despliegue.

P. Datos y privacidad

Clasificación, retención, eliminación y terceros.

Q. Detección y respuesta

Para cada ataque importante indica:

prevenido;
detectado;
alertado;
investigable;
recuperable.
R. Backups y DR

Incluye restore probado.

S. Plan de remediación
P0: bloqueante.
P1: necesario antes o inmediatamente después.
P2: defensa en profundidad.
P3: mejora futura.
T. Riesgos residuales

Cada uno con:

propietario;
justificación;
control compensatorio;
fecha de revisión;
criterio de expiración.
U. Evidencia faltante

Checklist exacto para operador.

V. Cobertura honesta
revisado;
no revisado;
bloqueado;
porcentaje;
razón.
66. GATE DE PRODUCCIÓN

Bloquea producción si:

existe crítico abierto;
existe alto abierto;
autorización crítica no verificada;
RLS/grants no verificados;
commit desplegado desconocido;
migraciones críticas pendientes;
branch/ruleset sin control;
webhooks financieros no verificados;
idempotencia no verificada;
backup no restaurado;
secret expuesto;
takeover;
dominio no controlado;
certificado inválido;
renovación no demostrada;
HTTP sin redirect;
TLS obsoleto;
cuenta cloud crítica sin MFA;
excolaborador con acceso;
preview antiguo con acceso PRD;
scripts de pago manipulables;
falta de detección;
evidencia dinámica insuficiente en flujos críticos.

No bloquees automáticamente por:

falta de DNSSEC;
falta de CAA;
falta de OCSP stapling;
falta de security.txt;
falta de MTA-STS;
una calificación externa imperfecta.

Para aprobar exige:

cero críticos;
cero altos;
ASVS nivel 2 aplicable verificado o formalmente aceptado;
controles críticos nivel 3 seleccionados;
matriz de autorización aprobada;
pruebas dinámicas críticas;
infraestructura verificada;
supply chain controlada;
restore probado;
riesgos residuales firmados.
67. DECLARACIÓN DE COMPLETITUD

El informe debe cerrar con:

“Se inventariaron ___ activos externos, ___ dominios/subdominios, ___ certificados,
___ registros DNS relevantes, ___ cuentas cloud, ___ páginas, ___ Server Actions,
___ Route Handlers, ___ webhooks, ___ crons, ___ tablas, ___ políticas RLS,
___ buckets, ___ proveedores y ___ controles operativos.
Quedaron ___ elementos no verificados, enumerados individualmente en la sección ___.”

No puede utilizarse “APTO” si queda un activo crítico desconocido.

68. VALIDEZ DE LA AUDITORÍA

Define:

fecha de auditoría;
commits;
entornos;
configuraciones;
periodo de validez.

La auditoría debe repetirse o revalidarse ante:

nuevo dominio;
nuevo subdominio;
cambio de registrador;
cambio DNS;
cambio de CA;
cambio de certificado;
nuevo proveedor;
nueva integración;
nuevo rol;
nueva tabla;
nueva policy;
nueva Server Action;
nueva API;
cambio de pagos;
cambio de auth;
cambio de MFA;
cambio de checkout;
cambio CI/CD;
dependencia crítica;
incidente;
secreto filtrado;
cambio de propietario;
migración de infraestructura.
69. REVISIÓN DE “UNKNOWN UNKNOWNS”

Al terminar, ejecuta una revisión independiente dedicada únicamente a responder:

¿Qué no estamos viendo?
¿Qué no vive en Git?
¿Qué asumimos del proveedor?
¿Qué depende de una cuenta personal?
¿Qué puede expirar?
¿Qué servicio puede ser reclamado?
¿Qué secret no rota?
¿Qué control solo está escrito?
¿Qué ocurre si el administrador principal no está?
¿Qué ataque no generaría alerta?
¿Qué dato no podría restaurarse?
¿Qué operación financiera no se reconcilia?
¿Qué subdominio no tiene propietario?
¿Qué script puede alterar checkout?
¿Qué cambio futuro invalidaría esta auditoría?
¿Qué riesgo pequeño podría encadenarse con otro?
¿Qué escenario todavía no fue intentado?

Usa un revisor distinto del auditor principal.

70. FASE B — REMEDIACIÓN

Cuando se autoricen IDs:

Antes de modificar entrega:

IDs;
causa raíz;
archivos;
migraciones;
datos;
riesgos;
plan;
pruebas;
despliegue;
rollback.

Después entrega:

diff;
test que fallaba;
test que pasa;
comandos;
retest;
impacto;
documentación;
riesgo residual.

No marques cerrado porque el código “parece correcto”.

Cada cierre requiere evidencia.

71. PRINCIPIO FINAL

No busques producir muchos hallazgos.

Busca descubrir las rutas de ataque que realmente puedan comprometer LuCam’s.

No confirmes las suposiciones del propietario.

No confirmes auditorías históricas.

No confíes ciegamente en frameworks, proveedores, documentación o tests.

Empieza desde Internet.

Verifica el dominio.

Verifica DNS.

Verifica certificados.

Verifica cuentas.

Verifica despliegues.

Verifica el navegador.

Verifica cada punto de entrada.

Verifica autorización.

Verifica pagos.

Verifica datos.

Verifica detección.

Verifica backups.

Intenta refutar tus propios hallazgos.

Detente al finalizar FASE A y espera aprobación antes de corregir.
```
