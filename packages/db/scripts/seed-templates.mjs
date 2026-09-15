/*
 * Script de seed para plantillas del Estudio de Personalización.
 *
 * Sub-bloque M.3.b.A2 (2026-05-13) — paradigma pacdora: cada plantilla
 * usa un archivo SVG profesional en `apps/web/public/templates/` como
 * capa visual encima del image-placeholder. El SVG tiene área transparente
 * central donde se ve la foto del cliente.
 *
 * Layer ordering (back → front):
 *   1. background       — color sólido del stage completo
 *   2. image-placeholder — foto cliente (DEBAJO, visible por el hueco transparente)
 *   3. asset            — SVG/PNG mockup con transparencia (define el "look")
 *   4. text             — caption/nombres/datos editables
 *
 * Los 10 slugs activos coinciden con M.3.b.A (mismas slugs, mejor look visual).
 *
 * N-06 (2026-09-12) — endurecimiento (CF-09):
 *   - DRY-RUN por defecto; `--apply` ejecuta. Env-guard fail-closed.
 *   - El barrido que soft-deleta plantillas NO declaradas (antes corría en
 *     cada ejecución) ahora es opt-in con `--prune` (dry-run solo las lista).
 *   - El upsert de una plantilla EXISTENTE ya NO resetea isActive/deletedAt/
 *     deletedBy (estados que el admin maneja) salvo que se pase
 *     `--force-state` (comportamiento histórico, p.ej. para reactivar las
 *     canónicas tras una depuración deliberada). El contenido (kind, nombre,
 *     previewUrl, canvasData, orden, producto) sí se alinea siempre.
 *
 * Idempotente: upsert por slug. Re-correr no duplica.
 *
 * Uso: make seed-templates   (el target pasa --apply)
 * Directo:
 *   node scripts/seed-templates.mjs                          # DRY-RUN
 *   node scripts/seed-templates.mjs --apply                  # upsert canónico
 *   node scripts/seed-templates.mjs --apply --prune          # + archiva no declaradas
 *   node scripts/seed-templates.mjs --apply --force-state    # + resetea isActive/deletedAt
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/env-guard.mjs";

const stripQuotes = (v) => v?.replace(/^["']|["']$/g, "");
process.env.DATABASE_URL = stripQuotes(process.env.DATABASE_URL);
process.env.DIRECT_URL = stripQuotes(process.env.DIRECT_URL);

// Guarda de ambiente: upsert de plantillas (+ barrido con --prune) — bloquea PRD/remotos no STG.
assertDestructiveAllowed("seed-templates.mjs");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const PRUNE = process.argv.includes("--prune");
const FORCE_STATE = process.argv.includes("--force-state");

console.log(`=== seed-templates (M.3.b.A2 asset paradigm) — ${APPLY ? "APPLY" : "DRY-RUN"} ===`);
console.log("");

const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=600&q=80&fit=crop`;

// ──────────── Brand tokens ────────────

const BRAND = {
  purple: "#7C6AAD",
  purpleDark: "#3D2E5C",
  purpleLight: "#A8A0CE",
  turquoise: "#5DD9D1",
  pink: "#E85B9F",
  pinkLight: "#FFB8D9",
  coral: "#F58A6F",
  yellow: "#FFD93D",
  cream: "#FFF8F0",
  gold: "#D4AF37",
  goldLight: "#F5E6A8",
  greenSage: "#B5C9A8",
  blushDeep: "#C97B89",
};

// ──────────── Canvas helpers ────────────

function background(color, label = "background") {
  return { id: label, type: "background", color };
}

function photoSlot({ id, x, y, width, height, cornerRadius = 0, rotation = 0, label }) {
  return {
    id,
    type: "image-placeholder",
    x,
    y,
    width,
    height,
    cornerRadius,
    rotation,
    label: label ?? `Foto ${id.replace(/\D/g, "")}`,
  };
}

function text({
  id,
  x,
  y,
  text: t,
  fontFamily = "Fredoka",
  fontSize = 48,
  fill = BRAND.purpleDark,
  editable = false,
  fontWeight = "normal",
  align = "center",
}) {
  return {
    id,
    type: "text",
    x,
    y,
    text: t,
    fontFamily,
    fontSize,
    fill,
    fontWeight,
    align,
    editable,
  };
}

function stage(width = 1080, height = 1080) {
  return { width, height, dpiPreview: 90, dpiProduction: 300 };
}

/**
 * M.3.b.A2 — Asset layer: renderea un SVG/PNG de `public/templates/` como
 * capa visual. El SVG tiene transparencia central donde se ve la foto del
 * cliente que está en el image-placeholder DEBAJO.
 */
function asset({ id, src, x = 0, y = 0, width, height, rotation = 0, opacity = 1 }) {
  return {
    id,
    type: "asset",
    src,
    x,
    y,
    width,
    height,
    rotation,
    opacity,
  };
}

// ──────────── Plantillas activas (M.3.b.CAT.11, 2026-05-14; Ola 3, 2026-07-22) ────────────
//
// Estrategia aprobada con Lucy (sesión 2026-05-14):
//   - Borrar las 11 plantillas mediocres pre-existentes (todas excepto la que
//     usaba `ig_post.svg`).
//   - Mantener 1 plantilla premium: "Polaroid Instagram" basada en `ig_post.svg`,
//     asignada al producto Fotoimanes Polaroid (SKU FI-POL-12) como plantilla
//     premium del catálogo.
//   - Crear 8 plantillas globales "Personalización Libre" — una por
//     kind personalizable — diseño minimalista intencional (canvas limpio +
//     image-placeholder + texto editable opcional) para clientes que prefieren
//     simplicidad sobre decoración. Cliente sube foto y/o agrega texto.
//     No es plantilla "transitoria" sino una opción legítima del catálogo
//     (decisión Lucy 2026-05-15: "lo básico no quiere decir malo").
//
// Ola 3 (Lucy 2026-07-22):
//   - "Polaroid Clásica" (tarjeta con franja gruesa, color de borde elegible +
//     mensaje editable) — 2 plantillas para la Polaroid, ambas en stage 450×600
//     (3:4, formato físico 7.5×10; el selector del Estudio las ofrece juntas).
//   - 2 plantillas de CARA para Separadores de Libros (cuadrado/rectangular),
//     una por forma — el Estudio crea 2 slots por unidad (2 caras) y producción
//     compone la tira desplegada.
//
// Las plantillas premium nuevas se irán agregando una a una en sesiones
// futuras, siguiendo la matriz "Estrategia de plantilla por tipo" de ADR-037.

const FOTOIMANES_POLAROID_SKU = "FI-POL-12";

const polaroidProduct = await prisma.product.findUnique({
  where: { sku: FOTOIMANES_POLAROID_SKU },
  select: { id: true },
});
if (!polaroidProduct) {
  console.error(`✗ Producto base Fotoimanes Polaroid (SKU=${FOTOIMANES_POLAROID_SKU}) no existe.`);
  console.error("  Ejecuta primero: make seed-products");
  await prisma.$disconnect();
  process.exit(1);
}

// Ola 2A — Tiras Magnéticas (producto OCULTO, creado por ola2a-tiras-magneticas.mjs). Si el
// producto aún no existe (DB fresca), su plantilla se omite sin romper el seed (idempotente).
const tirasProduct = await prisma.product.findUnique({
  where: { slug: "tiras-magneticas-fotos" },
  select: { id: true },
});

// Separadores (2 caras por unidad): las plantillas de CARA se asignan a cada
// producto de la familia. 2026-09-14 — el lookup viejo apuntaba a
// "separadores-libros" (producto que ya no existe) → el bloque se saltaba y las
// plantillas REALES de los separadores actuales (creadas por one-shots) quedaban
// sin declarar: el barrido --prune las soft-deletó y el Estudio de Alargados y
// Magnéticos cayó al canvas cuadrado 1080×1080 de respaldo (bug "se ven
// cuadrados"). Si algún producto no existe (DB fresca), su plantilla se omite
// sin romper el seed (idempotente).
const sepMagProduct = await prisma.product.findUnique({
  where: { slug: "separadores-magneticos" },
  select: { id: true },
});
const sepAlrProduct = await prisma.product.findUnique({
  where: { slug: "separadores-alargados" },
  select: { id: true },
});

// Ola 4 (Lucy 2026-07-23) — depuración de plantillas: las "Personalización Libre" que SÍ
// se usan dejan de ser GLOBALES y pasan a ser plantillas propias de su producto (nombre
// real, no genérico). Las que no aportan quedan con archive:true (isActive=false).
const cuadradosProduct = await prisma.product.findUnique({
  where: { slug: "set-fotoimanes-cuadrados" },
  select: { id: true },
});
const calendarioProduct = await prisma.product.findUnique({
  where: { slug: "calendario-mes-a-mes-fotos" },
  select: { id: true },
});

// Helper para canvas blanco con foto + texto editable opcional.
// Stage aspect ratio elegido por kind para encajar con producto físico típico.
function blankCanvas({ stageW, stageH, photoLabel = "Tu foto", includeText = false }) {
  const layers = [
    background("#FFFFFF"),
    photoSlot({
      id: "p1",
      x: 40,
      y: 40,
      width: stageW - 80,
      height: includeText ? stageH - 140 : stageH - 80,
      cornerRadius: 8,
      label: photoLabel,
    }),
  ];
  if (includeText) {
    layers.push(
      text({
        id: "free_text",
        x: stageW / 2,
        y: stageH - 60,
        text: "Escribe tu mensaje",
        fontFamily: "Fredoka",
        fontSize: 36,
        fill: BRAND.purpleDark,
        fontWeight: "bold",
        editable: true,
      }),
    );
  }
  return { version: 1, stage: stage(stageW, stageH), layers };
}

const templatesData = [
  // ════════════════════ Polaroid Clásica (Ola 3, Lucy 2026-07-22) ════════════════════
  //
  // La polaroid de toda la vida: tarjeta con el borde GRUESO abajo. El COLOR del
  // borde lo escoge el cliente en el Estudio (blanco/negro/pasteles — paleta
  // frame-palette via canvasData.borderColor → capa "frame-card") y el mensaje de
  // la franja es texto EDITABLE ("Escribe tu mensaje"). Stage 450×600 = 3:4, el
  // formato físico 7.5×10 cm (igual que la Instagram → el filtro de aspect las
  // muestra a las dos y el selector del Estudio ofrece ambas). Orden 1: es el
  // look por defecto del producto Polaroid.
  {
    slug: "photo-pack-polaroid-clasica",
    productId: polaroidProduct.id, // solo aparece en Fotoimanes Polaroid
    kind: "PHOTO_PACK",
    name: "Polaroid Clásica",
    order: 1,
    previewUrl: "/templates/polaroid_clasica.svg",
    canvasData: {
      version: 1,
      stage: stage(450, 600),
      layers: [
        background("#FFFFFF"),
        // Tarjeta de color a todo el stage (el cliente elige el color en el Estudio;
        // blanco por defecto). Esquinas suaves de la tarjeta física.
        { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 18 },
        // Foto cuadrada arriba; abajo queda la franja gruesa (~30% de la tarjeta)
        // para el mensaje — la silueta clásica de la polaroid.
        photoSlot({ id: "p1", x: 28, y: 28, width: 394, height: 394, label: "Tu foto" }),
        text({
          id: "message",
          x: 225,
          y: 512,
          text: "Escribe tu mensaje",
          fontFamily: "Fredoka",
          fontSize: 34,
          fill: BRAND.purpleDark,
          editable: true,
        }),
      ],
    },
  },

  // ════════════════════ Plantilla premium #2 — Fotoimanes Polaroid (ig_post.svg) ════════════════════
  //
  // Ola 3 — stage RE-LAYOUT 450×600 (3:4): el formato físico de la Polaroid es
  // 7.5×10 cm; antes 400×580 y el filtro de aspect la dejaba FUERA del Estudio
  // cuando la variante declaraba otro aspect (bug "no deja escribir el texto":
  // sin plantilla visible no había capas de texto que editar).
  // Asset SVG con marco Instagram: avatar, username, iconos like/comment/share,
  // likes count, caption + hashtags. 4 zonas de texto editable.
  {
    slug: "photo-pack-polaroid-instagram",
    productId: polaroidProduct.id, // solo aparece en Fotoimanes Polaroid
    kind: "PHOTO_PACK",
    name: "Polaroid Instagram",
    order: 2,
    previewUrl: "/templates/ig_post_3x4.svg",
    canvasData: {
      version: 1,
      stage: stage(450, 600),
      layers: [
        background("#FFFFFF"),
        // Ola 21 — Ventana de foto con borde blanco: x=29 y=58 392×392 (stage 450×600).
        // El modo "sin borde" expande la foto a toda la tarjeta via toolbar + canvasData.
        photoSlot({ id: "p1", x: 29, y: 58, width: 392, height: 392, label: "Tu foto" }),
        asset({
          id: "frame",
          src: "/templates/ig_post_3x4.svg",
          x: 0,
          y: 0,
          width: 450,
          height: 600,
        }),
        // Ola 17 (Lucy 2026-09-07) — FOTO DE PERFIL del header, editable por slot.
        // El chrome SVG trae un avatar placeholder horneado (circle cx=34 cy=34 r=16
        // en public/templates/ig_post_3x4.svg); esta capa lo cubre con la foto real
        // del cliente recortada a círculo, dejando el anillo de historia (r=20,
        // stroke 2.5) visible alrededor. Centro/radio = los del placeholder horneado.
        // La imagen la aporta slots[i].profileAssetUrl (POR SLOT: cada imán del pack
        // es un post independiente con su propio usuario). Sin foto elegida no dibuja
        // nada → se ve el placeholder. DEBE ir después del asset "frame" (encima del
        // SVG). Geometría congelada en features/personalization/instagram-template-spec.ts.
        {
          id: "profile_photo",
          type: "profile-photo",
          x: 34,
          y: 34,
          radius: 16,
        },
        // Ola 16 + fix 2026-07-24 — Spec "réplica fiel" de un post real de Instagram
        // (stage 450×600, fuente Inter, orden igual al post real de IG):
        //   - header: avatar con anillo de historia + username/location.
        //   - foto cuadrada 392×392 centrada (y=58), ventana con borde blanco.
        //   - fila de acción INMEDIATAMENTE bajo la foto: iconos like/comment/share
        //     del chrome SVG en y≈468–496 (24px escalados ×1.17).
        //   - "me gusta" en negrita BAJO la fila de acción con ~7px de aire
        //     (y=510, fs 15). NUNCA y≤496: el texto (top = y − fontSize/2) se
        //     montaría encima de los iconos (bug corregido 2026-07-24).
        //   - caption (y=526, fs 16) y hashtags azul #00376B (y=542, fs 13).
        text({
          id: "user_name",
          x: 68,
          y: 28,
          text: "@tu_usuario",
          fontFamily: "Inter",
          fontSize: 16,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "location",
          x: 68,
          y: 46,
          text: "Bogotá, Colombia",
          fontFamily: "Inter",
          fontSize: 12,
          fill: "#8E8E8E",
          align: "left",
          editable: true,
        }),
        text({
          id: "likes_count",
          x: 22,
          y: 510,
          text: "362 me gusta",
          fontFamily: "Inter",
          fontSize: 15,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "caption",
          x: 22,
          y: 526,
          text: "Tu título acá",
          fontFamily: "Inter",
          fontSize: 16,
          fill: "#262626",
          fontWeight: "bold",
          align: "left",
          editable: true,
        }),
        text({
          id: "hashtags",
          x: 22,
          y: 542,
          text: "#mirecuerdo #lucamsshop",
          fontFamily: "Inter",
          fontSize: 13,
          fill: "#00376B",
          align: "left",
          editable: true,
        }),
      ],
    },
  },

  // ════════════════════ Separadores 2 caras (Ola 3, Lucy 2026-07-22) ════════════════════
  //
  // El separador físico es una TIRA doblada a la mitad (Magnéticos) o una pieza
  // PLANA alargada (Alargados): cada unidad tiene 2 caras con imagen propia. La
  // plantilla define UNA CARA (el Estudio crea 2 slots por unidad, facesPerUnit=2
  // en el schema del producto, y producción compone la tira desplegada). Una
  // plantilla por TAMAÑO, alineada al aspect de la cara física (es la llave de
  // ruteo del Estudio: el filtro de aspect matchea stage ≈ aspectRatio de la
  // variante — sin plantilla activa que matchee, el boot cae al canvas cuadrado
  // genérico, bug 2026-09-14). Foto a sangre (la cara se imprime entera); las
  // esquinas redondas del troquel las da el cornerRadiusPx del producto.
  // Slugs/stages = los de las plantillas reales ya curadas en catálogo.
  //
  // D4 (2026-09-15) — las legadas de ola3 "separador-cuadrado-cara" y
  // "separador-rectangular-cara" quedaron RETIRADAS (soft-delete): la
  // rectangular tenía el stage horizontal (600×200, aspect 3.0) para el 2×6
  // vertical y nunca matcheaba variante; la cuadrada duplicaba a sep-mag-4x4-2.
  // No se declaran acá a propósito (un --prune las archiva si reaparecen) y el
  // script ola3 ya no las re-upserta — ver su header y
  // scripts/one-shot/normalize-template-visibility-20260915.mjs.
  ...(sepMagProduct
    ? [
        {
          slug: "sep-mag-2x6",
          productId: sepMagProduct.id,
          kind: "PHOTO_PACK",
          name: "Magnéticos — 2×6 cm",
          order: -10,
          previewUrl: "/templates/sep-mag-2x6.svg",
          canvasData: {
            version: 1,
            stage: stage(200, 600), // cara 6×2 cm (aspect 1:3)
            layers: [
              background("#FFFFFF"),
              photoSlot({
                id: "photo",
                x: 0,
                y: 0,
                width: 200,
                height: 600,
                cornerRadius: 18,
                label: "Foto de la cara",
              }),
            ],
          },
        },
        {
          slug: "sep-mag-4x4-2",
          productId: sepMagProduct.id,
          kind: "PHOTO_PACK",
          name: "Magnéticos — 4×4.2 cm",
          order: -9,
          previewUrl: "/templates/sep-mag-4x4-2.svg",
          canvasData: {
            version: 1,
            stage: stage(400, 420), // cara 4×4.2 cm (aspect 20:21)
            layers: [
              background("#FFFFFF"),
              photoSlot({
                id: "photo",
                x: 0,
                y: 0,
                width: 400,
                height: 420,
                cornerRadius: 24,
                label: "Foto de la cara",
              }),
            ],
          },
        },
      ]
    : []),
  ...(sepAlrProduct
    ? [
        {
          slug: "sep-alr-4x12",
          productId: sepAlrProduct.id,
          kind: "PHOTO_PACK",
          name: "Alargados — 4×12 cm",
          order: -10,
          previewUrl: "/templates/sep-alr-4x12.svg",
          canvasData: {
            version: 1,
            stage: stage(400, 1200), // cara 4×12 cm (aspect 1:3)
            layers: [
              background("#FFFFFF"),
              photoSlot({
                id: "photo",
                x: 0,
                y: 0,
                width: 400,
                height: 1200,
                cornerRadius: 24,
                label: "Foto de la cara",
              }),
            ],
          },
        },
        {
          slug: "sep-alr-4x15",
          productId: sepAlrProduct.id,
          kind: "PHOTO_PACK",
          name: "Alargados — 4×15 cm",
          order: -9,
          previewUrl: "/templates/sep-alr-4x15.svg",
          canvasData: {
            version: 1,
            stage: stage(400, 1500), // cara 4×15 cm (aspect 4:15)
            layers: [
              background("#FFFFFF"),
              photoSlot({
                id: "photo",
                x: 0,
                y: 0,
                width: 400,
                height: 1500,
                cornerRadius: 24,
                label: "Foto de la cara",
              }),
            ],
          },
        },
      ]
    : []),

  // ════════════════════ Tira Magnética (photobooth) ════════════════════
  //
  // 2026-09-14 — foto-rectangular-simple y las 6 globales "Personalización Libre"
  // archivadas salieron del seed: eran plantillas DEMO sin producto activo ni
  // diseños que las referencien; la remediación las HARD-DELETEA con
  // scripts/cleanup-demo-templates.mjs (con guard de diseños referenciantes).
  //
  // ════════════════════ Tira Magnética (photobooth) ════════════════════
  //
  // Ola 3c (Lucy 2026-07-22) — Tira Magnética REDISEÑADA al tamaño real 6.5×20 cm
  // (el producto lo actualiza el frente de datos). Referencia de Lucy: tira vertical
  // con 3 fotos APILADAS CASI A SANGRE, el fondo del color elegido visible solo como
  // margen fino y uniforme alrededor. UNA sola plantilla ("Clásica"), SIN texto.
  //
  // Paradigma slot-por-foto (1 foto por slot, gridCols=1): cada celda es 1/3 de la
  // tira → stage 390×400 (6.5 × 6.667 cm); las 3 celdas apiladas con gridGap=0 arman
  // la tira 6.5×20 continua. La celda trae capa "frame-card" (fondo = borderColor,
  // mismo mecanismo de la Polaroid Clásica). Ola 4 (Lucy 2026-07-23): la foto va a
  // sangre VERTICAL en la plantilla y la geometría final la pone el CÓDIGO por
  // posición (stripPhotoRect): borde exterior first/last (12px) y —regla 2026-09-08,
  // Lucy validó en local— media canaleta del color del marco ENTRE fotos (8px por
  // cara → separación visible de 16px ≈ 1.3 mm, como la tira física). El gridGap
  // sigue en 0: la canaleta se dibuja dentro de cada celda para que el PNG de
  // producción (render celda a celda) la incluya — un gap CSS del Estudio NO se
  // imprimiría (rompería el WYSIWYG).
  ...(tirasProduct
    ? [
        {
          slug: "photo-strip-3-fotos",
          productId: tirasProduct.id,
          kind: "PHOTO_PACK",
          // 2026-09-14 — nombre y preview DISTINTOS por composición: ambas se
          // llamaban "Plantilla Tiras" con el mismo preview de 3 fotos y en el
          // admin ninguna parecía de 4 (reporte del owner).
          name: "Tira 3 fotos (6.5×20 cm)",
          order: 1,
          previewUrl: "/templates/tira-clasica.svg",
          canvasData: {
            version: 1,
            stage: stage(390, 400), // 1/3 de la tira 6.5×20 cm (celda 6.5×6.667)
            gridCols: 1, // apilar las 3 fotos en vertical (la tira física es 1 columna)
            gridGap: 0, // celdas pegadas → la tira se lee como UNA pieza continua
            layers: [
              background("#FFFFFF"),
              // Fondo de la tira = color elegido en el Estudio (blanco por defecto).
              // Sin esquinas redondeadas: la tira es una pieza continua (el troquel
              // exterior lo da el cornerRadiusPx del producto, no la plantilla).
              { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 0 },
              // Ola 4 (Lucy 2026-07-23) — foto a sangre VERTICAL en la plantilla
              // (y0, alto completo): el inserto final lo aplica el código por
              // posición (stripPhotoRect: borde exterior first/last 12px + media
              // canaleta de 8px entre fotos, regla 2026-09-08). Los lados llevan
              // 12px (~2mm) de color.
              photoSlot({
                id: "photo",
                x: 12,
                y: 0,
                width: 366,
                height: 400,
                label: "Foto de la tira",
              }),
            ],
          },
        },
        // Ola 18b (Lucy 2026-07-26) — celda de la TIRA DE 4 FOTOS (6.5×26.5 cm).
        // Nació en el script one-off ola18b-cuadrados-tiras-fix.mjs y NO estaba en
        // este seed → el barrido de legacy de abajo la soft-deleteaba en CADA corrida
        // (bug 2026-09-09, reporte del dueño en STG: al elegir "4 fotos por tira" el
        // Estudio no montaba el canvas de la tira: sin plantilla activa que matchee el
        // aspectRatio "3:4" de la variante, el filtro de aspect dejaba la lista vacía
        // y el boot caía al template cuadrado genérico 1080×1080). Al declararla acá
        // el upsert la reactiva y el barrido la respeta (idempotente).
        // FIX 2026-09-15 (bug "tiras se ven muy grandes en el 3D"): el stage era
        // 390×530 (aspect 3:4) pero la celda FÍSICA de la tira 6.5×26.5 cm es
        // 6.5×6.625 ≈ 1:1 (igual que la de 3 fotos y que el mockup tira-4-fotos.svg,
        // 390×1590 = 4 celdas de 397.5). El 3D deriva el alto de la pieza del aspect
        // de la textura → renderizaba la tira de 26.5 cm como si midiera ~35 cm.
        // Stage corregido a 390×398 (aspect 0.98 ≈ la celda física; la variante
        // pasa a aspectRatio "1:1", diff 0.02 < tolerancia 0.05 del ruteo) — mismo
        // dibujo que la de 3 fotos.
        {
          slug: "photo-strip-4-fotos",
          productId: tirasProduct.id,
          kind: "PHOTO_PACK",
          name: "Tira 4 fotos (6.5×26.5 cm)",
          order: 2,
          previewUrl: "/templates/tira-4-fotos.svg",
          canvasData: {
            version: 1,
            stage: stage(390, 398), // 1/4 de la tira 6.5×26.5 cm (celda 6.5×6.625 ≈ 1:1)
            gridCols: 1, // apilar las 4 fotos en vertical (la tira física es 1 columna)
            gridGap: 0, // celdas pegadas → la tira se lee como UNA pieza continua
            layers: [
              background("#FFFFFF"),
              { id: "card", type: "frame-card", fill: "#FFFFFF", cornerRadius: 0 },
              photoSlot({
                id: "photo",
                x: 12,
                y: 0,
                width: 366,
                height: 398,
                label: "Foto de la tira",
              }),
            ],
          },
        },
      ]
    : []),
  // ════════════════════ Plantillas de producto (antes "Personalización Libre") ════════
  //
  // Ola 4 (Lucy 2026-07-23) — DEPURACIÓN: las "Personalización Libre" GLOBALES se
  // deprecaron. Las dos que SÍ se usan pasan a ser plantillas PROPIAS de su producto
  // (nombre real, preview real): el calendario y los cuadrados dejan de ofrecer una
  // plantilla genérica duplicada en otros productos (bug "aparecen 2 plantillas" en
  // separadores/tiras). El resto queda con archive:true (isActive=false) — ver la
  // lista y razones en scripts/one-shot/ola4-depura-plantillas-2026-07-23.mjs.
  ...(cuadradosProduct
    ? [
        {
          // 2026-09-14 — slug renombrado (era "libre-photo-pack"): el prefijo
          // "libre-" la marcaba como "respaldo" en el admin siendo LA plantilla
          // real de Cuadrados, y su preview era el genérico "Personalización
          // Libre". El rename en DBs existentes lo hace cleanup-demo-templates.mjs.
          slug: "cuadrados-foto-y-texto",
          productId: cuadradosProduct.id,
          kind: "PHOTO_PACK",
          name: "Plantilla Cuadrado",
          order: 1,
          previewUrl: "/templates/cuadrado-foto-texto.svg",
          // M.3.b.UX.v13 (Lucy 2026-05-15) — Stage cuadrado 600×600 para que el
          // shape físico (heart/circle/rect cuadrado) se vea proporcionado. Ola 4:
          // es la plantilla de los Fotoimanes Cuadrados 1:1 (sin borde → foto a
          // sangre total; con borde → franja uniforme, ver frame-palette).
          canvasData: blankCanvas({ stageW: 600, stageH: 600, includeText: true }),
        },
      ]
    : []),
  ...(calendarioProduct
    ? [
        {
          // 2026-09-14 — slug renombrado (era "libre-calendar-photo-month"),
          // misma razón que Cuadrados (badge "respaldo" engañoso en el admin).
          slug: "calendario-mes-clasico",
          productId: calendarioProduct.id,
          kind: "CALENDAR_PHOTO_MONTH",
          name: "Calendario mes a mes",
          order: 1,
          previewUrl: "/templates/calendar_month.svg",
          // Ola 2A (Lucy 2026-07-22) — tarjeta 7.5×10 (3:4): foto full-bleed 4:3 arriba (600×450),
          // espejo de la región CALENDAR_PHOTO de producción (1080×810 en página 1080×1440) para
          // que el encuadre del cliente mapee 1:1 al imprimir (WYSIWYG). Abajo queda la franja del
          // mes (lettering grande + grilla) que el compositor hornea en el PNG.
          canvasData: {
            version: 1,
            stage: stage(600, 800),
            layers: [
              background("#FFFFFF"),
              photoSlot({
                id: "p1",
                x: 0,
                y: 0,
                width: 600,
                height: 450,
                cornerRadius: 0,
                label: "Foto del mes",
              }),
            ],
          },
        },
        {
          slug: "calendario-mes-lateral",
          productId: calendarioProduct.id,
          kind: "CALENDAR_PHOTO_MONTH",
          name: "Calendario mes a mes — lateral",
          order: 2, // la clásica (order 1) sigue siendo el default del producto
          previewUrl: "/templates/calendar_month_split.svg",
          // Layout SPLIT (2026-08, referencia visual Lucy) — misma tarjeta 7.5×10 (3:4) pero la
          // foto va en rectángulo REDONDEADO con margen blanco y la banda inferior se compone en
          // dos columnas (mes gigante + año a la izquierda, grilla sin bordes a la derecha, sin
          // leyenda). El flag `calendarLayout: "split"` viaja top-level en el canvasData → el
          // Estudio, el preview 3D y producción lo leen con calendarLayoutFromUnitTemplate
          // (WYSIWYG). El photoSlot 30,30,540×420 (9:7, cornerRadius 31) espeja la región
          // CALENDAR_PHOTO_SPLIT de producción (54,54,972×756, r56 — todo ×1.8) → encuadre 1:1.
          canvasData: {
            version: 1,
            stage: stage(600, 800),
            calendarLayout: "split",
            layers: [
              background("#FFFFFF"),
              photoSlot({
                id: "p1",
                x: 30,
                y: 30,
                width: 540,
                height: 420,
                cornerRadius: 31,
                label: "Foto del mes",
              }),
            ],
          },
        },
      ]
    : []),
  // 2026-09-14 — fin del array: las globales demo archivadas (libre-photo-grid,
  // libre-calendar-photo-hero, libre-event-favor, libre-business-logo,
  // libre-custom-decor, libre-text-only) ya NO se declaran. Salen del catálogo
  // con scripts/cleanup-demo-templates.mjs (decisión del owner: "son entera-
  // mente demo, eliminarlas"). Sus kinds no tienen producto activo y las
  // superficies no-foto (name/phrase/event/logo) no consumen plantillas.
];

// ──────────────────────────────────────────────────────────────────
//  Plantillas NO declaradas — el soft-delete masivo es opt-in (--prune).
//  Sin --prune solo se listan (el admin pudo haberlas creado a mano).
// ──────────────────────────────────────────────────────────────────

const PREMIUM_SLUGS = new Set(templatesData.map((t) => t.slug));

const legacy = await prisma.personalizationTemplate.findMany({
  where: { deletedAt: null, slug: { notIn: Array.from(PREMIUM_SLUGS) } },
  select: { id: true, slug: true, name: true },
});

if (legacy.length > 0) {
  console.log(
    `${legacy.length} plantillas NO declaradas ${PRUNE ? "(a soft-deletear)" : "(intactas — --prune para archivar)"}:`,
  );
  for (const t of legacy) {
    console.log(`  - ${t.slug}${PRUNE && APPLY ? "  → archivada" : ""}`);
    if (PRUNE && APPLY) {
      await prisma.personalizationTemplate.update({
        where: { id: t.id },
        data: {
          deletedAt: new Date(),
          isActive: false,
          deletedBy: "system:seed-templates-prune",
        },
      });
    }
  }
  console.log("");
}

// ──────────────────────────────────────────────────────────────────
//  Upsert plantillas premium con asset paradigm
// ──────────────────────────────────────────────────────────────────

console.log(
  `${APPLY ? "Creando/actualizando" : "Se crearían/actualizarían"} ${templatesData.length} plantillas asset paradigm...`,
);
const byKind = {};
let tplCreated = 0;
for (const t of templatesData) {
  // Ola 4 — `archive: true` → la plantilla queda registrada pero INACTIVA (isActive=false),
  // sin borrarla (los diseños viejos conservan su snapshot y su templateId).
  const active = t.archive !== true;
  // `product` es relación Prisma — usar connect/disconnect en lugar de productId directo.
  const productRelation = t.productId ? { connect: { id: t.productId } } : { disconnect: true };
  // N-06: el update alinea CONTENIDO; los estados (isActive/deletedAt/deletedBy)
  // son del admin y solo se resetean con --force-state.
  const stateFields = FORCE_STATE ? { isActive: active, deletedAt: null, deletedBy: null } : {};
  if (APPLY) {
    await prisma.personalizationTemplate.upsert({
      where: { slug: t.slug },
      update: {
        kind: t.kind,
        name: t.name,
        product: productRelation,
        previewUrl: t.previewUrl,
        canvasData: t.canvasData,
        order: t.order,
        ...stateFields,
      },
      create: {
        kind: t.kind,
        name: t.name,
        slug: t.slug,
        ...(t.productId ? { product: { connect: { id: t.productId } } } : {}),
        previewUrl: t.previewUrl,
        canvasData: t.canvasData,
        order: t.order,
        isActive: active,
      },
    });
  } else {
    const existing = await prisma.personalizationTemplate.findUnique({
      where: { slug: t.slug },
      select: { id: true },
    });
    if (!existing) tplCreated++;
  }
  byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  const scope = t.productId ? "(producto-específico)" : "(global)";
  console.log(`  ✓ ${t.name}  [${t.kind}]  ${scope}${active ? "" : "  ⛔ ARCHIVADA"}`);
}

console.log("");
const total = await prisma.personalizationTemplate.count({ where: { deletedAt: null } });
const totalArchived = await prisma.personalizationTemplate.count({
  where: { deletedAt: { not: null } },
});
console.log(`Total activas: ${total} plantillas asset paradigm`);
console.log(`Total archivadas: ${totalArchived} legacy`);
if (!APPLY) console.log(`Nuevas que se crearían: ${tplCreated}`);
console.log("");
console.log("Distribución por kind:");
for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(22)} ${count}`);
}
console.log("");
if (!APPLY) {
  console.log("DRY-RUN (sin cambios). Para ejecutar: node scripts/seed-templates.mjs --apply");
} else {
  console.log("Listo. Próximo: M.3.b.B mockup contextual con sharp + 4 escenas.");
}

await prisma.$disconnect();
process.exit(0);
