# Catálogo seed — Lucams_shop

> Catálogo inicial de 37 productos paritarios con [magneticas.cl](https://www.magneticas.cl), adaptados a la marca Lucams (kawaii colombiano), tono cercano, y con compliance colombiano. Las **fotos y los precios son placeholders** que el usuario operador reemplaza antes del lanzamiento (mandato CLAUDE.md y ADR-010). Verificación contra magneticas.cl realizada 2026-05-09 (sitemap + 6 categorías + 1 página catálogo + FAQ + política de devolución).

## Tabla de contenido

1. [Estructura de categorías](#estructura-de-categorías)
2. [Productos seed (37)](#productos-seed-37)
3. [Productos NUEVOS exclusivos Lucams](#productos-nuevos-exclusivos-lucams)
4. [Productos descartados de magneticas.cl con motivo](#productos-descartados-de-magneticascl-con-motivo)
5. [Mapping de precios CLP → COP](#mapping-de-precios-clp--cop)
6. [Aplicabilidad de retracto (Ley 1480 art. 47)](#aplicabilidad-de-retracto-ley-1480-art-47)
7. [Implementación en Prisma seed](#implementación-en-prisma-seed)

---

## Estructura de categorías

| Slug Lucams | Nombre Lucams | Equivalente magneticas.cl | Adaptación |
|---|---|---|---|
| `foto-imanes` | Foto-imanes | Packs de Fotos Magnéticas | Renombrado más corto y kawaii |
| `recorditos-eventos` | Recorditos para Eventos | Recuerdos Magnéticos | "Recorditos" suena más colombiano-tierno |
| `organizate` | Organízate Bonito | Organización y Planificación | Tono cercano |
| `calendarios` | Calendarios | Calendarios Magnéticos | Sin redundancia |
| `pequenes` | Para los Peques | Juegos Magnéticos | Cariñoso |
| `decora-espacio` | Decora tu Espacio | Cuadros y Decoración | Acción + objeto |
| `regalos-corazon` | Regalos con Corazón | Regalos Personalizados | Más emocional |
| `mayorista` | Para tu Negocio | Imanes Publicitarios | Routing a `/mayorista` (B2B) |

> **8 categorías top-level**, sin subcategorías al inicio (se agregan si la navegación lo justifica). magneticas.cl tiene 10 — descartamos `coleccionables` (productos con licencia dudosa, ver [§ Productos descartados](#productos-descartados-de-magneticascl-con-motivo)) y `cursos-online` (fuera del scope del proyecto).

---

## Productos seed (37)

> Cada producto tiene `slug` (URL), `name` (nombre en UI), `category` (slug de categoría), `summary` (descripción una línea), `qty` (cantidad incluida si aplica), `pricePlaceholderCOP` (precio sugerido para placeholder; el operador ajusta), `isPersonalizable`, `retractEligible` (Ley 1480 art. 47).

### 🖼️ Foto-imanes (8 productos)

| # | slug | name | qty | placeholder COP | Personalizable | Retracto |
|---|---|---|---|---|---|---|
| 1 | `set-6-fotoimanes-polaroid-grande` | Set 6 Foto-imanes Polaroid Grande | 6 | $35.000 | ✅ | ❌ (personalizado) |
| 2 | `set-9-fotoimanes-polaroid-color` | Set 9 Foto-imanes Polaroid Color | 9 | $45.000 | ✅ | ❌ |
| 3 | `set-12-fotoimanes-polaroid` | Set 12 Foto-imanes Polaroid | 12 | $45.000 | ✅ | ❌ |
| 4 | `set-12-fotoimanes-cuadrados` | Set 12 Foto-imanes Cuadrados | 12 | $45.000 | ✅ | ❌ |
| 5 | `set-20-mini-polaroids` | Set 20 Mini Polaroids | 20 | $58.000 | ✅ | ❌ |
| 6 | `set-fotoimanes-circulares` | Set Foto-imanes Circulares | 6 | $35.000 | ✅ | ❌ |
| 7 | `set-fotoimanes-corazon` | Set Foto-imanes Corazón | 6 | $35.000 | ✅ | ❌ |
| 8 | `set-glass-magnets-personalizados` | Set Glass-Magnets Personalizados (vidrio) | 6 | $25.000 | ✅ | ❌ |

### 🎉 Recorditos para Eventos (6 productos)

| # | slug | name | qty | placeholder COP | Personalizable | Retracto |
|---|---|---|---|---|---|---|
| 9 | `recorditos-cumpleanos-x20` | Recorditos de Cumpleaños x20 | 20 | $115.000 | ✅ | ❌ |
| 10 | `recorditos-bautizo-x12` | Recorditos de Bautizo x12 | 12 | $90.000 | ✅ | ❌ |
| 11 | `recorditos-graduacion-x20` | Recorditos de Graduación x20 | 20 | $90.000 | ✅ | ❌ |
| 12 | `recorditos-matrimonio` | Recorditos de Matrimonio | Variable | $30.000 | ✅ | ❌ |
| 13 | `mi-primer-anito` | Mi Primer Añito ✨ | Variable | $45.000 | ✅ | ❌ |
| 14 | `recorditos-quinceanera` | Recorditos de Quinceañera (NUEVO 🇨🇴) | 20 | $115.000 | ✅ | ❌ |

### 📋 Organízate Bonito (6 productos)

| # | slug | name | qty | placeholder COP | Personalizable | Retracto |
|---|---|---|---|---|---|---|
| 15 | `planner-semanal-magnetico` | Planner Semanal Magnético | 1 | $32.000 | Opcional | ✅ si no personalizado |
| 16 | `planner-mensual-magnetico` | Planner Mensual Magnético | 1 | $36.000 | Opcional | ✅ si no personalizado |
| 17 | `mini-planner-magnetico` | Mini Planner Magnético | 1 | $30.000 | ❌ | ✅ |
| 18 | `planner-mensual-con-foto` | Planner Mensual con Foto | 1 | $42.000 | ✅ | ❌ |
| 19 | `set-4-notas-magneticas` | Set 4 Notas Magnéticas | 4 | $30.000 | ❌ | ✅ |
| 20 | `pack-separadores-libros` | Pack Separadores de Libros Magnéticos | 6 | $18.000 | ❌ | ✅ |

### 📅 Calendarios (3 productos)

| # | slug | name | qty | placeholder COP | Personalizable | Retracto |
|---|---|---|---|---|---|---|
| 21 | `calendario-mes-a-mes-fotos` | Calendario Mes a Mes con 12 Fotos | 12 fotos | $45.000 | ✅ | ❌ |
| 22 | `calendario-floral-mes-a-mes` | Calendario Floral Mes a Mes | 1 | $48.000 | ❌ | ✅ |
| 23 | `mini-calendarios-x10` | Mini Calendarios para Regalar x10 | 10 | $7.000 | Opcional | ✅ si no personalizado |

### 🧒 Para los Peques (5 productos)

| # | slug | name | qty | placeholder COP | Personalizable | Retracto |
|---|---|---|---|---|---|---|
| 24 | `abecedario-magnetico` | Abecedario Magnético (37 fichas) | 37 | $58.000 | ❌ | ✅ |
| 25 | `set-fichas-numeros` | Set Fichas Magnéticas — Los Números | Variable | $72.000 | ❌ | ✅ |
| 26 | `rutina-infantil-7-actividades` | Crea tu Rutina Infantil (7 actividades) | 7 | $27.000 | Opcional | ✅ si no personalizado |
| 27 | `rutina-infantil-xl-9` | Crea tu Rutina Infantil XL (9 actividades) | 9 | $36.000 | Opcional | ✅ si no personalizado |
| 28 | `planner-emociones-kids` | Planner de Emociones Kids | 1 | $27.000 | ❌ | ✅ |

### 🖼️ Decora tu Espacio (3 productos)

| # | slug | name | qty | placeholder COP | Personalizable | Retracto |
|---|---|---|---|---|---|---|
| 29 | `cuadro-15x15-con-foto` | Cuadro 15x15 cm con Foto | 1 | $27.000 | ✅ | ❌ |
| 30 | `cuadro-3-fotos` | Cuadro para 3 Fotos | 1 | $40.000 | ✅ | ❌ |
| 31 | `marcos-magneticos-cuadrados` | Marcos Magnéticos Cuadrados (pack 2) | 2 | $14.000 | ❌ | ✅ |

### 💝 Regalos con Corazón (3 productos)

| # | slug | name | qty | placeholder COP | Personalizable | Retracto |
|---|---|---|---|---|---|---|
| 32 | `big-box-dia-mama` | Big Box Día de la Madre | 1 | $68.000 | ✅ | ❌ |
| 33 | `mini-box-dia-mama` | Mini Box Día de la Madre | 1 | $45.000 | ✅ | ❌ |
| 34 | `caja-lucams-sorpresa` | Caja Lucams Sorpresa (Mystery Box) | 1 | $25.000 | ❌ | ✅ |

### 🏢 Para tu Negocio — B2B publicitarios (3 productos)

| # | slug | name | qty mínima | placeholder COP / unidad | Personalizable | Retracto |
|---|---|---|---|---|---|---|
| 35 | `imanes-publicitarios-rectos-7x5` | Imanes Publicitarios Rectos 7x5 cm | 50 | $1.800 | ✅ | ❌ |
| 36 | `imanes-publicitarios-circulares-6cm` | Imanes Publicitarios Circulares 6 cm | 50 | $2.000 | ✅ | ❌ |
| 37 | `imanes-publicitarios-troquelados` | Imanes Publicitarios Troquelados (forma libre) | 50 | $2.500 | ✅ | ❌ |

> **Total: 37 productos seed.** Supera los 30+ exigidos por [ADR-010](DECISIONS.md) y [ROADMAP § Fase 2](ROADMAP.md). Todos los precios son placeholder — el operador los ajusta basándose en costos reales y posicionamiento.

---

## Productos NUEVOS exclusivos Lucams

> Productos que **no están en magneticas.cl** y son ventaja competitiva por adaptación cultural colombiana o por completitud del catálogo.

| Producto | Razón de inclusión |
|---|---|
| **Recorditos de Quinceañera** | Tradición latinoamericana fuerte (México, Colombia, Venezuela). magneticas.cl lo omite. |
| **Recorditos Día de las Velitas** (7 de diciembre) | Tradición colombiana. Imán conmemorativo. (Producto temporal, lanzar en noviembre/diciembre) |
| **Recorditos Día de la Independencia 🇨🇴** (20 de julio) | Idem (lanzar en julio) |
| **Recorditos Primera Comunión** | Tradición fuerte en Colombia, magneticas.cl no lo tiene explícito |
| **Bundle Creator dinámico** | Feature, no producto: el cliente arma su pack de 3/5/10 imanes con descuento progresivo (5/10/15%). magneticas.cl tiene packs preconfigurados; nosotros los hacemos custom. |
| **Estudio de Personalización en vivo** | Servicio gratis incluido en cada producto personalizable. **Diferenciador #1** del proyecto. |

> Productos temporales (Velitas, Independencia, etc.) se gestionan vía `Product.isFeatured` + `Product.startDate/endDate` cuando se modele en Fase 2.

---

## Productos descartados de magneticas.cl con motivo

> magneticas.cl vende algunos productos que **no replicamos** por motivos legales (licencias) o estratégicos (fuera de scope).

### Por uso de marca registrada sin licencia oficial (alto riesgo legal)

magneticas.cl publica los siguientes productos referenciando marcas/franquicias **sin disclaimer de licencia** (verificado en sus PDPs y categoría coleccionables a 2026-05-09). En Colombia, el uso comercial de marca registrada sin autorización viola la Decisión 486 CAN (Régimen de Propiedad Industrial) y expone a demandas de la marca titular.

| Producto omitido | Marca titular | Política Lucams |
|---|---|---|
| Imanes Bad Bunny – Edición Concierto | Bad Bunny / DAMRP LLC | Descartado |
| Imanes de Katy Perry | Katy Perry | Descartado |
| Mini Magnets Harry Potter (holográficos) | Warner Bros. / J.K. Rowling | Descartado |
| Set Hannah Montana 5 Imanes | Disney | Descartado |
| Imanes Estilo Sticker Snoopy | Peanuts Worldwide LLC | Descartado |
| Marcapáginas / Notas / Mini Calendario / Planner Snoopy | Idem | Descartados (toda la "Colección Snoopy") |
| Packs Crucero + Diseños DISNEY | The Walt Disney Company | Descartado |
| Pack Spotify Magnético | Spotify AB | Descartado |
| Imanes Personalizados Estilo Coca-Cola | The Coca-Cola Company | Descartado |
| Mystery Box Magnética con personajes licenciados | Varias | Reemplazado por `caja-lucams-sorpresa` con personajes propios (mascota mapache, plantillas Lucams) |

> **Decisión:** Lucams_shop **no replica productos con marcas registradas de terceros sin licencia**. Si en el futuro queremos entrar a este mercado, contratamos las licencias oficiales (Disney/Warner/Peanuts) o creamos colaboraciones con artistas independientes con sus propias IPs registradas. Documentado como deuda en STATE.md sección "Cola de decisiones futuras".

### Por irrelevancia cultural (específicos chilenos)

| Producto omitido | Razón | Reemplazo Lucams |
|---|---|---|
| **Kit Magnético Dieciochero (sombrero de huaso)** | Específico de Fiestas Patrias chilenas (18 de septiembre) | Recorditos Día de la Independencia 🇨🇴 (20 de julio) — producto NUEVO Lucams |

### Fuera de scope del proyecto

| Producto omitido | Razón |
|---|---|
| **Cursos Online** | El proyecto es e-commerce de productos físicos. Cursos serían un negocio paralelo (out of scope para Fases 0–7). |

---

## Mapping de precios CLP → COP

> **Disclaimer:** los precios CLP de magneticas.cl son **referencia descriptiva**, no determinan los precios Lucams. El operador define los precios COP según costo de producción local (proveedor de imanes, papel fotográfico, mano de obra), margen objetivo, y posicionamiento de marca.

### Tipo de cambio referencial

| Fecha | 1 CLP ≈ | Fuente |
|---|---|---|
| 2026-05-09 | ~$4.5 COP (orden de magnitud) | TBD — verificar antes de cualquier decisión real con [tasas Banco República](https://www.banrep.gov.co) o XE.com |

### Tabla de equivalencia indicativa

| Precio magneticas.cl | Cálculo directo (no usar) | Placeholder Lucams (sugerido) | Razón del ajuste |
|---|---|---|---|
| $1.000 CLP (mini imán) | ~$4.500 COP | $7.000–8.000 COP | Costo mínimo viable + margen |
| $5.990 CLP (productos básicos) | ~$27.000 COP | $25.000–30.000 COP | Banda baja del catálogo |
| $9.990 CLP (packs medios) | ~$45.000 COP | $42.000–48.000 COP | Banda media |
| $14.990 CLP (Big Box) | ~$67.500 COP | $65.000–75.000 COP | — |
| $19.990 CLP (recuerdos premium) | ~$90.000 COP | $90.000 COP | — |
| $24.990 CLP (top tier) | ~$112.500 COP | $115.000 COP | — |

> **Nota crítica:** los precios placeholder de la tabla "Productos seed" arriba **son orientativos** para que el seed corra en dev sin precios `$0`. **Antes del lanzamiento productivo, el operador valida cada precio con su contador y proveedor de impresión.**

---

## Aplicabilidad de retracto (Ley 1480 art. 47)

> Detalle legal completo en [`COMPLIANCE.md` § Ley 1480](COMPLIANCE.md#ley-1480-de-2011--estatuto-del-consumidor). Resumen aplicado al catálogo:

### Productos SIN derecho de retracto (excepción art. 47 — bienes personalizados)

Todos los productos donde el cliente sube foto, texto o ambos:
- Foto-imanes (8 productos): `set-6-fotoimanes-polaroid-grande`, `set-9-fotoimanes-polaroid-color`, ... `set-glass-magnets-personalizados`.
- Recorditos para Eventos (6): todos.
- `planner-mensual-con-foto`.
- `calendario-mes-a-mes-fotos`.
- `cuadro-15x15-con-foto`, `cuadro-3-fotos`.
- `big-box-dia-mama`, `mini-box-dia-mama`.
- B2B publicitarios (3): todos van con logo del cliente → personalizados.

**Total sin retracto: 22 productos (59% del catálogo)**.

### Productos CON derecho de retracto (5 días hábiles desde entrega)

Todos los productos pre-diseñados sin personalización del cliente:
- `mini-planner-magnetico`, `set-4-notas-magneticas`, `pack-separadores-libros`.
- `calendario-floral-mes-a-mes`.
- `marcos-magneticos-cuadrados`.
- `caja-lucams-sorpresa`.
- `abecedario-magnetico`, `set-fichas-numeros`, `planner-emociones-kids`.

**Total con retracto: 9 productos**.

### Condicionales (depende de si cliente personaliza)

- `planner-semanal-magnetico` y `planner-mensual-magnetico`: pueden venderse en blanco (con retracto) o con foto del cliente (sin retracto). Se decide en checkout según `customDesign` presente o ausente.
- `mini-calendarios-x10`: idem.
- `rutina-infantil-7-actividades` y `rutina-infantil-xl-9`: idem.

**Total condicionales: 5 productos**.

### Implicación técnica

- Cada `Product` tiene `retractApplies: Boolean` con default según la tabla anterior.
- Cada `OrderItem` calcula `retractEligible` al checkout: `product.retractApplies AND customDesign IS NULL`.
- Esto evita disputas legales por confusión de retracto en productos personalizables.

---

## Implementación en Prisma seed

> Ubicación: `packages/db/prisma/seed.ts`. Ejecutar con `pnpm --filter @lucams/db prisma db seed` (Fase 1).

### Estructura del archivo

```ts
// packages/db/prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Categorías (8)
const categories = [
  { slug: 'foto-imanes', name: 'Foto-imanes', order: 1 },
  { slug: 'recorditos-eventos', name: 'Recorditos para Eventos', order: 2 },
  { slug: 'organizate', name: 'Organízate Bonito', order: 3 },
  { slug: 'calendarios', name: 'Calendarios', order: 4 },
  { slug: 'pequenes', name: 'Para los Peques', order: 5 },
  { slug: 'decora-espacio', name: 'Decora tu Espacio', order: 6 },
  { slug: 'regalos-corazon', name: 'Regalos con Corazón', order: 7 },
  { slug: 'mayorista', name: 'Para tu Negocio', order: 8 },
] as const;

// Productos (37) — los precios son centavos COP (mandato CLAUDE.md)
const products = [
  {
    slug: 'set-6-fotoimanes-polaroid-grande',
    name: 'Set 6 Foto-imanes Polaroid Grande',
    categorySlug: 'foto-imanes',
    summary: 'Tus 6 fotos favoritas en imán polaroid grande, listas para tu nevera.',
    description: '...',  // texto completo de PDP
    basePrice: 3_500_000,   // $35.000 COP en centavos
    sku: 'LUC-FI-001',
    isPersonalizable: true,
    retractApplies: false,
    images: ['/seed-images/set-6-polaroid-grande.jpg'],  // placeholders
  },
  // ...36 más
];

async function main() {
  // Upsert categorías
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  // Upsert productos
  for (const p of products) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: p.categorySlug } });
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        name: p.name,
        categoryId: category.id,
        description: p.description,
        basePrice: p.basePrice,
        sku: p.sku,
        isPersonalizable: p.isPersonalizable,
        retractApplies: p.retractApplies,
        images: p.images,
        isActive: true,
      },
    });
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

### Imágenes placeholder

- Carpeta: `apps/web/public/seed-images/` (no commiteada en git si son grandes).
- Generadas con la mascota mapache + texto del producto, o usando un servicio tipo placeholder.com con paleta Lucams.
- **Mandato:** antes del lanzamiento, el operador reemplaza con fotos reales de productos físicos (ADR-010).

### Variantes (Fase 2)

Productos con cantidades ajustables (`qty=Variable`) tendrán `ProductVariant` por opción:
- `mi-primer-anito` → variantes "10 imanes", "15 imanes", "20 imanes" con precios escalonados.
- `recorditos-matrimonio` → idem.
- `imanes-publicitarios-*` → variantes por volumen (50/100/200/500) con descuento progresivo.

---

## Verificación pendiente

- [ ] Confirmar precios COP reales con el operador antes de Fase 7.
- [ ] Confirmar tipo de cambio actualizado CLP→COP el día de la decisión real (Banco de la República).
- [ ] Validar nombres de productos con el branding del operador (puede preferir otros tonos).
- [ ] Subir imágenes reales de cada producto (entregable del operador, ADR-010).
- [ ] Definir descripciones largas (PDP) por producto — borrador en este seed solo tiene `summary`.
