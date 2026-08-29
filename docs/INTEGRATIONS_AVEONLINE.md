# Dossier Aveonline — referencia técnica completa

> **Fecha de creación.** 2026-05-21
> **Autor.** Compaginación auto-investigación profunda (web research oficial + auditoría código repo + probes contra cuenta real).
> **Vigencia.** Confirmar mensualmente contra `https://integraciones.aveonline.co/docs/` — Aveonline modifica endpoints sin notificación previa.
> **Status.** Working document. Toda discrepancia entre este doc y la API real se reporta como issue + se actualiza este archivo + se versiona en `docs/DECISIONS.md`.

---

## 0. TL;DR — Hallazgo crítico

**El error 999 que vemos en producción NO es por credenciales ni por cuenta sin activar.** Es porque el código del repo (`apps/web/features/shipping/aveonline.ts:97-111`) usa el endpoint `tipo: "cotizar2"` que cotiza **una sola** transportadora pasada en `idtransportador`. Cuando esa transportadora no cubre el trayecto o no está habilitada en la cuenta → `numbererror: "999"`.

**Verificación contra cuenta real (probe 2026-05-21, cuenta `crittan01@gmail.com`):**

Con `cotizarDoble` + formato `BOGOTA(CUNDINAMARCA)` uppercase + valorDeclarado ≥10.000 COP, ruta Bogotá→Medellín, 1 set 6 fotoimanes (peso 0.5kg, 15×10×3cm):

| Transportadora                                          |   total | días | Estado                                   |
| ------------------------------------------------------- | ------: | ---: | ---------------------------------------- |
| ENVIA                                                   | $15.691 |    2 | ✅ ok                                    |
| COORDINADORA MERCANTIL                                  | $16.501 |    3 | ✅ ok                                    |
| TCC SA                                                  | $17.004 |    1 | ✅ ok                                    |
| SERVIENTREGA                                            | $17.575 |    3 | ✅ ok                                    |
| SAFERBO, Domina, MOOVA, 99MINUTOS, GINTRACOM, Go Envios |       — |    — | ❌ 999 (no cubren ruta o no contratadas) |

**Acción.** Migrar el provider de `cotizar2` → `cotizarDoble` y filtrar cotizaciones con `numbererror !== "-0-"` antes de retornar al cliente. Detalle en §17 Plan de ajustes.

---

## 1. URL base, ambientes, contacto

| Item                           | Valor                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL canónica              | `https://app.aveonline.co/api`                                                                                                                                   |
| Base URL legacy (coexiste)     | `https://aveonline.co/api/...`                                                                                                                                   |
| Portal de documentación        | `https://integraciones.aveonline.co/docs/`                                                                                                                       |
| Soporte integraciones técnicas | `desarrollo1@aveonline.co`                                                                                                                                       |
| PQR / reclamos                 | `pqr@aveonline.co`                                                                                                                                               |
| Sandbox / staging dedicado     | **NO EXISTE**. Las pruebas se hacen contra producción con la cuenta del cliente. Uso de `bloquegenerarguia: "0"` permite simular generación de guía sin facturar |
| Asesor logístico asignado      | Campo `asesorlogistico` + `nombreasesor` en respuesta de auth (uno por cuenta)                                                                                   |

---

## 2. Autenticación

### 2.1 v1.0 (legacy, vigente — la que usamos)

| Campo                    | Valor                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| URL                      | `POST https://app.aveonline.co/api/comunes/v1.0/autenticarusuario.php`                                                  |
| Header                   | `Content-Type: application/json`                                                                                        |
| Vigencia token doc       | **1 hora**                                                                                                              |
| Vigencia token extendida | Si se envía `tiempoToken` en el body se alarga (npm oficial usa `100000` seg, plugin WooCommerce usa `365 * 86400` seg) |
| Refresh                  | No hay refresh token — se vuelve a autenticar                                                                           |

**Request body:**

```json
{
  "tipo": "auth",
  "usuario": "<login>",
  "clave": "<password>",
  "acceso": "ecommerce",
  "tiempoToken": 100000
}
```

**Response (ok):**

```json
{
  "status": "ok",
  "message": "usuario encontrado",
  "token": "eyJ0eXAi...",
  "cuentas": [{
    "servicio": "...",
    "usuarios": [{
      "id": <idempresa>,
      "documento": "...",
      "usuario": "...",
      "nombre": "...",
      "razon": "...",
      "asesorlogistico": "...",
      "nombreasesor": "..."
    }]
  }]
}
```

> **CRÍTICO:** `idempresa = cuentas[0].usuarios[0].id`. No es campo top-level.

**Errores comunes:**

| Caso                                 | Respuesta                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Sin coincidencia                     | `{"status":"error","message":"No se encontraron resultados"}`                                |
| Password mala                        | `status: ok`, `message: "usuario encontrado"`, **pero `cuentas: []`** — chequear array vacío |
| Token expirado en endpoint posterior | `message: "credenciales incorrectas"` o `autenticacion fallida`                              |

### 2.2 v2.0 (token 12h)

| Campo    | Valor                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| URL      | `POST https://app.aveonline.co/api/comunes/v2.0/autenticarusuario.php`                                             |
| `tipo`   | `authV2`                                                                                                           |
| Vigencia | 12h (contradicción en doc: título dice 12h, body dice 1h — **pendiente verificar con `desarrollo1@aveonline.co`**) |

### 2.3 v3.0 (AveCRM "AuthProduct")

| Campo         | Valor                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| URL           | `POST https://app.aveonline.co/api/auth/v3.0/index.php`                                                                   |
| `tipo`        | `AuthProduct`                                                                                                             |
| Body          | `{ user, password, tiempoToken }` (campos `user`/`password`, no `usuario`/`clave`)                                        |
| Response útil | Incluye `data.moneyCollectionService`, `data.onlyCounterDelivery` → permite saber si la cuenta tiene COD activo sin probe |

---

## 3. Cotización de envío nacional

### 3.1 Endpoint

| Campo   | Valor                                                                          |
| ------- | ------------------------------------------------------------------------------ |
| URL     | `POST https://app.aveonline.co/api/nal/v1.0/generarGuiaTransporteNacional.php` |
| Método  | `POST`                                                                         |
| Headers | `Content-Type: application/json`                                               |

> Mismo endpoint genérico se usa para múltiples operaciones (cotización, generación de guía, recogida). El discriminador es `tipo`.

### 3.2 Variantes de `tipo` para cotizar

| `tipo`             | Comportamiento                                                                                 | Quién lo usa                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **`cotizarDoble`** | Cotiza **todas** las transportadoras habilitadas en la cuenta + variantes contraentrega/normal | Plugin WooCommerce oficial (recomendado)                                             |
| `cotizar2`         | Cotiza **una sola** transportadora indicada en `idtransportador`                               | Doc oficial Aveonline. **Usado por el código actual de Lucams_shop — causa del 999** |
| `cotizar`          | Legacy v1                                                                                      | —                                                                                    |

### 3.3 Body completo `cotizarDoble` (RECOMENDADO)

```json
{
  "tipo": "cotizarDoble",
  "access": "",
  "token": "<jwt>",
  "idempresa": <number>,
  "idagente": "<idAgente>",
  "origen": "BOGOTA(CUNDINAMARCA)",
  "destino": "MEDELLIN(ANTIOQUIA)",
  "idasumecosto": 0,
  "contraentrega": 0,
  "contraentregaPayment": 0,
  "valorrecaudo": 0,
  "valorMinimo": 0,
  "productos": [{
    "alto": 10, "largo": 20, "ancho": 5,
    "peso": 0.5,
    "unidades": 1,
    "nombre": "Producto X",
    "valorDeclarado": 50000
  }],
  "plugin": "lucamsshop"
}
```

### 3.4 Body completo `cotizar2`

Mismos campos que `cotizarDoble` **+ `idtransportador` obligatorio**. Si `idtransportador` no está activo en la `idempresa` o no cubre el trayecto → error 999.

### 3.5 Parámetros opcionales clave

| Param                  | Tipo         | Importancia                                                                                                                                                            |
| ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idagente`             | string       | Define el agente origen (dirección de despacho registrada en Aveonline). **En `cotizarDoble` es requerido** según la doc; sin él algunas transportadoras devuelven 999 |
| `access`               | string vacío | Compatibilidad legacy                                                                                                                                                  |
| `contraentregaPayment` | 0/1          | Define lógica de pago en COD                                                                                                                                           |
| `valorMinimo`          | 0/1          | Si tu cuenta tiene valoración mínima negociada                                                                                                                         |
| `plugin`               | string libre | Identificador de origen para analytics de Aveonline                                                                                                                    |
| `unidades`             | number       | Default 1                                                                                                                                                              |

### 3.6 Response schema

```json
{
  "status": "ok",
  "message": "cotizaciones encontradas",
  "cotizaciones": [
    {
      "numbererror": "-0-",
      "dataerror": "",
      "codTransportadora": "29",
      "nombreTransportadora": "ENVIA",
      "logoTransportadora": "https://app.aveonline.co/.../ENVIA.jpg",
      "logoTransportadora2": "https://.../envia.png",
      "origen": "BOGOTA(CUNDINAMARCA)",
      "destino": "MEDELLIN(ANTIOQUIA)",
      "unidades": "1",
      "kilos": 3,
      "pesovolumen": 1,
      "valoracion": "20000",
      "porcentajeValoracion": "1",
      "codigoTrayecto": "8",
      "trayecto": "nacional",
      "tipoEnvio": "Mensajeria",
      "fletexkilo": 13488,
      "fletexunidad": 13488,
      "fletetotal": 13488,
      "diasentrega": "1",
      "costoManejo": 200,
      "valorTotal": 13688,
      "valorOtrosRecaudos": 0,
      "total": 13688,
      "contraentrega": false
    }
  ]
}
```

> El campo a usar para mostrar precio al cliente es `total` (en COP entero, no centavos). Aveonline puede devolver strings donde deberían ser números (`"unidades":"1"`, `"diasentrega":"1"`) — parseo defensivo obligatorio.

### 3.7 Tabla `numbererror` (cotización)

| Code    | Significado                                      | Acción                                                                                                                                                                                     |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-0-`   | OK                                               | Pasar al cliente                                                                                                                                                                           |
| `-1`    | Origen no existe en catálogo                     | Validar contra `listadociudades.json`                                                                                                                                                      |
| `-2`    | Destino no existe                                | Idem                                                                                                                                                                                       |
| `-3`    | Peso ≤ 0                                         | Validar productos                                                                                                                                                                          |
| `-4`    | Unidades ≤ 0                                     | Idem                                                                                                                                                                                       |
| `-5`    | `valorDeclarado < 10000`                         | Forzar mínimo $10.000 COP                                                                                                                                                                  |
| `-6`    | Unidades exceden máximo                          | —                                                                                                                                                                                          |
| `-7`    | Kilos exceden máximo                             | —                                                                                                                                                                                          |
| `-999`  | **Servicio no configurado / trayecto inválido**  | Filtrar de la respuesta. Causa: `idtransportador` no habilitado, `idagente` faltante, trayecto sin cobertura para ese carrier, o peso/dims fuera de rango específico para esa ruta-carrier |
| `-1000` | Config / ruta con límites por par origen-destino | —                                                                                                                                                                                          |

### 3.8 Endpoint adicional — Listar transportadoras habilitadas

| Campo                | Valor                                                                              |
| -------------------- | ---------------------------------------------------------------------------------- |
| URL                  | `POST https://app.aveonline.co/api/box/v1.0/transportadora.php`                    |
| Body                 | `{ "tipo":"listarTransportadorasPorEmpresa", "token":"<jwt>", "id": <idempresa> }` |
| Variante autenticada | `tipo: "listarTransportadorasPorEmpresaAuth"`                                      |
| Response             | `{ status:"ok", transportadoras: [{ id, text, imagen, imagen2 }] }`                |

**Verificado contra cuenta real 2026-05-21** — cuenta `crittan01@gmail.com` tiene 6 transportadoras habilitadas: 99MINUTOS, COORDINADORA MERCANTIL, ENVIA, GO ENVIOS, SERVIENTREGA, TCC SA.

### 3.9 Carriers integrados con Aveonline (catálogo conocido)

`id`s NO son globales — varían por cuenta. Esta lista es orientativa, debe pedirse via `listarTransportadorasPorEmpresa`:

| Carrier                                 | `codTransportadora` ejemplo en doc |
| --------------------------------------- | ---------------------------------- |
| ENVIA                                   | `29`                               |
| SERVIENTREGA                            | `33`                               |
| TCC SA                                  | `1010`                             |
| COORDINADORA MERCANTIL                  | `1009`                             |
| 99MINUTOS                               | `1028`                             |
| GO ENVIOS                               | `1031`                             |
| DOMINA, SAFERBO, INTERRAPIDISIMO, MOOVA | asignados por cuenta               |
| DHL                                     | solo internacional                 |

### 3.10 Restricciones documentadas

| Item                    | Límite                                       |
| ----------------------- | -------------------------------------------- |
| `valorDeclarado` mínimo | **10.000 COP** (numbererror -5)              |
| Peso mínimo             | > 0 (AveCRM auto-ajusta a 1 kg si menor)     |
| Peso máximo             | Depende de transportadora (numbererror -7)   |
| Unidades máximas        | Depende (numbererror -6)                     |
| Dimensiones             | Opcionales pero usadas para peso volumétrico |

---

## 4. Generación de guía

### 4.1 Endpoint

| Campo                    | Valor                                                                          |
| ------------------------ | ------------------------------------------------------------------------------ |
| URL                      | `POST https://app.aveonline.co/api/nal/v1.0/generarGuiaTransporteNacional.php` |
| `tipo`                   | `generarGuia2`                                                                 |
| Vigencia token requerido | 1h (o lo configurado en `tiempoToken`)                                         |

### 4.2 Body completo (verbatim del plugin WooCommerce + doc oficial)

| Campo                 | Tipo   | Notas                                                             |
| --------------------- | ------ | ----------------------------------------------------------------- |
| `tipo`                | string | `"generarGuia2"`                                                  |
| `token`               | string | JWT auth                                                          |
| `idempresa`           | number | `cuentas[0].usuarios[0].id`                                       |
| `codigo`              | string | login (puede ir `""`)                                             |
| `dsclavex`            | string | password (puede ir `""`)                                          |
| `plugin`              | string | identificador fuente                                              |
| `origen`              | string | ciudad o codigoDANE                                               |
| `dsdirre`             | string | dirección remitente                                               |
| `dsbarrioo`           | string | barrio remitente                                                  |
| `dsnitre`             | string | NIT remitente                                                     |
| `dstelre`             | string | tel fijo                                                          |
| `dscelularre`         | string | celular                                                           |
| `dscorreopre`         | string | email remitente                                                   |
| `dsnombre`            | string | nombre remitente                                                  |
| `destino`             | string | ciudad destino                                                    |
| `IdTipoEntrega`       | string | `"1"` domicilio, `"2"` oficina                                    |
| `dsdir`               | string | dirección destino (concat de campos)                              |
| `dsbarrio`            | string | barrio destino                                                    |
| `dsnit`               | string | cédula destinatario (**obligatorio si `valorrecaudo > 0`**)       |
| `dsnombrecompleto`    | string | nombre completo destinatario                                      |
| `dscorreop`           | string | email destinatario                                                |
| `dstel`               | string | tel destinatario                                                  |
| `dscelular`           | string | celular destinatario                                              |
| `idtransportador`     | string | ID transportadora elegida en cotización (`codTransportadora`)     |
| `idagente`            | string | agente Aveonline origen                                           |
| `unidades`            | number | bultos totales                                                    |
| `productos[]`         | array  | `{alto,largo,ancho,peso,unidades,nombre,valorDeclarado}`          |
| `dscontenido`         | string | contenido del paquete                                             |
| `dscom`               | string | comentario libre                                                  |
| `valorrecaudo`        | number | monto COD (0 si normal) **— en COP entero, no centavos**          |
| `contraentrega`       | 0/1    | flag COD                                                          |
| `idasumecosto`        | 0/1    | quién paga flete                                                  |
| `bloquegenerarguia`   | string | `"1"` para generar guía real, **`"0"` para simular sin facturar** |
| `relacion_envios`     | string | `"1"` para asociar a relación de envíos (necesario para recogida) |
| `enviarcorreos`       | string | `"1"` Aveonline envía email auto al destinatario                  |
| `cartaporte`          | string | `"1"` para viaje de retorno                                       |
| `valorMinimo`         | 0/1    | aplica valoración mínima                                          |
| `numeroFactura`       | string | número factura interno                                            |
| `numeroBolsa`         | string | bolsa TCC                                                         |
| `dsfecha_vencimiento` | string | `YYYY/MM/DD`                                                      |
| `dsfecha_cita`        | string | `YYYY/MM/DD`                                                      |
| `dscodigo_cita`       | string | código cita                                                       |
| `dsvalor_pedido`      | string | valor pedido (referencia DIAN)                                    |
| `envioGratis`         | 0/1    | marca para reporting                                              |

### 4.3 Response (ok)

```json
{
  "status": "ok",
  "message": "proceso correcto",
  "resultado": {
    "guia": {
      "codigo": "0",
      "mensaje": "Guia <N> Generada",
      "numguia": <number>,
      "rutaguia": "<URL PDF rótulo>",
      "archivoguia": "<código>",
      "rotulo": "<URL label>",
      "archivorotulo": "<base64 PDF>",
      "rotulozebra": "<URL Zebra>",
      "archivorotulozebra": "<código>",
      "transportadora": "<nombre carrier>",
      "rutasticker": "<URL sticker térmico 110x120>",
      "archivosticker": "<base64>"
    }
  }
}
```

Persistir en Order:

- `trackingNumber = numguia.toString()`
- `labelUrl = rutasticker ?? rutaguia` (preferir térmico)
- `trackingUrl = rutaguia ?? rutasticker`
- `archivorotulo` (base64 PDF) → guardar en Supabase Storage para impresión offline

### 4.4 Errores comunes generación guía

| Code   | Mensaje                                                   |
| ------ | --------------------------------------------------------- |
| `-1`   | Origen no existe                                          |
| `-2`   | Destino no existe                                         |
| `-3`   | Peso negativo                                             |
| `-4`   | Unidades negativo                                         |
| `-5`   | Valor declarado negativo                                  |
| `-6`   | Nombre remitente faltante                                 |
| `-7`   | Dirección remitente faltante                              |
| `-8`   | Tel remitente faltante                                    |
| `-9`   | Nombre destinatario faltante                              |
| `-11`  | Dirección destinatario faltante                           |
| `-12`  | Tel destinatario faltante                                 |
| `-13`  | Email destinatario faltante                               |
| `-14`  | Transportadora no existe (≠ 999 — aquí el id es inválido) |
| `-15`  | Falta contenido del paquete                               |
| `-16`  | NIT remitente faltante                                    |
| `-17`  | No se pudo generar la guía                                |
| `-998` | Cliente no existe en el sistema                           |

Errores no numéricos comunes:

- `"no se encontraron productos"`
- `"credenciales incorrectas"` (token venció)
- `"se produjo un error al momento de iniciar la comunicacion"` (Aveonline → transportadora)

---

## 5. Recogidas

### 5.1 Endpoint

| Campo  | Valor                                                                          |
| ------ | ------------------------------------------------------------------------------ |
| URL    | `POST https://app.aveonline.co/api/nal/v1.0/generarGuiaTransporteNacional.php` |
| `tipo` | `generarRecogida2`                                                             |

### 5.2 Body

```json
{
  "tipo": "generarRecogida2",
  "token": "<jwt>",
  "idempresa": <number>,
  "idagente": "<idAgente>",
  "guias": [<numguia1>, <numguia2>],
  "dscom": "Comentario libre"
}
```

### 5.3 Response

```json
{
  "respuestasRecogida": [{
    "horaInicial": "08:00",
    "horaFinal": "17:00",
    "status": "ok",
    "message": "...",
    "details": {
      "codigo": "0",
      "mensaje": "...",
      "codigoRecogida": "...",
      "numeroRecogidaInterna": "...",
      "numeroRecogidaTransportadora": "..."
    },
    "guias": [...]
  }]
}
```

### 5.4 Cutoff y días

**NO ENCONTRADO en la doc oficial 2026-05-21** — la ventana de recogida la devuelve la respuesta (`horaInicial`/`horaFinal`) por carrier. El cutoff 11 a.m. asumido en ADR-039 es acuerdo con ejecutivo Aveonline, no impuesto por la API.

> Pendiente: validar con el ejecutivo el cutoff real por carrier.

---

## 6. Tracking / estado de envío

### 6.1 Endpoint pull (consulta puntual)

| Campo  | Valor                                                 |
| ------ | ----------------------------------------------------- |
| URL    | `POST https://app.aveonline.co/api/nal/v1.0/guia.php` |
| `tipo` | `obtenerEstadoAuth`                                   |

**Body:**

```json
{ "tipo":"obtenerEstadoAuth", "token":"<jwt>", "id":<idempresa>, "guia":"<numguia>" }
```

**Response:** incluye `guias[]` con `estado`, `rutadigitalizada` (URL al tracking del carrier), y `historicos[]` con `{estado, fechamostrar, descripcion}`.

### 6.2 Webhook AveCRM (recomendado para e-commerce)

> **Actualización 2026-08-11 (registro actual del webhook de Lucams):** el registro hoy es
> **Webhook Personalizado** — por panel (guias.aveonline.co/panel/mis-integraciones → tipo
> "Webhook Personalizado", URL + Token que Aveonline re-envía como `payload.token` en cada
> notificación, docs oficiales `webhookEstadosGuias` / `webhookPersonalizadoApi`). El endpoint
> propio (`/api/webhooks/aveonline`) valida header `x-aveonline-secret` / `payload.token`.
> **La vía `?secret=` quedó DESHABILITADA por defecto (auditoría 2026-08-24, D-1)**: viaja en
> logs de infraestructura. Solo se acepta con `AVEONLINE_ALLOW_QUERY_SECRET=true` (puente
> transitorio si el panel quedó registrado con `?secret=` — verificar y reconfigurar).
> **Gap confirmado de la API nueva:** los hosts nuevos (`api.aveonline.co`,
> `envios.api.aveonline.co`) RECHAZAN el JWT legacy de `autenticarusuario.php`
> ("Incorrect key for this algorithm", firebase/php-jwt) — el alta/lectura vía
> `api-integrations/…/custom-webhook` NO es usable con nuestras credenciales hoy; se registró
> por panel. También quedó verificado en vivo: PRD acepta el token nuevo (200) y rechaza falsos
> (401); STG end-to-end FULFILLING→SHIPPED por evento simulado.

| Campo              | Valor                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL de registro    | `POST https://app.aveonline.co/avestock/api/createWebhook.php`                                                                                                                                        |
| Body registro      | `{ "tipo":"authave", "empresa":<id>, "url":"<tu URL pública>", "param1_name":"...", "param1_value":"...", ...hasta param4 }`                                                                          |
| Verificación firma | **HMAC NO documentado.** Solo los `paramN` custom que tú defines viajan en cada request como secreto compartido. Mitigación: usar `param1_name: "secret"` con valor random largo, validar server-side |

### 6.3 Webhook plugin legacy WooCommerce

| Campo                         | Valor                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| URL Aveonline                 | `POST https://app.aveonline.co/api/nal/v1.0/plugins/wordpress.php`                 |
| `tipo`                        | `guardarPedidos`                                                                   |
| Body que se manda a Aveonline | `{ tipo, cliente_id, ruta:"<tu URL>", guia, pedido_id, transportadora_id }`        |
| Payload entrante a tu URL     | `{ status, message, guia, pedido_id, estado:[{estado_id, nombre_estado, fecha}] }` |

Ejemplo payload entrante:

```json
{ "estado_id": 12, "nombre_estado": "ENTREGADA", "fecha": "2020-12-11 11:04:43" }
```

### 6.4 Estados posibles

Aveonline explícitamente dice "el contenido y formato es definido por el proveedor" → cada transportadora puede mandar estados distintos. Estados vistos en muestras y plugins:

`EN OFICINA`, `EN RECOGIDA`, `RECOGIDA`, `EN BODEGA`, `EN TRANSITO`, `EN REPARTO`, `EN ENTREGA`, `EN NOVEDAD`, `ENTREGADA`, `DEVOLUCION`, `DEVUELTA`.

Novedades comunes: `DIRECCION ERRONEA`, `CLIENTE NO TIENE EFECTIVO`, `CLIENTE AUSENTE`, `RECHAZA PRODUCTO`.

> Mapping recomendado a estados internos Lucams `{pendiente, en_transito, entregado, novedad, devuelto}` configurable, no hardcoded.

### 6.5 Webhook tramas operadores (proveedor — no aplica para nosotros)

URL `https://aveonline.co/api/hooks/tramaoperador.php`. Es el endpoint que las transportadoras llaman a Aveonline, no al revés.

---

## 7. Contraentrega (COD)

### 7.1 Habilitación por guía

- `contraentrega: 1` en body de `generarGuia2` y `cotizarDoble`
- `valorrecaudo: <COP a recaudar>` (entero, NO centavos — Aveonline maneja COP entero)
- `idasumecosto`: si vendedor asume comisión (1) o se descuenta del recaudo (0)
- `contraentregaPayment`: variante extra (uso exacto no documentado)

### 7.2 Comisiones y tiempos de liquidación

| Carrier         | Liquidación COD                    | Días pago        | Cobra devolución |
| --------------- | ---------------------------------- | ---------------- | ---------------- |
| TCC             | 4–6 días hábiles                   | martes y viernes | NO               |
| DOMINA          | 4–6 días hábiles                   | martes y viernes | NO               |
| SERVIENTREGA    | 7–11 días hábiles                  | viernes          | NO               |
| ENVIA           | 7–11 días hábiles (contrato 9–15)  | viernes          | **SÍ**           |
| INTERRAPIDISIMO | 7–11 días hábiles (contrato 13–19) | viernes          | NO               |
| SAFERBO         | 7–11 días hábiles                  | viernes          | NO               |
| COORDINADORA    | 5–11 días hábiles (contrato 5–14)  | —                | **SÍ**           |
| MOOVA           | —                                  | —                | NO               |

> **Discrepancia entre sitio comercial y contrato.** Para SLA productivo usar rangos del contrato (más conservadores). Fuente comercial: `aveonline.co/servicios-pago-contraentrega/`. Fuente contractual: `app.aveonline.co/app/contrato/terminosCondiciones.html`.

### 7.3 Comisión

- **Desde 2.40% sobre el monto recaudado**, variable por carrier (sitio comercial).
- Comisión se cobra incluso si el envío fue **devuelto** (cláusula contractual).
- No hay mínimo de envíos para activar COD.

### 7.4 Cobertura COD

NO hay endpoint que liste "ciudades con COD". Método: cotizar con `contraentrega: 1` y verificar qué transportadoras devuelven cotización válida.

### 7.5 Endpoints reporting COD

**NO ENCONTRADO endpoint público para histórico de recaudos.** El dashboard `app.aveonline.co` tiene módulo "Estado de cuenta / Recaudos" pero no hay API.

> **ACCIÓN HUMANA REQUERIDA:** descargar reporte semanal manual desde dashboard hasta que Aveonline exponga API.

### 7.6 Facturación

- Aveonline factura **cada miércoles** con plazo de 8 días calendario para pago.
- Pago a Aveonline: transferencia Bancolombia, tarjeta crédito, o compensación con recaudos.
- **Si cliente es Bancolombia, sin mensualidad** (fuente: aveonline.co).

---

## 8. Cancelación de guía

### 8.1 Eliminar relación de envíos

| Campo  | Valor                                                                                     |
| ------ | ----------------------------------------------------------------------------------------- |
| URL    | `POST https://app.aveonline.co/api/nal/v2.0/generarGuiaTransporteNacional.php`            |
| `tipo` | `eliminarRelacionEnvios`                                                                  |
| Body   | `{ "tipo":"eliminarRelacionEnvios", "usuario":"<login>", "numeroRelacionEnvios":"<id>" }` |
| Header | `Authorization: <token v2>` (única ruta que usa Authorization header)                     |

### 8.2 Cancelar guía individual

**NO existe endpoint público para anular una guía individual ya generada.**

Práctica:

- Si guía NO ha sido manifestada/recogida → eliminar la relación de envíos la "desactiva" lógicamente
- Si ya fue recogida → no se puede cancelar; queda como devolución natural (auto-return tras 3 intentos fallidos según contrato)
- Modificar dirección post-creación: no hay endpoint público → escribir a `pqr@aveonline.co` con número de guía

---

## 9. Devoluciones

Reglas del contrato:

- Máximo **3 días hábiles** para dar solución a una novedad; pasado el plazo → devolución automática al remitente
- Devolución se entrega en la dirección del remitente registrada en la guía. Cambiar dirección = cobro adicional
- Si guía era de **crédito** → devolución cuesta lo mismo que el flete original
- Si guía era **COD** → no se cobra comisión de recaudo (porque no hubo recaudo), pero sí flete devolución según carrier (ENVIA y COORDINADORA cobran)
- Daños/averías: reclamar dentro de **16 horas** con evidencia fotográfica
- Extravíos: reportar tras **3 días sin actualización de tracking**

> **NO ENCONTRADO endpoint API específico para devoluciones.** Gestión vía PQR.

---

## 10. Cobertura geográfica

### 10.1 Endpoint listado de ciudades (API)

| Campo  | Valor                                                    |
| ------ | -------------------------------------------------------- |
| URL    | `POST https://app.aveonline.co/api/box/v1.0/ciudad.php`  |
| `tipo` | `listar`                                                 |
| Body   | `{ "tipo":"listar", "data":"<query>", "registros":<N> }` |

### 10.2 JSON estático público (RECOMENDADO)

| Campo         | Valor                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL           | `https://app.aveonline.co/assets/resources/public/listadociudades.json`                                                                                 |
| Auth          | NO requiere                                                                                                                                             |
| Tamaño        | ~255 KB                                                                                                                                                 |
| Last-Modified | 2024-06-18                                                                                                                                              |
| Schema        | `[{ "codigodane": "11001000", "nombre": "BOGOTA(CUNDINAMARCA)", "departamento":"CUNDINAMARCA", "nombremun":"BOGOTA", "codigocortodane":"11001" }, ...]` |

### 10.3 Formato de ciudad

Aveonline acepta **ambos** formatos en `origen`/`destino`:

- Nombre formateado: `"BOGOTA(CUNDINAMARCA)"` — UPPERCASE, sin tilde, sin "D.C."
- codigoDANE 8 dígitos: `"11001000"`

> Bogotá D.C. aparece como `"BOGOTA(CUNDINAMARCA)"`. ~4.500 ciudades/centros poblados.

### 10.4 Recomendación de implementación

1. Descargar `listadociudades.json` en build o job semanal `pg_cron`
2. Indexar en Postgres por `codigodane` (PK) y `nombre` (búsqueda)
3. **No mezclar con DANE divipola** (Lucams_shop ya usa divipola en checkout). Mapear `lucams.divipola → aveonline.ciudad` por `codigocortodane` (primeros 5 dígitos)

---

## 11. Tarifas y planes

| Item                                  | Dato                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Mínimo de envíos                      | NO requiere                                                                                  |
| Mínimo para COD                       | NO requiere                                                                                  |
| Tarifas auto-configuradas             | NO — al abrir cuenta debes elegir uno de **3 planes mensuales** + FEE empieza el segundo mes |
| Cliente Bancolombia                   | Sin mensualidad                                                                              |
| Comisión COD                          | Desde 2.40%, variable por carrier                                                            |
| FEE plan                              | Variable, no publicado                                                                       |
| Endpoint para listar tarifas vigentes | **NO ENCONTRADO** — la cotización es la única fuente de verdad                               |

**Garantía de tarifa.** El `total` en cotización es vinculante mientras el JWT no expire y el peso/dimensiones de la guía coincidan con lo cotizado. Si el peso real al despacho difiere → reajuste retroactivo en factura semanal (cláusula contractual).

---

## 12. Producción vs sandbox / ambiente de pruebas

> **Confirmación 2026-05-21 vía investigación exhaustiva + probe en vivo.** No existe un host sandbox dedicado (`sandbox.aveonline.co`, `test.aveonline.co`, etc. — todos `NO_DNS`). El mecanismo oficial de pruebas que el equipo de desarrollo de Aveonline confirmó verbalmente y que está documentado es:

### 12.1 Cuenta DEMO pública

| Campo                                       | Valor                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| URL doc                                     | https://integraciones.aveonline.co/docs/nacional/autenticacion/                               |
| `usuario`                                   | **`demointegracion`**                                                                         |
| `clave`                                     | **`demointegra2021`**                                                                         |
| `idempresa`                                 | **15289**                                                                                     |
| Razón social                                | "Demo - Integracion"                                                                          |
| Servicio                                    | AVEONLINE COURIER                                                                             |
| Endpoint auth                               | `POST https://app.aveonline.co/api/comunes/v1.0/autenticarusuario.php` (mismo que prod)       |
| Transportadoras activas (probe 2026-05-21)  | 7: ENVIA, COORDINADORA MERCANTIL, TCC SA, SERVIENTREGA, INTERRAPIDISIMO, 99MINUTOS, GO ENVIOS |
| Cotización Bogotá→Medellín set 6 fotoimanes | 4 ok reales: COORDINADORA $15.930 / ENVIA $16.350 / SERVIENTREGA $17.650 / TCC $18.300        |
| Costo de uso                                | $0 — guías que no se manifiestan no se facturan                                               |

### 12.2 Flag dry-run `bloquegenerarguia`

| Valor | Comportamiento                                                 |
| ----- | -------------------------------------------------------------- |
| `"0"` | **Modo simulación**. No genera guía real, no factura.          |
| `"1"` | **Modo productivo**. Genera guía real, factura según contrato. |

Único parámetro documentado tipo "dry-run" en toda la API. Doc oficial: https://integraciones.aveonline.co/docs/nacional/generacionGuia/ → _"Si desea generar la guia: 1. Si no: 0"_.

### 12.3 Implementación en Lucams_shop (2026-05-21)

Switch controlado por **env var `AVEONLINE_ENV`** (default `test`):

| Modo             | Credenciales auth                                  | `bloquegenerarguia` | Cuándo usar                                |
| ---------------- | -------------------------------------------------- | ------------------- | ------------------------------------------ |
| `test` (default) | `demointegracion` / `demointegra2021` (hardcoded)  | `"0"` (no factura)  | dev local, Vercel preview, QA, smoke tests |
| `production`     | `AVEONLINE_USUARIO` + `AVEONLINE_CLAVE` del `.env` | `"1"` (factura)     | Vercel production únicamente               |

Configurado en `apps/web/features/shipping/aveonline.ts` (constantes `DEMO_CREDENTIALS` + función `isProductionEnv()`).

> **Seguridad.** Nunca setear `AVEONLINE_ENV=production` en preview ni dev — el flag deber estar solo en Vercel production env. El default `test` garantiza fail-safe.

### 12.4 Subdominios alternos descubiertos (NO usar)

Investigación 2026-05-21 vía Certificate Transparency reveló subdominios que existen pero **no operan** como sandbox público:

| Host                                                                                                              | Estado                   | Por qué no usar                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------- |
| `apiqa.aveonline.co`                                                                                              | 200 (ISPConfig default)  | Servidor vacío, sin API            |
| `appdev.aveonline.co`                                                                                             | 403 (acceso restringido) | Solo interno Aveonline             |
| `guiasqa.aveonline.co`                                                                                            | 200 (respuesta 0 bytes)  | Existe pero no operativo           |
| `qa.aveonline.co`                                                                                                 | TCP/443 cerrado          | DNS resuelve, no acepta conexiones |
| `developers.aveonline.co`                                                                                         | 200 (ISPConfig default)  | Página vacía, no es portal dev     |
| `sandbox.aveonline.co`                                                                                            | NO_DNS                   | No existe                          |
| `test.aveonline.co`, `demo.aveonline.co`, `staging.aveonline.co`, `dev.aveonline.co`, `uat`, `preprod`, `pruebas` | NO_DNS                   | No existen                         |

### 12.5 Otras versiones de auth probadas

| Endpoint                                                | Cuenta demo                       | Resultado                                                      |
| ------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| v1 `comunes/v1.0/autenticarusuario.php` (tipo `auth`)   | `demointegracion/demointegra2021` | ✅ status:ok + token válido                                    |
| v2 `comunes/v2.0/autenticarusuario.php` (tipo `authV2`) | `demointegracion/demointegra2021` | ❌ "Usuario no encontrado" — v2 requiere cuenta productiva     |
| v3 AveCRM `auth/v3.0/index.php` (tipo `AuthProduct`)    | `demo/password`                   | ❌ "Error en usuario o contraseña" — endpoint válido, creds no |

Conclusión: solo v1 acepta la cuenta demo. v2/v3 requieren credenciales productivas.

### 12.6 Switch entre ambientes

```bash
# .env.local — desarrollo local
AVEONLINE_ENV=test
# AVEONLINE_USUARIO + AVEONLINE_CLAVE no necesarias en modo test

# Vercel preview — staging
AVEONLINE_ENV=test

# Vercel production — venta real
AVEONLINE_ENV=production
AVEONLINE_USUARIO=<usuario_real>
AVEONLINE_CLAVE=<clave_real>
```

El switch toma efecto en el siguiente request (no requiere redeploy si se cambia env var en Vercel y se hace `redeploy` del último build).

---

## 13. SDK / librerías

| Recurso                                  | Calidad                                                                                                                        | URL                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `aveonline-npm` v2.3.0 (TS)              | **Buena referencia** (no usar como dep) — modular (auth, agents, guide, pickup, quote, shippingRelationship, transport, citys) | `npmjs.com/package/aveonline`                     |
| `aveonline-shipping` (PHP / WooCommerce) | **Excelente referencia** — incluye cache, retries, idempotencia, paralelización curl_multi, validación. Actualizado 2026-05-12 | `github.com/franciscoblancojn/aveonline-shipping` |
| Aveonline oficial SDK                    | **NO existe**                                                                                                                  | —                                                 |
| Workspace Postman público                | Existe `postman.com/aveonline` pero requiere login                                                                             | —                                                 |

> **Recomendación arquitectura.** NO instalar `aveonline-npm` como dependency (1 mantenedor, sin tests, tipos incompletos). En vez de eso, **copiar el patrón** a `apps/web/features/shipping/aveonline/` con tipos propios + Zod schemas para validación runtime (la API es PHP devolviendo JSON con strings donde deberían ser numbers — `"unidades":"1"` — parseo defensivo obligatorio).

---

## 14. Errores consolidados

### 14.1 Códigos HTTP

- La API devuelve **siempre HTTP 200** incluso para errores lógicos. El error va en el body como `status:"error"` o `numbererror`. Anti-patrón REST.
- AveCRM (`createOrder.php`) sí devuelve códigos correctos: 400, 405, 409, 422.

### 14.2 numbererror unificado

| Code  | Cotización                            | Generar guía              |
| ----- | ------------------------------------- | ------------------------- |
| -0-   | OK                                    | OK                        |
| -1    | Origen no existe                      | Origen no existe          |
| -2    | Destino no existe                     | Destino no existe         |
| -3    | Peso ≤0                               | Peso negativo             |
| -4    | Unidades ≤0                           | Unidades negativo         |
| -5    | Valor declarado < 10k                 | Valor declarado neg       |
| -6    | Unidades > max                        | Falta nombre remitente    |
| -7    | Kilos > max                           | Falta dirección remitente |
| -8    | —                                     | Falta tel remitente       |
| -9    | —                                     | Falta nombre destinatario |
| -11   | —                                     | Falta dir destinatario    |
| -12   | —                                     | Falta tel destinatario    |
| -13   | —                                     | Falta email destinatario  |
| -14   | —                                     | Transportadora no existe  |
| -15   | —                                     | Falta contenido paquete   |
| -16   | —                                     | Falta NIT remitente       |
| -17   | —                                     | No se pudo generar guía   |
| -998  | —                                     | Cliente no existe         |
| -999  | **Cálculo / servicio no configurado** | —                         |
| -1000 | Config/ruta con límites               | —                         |

### 14.3 Diagnóstico 999 (orden de probabilidad)

1. **`idtransportador` no habilitado** en tu `idempresa`. Test: llamar `listarTransportadorasPorEmpresa`.
2. **`idagente` faltante o inválido**. Aveonline lo usa para calcular trayecto desde la dirección del agente.
3. **Trayecto sin cobertura** para esa transportadora (ej. ENVIA no llega a Putumayo).
4. **Peso/dimensiones exceden límite específico** del par origen-destino (no genera -7, genera -999 en algunas rutas).
5. **Cuenta nueva sin "configuración inicial"** — ejecutivo debe correr setup manual.

---

## 15. Soporte / compliance / limitaciones

### 15.1 Soporte

| Canal                     | Detalle                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| Integraciones técnicas    | `desarrollo1@aveonline.co`                                                 |
| PQR / reclamos            | `pqr@aveonline.co`                                                         |
| Asesor logístico          | Asignado por cuenta (`asesorlogistico` / `nombreasesor` en respuesta auth) |
| SLA respuesta documentado | NO ENCONTRADO                                                              |
| Horario                   | NO ENCONTRADO                                                              |

### 15.2 Compliance — Ley 1581 / 1480

- **Aveonline es ENCARGADO de tratamiento**, NO responsable. Tú (Lucams_shop) sigues siendo el responsable.
- Procesa datos personales y financieros (incluyendo sensibles: biometría, video).
- Transmite datos a las transportadoras (ENVIA, TCC, Servientrega, etc.) — encargados subordinados.
- Confidencialidad perpetúa post-terminación.

### 15.3 Rol legal

- "Intermediario logístico" — Aveonline NO es transportador, no responde por la carga; responsable es la transportadora final.
- Reclamos transporte → contra la transportadora (no contra Aveonline).
- Reclamos producto (calidad/manufactura) → el vendedor (tú) indemniza a Aveonline.

### 15.4 Implicaciones para Lucams_shop

- Documentar Aveonline + cada transportadora como **subprocesadores** en política de privacidad (Ley 1581 art. 17 → ROLs)
- Listado de carriers como anexo "transferencia internacional" — todos nacionales, no aplica TI
- Guía de transporte = comprobante para retenciones/IVA fletes (DIAN)

### 15.5 Limitaciones técnicas

| Item                   | Dato                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Rate limit documentado | NO ENCONTRADO. Plugin WooCommerce cachea 60s — indica tolerancia baja a llamadas repetidas |
| Timeout típico         | Plugin oficial usa `CURLOPT_TIMEOUT = 0` (sin timeout) configurable                        |
| Latencia cotización    | 5–15s con `cotizarDoble` en paralelo                                                       |
| Errores 500            | No frecuentes — devuelve `status:"error"` en HTTP 200                                      |
| SSL strict             | Plugin oficial usa `verify_peer=false` (no replicar — cert válido)                         |

> **Recomendación.** Cachear cotizaciones por `hash(origen+destino+productos+contraentrega)` durante 5–15 min en Postgres.

---

## 16. Auditoría del código actual (estado pre-ajuste 2026-05-21)

### 16.1 Archivos

| Archivo                                                 | Estado                                              |
| ------------------------------------------------------- | --------------------------------------------------- |
| `apps/web/features/shipping/provider.ts:15-107`         | ✅ Interface `ShippingProvider` completa            |
| `apps/web/features/shipping/aveonline.ts:75-373`        | ✅ `AveonlineProvider` implementa todos los métodos |
| `apps/web/features/products/shipping-schemas.ts:32-117` | ✅ Zod + helpers `getEffectiveShippingDims`         |
| `apps/web/features/checkout/service.ts:101-177`         | ✅ `quoteShipping()` orquesta                       |
| `apps/web/app/checkout/envio/page.tsx`                  | ✅ Llama `quoteShipping` server-side                |
| `apps/web/app/checkout/envio/quote-list.tsx`            | ✅ Renderiza opciones                               |
| Route handler `/api/webhooks/aveonline`                 | ❌ **NO EXISTE**                                    |
| Tests aveonline                                         | ❌ **NO EXISTEN**                                   |

### 16.2 Endpoints llamados (5 de 17+ documentados)

| Endpoint                                     | Usado | Tipo / Acción                                       |
| -------------------------------------------- | ----- | --------------------------------------------------- |
| `comunes/v1.0/autenticarusuario.php`         | ✅    | `tipo: "auth"`                                      |
| `nal/v1.0/generarGuiaTransporteNacional.php` | ✅    | `tipo: "cotizar2"` (cotización) — **causa del 999** |
| `nal/v1.0/generarGuiaTransporteNacional.php` | ✅    | `tipo: "generarGuia2"` (guía)                       |
| `nal/v1.0/guia.php`                          | ✅    | `tipo: "obtenerEstadoAuth"` (tracking)              |
| Webhook handler (sin route)                  | ⚠️    | Método existe pero sin endpoint público             |
| `nal/v1.0/generarGuiaTransporteNacional.php` | ❌    | `tipo: "cotizarDoble"` ← **debemos usar**           |
| `box/v1.0/transportadora.php`                | ❌    | `listarTransportadorasPorEmpresa`                   |
| `box/v1.0/ciudad.php`                        | ❌    | listado ciudades                                    |
| `comunes/v1.0/agentes.php`                   | ❌    | listar agentes                                      |
| `nal/v1.0/generarGuiaTransporteNacional.php` | ❌    | `tipo: "generarRecogida2"`                          |
| `nal/v2.0/generarGuiaTransporteNacional.php` | ❌    | `tipo: "eliminarRelacionEnvios"`                    |
| `avestock/api/createWebhook.php`             | ❌    | registrar webhook AveCRM                            |

### 16.3 Hardcodes problemáticos

| Línea                     | Valor                                                    | Problema                                                               |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `aveonline.ts:30`         | `BASE_URL` hardcoded                                     | OK (no hay sandbox)                                                    |
| `aveonline.ts:69`         | `60 * 60_000` token TTL                                  | OK (1h doc)                                                            |
| `aveonline.ts:39`         | `5 * 60_000` refresh buffer                              | OK (defensivo)                                                         |
| `checkout/service.ts:153` | `origin: { city: "Bogotá", department: "Cundinamarca" }` | **BUG** — debe leer de SiteSettings PICKUP\_\*                         |
| `aveonline.ts:220`        | `IdTipoEntrega: "1"`                                     | OK (domicilio default)                                                 |
| `aveonline.ts:221`        | `dsnit: "00000"`                                         | **Tech debt** — debe usar `Order.shippingDocumentNumber` cuando exista |
| `aveonline.ts:242`        | `plugin: "lucamsshop"`                                   | OK                                                                     |

### 16.4 Bugs identificados (orden de gravedad)

| #   | Bug                                                   | Archivo:Línea                   | Impacto                                                            |
| --- | ----------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| 1   | **`cotizar2` en vez de `cotizarDoble`**               | `aveonline.ts:101`              | 🔴 Bloqueante. Causa el 999 que vemos en producción                |
| 2   | **No filtra `numbererror !== "-0-"`** en parseo       | `aveonline.ts:121-128`          | 🔴 Bloqueante. UI muestra "Gratis" fake para envíos imposibles     |
| 3   | **Origen hardcoded Bogotá/Cundinamarca**              | `checkout/service.ts:153`       | 🟡 Importante. Funciona por coincidencia pero ignora SiteSettings  |
| 4   | **Falta `idagente`** en body cotización               | `aveonline.ts:99-110`           | 🟡 Posible causa adicional de 999                                  |
| 5   | **Webhook handler sin HMAC ni IP whitelist**          | `aveonline.ts:352-373`          | 🟡 ALTO. Sin esto el endpoint sería vulnerable                     |
| 6   | **Route handler `/api/webhooks/aveonline` no existe** | —                               | 🟡 Bloqueante para tracking automático                             |
| 7   | **`createShipment` no se invoca desde la app**        | —                               | 🟡 Falta cron/edge function al transicionar Order PAID             |
| 8   | **Email regex `/<(.+?)>/` puede fallar**              | `aveonline.ts:216`              | 🟢 Bajo. Tiene fallback `hola@lucamsshop.com`                      |
| 9   | **Race condition tokenCache**                         | `aveonline.ts:39-41`            | 🟢 Bajo. Solo desperdicia auth call                                |
| 10  | **No valida `valorDeclarado >= 10000`**               | `checkout/service.ts:146`       | 🟡 Importante. Productos baratos generan numbererror -5            |
| 11  | **Catch genérico `Error al guardar. Reintentá`**      | `checkout/datos/actions.ts:127` | 🟡 Mediano. No expone causa real. Log existe pero buffering oculta |
| 12  | **Logs no se ven en tiempo real**                     | Makefile start-web              | 🟢 ARREGLADO en este sprint (`stdbuf -oL -eL`)                     |

### 16.5 Variables de entorno + SiteSettings

**Env vars (.env.local):**

- `AVEONLINE_USUARIO` ✅ requerida
- `AVEONLINE_CLAVE` ✅ requerida
- `SHIPPING_PROVIDER` (default "aveonline") opcional
- `EMAIL_FROM` (para `dscorreopre` remitente)

**SiteSettings (`/admin/contenido/configuracion` cat BUSINESS):**

- `BUSINESS_NIT` ✅ llenado por Lucy 2026-05-21
- `PICKUP_CITY` ✅
- `PICKUP_DEPARTMENT` ✅
- `PICKUP_ADDRESS` ✅
- `PICKUP_PHONE` ✅
- `PICKUP_CONTACT_NAME` ✅

### 16.6 Integración con Order state machine

```
ORDER_TRANSITIONS:
  DRAFT → PENDING_PAYMENT → PAID → FULFILLING → SHIPPED → DELIVERED
                            ↓ REFUNDED

Plan ADR-039 (no implementado):
  Webhook Wompi APPROVED → Order PAID
                            ↓
                          enqueue('shipment_creation_retry')
                            ↓
                          Edge Function consumer
                            ↓
                          provider.createShipment()
                            ↓
                          Order.trackingNumber + Order.trackingUrl + Order.labelUrl
                            ↓
                          Order FULFILLING
```

**Estado actual:** Solo `PENDING_PAYMENT → PAID` parcialmente implementado. El resto del flujo está pendiente.

---

## 17. Resultados del probe real (cuenta `crittan01@gmail.com`, 2026-05-21)

### 17.1 Auth

```
status: 200
contentType: application/json
parsed.status: "ok"
parsed.hasToken: true
cuentas[0].usuarios[0].id (idempresa) = 43562
cuentas[0].usuarios[0].razon = "Cristian Camilo Garzon Tamayo"
cuentas[0].usuarios[0].nombre = "Kaiu Living Natural"
```

> **Nota.** La cuenta actual pertenece a Kaiu Living. Lucy creó cuenta nueva "Lucams Shop" 2026-05-21; rotar credenciales cuando Aveonline confirme activación.

### 17.2 Transportadoras habilitadas (`listarTransportadorasPorEmpresa`)

6 carriers:

| id   | text                   |
| ---- | ---------------------- |
| 1028 | 99MINUTOS              |
| 1009 | COORDINADORA MERCANTIL |
| 29   | ENVIA                  |
| 1031 | GO ENVIOS              |
| 33   | SERVIENTREGA           |
| 1010 | TCC SA                 |

### 17.3 Cotización `cotizarDoble` (Bogotá → Medellín, 1 set de 6 fotoimanes 0.5kg 15×10×3cm valorDeclarado 35.000)

10 cotizaciones devueltas:

| Carrier                | numbererror |  total | días |
| ---------------------- | ----------- | -----: | ---: |
| ENVIA                  | -0-         | 15.691 |    2 |
| COORDINADORA MERCANTIL | -0-         | 16.501 |    3 |
| TCC SA                 | -0-         | 17.004 |    1 |
| SERVIENTREGA           | -0-         | 17.575 |    3 |
| SAFERBO                | 999         |      0 |    — |
| Domina                 | 999         |      0 |    — |
| MOOVA                  | 999         |      0 |    — |
| 99MINUTOS              | 999         |      0 |    — |
| GINTRACOM              | 999         |      0 |    — |
| Go Envios              | 999         |      0 |    — |

> Las 4 con `numbererror: "-0-"` son tarifas REALES que la cuenta tiene contratadas y que cubren la ruta. Las 6 con 999 son carriers que aparecen en la respuesta pero no cubren ese trayecto o no están activos para esa cuenta.

### 17.4 Cotización `cotizar2` (single carrier — el bug)

Mismas 10 transportadoras pero TODAS devuelven 999 porque el `idtransportador` enviado no calcula. Conclusión: usar `cotizarDoble` y filtrar por `numbererror`.

---

## 18. Plan de ajustes priorizado

### P0 — Bloqueante producción (no se puede vender real sin esto)

| #    | Ajuste                                                                                                                                 | Archivo                                          | Esfuerzo |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------: |
| P0.1 | Cambiar `cotizar2` → `cotizarDoble` en `quote()`                                                                                       | `apps/web/features/shipping/aveonline.ts:97-111` |    30min |
| P0.2 | Filtrar cotizaciones con `numbererror !== "-0-"`. Si todas filtradas → throw "Sin cobertura para esa ciudad"                           | `aveonline.ts:121-128`                           |    20min |
| P0.3 | Reemplazar origen hardcoded por `getSettingValue("PICKUP_CITY")` + `PICKUP_DEPARTMENT` desde SiteSettings (ya llenos)                  | `apps/web/features/checkout/service.ts:153`      |    20min |
| P0.4 | Validar `valorDeclarado >= 10000` cuando se construye `items` (forzar mínimo $10.000 COP)                                              | `checkout/service.ts:146`                        |    10min |
| P0.5 | Mejorar mensaje "Error al guardar. Reintentá" en `saveDatosAction` con código sanitizado (sin exponer stack) + log estructurado        | `checkout/datos/actions.ts:122-128`              |    20min |
| P0.6 | Endpoint `listarTransportadorasPorEmpresa` cacheado 24h (para sanity admin y para validar antes de cotizar)                            | `aveonline.ts` (nuevo método)                    |    40min |
| P0.7 | Formato ciudad uppercase `BOGOTA(CUNDINAMARCA)` en `origen` / `destino` (función helper)                                               | `aveonline.ts`                                   |    20min |
| P0.8 | Logger.error con `numbererror` + `dataerror` cuando todas las cotizaciones fallan, para que admin vea la causa exacta en `/admin/logs` | `aveonline.ts:121`                               |    10min |

**Total P0: ~3h.**

### P1 — Importante (productivo robusto)

| #     | Ajuste                                                                                                                         | Esfuerzo |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | -------: |
| P1.1  | Route handler `/api/webhooks/aveonline/route.ts` + integrar `handleWebhook()` con validación IP whitelist + secret en `paramN` |       2h |
| P1.2  | Registrar webhook con `avestock/api/createWebhook.php` desde admin panel (`/admin/integraciones`)                              |     1.5h |
| P1.3  | Implementar `requestPickup()` (hoy STUB) + UI admin para agendar recogidas batch                                               |       3h |
| P1.4  | Cache cotización 5-15 min por `hash(origen+destino+productos+contraentrega)` en tabla `ShippingQuoteCache` Postgres            |       2h |
| P1.5  | Edge function / pg_cron para invocar `createShipment` cuando Order transiciona a PAID                                          |       4h |
| P1.6  | Reemplazar `dsnit: "00000"` por `Order.shippingDocumentNumber` cuando contact lo tenga                                         |    30min |
| P1.7  | Endpoint `eliminarRelacionEnvios` + UI cancelación desde `/admin/pedidos/[id]`                                                 |       2h |
| P1.8  | Endpoint `obtenerEstadoAuth` polling backup (cron 15min) por si webhook falla                                                  |       1h |
| P1.9  | Schemas Zod para validar runtime cada response Aveonline (parseo defensivo)                                                    |       2h |
| P1.10 | Actualizar `docs/INTEGRATIONS.md` agregando sección Aveonline (tabla, endpoints, flujo)                                        |       1h |

**Total P1: ~19h.**

### P2 — Mejoras

| #    | Ajuste                                                                                                 | Esfuerzo |
| ---- | ------------------------------------------------------------------------------------------------------ | -------: |
| P2.1 | Lock para tokenCache (evitar race conditions concurrent auth)                                          |    30min |
| P2.2 | Tests unitarios `aveonline.test.ts` (auth, cotización, parseo, error handling)                         |       3h |
| P2.3 | Tests integración con mock Aveonline responses (`tests/integration/shipping.test.ts`)                  |       2h |
| P2.4 | Job semanal pg_cron sincronizar `listadociudades.json` de Aveonline → tabla `ShippingCity` con índices |       2h |
| P2.5 | Mapping configurable estado_carrier → estado_lucams desde CmsSetting (no hardcoded)                    |       1h |
| P2.6 | Detectar token expirado (HTTP 401 implícito vía body) → auto-refresh + retry una vez                   |       1h |
| P2.7 | Métrica `shipping.aveonline.quote.cache_hit_rate` + alerting si baja del 50%                           |       1h |

**Total P2: ~10h.**

### Acciones humanas pendientes (no son código)

| #   | Acción                                                                                                                                                                                            | Responsable   | Bloqueante para       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------- |
| H1  | Confirmar correo cuenta nueva "Lucams Shop" Aveonline                                                                                                                                             | Lucy          | Rotación credenciales |
| H2  | Completar Datos Comerciales en panel Aveonline: NIT, dirección recogida, cuenta bancaria liquidación COD                                                                                          | Lucy          | Activación tarifas    |
| H3  | Contactar `desarrollo1@aveonline.co`: pedir activación carriers (TCC, Servientrega, Envía, Coordinadora, Interrapidísimo, Domina) + configuración agente origen + tarifas para cuenta Lucams Shop | Lucy          | Cotización válida     |
| H4  | Solicitar a Aveonline confirmación de cutoff recogida (11am asumido en ADR-039)                                                                                                                   | Lucy          | Recogidas automáticas |
| H5  | Solicitar a Aveonline implementación HMAC en webhook (mitigación temporal: paramN secret)                                                                                                         | Lucy          | Webhook seguro        |
| H6  | Rotar `AVEONLINE_USUARIO` + `AVEONLINE_CLAVE` en `.env.local` cuando cuenta nueva esté activa (Claude provee `sed` exacto sin leer .env)                                                          | Lucy + Claude | Producción            |
| H7  | Validar plan mensual elegido + costo FEE — ADR-039 lo deja pendiente                                                                                                                              | Lucy          | Cierre comercial      |
| H8  | Validar política de subprocesadores en `/legal/subprocesadores` incluya Aveonline + cada carrier                                                                                                  | Lucy + Claude | Compliance Ley 1581   |

---

## 19. Fuentes verificadas (2026-05-21)

- [Aveonline — Introducción](https://integraciones.aveonline.co/docs/introduccion/)
- [Aveonline — Autenticación v1](https://integraciones.aveonline.co/docs/1.0.0/nacional/autenticacion/)
- [Aveonline — Cotización](https://integraciones.aveonline.co/docs/nacional/cotizacion/)
- [Aveonline — Generación de guía](https://integraciones.aveonline.co/docs/nacional/generacionGuia/)
- [Aveonline — Solicitud de recogida](https://integraciones.aveonline.co/docs/1.0.0/nacional/solicitudRecogida/)
- [Aveonline — Estado de la guía](https://integraciones.aveonline.co/docs/1.0.0/nacional/estadoGuia/)
- [Aveonline — Listado de ciudades](https://integraciones.aveonline.co/docs/nacional/listadoCiudades/)
- [Aveonline — Crear relación de envíos](https://integraciones.aveonline.co/docs/nacional/relacionEnvios/crearrelacionEnvios/)
- [Aveonline — Listar relación envíos](https://integraciones.aveonline.co/docs/nacional/relacionEnvios/ListarRelacionEnvios/)
- [Aveonline — Eliminar relación envíos](https://integraciones.aveonline.co/docs/nacional/relacionEnvios/EliminarRelacionEnvios/)
- [Aveonline — Webhook estados guías](https://integraciones.aveonline.co/docs/1.0.0/nacional/webhookEstadosGuias/)
- [Aveonline — Tramas operadores](https://integraciones.aveonline.co/docs/1.0.0/Proveedores/tramasOperadores/)
- [Aveonline — AveCRM Crear Webhook](https://integraciones.aveonline.co/docs/avecrm/crearWebhook/)
- [Aveonline — AveCRM Listar Envios](https://integraciones.aveonline.co/docs/avecrm/listarEnvios/)
- [Aveonline — AveCRM Generar Pedido](https://integraciones.aveonline.co/docs/avecrm/orders/generarPedido/)
- [Aveonline — Crear Usuario Agente](https://integraciones.aveonline.co/docs/nacional/agentes/crearUsuarioAgente/)
- [Aveonline — Términos y Condiciones](https://app.aveonline.co/app/contrato/terminosCondiciones.html)
- [Aveonline — Envíos Nacionales](https://aveonline.co/envios-nacionales/)
- [Aveonline — Pago Contraentrega](https://aveonline.co/servicios-pago-contraentrega/)
- [Aveonline — JSON ciudades público](https://app.aveonline.co/assets/resources/public/listadociudades.json)
- [npm — aveonline](https://www.npmjs.com/package/aveonline)
- [GitHub — franciscoblancojn/aveonline-npm](https://github.com/franciscoblancojn/aveonline-npm)
- [GitHub — franciscoblancojn/aveonline-shipping (WooCommerce)](https://github.com/franciscoblancojn/aveonline-shipping)

Probe en vivo contra cuenta `crittan01@gmail.com` ejecutado desde `packages/db/scripts/probe-aveonline.mjs` el 2026-05-21 20:50 UTC.

---

## 20. Cambios pendientes a otros docs

| Doc                     | Cambio                                                                          |
| ----------------------- | ------------------------------------------------------------------------------- |
| `docs/DECISIONS.md`     | Agregar ADR-040 "Migración cotizar2 → cotizarDoble + filtro numbererror"        |
| `docs/SECURITY.md`      | Documentar mitigación webhook Aveonline sin HMAC (paramN secret + IP whitelist) |
| `docs/COMPLIANCE.md`    | Agregar Aveonline + 6 carriers en política subprocesadores Ley 1581             |
| `docs/OBSERVABILITY.md` | Agregar SLO cotización Aveonline (p95 < 5s, error rate < 2%)                    |
| `apps/web/.env.example` | Documentar variables Aveonline con comentarios                                  |

---

**Fin del dossier.**

---

## 21. Auditoría doc-oficial 2026-07-28 (cambios aplicados)

Re-lectura completa de `https://integraciones.aveonline.co/docs/` contra la implementación, en el contexto de la certificación E2E transaccional (orden sandbox real pagada con Wompi + guía generada). Cambios aplicados el mismo día en `apps/web/features/shipping/aveonline.ts`:

### 21.1 Formas de pago de la guía — COD ya no cobra el flete dos veces 🔴→✅

La tabla oficial de cotización ("Formas de pago de la guía") define `contraentrega` = "el **destinatario** asume el costo del **envío**" e `idasumecosto` = "el **destinatario** asume el costo del **recaudo**". Antes enviábamos `contraentrega=1, idasumecosto=1, valorrecaudo=order.total` (fila 2 de la tabla) → el mensajero cobraba `valorrecaudo` (que ya incluye el flete visto en checkout) **+ flete + fee de recaudo encima** → el cliente pagaba el flete DOS veces.

Ahora, siempre `contraentrega=0, idasumecosto=0`:

- Prepagada (Wompi) → fila 1: destinatario no paga nada.
- COD → fila 5: el mensajero cobra exactamente `valorrecaudo` (= `order.total`); Lucams asume transporte + fee de recaudo en la liquidación (el fee es el costo de ofrecer COD).

### 21.2 Modelo de empaque "caja apilada" (liquidación multi-producto) ✅

Cotización y guía comparten ahora `computePackedPackage(items)`: UN bulto con peso Σ(peso×qty), espesor Σ(dim_menor×qty) y huella = máx de las dos dims mayores por item. Antes: cotización per-línea con qty solo en peso y guía con bounding-box máximo por eje → volumen sub-declarado con qty>1 (la transportadora re-mide y liquida en contra) y flete cotizado ≠ facturado. Con el modelo unificado: qty=2 **nunca duplica** el flete (una guía tarifada por peso/volumen real) y tampoco se sobredimensiona.

### 21.3 Otros cambios aplicados

- `relacion_envios: "1"` → `"0"`: declarábamos intención de relacionar y jamás creamos la relación (doc: 1=sí, 0=no).
- `dscorreop` (requerido, error tipificado -13): validación temprana con error accionable si la orden no tiene email del destinatario.
- `mapAveonlineStatus`: reconoce los estados canónicos documentados — `EN DESPACHO`→DISPATCHED, `EN REPARTO`/`TRANSITO`→IN_TRANSIT, `ANULADA`→EXCEPTION (antes el tracking intermedio no transicionaba nunca a SHIPPED y una guía anulada quedaba "pendiente" para siempre).
- `dsnit` (placeholder sin CC del cliente): `"000001"` era rechazado en vivo ("Debe ser numérico, tener al menos 5 dígitos y ser mayor a 10000") → ahora `"100001"`. **Desviación doc-vs-vivo:** la doc no documenta restricción y su ejemplo usa `"00000"`; el sandbox valida más que la doc.

### 21.4 Contradicciones doc-vs-código abiertas (requieren verificación con cuenta REAL)

- **`bloquegenerarguia`:** la doc dice "Si desea generar la guia: 1. Si no: 0" y su ejemplo envía `"1"`; nuestro gate usa semántica inversa (`"1"`=no facturable/seguro, `"0"`=facturable) basada en un bug histórico "verificado en vivo". En sandbox con `"1"` SÍ se genera guía + PDF (no facturable). Resolver exige probe con la cuenta de producción (revisar cartera en el panel tras generar con cada valor). **No se toca hasta esa verificación.**
- **`cotizarDoble`:** sigue sin aparecer en la doc oficial (solo `cotizar2`). Funciona en vivo (multi-carrier); contrato invisible — pedir spec formal a Aveonline.
- **Webhook oficial:** existe registro por API (`/api-integrations/public/api/integrations/custom-webhook`) que devuelve un `token` de integración reenviado en cada notificación. Hoy usamos el endpoint legacy AveCRM + secret en query (deuda registrada en `route.ts`).
- **Pendientes no críticos:** recogidas por API (`generarRecogida2`, hoy manual en panel), reimpresión de rótulo (API V3), entrega en oficina (`IdTipoEntrega="2"`), fechas `fechacreacion`/`fechanovedad` del webhook (formato con AM/PM no parseado — solo afecta dedup key).
